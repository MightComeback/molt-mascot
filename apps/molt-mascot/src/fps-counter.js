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
    ring[head] = t;
    head = (head + 1) % bufferSize;
    if (count < bufferSize) count++;

    // Count timestamps within the rolling window, scanning backwards.
    const cutoff = t - windowMs;
    let n = 0;
    for (let i = 0; i < count; i++) {
      const idx = (head - 1 - i + bufferSize) % bufferSize;
      if (ring[idx] < cutoff) break;
      n++;
    }
    currentFps = n;
  }

  /** Current measured FPS (frames in the last window). */
  function fps() {
    return currentFps;
  }

  /** Reset all state (e.g. after pause/resume). */
  function reset() {
    ring.fill(0);
    head = 0;
    count = 0;
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

  return { update, fps, reset, frameCount, getSnapshot, worstDelta, last, percentAboveThreshold };
}
