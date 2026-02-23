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

/**
 * Health assessment thresholds for computeHealthStatus / computeHealthReasons.
 * Single source of truth — avoids magic numbers scattered across utils.js and here.
 *
 * Exported so consumers (tests, docs, monitoring dashboards) can reference the
 * actual threshold values without duplicating them.
 */
const HEALTH_THRESHOLDS = Object.freeze({
  /** No WS message for longer than this → unhealthy (connection effectively dead). */
  STALE_UNHEALTHY_MS: 30000,
  /** No WS message for longer than this → degraded (likely transient hiccup). */
  STALE_DEGRADED_MS: 10000,
  /** Latency above this → unhealthy (barely functional). */
  LATENCY_UNHEALTHY_MS: 5000,
  /** Absolute jitter above this → degraded (unstable connection). */
  JITTER_DEGRADED_MS: 200,
  /** Jitter exceeding this fraction of median → degraded. */
  JITTER_MEDIAN_RATIO: 1.5,
  /** Connection success rate below this percentage → degraded. */
  SUCCESS_RATE_MIN_PCT: 80,
});

/**
 * Map a health status label to a colored emoji for at-a-glance visual feedback.
 * Complements connectionQualityEmoji (which is for latency quality) with a
 * parallel function for overall connection health.
 *
 * @param {"healthy"|"degraded"|"unhealthy"|string|null} status
 * @returns {string} Emoji (🟢/⚠️/🔴/⚪)
 */
function healthStatusEmoji(status) {
  switch (status) {
    case 'healthy':   return '🟢';
    case 'degraded':  return '⚠️';
    case 'unhealthy': return '🔴';
    default:          return '⚪';
  }
}

/**
 * Return human-readable reason strings explaining why health is degraded/unhealthy.
 * Mirrors the logic in computeHealthStatus() but collects all matching reasons
 * instead of short-circuiting on the first. Useful for tooltips and debug info.
 *
 * Returns an empty array when health is "healthy" (no issues detected).
 *
 * @param {object} params - Same parameters as computeHealthStatus
 * @returns {string[]} Array of reason strings (e.g. ["stale connection: 15s", "high jitter: 250ms"])
 */
function computeHealthReasons({ isConnected, isPollingPaused, lastMessageAt, latencyMs, latencyStats, connectionSuccessRate, now: nowOverride } = {}) {
  const reasons = [];
  if (!isConnected) {
    reasons.push('disconnected');
    return reasons;
  }
  const now = nowOverride ?? Date.now();

  if (!isPollingPaused && typeof lastMessageAt === 'number' && lastMessageAt > 0) {
    const staleMs = now - lastMessageAt;
    const staleSec = Math.round(staleMs / 1000);
    if (staleMs > HEALTH_THRESHOLDS.STALE_UNHEALTHY_MS) reasons.push(`stale connection: ${staleSec}s (dead)`);
    else if (staleMs > HEALTH_THRESHOLDS.STALE_DEGRADED_MS) reasons.push(`stale connection: ${staleSec}s`);
  }

  const source = resolveQualitySource(latencyMs, latencyStats);
  if (source !== null) {
    if (source > HEALTH_THRESHOLDS.LATENCY_UNHEALTHY_MS) reasons.push(`extreme latency: ${formatLatency(source)}`);
    else if (connectionQuality(source) === 'poor') reasons.push(`poor latency: ${formatLatency(source)}`);
  }

  if (latencyStats && typeof latencyStats.jitter === 'number' && typeof latencyStats.samples === 'number' && latencyStats.samples > 1) {
    if (latencyStats.jitter > HEALTH_THRESHOLDS.JITTER_DEGRADED_MS) reasons.push(`high jitter: ${formatLatency(latencyStats.jitter)}`);
    else if (typeof latencyStats.median === 'number' && latencyStats.median > 0 && latencyStats.jitter > latencyStats.median * HEALTH_THRESHOLDS.JITTER_MEDIAN_RATIO) {
      reasons.push(`high jitter: ${formatLatency(latencyStats.jitter)} (${Math.round(latencyStats.jitter / latencyStats.median * 100)}% of median)`);
    }
  }

  if (typeof connectionSuccessRate === 'number' && connectionSuccessRate < HEALTH_THRESHOLDS.SUCCESS_RATE_MIN_PCT) {
    reasons.push(`low success rate: ${connectionSuccessRate}%`);
  }

  return reasons;
}

/**
 * Canonical set of valid health status strings.
 * Single source of truth — consumed by parse-mode-update.cjs, utils.js, etc.
 */
const VALID_HEALTH_STATUSES = Object.freeze(['healthy', 'degraded', 'unhealthy']);

/**
 * Internal Set for O(1) health status validation lookups.
 * Mirrors the mode-emoji.cjs pattern (Set.has vs Array.includes).
 */
const _VALID_HEALTH_SET = new Set(VALID_HEALTH_STATUSES);

/**
 * Check whether a string is a recognized health status (case-sensitive).
 *
 * @param {*} value
 * @returns {boolean}
 */
