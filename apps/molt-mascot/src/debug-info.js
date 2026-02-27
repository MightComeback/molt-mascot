/**
 * Build a multi-line debug info string for diagnostics.
 * Extracted from renderer.js for testability and reuse (context menu, IPC export, etc.).
 *
 * @param {object} params
 * @param {string} params.currentMode - Current mascot mode
 * @param {number} params.modeSince - Date.now() when mode started
 * @param {number|null} params.connectedSince - Date.now() when connected (null if disconnected)
 * @param {string} params.connectedUrl - Gateway URL
 * @param {number|null} params.lastDisconnectedAt - Date.now() when last disconnected
 * @param {boolean} params.hasPlugin - Whether plugin is active
 * @param {string|null} params.pluginStateMethod - Current plugin state method
 * @param {string|null} [params.pluginResetMethod] - Current plugin reset method (for diagnosing method resolution)
 * @param {number|null} params.pluginStartedAt - Plugin start timestamp
 * @param {number} params.pluginToolCalls - Tool call count
 * @param {number} params.pluginToolErrors - Tool error count
 * @param {string} params.currentTool - Current tool name
 * @param {string} params.lastErrorMessage - Last error message
 * @param {string} params.alignmentLabel - Current alignment label
 * @param {string} params.sizeLabel - Current size label
 * @param {number} params.opacity - Current opacity (0-1)
 * @param {boolean} params.isClickThrough - Ghost mode active
 * @param {boolean} params.isTextHidden - Text hidden
 * @param {number} params.sleepThresholdS - Sleep threshold in seconds
 * @param {number} params.idleDelayMs - Idle delay in ms
 * @param {number} params.errorHoldMs - Error hold in ms
 * @param {boolean} params.reducedMotion - Prefers-reduced-motion
 * @param {number} params.frameIntervalMs - Current frame interval (0 = ~60fps)
 * @param {number} [params.actualFps] - Measured frames per second (rolling 1s window)
 * @param {number} [params.totalFrames] - Total frames rendered since app start or last reset
 * @param {number} [params.worstFrameDeltaMs] - Peak inter-frame delta since start/reset (jank detection)
 * @param {"improving"|"degrading"|"stable"|null} [params.fpsTrend] - FPS trend direction from fps counter (shown when degrading for proactive jank detection)
 * @param {number} params.reconnectAttempt - Current reconnect attempt
 * @param {number} params.canvasScale - Pixel scale factor for canvas
 * @param {string} [params.appVersion] - App version string
 * @param {string} [params.pluginVersion] - Plugin version string
 * @param {number} [params.wsReadyState] - WebSocket readyState
 * @param {string} [params.savedUrl] - Saved config URL (shown when disconnected)
 * @param {string} [params.targetUrl] - Gateway URL being connected/reconnected to (shown when disconnected to help diagnose endpoint issues)
 * @param {string} [params.platform] - navigator.platform
 * @param {number} [params.devicePixelRatio] - window.devicePixelRatio
 * @param {{ usedJSHeapSize?: number, totalJSHeapSize?: number, jsHeapSizeLimit?: number }} [params.memory] - performance.memory
 * @param {{ electron?: string, chrome?: string, node?: string, bun?: string }} [params.versions] - Runtime versions
 * @param {number} [params.canvasWidth] - Canvas element width in pixels
 * @param {number} [params.canvasHeight] - Canvas element height in pixels
 * @param {string} [params.lastCloseDetail] - Human-readable WebSocket close reason (e.g. "abnormal closure", "code 1006")
 * @param {number} [params.processUptimeS] - Electron process uptime in seconds (process.uptime())
 * @param {number} [params.processMemoryRssBytes] - Electron process RSS in bytes (process.memoryUsage().rss)
 * @param {number} [params.sessionConnectCount] - Total successful handshakes since app launch (diagnoses flappy connections)
 * @param {number} [params.sessionAttemptCount] - Total connection attempts since app launch (including failures)
 * @param {number|null} [params.connectionSuccessRate] - Connection success rate as integer percentage (0-100)
 * @param {boolean} [params.isPollingPaused] - Whether plugin state polling is paused (e.g. window hidden)
 * @param {number|null} [params.latencyMs] - Most recent plugin state poll round-trip time in ms
 * @param {{ min: number, max: number, avg: number, median?: number, p95?: number, p99?: number, jitter?: number, samples: number }|null} [params.latencyStats] - Rolling latency stats (min/max/avg/p95/p99/jitter over ~60 samples)
 * @param {number} [params.agentSessions] - Cumulative count of agent sessions started since plugin start
 * @param {number} [params.activeAgents] - Number of currently active agent sessions (from plugin state)
 * @param {number} [params.activeTools] - Number of currently in-flight tool calls (from plugin state)
 * @param {number|null} [params.firstConnectedAt] - Timestamp of the very first successful handshake (helps diagnose "running for Xh but connected only Ym ago")
 * @param {number|null} [params.lastMessageAt] - Timestamp of the last WebSocket message received (helps diagnose stale connections before they trip the timeout)
 * @param {string} [params.arch] - CPU architecture (e.g. 'arm64', 'x64') — useful for diagnosing Electron compatibility issues
 * @param {string} [params.instanceId] - Stable client instance ID (helps diagnose multi-window and duplicate-session issues on the gateway)
 * @param {number|null} [params.lastResetAt] - Epoch ms of the last manual plugin reset (helps diagnose ghost state recovery)
 * @param {number} [params.pid] - Electron process PID (useful for Activity Monitor / task kill diagnostics)
 * @param {"healthy"|"degraded"|"unhealthy"|null} [params.healthStatus] - At-a-glance health assessment from GatewayClient
 * @param {"rising"|"falling"|"stable"|null} [params.latencyTrend] - Latency trend direction from latency tracker (appended to stats line for proactive diagnostics)
 * @param {number} [params.minProtocol] - Minimum supported gateway protocol version (shown in diagnostics for version mismatch debugging)
 * @param {number} [params.maxProtocol] - Maximum supported gateway protocol version
 * @param {{ x: number, y: number }|null} [params.dragPosition] - User-dragged window position (shown when the mascot was manually repositioned, helping diagnose "why is it here?")
 * @param {number|null} [params.processStartedAt] - Epoch ms when the Electron process started (shown alongside uptime for absolute reference)
 * @param {{ size: number, hitRate: number|null }} [params.spriteCache] - Sprite cache diagnostics (entries + hit rate)
 * @param {{ min: number, max: number }|null} [params.allTimeLatency] - All-time latency extremes (survive ring-buffer eviction; shown when they differ from rolling stats)
 * @param {number} [params.now] - Current timestamp (defaults to Date.now(); pass explicitly for deterministic tests)
 * @returns {string} Multi-line debug info
 */

