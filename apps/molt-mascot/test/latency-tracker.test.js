import { describe, it, expect } from 'bun:test';
import { createLatencyTracker } from '../src/latency-tracker.js';

describe('createLatencyTracker', () => {
  it('returns null stats when empty', () => {
    const t = createLatencyTracker();
    expect(t.stats()).toBeNull();
  });

  it('tracks a single sample', () => {
    const t = createLatencyTracker();
    t.push(42);
    const s = t.stats();
    expect(s.min).toBe(42);
    expect(s.max).toBe(42);
    expect(s.avg).toBe(42);
    expect(s.median).toBe(42);
    expect(s.samples).toBe(1);
  });

  it('computes correct stats for multiple samples', () => {
    const t = createLatencyTracker();
    [10, 20, 30, 40, 50].forEach(v => t.push(v));
    const s = t.stats();
    expect(s.min).toBe(10);
    expect(s.max).toBe(50);
    expect(s.avg).toBe(30);
    expect(s.median).toBe(30);
    expect(s.samples).toBe(5);
  });

  it('computes median for even-length buffer', () => {
    const t = createLatencyTracker();
    [10, 20, 30, 40].forEach(v => t.push(v));
    expect(t.stats().median).toBe(25);
  });

  it('respects maxSamples and evicts oldest', () => {
    const t = createLatencyTracker({ maxSamples: 3 });
    [100, 200, 300, 400].forEach(v => t.push(v));
    expect(t.stats().samples).toBe(3);
    expect(t.stats().min).toBe(200);
  });

  it('ignores invalid values', () => {
    const t = createLatencyTracker();
    t.push(-1);
    t.push(NaN);
    t.push(Infinity);
    t.push(null);
    t.push(undefined);
    t.push('50');
    expect(t.stats()).toBeNull();
  });

  it('caches stats until next push', () => {
    const t = createLatencyTracker();
    t.push(10);
    const s1 = t.stats();
    const s2 = t.stats();
    expect(s1).toBe(s2); // same reference = cached
    t.push(20);
    const s3 = t.stats();
    expect(s3).not.toBe(s1);
  });

  it('reset clears all data', () => {
    const t = createLatencyTracker();
    t.push(10);
    t.push(20);
    t.reset();
    expect(t.stats()).toBeNull();
    expect(t.samples()).toEqual([]);
  });

  it('computes p95 correctly', () => {
    const t = createLatencyTracker();
    // 20 samples: 1..20
    for (let i = 1; i <= 20; i++) t.push(i);
    const s = t.stats();
    // p95 index = ceil(20*0.95)-1 = 18 → sorted[18] = 19
    expect(s.p95).toBe(19);
  });

  it('computes p99 correctly', () => {
    const t = createLatencyTracker({ maxSamples: 100 });
    // 100 samples: 1..100
    for (let i = 1; i <= 100; i++) t.push(i);
    const s = t.stats();
    // p99 index = ceil(100*0.99)-1 = 98 → sorted[98] = 99
    expect(s.p99).toBe(99);
  });

  it('computes p99 with small sample size', () => {
    const t = createLatencyTracker();
    // 5 samples: p99 index = ceil(5*0.99)-1 = 4 → sorted[4] = 50
    [10, 20, 30, 40, 50].forEach(v => t.push(v));
    expect(t.stats().p99).toBe(50);
  });

  it('computes jitter (stddev)', () => {
    const t = createLatencyTracker();
    // All same value → jitter = 0
    [50, 50, 50].forEach(v => t.push(v));
    expect(t.stats().jitter).toBe(0);

    // Spread values → jitter > 0
    const t2 = createLatencyTracker();
    [10, 50, 90].forEach(v => t2.push(v));
    expect(t2.stats().jitter).toBeGreaterThan(0);
  });

  it('samples() returns a copy of the buffer', () => {
    const t = createLatencyTracker();
    t.push(10);
    t.push(20);
    const s = t.samples();
    expect(s).toEqual([10, 20]);
    s.push(999);
    expect(t.samples()).toEqual([10, 20]); // original unaffected
  });

  it('count() returns buffer length without copying', () => {
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

  it('count() respects maxSamples eviction', () => {
    const t = createLatencyTracker({ maxSamples: 2 });
    t.push(10);
    t.push(20);
    t.push(30);
    expect(t.count()).toBe(2);
  });

  it('getSnapshot() returns stats, count, and maxSamples', () => {
    const t = createLatencyTracker({ maxSamples: 10 });
    const empty = t.getSnapshot();
    expect(empty.stats).toBeNull();
    expect(empty.count).toBe(0);
    expect(empty.maxSamples).toBe(10);

    t.push(5);
    t.push(15);
    const snap = t.getSnapshot();
    expect(snap.count).toBe(2);
    expect(snap.maxSamples).toBe(10);
    expect(snap.stats).not.toBeNull();
    expect(snap.stats.min).toBe(5);
    expect(snap.stats.max).toBe(15);
    expect(snap.stats.samples).toBe(2);
  });

  it('getSnapshot() uses cached stats', () => {
    const t = createLatencyTracker();
    t.push(42);
    const s1 = t.getSnapshot().stats;
    const s2 = t.getSnapshot().stats;
    expect(s1).toBe(s2); // same cached reference
  });
});
