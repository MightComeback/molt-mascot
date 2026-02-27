/**
 * Tray icon sprite rendering — extracted from electron-main.cjs for testability.
 *
 * Renders a 16×16 pixel-art lobster at arbitrary integer scales,
 * producing an RGBA buffer suitable for Electron's nativeImage.createFromBuffer().
 */

const {
  formatDuration,
  formatElapsed,
  formatCount,
  formatBytes,
  successRate,
  formatTimestampLocal,
  pluralize,
  formatCountWithLabel,
  maskSensitiveUrl,
} = require("@molt/mascot-plugin");
const {
  formatLatency,
  formatQualitySummary,
  formatHealthSummary,
  formatActiveSummary,
  computeConnectionSuccessRate,
  formatLatencyTrendArrow,
  formatReconnectCount,
  formatProcessUptime,
} = require("./format-latency.cjs");
const { MODE_EMOJI } = require("./mode-emoji.cjs");
const { formatAlignment } = require("./get-position.cjs");

// 16×16 pixel-art lobster matching the mascot sprite style.
// Legend: . = transparent, k = outline #4a0f14, r = body #e0433a,
//         h = highlight #ff8b7f, w = eye white #f8f7ff, b = pupil #101014,
//         c = claw accent #ff6b35
const TRAY_SPRITE = Object.freeze([
  "......kkkk......",
  ".....krrrrk.....",
  "....krhhhhrkk...",
  "....krhwrhwrrk..",
  "....krhbrhbrrk..",
  ".....krhhrrkk...",
  "......krrrkk....",
  "....kkrrkrrkk...",
  "...kcrk...kcrk..",
  "..kcrk.....kcrk.",
  "..kcr.......rck.",
  "..kcrk.....kcrk.",
  "...kcrk...kcrk..",
  "....kkrrkrrkk...",
  "......krrrkk....",
  ".......kkk......",
]);

const TRAY_COLORS = Object.freeze({
  ".": [0, 0, 0, 0],
  k: [0x4a, 0x0f, 0x14, 0xff],
  r: [0xe0, 0x43, 0x3a, 0xff],
  h: [0xff, 0x8b, 0x7f, 0xff],
  w: [0xf8, 0xf7, 0xff, 0xff],
  b: [0x10, 0x10, 0x14, 0xff],
  c: [0xff, 0x6b, 0x35, 0xff],
});

// Status dot colors for each mascot mode.
// The dot is a 3×3 pixel indicator in the bottom-right corner of the tray icon,
// giving at-a-glance status feedback (common macOS menu bar pattern).
const STATUS_DOT_COLORS = Object.freeze({
  idle: [0x8e, 0x8e, 0x93, 0xff], // gray
  thinking: [0x0a, 0x84, 0xff, 0xff], // blue
  tool: [0x34, 0xc7, 0x59, 0xff], // green
  error: [0xff, 0x3b, 0x30, 0xff], // red
  connecting: [0xff, 0xd6, 0x0a, 0xff], // yellow
  connected: [0x34, 0xc7, 0x59, 0xff], // green
  disconnected: [0xff, 0x3b, 0x30, 0xff], // red
  sleeping: [0x58, 0x56, 0xd6, 0xff], // indigo
});

/**
 * Canonical list of valid status dot mode strings.
 * Derived from STATUS_DOT_COLORS keys — single source of truth for runtime validation.
 * Mirrors VALID_MODES, VALID_OVERLAY_MODES, VALID_HEALTH_STATUSES, etc.
 */
const VALID_STATUS_DOT_MODES = Object.freeze(Object.keys(STATUS_DOT_COLORS));

/** @internal O(1) lookup set for isValidStatusDotMode(). */
const _validStatusDotModesSet = new Set(VALID_STATUS_DOT_MODES);

/**
 * Check whether a string is a recognized status dot mode (case-sensitive).
 * O(1) via Set lookup. Parity with isValidMode, isValidHealth,
 * isValidOverlayMode, isValidWsReadyState, etc.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isValidStatusDotMode(value) {
  return typeof value === "string" && _validStatusDotModesSet.has(value);
}

/**
 * Render the tray sprite at the given integer scale.
 * @param {number} scale - Integer multiplier (1 = 16px, 2 = 32px, etc.)
 * @param {{ mode?: string }} [opts] - Optional mode for status dot overlay
 * @returns {Buffer} Raw RGBA pixel buffer (size × size × 4 bytes)
 */
