/**
 * Shared formatLatency — works in both CJS (tray-icon, electron-main) and ESM (utils.js re-exports it).
 * Single source of truth: eliminates the duplicated implementation between tray-icon.cjs and utils.js.
 *
 * Format a latency value in milliseconds into a compact, human-readable string.
 * - 0 → "< 1ms" (sub-millisecond precision isn't meaningful for WS round-trips)
 * - 1–999 → "Xms"
 * - 1000+ → "X.Ys" (one decimal, e.g. "1.2s")
 * - Negative/NaN/Infinity → "–" (dash, indicates unavailable)
 *
 * @param {number} ms - Latency in milliseconds
 * @returns {string}
 */
function formatLatency(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '–';
  if (ms === 0) return '< 1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

module.exports = { formatLatency };
