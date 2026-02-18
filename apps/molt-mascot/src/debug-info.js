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
 * @param {number} [params.processUptimeS] - Electron process uptime in seconds (process.uptime())
 * @param {number} [params.now] - Current timestamp (defaults to Date.now(); pass explicitly for deterministic tests)
 * @returns {string} Multi-line debug info
 */

import { formatDuration, wsReadyStateLabel } from './utils.js';

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
    processUptimeS,
    now: nowOverride,
  } = params;

  const now = nowOverride ?? Date.now();

  const lines = [];
  const appVer = appVersion ? `v${appVersion}` : 'dev';
  lines.push(`Molt Mascot ${appVer}${pluginVersion ? ` (plugin v${pluginVersion})` : ''}`);
  lines.push(`Captured: ${new Date(now).toISOString()}`);
  lines.push(`Mode: ${currentMode}`);
  const dur = Math.max(0, Math.round((now - modeSince) / 1000));
  lines.push(`Mode duration: ${formatDuration(dur)}`);
  if (connectedSince) {
    const up = Math.max(0, Math.round((now - connectedSince) / 1000));
    lines.push(`Uptime: ${formatDuration(up)} (since ${new Date(connectedSince).toISOString()})`);
    lines.push(`Gateway: ${connectedUrl}`);
    lines.push(`WebSocket: ${wsReadyStateLabel(wsReadyState)}`);
  } else {
    if (lastDisconnectedAt) {
      const disconnectedAgo = formatDuration(Math.max(0, Math.round((now - lastDisconnectedAt) / 1000)));
      lines.push(`Gateway: disconnected ${disconnectedAgo} ago (at ${new Date(lastDisconnectedAt).toISOString()})`);
    } else {
      lines.push(`Gateway: disconnected`);
    }
    lines.push(`WebSocket: ${wsReadyStateLabel(wsReadyState)}`);
    if (reconnectAttempt > 0) lines.push(`Reconnect attempt: ${reconnectAttempt}`);
    if (savedUrl) lines.push(`Saved URL: ${savedUrl}`);
  }
  lines.push(`Plugin: ${hasPlugin ? 'active' : 'inactive'}`);
  if (hasPlugin) {
    if (pluginStateMethod) lines.push(`Plugin method: ${pluginStateMethod}`);
    if (pluginStartedAt) {
      const pluginUp = Math.max(0, Math.round((now - pluginStartedAt) / 1000));
      lines.push(`Plugin uptime: ${formatDuration(pluginUp)} (since ${new Date(pluginStartedAt).toISOString()})`);
    }
  }
  if (pluginToolCalls > 0) lines.push(`Tool calls: ${pluginToolCalls}, errors: ${pluginToolErrors}`);
  if (currentTool) lines.push(`Current tool: ${currentTool}`);
  if (lastErrorMessage) lines.push(`Last error: ${lastErrorMessage}`);
  lines.push(`Alignment: ${alignmentLabel || 'bottom-right'}`);
  lines.push(`Size: ${sizeLabel}, Opacity: ${Math.round(opacity * 100)}%`);
  lines.push(`Ghost: ${isClickThrough}, Hide text: ${isTextHidden}`);
  lines.push(`Sleep threshold: ${sleepThresholdS}s, Idle delay: ${idleDelayMs}ms, Error hold: ${errorHoldMs}ms`);
  lines.push(`Reduced motion: ${reducedMotion}`);
  const fpsLabel = frameIntervalMs === 0 ? '~60fps' : `~${Math.round(1000 / frameIntervalMs)}fps`;
  lines.push(`Frame rate: ${fpsLabel}${reducedMotion ? ' (reduced)' : ''}`);
  lines.push(`Platform: ${platform || 'unknown'}`);
  const dpr = devicePixelRatio ?? 1;
  lines.push(`Display scale: ${dpr}x (canvas scale: ${canvasScale})`);
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
  return lines.join('\n');
}
