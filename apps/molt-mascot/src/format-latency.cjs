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
 * Connection quality thresholds (ms) for WebSocket round-trip latency.
 * Calibrated for local/near-local Gateway connections (not internet-scale RTTs).
 *
 * Exported so consumers (tests, docs, health checks) can reference the actual
 * threshold values without duplicating magic numbers.
 */
const QUALITY_THRESHOLDS = Object.freeze({
  /** Below this → "excellent" (typical local/LAN) */
  EXCELLENT_MAX_MS: 50,
  /** Below this → "good" (Wi-Fi, same region) */
  GOOD_MAX_MS: 150,
  /** Below this → "fair" (cross-region, congested); ≥ this → "poor" */
  FAIR_MAX_MS: 500,
});

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
  if (ms < QUALITY_THRESHOLDS.EXCELLENT_MAX_MS) return 'excellent';
  if (ms < QUALITY_THRESHOLDS.GOOD_MAX_MS) return 'good';
  if (ms < QUALITY_THRESHOLDS.FAIR_MAX_MS) return 'fair';
  return 'poor';
}

/**
 * Map a connection quality label to a colored circle emoji for at-a-glance
 * visual feedback in tooltips and tray menus.
 *
 * @param {string|null} quality - Quality label from connectionQuality()
 * @returns {string} Colored circle emoji (⚪ for null/unknown quality)
 */
function connectionQualityEmoji(quality) {
  switch (quality) {
    case 'excellent': return '🟢';
    case 'good':      return '🟡';
    case 'fair':      return '🟠';
    case 'poor':      return '🔴';
    default:          return '⚪';
  }
}

/**
 * Pick the best latency value for quality assessment: prefer median from
 * rolling stats (more stable) when available with >1 sample, else fall back
 * to the instant latency value.
 *
 * Extracts the repeated pattern from buildTooltip, buildTrayTooltip, and
 * buildDebugInfo into a single reusable function.
 *
 * @param {number|null|undefined} instantMs - Most recent latency sample
 * @param {{ median?: number, samples?: number }|null|undefined} stats - Rolling latency stats
 * @returns {number|null} Best available latency value, or null if neither is usable
 */
function resolveQualitySource(instantMs, stats) {
  const hasStats = stats
    && typeof stats.median === 'number'
    && typeof stats.samples === 'number'
    && stats.samples > 1;
  if (hasStats) return stats.median;
  if (typeof instantMs === 'number' && Number.isFinite(instantMs) && instantMs >= 0) return instantMs;
  return null;
}

/**
 * Build a compact latency + quality summary string from instant latency and optional rolling stats.
 *
 * Consolidates the repeated pattern across buildTooltip, buildTrayTooltip, and buildDebugInfo:
 *   formatLatency(ms) + resolveQualitySource(ms, stats) + connectionQuality() + connectionQualityEmoji()
 *
 * @param {number} ms - Instant latency in milliseconds
 * @param {{ median?: number, samples?: number, jitter?: number }|null|undefined} [stats] - Rolling latency stats
 * @param {{ emoji?: boolean, jitterThreshold?: number }} [opts]
 *   - emoji: include quality emoji (default true)
 *   - jitterThreshold: show jitter when it exceeds this fraction of median (default 0.5)
 * @returns {{ text: string, quality: string|null, emoji: string }} Formatted parts for flexible composition
 */
function formatQualitySummary(ms, stats, opts) {
  const useEmoji = opts?.emoji !== false;
  const jitterThreshold = opts?.jitterThreshold ?? 0.5;

  const latencyStr = formatLatency(ms);
  const source = resolveQualitySource(ms, stats);
  const quality = connectionQuality(source);
  const qualityEmoji = connectionQualityEmoji(quality);

  let text = latencyStr;
  if (quality) {
    text += useEmoji ? ` ${qualityEmoji}` : ` [${quality}]`;
  }

  // Append jitter when it exceeds threshold fraction of median
  if (stats && typeof stats.jitter === 'number' && typeof stats.median === 'number' && stats.median > 0) {
    if (stats.jitter > stats.median * jitterThreshold) {
      text += `, jitter ${formatLatency(stats.jitter)}`;
    }
  }

  return { text, quality, emoji: qualityEmoji };
}

module.exports = { formatLatency, connectionQuality, connectionQualityEmoji, resolveQualitySource, formatQualitySummary, QUALITY_THRESHOLDS };