import {
  formatDuration,
  formatElapsed,
  formatRelativeTime,
  formatTimestamp,
  formatTimestampWithAge,
  wsReadyStateLabel,
  formatBytes,
  formatCount,
  successRate,
  formatLatency,
  formatLatencyWithQuality,
  connectionUptimePercent,
  healthStatusEmoji,
  formatHealthSummary,
  formatActiveSummary,
  formatOpacity,
  isSleepingMode,
  formatProtocolRange,
  formatReconnectCount,
  memoryPressure,
  formatMemorySummary,
} from "./utils.js";
import { formatBoolToggle } from "@molt/mascot-plugin";
import { maskSensitiveUrl } from "@molt/mascot-plugin";
import { formatAlignment } from "./get-position.cjs";

// Re-export formatElapsed so existing consumers of debug-info.js don't break.
export { formatElapsed };

export function buildDebugInfo(params) {
  const {
    currentMode,
    modeSince,
    connectedSince,
    connectedUrl,
    lastDisconnectedAt,
    hasPlugin,
    pluginStateMethod,
    pluginStartedAt,
    pluginToolCalls,
    pluginToolErrors,
    currentTool,
    lastErrorMessage,
    alignmentLabel,
    sizeLabel,
    opacity,
    isClickThrough,
    isTextHidden,
    sleepThresholdS,
    idleDelayMs,
    errorHoldMs,
    reducedMotion,
    frameIntervalMs,
    actualFps,
    totalFrames,
    worstFrameDeltaMs,
    fpsTrend,
    reconnectAttempt,
    canvasScale,
    appVersion,
    pluginVersion,
    wsReadyState,
    savedUrl,
    targetUrl,
    platform,
    devicePixelRatio,
    memory,
    versions,
    canvasWidth,
    canvasHeight,
    lastCloseDetail,
    processUptimeS,
    processMemoryRssBytes,
    sessionConnectCount,
    sessionAttemptCount,
    connectionSuccessRate,
    isPollingPaused,
    latencyMs,
    latencyStats,
    agentSessions,
    activeAgents,
    activeTools,
    arch,
    pluginResetMethod,
    firstConnectedAt,
    lastMessageAt,
    instanceId,
    lastResetAt,
    pid,
    healthStatus,
    latencyTrend,
    minProtocol,
    maxProtocol,
    dragPosition,
    processStartedAt,
    spriteCache,
    allTimeLatency,
    now: nowOverride,
  } = params;

  const now = nowOverride ?? Date.now();

  const lines = [];
  const appVer = appVersion ? `v${appVersion}` : "dev";
  lines.push(
    `Molt Mascot ${appVer}${pluginVersion ? ` (plugin v${pluginVersion})` : ""}`,
  );
  lines.push(`Captured: ${formatTimestamp(now)}`);
  const modeDurationMs = Math.max(0, now - modeSince);
  const isSleeping = isSleepingMode(
    currentMode,
    modeDurationMs,
    sleepThresholdS * 1000,
  );
  const effectiveMode = isSleeping ? `idle (sleeping)` : currentMode;
  lines.push(`Mode: ${effectiveMode}`);
  lines.push(`Mode duration: ${formatElapsed(modeSince, now)}`);
  if (connectedSince) {
    lines.push(
      `Uptime: ${formatTimestampWithAge(connectedSince, now, "since")}`,
    );
    // Show first-ever connection time when the connection has flapped (reconnected at least once).
    // Helps diagnose "app running for 8h but current uptime is only 2m" scenarios.
    if (
      typeof firstConnectedAt === "number" &&
      firstConnectedAt > 0 &&
      typeof sessionConnectCount === "number" &&
      sessionConnectCount > 1
    ) {
      lines.push(
        `First connected: ${formatTimestampWithAge(firstConnectedAt, now)}`,
      );
    }
    lines.push(`Gateway: ${maskSensitiveUrl(connectedUrl)}`);
    lines.push(`WebSocket: ${wsReadyStateLabel(wsReadyState)}`);
    // Show time since last WS message — helps diagnose stale connections before they trip the timeout.
    if (typeof lastMessageAt === "number" && lastMessageAt > 0) {
      lines.push(`Last message: ${formatRelativeTime(lastMessageAt, now)}`);
    }
    // Show last disconnect even when connected — helps debug flaky connections
    if (lastDisconnectedAt) {
      lines.push(
        `Last disconnect: ${formatTimestampWithAge(lastDisconnectedAt, now)}`,
      );
    }
    // Show last close reason when connected but flappy (sessionConnectCount > 1)
    // to help diagnose why the previous disconnect happened without opening DevTools.
    if (
      lastCloseDetail &&
      typeof sessionConnectCount === "number" &&
      sessionConnectCount > 1
    ) {
      lines.push(`Last close reason: ${lastCloseDetail}`);
    }
  } else {
    if (lastDisconnectedAt) {
      lines.push(
        `Gateway: disconnected ${formatTimestampWithAge(lastDisconnectedAt, now)}`,
      );
    } else {
      lines.push(`Gateway: disconnected`);
    }
    lines.push(`WebSocket: ${wsReadyStateLabel(wsReadyState)}`);
    if (reconnectAttempt > 0)
      lines.push(`Reconnect attempt: ${reconnectAttempt}`);
    if (lastCloseDetail) lines.push(`Close reason: ${lastCloseDetail}`);
    if (savedUrl) lines.push(`Saved URL: ${maskSensitiveUrl(savedUrl)}`);
    if (typeof targetUrl === "string" && targetUrl)
      lines.push(`Target URL: ${maskSensitiveUrl(targetUrl)}`);
  }
  if (typeof minProtocol === "number" && typeof maxProtocol === "number") {
    lines.push(`Protocol: ${formatProtocolRange(minProtocol, maxProtocol)}`);
  }
  lines.push(`Plugin: ${hasPlugin ? "active" : "inactive"}`);
  if (hasPlugin) {
    if (pluginStateMethod) {
      const methodLine = pluginResetMethod
        ? `Plugin method: ${pluginStateMethod} (reset: ${pluginResetMethod})`
        : `Plugin method: ${pluginStateMethod}`;
      lines.push(methodLine);
    }
    if (pluginStartedAt) {
      lines.push(
        `Plugin uptime: ${formatTimestampWithAge(pluginStartedAt, now, "since")}`,
      );
    }
  }
  if (isPollingPaused) lines.push("Polling: paused");
  else if (hasPlugin) lines.push("Polling: active");
  if (typeof latencyMs === "number" && latencyMs >= 0) {
    // Append connection quality emoji (🟢🟡🟠🔴) for at-a-glance assessment.
    // Uses median from rolling stats when available (more stable than instant latency).
    lines.push(`Latency: ${formatLatencyWithQuality(latencyMs, latencyStats)}`);
  }
  if (
    latencyStats &&
    typeof latencyStats.samples === "number" &&
    latencyStats.samples > 1
  ) {
    const medianStr =
      typeof latencyStats.median === "number"
        ? `, median ${latencyStats.median}ms`
        : "";
    const p95Str =
      typeof latencyStats.p95 === "number" ? `, p95 ${latencyStats.p95}ms` : "";
    const p99Str =
      typeof latencyStats.p99 === "number" ? `, p99 ${latencyStats.p99}ms` : "";
    const jitterStr =
      typeof latencyStats.jitter === "number"
        ? `, jitter ${formatLatency(latencyStats.jitter)}`
        : "";
    const trendStr =
      typeof latencyTrend === "string" && latencyTrend !== "stable"
        ? `, ${latencyTrend}`
        : "";
    lines.push(
      `Latency stats: min ${latencyStats.min}ms, max ${latencyStats.max}ms, avg ${latencyStats.avg}ms${medianStr}${p95Str}${p99Str}${jitterStr}${trendStr} (${latencyStats.samples} samples)`,
    );
  }
  if (
    allTimeLatency &&
    typeof allTimeLatency.min === "number" &&
    typeof allTimeLatency.max === "number"
  ) {
    // Show all-time extremes only when they differ from the rolling window —
    // the rolling stats already show current min/max, so repeating identical
    // values would be noise. All-time extremes matter for long sessions where
    // early spikes have been evicted from the ring buffer.
    const showAllTime =
      !latencyStats ||
      allTimeLatency.min < latencyStats.min ||
      allTimeLatency.max > latencyStats.max;
    if (showAllTime) {
      lines.push(
        `Latency all-time: min ${allTimeLatency.min}ms, max ${allTimeLatency.max}ms`,
      );
    }
  }
  if (pluginToolCalls > 0) {
    const rateSuffix =
      pluginToolErrors > 0
        ? ` (${successRate(pluginToolCalls, pluginToolErrors)}% ok)`
        : "";
    lines.push(
      `Tool calls: ${pluginToolCalls}, errors: ${pluginToolErrors}${rateSuffix}`,
    );
  }
  if (typeof agentSessions === "number" && agentSessions > 0) {
    lines.push(`Agent sessions: ${formatCount(agentSessions)}`);
  }
  if (
    typeof activeAgents === "number" &&
    typeof activeTools === "number" &&
    (activeAgents > 0 || activeTools > 0)
  ) {
    lines.push(`Active: ${formatActiveSummary(activeAgents, activeTools)}`);
  }
  if (currentTool) lines.push(`Current tool: ${currentTool}`);
  if (lastErrorMessage) lines.push(`Last error: ${lastErrorMessage}`);
  lines.push(`Alignment: ${formatAlignment(alignmentLabel)}`);
  if (
    dragPosition &&
    typeof dragPosition.x === "number" &&
    typeof dragPosition.y === "number"
  ) {
    lines.push(
      `Drag position: ${Math.round(dragPosition.x)}, ${Math.round(dragPosition.y)}`,
    );
  }
  lines.push(`Size: ${sizeLabel}, Opacity: ${formatOpacity(opacity)}`);
  lines.push(
    `Ghost: ${formatBoolToggle(isClickThrough)}, Hide text: ${formatBoolToggle(isTextHidden)}`,
  );
  lines.push(
    `Sleep threshold: ${sleepThresholdS}s, Idle delay: ${idleDelayMs}ms, Error hold: ${errorHoldMs}ms`,
  );
  lines.push(`Reduced motion: ${formatBoolToggle(reducedMotion)}`);
  const fpsLabel =
    frameIntervalMs === 0
      ? "~60fps"
      : `~${Math.round(1000 / frameIntervalMs)}fps`;
  const actualFpsLabel =
    typeof actualFps === "number" ? `, actual ${actualFps}fps` : "";
  const totalFramesLabel =
    typeof totalFrames === "number"
      ? `, ${formatCount(totalFrames)} total`
      : "";
  const worstDeltaLabel =
    typeof worstFrameDeltaMs === "number" && worstFrameDeltaMs > 0
      ? `, worst ${Math.round(worstFrameDeltaMs)}ms`
      : "";
  // Surface FPS trend when degrading — proactive jank detection before it becomes visible.
  // "improving" and "stable" are omitted to avoid clutter (parity with latency trend display).
  const fpsTrendLabel =
    typeof fpsTrend === "string" && fpsTrend === "degrading"
      ? ", degrading"
      : "";
  lines.push(
    `Frame rate: ${fpsLabel}${actualFpsLabel}${totalFramesLabel}${worstDeltaLabel}${fpsTrendLabel}${reducedMotion ? " (reduced)" : ""}`,
  );
  if (spriteCache && typeof spriteCache.size === "number") {
    const hitRateStr =
      typeof spriteCache.hitRate === "number"
        ? `, ${spriteCache.hitRate}% hit`
        : "";
    lines.push(`Sprite cache: ${spriteCache.size} entries${hitRateStr}`);
  }
  const platformStr = [platform || "unknown", arch].filter(Boolean).join(" ");
  lines.push(`Platform: ${platformStr}`);
  const dpr = devicePixelRatio ?? 1;
  const canvasDims =
    typeof canvasWidth === "number" && typeof canvasHeight === "number"
      ? `, ${canvasWidth}×${canvasHeight}px`
      : "";
  lines.push(
    `Display scale: ${dpr}x (canvas scale: ${canvasScale}${canvasDims})`,
  );
  {
    const memorySummary = formatMemorySummary(memory, memoryPressure(memory));
    if (memorySummary) lines.push(`Memory: ${memorySummary}`);
  }
  if (typeof processMemoryRssBytes === "number" && processMemoryRssBytes > 0) {
    lines.push(`Process RSS: ${formatBytes(processMemoryRssBytes)}`);
  }
  const runtimeParts = [
    versions?.electron ? `Electron ${versions.electron}` : null,
    versions?.chrome ? `Chrome ${versions.chrome}` : null,
    versions?.node ? `Node ${versions.node}` : null,
    versions?.bun ? `Bun ${versions.bun}` : null,
  ].filter(Boolean);
  if (runtimeParts.length) lines.push(`Runtime: ${runtimeParts.join(", ")}`);
  if (typeof processUptimeS === "number" && processUptimeS >= 0) {
    const startedSuffix =
      typeof processStartedAt === "number" && processStartedAt > 0
        ? ` (since ${formatTimestamp(processStartedAt)})`
        : "";
    lines.push(
      `Process uptime: ${formatDuration(Math.round(processUptimeS))}${startedSuffix}`,
    );
  }
  if (typeof pid === "number" && pid > 0) {
    lines.push(`PID: ${pid}`);
  }
  {
    const reconnectStr = formatReconnectCount(sessionConnectCount);
    if (reconnectStr) {
      const attemptStr =
        typeof sessionAttemptCount === "number" &&
        sessionAttemptCount > sessionConnectCount
          ? `, ${sessionAttemptCount} attempts`
          : "";
      const rateStr =
        typeof connectionSuccessRate === "number" && connectionSuccessRate < 100
          ? `, ${connectionSuccessRate}% success`
          : "";
      lines.push(
        `Session connects: ${sessionConnectCount} (reconnected ${sessionConnectCount - 1}×${attemptStr}${rateStr})`,
      );
    }
  }
  // Connection uptime percentage: how much of the process lifetime was spent connected.
  // Helps diagnose flaky connections at a glance (e.g. "connected 23% of the time" → fix your network).
  const uptimePercent = connectionUptimePercent({
    processUptimeS,
    firstConnectedAt,
    connectedSince,
    lastDisconnectedAt,
    now,
  });
  if (uptimePercent !== null) {
    lines.push(`Connection uptime: ~${uptimePercent}%`);
  }
  if (typeof lastResetAt === "number" && lastResetAt > 0) {
    lines.push(`Last reset: ${formatTimestampWithAge(lastResetAt, now)}`);
  }
  if (typeof instanceId === "string" && instanceId)
    lines.push(`Instance: ${instanceId}`);
  if (typeof healthStatus === "string" && healthStatus) {
    const summary = formatHealthSummary(healthStatus, {
      isConnected: !!connectedSince,
      isPollingPaused,
      lastMessageAt,
      latencyMs,
      latencyStats,
      connectionSuccessRate,
      now,
    });
    // formatHealthSummary returns null for "healthy" — show a plain line in that case.
    lines.push(
      summary
        ? `Health: ${summary.text}`
        : `Health: ${healthStatusEmoji(healthStatus)} ${healthStatus}`,
    );
  }
  return lines.join("\n");
}
