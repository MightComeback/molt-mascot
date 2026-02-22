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
}) {
  const { SIZE_PRESETS, DEFAULT_SIZE_INDEX, VALID_SIZES, findSizePreset } = sizePresets;

  const resolvedAlign = env.MOLT_MASCOT_ALIGN || prefs.alignment || 'bottom-right';

  const resolvedSize = (() => {
    const label = (env.MOLT_MASCOT_SIZE || '').trim().toLowerCase();
    if (label && VALID_SIZES.includes(label)) return label;
    if (typeof prefs.sizeIndex === 'number' && prefs.sizeIndex >= 0 && prefs.sizeIndex < SIZE_PRESETS.length) {
      return SIZE_PRESETS[prefs.sizeIndex].label;
    }
    return SIZE_PRESETS[DEFAULT_SIZE_INDEX].label;
  })();

  const resolvedOpacityNum = (() => {
    const envVal = Number(env.MOLT_MASCOT_OPACITY);
    if (Number.isFinite(envVal) && envVal >= 0 && envVal <= 1) return envVal;
    if (typeof prefs.opacityIndex === 'number' && prefs.opacityIndex >= 0 && prefs.opacityIndex < opacityCycle.length) {
      return opacityCycle[prefs.opacityIndex];
    }
    return 1.0;
  })();

  const gatewayUrl = env.MOLT_MASCOT_GATEWAY_URL || env.GATEWAY_URL || env.OPENCLAW_GATEWAY_URL || env.CLAWDBOT_GATEWAY_URL || env.gatewayUrl || null;
  const hasToken = !!(env.MOLT_MASCOT_GATEWAY_TOKEN || env.GATEWAY_TOKEN || env.OPENCLAW_GATEWAY_TOKEN || env.CLAWDBOT_GATEWAY_TOKEN || env.gatewayToken);

  const resolvedPaddingNum = (() => {
    const envVal = Number(env.MOLT_MASCOT_PADDING);
    if (Number.isFinite(envVal) && envVal >= 0) return envVal;
    if (typeof prefs.padding === 'number' && prefs.padding >= 0) return prefs.padding;
    return 24;
  })();

  const clickThrough = isTruthyEnv(env.MOLT_MASCOT_CLICK_THROUGH || env.MOLT_MASCOT_CLICKTHROUGH) || prefs.clickThrough || false;
  const hideText = isTruthyEnv(env.MOLT_MASCOT_HIDE_TEXT) || prefs.hideText || false;
  const reducedMotion = isTruthyEnv(env.MOLT_MASCOT_REDUCED_MOTION);
  const startHidden = hasBoolFlag('--start-hidden', argv) || isTruthyEnv(env.MOLT_MASCOT_START_HIDDEN);
  const debug = hasBoolFlag('--debug', argv) || isTruthyEnv(env.MOLT_MASCOT_DEBUG);
  const disableGpu = hasBoolFlag('--disable-gpu', argv) || isTruthyEnv(env.MOLT_MASCOT_DISABLE_GPU);
  const noTray = hasBoolFlag('--no-tray', argv) || isTruthyEnv(env.MOLT_MASCOT_NO_TRAY);
  const noShortcuts = hasBoolFlag('--no-shortcuts', argv) || isTruthyEnv(env.MOLT_MASCOT_NO_SHORTCUTS);

  const sleepThresholdS = (() => { const v = Number(env.MOLT_MASCOT_SLEEP_THRESHOLD_S); return Number.isFinite(v) && v >= 0 ? v : 120; })();
  const idleDelayMs = (() => { const v = Number(env.MOLT_MASCOT_IDLE_DELAY_MS); return Number.isFinite(v) && v >= 0 ? v : 800; })();
  const errorHoldMs = (() => { const v = Number(env.MOLT_MASCOT_ERROR_HOLD_MS); return Number.isFinite(v) && v >= 0 ? v : 5000; })();
  const minProtocol = (() => { const v = Number(env.MOLT_MASCOT_MIN_PROTOCOL || env.GATEWAY_MIN_PROTOCOL); return Number.isInteger(v) && v > 0 ? v : 2; })();
  const maxProtocol = (() => { const v = Number(env.MOLT_MASCOT_MAX_PROTOCOL || env.GATEWAY_MAX_PROTOCOL); return Number.isInteger(v) && v > 0 ? v : 3; })();

  const resolvedSizePreset = findSizePreset(resolvedSize) || SIZE_PRESETS[DEFAULT_SIZE_INDEX];
  const resolvedWidth = (() => { const v = Number(env.MOLT_MASCOT_WIDTH); return Number.isFinite(v) && v > 0 ? v : resolvedSizePreset.width; })();
  const resolvedHeight = (() => { const v = Number(env.MOLT_MASCOT_HEIGHT); return Number.isFinite(v) && v > 0 ? v : resolvedSizePreset.height; })();

  return {
    version: appVersion,
    config: {
      gatewayUrl,
      gatewayToken: hasToken,
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
    `  Gateway URL:    ${c.gatewayUrl || '(not set)'}`,
    `  Gateway token:  ${c.gatewayToken ? '(set)' : '(not set)'}`,
    `  Alignment:      ${c.alignment}`,
    `  Size:           ${c.size} (${c.width}×${c.height}px)`,
    `  Padding:        ${c.padding}px`,
    `  Opacity:        ${Math.round(c.opacity * 100)}%`,
    `  Ghost mode:     ${c.clickThrough}`,
    `  Hide text:      ${c.hideText}`,
    `  Reduced motion: ${c.reducedMotion}`,
    `  Start hidden:   ${c.startHidden}`,
    `  Debug:          ${c.debug}`,
    `  Disable GPU:    ${c.disableGpu}`,
    `  No tray:        ${c.noTray}`,
    `  No shortcuts:   ${c.noShortcuts}`,
    `  Min protocol:   ${c.minProtocol}`,
    `  Max protocol:   ${c.maxProtocol}`,
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

  lines.push(`Platform: ${status.platform} ${status.arch}`);
  lines.push(`PID: ${status.pid}`);
  lines.push(`Electron: ${status.electron || 'n/a'}`);
  lines.push(`Node: ${status.node || 'n/a'}`);
  lines.push(`Chrome: ${status.chrome || 'n/a'}`);
  lines.push('');

  return lines.join('\n');
}

module.exports = { resolveStatusConfig, formatStatusText };
