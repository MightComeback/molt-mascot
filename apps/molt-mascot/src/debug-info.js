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
 * @param {{ electron?: string, chrome?: string, node?: string }} [params.versions] - Runtime versions
 * @param {number} [params.canvasWidth] - Canvas element width in pixels
 * @param {number} [params.canvasHeight] - Canvas element height in pixels
 * @param {string} [params.lastCloseDetail] - Human-readable WebSocket close reason (e.g. "abnormal closure", "code 1006")
 * @param {number} [params.processUptimeS] - Electron process uptime in seconds (process.uptime())
 * @param {number} [params.processMemoryRssBytes] - Electron process RSS in bytes (process.memoryUsage().rss)
 * @param {number} [params.sessionConnectCount] - Total successful handshakes since app launch (diagnoses flappy connections)
 * @param {number} [params.sessionAttemptCount] - Total connection attempts since app launch (including failures)
 * @param {boolean} [params.isPollingPaused] - Whether plugin state polling is paused (e.g. window hidden)
 * @param {number|null} [params.latencyMs] - Most recent plugin state poll round-trip time in ms
 * @param {{ min: number, max: number, avg: number, samples: number }|null} [params.latencyStats] - Rolling latency stats (min/max/avg over ~60 samples)
 * @param {number} [params.activeAgents] - Number of currently active agent sessions (from plugin state)
 * @param {number} [params.activeTools] - Number of currently in-flight tool calls (from plugin state)
 * @param {number|null} [params.firstConnectedAt] - Timestamp of the very first successful handshake (helps diagnose "running for Xh but connected only Ym ago")
 * @param {number|null} [params.lastMessageAt] - Timestamp of the last WebSocket message received (helps diagnose stale connections before they trip the timeout)
 * @param {string} [params.arch] - CPU architecture (e.g. 'arm64', 'x64') — useful for diagnosing Electron compatibility issues
 * @param {string} [params.instanceId] - Stable client instance ID (helps diagnose multi-window and duplicate-session issues on the gateway)
 * @param {number} [params.now] - Current timestamp (defaults to Date.now(); pass explicitly for deterministic tests)
 * @returns {string} Multi-line debug info
 */

