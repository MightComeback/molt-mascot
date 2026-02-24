/**
 * Parse and validate mode-update IPC payloads from the renderer.
 *
 * Extracted from electron-main.cjs for testability — the original handler
 * did field-by-field type checking and coercion inline (~80 lines), making
 * it impossible to unit-test without spinning up Electron.
 *
 * This module is a pure function: no side effects, no IPC, no state.
 *
 * @module parse-mode-update
 */

/**
 * @typedef {Object} ParsedModeUpdate
 * @property {string|null} mode - Validated mode string, or null if absent/invalid
 * @property {number|null} latencyMs - Non-negative latency in ms, or null
 * @property {string|null} tool - Active tool name, or null
 * @property {string|null} errorMessage - Error detail, or null
 * @property {number|null} toolCalls - Non-negative integer, or null
 * @property {number|null} toolErrors - Non-negative integer, or null
 * @property {number|null} sessionConnectCount - Non-negative integer, or null
 * @property {number|null} sessionAttemptCount - Non-negative integer, or null
 * @property {string|null} closeDetail - Close reason string, or null
 * @property {number|null} reconnectAttempt - Non-negative integer, or null
 * @property {string|null} targetUrl - Gateway URL string, or null
 * @property {number|null} activeAgents - Non-negative integer, or null
 * @property {number|null} activeTools - Non-negative integer, or null
 * @property {string|null} pluginVersion - Version string, or null
 * @property {number|null} lastMessageAt - Positive epoch ms, or null
 * @property {Object|null} latencyStats - Stats object with numeric samples, or null
 * @property {number|null} pluginStartedAt - Positive epoch ms, or null
 * @property {number|null} lastResetAt - Positive epoch ms, or null
 * @property {"healthy"|"degraded"|"unhealthy"|null} healthStatus - At-a-glance health assessment, or null
 * @property {number|null} connectionSuccessRate - Integer percentage (0-100), or null
 * @property {"rising"|"falling"|"stable"|null} latencyTrend - Latency trend direction, or null
 */

/**
 * Coerce a value to a non-negative number, or return null.
 * @param {*} v
 * @returns {number|null}
 */
function nonNegNum(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return v;
}

/**
 * Coerce a value to a non-negative integer, or return null.
 * @param {*} v
 * @returns {number|null}
 */
function nonNegInt(v) {
  const n = nonNegNum(v);
  if (n === null) return null;
  return Number.isInteger(n) ? n : null;
}

/**
 * Coerce a value to a positive epoch ms, or return null.
 * @param {*} v
 * @returns {number|null}
 */
function posEpoch(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  return v;
}

/**
 * Validate a health status string against the known set of values.
 * @param {*} v
 * @returns {"healthy"|"degraded"|"unhealthy"|null}
 */
const { isValidMode } = require('./mode-emoji.cjs');
const { VALID_HEALTH_STATUSES, isValidHealth } = require('./format-latency.cjs');

// Re-export for back-compat (consumers may import VALID_HEALTH from here).
const VALID_HEALTH = VALID_HEALTH_STATUSES;

function validHealthStatus(v) {
  if (typeof v !== 'string') return null;
  return isValidHealth(v) ? v : null;
}

/**
 * Valid latency trend values.
 * @type {Set<string>}
 */
const VALID_LATENCY_TRENDS = new Set(['rising', 'falling', 'stable']);

/**
 * Validate a latency trend string.
 * @param {*} v
 * @returns {"rising"|"falling"|"stable"|null}
 */
function validLatencyTrend(v) {
  if (typeof v !== 'string') return null;
  return VALID_LATENCY_TRENDS.has(v) ? v : null;
}

/**
 * Validate a mode string against the canonical set of known modes.
 * Returns the mode if valid, null otherwise.
 * @param {*} v
 * @returns {string|null}
 */
function validMode(v) {
  if (typeof v !== 'string') return null;
  return isValidMode(v) ? v : null;
}

/**
 * Coerce a value to a non-empty string, or return null.
 * @param {*} v
 * @returns {string|null}
 */
function nonEmptyStr(v) {
  if (typeof v !== 'string' || !v) return null;
  return v;
}

/**
 * Parse a raw mode-update IPC payload into a validated, normalized object.
 *
 * All fields are optional and independently validated — a single invalid
 * field doesn't affect the rest. Fields that fail validation are returned
 * as null, allowing the consumer to selectively apply only the valid parts.
 *
 * @param {*} raw - The IPC payload (expected to be an object, but handles anything)
 * @returns {ParsedModeUpdate}
 */
