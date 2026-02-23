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
  let _totalPushed = 0;
  let cache = null;

  function push(ms) {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return;
    ring[head] = ms;
    head = (head + 1) % maxSamples;
    if (_count < maxSamples) _count++;
    _totalPushed++;
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
    _totalPushed = 0;
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
   * Return the most recently pushed sample without materializing the full array.
   * Useful for diagnostics that only need the latest value (e.g. "current latency")
   * without the overhead of samples()[samples.length - 1].
   *
   * @returns {number|null} The last pushed sample, or null if empty
   */
  function last() {
    if (_count === 0) return null;
    // head points to the *next* write slot, so the most recent entry is at head - 1.
    const idx = (head - 1 + maxSamples) % maxSamples;
    return ring[idx];
  }

  /**
   * Total number of samples ever pushed (including evicted ones).
   * Useful for diagnostics: "15,203 total, 60 in buffer" shows how long
   * the tracker has been active and whether it's been heavily utilized.
   *
   * @returns {number}
   */
  function totalPushed() {
    return _totalPushed;
  }

  /**
   * Return a snapshot of all latency tracker metrics in one call.
   * Mirrors fpsCounter.getSnapshot() for API consistency across tracker modules.
   * Avoids consumers calling multiple methods (stats(), count()) separately.
   *
   * @returns {{ stats: object|null, count: number, maxSamples: number, totalPushed: number, trend: "rising"|"falling"|"stable"|null }}
   */
  function getSnapshot() {
    return {
      stats: stats(),
      count: _count,
      maxSamples,
      totalPushed: _totalPushed,
      trend: trend(),
    };
  }

  /**
   * Return the percentage of samples that exceed a given threshold.
   * Useful for diagnostics like "what % of polls are above 200ms?"
   * and for more nuanced health assessments than a single median check.
   *
   * @param {number} thresholdMs - Threshold in milliseconds (exclusive)
   * @returns {number|null} Integer percentage (0-100), or null if no samples
   */
  function percentAbove(thresholdMs) {
    if (_count === 0) return null;
    if (typeof thresholdMs !== 'number' || !Number.isFinite(thresholdMs)) return null;
    const start = _count < maxSamples ? 0 : head;
    let above = 0;
    for (let i = 0; i < _count; i++) {
      if (ring[(start + i) % maxSamples] > thresholdMs) above++;
    }
    return Math.round((above / _count) * 100);
  }

  /**
   * Whether the ring buffer is at capacity (oldest samples are being evicted).
   * Useful for consumers that want to know if stats represent a full rolling
   * window or are still warming up with partial data.
   *
   * @returns {boolean}
   */
  function isFull() {
    return _count >= maxSamples;
  }

  /**
   * Compute the latency trend by comparing the older half of samples to the newer half.
   * Returns "rising", "falling", or "stable" based on whether the newer half's average
   * deviates from the older half by more than a relative threshold.
   *
   * Useful for proactive health diagnostics: "latency is rising" warns before
   * thresholds are breached, while "falling" confirms recovery after a spike.
   *
   * Requires at least 4 samples (2 per half) for a meaningful comparison.
   *
   * @param {{ thresholdPercent?: number }} [opts] - Deviation threshold (default 25%)
   * @returns {"rising"|"falling"|"stable"|null} Trend direction, or null if insufficient data
   */
  function trend(opts = {}) {
    if (_count < 4) return null;
    const thresholdPercent = opts.thresholdPercent ?? 25;

    // Split the buffer into older half and newer half (ordered oldest → newest).
    const start = _count < maxSamples ? 0 : head;
    const midpoint = Math.floor(_count / 2);

    let olderSum = 0;
    let newerSum = 0;
    const newerCount = _count - midpoint;

    for (let i = 0; i < midpoint; i++) {
      olderSum += ring[(start + i) % maxSamples];
    }
    for (let i = midpoint; i < _count; i++) {
      newerSum += ring[(start + i) % maxSamples];
    }

    const olderAvg = olderSum / midpoint;
    const newerAvg = newerSum / newerCount;

    // Avoid division by zero when older average is 0 (all-zero latencies).
    if (olderAvg === 0) return newerAvg === 0 ? 'stable' : 'rising';

    const changePercent = ((newerAvg - olderAvg) / olderAvg) * 100;

    if (changePercent > thresholdPercent) return 'rising';
    if (changePercent < -thresholdPercent) return 'falling';
    return 'stable';
  }

  /**
   * JSON.stringify() support — delegates to getSnapshot() so
   * `JSON.stringify(tracker)` produces a clean diagnostic snapshot
   * without manual plucking (consistent with GatewayClient.toJSON()).
   *
   * @returns {{ stats: object|null, count: number, maxSamples: number, totalPushed: number, trend: "rising"|"falling"|"stable"|null }}
   */
  function toJSON() {
    return getSnapshot();
  }

  /**
   * Human-readable one-line summary for quick diagnostic logging.
   * Example: "LatencyTracker<12 samples, avg=45ms, median=42ms, p95=78ms, jitter=8ms, rising>"
   * Returns "LatencyTracker<empty>" when no samples are available.
   *
   * Mirrors GatewayClient.toString() for consistent diagnostic output.
   *
   * @returns {string}
   */
  function toString() {
    if (_count === 0) return 'LatencyTracker<empty>';
    const s = stats();
    const parts = [`${s.samples} sample${s.samples !== 1 ? 's' : ''}`];
    parts.push(`avg=${s.avg}ms`);
    parts.push(`median=${s.median}ms`);
    if (s.samples >= 5) parts.push(`p95=${s.p95}ms`);
    parts.push(`jitter=${s.jitter}ms`);
    const t = trend();
    if (t) parts.push(t);
    return `LatencyTracker<${parts.join(', ')}>`;
  }

  return { push, stats, reset, samples, count, last, percentAbove, totalPushed, getSnapshot, isFull, trend, toJSON, toString };
}