function renderTraySprite(scale, opts) {
  if (!Number.isInteger(scale) || scale < 1) {
    throw new RangeError(`scale must be a positive integer, got ${scale}`);
  }
  const size = 16 * scale;
  const buf = Buffer.alloc(size * size * 4);
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      const ch = TRAY_SPRITE[row][col] || ".";
      const [r, g, b, a] = TRAY_COLORS[ch] || TRAY_COLORS["."];
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const off = ((row * scale + dy) * size + (col * scale + dx)) * 4;
          buf[off] = r;
          buf[off + 1] = g;
          buf[off + 2] = b;
          buf[off + 3] = a;
        }
      }
    }
  }

  // Draw a status dot in the bottom-right corner (3×3 sprite pixels)
  // with a 1px dark outline ring for contrast against any background.
  const mode = opts?.mode;
  const dotColor = mode ? STATUS_DOT_COLORS[mode] : null;
  if (dotColor) {
    // Dot position: bottom-right 3×3 at sprite coords (13,13)–(15,15)
    const dotStartRow = 13;
    const dotStartCol = 13;
    const dotSize = 3;
    const outlineColor = [0x00, 0x00, 0x00, 0xcc]; // semi-transparent black

    // Helper to paint a scaled sprite pixel
    const paintPixel = (spriteRow, spriteCol, color) => {
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const off =
            ((spriteRow * scale + dy) * size + (spriteCol * scale + dx)) * 4;
          buf[off] = color[0];
          buf[off + 1] = color[1];
          buf[off + 2] = color[2];
          buf[off + 3] = color[3];
        }
      }
    };

    // 1) Outline ring: the 4 corner pixels of the 3×3 area (not drawn as dot)
    //    plus the row/col just outside the dot area (forming a dark halo).
    //    We paint corners of the 3×3 as outline to complete the ring.
    for (let dr = 0; dr < dotSize; dr++) {
      for (let dc = 0; dc < dotSize; dc++) {
        if (
          (dr === 0 || dr === dotSize - 1) &&
          (dc === 0 || dc === dotSize - 1)
        ) {
          paintPixel(dotStartRow + dr, dotStartCol + dc, outlineColor);
        }
      }
    }
    // Outer ring: 1px border around the 3×3 area (only pixels within bounds)
    for (let dr = -1; dr <= dotSize; dr++) {
      for (let dc = -1; dc <= dotSize; dc++) {
        if (dr >= 0 && dr < dotSize && dc >= 0 && dc < dotSize) continue; // inside
        const sr = dotStartRow + dr;
        const sc = dotStartCol + dc;
        if (sr < 0 || sr >= 16 || sc < 0 || sc >= 16) continue; // out of bounds
        paintPixel(sr, sc, outlineColor);
      }
    }

    // 2) Dot fill: the + shape (skip corners for rounded look)
    for (let dr = 0; dr < dotSize; dr++) {
      for (let dc = 0; dc < dotSize; dc++) {
        if (
          (dr === 0 || dr === dotSize - 1) &&
          (dc === 0 || dc === dotSize - 1)
        )
          continue;
        paintPixel(dotStartRow + dr, dotStartCol + dc, dotColor);
      }
    }
  }

  return buf;
}