function parseModeUpdate(raw) {
  const update = (raw && typeof raw === 'object') ? raw : {};

  return {
    mode: validMode(update.mode),
    latencyMs: nonNegNum(update.latencyMs ?? update.latency),
    tool: nonEmptyStr(update.tool),
    errorMessage: nonEmptyStr(update.errorMessage),
    toolCalls: nonNegInt(update.toolCalls),
    toolErrors: nonNegInt(update.toolErrors),
    sessionConnectCount: nonNegInt(update.sessionConnectCount),
    sessionAttemptCount: nonNegInt(update.sessionAttemptCount),
    closeDetail: nonEmptyStr(update.closeDetail),
    reconnectAttempt: nonNegInt(update.reconnectAttempt),
    targetUrl: nonEmptyStr(update.targetUrl),
    activeAgents: nonNegInt(update.activeAgents),
    activeTools: nonNegInt(update.activeTools),
    pluginVersion: nonEmptyStr(update.pluginVersion),
    lastMessageAt: posEpoch(update.lastMessageAt),
    latencyStats: (update.latencyStats && typeof update.latencyStats === 'object' && typeof update.latencyStats.samples === 'number')
      ? update.latencyStats
      : null,
    pluginStartedAt: posEpoch(update.pluginStartedAt),
    lastResetAt: posEpoch(update.lastResetAt),
    healthStatus: validHealthStatus(update.healthStatus),
    connectionSuccessRate: (() => {
      const n = nonNegInt(update.connectionSuccessRate);
      if (n === null) return null;
      return n <= 100 ? n : null;
    })(),
    latencyTrend: validLatencyTrend(update.latencyTrend),
  };
}

/**
 * Format a parsed mode-update into a compact diagnostic one-liner.
 * Useful for logging IPC payloads without manual field plucking.
 *
 * Only includes non-null fields for brevity. Mirrors the toString() pattern
 * used across other modules (LatencyTracker, FpsCounter, GatewayClient, etc.).
 *
 * @param {ParsedModeUpdate} parsed - Output from parseModeUpdate()
 * @returns {string} e.g. "ModeUpdate<thinking, 42ms, tool=exec, 🟢 healthy>"
 */
function formatModeUpdate(parsed) {
  if (!parsed || typeof parsed !== 'object') return 'ModeUpdate<invalid>';

  const parts = [];

  if (parsed.mode) parts.push(parsed.mode);
  if (parsed.latencyMs !== null) parts.push(`${Math.round(parsed.latencyMs)}ms`);
  if (parsed.tool) parts.push(`tool=${parsed.tool}`);
  if (parsed.errorMessage) parts.push(`err="${parsed.errorMessage}"`);
  if (parsed.activeAgents !== null && parsed.activeAgents > 0) parts.push(`agents=${parsed.activeAgents}`);
  if (parsed.activeTools !== null && parsed.activeTools > 0) parts.push(`tools=${parsed.activeTools}`);
  if (parsed.reconnectAttempt !== null && parsed.reconnectAttempt > 0) parts.push(`retry #${parsed.reconnectAttempt}`);
  if (parsed.closeDetail) parts.push(`close="${parsed.closeDetail}"`);
  if (parsed.targetUrl) parts.push(`→ ${parsed.targetUrl}`);
  if (parsed.connectionSuccessRate !== null && parsed.connectionSuccessRate < 100) parts.push(`${parsed.connectionSuccessRate}% ok`);
  if (parsed.healthStatus && parsed.healthStatus !== 'healthy') {
    const emoji = parsed.healthStatus === 'degraded' ? '⚠️' : '🔴';
    parts.push(`${emoji} ${parsed.healthStatus}`);
  }
  if (parsed.latencyTrend && parsed.latencyTrend !== 'stable') {
    parts.push(parsed.latencyTrend === 'rising' ? '↑' : '↓');
  }
  if (parsed.pluginVersion) parts.push(`v${parsed.pluginVersion}`);

  if (parts.length === 0) return 'ModeUpdate<empty>';
  return `ModeUpdate<${parts.join(', ')}>`;
}

module.exports = { parseModeUpdate, formatModeUpdate, nonNegNum, nonNegInt, posEpoch, nonEmptyStr, validMode, validHealthStatus, validLatencyTrend, VALID_HEALTH, VALID_LATENCY_TRENDS };
