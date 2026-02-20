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
 * @returns {{ update: (t: number) => void, fps: () => number, reset: () => void }}
 */
export function createFpsCounter(opts = {}) {
  const bufferSize = opts.bufferSize ?? 120; // enough for 2× 60fps
  const windowMs = opts.windowMs ?? 1000;
  const ring = new Float64Array(bufferSize);
  let head = 0;
  let count = 0;
  let currentFps = 0;

  /**
   * Record a frame timestamp and update the FPS measurement.
   * Call once per rendered frame with the rAF timestamp.
   *
   * @param {number} t - Frame timestamp in milliseconds
   */
  function update(t) {
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
  }

  return { update, fps, reset };
}
