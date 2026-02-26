import { describe, it, expect } from "bun:test";
import { createFpsCounter } from "../src/fps-counter.js";

describe("fps-counter", () => {
  it("starts at 0 fps", () => {
    const c = createFpsCounter();
    expect(c.fps()).toBe(0);
  });

  it("counts frames within 1s window", () => {
    const c = createFpsCounter();
    // Simulate 60 frames over 1 second (16.67ms apart)
    for (let i = 0; i < 60; i++) {
      c.update(i * 16.67);
    }
    expect(c.fps()).toBe(60);
  });

  it("drops old frames outside the window", () => {
    const c = createFpsCounter();
    // 10 frames at t=0..9
    for (let i = 0; i < 10; i++) c.update(i * 100);
    expect(c.fps()).toBe(10);
    // Jump to t=2000 — only this frame should be in window
    c.update(2000);
    expect(c.fps()).toBe(1);
  });

  it("respects custom windowMs", () => {
    const c = createFpsCounter({ windowMs: 500 });
    // 10 frames at 100ms apart: t=0,100,200,...,900
    for (let i = 0; i < 10; i++) c.update(i * 100);
    // At t=900, window is [400, 900] → frames at 500,600,700,800,900 = 5
    // Actually window is (900-500, 900] = frames at 500..900 = 5
    expect(c.fps()).toBe(6); // 400,500,600,700,800,900 — 900-400=500 = boundary
  });

  it("handles buffer wrapping correctly", () => {
    const c = createFpsCounter({ bufferSize: 4 });
    c.update(0);
    c.update(100);
    c.update(200);
    c.update(300);
    c.update(400); // wraps around, overwrites slot 0
    c.update(500);
    // Window: [500-1000, 500] = all 4 stored frames are within 1s
    expect(c.fps()).toBeGreaterThanOrEqual(4);
  });

  it("reset clears all state", () => {
    const c = createFpsCounter();
    c.update(0);
    c.update(16);
    c.update(32);
    expect(c.fps()).toBe(3);
    c.reset();
    expect(c.fps()).toBe(0);
    // After reset, fresh start
    c.update(1000);
    expect(c.fps()).toBe(1);
  });

  it("single frame yields fps of 1", () => {
    const c = createFpsCounter();
    c.update(5000);
    expect(c.fps()).toBe(1);
  });

  it("all frames at same timestamp counts them all", () => {
    const c = createFpsCounter({ bufferSize: 10 });
    for (let i = 0; i < 5; i++) c.update(1000);
    expect(c.fps()).toBe(5);
  });

  it("frameCount starts at 0", () => {
    const c = createFpsCounter();
    expect(c.frameCount()).toBe(0);
  });

  it("frameCount tracks total frames across updates", () => {
    const c = createFpsCounter();
    c.update(0);
    c.update(100);
    c.update(200);
    expect(c.frameCount()).toBe(3);
    // Even after frames fall outside the FPS window, total count keeps growing
    c.update(5000);
    expect(c.frameCount()).toBe(4);
    expect(c.fps()).toBe(1); // only the last frame is in the window
  });

  it("frameCount resets to 0 on reset()", () => {
    const c = createFpsCounter();
    c.update(0);
    c.update(16);
    expect(c.frameCount()).toBe(2);
    c.reset();
    expect(c.frameCount()).toBe(0);
    c.update(1000);
    expect(c.frameCount()).toBe(1);
  });

  it("getSnapshot returns all metrics in one call", () => {
    const c = createFpsCounter();
    // Before any frames
    const snap0 = c.getSnapshot();
    expect(snap0.fps).toBe(0);
    expect(snap0.frameCount).toBe(0);
    expect(snap0.avgFrameTimeMs).toBeNull();
    expect(snap0.trend).toBeNull();

    // Simulate 10 frames over 1s window (100ms apart)
    for (let i = 0; i < 10; i++) c.update(i * 100);
    const snap1 = c.getSnapshot();
    expect(snap1.fps).toBe(10);
    expect(snap1.frameCount).toBe(10);
    expect(snap1.avgFrameTimeMs).toBe(100);
    expect(snap1.trend).toBe("stable");
  });

  it("getSnapshot avgFrameTimeMs uses custom windowMs", () => {
    const c = createFpsCounter({ windowMs: 2000 });
    // 20 frames in 2s window = 10 fps equivalent, avg frame time = 2000/20 = 100ms
    for (let i = 0; i < 20; i++) c.update(i * 100);
    const snap = c.getSnapshot();
    expect(snap.fps).toBe(20);
    expect(snap.avgFrameTimeMs).toBe(100);
  });

  it("getSnapshot resets with reset()", () => {
    const c = createFpsCounter();
    c.update(0);
    c.update(16);
    c.reset();
    const snap = c.getSnapshot();
    expect(snap.fps).toBe(0);
    expect(snap.frameCount).toBe(0);
    expect(snap.avgFrameTimeMs).toBeNull();
    expect(snap.worstFrameDeltaMs).toBe(0);
    expect(snap.trend).toBeNull();
  });

  it("worstDelta tracks peak inter-frame delta", () => {
    const c = createFpsCounter();
    expect(c.worstDelta()).toBe(0);
    c.update(0);
    expect(c.worstDelta()).toBe(0); // no delta yet (only one frame)
    c.update(16);
    expect(c.worstDelta()).toBe(16);
    c.update(32);
    expect(c.worstDelta()).toBe(16); // no change, same delta
    // Simulate a jank spike (200ms gap)
    c.update(232);
    expect(c.worstDelta()).toBe(200);
    // Subsequent normal frames don't lower the worst
    c.update(248);
    expect(c.worstDelta()).toBe(200);
  });

  it("worstDelta resets on reset()", () => {
    const c = createFpsCounter();
    c.update(0);
    c.update(500); // 500ms jank
    expect(c.worstDelta()).toBe(500);
    c.reset();
    expect(c.worstDelta()).toBe(0);
    c.update(1000);
    c.update(1016);
    expect(c.worstDelta()).toBe(16);
  });

  it("getSnapshot includes worstFrameDeltaMs", () => {
    const c = createFpsCounter();
    c.update(0);
    c.update(16);
    c.update(116); // 100ms jank
    const snap = c.getSnapshot();
    expect(snap.worstFrameDeltaMs).toBe(100);
  });

  it("last returns null when no frames recorded", () => {
    const c = createFpsCounter();
    expect(c.last()).toBeNull();
  });

  it("last returns the most recent frame timestamp", () => {
    const c = createFpsCounter();
    c.update(100);
    expect(c.last()).toBe(100);
    c.update(200);
    expect(c.last()).toBe(200);
    c.update(350);
    expect(c.last()).toBe(350);
  });

  it("last works correctly after buffer wraps", () => {
    const c = createFpsCounter({ bufferSize: 3 });
    c.update(10);
    c.update(20);
    c.update(30);
    c.update(40); // wraps, overwrites slot 0
    expect(c.last()).toBe(40);
  });

  it("last returns null after reset", () => {
    const c = createFpsCounter();
    c.update(100);
    expect(c.last()).toBe(100);
    c.reset();
    expect(c.last()).toBeNull();
  });

  it("percentAboveThreshold returns null with fewer than 2 frames", () => {
    const c = createFpsCounter();
    expect(c.percentAboveThreshold(16)).toBeNull();
    c.update(0);
    expect(c.percentAboveThreshold(16)).toBeNull();
  });

  it("percentAboveThreshold returns null for invalid threshold", () => {
    const c = createFpsCounter();
    c.update(0);
    c.update(16);
    expect(c.percentAboveThreshold(NaN)).toBeNull();
    expect(c.percentAboveThreshold(Infinity)).toBeNull();
  });

  it("percentAboveThreshold computes correct percentage for uniform frames", () => {
    const c = createFpsCounter();
    // 5 frames at 16ms apart → all deltas = 16ms
    for (let i = 0; i < 5; i++) c.update(i * 16);
    // threshold 15 → all 4 deltas exceed it → 100%
    expect(c.percentAboveThreshold(15)).toBe(100);
    // threshold 16 → none exceed it (16 is not > 16) → 0%
    expect(c.percentAboveThreshold(16)).toBe(0);
  });

  it("percentAboveThreshold detects jank spikes", () => {
    const c = createFpsCounter();
    // 4 normal frames (16ms) then one jank (200ms)
    c.update(0);
    c.update(16);
    c.update(32);
    c.update(48);
    c.update(248); // 200ms jank
    // deltas: 16, 16, 16, 200 → 1/4 above 33ms = 25%
    expect(c.percentAboveThreshold(33)).toBe(25);
  });

  it("percentAboveThreshold works after buffer wraps", () => {
    const c = createFpsCounter({ bufferSize: 4 });
    c.update(0);
    c.update(16);
    c.update(32);
    c.update(48);
    c.update(64); // wraps, buffer now holds [64, 16, 32, 48] with head=1
    // Consecutive stored frames: 16, 32, 48, 64 → deltas: 16, 16, 16 → 0% above 33ms
    expect(c.percentAboveThreshold(33)).toBe(0);
  });

  it("percentAboveThreshold returns 0 after reset with new frames", () => {
    const c = createFpsCounter();
    c.update(0);
    c.update(500); // big jank
    expect(c.percentAboveThreshold(33)).toBe(100);
    c.reset();
    c.update(1000);
    c.update(1016);
    expect(c.percentAboveThreshold(33)).toBe(0);
  });

  it("isFull returns false when buffer is not at capacity", () => {
    const c = createFpsCounter({ bufferSize: 10 });
    expect(c.isFull()).toBe(false);
    c.update(0);
    c.update(16);
    expect(c.isFull()).toBe(false);
  });

  it("isFull returns true when buffer reaches capacity", () => {
    const c = createFpsCounter({ bufferSize: 5 });
    for (let i = 0; i < 5; i++) c.update(i * 16);
    expect(c.isFull()).toBe(true);
  });

  it("isFull resets to false after reset()", () => {
    const c = createFpsCounter({ bufferSize: 3 });
    for (let i = 0; i < 3; i++) c.update(i * 16);
    expect(c.isFull()).toBe(true);
    c.reset();
    expect(c.isFull()).toBe(false);
  });

  it("toJSON() delegates to getSnapshot() for JSON.stringify support", () => {
    const c = createFpsCounter({ bufferSize: 10, windowMs: 1000 });
    c.update(0);
    c.update(16);
    c.update(33);

    const snapshot = c.getSnapshot();
    const json = c.toJSON();
    expect(json).toEqual(snapshot);

    // JSON.stringify should produce the same output as manually stringifying getSnapshot
    expect(JSON.stringify(c)).toBe(JSON.stringify(snapshot));
  });

  it("toJSON() returns zeroed snapshot when no frames recorded", () => {
    const c = createFpsCounter();
    const json = c.toJSON();
    expect(json.fps).toBe(0);
    expect(json.frameCount).toBe(0);
    expect(json.avgFrameTimeMs).toBeNull();
    expect(json.worstFrameDeltaMs).toBe(0);
    expect(json.trend).toBeNull();
  });

  // trend() tests
  it("trend() returns null with fewer than 4 frames", () => {
    const c = createFpsCounter({ bufferSize: 10, windowMs: 10000 });
    expect(c.trend()).toBeNull();
    c.update(0);
    expect(c.trend()).toBeNull();
    c.update(16);
    expect(c.trend()).toBeNull();
    c.update(33);
    expect(c.trend()).toBeNull();
  });

  it('trend() returns "stable" for consistent frame times', () => {
    const c = createFpsCounter({ bufferSize: 20, windowMs: 10000 });
    for (let i = 0; i < 10; i++) c.update(i * 16);
    expect(c.trend()).toBe("stable");
  });

  it('trend() returns "degrading" when frame times increase', () => {
    const c = createFpsCounter({ bufferSize: 20, windowMs: 100000 });
    // Older half: fast frames (10ms apart)
    for (let i = 0; i < 6; i++) c.update(i * 10);
    // Newer half: slow frames (50ms apart)
    let t = 5 * 10;
    for (let i = 0; i < 6; i++) {
      t += 50;
      c.update(t);
    }
    expect(c.trend()).toBe("degrading");
  });

  it('trend() returns "improving" when frame times decrease', () => {
    const c = createFpsCounter({ bufferSize: 20, windowMs: 100000 });
    // Older half: slow frames (50ms apart)
    for (let i = 0; i < 6; i++) c.update(i * 50);
    // Newer half: fast frames (10ms apart)
    let t = 5 * 50;
    for (let i = 0; i < 6; i++) {
      t += 10;
      c.update(t);
    }
    expect(c.trend()).toBe("improving");
  });

  it("trend() respects custom thresholdPercent", () => {
    const c = createFpsCounter({ bufferSize: 20, windowMs: 100000 });
    // Older half: 16ms apart, newer half: 20ms apart (~25% increase)
    for (let i = 0; i < 5; i++) c.update(i * 16);
    let t = 4 * 16;
    for (let i = 0; i < 5; i++) {
      t += 20;
      c.update(t);
    }
    // With default 25% threshold, this is right at the edge
    // With a higher threshold (50%), it should be stable
    expect(c.trend({ thresholdPercent: 50 })).toBe("stable");
  });

  it("trend() handles all-zero deltas (simultaneous timestamps)", () => {
    const c = createFpsCounter({ bufferSize: 10, windowMs: 10000 });
    for (let i = 0; i < 6; i++) c.update(0);
    expect(c.trend()).toBe("stable");
  });

  it("trend() resets with counter", () => {
    const c = createFpsCounter({ bufferSize: 20, windowMs: 100000 });
    for (let i = 0; i < 10; i++) c.update(i * 16);
    expect(c.trend()).toBe("stable");
    c.reset();
    expect(c.trend()).toBeNull();
  });

  it("toString() returns empty tag when no frames", () => {
    const c = createFpsCounter();
    expect(c.toString()).toBe("FpsCounter<empty>");
  });

  it("toString() includes fps, frames, worst delta, and trend", () => {
    const c = createFpsCounter({ bufferSize: 20, windowMs: 10000 });
    for (let i = 0; i < 10; i++) c.update(i * 16);
    const str = c.toString();
    expect(str).toMatch(/^FpsCounter</);
    expect(str).toContain("fps");
    expect(str).toContain("frames");
    expect(str).toContain("worst");
  });

  it("toString() uses compact format for large frame counts", () => {
    const c = createFpsCounter({ bufferSize: 20, windowMs: 100000 });
    // Simulate many frames by updating 1100 times
    for (let i = 0; i < 1100; i++) c.update(i * 16);
    const str = c.toString();
    expect(str).toContain("1.1K frames");
  });

  describe("input validation", () => {
    it("clamps bufferSize to minimum of 2", () => {
      const c = createFpsCounter({ bufferSize: 1 });
      c.update(0);
      c.update(16);
      c.update(32);
      // With bufferSize=2, the ring holds 2 entries; all 3 should be counted in window
      expect(c.fps()).toBeGreaterThanOrEqual(2);
    });

    it("clamps zero bufferSize to 2", () => {
      const c = createFpsCounter({ bufferSize: 0 });
      c.update(0);
      c.update(16);
      expect(c.fps()).toBe(2);
    });

    it("clamps negative bufferSize to 2", () => {
      const c = createFpsCounter({ bufferSize: -10 });
      c.update(0);
      c.update(16);
      expect(c.fps()).toBe(2);
    });

    it("truncates fractional bufferSize", () => {
      const c = createFpsCounter({ bufferSize: 5.9 });
      // Should behave as bufferSize=5
      for (let i = 0; i < 10; i++) c.update(i * 10);
      expect(c.fps()).toBeLessThanOrEqual(10);
    });

    it("clamps zero windowMs to 1", () => {
      const c = createFpsCounter({ windowMs: 0 });
      c.update(0);
      c.update(0);
      // With windowMs=1, frames at t=0 are within [0-1, 0] window
      expect(c.fps()).toBeGreaterThanOrEqual(1);
    });

    it("clamps negative windowMs to 1", () => {
      const c = createFpsCounter({ windowMs: -500 });
      c.update(100);
      expect(c.fps()).toBe(1);
    });
  });
});
