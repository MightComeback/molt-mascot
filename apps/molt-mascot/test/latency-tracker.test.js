import { describe, it, expect } from "bun:test";
import { createLatencyTracker } from "../src/latency-tracker.js";

describe("createLatencyTracker", () => {
  it("returns null stats when empty", () => {
    const t = createLatencyTracker();
    expect(t.stats()).toBeNull();
  });

  it("tracks a single sample", () => {
    const t = createLatencyTracker();
    t.push(42);
    const s = t.stats();
    expect(s.min).toBe(42);
    expect(s.max).toBe(42);
    expect(s.avg).toBe(42);
    expect(s.median).toBe(42);
    expect(s.samples).toBe(1);
  });

  it("computes correct stats for multiple samples", () => {
    const t = createLatencyTracker();
    [10, 20, 30, 40, 50].forEach((v) => t.push(v));
    const s = t.stats();
    expect(s.min).toBe(10);
    expect(s.max).toBe(50);
    expect(s.avg).toBe(30);
    expect(s.median).toBe(30);
    expect(s.samples).toBe(5);
  });

  it("computes median for even-length buffer", () => {
    const t = createLatencyTracker();
    [10, 20, 30, 40].forEach((v) => t.push(v));
    expect(t.stats().median).toBe(25);
  });

  it("respects maxSamples and evicts oldest", () => {
    const t = createLatencyTracker({ maxSamples: 3 });
    [100, 200, 300, 400].forEach((v) => t.push(v));
    expect(t.stats().samples).toBe(3);
    expect(t.stats().min).toBe(200);
  });

  it("ignores invalid values", () => {
    const t = createLatencyTracker();
    t.push(-1);
    t.push(NaN);
    t.push(Infinity);
    t.push(null);
    t.push(undefined);
    t.push("50");
    expect(t.stats()).toBeNull();
  });

  it("caches stats until next push", () => {
    const t = createLatencyTracker();
    t.push(10);
    const s1 = t.stats();
    const s2 = t.stats();
    expect(s1).toBe(s2); // same reference = cached
    t.push(20);
    const s3 = t.stats();
    expect(s3).not.toBe(s1);
  });

  it("reset clears all data", () => {
    const t = createLatencyTracker();
    t.push(10);
    t.push(20);
    t.reset();
    expect(t.stats()).toBeNull();
    expect(t.samples()).toEqual([]);
  });

  it("computes p95 correctly", () => {
    const t = createLatencyTracker();
    // 20 samples: 1..20
    for (let i = 1; i <= 20; i++) t.push(i);
    const s = t.stats();
    // p95 index = ceil(20*0.95)-1 = 18 → sorted[18] = 19
    expect(s.p95).toBe(19);
  });

  it("computes p99 correctly", () => {
    const t = createLatencyTracker({ maxSamples: 100 });
    // 100 samples: 1..100
    for (let i = 1; i <= 100; i++) t.push(i);
    const s = t.stats();
    // p99 index = ceil(100*0.99)-1 = 98 → sorted[98] = 99
    expect(s.p99).toBe(99);
  });

  it("computes p99 with small sample size", () => {
    const t = createLatencyTracker();
    // 5 samples: p99 index = ceil(5*0.99)-1 = 4 → sorted[4] = 50
    [10, 20, 30, 40, 50].forEach((v) => t.push(v));
    expect(t.stats().p99).toBe(50);
  });

  it("computes jitter (stddev)", () => {
    const t = createLatencyTracker();
    // All same value → jitter = 0
    [50, 50, 50].forEach((v) => t.push(v));
    expect(t.stats().jitter).toBe(0);

    // Spread values → jitter > 0
    const t2 = createLatencyTracker();
    [10, 50, 90].forEach((v) => t2.push(v));
    expect(t2.stats().jitter).toBeGreaterThan(0);
  });

  it("samples() returns a copy of the buffer", () => {
    const t = createLatencyTracker();
    t.push(10);
    t.push(20);
    const s = t.samples();
    expect(s).toEqual([10, 20]);
    s.push(999);
    expect(t.samples()).toEqual([10, 20]); // original unaffected
  });

  it("count() returns buffer length without copying", () => {
    const t = createLatencyTracker({ maxSamples: 5 });
    expect(t.count()).toBe(0);
    t.push(10);
    expect(t.count()).toBe(1);
    t.push(20);
    t.push(30);
    expect(t.count()).toBe(3);
    t.reset();
    expect(t.count()).toBe(0);
  });

  it("count() respects maxSamples eviction", () => {
    const t = createLatencyTracker({ maxSamples: 2 });
    t.push(10);
    t.push(20);
    t.push(30);
    expect(t.count()).toBe(2);
  });

  it("getSnapshot() returns stats, count, maxSamples, and trend", () => {
    const t = createLatencyTracker({ maxSamples: 10 });
    const empty = t.getSnapshot();
    expect(empty.stats).toBeNull();
    expect(empty.count).toBe(0);
    expect(empty.maxSamples).toBe(10);
    expect(empty.trend).toBeNull();

    t.push(5);
    t.push(15);
    const snap = t.getSnapshot();
    expect(snap.count).toBe(2);
    expect(snap.maxSamples).toBe(10);
    expect(snap.stats).not.toBeNull();
    expect(snap.stats.min).toBe(5);
    expect(snap.stats.max).toBe(15);
    expect(snap.stats.samples).toBe(2);
    // Only 2 samples — trend requires ≥4
    expect(snap.trend).toBeNull();

    // Add enough samples for a rising trend
    t.push(100);
    t.push(200);
    const snap2 = t.getSnapshot();
    expect(snap2.trend).toBe("rising");
  });

  it("getSnapshot() uses cached stats", () => {
    const t = createLatencyTracker();
    t.push(42);
    const s1 = t.getSnapshot().stats;
    const s2 = t.getSnapshot().stats;
    expect(s1).toBe(s2); // same cached reference
  });

  it("last() returns null when empty", () => {
    const t = createLatencyTracker();
    expect(t.last()).toBeNull();
  });

  it("last() returns the most recently pushed sample", () => {
    const t = createLatencyTracker();
    t.push(10);
    t.push(20);
    t.push(30);
    expect(t.last()).toBe(30);
  });

  it("last() works after ring buffer wraps around", () => {
    const t = createLatencyTracker({ maxSamples: 3 });
    t.push(1);
    t.push(2);
    t.push(3);
    t.push(4); // wraps, evicts 1
    expect(t.last()).toBe(4);
    t.push(5); // wraps again
    expect(t.last()).toBe(5);
  });

  it("last() returns null after reset", () => {
    const t = createLatencyTracker();
    t.push(42);
    t.reset();
    expect(t.last()).toBeNull();
  });

  it("percentAbove() returns null when empty", () => {
    const t = createLatencyTracker();
    expect(t.percentAbove(100)).toBeNull();
  });

  it("percentAbove() returns null for invalid threshold", () => {
    const t = createLatencyTracker();
    t.push(50);
    expect(t.percentAbove(NaN)).toBeNull();
    expect(t.percentAbove(Infinity)).toBeNull();
  });

  it("percentAbove() computes correct percentage", () => {
    const t = createLatencyTracker();
    [50, 100, 150, 200, 250].forEach((v) => t.push(v));
    // 3 of 5 are above 100 (150, 200, 250)
    expect(t.percentAbove(100)).toBe(60);
    // All above 0
    expect(t.percentAbove(0)).toBe(100);
    // None above 300
    expect(t.percentAbove(300)).toBe(0);
    // Threshold is exclusive: exactly 200 is not "above 200"
    expect(t.percentAbove(200)).toBe(20); // only 250
  });

  it("percentAbove() works after ring buffer wraps", () => {
    const t = createLatencyTracker({ maxSamples: 3 });
    t.push(10);
    t.push(20);
    t.push(30);
    t.push(40); // evicts 10, buffer is [20, 30, 40]
    expect(t.percentAbove(25)).toBe(67); // 30 and 40 above 25 → 2/3 ≈ 67%
  });

  it("percentAbove() returns 0 after reset", () => {
    const t = createLatencyTracker();
    t.push(100);
    t.reset();
    expect(t.percentAbove(50)).toBeNull();
  });

  it("totalPushed() starts at 0", () => {
    const t = createLatencyTracker();
    expect(t.totalPushed()).toBe(0);
  });

  it("totalPushed() increments on each valid push", () => {
    const t = createLatencyTracker({ maxSamples: 3 });
    t.push(10);
    t.push(20);
    t.push(30);
    expect(t.totalPushed()).toBe(3);
    // Continues incrementing after buffer wraps (eviction doesn't affect total)
    t.push(40);
    t.push(50);
    expect(t.totalPushed()).toBe(5);
    expect(t.count()).toBe(3); // buffer only holds 3
  });

  it("totalPushed() ignores invalid pushes", () => {
    const t = createLatencyTracker();
    t.push(10);
    t.push(-1);
    t.push(NaN);
    t.push(Infinity);
    t.push("hello");
    expect(t.totalPushed()).toBe(1);
  });

  it("totalPushed() resets to 0 on reset()", () => {
    const t = createLatencyTracker();
    t.push(10);
    t.push(20);
    expect(t.totalPushed()).toBe(2);
    t.reset();
    expect(t.totalPushed()).toBe(0);
  });

  it("getSnapshot() includes totalPushed", () => {
    const t = createLatencyTracker({ maxSamples: 3 });
    t.push(10);
    t.push(20);
    t.push(30);
    t.push(40);
    const snap = t.getSnapshot();
    expect(snap.totalPushed).toBe(4);
    expect(snap.count).toBe(3);
  });

  it("isFull() returns false when buffer is not at capacity", () => {
    const t = createLatencyTracker({ maxSamples: 5 });
    expect(t.isFull()).toBe(false);
    t.push(10);
    t.push(20);
    expect(t.isFull()).toBe(false);
  });

  it("isFull() returns true when buffer reaches capacity", () => {
    const t = createLatencyTracker({ maxSamples: 3 });
    t.push(10);
    t.push(20);
    t.push(30);
    expect(t.isFull()).toBe(true);
  });

  it("isFull() remains true after eviction", () => {
    const t = createLatencyTracker({ maxSamples: 3 });
    t.push(10);
    t.push(20);
    t.push(30);
    t.push(40); // evicts oldest
    expect(t.isFull()).toBe(true);
    expect(t.count()).toBe(3);
  });

  it("isFull() resets to false after reset()", () => {
    const t = createLatencyTracker({ maxSamples: 3 });
    t.push(10);
    t.push(20);
    t.push(30);
    expect(t.isFull()).toBe(true);
    t.reset();
    expect(t.isFull()).toBe(false);
  });

  it("trend() returns null with fewer than 4 samples", () => {
    const t = createLatencyTracker();
    expect(t.trend()).toBeNull();
    t.push(10);
    t.push(20);
    t.push(30);
    expect(t.trend()).toBeNull();
  });

  it('trend() returns "rising" when newer half is significantly higher', () => {
    const t = createLatencyTracker();
    [10, 10, 50, 50].forEach((v) => t.push(v));
    expect(t.trend()).toBe("rising");
  });

  it('trend() returns "falling" when newer half is significantly lower', () => {
    const t = createLatencyTracker();
    [50, 50, 10, 10].forEach((v) => t.push(v));
    expect(t.trend()).toBe("falling");
  });

  it('trend() returns "stable" when halves are similar', () => {
    const t = createLatencyTracker();
    [100, 100, 105, 95].forEach((v) => t.push(v));
    expect(t.trend()).toBe("stable");
  });

  it("trend() works after ring buffer wraps", () => {
    const t = createLatencyTracker({ maxSamples: 4 });
    t.push(10);
    t.push(10);
    t.push(10);
    t.push(10);
    t.push(50); // evicts oldest, buffer: [10, 10, 10, 50]
    t.push(50); // buffer: [10, 10, 50, 50]
    expect(t.trend()).toBe("rising");
  });

  it("trend() respects custom threshold", () => {
    const t = createLatencyTracker();
    [100, 100, 120, 120].forEach((v) => t.push(v));
    // 20% increase, default threshold 25% → stable
    expect(t.trend()).toBe("stable");
    // With 15% threshold → rising
    expect(t.trend({ thresholdPercent: 15 })).toBe("rising");
  });

  it("trend() handles zero older average", () => {
    const t = createLatencyTracker();
    [0, 0, 10, 10].forEach((v) => t.push(v));
    expect(t.trend()).toBe("rising");
  });

  it("trend() returns null after reset", () => {
    const t = createLatencyTracker();
    [10, 10, 50, 50].forEach((v) => t.push(v));
    expect(t.trend()).toBe("rising");
    t.reset();
    expect(t.trend()).toBeNull();
  });

  it("toJSON() delegates to getSnapshot()", () => {
    const t = createLatencyTracker({ maxSamples: 10 });
    t.push(5);
    t.push(15);
    const json = t.toJSON();
    const snap = t.getSnapshot();
    expect(json).toEqual(snap);
  });

  it("toJSON() works with JSON.stringify()", () => {
    const t = createLatencyTracker({ maxSamples: 5 });
    t.push(42);
    const parsed = JSON.parse(JSON.stringify(t));
    expect(parsed.count).toBe(1);
    expect(parsed.maxSamples).toBe(5);
    expect(parsed.totalPushed).toBe(1);
    expect(parsed.stats).not.toBeNull();
    expect(parsed.stats.min).toBe(42);
  });

  it("toJSON() returns null stats when empty", () => {
    const t = createLatencyTracker();
    const json = t.toJSON();
    expect(json.stats).toBeNull();
    expect(json.count).toBe(0);
  });

  it('toString() returns "LatencyTracker<empty>" when no samples', () => {
    const t = createLatencyTracker();
    expect(t.toString()).toBe("LatencyTracker<empty>");
  });

  it("toString() includes stats summary for a single sample", () => {
    const t = createLatencyTracker();
    t.push(42);
    const str = t.toString();
    expect(str).toStartWith("LatencyTracker<");
    // Buffer not full: shows "1/60 samples" (warmup indicator)
    expect(str).toContain("1/60 samples,");
    expect(str).toContain("avg=42ms");
    expect(str).toContain("median=42ms");
    expect(str).toContain("jitter=0ms");
    // p95 omitted for < 5 samples
    expect(str).not.toContain("p95=");
  });

  it("toString() includes p95 and trend when enough samples", () => {
    const t = createLatencyTracker();
    [10, 10, 50, 50, 90].forEach((v) => t.push(v));
    const str = t.toString();
    // Buffer not full: shows "5/60 samples"
    expect(str).toContain("5/60 samples");
    expect(str).toContain("p95=");
    expect(str).toContain("rising");
  });

  it("toString() omits capacity when buffer is full", () => {
    const t = createLatencyTracker({ maxSamples: 4 });
    [10, 20, 30, 40].forEach((v) => t.push(v));
    const str = t.toString();
    // Buffer full: shows "4 samples" without capacity denominator
    expect(str).toContain("4 samples");
    expect(str).not.toContain("/");
  });

  it("toString() returns empty after reset", () => {
    const t = createLatencyTracker();
    t.push(10);
    t.push(20);
    t.reset();
    expect(t.toString()).toBe("LatencyTracker<empty>");
  });

  it("allTimeMin/allTimeMax return null when empty", () => {
    const t = createLatencyTracker();
    expect(t.allTimeMin()).toBeNull();
    expect(t.allTimeMax()).toBeNull();
  });

  it("allTimeMin/allTimeMax track extremes across evictions", () => {
    const t = createLatencyTracker({ maxSamples: 3 });
    t.push(100);
    t.push(5); // all-time min
    t.push(200); // all-time max
    t.push(50); // evicts 100
    t.push(60); // evicts 5
    t.push(70); // evicts 200
    // Window now has [50, 60, 70] but all-time extremes survive
    const s = t.stats();
    expect(s.min).toBe(50);
    expect(s.max).toBe(70);
    expect(t.allTimeMin()).toBe(5);
    expect(t.allTimeMax()).toBe(200);
  });

  it("allTimeMin/allTimeMax match window stats when no eviction", () => {
    const t = createLatencyTracker({ maxSamples: 10 });
    t.push(30);
    t.push(10);
    t.push(50);
    expect(t.allTimeMin()).toBe(10);
    expect(t.allTimeMax()).toBe(50);
    const s = t.stats();
    expect(t.allTimeMin()).toBe(s.min);
    expect(t.allTimeMax()).toBe(s.max);
  });

  it("allTimeMin/allTimeMax reset on reset()", () => {
    const t = createLatencyTracker();
    t.push(5);
    t.push(500);
    t.reset();
    expect(t.allTimeMin()).toBeNull();
    expect(t.allTimeMax()).toBeNull();
    t.push(100);
    expect(t.allTimeMin()).toBe(100);
    expect(t.allTimeMax()).toBe(100);
  });

  it("getSnapshot includes allTimeMin/allTimeMax", () => {
    const t = createLatencyTracker({ maxSamples: 2 });
    t.push(10);
    t.push(200);
    t.push(50); // evicts 10
    const snap = t.getSnapshot();
    expect(snap.allTimeMin).toBe(10);
    expect(snap.allTimeMax).toBe(200);
  });

  it("toString shows all-time extremes when they differ from window", () => {
    const t = createLatencyTracker({ maxSamples: 3 });
    t.push(1);
    t.push(50);
    t.push(50);
    t.push(50); // evicts 1
    t.push(50);
    t.push(50);
    const str = t.toString();
    expect(str).toContain("all-time-min=1ms");
  });

  describe("percentile", () => {
    it("returns null when empty", () => {
      const t = createLatencyTracker();
      expect(t.percentile(50)).toBeNull();
    });

    it("returns null for invalid percentile values", () => {
      const t = createLatencyTracker();
      t.push(10);
      expect(t.percentile(-1)).toBeNull();
      expect(t.percentile(101)).toBeNull();
      expect(t.percentile(NaN)).toBeNull();
      expect(t.percentile(Infinity)).toBeNull();
      expect(t.percentile("50")).toBeNull();
    });

    it("returns the single sample for any valid percentile", () => {
      const t = createLatencyTracker();
      t.push(42);
      expect(t.percentile(0)).toBe(42);
      expect(t.percentile(50)).toBe(42);
      expect(t.percentile(100)).toBe(42);
    });

    it("computes p0 and p100 as min and max", () => {
      const t = createLatencyTracker();
      [10, 20, 30, 40, 50].forEach((v) => t.push(v));
      expect(t.percentile(0)).toBe(10);
      expect(t.percentile(100)).toBe(50);
    });

    it("computes p50 (median) correctly", () => {
      const t = createLatencyTracker();
      [10, 20, 30, 40, 50].forEach((v) => t.push(v));
      expect(t.percentile(50)).toBe(30);
    });

    it("interpolates between samples", () => {
      const t = createLatencyTracker();
      [0, 100].forEach((v) => t.push(v));
      // p25 should interpolate: 0 + 0.25*(100-0) = 25
      expect(t.percentile(25)).toBe(25);
      expect(t.percentile(75)).toBe(75);
    });

    it("works after eviction", () => {
      const t = createLatencyTracker({ maxSamples: 3 });
      [100, 200, 300, 400].forEach((v) => t.push(v)); // 100 evicted
      expect(t.percentile(0)).toBe(200);
      expect(t.percentile(100)).toBe(400);
    });
  });

  describe("maxSamples clamping", () => {
    it("clamps maxSamples=0 to 2 (prevents modulo-zero NaN)", () => {
      const t = createLatencyTracker({ maxSamples: 0 });
      t.push(10);
      t.push(20);
      t.push(30); // should evict oldest
      expect(t.count()).toBe(2);
      expect(t.stats()).not.toBeNull();
    });

    it("clamps maxSamples=1 to 2", () => {
      const t = createLatencyTracker({ maxSamples: 1 });
      t.push(10);
      t.push(20);
      expect(t.count()).toBe(2);
    });

    it("clamps negative maxSamples to 2", () => {
      const t = createLatencyTracker({ maxSamples: -5 });
      t.push(10);
      t.push(20);
      expect(t.count()).toBe(2);
      expect(t.stats().avg).toBe(15);
    });

    it("clamps fractional maxSamples via Math.trunc", () => {
      const t = createLatencyTracker({ maxSamples: 3.9 });
      t.push(10);
      t.push(20);
      t.push(30);
      t.push(40); // evicts 10
      expect(t.count()).toBe(3);
      expect(t.samples()).toEqual([20, 30, 40]);
    });
  });
});
