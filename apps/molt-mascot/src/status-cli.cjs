const { GATEWAY_URL_KEYS, GATEWAY_TOKEN_KEYS, resolveEnvWithSource } = require('./env-keys.cjs');
const { formatDuration, formatTimestampLocal } = require('@molt/mascot-plugin');
const { formatOpacity } = require('./opacity-presets.cjs');
const { formatProtocolRange } = require('./format-latency.cjs');

/**
 * Resolve the effective configuration for --status output.
 * Extracted from electron-main.cjs for testability.
 *
 * @param {object} params
 * @param {string} params.appVersion - Package version
 * @param {object} params.prefs - Loaded saved preferences
 * @param {object} params.env - Process env vars (or subset)
 * @param {string[]} params.argv - Process argv
 * @param {number} params.pid - Process PID
 * @param {string} params.platform - Process platform
 * @param {string} params.arch - Process architecture
 * @param {{ electron?: string, node?: string, chrome?: string }} params.versions - Runtime versions
 * @param {string|null} params.prefsPath - Path to preferences file (null if not found)
 * @param {typeof import('./size-presets.cjs')} params.sizePresets - Size presets module
 * @param {number[]} params.opacityCycle - Opacity presets array
 * @param {typeof import('./is-truthy-env.cjs').isTruthyEnv} params.isTruthyEnv - Boolean env parser
 * @param {typeof import('./parse-cli-arg.cjs').hasBoolFlag} params.hasBoolFlag - Boolean flag checker
 * @param {number} [params.uptimeSeconds] - Process uptime in seconds (from process.uptime())
 * @param {number} [params.startedAt] - Epoch ms when the process started (Date.now() - uptime*1000)
 * @returns {object} Resolved status config object
 */
