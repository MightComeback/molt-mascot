/**
 * Shared formatLatency — works in both CJS (tray-icon, electron-main) and ESM (utils.js re-exports it).
 * Single source of truth: eliminates the duplicated implementation between tray-icon.cjs and utils.js.
 *
 * Format a latency value in milliseconds into a compact, human-readable string.
 * - 0–0.999 → "< 1ms" (sub-millisecond precision isn't meaningful for WS round-trips)
 * - 1–999 → "Xms"
 * - 1000+ → "X.Ys" (one decimal, e.g. "1.2s")
 * - Negative/NaN/Infinity → "–" (dash, indicates unavailable)
 *
 * @param {number} ms - Latency in milliseconds
 * @returns {string}
 */
function formatLatency(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '–';
  if (ms < 1) return '< 1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Categorize a latency value into a human-readable quality label.
 * Useful for at-a-glance connection assessment in tooltips and debug info
 * without requiring users to interpret raw millisecond values.
 *
 * Thresholds are calibrated for WebSocket round-trip times to a local
 * or near-local Gateway (not internet-scale RTTs):
 * - < 50ms  → "excellent" (typical local/LAN)
 * - < 150ms → "good" (Wi-Fi, same region)
 * - < 500ms → "fair" (cross-region, congested)
 * - ≥ 500ms → "poor" (needs investigation)
 *
 * @param {number} ms - Latency in milliseconds
 * @returns {string|null} Quality label, or null if latency is invalid/unavailable
 */
function connectionQuality(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 50) return 'excellent';
  if (ms < 150) return 'good';
  if (ms < 500) return 'fair';
  return 'poor';
}

/**
 * Map a connection quality label to a colored circle emoji for at-a-glance
 * visual feedback in tooltips and tray menus.
 *
 * @param {string|null} quality - Quality label from connectionQuality()
 * @returns {string} Colored circle emoji, or empty string if quality is null/unknown
 */
function connectionQualityEmoji(quality) {
  switch (quality) {
    case 'excellent': return '🟢';
    case 'good':      return '🟡';
    case 'fair':      return '🟠';
    case 'poor':      return '🔴';
    default:          return '';
  }
}

module.exports = { formatLatency, connectionQuality, connectionQualityEmoji };
