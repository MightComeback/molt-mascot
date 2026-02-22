/**
 * Build the HUD pill label text and CSS class from current mascot state.
 *
 * Extracted from renderer.js for testability — the original syncPill() function
 * mixed DOM updates with label computation (~50 lines of mode→text mapping).
 * Now the label logic is a pure function: no DOM, no side effects.
 *
 * @module pill-label
 */

import { capitalize, truncate, formatDuration } from './utils.js';

/**
 * @typedef {Object} PillLabelResult
 * @property {string} label - Display text for the pill
 * @property {string} cssClass - CSS class name (e.g. 'pill--idle', 'pill--sleeping')
 * @property {string} effectiveMode - Resolved display mode (e.g. 'sleeping' instead of 'idle')
 * @property {string} ariaLive - 'assertive' for errors, 'polite' otherwise
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
    now: nowOverride,
  } = params;

  const now = nowOverride ?? Date.now();
  const duration = Math.max(0, Math.round((now - modeSince) / 1000));
  const isSleeping = mode === 'idle' && duration > sleepThresholdS;

  let label = capitalize(mode);

  if (mode === 'connected') {
    label = 'Connected ✓';
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
  } else if (mode === 'connecting' && duration > 2) {
    label = `Connecting… ${formatDuration(duration)}`;
  } else if (mode === 'disconnected') {
    label = lastCloseDetail
      ? truncate(`Disconnected: ${lastCloseDetail}`, 40)
      : `Disconnected ${formatDuration(duration)}`;
  } else if (mode === 'thinking' && duration > 2) {
    label = `Thinking ${formatDuration(duration)}`;
  } else if (mode === 'tool' && currentTool) {
    label = duration > 2
      ? truncate(`${currentTool} ${formatDuration(duration)}`, 32)
      : truncate(currentTool, 24);
  } else if (mode === 'error' && lastErrorMessage) {
    label = truncate(lastErrorMessage, 48);
  }

  if (isClickThrough) {
    label += ' 👻';
  }

  const cssClass = isSleeping ? 'pill--sleeping' : `pill--${mode}`;
  const effectiveMode = isSleeping ? 'sleeping' : mode;
  const ariaLive = mode === 'error' ? 'assertive' : 'polite';

  return { label, cssClass, effectiveMode, ariaLive };
}
