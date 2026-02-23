/**
 * Build the context menu items array for the mascot.
 * Pure function — no DOM access, no side effects. Returns item descriptors
 * with string IDs that the caller maps to action callbacks.
 *
 * Extracted from renderer.js for testability: the status line formatting and
 * item list can now be unit-tested without a DOM or Electron environment.
 */

import { capitalize, truncate, formatDuration, formatElapsed, formatCount, successRate, MODE_EMOJI, formatLatency, healthStatusEmoji, formatActiveSummary, formatOpacity } from './utils.js';
import { findSizePreset } from './size-presets.cjs';

/**
 * @typedef {Object} MenuItemDescriptor
 * @property {string} id - Unique item identifier for action dispatch
 * @property {string} [label] - Display text
 * @property {string} [hint] - Keyboard shortcut hint
 * @property {boolean} [separator] - Render as divider
 * @property {boolean} [disabled] - Non-interactive
 * @property {boolean} [checked] - Toggle item checked state (renders as menuitemcheckbox with aria-checked)
 */

/**
 * Format a size label with its pixel dimensions for richer context menu display.
 * e.g. 'medium' → 'medium 240×200', unknown labels pass through unchanged.
 *
 * @param {string} label - Size preset label
 * @returns {string}
 */
function _formatSizeWithDims(label) {
  const preset = findSizePreset(label);
  if (preset) return `${preset.label} ${preset.width}×${preset.height}`;
  return label || 'medium';
}

/**
 * @param {object} state - Current mascot state snapshot
 * @param {string} state.currentMode
 * @param {number} state.modeSince
 * @param {string} state.currentTool
 * @param {string} state.lastErrorMessage
 * @param {boolean} state.isClickThrough
 * @param {boolean} state.isTextHidden
 * @param {string|null} state.alignment
 * @param {string} state.sizeLabel
 * @param {number} state.opacity
 * @param {number|null} state.connectedSince
 * @param {number} state.reconnectAttempt
 * @param {number} state.sessionConnectCount
 * @param {number} state.pluginToolCalls
 * @param {number} state.pluginToolErrors
 * @param {number} state.pluginActiveAgents
 * @param {number} state.pluginActiveTools
 * @param {number|null} state.latencyMs
 * @param {number} state.sleepThresholdS
 * @param {string} [state.appVersion]
 * @param {boolean} [state.isMac]
 * @param {"healthy"|"degraded"|"unhealthy"|null} [state.healthStatus] - At-a-glance health assessment (shown as prefix when degraded/unhealthy)
 * @param {number} [state.now] - Current timestamp (defaults to Date.now(); pass for testability)
 * @returns {{ statusLine: string, items: MenuItemDescriptor[] }}
 */
