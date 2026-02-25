const { GATEWAY_URL_KEYS, GATEWAY_TOKEN_KEYS, resolveEnvWithSource, parseEnvNumber, parseEnvBoolean } = require('./env-keys.cjs');
const { formatDuration, formatTimestampLocal } = require('@molt/mascot-plugin');
const { formatOpacity, isValidOpacity } = require('./opacity-presets.cjs');
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
  hasBoolFlag,
  uptimeSeconds,
  startedAt,
}) {
  const { SIZE_PRESETS, DEFAULT_SIZE_INDEX, isValidSize, findSizePreset } = sizePresets;

  const resolvedAlign = env.MOLT_MASCOT_ALIGN || prefs.alignment || 'bottom-right';

  const resolvedSize = (() => {
    const label = (env.MOLT_MASCOT_SIZE || '').trim().toLowerCase();
    if (label && isValidSize(label)) return label;
    // Prefer saved size label (robust across preset reorder) over numeric index.
    // Mirrors the resolution order in electron-main.cjs app-ready handler.
    if (typeof prefs.size === 'string' && prefs.size && isValidSize(prefs.size)) return prefs.size.toLowerCase();
    if (typeof prefs.sizeIndex === 'number' && prefs.sizeIndex >= 0 && prefs.sizeIndex < SIZE_PRESETS.length) {
      return SIZE_PRESETS[prefs.sizeIndex].label;
    }
    return SIZE_PRESETS[DEFAULT_SIZE_INDEX].label;
  })();

  const resolvedOpacityNum = (() => {
    const envVal = parseEnvNumber(env, 'MOLT_MASCOT_OPACITY', -1, { min: 0, max: 1 });
    if (envVal >= 0) return envVal;
    // Prefer raw opacity value (preserves arbitrary scroll-wheel values).
    if (isValidOpacity(prefs.opacity)) {
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
    const envVal = parseEnvNumber(env, 'MOLT_MASCOT_PADDING', -1, { min: 0 });
    if (envVal >= 0) return envVal;
    if (typeof prefs.padding === 'number' && prefs.padding >= 0) return prefs.padding;
    return 24;
  })();

  const clickThrough = parseEnvBoolean(env, ['MOLT_MASCOT_CLICK_THROUGH', 'MOLT_MASCOT_CLICKTHROUGH'], prefs.clickThrough || false);
  const hideText = parseEnvBoolean(env, ['MOLT_MASCOT_HIDETEXT', 'MOLT_MASCOT_HIDE_TEXT'], prefs.hideText || false);
  const reducedMotion = parseEnvBoolean(env, 'MOLT_MASCOT_REDUCED_MOTION', prefs.reducedMotion || false);
  const startHidden = hasBoolFlag('--start-hidden', argv) || parseEnvBoolean(env, 'MOLT_MASCOT_START_HIDDEN', false);
  const debug = hasBoolFlag('--debug', argv) || parseEnvBoolean(env, 'MOLT_MASCOT_DEBUG', false);
  const disableGpu = hasBoolFlag('--disable-gpu', argv) || parseEnvBoolean(env, 'MOLT_MASCOT_DISABLE_GPU', false);
  const noTray = hasBoolFlag('--no-tray', argv) || parseEnvBoolean(env, 'MOLT_MASCOT_NO_TRAY', false);
  const noShortcuts = hasBoolFlag('--no-shortcuts', argv) || parseEnvBoolean(env, 'MOLT_MASCOT_NO_SHORTCUTS', false);
  const captureDir = env.MOLT_MASCOT_CAPTURE_DIR || null;

  // Timing: env vars take precedence, then saved prefs, then defaults.
  // Helper to resolve: env → saved pref → default.
  const timingPref = (envKey, prefKey, fallback, opts) => {
    const fromEnv = parseEnvNumber(env, envKey, NaN, opts);
    if (Number.isFinite(fromEnv)) return fromEnv;
    if (typeof prefs[prefKey] === 'number' && Number.isFinite(prefs[prefKey])) {
      const v = prefs[prefKey];
      if (opts?.min !== undefined && v < opts.min) return fallback;
      if (opts?.integer && !Number.isInteger(v)) return fallback;
      return v;
    }
    return fallback;
  };
  const sleepThresholdS = timingPref('MOLT_MASCOT_SLEEP_THRESHOLD_S', 'sleepThresholdS', 120, { min: 0 });
  const idleDelayMs = timingPref('MOLT_MASCOT_IDLE_DELAY_MS', 'idleDelayMs', 800, { min: 0 });
  const errorHoldMs = timingPref('MOLT_MASCOT_ERROR_HOLD_MS', 'errorHoldMs', 5000, { min: 0 });
  const minProtocol = parseEnvNumber(env, ['MOLT_MASCOT_MIN_PROTOCOL', 'GATEWAY_MIN_PROTOCOL'], 2, { min: 1, integer: true });
  const maxProtocol = parseEnvNumber(env, ['MOLT_MASCOT_MAX_PROTOCOL', 'GATEWAY_MAX_PROTOCOL'], 3, { min: 1, integer: true });
  const reconnectBaseMs = timingPref('MOLT_MASCOT_RECONNECT_BASE_MS', 'reconnectBaseMs', 1500, { min: 0 });
  const reconnectMaxMs = timingPref('MOLT_MASCOT_RECONNECT_MAX_MS', 'reconnectMaxMs', 30000, { min: 0 });
  const staleConnectionMs = timingPref('MOLT_MASCOT_STALE_CONNECTION_MS', 'staleConnectionMs', 15000, { min: 0 });
  const staleCheckIntervalMs = timingPref('MOLT_MASCOT_STALE_CHECK_INTERVAL_MS', 'staleCheckIntervalMs', 5000, { min: 0 });
  const pollIntervalMs = timingPref('MOLT_MASCOT_POLL_INTERVAL_MS', 'pollIntervalMs', 1000, { min: 100 });

  const resolvedSizePreset = findSizePreset(resolvedSize) || SIZE_PRESETS[DEFAULT_SIZE_INDEX];
  const resolvedWidth = parseEnvNumber(env, 'MOLT_MASCOT_WIDTH', resolvedSizePreset.width, { min: 1 });
  const resolvedHeight = parseEnvNumber(env, 'MOLT_MASCOT_HEIGHT', resolvedSizePreset.height, { min: 1 });

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
    ['MOLT_MASCOT_RECONNECT_BASE_MS',     'reconnectBase'],
    ['MOLT_MASCOT_RECONNECT_MAX_MS',      'reconnectMax'],
    ['MOLT_MASCOT_STALE_CONNECTION_MS',    'staleConnection'],
    ['MOLT_MASCOT_STALE_CHECK_INTERVAL_MS', 'staleCheckInterval'],
    ['MOLT_MASCOT_POLL_INTERVAL_MS',       'pollInterval'],
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
      reconnectBaseMs,
      reconnectMaxMs,
      staleConnectionMs,
      staleCheckIntervalMs,
      pollIntervalMs,
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
    `  Sleep threshold:      ${t.sleepThresholdS}s`,
    `  Idle delay:           ${t.idleDelayMs}ms`,
    `  Error hold:           ${t.errorHoldMs}ms`,
    `  Reconnect base:       ${t.reconnectBaseMs}ms`,
    `  Reconnect max:        ${t.reconnectMaxMs}ms`,
    `  Stale connection:     ${t.staleConnectionMs}ms`,
    `  Stale check interval: ${t.staleCheckIntervalMs}ms`,
    `  Poll interval:        ${t.pollIntervalMs}ms`,
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
