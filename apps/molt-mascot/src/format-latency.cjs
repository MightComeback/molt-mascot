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
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "–";
  if (ms < 1) return "< 1ms";
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
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < QUALITY_THRESHOLDS.EXCELLENT_MAX_MS) return "excellent";
  if (ms < QUALITY_THRESHOLDS.GOOD_MAX_MS) return "good";
  if (ms < QUALITY_THRESHOLDS.FAIR_MAX_MS) return "fair";
  return "poor";
}

/**
 * Canonical set of valid connection quality strings.
 * Single source of truth — mirrors VALID_HEALTH_STATUSES, VALID_LATENCY_TRENDS
 * for consistent enum-style validation across the codebase.
 */
const VALID_CONNECTION_QUALITIES = Object.freeze([
  "excellent",
  "good",
  "fair",
  "poor",
]);

/** @internal O(1) lookup set for isValidConnectionQuality(). */
const _VALID_QUALITY_SET = new Set(VALID_CONNECTION_QUALITIES);

/**
 * Check whether a string is a recognized connection quality label (case-sensitive).
 * O(1) via Set lookup. Parity with isValidHealth, isValidLatencyTrend, etc.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isValidConnectionQuality(value) {
  if (typeof value !== "string") return false;
  return _VALID_QUALITY_SET.has(value);
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
    case "excellent":
      return "🟢";
    case "good":
      return "🟡";
    case "fair":
      return "🟠";
    case "poor":
      return "🔴";
    default:
      return "⚪";
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
  const hasStats =
    stats &&
    typeof stats.median === "number" &&
    typeof stats.samples === "number" &&
    stats.samples > 1;
  if (hasStats) return stats.median;
  if (
    typeof instantMs === "number" &&
    Number.isFinite(instantMs) &&
    instantMs >= 0
  )
    return instantMs;
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
  if (
    stats &&
    typeof stats.jitter === "number" &&
    typeof stats.median === "number" &&
    stats.median > 0
  ) {
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
    case "healthy":
      return "🟢";
    case "degraded":
      return "⚠️";
    case "unhealthy":
      return "🔴";
    default:
      return "⚪";
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
function computeHealthReasons({
  isConnected,
  isPollingPaused,
  lastMessageAt,
  latencyMs,
  latencyStats,
  connectionSuccessRate,
  now: nowOverride,
} = {}) {
  const reasons = [];
  if (!isConnected) {
    reasons.push("disconnected");
    return reasons;
  }
  const now = nowOverride ?? Date.now();

  if (
    !isPollingPaused &&
    typeof lastMessageAt === "number" &&
    lastMessageAt > 0
  ) {
    const staleMs = now - lastMessageAt;
    const staleSec = Math.round(staleMs / 1000);
    if (staleMs > HEALTH_THRESHOLDS.STALE_UNHEALTHY_MS)
      reasons.push(`stale connection: ${staleSec}s (dead)`);
    else if (staleMs > HEALTH_THRESHOLDS.STALE_DEGRADED_MS)
      reasons.push(`stale connection: ${staleSec}s`);
  }

  const source = resolveQualitySource(latencyMs, latencyStats);
  if (source !== null) {
    if (source > HEALTH_THRESHOLDS.LATENCY_UNHEALTHY_MS)
      reasons.push(`extreme latency: ${formatLatency(source)}`);
    else if (connectionQuality(source) === "poor")
      reasons.push(`poor latency: ${formatLatency(source)}`);
  }

  if (
    latencyStats &&
    typeof latencyStats.jitter === "number" &&
    typeof latencyStats.samples === "number" &&
    latencyStats.samples > 1
  ) {
    if (latencyStats.jitter > HEALTH_THRESHOLDS.JITTER_DEGRADED_MS)
      reasons.push(`high jitter: ${formatLatency(latencyStats.jitter)}`);
    else if (
      typeof latencyStats.median === "number" &&
      latencyStats.median > 0 &&
      latencyStats.jitter >
        latencyStats.median * HEALTH_THRESHOLDS.JITTER_MEDIAN_RATIO
    ) {
      reasons.push(
        `high jitter: ${formatLatency(latencyStats.jitter)} (${Math.round((latencyStats.jitter / latencyStats.median) * 100)}% of median)`,
      );
    }
  }

  if (
    typeof connectionSuccessRate === "number" &&
    connectionSuccessRate < HEALTH_THRESHOLDS.SUCCESS_RATE_MIN_PCT
  ) {
    reasons.push(`low success rate: ${connectionSuccessRate}%`);
  }

  return reasons;
}

/**
 * Canonical set of valid health status strings.
 * Single source of truth — consumed by parse-mode-update.cjs, utils.js, etc.
 */
