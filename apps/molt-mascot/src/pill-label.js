/**
 * Build the HUD pill label text and CSS class from current mascot state.
 *
 * Extracted from renderer.js for testability — the original syncPill() function
 * mixed DOM updates with label computation (~50 lines of mode→text mapping).
 * Now the label logic is a pure function: no DOM, no side effects.
 *
 * @module pill-label
 */

import { capitalize, truncate, formatDuration, MODE_DESCRIPTIONS, isSleepingMode } from './utils.js';

/**
 * Maximum pill label widths (in characters) per context.
 * Tuned for the fixed-width HUD pill overlay so labels don't overflow or wrap.
 * Named constants make limits easy to find, adjust, and test.
 */
export const PILL_MAX_ERROR_LEN = 48;
export const PILL_MAX_DISCONNECT_LEN = 40;
export const PILL_MAX_TOOL_LONG_LEN = 32;
export const PILL_MAX_TOOL_SHORT_LEN = 24;

/**
 * @typedef {Object} PillLabelResult
 * @property {string} label - Display text for the pill
 * @property {string} cssClass - CSS class name (e.g. 'pill--idle', 'pill--sleeping')
 * @property {string} effectiveMode - Resolved display mode (e.g. 'sleeping' instead of 'idle')
 * @property {string} ariaLive - 'assertive' for errors, 'polite' otherwise
 * @property {string} ariaLabel - Accessible description of the current state (from MODE_DESCRIPTIONS)
 */

/**
 * Compute the pill label, CSS class, and effective mode from current state.
 *
 * @param {object} params
 * @param {string} params.mode - Current mascot mode
 * @param {number} params.modeSince - Timestamp when mode started (epoch ms)
 * @param {number} params.sleepThresholdS - Seconds of idle before sleeping
 * @param {number|null} [params.connectedSince] - Timestamp of gateway connection (null if disconnected)
 * @param {string} [params.currentTool] - Active tool name
 * @param {string} [params.lastErrorMessage] - Error detail
 * @param {string} [params.lastCloseDetail] - WebSocket close reason
 * @param {boolean} [params.isClickThrough] - Ghost mode active
 * @param {number} [params.activeAgents] - Number of active agent sessions (shown when >1 in thinking/tool modes)
 * @param {number} [params.activeTools] - Number of in-flight tool calls (shown when >1 in tool mode)
 * @param {number} [params.reconnectAttempt] - Current reconnect attempt number (shown in connecting/disconnected modes)
 * @param {"healthy"|"degraded"|"unhealthy"|null} [params.healthStatus] - Connection health (shown as prefix when degraded/unhealthy)
 * @param {number} [params.sessionConnectCount] - Total successful handshakes since app launch (>1 means reconnection)
 * @param {"rising"|"falling"|"stable"|null} [params.latencyTrend] - Latency trend direction (shown as ↑/↓ when non-stable for proactive feedback)
 * @param {number} [params.now] - Current timestamp (defaults to Date.now())
 * @returns {PillLabelResult}
 */
