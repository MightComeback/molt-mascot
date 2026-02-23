/**
 * Rolling FPS counter using a ring buffer of frame timestamps.
 * Extracted from renderer.js for testability and reuse.
 *
 * Counts how many frames occurred within the last 1 second window
 * to produce a real-time FPS measurement without allocations in the hot path.
 */

/**
 * Create an FPS counter instance.
 *
 * @param {{ bufferSize?: number, windowMs?: number }} [opts]
 * @returns {{ update: (t: number) => void, fps: () => number, reset: () => void, frameCount: () => number }}
 */
export function createFpsCounter(opts = {}) {
  const bufferSize = opts.bufferSize ?? 120; // enough for 2× 60fps
  const windowMs = opts.windowMs ?? 1000;
  const ring = new Float64Array(bufferSize);
  let head = 0;
  let count = 0;
  let currentFps = 0;
  let totalFrames = 0;
  let lastFrameTime = -1;
  let worstFrameDeltaMs = 0;

  // Tail tracks the oldest entry still within the rolling window.
  // By advancing tail forward as entries expire, update() avoids
  // the O(count) backward scan and becomes O(evicted) — typically O(1).
  let tail = 0;
  let inWindow = 0; // count of entries within the rolling window

  /**
   * Record a frame timestamp and update the FPS measurement.
   * Call once per rendered frame with the rAF timestamp.
   *
   * @param {number} t - Frame timestamp in milliseconds
   */
  function update(t) {
    totalFrames++;
    // Track worst inter-frame delta for jank detection.
    // A large delta relative to the expected frame interval indicates a rendering
    // stall (GC pause, layout thrash, blocked main thread, etc.).
    if (lastFrameTime >= 0) {
      const delta = t - lastFrameTime;
      if (delta > worstFrameDeltaMs) worstFrameDeltaMs = delta;
    }
    lastFrameTime = t;

    // If the buffer is full, the oldest entry (at head) is evicted.
    // Adjust inWindow if that evicted entry was still within the window.
    if (count >= bufferSize) {
      // head is about to be overwritten; if tail == head, advance tail.
      if (tail === head) {
        tail = (tail + 1) % bufferSize;
        inWindow--;
      }
    }

    ring[head] = t;
    head = (head + 1) % bufferSize;
    if (count < bufferSize) count++;
    inWindow++;

    // Advance tail past entries that have fallen outside the window.
    const cutoff = t - windowMs;
    while (inWindow > 0 && ring[tail] < cutoff) {
      tail = (tail + 1) % bufferSize;
      inWindow--;
    }

    currentFps = inWindow;
  }

  /** Current measured FPS (frames in the last window). */
  function fps() {
    return currentFps;
  }

  /** Reset all state (e.g. after pause/resume). */
  function reset() {
    ring.fill(0);
    head = 0;
    tail = 0;
    count = 0;
    inWindow = 0;
    currentFps = 0;
    totalFrames = 0;
    lastFrameTime = -1;
    worstFrameDeltaMs = 0;
  }

  /** Total frames rendered since creation or last reset. */
  function frameCount() {
    return totalFrames;
  }

  /**
   * Return a snapshot of all FPS counter metrics in one call.
   * Avoids consumers calling multiple methods (fps(), frameCount())
   * and keeps debug-info / diagnostics export clean.
   *
   * @returns {{ fps: number, frameCount: number, avgFrameTimeMs: number | null, worstFrameDeltaMs: number }}
   */
  function getSnapshot() {
    const f = currentFps;
    return {
      fps: f,
      frameCount: totalFrames,
      avgFrameTimeMs: f > 0 ? Math.round((windowMs / f) * 100) / 100 : null,
      worstFrameDeltaMs,
    };
  }

  /** Peak inter-frame delta since creation or last reset (ms). Indicates worst jank. */
  function worstDelta() {
    return worstFrameDeltaMs;
  }

  /**
   * Return the most recently recorded frame timestamp without materializing arrays.
   * Mirrors latencyTracker.last() for API consistency across tracker modules.
   *
   * @returns {number|null} The last frame timestamp, or null if no frames recorded
   */
  function last() {
    if (totalFrames === 0) return null;
    // head points to the next write slot; most recent entry is at head - 1.
    const idx = (head - 1 + bufferSize) % bufferSize;
    return ring[idx];
  }

  /**
   * Return the percentage of inter-frame deltas that exceeded a given threshold.
   * Useful for jank budget analysis (e.g., "what % of frames exceeded 33ms?").
   * Mirrors latencyTracker.percentAbove() for API consistency across tracker modules.
   *
   * Only considers frames with a valid previous timestamp (first frame is excluded).
   *
   * @param {number} thresholdMs - Delta threshold in milliseconds (exclusive)
   * @returns {number|null} Integer percentage (0-100), or null if fewer than 2 frames
   */
  function percentAboveThreshold(thresholdMs) {
    if (count < 2) return null;
    if (typeof thresholdMs !== 'number' || !Number.isFinite(thresholdMs)) return null;

    // Scan consecutive pairs in the ring buffer to compute inter-frame deltas.
    // We iterate from oldest to newest; only pairs where both entries are valid
    // (i.e., within the filled region) produce a delta.
    let pairs = 0;
    let above = 0;
    for (let i = 1; i < count; i++) {
      const prevIdx = (head - count + i - 1 + bufferSize) % bufferSize;
      const curIdx = (head - count + i + bufferSize) % bufferSize;
      const delta = ring[curIdx] - ring[prevIdx];
      pairs++;
      if (delta > thresholdMs) above++;
    }
    if (pairs === 0) return null;
    return Math.round((above / pairs) * 100);
  }

  /**
   * Whether the ring buffer is at capacity (oldest timestamps are being evicted).
   * Mirrors latencyTracker.isFull() for API consistency across tracker modules.
   *
   * @returns {boolean}
   */
  function isFull() {
    return count >= bufferSize;
  }

  /**
   * Compute the FPS trend by comparing inter-frame deltas in the older half of
   * the buffer to the newer half. Returns "improving", "degrading", or "stable"
   * based on whether the newer half's average frame time deviates from the older
   * half by more than a relative threshold.
   *
   * Useful for proactive jank detection: "degrading" warns that rendering
   * performance is dropping before it becomes visually obvious, while
   * "improving" confirms recovery after a stall.
   *
   * Mirrors latencyTracker.trend() for API consistency across tracker modules.
   *
   * Requires at least 4 frames (to compute 3+ inter-frame deltas, split into halves).
   *
   * @param {{ thresholdPercent?: number }} [opts] - Deviation threshold (default 25%)
   * @returns {"improving"|"degrading"|"stable"|null} Trend direction, or null if insufficient data
   */
  function trend(opts = {}) {
    if (count < 4) return null;
    const thresholdPercent = opts.thresholdPercent ?? 25;

    // Collect inter-frame deltas from the ring buffer (oldest → newest).
    const deltas = [];
    for (let i = 1; i < count; i++) {
      const prevIdx = (head - count + i - 1 + bufferSize) % bufferSize;
      const curIdx = (head - count + i + bufferSize) % bufferSize;
      deltas.push(ring[curIdx] - ring[prevIdx]);
    }

    if (deltas.length < 2) return null;

    const midpoint = Math.floor(deltas.length / 2);
    let olderSum = 0;
    let newerSum = 0;
    const newerCount = deltas.length - midpoint;

    for (let i = 0; i < midpoint; i++) olderSum += deltas[i];
    for (let i = midpoint; i < deltas.length; i++) newerSum += deltas[i];

    const olderAvg = olderSum / midpoint;
    const newerAvg = newerSum / newerCount;

    // Avoid division by zero when older average is 0.
    if (olderAvg === 0) return newerAvg === 0 ? 'stable' : 'degrading';

    // Higher frame time = worse performance, so positive change = degrading.
    const changePercent = ((newerAvg - olderAvg) / olderAvg) * 100;

    if (changePercent > thresholdPercent) return 'degrading';
    if (changePercent < -thresholdPercent) return 'improving';
    return 'stable';
  }

  /**
   * JSON.stringify() support — delegates to getSnapshot() so
   * `JSON.stringify(fpsCounter)` produces a useful diagnostic object
   * without manual plucking (consistent with latencyTracker.toJSON()).
   *
   * @returns {{ fps: number, frameCount: number, avgFrameTimeMs: number|null, worstFrameDeltaMs: number }}
   */
  function toJSON() {
    return getSnapshot();
  }

  return { update, fps, reset, frameCount, getSnapshot, worstDelta, last, percentAboveThreshold, isFull, trend, toJSON };
}