/**
 * Build the tray tooltip string from current mascot state.
 * Extracted as a pure function for testability (no Electron dependency).
 *
 * @param {object} params
 * @param {string} params.appVersion - App version string
 * @param {string} params.mode - Current renderer mode (idle/thinking/tool/error/connecting/connected/disconnected/sleeping)
 * @param {boolean} params.clickThrough - Ghost mode active
 * @param {boolean} params.hideText - Text hidden
 * @param {string} params.alignment - Current alignment label
 * @param {string} params.sizeLabel - Current size preset label
 * @param {number} params.opacityPercent - Current opacity as integer percentage (0-100)
 * @param {string} [params.uptimeStr] - Connection uptime string (e.g. "2h 15m") — shown when connected
 * @param {number|null} [params.latencyMs] - Plugin state poll round-trip latency in ms
 * @param {string} [params.currentTool] - Active tool name (shown in tooltip when mode is 'tool')
 * @param {string} [params.lastErrorMessage] - Error detail (shown in tooltip when mode is 'error')
 * @param {number} [params.modeDurationSec] - How long in current mode (seconds); shown for non-idle modes
 * @param {number} [params.processUptimeS] - Electron process uptime in seconds (for app stability diagnostics)
 * @param {number} [params.sessionConnectCount] - Total successful handshakes since app launch (shows reconnect count when >1)
 * @param {number} [params.sessionAttemptCount] - Total connection attempts since app launch (shows failed attempts when > sessionConnectCount)
 * @param {string} [params.lastCloseDetail] - Human-readable WebSocket close reason (e.g. "abnormal closure (1006)")
 * @param {number} [params.reconnectAttempt] - Current reconnect attempt number (shown when disconnected)
 * @param {string} [params.targetUrl] - Gateway URL being connected/reconnected to (shown when disconnected to help diagnose which endpoint is failing)
 * @param {number} [params.toolCalls] - Total tool invocations since plugin start (shown with success rate)
 * @param {number} [params.toolErrors] - Total tool errors since plugin start (shown alongside toolCalls)
 * @param {number} [params.activeAgents] - Number of currently active agent sessions (from plugin state)
 * @param {number} [params.activeTools] - Number of currently in-flight tool calls (from plugin state)
 * @param {string} [params.pluginVersion] - Plugin version string (shown alongside app version for diagnostics)
 * @param {number} [params.pluginStartedAt] - Plugin start timestamp (for uptime display in tooltip)
 * @param {number|null} [params.lastMessageAt] - Timestamp of the last WebSocket message received (helps spot stale connections at a glance)
 * @param {{ min: number, max: number, avg: number, median?: number, p95?: number, p99?: number, jitter?: number, samples: number }|null} [params.latencyStats] - Rolling latency statistics (shown alongside current latency for connection quality insight)
 * @param {number|null} [params.lastResetAt] - Epoch ms of the last manual plugin reset (shown as "reset Xm ago" to confirm reset took effect)
 * @param {number} [params.agentSessions] - Cumulative count of agent sessions started since plugin start (shown when >0 for activity insight)
 * @param {number} [params.processMemoryRssBytes] - Electron process RSS in bytes (shown as compact memory usage for leak diagnostics)
 * @param {number|null} [params.processStartedAt] - Epoch ms when the Electron process started (shown alongside uptime for absolute reference)
 * @param {"healthy"|"degraded"|"unhealthy"|null} [params.healthStatus] - At-a-glance health assessment from GatewayClient (shown when degraded/unhealthy)
 * @param {number|null} [params.connectionSuccessRate] - Connection success rate as integer percentage (0-100); when provided, used directly for health reason diagnostics instead of computing from sessionConnectCount/sessionAttemptCount
 * @param {number|null} [params.connectionUptimePct] - Percentage of total lifetime spent connected (0-100); shown when <100% to surface flappy connections
 * @param {"rising"|"falling"|"stable"|null} [params.latencyTrend] - Latency trend direction from latency tracker (shown when non-stable to surface proactive diagnostics)
 * @param {boolean} [params.reducedMotion=false] - Whether reduced-motion mode is active (shown in tooltip when true for accessibility awareness)
 * @param {number} [params.now] - Current timestamp (defaults to Date.now(); pass explicitly for deterministic tests)
 * @returns {string} Tooltip string with parts joined by " · "
 */