export function buildPillLabel(params) {
  const {
    mode,
    modeSince,
    sleepThresholdS,
    connectedSince = null,
    currentTool = '',
    lastErrorMessage = '',
    lastCloseDetail = '',
    isClickThrough = false,
    activeAgents = 0,
    activeTools = 0,
    reconnectAttempt = 0,
    healthStatus = null,
    sessionConnectCount = 0,
    latencyTrend = null,
    now: nowOverride,
  } = params;

  const now = nowOverride ?? Date.now();
  const duration = Math.max(0, Math.round((now - modeSince) / 1000));
  const isSleeping = isSleepingMode(mode, duration * 1000, sleepThresholdS * 1000);

  let label = capitalize(mode);

  if (mode === 'connected') {
    label = sessionConnectCount > 1 ? 'Reconnected ✓' : 'Connected ✓';
  } else if (mode === 'idle' && !isSleeping && connectedSince) {
    const uptimeSec = Math.max(0, Math.round((now - connectedSince) / 1000));
    if (uptimeSec >= 60) {
      label = `Idle · ↑${formatDuration(uptimeSec)}`;
    }
  } else if (isSleeping) {
    label = `Sleeping ${formatDuration(duration)}`;
    if (connectedSince) {
      const uptimeSec = Math.max(0, Math.round((now - connectedSince) / 1000));
      if (uptimeSec >= 60) {
        label += ` · ↑${formatDuration(uptimeSec)}`;
      }
    }
  } else if (mode === 'connecting') {
    // Always show ellipsis for connecting mode (indicates ongoing activity).
    // After 2s, append elapsed time so the user sees the connection isn't stuck.
    if (duration > 2) {
      label = reconnectAttempt > 1
        ? `Connecting… ${formatDuration(duration)} #${reconnectAttempt}`
        : `Connecting… ${formatDuration(duration)}`;
    } else {
      label = reconnectAttempt > 1
        ? `Connecting… #${reconnectAttempt}`
        : 'Connecting…';
    }
  } else if (mode === 'disconnected') {
    const retrySuffix = reconnectAttempt > 0 ? ` #${reconnectAttempt}` : '';
    label = lastCloseDetail
      ? truncate(`Disconnected: ${lastCloseDetail}`, PILL_MAX_DISCONNECT_LEN - retrySuffix.length) + retrySuffix
      : `Disconnected ${formatDuration(duration)}${retrySuffix}`;
  } else if (mode === 'thinking') {
    if (duration > 2) {
      label = activeAgents > 1
        ? `Thinking ${formatDuration(duration)} · ${activeAgents}`
        : `Thinking ${formatDuration(duration)}`;
    } else if (activeAgents > 1) {
      label = `Thinking · ${activeAgents}`;
    }
  } else if (mode === 'tool') {
    const toolSuffix = activeTools > 1 ? ` · ${activeTools}` : '';
    if (currentTool) {
      label = duration > 2
        ? truncate(`${currentTool} ${formatDuration(duration)}`, PILL_MAX_TOOL_LONG_LEN - toolSuffix.length) + toolSuffix
        : truncate(currentTool, PILL_MAX_TOOL_SHORT_LEN - toolSuffix.length) + toolSuffix;
    } else {
      label = duration > 2
        ? `Tool ${formatDuration(duration)}${toolSuffix}`
        : `Tool${toolSuffix}`;
    }
  } else if (mode === 'error' && lastErrorMessage) {
    label = truncate(lastErrorMessage, PILL_MAX_ERROR_LEN);
  }

  // Surface degraded/unhealthy connection status directly in the pill
  // so the user sees it without hovering. "healthy" is omitted to avoid clutter.
  if (healthStatus === 'unhealthy' && mode !== 'disconnected' && mode !== 'error') {
    label += ' 🔴';
  } else if (healthStatus === 'degraded' && mode !== 'error') {
    label += ' ⚠️';
  }

  // Append latency trend indicator when actively rising or falling.
  // "stable" is omitted to avoid pill clutter; parity with tray tooltip and context-menu.
  if (typeof latencyTrend === 'string' && latencyTrend !== 'stable' && mode !== 'disconnected' && mode !== 'error') {
    label += latencyTrend === 'rising' ? ' ↑' : ' ↓';
  }

  if (isClickThrough) {
    label += ' 👻';
  }

  const cssClass = isSleeping ? 'pill--sleeping' : `pill--${mode}`;
  const effectiveMode = isSleeping ? 'sleeping' : mode;
  const ariaLive = mode === 'error' ? 'assertive' : 'polite';
  const ariaLabel = MODE_DESCRIPTIONS[effectiveMode] || `Mascot is ${effectiveMode}`;

  return { label, cssClass, effectiveMode, ariaLive, ariaLabel };
}