function isValidHealth(value) {
  if (typeof value !== 'string') return false;
  return _VALID_HEALTH_SET.has(value);
}

/**
 * Compute an overall health status from connection metrics.
 * Single source of truth — mirrors the check order in computeHealthReasons()
 * but short-circuits on the first match for efficient status determination.
 *
 * @param {object} params
 * @param {boolean} params.isConnected
 * @param {boolean} [params.isPollingPaused]
 * @param {number|null} [params.lastMessageAt]
 * @param {number|null} [params.latencyMs]
 * @param {{ median?: number, jitter?: number, samples?: number }|null} [params.latencyStats]
 * @param {number|null} [params.connectionSuccessRate]
 * @param {number} [params.now]
 * @returns {"healthy"|"degraded"|"unhealthy"}
 */
function computeHealthStatus({ isConnected, isPollingPaused, lastMessageAt, latencyMs, latencyStats, connectionSuccessRate, now: nowOverride } = {}) {
  if (!isConnected) return 'unhealthy';
  const now = nowOverride ?? Date.now();

  // Stale connection check (no messages while polling is active).
  if (!isPollingPaused && typeof lastMessageAt === 'number' && lastMessageAt > 0) {
    const staleMs = now - lastMessageAt;
    if (staleMs > HEALTH_THRESHOLDS.STALE_UNHEALTHY_MS) return 'unhealthy';
    if (staleMs > HEALTH_THRESHOLDS.STALE_DEGRADED_MS) return 'degraded';
  }

  // Latency quality check.
  const source = resolveQualitySource(latencyMs, latencyStats);
  if (source !== null) {
    if (source > HEALTH_THRESHOLDS.LATENCY_UNHEALTHY_MS) return 'unhealthy';
    const quality = connectionQuality(source);
    if (quality === 'poor') return 'degraded';
  }

  // Jitter check: high jitter indicates an unstable connection even when median latency looks fine.
  if (latencyStats && typeof latencyStats.jitter === 'number' && typeof latencyStats.samples === 'number' && latencyStats.samples > 1) {
    if (latencyStats.jitter > HEALTH_THRESHOLDS.JITTER_DEGRADED_MS) return 'degraded';
    if (typeof latencyStats.median === 'number' && latencyStats.median > 0 && latencyStats.jitter > latencyStats.median * HEALTH_THRESHOLDS.JITTER_MEDIAN_RATIO) return 'degraded';
  }

  // Connection success rate check
  if (typeof connectionSuccessRate === 'number' && connectionSuccessRate < HEALTH_THRESHOLDS.SUCCESS_RATE_MIN_PCT) return 'degraded';

  return 'healthy';
}

/**
 * Build a compact health summary string: "emoji status (reason1; reason2)".
 * Consolidates the repeated pattern across buildTooltip, buildTrayTooltip,
 * and buildDebugInfo into a single reusable function.
 *
 * Returns null when health is "healthy" or not provided (nothing to display).
 *
 * @param {"healthy"|"degraded"|"unhealthy"|string|null} healthStatus
 * @param {object} reasonParams - Parameters for computeHealthReasons()
 * @returns {{ text: string, emoji: string, reasons: string[] }|null}
 */
function formatHealthSummary(healthStatus, reasonParams) {
  if (!healthStatus || healthStatus === 'healthy') return null;
  const emoji = healthStatusEmoji(healthStatus);
  const reasons = computeHealthReasons(reasonParams || {});
  const reasonsSuffix = reasons.length > 0 ? ` (${reasons.join('; ')})` : '';
  return {
    text: `${emoji} ${healthStatus}${reasonsSuffix}`,
    emoji,
    reasons,
  };
}

/**
 * Format active agent/tool counts as a compact summary string.
 * DRYs up the repeated pluralization pattern across buildTooltip,
 * buildTrayTooltip, and buildDebugInfo.
 *
 * @param {number} agents - Number of active agent sessions
 * @param {number} tools - Number of active in-flight tool calls
 * @returns {string} e.g. "2 agents, 1 tool" or "1 agent, 3 tools"
 */
function formatActiveSummary(agents, tools) {
  const agentStr = `${agents} agent${agents !== 1 ? 's' : ''}`;
  const toolStr = `${tools} tool${tools !== 1 ? 's' : ''}`;
  // Omit the zero-count part for a cleaner display when only agents or only tools are active.
  // Callers already guard against (0, 0), but handle it gracefully anyway.
  if (agents > 0 && tools <= 0) return agentStr;
  if (tools > 0 && agents <= 0) return toolStr;
  return `${agentStr}, ${toolStr}`;
}

module.exports = { formatLatency, connectionQuality, connectionQualityEmoji, resolveQualitySource, formatQualitySummary, QUALITY_THRESHOLDS, HEALTH_THRESHOLDS, healthStatusEmoji, computeHealthReasons, computeHealthStatus, VALID_HEALTH_STATUSES, isValidHealth, formatHealthSummary, formatActiveSummary };
