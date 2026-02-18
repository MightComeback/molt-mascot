import { describe, expect, it } from "bun:test";
import {
  drawSprite,
  drawLobster,
  createBlinkState,
  _spriteCache,
  OVERLAY_TIMING,
  EYE_LEFT_COL,
  EYE_RIGHT_COL,
  EYE_ROW,
  EYE_SIZE,
} from "../src/draw.js";

// Minimal canvas context mock that records draw calls
function mockCtx() {
  const calls = [];
  return {
    calls,
    fillStyle: "",
    clearRect(...args) { calls.push({ fn: "clearRect", args }); },
    fillRect(...args) { calls.push({ fn: "fillRect", args, fillStyle: this.fillStyle }); },
    drawImage(...args) { calls.push({ fn: "drawImage", args }); },
    beginPath() { calls.push({ fn: "beginPath" }); },
    ellipse(...args) { calls.push({ fn: "ellipse", args }); },
    fill() { calls.push({ fn: "fill" }); },
  };
}

describe("drawSprite", () => {
  it("draws filled rectangles for palette characters", () => {
    const ctx = mockCtx();
    // Simple 2x2 sprite with known palette chars
    const sprite = [
      ["r", "."],
      [".", "w"],
    ];
    drawSprite(ctx, sprite, { x: 0, y: 0, scale: 2 });

    const fills = ctx.calls.filter((c) => c.fn === "fillRect");
    // 'r' and 'w' should produce fillRects; '.' is transparent (no color)
    expect(fills.length).toBe(2);
    // First fill at (0,0) for 'r'
    expect(fills[0].args).toEqual([0, 0, 2, 2]);
    // Second fill at (2,2) for 'w' (col=1*2, row=1*2)
    expect(fills[1].args).toEqual([2, 2, 2, 2]);
  });

  it("respects x/y offset and scale", () => {
    const ctx = mockCtx();
    const sprite = [["r"]];
    drawSprite(ctx, sprite, { x: 10, y: 20, scale: 4 });

    const fills = ctx.calls.filter((c) => c.fn === "fillRect");
    expect(fills.length).toBe(1);
    expect(fills[0].args).toEqual([10, 20, 4, 4]);
  });

  it("skips characters not in palette", () => {
    const ctx = mockCtx();
    const sprite = [[".", " ", "?"]]; // none of these have palette entries
    drawSprite(ctx, sprite, { x: 0, y: 0, scale: 1 });

    const fills = ctx.calls.filter((c) => c.fn === "fillRect");
    expect(fills.length).toBe(0);
  });

  it("uses default scale of 3", () => {
    const ctx = mockCtx();
    const sprite = [["r"]];
    drawSprite(ctx, sprite);

    const fills = ctx.calls.filter((c) => c.fn === "fillRect");
    expect(fills[0].args).toEqual([0, 0, 3, 3]);
  });
});

describe("createBlinkState", () => {
  it("does not blink before nextBlinkAt", () => {
    const blink = createBlinkState({ initialBlinkAt: 5000 });
    expect(blink.isBlinking(0)).toBe(false);
    expect(blink.isBlinking(4999)).toBe(false);
  });

  it("blinks at nextBlinkAt for 150ms", () => {
    const blink = createBlinkState({ initialBlinkAt: 5000 });
    expect(blink.isBlinking(5000)).toBe(true);
    expect(blink.isBlinking(5100)).toBe(true);
    expect(blink.isBlinking(5149)).toBe(true);
  });

  it("stops blinking after 150ms and schedules next blink", () => {
    const blink = createBlinkState({ initialBlinkAt: 5000 });
    // Trigger the blink window
    blink.isBlinking(5000);
    // After 150ms, blink ends and next is scheduled 3-6s later
    expect(blink.isBlinking(5150)).toBe(false);
    const next = blink.nextBlinkAt;
    expect(next).toBeGreaterThanOrEqual(5150 + 3000);
    expect(next).toBeLessThanOrEqual(5150 + 6000);
  });

  it("never blinks when reducedMotion is true", () => {
    const blink = createBlinkState({ initialBlinkAt: 0, reducedMotion: true });
    expect(blink.isBlinking(0)).toBe(false);
    expect(blink.isBlinking(100)).toBe(false);
    expect(blink.isBlinking(5000)).toBe(false);
  });
});

