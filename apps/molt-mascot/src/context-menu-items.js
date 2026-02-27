/**
 * Build the context menu items array for the mascot.
 * Pure function — no DOM access, no side effects. Returns item descriptors
 * with string IDs that the caller maps to action callbacks.
 *
 * Extracted from renderer.js for testability: the status line formatting and
 * item list can now be unit-tested without a DOM or Electron environment.
 */

import {
  capitalize,
  truncate,
  formatDuration,
  formatElapsed,
  MODE_EMOJI,
  formatLatencyWithQuality,
  healthStatusEmoji,
  formatActiveSummary,
  formatOpacity,
  formatBytes,
  isSleepingMode,
  formatLatencyTrendArrow,
  formatReconnectCount,
  formatToolCallsSummary,
  formatConnectionReliability,
} from "./utils.js";
import { formatSizeWithDims } from "./size-presets.cjs";
import { formatAlignment } from "./get-position.cjs";

/**
 * @typedef {Object} MenuItemDescriptor
 * @property {string} id - Unique item identifier for action dispatch
 * @property {string} [label] - Display text
 * @property {string} [hint] - Keyboard shortcut hint
 * @property {boolean} [separator] - Render as divider
 * @property {boolean} [disabled] - Non-interactive
 * @property {boolean} [checked] - Toggle item checked state (renders as menuitemcheckbox with aria-checked)
 * @property {string} [title] - Hover tooltip / aria-description for the menu item
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
 * @param {string} [state.pluginVersion] - Plugin version string (shown alongside app version for diagnostics parity with tray tooltip)
 * @param {boolean} [state.reducedMotion=false] - Whether reduced-motion mode is active (accessibility toggle)
 * @param {number|null} [state.connectionSuccessRate] - Connection success rate as integer percentage (0-100); shown when <100% for reliability diagnostics (parity with tray tooltip and debug info)
 * @param {string|null} [state.targetUrl] - Gateway URL being connected/reconnected to (used to conditionally show "Copy Gateway URL" menu item when disconnected)
 * @param {number} [state.now] - Current timestamp (defaults to Date.now(); pass for testability)
 * @returns {{ statusLine: string, items: MenuItemDescriptor[] }}
 */