import { formatDuration, formatElapsed, wsReadyStateLabel, formatBytes, successRate, formatLatency } from './utils.js';

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
    isPollingPaused,
    latencyMs,
    latencyStats,
    activeAgents,
    activeTools,
    arch,
    pluginResetMethod,
    firstConnectedAt,
    lastMessageAt,
    instanceId,
    now: nowOverride,
  } = params;

  const now = nowOverride ?? Date.now();

  const lines = [];
  const appVer = appVersion ? `v${appVersion}` : 'dev';
  lines.push(`Molt Mascot ${appVer}${pluginVersion ? ` (plugin v${pluginVersion})` : ''}`);
  lines.push(`Captured: ${new Date(now).toISOString()}`);
  const modeDurationMs = Math.max(0, now - modeSince);
  const isSleeping = currentMode === 'idle' && modeDurationMs > sleepThresholdS * 1000;
  const effectiveMode = isSleeping ? `idle (sleeping)` : currentMode;
  lines.push(`Mode: ${effectiveMode}`);
  lines.push(`Mode duration: ${formatElapsed(modeSince, now)}`);
  if (connectedSince) {
    lines.push(`Uptime: ${formatElapsed(connectedSince, now)} (since ${new Date(connectedSince).toISOString()})`);
    // Show first-ever connection time when the connection has flapped (reconnected at least once).
    // Helps diagnose "app running for 8h but current uptime is only 2m" scenarios.
    if (typeof firstConnectedAt === 'number' && firstConnectedAt > 0 && typeof sessionConnectCount === 'number' && sessionConnectCount > 1) {
      lines.push(`First connected: ${formatElapsed(firstConnectedAt, now)} ago (at ${new Date(firstConnectedAt).toISOString()})`);
    }
    lines.push(`Gateway: ${connectedUrl}`);
    lines.push(`WebSocket: ${wsReadyStateLabel(wsReadyState)}`);
    // Show time since last WS message — helps diagnose stale connections before they trip the timeout.
    if (typeof lastMessageAt === 'number' && lastMessageAt > 0) {
      lines.push(`Last message: ${formatElapsed(lastMessageAt, now)} ago`);
    }
    // Show last disconnect even when connected — helps debug flaky connections
    if (lastDisconnectedAt) {
      lines.push(`Last disconnect: ${formatElapsed(lastDisconnectedAt, now)} ago (at ${new Date(lastDisconnectedAt).toISOString()})`);
    }
    // Show last close reason when connected but flappy (sessionConnectCount > 1)
    // to help diagnose why the previous disconnect happened without opening DevTools.
    if (lastCloseDetail && typeof sessionConnectCount === 'number' && sessionConnectCount > 1) {
      lines.push(`Last close reason: ${lastCloseDetail}`);
    }
  } else {
    if (lastDisconnectedAt) {
      lines.push(`Gateway: disconnected ${formatElapsed(lastDisconnectedAt, now)} ago (at ${new Date(lastDisconnectedAt).toISOString()})`);
    } else {
      lines.push(`Gateway: disconnected`);
    }
    lines.push(`WebSocket: ${wsReadyStateLabel(wsReadyState)}`);
    if (reconnectAttempt > 0) lines.push(`Reconnect attempt: ${reconnectAttempt}`);
    if (lastCloseDetail) lines.push(`Close reason: ${lastCloseDetail}`);
    if (savedUrl) lines.push(`Saved URL: ${savedUrl}`);
    if (typeof targetUrl === 'string' && targetUrl) lines.push(`Target URL: ${targetUrl}`);
  }
  lines.push(`Plugin: ${hasPlugin ? 'active' : 'inactive'}`);
  if (hasPlugin) {
    if (pluginStateMethod) {
      const methodLine = pluginResetMethod
        ? `Plugin method: ${pluginStateMethod} (reset: ${pluginResetMethod})`
        : `Plugin method: ${pluginStateMethod}`;
      lines.push(methodLine);
    }
    if (pluginStartedAt) {
      lines.push(`Plugin uptime: ${formatElapsed(pluginStartedAt, now)} (since ${new Date(pluginStartedAt).toISOString()})`);
    }
  }
  if (isPollingPaused) lines.push('Polling: paused');
  else if (hasPlugin) lines.push('Polling: active');
  if (typeof latencyMs === 'number' && latencyMs >= 0) lines.push(`Latency: ${formatLatency(latencyMs)}`);
  if (latencyStats && typeof latencyStats.samples === 'number' && latencyStats.samples > 1) {
    const medianStr = typeof latencyStats.median === 'number' ? `, median ${latencyStats.median}ms` : '';
    lines.push(`Latency stats: min ${latencyStats.min}ms, max ${latencyStats.max}ms, avg ${latencyStats.avg}ms${medianStr} (${latencyStats.samples} samples)`);
  }
  if (pluginToolCalls > 0) {
    const rateSuffix = pluginToolErrors > 0
      ? ` (${successRate(pluginToolCalls, pluginToolErrors)}% ok)`
      : '';
    lines.push(`Tool calls: ${pluginToolCalls}, errors: ${pluginToolErrors}${rateSuffix}`);
  }
  if (typeof activeAgents === 'number' && typeof activeTools === 'number' && (activeAgents > 0 || activeTools > 0)) {
    lines.push(`Active: ${activeAgents} agent${activeAgents !== 1 ? 's' : ''}, ${activeTools} tool${activeTools !== 1 ? 's' : ''}`);
  }
  if (currentTool) lines.push(`Current tool: ${currentTool}`);
  if (lastErrorMessage) lines.push(`Last error: ${lastErrorMessage}`);
  lines.push(`Alignment: ${alignmentLabel || 'bottom-right'}`);
  lines.push(`Size: ${sizeLabel}, Opacity: ${Math.round(opacity * 100)}%`);
  lines.push(`Ghost: ${isClickThrough}, Hide text: ${isTextHidden}`);
  lines.push(`Sleep threshold: ${sleepThresholdS}s, Idle delay: ${idleDelayMs}ms, Error hold: ${errorHoldMs}ms`);
  lines.push(`Reduced motion: ${reducedMotion}`);
  const fpsLabel = frameIntervalMs === 0 ? '~60fps' : `~${Math.round(1000 / frameIntervalMs)}fps`;
  const actualFpsLabel = typeof actualFps === 'number' ? `, actual ${actualFps}fps` : '';
  lines.push(`Frame rate: ${fpsLabel}${actualFpsLabel}${reducedMotion ? ' (reduced)' : ''}`);
  const platformStr = [platform || 'unknown', arch].filter(Boolean).join(' ');
  lines.push(`Platform: ${platformStr}`);
  const dpr = devicePixelRatio ?? 1;
  const canvasDims = (typeof canvasWidth === 'number' && typeof canvasHeight === 'number')
    ? `, ${canvasWidth}×${canvasHeight}px`
    : '';
  lines.push(`Display scale: ${dpr}x (canvas scale: ${canvasScale}${canvasDims})`);
  if (memory && typeof memory.usedJSHeapSize === 'number') {
    const used = formatBytes(memory.usedJSHeapSize);
    const total = formatBytes(memory.totalJSHeapSize);
    const limit = formatBytes(memory.jsHeapSizeLimit);
    lines.push(`Memory: ${used} used / ${total} total (limit ${limit})`);
  }
  if (typeof processMemoryRssBytes === 'number' && processMemoryRssBytes > 0) {
    lines.push(`Process RSS: ${formatBytes(processMemoryRssBytes)}`);
  }
  const runtimeParts = [
    versions?.electron ? `Electron ${versions.electron}` : null,
    versions?.chrome ? `Chrome ${versions.chrome}` : null,
    versions?.node ? `Node ${versions.node}` : null,
  ].filter(Boolean);
  if (runtimeParts.length) lines.push(`Runtime: ${runtimeParts.join(', ')}`);
  if (typeof processUptimeS === 'number' && processUptimeS >= 0) {
    lines.push(`Process uptime: ${formatDuration(Math.round(processUptimeS))}`);
  }
  if (typeof sessionConnectCount === 'number' && sessionConnectCount > 1) {
    const attemptStr = typeof sessionAttemptCount === 'number' && sessionAttemptCount > sessionConnectCount
      ? `, ${sessionAttemptCount} attempts`
      : '';
    lines.push(`Session connects: ${sessionConnectCount} (reconnected ${sessionConnectCount - 1}×${attemptStr})`);
  }
  // Connection uptime percentage: how much of the process lifetime was spent connected.
  // Helps diagnose flaky connections at a glance (e.g. "connected 23% of the time" → fix your network).
  if (typeof processUptimeS === 'number' && processUptimeS > 0 && typeof firstConnectedAt === 'number' && firstConnectedAt > 0) {
    // Total connected time = (first connected → now) minus estimated disconnected time.
    // When currently connected, connectedSince gives the start of the current session.
    // Without precise per-session tracking, we approximate: total uptime minus time before
    // first connect minus current disconnect gap (if any).
    const timeSinceFirstConnect = now - firstConnectedAt;
    const currentDisconnectGap = connectedSince ? 0 : (lastDisconnectedAt ? now - lastDisconnectedAt : 0);
    const approxConnectedMs = Math.max(0, timeSinceFirstConnect - currentDisconnectGap);
    const uptimePercent = Math.min(100, Math.round((approxConnectedMs / (processUptimeS * 1000)) * 100));
    lines.push(`Connection uptime: ~${uptimePercent}%`);
  }
  if (typeof instanceId === 'string' && instanceId) lines.push(`Instance: ${instanceId}`);
  return lines.join('\n');
}
