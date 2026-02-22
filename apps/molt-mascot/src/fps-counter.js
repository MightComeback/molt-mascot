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

  return { update, fps, reset, frameCount, getSnapshot, worstDelta };
}
