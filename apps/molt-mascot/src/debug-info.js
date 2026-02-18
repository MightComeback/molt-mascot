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
 * @param {string} [params.platform] - navigator.platform
 * @param {number} [params.devicePixelRatio] - window.devicePixelRatio
 * @param {{ usedJSHeapSize?: number, totalJSHeapSize?: number, jsHeapSizeLimit?: number }} [params.memory] - performance.memory
 * @param {{ electron?: string, chrome?: string, node?: string }} [params.versions] - Runtime versions
 * @param {number} [params.canvasWidth] - Canvas element width in pixels
 * @param {number} [params.canvasHeight] - Canvas element height in pixels
 * @param {string} [params.lastCloseDetail] - Human-readable WebSocket close reason (e.g. "abnormal closure", "code 1006")
 * @param {number} [params.processUptimeS] - Electron process uptime in seconds (process.uptime())
 * @param {number} [params.sessionConnectCount] - Total successful handshakes since app launch (diagnoses flappy connections)
 * @param {number} [params.now] - Current timestamp (defaults to Date.now(); pass explicitly for deterministic tests)
 * @returns {string} Multi-line debug info
 */

import { formatDuration, wsReadyStateLabel } from './utils.js';

/**
 * Format the elapsed time since a past timestamp as a human-readable duration.
 * Centralizes the repeated `formatDuration(Math.max(0, Math.round((now - ts) / 1000)))` pattern.
 *
 * @param {number} since - Past timestamp (ms)
 * @param {number} now - Current timestamp (ms)
 * @returns {string} Formatted duration string (e.g. "5m 30s")
 */
export function formatElapsed(since, now) {
  return formatDuration(Math.max(0, Math.round((now - since) / 1000)));
}

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
    platform,
    devicePixelRatio,
    memory,
    versions,
    canvasWidth,
    canvasHeight,
    lastCloseDetail,
    processUptimeS,
    sessionConnectCount,
    now: nowOverride,
  } = params;

  const now = nowOverride ?? Date.now();

  const lines = [];
  const appVer = appVersion ? `v${appVersion}` : 'dev';
  lines.push(`Molt Mascot ${appVer}${pluginVersion ? ` (plugin v${pluginVersion})` : ''}`);
  lines.push(`Captured: ${new Date(now).toISOString()}`);
  lines.push(`Mode: ${currentMode}`);
  lines.push(`Mode duration: ${formatElapsed(modeSince, now)}`);
  if (connectedSince) {
    lines.push(`Uptime: ${formatElapsed(connectedSince, now)} (since ${new Date(connectedSince).toISOString()})`);
    lines.push(`Gateway: ${connectedUrl}`);
    lines.push(`WebSocket: ${wsReadyStateLabel(wsReadyState)}`);
    // Show last disconnect even when connected — helps debug flaky connections
    if (lastDisconnectedAt) {
      lines.push(`Last disconnect: ${formatElapsed(lastDisconnectedAt, now)} ago (at ${new Date(lastDisconnectedAt).toISOString()})`);
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
  }
  lines.push(`Plugin: ${hasPlugin ? 'active' : 'inactive'}`);
  if (hasPlugin) {
    if (pluginStateMethod) lines.push(`Plugin method: ${pluginStateMethod}`);
    if (pluginStartedAt) {
      lines.push(`Plugin uptime: ${formatElapsed(pluginStartedAt, now)} (since ${new Date(pluginStartedAt).toISOString()})`);
    }
  }
  if (pluginToolCalls > 0) {
    const successRate = pluginToolErrors > 0
      ? ` (${Math.round(((pluginToolCalls - pluginToolErrors) / pluginToolCalls) * 100)}% ok)`
      : '';
    lines.push(`Tool calls: ${pluginToolCalls}, errors: ${pluginToolErrors}${successRate}`);
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
  lines.push(`Platform: ${platform || 'unknown'}`);
  const dpr = devicePixelRatio ?? 1;
  const canvasDims = (typeof canvasWidth === 'number' && typeof canvasHeight === 'number')
    ? `, ${canvasWidth}×${canvasHeight}px`
    : '';
  lines.push(`Display scale: ${dpr}x (canvas scale: ${canvasScale}${canvasDims})`);
  if (memory && typeof memory.usedJSHeapSize === 'number') {
    const used = (memory.usedJSHeapSize / 1048576).toFixed(1);
    const total = (memory.totalJSHeapSize / 1048576).toFixed(1);
    const limit = (memory.jsHeapSizeLimit / 1048576).toFixed(0);
    lines.push(`Memory: ${used}MB used / ${total}MB total (limit ${limit}MB)`);
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
    lines.push(`Session connects: ${sessionConnectCount} (reconnected ${sessionConnectCount - 1}×)`);
  }
  return lines.join('\n');
}
