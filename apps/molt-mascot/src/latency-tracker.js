/**
 * Rolling latency tracker with cached statistics.
 * Extracted from renderer.js for testability and reuse.
 *
 * Maintains a fixed-size ring buffer of latency samples and computes
 * min/max/avg/median/p95/jitter on demand (cached until next push).
 *
 * Uses a ring buffer internally to avoid O(n) Array.shift() on every push
 * when the buffer is at capacity. The previous implementation used a plain
 * array with push/shift, which copies all elements on each eviction.
 */

const DEFAULT_BUFFER_MAX = 60;

/**
 * Create a new latency tracker instance.
 *
 * @param {{ maxSamples?: number }} [opts]
 * @returns {{ push: (ms: number) => void, stats: () => object|null, reset: () => void, samples: () => number[] }}
 */
export function createLatencyTracker(opts = {}) {
  const maxSamples = opts.maxSamples ?? DEFAULT_BUFFER_MAX;
  // Ring buffer: head points to the next write slot; _count tracks filled slots.
  const ring = Array.from({ length: maxSamples });
  let head = 0;
  let _count = 0;
  let cache = null;

  function push(ms) {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return;
    ring[head] = ms;
    head = (head + 1) % maxSamples;
    if (_count < maxSamples) _count++;
    cache = null;
  }

  /** Materialize the ring buffer into an ordered array (oldest → newest). */
  function _toArray() {
    if (_count === 0) return [];
    if (_count < maxSamples) return ring.slice(0, _count);
    // Buffer is full: head points to the oldest entry
    return ring.slice(head).concat(ring.slice(0, head));
  }

  function stats() {
    if (_count === 0) return null;
    if (cache) return cache;

    // Read directly from ring to avoid allocation for min/max/sum
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    const start = _count < maxSamples ? 0 : head;
    for (let i = 0; i < _count; i++) {
      const v = ring[(start + i) % maxSamples];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }

    const sorted = _toArray().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : Math.round(sorted[mid]);

    const p95Idx = Math.min(Math.ceil(sorted.length * 0.95) - 1, sorted.length - 1);
    const p95 = Math.round(sorted[Math.max(0, p95Idx)]);

    const p99Idx = Math.min(Math.ceil(sorted.length * 0.99) - 1, sorted.length - 1);
    const p99 = Math.round(sorted[Math.max(0, p99Idx)]);

    const avg = sum / _count;
    let sqDiffSum = 0;
    for (let i = 0; i < _count; i++) {
      const diff = ring[(start + i) % maxSamples] - avg;
      sqDiffSum += diff * diff;
    }
    const jitter = Math.round(Math.sqrt(sqDiffSum / _count));

    cache = {
      min: Math.round(min),
      max: Math.round(max),
      avg: Math.round(avg),
      median,
      p95,
      p99,
      jitter,
      samples: _count,
    };
    return cache;
  }

  function reset() {
    head = 0;
    _count = 0;
    cache = null;
  }

  function samples() {
    return _toArray();
  }

  /**
   * Number of samples currently in the buffer.
   * Avoids the allocation of samples().slice() when only the count is needed.
   *
   * @returns {number}
   */
  function count() {
    return _count;
  }

  /**
   * Return a snapshot of all latency tracker metrics in one call.
   * Mirrors fpsCounter.getSnapshot() for API consistency across tracker modules.
   * Avoids consumers calling multiple methods (stats(), count()) separately.
   *
   * @returns {{ stats: object|null, count: number, maxSamples: number }}
   */
  function getSnapshot() {
    return {
      stats: stats(),
      count: _count,
      maxSamples,
    };
  }

  return { push, stats, reset, samples, count, getSnapshot };
}
