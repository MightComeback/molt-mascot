/**
 * Build the context menu items array for the mascot.
 * Pure function — no DOM access, no side effects. Returns item descriptors
 * with string IDs that the caller maps to action callbacks.
 *
 * Extracted from renderer.js for testability: the status line formatting and
 * item list can now be unit-tested without a DOM or Electron environment.
 */

import { capitalize, truncate, formatDuration, formatElapsed, formatCount, successRate, MODE_EMOJI, formatLatency, connectionQuality, connectionQualityEmoji, resolveQualitySource, healthStatusEmoji, formatActiveSummary, formatOpacity, formatBytes, isSleepingMode } from './utils.js';
import { formatSizeWithDims } from './size-presets.cjs';

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
 * @param {number|null} [state.connectionUptimePct] - Percentage of lifetime spent connected (0-100); shown when <100%
 * @param {"rising"|"falling"|"stable"|null} [state.latencyTrend] - Latency trend direction (shown as ↑/↓ arrow when non-stable)
 * @param {boolean} [state.hasDragPosition] - Whether the mascot has been manually dragged (disables "Snap to Position" when false)
 * @param {number} [state.processUptimeS] - Process uptime in seconds (shown as compact uptime when >60s)
 * @param {number} [state.processMemoryRssBytes] - Process RSS in bytes (shown as compact memory usage for leak diagnostics)
 * @param {{ min: number, max: number, avg: number, median?: number, p95?: number, p99?: number, jitter?: number, samples: number }|null} [state.latencyStats] - Rolling latency statistics (used with latencyMs for connection quality emoji)
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
    connectionUptimePct = null,
    latencyTrend = null,
    hasDragPosition = false,
    processUptimeS,
    processMemoryRssBytes,
    latencyStats = null,
    now: nowOverride,
  } = state;

  const modKey = isMac ? '⌘' : 'Ctrl+';
  const shiftKey = isMac ? '⇧' : 'Shift+';
  const altKey = isMac ? '⌥' : 'Alt+';
  const now = nowOverride ?? Date.now();

  // Build status summary line
  const modeDur = Math.max(0, Math.round((now - modeSince) / 1000));
  const isSleeping = isSleepingMode(currentMode, modeDur * 1000, sleepThresholdS * 1000);
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
    // Append connection quality emoji (🟢🟡🟠🔴) for at-a-glance assessment,
    // matching the tray tooltip and debug info behavior. Use median from rolling
    // stats when available (more stable than instant latency); fall back to current sample.
    const quality = connectionQuality(resolveQualitySource(latencyMs, latencyStats));
    const qualityEmoji = quality ? connectionQualityEmoji(quality) : '';
    let latencyPart = qualityEmoji ? `${formatLatency(latencyMs)} ${qualityEmoji}` : formatLatency(latencyMs);
    // Append trend indicator when latency is actively rising or falling.
    // "stable" is omitted to avoid status line clutter; only actionable signals are shown.
    // Parity with pill-label and tray tooltip trend indicators.
    if (typeof latencyTrend === 'string' && latencyTrend !== 'stable') {
      latencyPart += latencyTrend === 'rising' ? ' ↑' : ' ↓';
    }
    statusParts.push(latencyPart);
  }
  if (healthStatus === 'degraded' || healthStatus === 'unhealthy') {
    statusParts.push(`${healthStatusEmoji(healthStatus)} ${healthStatus}`);
  }
  if (typeof connectionUptimePct === 'number' && connectionUptimePct >= 0 && connectionUptimePct < 100) {
    statusParts.push(`📶 ${connectionUptimePct}%`);
  }
  if (typeof processUptimeS === 'number' && processUptimeS >= 60) {
    statusParts.push(`🕐 ${formatDuration(Math.round(processUptimeS))}`);
  }
  if (typeof processMemoryRssBytes === 'number' && processMemoryRssBytes > 0) {
    statusParts.push(`🧠 ${formatBytes(processMemoryRssBytes)}`);
  }

  const statusLine = statusParts.join(' · ');

  const items = [
    { id: 'status', label: statusLine, disabled: true },
    { id: 'sep-1', separator: true },
    { id: 'ghost', label: 'Ghost Mode', hint: `${modKey}${shiftKey}M`, checked: isClickThrough },
    { id: 'hide-text', label: 'Hide Text', hint: `${modKey}${shiftKey}H`, checked: isTextHidden },
    { id: 'reset', label: 'Reset State', hint: `${modKey}${shiftKey}R` },
    { id: 'alignment', label: `Cycle Alignment (${alignment || 'bottom-right'})`, hint: `${modKey}${shiftKey}A` },
    { id: 'snap', label: 'Snap to Position', hint: `${modKey}${shiftKey}S`, disabled: !hasDragPosition },
    { id: 'size', label: `Cycle Size (${formatSizeWithDims(sizeLabel)})`, hint: `${modKey}${shiftKey}Z` },
    { id: 'opacity', label: `Opacity (${formatOpacity(opacity)})`, hint: `${modKey}${shiftKey}O` },
    { id: 'copy-status', label: 'Copy Status', hint: `${modKey}${shiftKey}P` },
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