export function buildContextMenuItems(state) {
  const {
    currentMode,
    modeSince,
    currentTool = '',
    lastErrorMessage = '',
    isClickThrough = false,
    isTextHidden = false,
    alignment = null,
    sizeLabel = 'medium',
    opacity = 1,
    connectedSince = null,
    reconnectAttempt = 0,
    sessionConnectCount = 0,
    pluginToolCalls = 0,
    pluginToolErrors = 0,
    pluginActiveAgents = 0,
    pluginActiveTools = 0,
    latencyMs = null,
    sleepThresholdS = 120,
    appVersion,
    isMac = false,
    healthStatus = null,
    now: nowOverride,
  } = state;

  const modKey = isMac ? '⌘' : 'Ctrl+';
  const shiftKey = isMac ? '⇧' : 'Shift+';
  const altKey = isMac ? '⌥' : 'Alt+';
  const now = nowOverride ?? Date.now();

  // Build status summary line
  const modeDur = Math.max(0, Math.round((now - modeSince) / 1000));
  const isSleeping = currentMode === 'idle' && modeDur > sleepThresholdS;
  const emojiKey = isSleeping ? 'sleeping' : currentMode;
  const emoji = MODE_EMOJI[emojiKey] ? `${MODE_EMOJI[emojiKey]} ` : '';
  let modeLabel = isSleeping ? `${emoji}Sleeping` : `${emoji}${capitalize(currentMode)}`;
  if (currentMode === 'tool' && currentTool) modeLabel = `${MODE_EMOJI.tool} ${truncate(currentTool, 20)}`;
  if (currentMode === 'error' && lastErrorMessage) modeLabel = `${MODE_EMOJI.error} ${truncate(lastErrorMessage, 28)}`;

  const statusParts = [appVersion ? `v${appVersion} · ${modeLabel}` : modeLabel];
  if (modeDur > 0) statusParts[0] += ` (${formatDuration(modeDur)})`;

  if (connectedSince) {
    let uptimeStr = `↑ ${formatElapsed(connectedSince, now)}`;
    if (sessionConnectCount > 1) uptimeStr += ` ↻${sessionConnectCount - 1}`;
    statusParts.push(uptimeStr);
  }
  if (!connectedSince && reconnectAttempt > 0) {
    statusParts.push(`retry #${reconnectAttempt}`);
  }
  if (pluginToolCalls > 0) {
    const statsStr = pluginToolErrors > 0
      ? `${formatCount(pluginToolCalls)} calls, ${formatCount(pluginToolErrors)} err (${successRate(pluginToolCalls, pluginToolErrors)}% ok)`
      : `${formatCount(pluginToolCalls)} calls`;
    statusParts.push(statsStr);
  }
  if (pluginActiveAgents > 0 || pluginActiveTools > 0) {
    statusParts.push(formatActiveSummary(pluginActiveAgents, pluginActiveTools));
  }
  if (typeof latencyMs === 'number' && latencyMs >= 0) {
    statusParts.push(formatLatency(latencyMs));
  }
  if (healthStatus === 'degraded' || healthStatus === 'unhealthy') {
    statusParts.push(`${healthStatusEmoji(healthStatus)} ${healthStatus}`);
  }

  const statusLine = statusParts.join(' · ');

  const items = [
    { id: 'status', label: statusLine, disabled: true },
    { id: 'sep-1', separator: true },
    { id: 'ghost', label: 'Ghost Mode', hint: `${modKey}${shiftKey}M`, checked: isClickThrough },
    { id: 'hide-text', label: 'Hide Text', hint: `${modKey}${shiftKey}H`, checked: isTextHidden },
    { id: 'reset', label: 'Reset State', hint: `${modKey}${shiftKey}R` },
    { id: 'alignment', label: `Cycle Alignment (${alignment || 'bottom-right'})`, hint: `${modKey}${shiftKey}A` },
    { id: 'snap', label: 'Snap to Position', hint: `${modKey}${shiftKey}S` },
    { id: 'size', label: `Cycle Size (${_formatSizeWithDims(sizeLabel)})`, hint: `${modKey}${shiftKey}Z` },
    { id: 'opacity', label: `Opacity (${formatOpacity(opacity)})`, hint: `${modKey}${shiftKey}O` },
    { id: 'copy-status', label: 'Copy Status' },
    { id: 'copy-debug', label: 'Copy Debug Info', hint: `${modKey}${shiftKey}I` },
    ...(connectedSince ? [{ id: 'copy-gateway-url', label: 'Copy Gateway URL' }] : []),
    { id: 'reconnect', label: connectedSince ? 'Force Reconnect' : 'Reconnect Now', hint: `${modKey}${shiftKey}C` },
    { id: 'change-gateway', label: 'Change Gateway…' },
    { id: 'reset-prefs', label: 'Reset Preferences…' },
    { id: 'hide', label: 'Hide Mascot', hint: `${modKey}${shiftKey}V` },
    { id: 'sep-2', separator: true },
    { id: 'about', label: 'About Molt Mascot' },
    { id: 'github', label: 'Open on GitHub…' },
    { id: 'devtools', label: 'DevTools', hint: `${modKey}${shiftKey}D` },
    { id: 'quit', label: 'Quit', hint: `${modKey}${altKey}Q` },
  ];

  return { statusLine, items };
}