const VALID_HEALTH_STATUSES = Object.freeze([
  "healthy",
  "degraded",
  "unhealthy",
]);

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
  if (typeof value !== "string") return false;
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
function computeHealthStatus({
  isConnected,
  isPollingPaused,
  lastMessageAt,
  latencyMs,
  latencyStats,
  connectionSuccessRate,
  now: nowOverride,
} = {}) {
  if (!isConnected) return "unhealthy";
  const now = nowOverride ?? Date.now();

  // Stale connection check (no messages while polling is active).
  if (
    !isPollingPaused &&
    typeof lastMessageAt === "number" &&
    lastMessageAt > 0
  ) {
    const staleMs = now - lastMessageAt;
    if (staleMs > HEALTH_THRESHOLDS.STALE_UNHEALTHY_MS) return "unhealthy";
    if (staleMs > HEALTH_THRESHOLDS.STALE_DEGRADED_MS) return "degraded";
  }

  // Latency quality check.
  const source = resolveQualitySource(latencyMs, latencyStats);
  if (source !== null) {
    if (source > HEALTH_THRESHOLDS.LATENCY_UNHEALTHY_MS) return "unhealthy";
    const quality = connectionQuality(source);
    if (quality === "poor") return "degraded";
  }

  // Jitter check: high jitter indicates an unstable connection even when median latency looks fine.
  if (
    latencyStats &&
    typeof latencyStats.jitter === "number" &&
    typeof latencyStats.samples === "number" &&
    latencyStats.samples > 1
  ) {
    if (latencyStats.jitter > HEALTH_THRESHOLDS.JITTER_DEGRADED_MS)
      return "degraded";
    if (
      typeof latencyStats.median === "number" &&
      latencyStats.median > 0 &&
      latencyStats.jitter >
        latencyStats.median * HEALTH_THRESHOLDS.JITTER_MEDIAN_RATIO
    )
      return "degraded";
  }

  // Connection success rate check
  if (
    typeof connectionSuccessRate === "number" &&
    connectionSuccessRate < HEALTH_THRESHOLDS.SUCCESS_RATE_MIN_PCT
  )
    return "degraded";

  return "healthy";
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
  if (!healthStatus || healthStatus === "healthy") return null;
  const emoji = healthStatusEmoji(healthStatus);
  const reasons = computeHealthReasons(reasonParams || {});
  const reasonsSuffix = reasons.length > 0 ? ` (${reasons.join("; ")})` : "";
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
  const agentStr = `${agents} agent${agents !== 1 ? "s" : ""}`;
  const toolStr = `${tools} tool${tools !== 1 ? "s" : ""}`;
  // Omit the zero-count part for a cleaner display when only agents or only tools are active.
  // Callers already guard against (0, 0), but handle it gracefully anyway.
  if (agents > 0 && tools <= 0) return agentStr;
  if (tools > 0 && agents <= 0) return toolStr;
  return `${agentStr}, ${toolStr}`;
}