export function buildContextMenuItems(state) {
  const {
    currentMode,
    modeSince,
    currentTool = "",
    lastErrorMessage = "",
    isClickThrough = false,
    isTextHidden = false,
    alignment = null,
    sizeLabel = "medium",
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
    pluginVersion,
    reducedMotion = false,
    connectionSuccessRate = null,
    targetUrl = null,
    now: nowOverride,
  } = state;

  const modKey = isMac ? "⌘" : "Ctrl+";
  const shiftKey = isMac ? "⇧" : "Shift+";
  const altKey = isMac ? "⌥" : "Alt+";
  const now = nowOverride ?? Date.now();

  // Build status summary line
  const modeDur = Math.max(0, Math.round((now - modeSince) / 1000));
  const isSleeping = isSleepingMode(
    currentMode,
    modeDur * 1000,
    sleepThresholdS * 1000,
  );
  const emojiKey = isSleeping ? "sleeping" : currentMode;
  const emoji = MODE_EMOJI[emojiKey] ? `${MODE_EMOJI[emojiKey]} ` : "";
  let modeLabel = isSleeping
    ? `${emoji}Sleeping`
    : `${emoji}${capitalize(currentMode)}`;
  if (currentMode === "tool" && currentTool)
    modeLabel = `${MODE_EMOJI.tool} ${truncate(currentTool, 20)}`;
  if (currentMode === "error" && lastErrorMessage)
    modeLabel = `${MODE_EMOJI.error} ${truncate(lastErrorMessage, 28)}`;

  const verLabel = appVersion
    ? pluginVersion
      ? `v${appVersion} (p${pluginVersion}) · ${modeLabel}`
      : `v${appVersion} · ${modeLabel}`
    : modeLabel;
  const statusParts = [verLabel];
  if (modeDur > 0) statusParts[0] += ` (${formatDuration(modeDur)})`;

  if (connectedSince) {
    let uptimeStr = `↑ ${formatElapsed(connectedSince, now)}`;
    const reconnectStr = formatReconnectCount(sessionConnectCount);
    if (reconnectStr) uptimeStr += ` ${reconnectStr}`;
    statusParts.push(uptimeStr);
  }
  if (!connectedSince && reconnectAttempt > 0) {
    statusParts.push(`retry #${reconnectAttempt}`);
  }
  {
    const toolSummary = formatToolCallsSummary(
      pluginToolCalls,
      pluginToolErrors,
    );
    if (toolSummary) statusParts.push(toolSummary);
  }
  if (pluginActiveAgents > 0 || pluginActiveTools > 0) {
    statusParts.push(
      formatActiveSummary(pluginActiveAgents, pluginActiveTools),
    );
  }
  if (typeof latencyMs === "number" && latencyMs >= 0) {
    // DRY: delegate to formatLatencyWithQuality (parity with debug-info.js)
    // and append trend arrow (parity with tray tooltip).
    let latencyPart = formatLatencyWithQuality(latencyMs, latencyStats);
    latencyPart += formatLatencyTrendArrow(latencyTrend);
    statusParts.push(latencyPart);
  }
  if (healthStatus === "degraded" || healthStatus === "unhealthy") {
    statusParts.push(`${healthStatusEmoji(healthStatus)} ${healthStatus}`);
  }
  // Surface connection reliability metrics (success rate + uptime) when below 100%.
  // DRY: delegates to formatConnectionReliability (parity with buildTooltip in utils.js).
  for (const part of formatConnectionReliability(
    connectionSuccessRate,
    connectionUptimePct,
  )) {
    // Context menu uses 📶 prefix for uptime, plain for success rate (compact status line).
    const prefix = part.includes("connected") ? "📶 " : "";
    statusParts.push(`${prefix}${part}`);
  }
  if (typeof processUptimeS === "number" && processUptimeS >= 60) {
    statusParts.push(`🕐 ${formatDuration(Math.round(processUptimeS))}`);
  }
  if (typeof processMemoryRssBytes === "number" && processMemoryRssBytes > 0) {
    statusParts.push(`🧠 ${formatBytes(processMemoryRssBytes)}`);
  }

  const statusLine = statusParts.join(" · ");

  const items = [
    { id: "status", label: statusLine, disabled: true },
    { id: "sep-1", separator: true },
    {
      id: "ghost",
      label: "Ghost Mode",
      hint: `${modKey}${shiftKey}M`,
      checked: isClickThrough,
      title:
        "Click through the mascot window (mouse events pass to apps behind)",
    },
    {
      id: "hide-text",
      label: "Hide Text",
      hint: `${modKey}${shiftKey}H`,
      checked: isTextHidden,
      title: "Hide the status pill label text",
    },
    {
      id: "reset",
      label: "Reset State",
      hint: `${modKey}${shiftKey}R`,
      title: "Reset the plugin state on the Gateway",
    },
    {
      id: "alignment",
      label: `Cycle Alignment (${formatAlignment(alignment)})`,
      hint: `${modKey}${shiftKey}A`,
      title: "Cycle the mascot window between screen corners and edges",
    },
    {
      id: "snap",
      label: "Snap to Position",
      hint: `${modKey}${shiftKey}S`,
      disabled: !hasDragPosition,
      title: "Return to the aligned position after dragging",
    },
    {
      id: "size",
      label: `Cycle Size (${formatSizeWithDims(sizeLabel)})`,
      hint: `${modKey}${shiftKey}Z`,
      title:
        "Cycle through size presets (tiny → small → medium → large → xlarge)",
    },
    {
      id: "opacity",
      label: `Opacity (${formatOpacity(opacity)})`,
      hint: `${modKey}${shiftKey}O`,
      title: "Cycle window opacity (or scroll-wheel to fine-tune)",
    },
    {
      id: "reduced-motion",
      label: "Reduced Motion",
      hint: `${modKey}${shiftKey}N`,
      checked: reducedMotion,
      title: "Suppress animations (bob, pulse, overlay frames)",
    },
    {
      id: "copy-status",
      label: "Copy Status",
      hint: `${modKey}${shiftKey}P`,
      title: "Copy the status summary line to clipboard",
    },
    {
      id: "copy-debug",
      label: "Copy Debug Info",
      hint: `${modKey}${shiftKey}I`,
      title: "Copy detailed diagnostic information to clipboard",
    },
    ...(connectedSince || targetUrl
      ? [
          {
            id: "copy-gateway-url",
            label: "Copy Gateway URL",
            title: "Copy the current gateway WebSocket URL to clipboard",
          },
        ]
      : []),
    {
      id: "reconnect",
      label: connectedSince ? "Force Reconnect" : "Reconnect Now",
      hint: `${modKey}${shiftKey}C`,
      title: connectedSince
        ? "Drop and re-establish the gateway connection"
        : "Attempt to reconnect to the gateway immediately",
    },
    {
      id: "change-gateway",
      label: "Change Gateway…",
      title: "Connect to a different OpenClaw gateway URL",
    },
    {
      id: "reset-prefs",
      label: "Reset Preferences…",
      title: "Restore all preferences to defaults",
    },
    {
      id: "hide",
      label: "Hide Mascot",
      hint: `${modKey}${shiftKey}V`,
      title: "Hide the mascot window (reopen from tray icon)",
    },
    { id: "sep-2", separator: true },
    {
      id: "about",
      label: "About Molt Mascot",
      title: "Show version and credits",
    },
    {
      id: "github",
      label: "Open on GitHub…",
      title: "Open the project repository in your browser",
    },
    {
      id: "devtools",
      label: "DevTools",
      hint: `${modKey}${shiftKey}D`,
      title: "Open Chromium DevTools for the renderer window",
    },
    {
      id: "quit",
      label: "Quit",
      hint: `${modKey}${altKey}Q`,
      title: "Quit Molt Mascot",
    },
  ];

  return { statusLine, items };
}