describe("drawLobster", () => {
  it("clears the canvas and draws shadow + sprite", () => {
    const ctx = mockCtx();
    drawLobster(ctx, {
      mode: "idle",
      t: 0,
      scale: 3,
      spriteSize: 32,
      reducedMotion: true,
      blinking: false,
      canvas: { width: 96, height: 96 },
    });

    // Should start with clearRect
    expect(ctx.calls[0].fn).toBe("clearRect");
    expect(ctx.calls[0].args).toEqual([0, 0, 96, 96]);

    // Should draw shadow (beginPath + ellipse + fill)
    const beginPaths = ctx.calls.filter((c) => c.fn === "beginPath");
    expect(beginPaths.length).toBe(1);
    const ellipses = ctx.calls.filter((c) => c.fn === "ellipse");
    expect(ellipses.length).toBe(1);

    // Should draw many fillRects for the sprite
    const fills = ctx.calls.filter((c) => c.fn === "fillRect");
    expect(fills.length).toBeGreaterThan(10);
  });

  it("draws blink rectangles when blinking=true", () => {
    const ctx = mockCtx();
    drawLobster(ctx, {
      mode: "idle",
      t: 0,
      scale: 3,
      spriteSize: 32,
      reducedMotion: true, // no bob for deterministic check
      blinking: true,
      canvas: { width: 96, height: 96 },
    });

    // Blink draws 2 red rectangles at the eye positions
    const fills = ctx.calls.filter((c) => c.fn === "fillRect");
    const eyeFills = fills.filter((c) =>
      (c.args[0] === EYE_LEFT_COL * 3 || c.args[0] === EYE_RIGHT_COL * 3) &&
      c.args[1] === EYE_ROW * 3 &&
      c.args[2] === EYE_SIZE * 3 &&
      c.args[3] === EYE_SIZE * 3
    );
    expect(eyeFills.length).toBe(2);
  });

  it("does not draw blink rectangles when blinking=false", () => {
    const ctx = mockCtx();
    drawLobster(ctx, {
      mode: "idle",
      t: 0,
      scale: 3,
      spriteSize: 32,
      reducedMotion: true,
      blinking: false,
      canvas: { width: 96, height: 96 },
    });

    const fills = ctx.calls.filter((c) => c.fn === "fillRect");
    // Should not have eye-sized fills at exact eye positions with red color
    const eyeFills = fills.filter((c) =>
      (c.args[0] === EYE_LEFT_COL * 3 || c.args[0] === EYE_RIGHT_COL * 3) &&
      c.args[1] === EYE_ROW * 3 &&
      c.args[2] === EYE_SIZE * 3 &&
      c.args[3] === EYE_SIZE * 3
    );
    expect(eyeFills.length).toBe(0);
  });

  it("draws more fills for overlay modes than plain idle", () => {
    const idleCtx = mockCtx();
    drawLobster(idleCtx, {
      mode: "idle",
      t: 0,
      scale: 3,
      spriteSize: 32,
      reducedMotion: true,
      blinking: false,
      canvas: { width: 96, height: 96 },
    });

    const thinkCtx = mockCtx();
    drawLobster(thinkCtx, {
      mode: "thinking",
      t: 0,
      scale: 3,
      spriteSize: 32,
      reducedMotion: true,
      blinking: false,
      canvas: { width: 96, height: 96 },
    });

    const idleFills = idleCtx.calls.filter((c) => c.fn === "fillRect").length;
    const thinkFills = thinkCtx.calls.filter((c) => c.fn === "fillRect").length;
    // Thinking overlay adds extra pixels
    expect(thinkFills).toBeGreaterThan(idleFills);
  });

  it("draws overlay for connecting, connected, and disconnected modes", () => {
    const baseCtx = mockCtx();
    drawLobster(baseCtx, {
      mode: "idle",
      t: 0,
      scale: 3,
      spriteSize: 32,
      reducedMotion: true,
      blinking: false,
      canvas: { width: 96, height: 96 },
    });
    const baseFills = baseCtx.calls.filter((c) => c.fn === "fillRect").length;

    for (const mode of ["connecting", "connected", "disconnected"]) {
      const ctx = mockCtx();
      drawLobster(ctx, {
        mode,
        t: 0,
        scale: 3,
        spriteSize: 32,
        reducedMotion: true,
        blinking: false,
        canvas: { width: 96, height: 96 },
      });
      const fills = ctx.calls.filter((c) => c.fn === "fillRect").length;
      expect(fills).toBeGreaterThan(baseFills);
    }
  });

  it("draws sleep overlay when idle exceeds sleep threshold", () => {
    const noSleepCtx = mockCtx();
    drawLobster(noSleepCtx, {
      mode: "idle",
      t: 0,
      scale: 3,
      spriteSize: 32,
      reducedMotion: true,
      blinking: false,
      idleDurationMs: 1000,
      sleepThresholdMs: 120000,
      canvas: { width: 96, height: 96 },
    });

    const sleepCtx = mockCtx();
    drawLobster(sleepCtx, {
      mode: "idle",
      t: 0,
      scale: 3,
      spriteSize: 32,
      reducedMotion: true,
      blinking: false,
      idleDurationMs: 200000,
      sleepThresholdMs: 120000,
      canvas: { width: 96, height: 96 },
    });

    const noSleepFills = noSleepCtx.calls.filter((c) => c.fn === "fillRect").length;
    const sleepFills = sleepCtx.calls.filter((c) => c.fn === "fillRect").length;
    // Sleep overlay should add extra pixels
    expect(sleepFills).toBeGreaterThan(noSleepFills);
  });
});