function resolveStatusConfig({
  appVersion,
  prefs,
  env,
  argv,
  pid,
  platform,
  arch,
  versions,
  prefsPath,
  sizePresets,
  opacityCycle,
  isTruthyEnv,
  hasBoolFlag,
  uptimeSeconds,
  startedAt,
}) {
  const { SIZE_PRESETS, DEFAULT_SIZE_INDEX, isValidSize, findSizePreset } = sizePresets;

  const resolvedAlign = env.MOLT_MASCOT_ALIGN || prefs.alignment || 'bottom-right';

  const resolvedSize = (() => {
    const label = (env.MOLT_MASCOT_SIZE || '').trim().toLowerCase();
    if (label && isValidSize(label)) return label;
    if (typeof prefs.sizeIndex === 'number' && prefs.sizeIndex >= 0 && prefs.sizeIndex < SIZE_PRESETS.length) {
      return SIZE_PRESETS[prefs.sizeIndex].label;
    }
    return SIZE_PRESETS[DEFAULT_SIZE_INDEX].label;
  })();

  const resolvedOpacityNum = (() => {
    const envVal = Number(env.MOLT_MASCOT_OPACITY);
    if (Number.isFinite(envVal) && envVal >= 0 && envVal <= 1) return envVal;
    // Prefer raw opacity value (preserves arbitrary scroll-wheel values).
    if (typeof prefs.opacity === 'number' && Number.isFinite(prefs.opacity) && prefs.opacity >= 0 && prefs.opacity <= 1) {
      return prefs.opacity;
    }
    // Fall back to preset index for backward compatibility.
    if (typeof prefs.opacityIndex === 'number' && prefs.opacityIndex >= 0 && prefs.opacityIndex < opacityCycle.length) {
      return opacityCycle[prefs.opacityIndex];
    }
    return 1.0;
  })();

  const gatewayUrlSource = resolveEnvWithSource(GATEWAY_URL_KEYS, env);
  const gatewayUrl = gatewayUrlSource?.value || null;
  const gatewayTokenSource = resolveEnvWithSource(GATEWAY_TOKEN_KEYS, env);
  const hasToken = !!gatewayTokenSource;

  const resolvedPaddingNum = (() => {
    const envVal = Number(env.MOLT_MASCOT_PADDING);
    if (Number.isFinite(envVal) && envVal >= 0) return envVal;
    if (typeof prefs.padding === 'number' && prefs.padding >= 0) return prefs.padding;
    return 24;
  })();

  const clickThrough = isTruthyEnv(env.MOLT_MASCOT_CLICK_THROUGH || env.MOLT_MASCOT_CLICKTHROUGH) || prefs.clickThrough || false;
  const hideText = isTruthyEnv(env.MOLT_MASCOT_HIDETEXT || env.MOLT_MASCOT_HIDE_TEXT) || prefs.hideText || false;
  const reducedMotion = isTruthyEnv(env.MOLT_MASCOT_REDUCED_MOTION);
  const startHidden = hasBoolFlag('--start-hidden', argv) || isTruthyEnv(env.MOLT_MASCOT_START_HIDDEN);
  const debug = hasBoolFlag('--debug', argv) || isTruthyEnv(env.MOLT_MASCOT_DEBUG);
  const disableGpu = hasBoolFlag('--disable-gpu', argv) || isTruthyEnv(env.MOLT_MASCOT_DISABLE_GPU);
  const noTray = hasBoolFlag('--no-tray', argv) || isTruthyEnv(env.MOLT_MASCOT_NO_TRAY);
  const noShortcuts = hasBoolFlag('--no-shortcuts', argv) || isTruthyEnv(env.MOLT_MASCOT_NO_SHORTCUTS);
  const captureDir = env.MOLT_MASCOT_CAPTURE_DIR || null;

  const sleepThresholdS = (() => { const v = Number(env.MOLT_MASCOT_SLEEP_THRESHOLD_S); return Number.isFinite(v) && v >= 0 ? v : 120; })();
  const idleDelayMs = (() => { const v = Number(env.MOLT_MASCOT_IDLE_DELAY_MS); return Number.isFinite(v) && v >= 0 ? v : 800; })();
  const errorHoldMs = (() => { const v = Number(env.MOLT_MASCOT_ERROR_HOLD_MS); return Number.isFinite(v) && v >= 0 ? v : 5000; })();
  const minProtocol = (() => { const v = Number(env.MOLT_MASCOT_MIN_PROTOCOL || env.GATEWAY_MIN_PROTOCOL); return Number.isInteger(v) && v > 0 ? v : 2; })();
  const maxProtocol = (() => { const v = Number(env.MOLT_MASCOT_MAX_PROTOCOL || env.GATEWAY_MAX_PROTOCOL); return Number.isInteger(v) && v > 0 ? v : 3; })();

  const resolvedSizePreset = findSizePreset(resolvedSize) || SIZE_PRESETS[DEFAULT_SIZE_INDEX];
  const resolvedWidth = (() => { const v = Number(env.MOLT_MASCOT_WIDTH); return Number.isFinite(v) && v > 0 ? v : resolvedSizePreset.width; })();
  const resolvedHeight = (() => { const v = Number(env.MOLT_MASCOT_HEIGHT); return Number.isFinite(v) && v > 0 ? v : resolvedSizePreset.height; })();

  // Detect which env vars are actively influencing config (helps debug "why is my config wrong?")
  const ENV_OVERRIDES_MAP = [
    ['MOLT_MASCOT_GATEWAY_URL',    'gatewayUrl'],
    ['GATEWAY_URL',                'gatewayUrl'],
    ['OPENCLAW_GATEWAY_URL',       'gatewayUrl'],
    ['CLAWDBOT_GATEWAY_URL',       'gatewayUrl'],
    ['MOLT_MASCOT_GATEWAY_TOKEN',  'gatewayToken'],
    ['GATEWAY_TOKEN',              'gatewayToken'],
    ['OPENCLAW_GATEWAY_TOKEN',     'gatewayToken'],
    ['CLAWDBOT_GATEWAY_TOKEN',     'gatewayToken'],
    ['MOLT_MASCOT_ALIGN',          'alignment'],
    ['MOLT_MASCOT_SIZE',           'size'],
    ['MOLT_MASCOT_OPACITY',        'opacity'],
    ['MOLT_MASCOT_PADDING',        'padding'],
    ['MOLT_MASCOT_CLICK_THROUGH',  'clickThrough'],
    ['MOLT_MASCOT_CLICKTHROUGH',   'clickThrough'],
    ['MOLT_MASCOT_HIDETEXT',       'hideText'],
    ['MOLT_MASCOT_HIDE_TEXT',      'hideText'],
    ['MOLT_MASCOT_REDUCED_MOTION', 'reducedMotion'],
    ['MOLT_MASCOT_START_HIDDEN',   'startHidden'],
    ['MOLT_MASCOT_DEBUG',          'debug'],
    ['MOLT_MASCOT_DISABLE_GPU',    'disableGpu'],
    ['MOLT_MASCOT_NO_TRAY',        'noTray'],
    ['MOLT_MASCOT_NO_SHORTCUTS',   'noShortcuts'],
    ['MOLT_MASCOT_WIDTH',          'width'],
    ['MOLT_MASCOT_HEIGHT',         'height'],
    ['MOLT_MASCOT_SLEEP_THRESHOLD_S', 'sleepThreshold'],
    ['MOLT_MASCOT_IDLE_DELAY_MS',  'idleDelay'],
    ['MOLT_MASCOT_ERROR_HOLD_MS',  'errorHold'],
    ['MOLT_MASCOT_MIN_PROTOCOL',   'minProtocol'],
    ['GATEWAY_MIN_PROTOCOL',       'minProtocol'],
    ['MOLT_MASCOT_MAX_PROTOCOL',   'maxProtocol'],
    ['GATEWAY_MAX_PROTOCOL',       'maxProtocol'],
    ['MOLT_MASCOT_CAPTURE_DIR',    'captureDir'],
  ];
  const envOverrides = ENV_OVERRIDES_MAP
    .filter(([key]) => env[key] !== undefined && env[key] !== '')
    .map(([key, affects]) => ({ key, affects }));

  return {
    version: appVersion,
    envOverrides,
    config: {
      gatewayUrl,
      gatewayUrlSource: gatewayUrlSource?.key || null,
      gatewayToken: hasToken,
      gatewayTokenSource: gatewayTokenSource?.key || null,
      alignment: resolvedAlign,
      size: resolvedSize,
      width: resolvedWidth,
      height: resolvedHeight,
      padding: resolvedPaddingNum,
      opacity: resolvedOpacityNum,
      clickThrough,
      hideText,
      reducedMotion,
      startHidden,
      debug,
      disableGpu,
      noTray,
      noShortcuts,
      minProtocol,
      maxProtocol,
      captureDir,
    },
    timing: {
      sleepThresholdS,
      idleDelayMs,
      errorHoldMs,
    },
    preferences: prefsPath ? prefs : null,
    preferencesFile: prefsPath,
    pid,
    platform,
    arch,
    electron: versions.electron || null,
    node: versions.node || null,
    chrome: versions.chrome || null,
    bun: versions.bun || null,
    uptime: typeof uptimeSeconds === 'number' && uptimeSeconds >= 0 ? uptimeSeconds : null,
    startedAt: typeof startedAt === 'number' && Number.isFinite(startedAt) ? startedAt : null,
  };
}

