/**
 * Rolling latency tracker with cached statistics.
 * Extracted from renderer.js for testability and reuse.
 *
 * Maintains a fixed-size ring buffer of latency samples and computes
 * min/max/avg/median/p95/jitter on demand (cached until next push).
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
  const buffer = [];
  let cache = null;

  function push(ms) {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return;
    buffer.push(ms);
    if (buffer.length > maxSamples) buffer.shift();
    cache = null;
  }

  function stats() {
    if (buffer.length === 0) return null;
    if (cache) return cache;

    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const v = buffer[i];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }

    const sorted = buffer.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : Math.round(sorted[mid]);

    const p95Idx = Math.min(Math.ceil(sorted.length * 0.95) - 1, sorted.length - 1);
    const p95 = Math.round(sorted[Math.max(0, p95Idx)]);

    const avg = sum / buffer.length;
    let sqDiffSum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const diff = buffer[i] - avg;
      sqDiffSum += diff * diff;
    }
    const jitter = Math.round(Math.sqrt(sqDiffSum / buffer.length));

    cache = {
      min: Math.round(min),
      max: Math.round(max),
      avg: Math.round(avg),
      median,
      p95,
      jitter,
      samples: buffer.length,
    };
    return cache;
  }

  function reset() {
    buffer.length = 0;
    cache = null;
  }

  function samples() {
    return buffer.slice();
  }

  return { push, stats, reset, samples };
}