/**
 * Format a protocol version range as a compact human-readable string.
 * Shows "v2" when min === max, "v2–v3" when they differ.
 * Single source of truth — used by debug-info.js and status-cli.cjs.
 *
 * @param {number} min - Minimum protocol version
 * @param {number} max - Maximum protocol version
 * @returns {string}
 */
function formatProtocolRange(min, max) {
  // Coerce to integers; fallback to "v?" for non-numeric/non-finite inputs.
  const lo =
    typeof min === "number" && Number.isFinite(min) ? Math.floor(min) : null;
  const hi =
    typeof max === "number" && Number.isFinite(max) ? Math.floor(max) : null;
  if (lo === null && hi === null) return "v?";
  if (lo === null) return `v${hi}`;
  if (hi === null) return `v${lo}`;
  // Swap if inverted so the display always reads low–high.
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  if (a === b) return `v${a}`;
  return `v${a}–v${b}`;
}

/**
 * Compute a connection success rate as an integer percentage (0-100).
 * Centralizes the repeated `Math.round((connects / attempts) * 100)` pattern
 * used across tray-icon.cjs, renderer.js, and gateway-client.js.
 *
 * @param {number} connects - Number of successful connections
 * @param {number} attempts - Total connection attempts
 * @returns {number|null} Integer percentage (0-100), or null if no attempts
 */
function computeConnectionSuccessRate(connects, attempts) {
  if (
    typeof attempts !== "number" ||
    !Number.isFinite(attempts) ||
    attempts <= 0
  )
    return null;
  if (typeof connects !== "number" || !Number.isFinite(connects)) return null;
  const clamped = Math.max(0, Math.min(connects, attempts));
  return Math.round((clamped / attempts) * 100);
}

/**
 * Approximate connection uptime as a percentage of total process lifetime.
 * Single source of truth — previously duplicated in utils.js (ESM) and
 * inline in electron-main.cjs. Now both import from here.
 *
 * Returns null when insufficient data is available (no first connection,
 * or process uptime is zero/negative).
 *
 * @param {object} params
 * @param {number} params.processUptimeS - Process uptime in seconds
 * @param {number|null} params.firstConnectedAt - Epoch ms of first successful handshake
 * @param {number|null} params.connectedSince - Epoch ms of current connection (null if disconnected)
 * @param {number|null} params.lastDisconnectedAt - Epoch ms of last disconnect
 * @param {number} params.now - Current timestamp in epoch ms
 * @returns {number|null} Integer percentage (0-100), or null if not computable
 */
function connectionUptimePercent({
  processUptimeS,
  firstConnectedAt,
  connectedSince,
  lastDisconnectedAt,
  now,
}) {
  if (typeof processUptimeS !== "number" || processUptimeS <= 0) return null;
  if (typeof firstConnectedAt !== "number" || firstConnectedAt <= 0)
    return null;
  if (typeof now !== "number" || !Number.isFinite(now)) return null;

  const timeSinceFirstConnect = now - firstConnectedAt;
  // Clock skew guard: if firstConnectedAt is in the future, we can't compute a meaningful percentage.
  if (timeSinceFirstConnect < 0) return null;
  const currentDisconnectGap = connectedSince
    ? 0
    : lastDisconnectedAt
      ? now - lastDisconnectedAt
      : 0;
  const approxConnectedMs = Math.max(
    0,
    timeSinceFirstConnect - currentDisconnectGap,
  );
  return Math.min(
    100,
    Math.round((approxConnectedMs / (processUptimeS * 1000)) * 100),
  );
}

/**
 * Canonical set of valid latency trend direction strings.
 * Single source of truth — consumed by parse-mode-update.cjs, utils.js, etc.
 * Mirrors VALID_HEALTH_STATUSES for consistency.
 */
const VALID_LATENCY_TRENDS = Object.freeze(["rising", "falling", "stable"]);

/**
 * Internal Set for O(1) latency trend validation lookups.
 * Mirrors the _VALID_HEALTH_SET pattern.
 */
const _VALID_TREND_SET = new Set(VALID_LATENCY_TRENDS);