function buildTrayTooltip(params) {
  const {
    appVersion,
    mode,
    clickThrough,
    hideText,
    alignment,
    sizeLabel,
    opacityPercent,
    uptimeStr,
    latencyMs,
    currentTool,
    lastErrorMessage,
    modeDurationSec,
    processUptimeS,
    processMemoryRssBytes,
    processStartedAt,
    sessionConnectCount,
    sessionAttemptCount,
    toolCalls,
    toolErrors,
    lastCloseDetail,
    reconnectAttempt,
    targetUrl,
    activeAgents,
    activeTools,
    agentSessions,
    pluginVersion,
    pluginStartedAt,
    lastMessageAt,
    latencyStats,
    lastResetAt,
    healthStatus,
    connectionSuccessRate,
    connectionUptimePct,
    latencyTrend,
    reducedMotion = false,
    now: nowOverride,
  } = params;
  const now = nowOverride ?? Date.now();
  const verLabel = pluginVersion
    ? `Molt Mascot v${appVersion} (plugin v${pluginVersion})`
    : `Molt Mascot v${appVersion}`;
  const parts = [verLabel];
  const modeEmoji = MODE_EMOJI;
  const modeLabel = mode || "idle";
  if (modeLabel !== "idle") {
    let modePart = `${modeEmoji[modeLabel] ?? "●"} ${modeLabel}`;
    if (modeLabel === "tool" && currentTool)
      modePart = `${modeEmoji.tool} ${currentTool}`;
    if (modeLabel === "error" && lastErrorMessage)
      modePart = `${modeEmoji.error} ${lastErrorMessage}`;
    if (typeof modeDurationSec === "number" && modeDurationSec > 0)
      modePart += ` (${formatDuration(modeDurationSec)})`;
    parts.push(modePart);
  }
  if (clickThrough) parts.push("👻 Ghost");
  if (hideText) parts.push("🙈 Text hidden");
  if (reducedMotion) parts.push("♿ Reduced motion");
  parts.push(`📍 ${formatAlignment(alignment)}`);
  parts.push(`📐 ${sizeLabel || "medium"}`);
  if (typeof opacityPercent === "number" && opacityPercent < 100)
    parts.push(`🔅 ${opacityPercent}%`);
  if (uptimeStr) parts.push(`↑ ${uptimeStr}`);
  if (
    typeof reconnectAttempt === "number" &&
    reconnectAttempt > 0 &&
    !uptimeStr
  )
    parts.push(`retry #${reconnectAttempt}`);
  if (typeof targetUrl === "string" && targetUrl && !uptimeStr)
    parts.push(`→ ${maskSensitiveUrl(targetUrl)}`);
  if (typeof lastCloseDetail === "string" && lastCloseDetail)
    parts.push(`⚡ ${lastCloseDetail}`);
  if (
    typeof latencyMs === "number" &&
    Number.isFinite(latencyMs) &&
    latencyMs >= 0
  ) {
    const { text: summaryText } = formatQualitySummary(latencyMs, latencyStats);
    let latencyPart = `⏱ ${summaryText}`;
    // Append extended stats (median, p95, p99) from rolling stats when available (>1 sample).
    // These supplement the compact summary with deeper diagnostics for the tray tooltip.
    if (
      latencyStats &&
      typeof latencyStats.median === "number" &&
      typeof latencyStats.samples === "number" &&
      latencyStats.samples > 1
    ) {
      const showP95 =
        typeof latencyStats.p95 === "number" &&
        latencyStats.median > 0 &&
        latencyStats.p95 > latencyStats.median * 2;
      const p95Str = showP95 ? `, p95 ${formatLatency(latencyStats.p95)}` : "";
      const showP99 =
        typeof latencyStats.p99 === "number" &&
        latencyStats.median > 0 &&
        latencyStats.p99 > latencyStats.median * 3;
      const p99Str = showP99 ? `, p99 ${formatLatency(latencyStats.p99)}` : "";
      latencyPart += ` (med ${formatLatency(latencyStats.median)}${p95Str}${p99Str})`;
    }
    latencyPart += formatLatencyTrendArrow(latencyTrend);
    parts.push(latencyPart);
  }
  // Show "last msg Xs ago" when the gap exceeds 5s — helps spot stale connections
  // before the stale-check timer (15s) triggers a reconnect. Below 5s the latency
  // line already conveys liveness, so we avoid tooltip clutter.
  if (typeof lastMessageAt === "number" && lastMessageAt > 0 && uptimeStr) {
    const gapMs = now - lastMessageAt;
    if (gapMs >= 5000) {
      parts.push(`📩 last msg ${formatElapsed(lastMessageAt, now)} ago`);
    }
  }
  if (typeof toolCalls === "number" && toolCalls > 0) {
    const rate =
      typeof toolErrors === "number" && toolErrors > 0
        ? successRate(toolCalls, toolErrors)
        : null;
    const statsStr =
      rate !== null
        ? `${formatCount(toolCalls)} calls, ${formatCount(toolErrors)} err (${rate}% ok)`
        : `${formatCount(toolCalls)} calls`;
    parts.push(`🔨 ${statsStr}`);
  }
  if (
    typeof activeAgents === "number" &&
    typeof activeTools === "number" &&
    (activeAgents > 0 || activeTools > 0)
  ) {
    parts.push(`🤖 ${formatActiveSummary(activeAgents, activeTools)}`);
  }
  if (typeof agentSessions === "number" && agentSessions > 0) {
    parts.push(`🧑‍💻 ${formatCountWithLabel(agentSessions, "session")}`);
  }
  if (typeof pluginStartedAt === "number" && pluginStartedAt > 0) {
    parts.push(`🔌 plugin up ${formatElapsed(pluginStartedAt, now)}`);
  }
  if (typeof lastResetAt === "number" && lastResetAt > 0) {
    parts.push(`🔄 reset ${formatElapsed(lastResetAt, now)} ago`);
  }
  {
    const uptimeStr = formatProcessUptime(processUptimeS, processStartedAt, {
      formatTimestamp: (ts) => formatTimestampLocal(ts, now),
    });
    if (uptimeStr) parts.push(`🕐 ${uptimeStr}`);
  }
  if (typeof processMemoryRssBytes === "number" && processMemoryRssBytes > 0) {
    parts.push(`🧠 ${formatBytes(processMemoryRssBytes)}`);
  }
  {
    const reconnectStr = formatReconnectCount(sessionConnectCount);
    if (reconnectStr) {
      const attemptSuffix =
        typeof sessionAttemptCount === "number" &&
        sessionAttemptCount > sessionConnectCount
          ? `, ${sessionAttemptCount - sessionConnectCount} failed`
          : "";
      const reconnects = sessionConnectCount - 1;
      parts.push(
        `${reconnectStr} ${pluralize(reconnects, "reconnect")}${attemptSuffix}`,
      );
    }
  }
  // Surface connection uptime percentage when below 100% to highlight flappy connections.
  // At 100% (or null/unavailable) it's omitted to keep the tooltip clean.
  if (
    typeof connectionUptimePct === "number" &&
    connectionUptimePct >= 0 &&
    connectionUptimePct < 100
  ) {
    parts.push(`📶 ${connectionUptimePct}% connected`);
  }
  // Surface connection success rate when below 100% — indicates failed connection
  // attempts (parity with context menu and debug info reliability diagnostics).
  if (
    typeof connectionSuccessRate === "number" &&
    connectionSuccessRate >= 0 &&
    connectionSuccessRate < 100
  ) {
    parts.push(`🎯 ${connectionSuccessRate}% ok`);
  }
  // Surface health status when degraded or unhealthy for at-a-glance diagnostics,
  // with diagnostic reasons so users can see *why* without opening debug info.
  // "healthy" is omitted to keep it clean.
  {
    // Use the caller-provided connectionSuccessRate when available (avoids
    // redundant computation when the caller already has it, e.g. from
    // GatewayClient.connectionSuccessRate). Fall back to inline computation
    // from sessionConnectCount/sessionAttemptCount for back-compat.
    const resolvedSuccessRate =
      typeof connectionSuccessRate === "number"
        ? connectionSuccessRate
        : (computeConnectionSuccessRate(
            sessionConnectCount,
            sessionAttemptCount,
          ) ?? undefined);
    const summary = formatHealthSummary(healthStatus, {
      isConnected: !!uptimeStr,
      isPollingPaused: false,
      lastMessageAt: lastMessageAt || undefined,
      latencyMs,
      latencyStats,
      connectionSuccessRate: resolvedSuccessRate,
      now,
    });
    if (summary) parts.push(summary.text);
  }
  return parts.join(" · ");
}

module.exports = {
  renderTraySprite,
  buildTrayTooltip,
  TRAY_SPRITE,
  TRAY_COLORS,
  STATUS_DOT_COLORS,
  VALID_STATUS_DOT_MODES,
  isValidStatusDotMode,
};