describe("_spriteCache", () => {
  it("returns null in test environment (no OffscreenCanvas/DOM)", () => {
    _spriteCache.clear();
    const sprite = ["rk", "kr"];
    const result = _spriteCache.get(sprite, 3);
    // In a test env without OffscreenCanvas or document.createElement('canvas'),
    // the cache gracefully returns null and drawSprite falls back to fillRect.
    // If OffscreenCanvas IS available (e.g. newer Bun), it returns a canvas object.
    expect(result === null || typeof result === 'object').toBe(true);
  });

  it("clear() resets the cache", () => {
    _spriteCache.clear();
    expect(_spriteCache.size()).toBe(0);
  });

  it("returns the same object for the same sprite+scale", () => {
    _spriteCache.clear();
    const sprite = ["rk", "kr"];
    const a = _spriteCache.get(sprite, 3);
    const b = _spriteCache.get(sprite, 3);
    expect(a).toBe(b);
  });

  it("invalidates cache when scale changes", () => {
    _spriteCache.clear();
    const sprite = ["rk"];
    _spriteCache.get(sprite, 3);
    const sizeBefore = _spriteCache.size();
    _spriteCache.get(sprite, 5); // different scale flushes cache
    const sizeAfter = _spriteCache.size();
    // In test env without canvas support, both are 0 (null returns aren't cached).
    // With canvas support, sizeBefore=1 and sizeAfter=1 (old flushed, new added).
    // Key invariant: cache never grows beyond 1 entry for a single sprite after scale change.
    expect(sizeAfter).toBeLessThanOrEqual(1);
    expect(sizeAfter).toBeLessThanOrEqual(sizeBefore + 1);
  });
});

describe("OVERLAY_TIMING", () => {
  it("has entries for all overlay modes", () => {
    const expected = ["thinking", "tool", "error", "sleep", "connecting", "connected", "disconnected"];
    for (const mode of expected) {
      expect(OVERLAY_TIMING[mode]).toBeDefined();
      expect(Array.isArray(OVERLAY_TIMING[mode].sprites)).toBe(true);
      expect(OVERLAY_TIMING[mode].sprites.length).toBeGreaterThan(0);
      expect(typeof OVERLAY_TIMING[mode].frameDurationMs).toBe("number");
    }
  });

  it("static overlays (tool, error) have frameDurationMs=0", () => {
    expect(OVERLAY_TIMING.tool.frameDurationMs).toBe(0);
    expect(OVERLAY_TIMING.error.frameDurationMs).toBe(0);
  });

  it("animated overlays have positive frameDurationMs", () => {
    for (const mode of ["thinking", "sleep", "connecting", "connected", "disconnected"]) {
      expect(OVERLAY_TIMING[mode].frameDurationMs).toBeGreaterThan(0);
    }
  });
});

describe("eye constants", () => {
  it("are reasonable values within a 32x32 grid", () => {
    expect(EYE_LEFT_COL).toBeGreaterThanOrEqual(0);
    expect(EYE_LEFT_COL).toBeLessThan(32);
    expect(EYE_RIGHT_COL).toBeGreaterThan(EYE_LEFT_COL);
    expect(EYE_RIGHT_COL).toBeLessThan(32);
    expect(EYE_ROW).toBeGreaterThanOrEqual(0);
    expect(EYE_ROW).toBeLessThan(32);
    expect(EYE_SIZE).toBeGreaterThan(0);
  });
});