/**
 * Check whether a string is a recognized latency trend direction (case-sensitive).
 *
 * @param {*} value
 * @returns {boolean}
 */
function isValidLatencyTrend(value) {
  if (typeof value !== "string") return false;
  return _VALID_TREND_SET.has(value);
}

/**
 * Convert a latency trend direction to a compact arrow string for display.
 * Returns "" for "stable" or invalid values (callers typically skip display
 * when stable, so this centralizes the repeated ternary pattern).
 *
 * @param {"rising"|"falling"|"stable"|string|null|undefined} trend
 * @returns {string} " ↑", " ↓", or ""
 */
function formatLatencyTrendArrow(trend) {
  if (trend === "rising") return " ↑";
  if (trend === "falling") return " ↓";
  return "";
}

/**
 * Format a latency value with an inline connection quality emoji.
 * Combines formatLatency + resolveQualitySource + connectionQuality + connectionQualityEmoji
 * into a single call — DRYs up the 4-step pattern repeated in pill-label.js,
 * context-menu-items.js, debug-info.js, and tray-icon.cjs.
 *
 * Returns just the formatted latency when quality cannot be determined.
 *
 * @param {number} ms - Instant latency in milliseconds
 * @param {{ median?: number, samples?: number }|null|undefined} [stats] - Rolling latency stats (median preferred when available)
 * @returns {string} e.g. "42ms 🟢" or "1.2s 🔴" or "– ⚪"
 */
function formatLatencyWithQuality(ms, stats) {
  const latencyStr = formatLatency(ms);
  const source = resolveQualitySource(ms, stats);
  const quality = connectionQuality(source);
  if (!quality) return latencyStr;
  return `${latencyStr} ${connectionQualityEmoji(quality)}`;
}

/**
 * Format a reconnect count as a compact "↻N" string.
 * Returns "" when sessionConnectCount indicates no reconnections (≤1).
 *
 * DRYs up the repeated `↻${sessionConnectCount - 1}` pattern used across
 * context-menu-items, debug-info, tray-icon, gateway-client, and parse-mode-update.
 *
 * @param {number|null|undefined} sessionConnectCount - Total successful handshakes since app launch
 * @returns {string} e.g. "↻3" or "" (empty when no reconnections)
 */
function formatReconnectCount(sessionConnectCount) {
  if (
    typeof sessionConnectCount !== "number" ||
    !Number.isFinite(sessionConnectCount) ||
    sessionConnectCount <= 1
  )
    return "";
  return `↻${sessionConnectCount - 1}`;
}

/**
 * Format an array of latency samples into a compact ping-statistics summary.
 * Computes min/max/avg/median/jitter from raw samples and formats as either
 * a human-readable multi-line string or a compact JSON-serializable object.
 *
 * Extracted from ws-dump.ts for testability — the original inline computation
 * duplicated the same sort/median/jitter logic that the latency-tracker uses.
 *
 * @param {number[]} samples - Array of round-trip latency values in ms
 * @param {{ compact?: boolean }} [opts] - Output format options
 * @returns {{ text: string, stats: { count: number, min: number, max: number, avg: number, median: number, jitter: number } } | null}
 *   Returns null if samples is empty or invalid.
 */