/**
 * Format the resolved status config as a human-readable string.
 *
 * @param {object} status - Output of resolveStatusConfig()
 * @returns {string}
 */
function formatStatusText(status) {
  const c = status.config;
  const t = status.timing;
  const lines = [
    `Molt Mascot v${status.version}`,
    '',
    'Config (resolved):',
    `  Gateway URL:    ${c.gatewayUrl || '(not set)'}${c.gatewayUrlSource ? ` (via ${c.gatewayUrlSource})` : ''}`,
    `  Gateway token:  ${c.gatewayToken ? '(set)' : '(not set)'}${c.gatewayTokenSource ? ` (via ${c.gatewayTokenSource})` : ''}`,
    `  Alignment:      ${c.alignment}`,
    `  Size:           ${c.size} (${c.width}×${c.height}px)`,
    `  Padding:        ${c.padding}px`,
    `  Opacity:        ${formatOpacity(c.opacity)}`,
    `  Ghost mode:     ${c.clickThrough}`,
    `  Hide text:      ${c.hideText}`,
    `  Reduced motion: ${c.reducedMotion}`,
    `  Start hidden:   ${c.startHidden}`,
    `  Debug:          ${c.debug}`,
    `  Disable GPU:    ${c.disableGpu}`,
    `  No tray:        ${c.noTray}`,
    `  No shortcuts:   ${c.noShortcuts}`,
    `  Protocol:       ${formatProtocolRange(c.minProtocol, c.maxProtocol)}`,
    ...(c.captureDir ? [`  Capture dir:    ${c.captureDir}`] : []),
    '',
    'Timing:',
    `  Sleep threshold: ${t.sleepThresholdS}s`,
    `  Idle delay:      ${t.idleDelayMs}ms`,
    `  Error hold:      ${t.errorHoldMs}ms`,
    '',
    `Preferences file: ${status.preferencesFile || '(none)'}`,
  ];

  if (status.preferences && Object.keys(status.preferences).length > 0) {
    lines.push('Saved preferences:');
    for (const [k, v] of Object.entries(status.preferences)) {
      lines.push(`  ${k}: ${JSON.stringify(v)}`);
    }
  }

  if (status.envOverrides && status.envOverrides.length > 0) {
    lines.push('');
    lines.push('Active env overrides:');
    for (const { key, affects } of status.envOverrides) {
      lines.push(`  ${key} → ${affects}`);
    }
  }

  lines.push('');
  lines.push('Runtime:');
  lines.push(`  Platform:  ${status.platform} ${status.arch}`);
  lines.push(`  PID:       ${status.pid}`);
  lines.push(`  Electron:  ${status.electron || 'n/a'}`);
  lines.push(`  Node:      ${status.node || 'n/a'}`);
  lines.push(`  Chrome:    ${status.chrome || 'n/a'}`);
  if (status.bun) lines.push(`  Bun:       ${status.bun}`);
  if (typeof status.uptime === 'number') {
    const uptimeStr = formatDuration(status.uptime);
    const startedAt = typeof status.startedAt === 'number' ? ` (since ${formatTimestampLocal(status.startedAt)})` : '';
    lines.push(`  Uptime:    ${uptimeStr}${startedAt}`);
  }
  lines.push('');

  return lines.join('\n');
}

module.exports = { resolveStatusConfig, formatStatusText };