function formatPingSummary(samples, opts = {}) {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  const valid = samples.filter(
    (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
  );
  if (valid.length === 0) return null;

  const sorted = valid.slice().sort((a, b) => a - b);
  const count = sorted.length;
  const min = sorted[0];
  const max = sorted[count - 1];
  const avg =
    Math.round((sorted.reduce((s, v) => s + v, 0) / count) * 100) / 100;
  const mid = Math.floor(count / 2);
  const median =
    count % 2 === 0
      ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100
      : sorted[mid];
  const jitter =
    count > 1
      ? Math.round(
          Math.sqrt(sorted.reduce((s, v) => s + (v - avg) ** 2, 0) / count) *
            100,
        ) / 100
      : 0;

  // Percentiles: p95 and p99 use nearest-rank method (same as latency tracker).
  // Only included when there are enough samples for the percentile to be meaningful
  // (p95 needs ≥2 samples so the index differs from max; p99 needs ≥10).
  const p95 = count >= 2 ? sorted[Math.ceil(count * 0.95) - 1] : null;
  const p99 = count >= 10 ? sorted[Math.ceil(count * 0.99) - 1] : null;

  const stats = { count, min, max, avg, median, jitter };
  if (p95 !== null) stats.p95 = p95;
  if (p99 !== null) stats.p99 = p99;

  const p95Str = p95 !== null ? ` p95=${p95}ms` : "";
  const p99Str = p99 !== null ? ` p99=${p99}ms` : "";
  const text = opts.compact
    ? JSON.stringify(stats)
    : `\n--- ping statistics ---\n${count} pings: min=${min}ms avg=${avg}ms median=${median}ms max=${max}ms${p95Str}${p99Str} jitter=${jitter}ms`;

  return { text, stats };
}

/**
 * Format process uptime with an optional "since <timestamp>" suffix.
 * DRYs up the repeated pattern in debug-info.js, tray-icon.cjs, and status-cli.cjs:
 *   `formatDuration(Math.round(processUptimeS)) + (startedAt ? ` (since ...)` : "")`
 *
 * @param {number} uptimeS - Process uptime in seconds
 * @param {number|null|undefined} [startedAt] - Epoch ms when the process started
 * @param {{ formatTimestamp?: (ts: number) => string }} [opts] - Custom timestamp formatter
 * @returns {string|null} e.g. "2h 15m (since 14:30:00)" or "45s", or null if uptimeS is invalid
 */
function formatProcessUptime(uptimeS, startedAt, opts) {
  if (typeof uptimeS !== "number" || !Number.isFinite(uptimeS) || uptimeS < 0)
    return null;
  const { formatDuration } = require("@molt/mascot-plugin");
  const base = formatDuration(Math.round(uptimeS));
  if (
    typeof startedAt !== "number" ||
    !Number.isFinite(startedAt) ||
    startedAt <= 0
  )
    return base;
  const fmt = opts?.formatTimestamp;
  if (typeof fmt === "function") return `${base} (since ${fmt(startedAt)})`;
  // Default: ISO-like short format (HH:MM:SS)
  const d = new Date(startedAt);
  const pad = (n) => String(n).padStart(2, "0");
  const ts = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${base} (since ${ts})`;
}

/**
 * Check whether a value is a valid integer percentage (0-100 inclusive).
 * DRYs the repeated `nonNegInt(v) !== null && v <= 100` check used for
 * connectionSuccessRate and connectionUptimePct validation in parse-mode-update.cjs.
 *
 * Mirrors isValidHealth, isValidLatencyTrend, isValidConnectionQuality for
 * consistent validation API across the codebase.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isValidIntegerPercentage(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 100
  );
}

/**
 * Build compact connection reliability suffix parts from success rate and uptime percentage.
 * Returns an array of strings like ["95% ok", "87% connected"] — only includes parts
 * where the value is below 100% (perfect reliability is omitted to reduce noise).
 *
 * DRYs up the repeated conditional formatting of connectionSuccessRate and
 * connectionUptimePct used across buildTooltip, buildTrayTooltip,
 * buildContextMenuItems, and buildDebugInfo.
 *
 * @param {number|null|undefined} connectionSuccessRate - Integer percentage (0-100), or null
 * @param {number|null|undefined} connectionUptimePct - Integer percentage (0-100), or null
 * @returns {string[]} Array of formatted parts (may be empty if both are 100% or null)
 */
function formatConnectionReliability(
  connectionSuccessRate,
  connectionUptimePct,
) {
  const parts = [];
  if (
    typeof connectionSuccessRate === "number" &&
    connectionSuccessRate >= 0 &&
    connectionSuccessRate < 100
  ) {
    parts.push(`${connectionSuccessRate}% ok`);
  }
  if (
    typeof connectionUptimePct === "number" &&
    connectionUptimePct >= 0 &&
    connectionUptimePct < 100
  ) {
    parts.push(`${connectionUptimePct}% connected`);
  }
  return parts;
}

/**
 * Format tool call throughput as a compact "X.Y/min" string.
 * Returns null when there isn't enough data for a meaningful rate
 * (fewer than 60 seconds of uptime or zero calls).
 *
 * DRYs up the inline `(calls / uptimeSec) * 60).toFixed(1)/min` pattern
 * used in debug-info.js and available for context-menu / tray tooltip.
 *
 * @param {number} toolCalls - Total tool calls since plugin start
 * @param {number} uptimeMs - Plugin uptime in milliseconds
 * @param {{ minUptimeMs?: number }} [opts] - Minimum uptime before reporting (default 60000ms)
 * @returns {string|null} e.g. "3.2/min", or null if insufficient data
 */
function formatToolThroughput(toolCalls, uptimeMs, opts) {
  const minUptime = opts?.minUptimeMs ?? 60000;
  if (
    typeof toolCalls !== "number" ||
    typeof uptimeMs !== "number" ||
    !Number.isFinite(toolCalls) ||
    !Number.isFinite(uptimeMs)
  )
    return null;
  if (toolCalls <= 0 || uptimeMs < minUptime) return null;
  const perMin = (toolCalls / (uptimeMs / 1000)) * 60;
  return `${perMin.toFixed(1)}/min`;
}

/**
 * Format tool call count and error rate as a compact summary string.
 * DRYs up the repeated "N calls, M errors (X% ok)" pattern used across
 * buildTooltip, buildTrayTooltip, buildContextMenuItems, and buildDebugInfo.
 *
 * Returns null when there are no calls to report (toolCalls <= 0).
 *
 * @param {number} toolCalls - Total tool invocations
 * @param {number} toolErrors - Total tool errors
 * @returns {string|null} e.g. "1.5K calls, 3 errors (99% ok)" or "42 calls", or null
 */
function formatToolCallsSummary(toolCalls, toolErrors) {
  if (
    typeof toolCalls !== "number" ||
    !Number.isFinite(toolCalls) ||
    toolCalls <= 0
  )
    return null;
  const {
    formatCount,
    successRate: _successRate,
  } = require("@molt/mascot-plugin");
  const errors =
    typeof toolErrors === "number" &&
    Number.isFinite(toolErrors) &&
    toolErrors > 0
      ? toolErrors
      : 0;
  if (errors > 0) {
    const rate = _successRate(toolCalls, errors);
    return `${formatCount(toolCalls)} calls, ${formatCount(errors)} err (${rate}% ok)`;
  }
  return `${formatCount(toolCalls)} calls`;
}

module.exports = {
  formatLatency,
  connectionQuality,
  connectionQualityEmoji,
  VALID_CONNECTION_QUALITIES,
  isValidConnectionQuality,
  resolveQualitySource,
  formatQualitySummary,
  formatLatencyWithQuality,
  QUALITY_THRESHOLDS,
  HEALTH_THRESHOLDS,
  healthStatusEmoji,
  computeHealthReasons,
  computeHealthStatus,
  VALID_HEALTH_STATUSES,
  isValidHealth,
  VALID_LATENCY_TRENDS,
  isValidLatencyTrend,
  formatHealthSummary,
  formatActiveSummary,
  formatProtocolRange,
  computeConnectionSuccessRate,
  connectionUptimePercent,
  formatLatencyTrendArrow,
  formatReconnectCount,
  formatConnectionReliability,
  formatPingSummary,
  formatProcessUptime,
  formatToolThroughput,
  formatToolCallsSummary,
  isValidIntegerPercentage,
};
