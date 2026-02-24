const { app, BrowserWindow, screen, globalShortcut, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const { isTruthyEnv, parseBooleanEnv } = require('./is-truthy-env.cjs');
const { REPO_URL } = require('./env-keys.cjs');
const { getPosition: _getPosition, clampToWorkArea } = require('./get-position.cjs');
const { renderTraySprite, buildTrayTooltip } = require('./tray-icon.cjs');
const { SIZE_PRESETS, DEFAULT_SIZE_INDEX, VALID_SIZES } = require('./size-presets.cjs');
const { formatDuration } = require('@molt/mascot-plugin');

const APP_VERSION = require('../package.json').version;

// Opacity presets cycled by the keyboard shortcut / context menu.
// Imported from the shared module (single source of truth) so electron-main,
// status-cli, and opacity-presets.test all reference the same values.
const { OPACITY_PRESETS: OPACITY_CYCLE, formatOpacity } = require('./opacity-presets.cjs');

// --- User preference persistence ---
// Delegated to prefs.cjs for testability (atomic writes, debounced batching).
const { parseModeUpdate } = require('./parse-mode-update.cjs');
const { createPrefsManager, validatePrefs } = require('./prefs.cjs');
const PREFS_FILE = path.join(app.getPath('userData'), 'preferences.json');
const _prefs = createPrefsManager(PREFS_FILE);
const loadPrefs = _prefs.load;
const savePrefs = _prefs.save;

// CLI flags: --version prints version and exits (standard UX pattern).
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  process.stdout.write(`molt-mascot ${APP_VERSION}\n`);
  process.exit(0);
}

// CLI flags: --gateway <url> and --token <token> override env vars.
// Parsed early so they're available as env vars for the preload script.
const { parseCliArg, hasBoolFlag, parseNumericArg, parseStringArg } = require('./parse-cli-arg.cjs');
const cliGatewayUrl = parseCliArg('--gateway');
const cliGatewayToken = parseCliArg('--token');
if (cliGatewayUrl) process.env.MOLT_MASCOT_GATEWAY_URL = cliGatewayUrl;
if (cliGatewayToken) process.env.MOLT_MASCOT_GATEWAY_TOKEN = cliGatewayToken;

// CLI flags for appearance customization (override env vars).
// Uses parseStringArg with allowed-values validation for --align and --size,
// consolidating the manual parseCliArg + isValid pattern into a single call.
const { VALID_ALIGNMENTS, isValidOpacity, isValidPadding } = require('./get-position.cjs');
{
  const raw = parseCliArg('--align');
  const cliAlign = parseStringArg('--align', null, { allowed: VALID_ALIGNMENTS });
  if (cliAlign) {
    process.env.MOLT_MASCOT_ALIGN = cliAlign;
  } else if (raw !== null) {
    process.stderr.write(`molt-mascot: invalid --align "${raw}" (valid: ${VALID_ALIGNMENTS.join(', ')})\n`);
  }
}
{
  const raw = parseCliArg('--size');
  const cliSize = parseStringArg('--size', null, { allowed: VALID_SIZES });
  if (cliSize) {
    process.env.MOLT_MASCOT_SIZE = cliSize.toLowerCase();
  } else if (raw !== null) {
    process.stderr.write(`molt-mascot: invalid --size "${raw}" (valid: ${VALID_SIZES.join(', ')})\n`);
  }
}
{
  const cliOpacity = parseCliArg('--opacity');
  if (cliOpacity) {
    const ov = Number(cliOpacity);
    if (isValidOpacity(ov)) {
      process.env.MOLT_MASCOT_OPACITY = cliOpacity;
    } else {
      process.stderr.write(`molt-mascot: invalid --opacity "${cliOpacity}" (must be 0.0–1.0)\n`);
    }
  }
}
{
  const cliPadding = parseCliArg('--padding');
  if (cliPadding) {
    const pv = Number(cliPadding);
    if (isValidPadding(pv)) {
      process.env.MOLT_MASCOT_PADDING = cliPadding;
    } else {
      process.stderr.write(`molt-mascot: invalid --padding "${cliPadding}" (must be >= 0)\n`);
    }
  }
}

// CLI flags for boolean appearance toggles (override env vars).
if (hasBoolFlag('--click-through')) process.env.MOLT_MASCOT_CLICK_THROUGH = '1';
if (hasBoolFlag('--hide-text')) process.env.MOLT_MASCOT_HIDE_TEXT = '1';
if (hasBoolFlag('--reduced-motion')) process.env.MOLT_MASCOT_REDUCED_MOTION = '1';
if (hasBoolFlag('--start-hidden')) process.env.MOLT_MASCOT_START_HIDDEN = '1';

// CLI flags for protocol negotiation (useful when connecting to different Gateway versions).
// Uses parseNumericArg to replace the repeated parseCliArg + Number + validate pattern.
{
  const v = parseNumericArg('--min-protocol', -1, { min: 1, integer: true });
  if (v > 0) process.env.MOLT_MASCOT_MIN_PROTOCOL = String(v);
  else if (parseCliArg('--min-protocol') !== null) process.stderr.write(`molt-mascot: invalid --min-protocol "${parseCliArg('--min-protocol')}" (must be a positive integer)\n`);
}
{
  const v = parseNumericArg('--max-protocol', -1, { min: 1, integer: true });
  if (v > 0) process.env.MOLT_MASCOT_MAX_PROTOCOL = String(v);
  else if (parseCliArg('--max-protocol') !== null) process.stderr.write(`molt-mascot: invalid --max-protocol "${parseCliArg('--max-protocol')}" (must be a positive integer)\n`);
}

// CLI flags for timing customization (override env vars).
{
  const v = parseNumericArg('--sleep-threshold', -1, { min: 0 });
  if (v >= 0) process.env.MOLT_MASCOT_SLEEP_THRESHOLD_S = String(v);
  else if (parseCliArg('--sleep-threshold') !== null) process.stderr.write(`molt-mascot: invalid --sleep-threshold "${parseCliArg('--sleep-threshold')}" (must be >= 0 seconds)\n`);
}
{
  const v = parseNumericArg('--idle-delay', -1, { min: 0 });
  if (v >= 0) process.env.MOLT_MASCOT_IDLE_DELAY_MS = String(v);
  else if (parseCliArg('--idle-delay') !== null) process.stderr.write(`molt-mascot: invalid --idle-delay "${parseCliArg('--idle-delay')}" (must be >= 0 ms)\n`);
}
{
  const v = parseNumericArg('--error-hold', -1, { min: 0 });
  if (v >= 0) process.env.MOLT_MASCOT_ERROR_HOLD_MS = String(v);
  else if (parseCliArg('--error-hold') !== null) process.stderr.write(`molt-mascot: invalid --error-hold "${parseCliArg('--error-hold')}" (must be >= 0 ms)\n`);
}

// CLI flag: --capture-dir <path> overrides MOLT_MASCOT_CAPTURE_DIR env var.
// Useful for CI/dev screenshot pipelines without setting env vars.
{
  const v = parseCliArg('--capture-dir');
  if (v) process.env.MOLT_MASCOT_CAPTURE_DIR = v;
}

// CLI flags: --reset-prefs clears saved preferences and starts fresh.
// Useful when the mascot ends up in a bad state (off-screen, invisible, etc.).
// Uses _prefs.clear() to atomically cancel pending writes and delete the file,
// avoiding race conditions with any in-flight debounced saves.
if (hasBoolFlag('--reset-prefs')) {
  try {
    const deleted = _prefs.clear();
    if (deleted) {
      process.stdout.write(`molt-mascot: preferences reset (deleted ${PREFS_FILE})\n`);
    } else {
      process.stdout.write(`molt-mascot: no preferences file to reset\n`);
    }
  } catch (err) {
    process.stderr.write(`molt-mascot: failed to reset preferences: ${err.message}\n`);
  }
  // Continue launching with defaults (don't exit) so the user sees the fresh state.
}

// CLI flags: --list-prefs prints the saved preferences file and exits.
// Useful for diagnosing why the mascot is positioned oddly or has unexpected settings.
if (hasBoolFlag('--list-prefs')) {
  try {
    const prefsPath = path.join(app.getPath('userData'), 'preferences.json');
    if (fs.existsSync(prefsPath)) {
      const data = fs.readFileSync(prefsPath, 'utf8');
      process.stdout.write(`${prefsPath}\n${data}\n`);
      // Validate and warn about invalid/unknown keys so users can diagnose
      // hand-edited preferences that silently fail at runtime.
      try {
        const parsed = JSON.parse(data);
        const { dropped } = validatePrefs(parsed);
        if (dropped.length > 0) {
          process.stdout.write('\nWarnings:\n');
          for (const { key, reason } of dropped) {
            process.stdout.write(`  ⚠ ${key}: ${reason}\n`);
          }
        }
      } catch {}
    } else {
      process.stdout.write(`No preferences file found (${prefsPath})\n`);
    }
  } catch (err) {
    process.stderr.write(`Failed to read preferences: ${err.message}\n`);
  }
  process.exit(0);
}

// CLI flags: --status prints a compact diagnostic summary showing the resolved
// config (env vars + saved prefs + CLI overrides) and exits. Helps answer
// "what settings will the mascot actually use?" without launching the GUI.
// Logic extracted to status-cli.cjs for testability.
if (hasBoolFlag('--status')) {
  const { resolveStatusConfig, formatStatusText } = require('./status-cli.cjs');
  const prefsPath = path.join(app.getPath('userData'), 'preferences.json');
  const prefsExist = fs.existsSync(prefsPath);
  const statusConfig = resolveStatusConfig({
    appVersion: APP_VERSION,
    prefs: loadPrefs(),
    env: process.env,
    argv: process.argv,
    pid: process.pid,
    platform: process.platform,
    arch: process.arch,
    versions: process.versions,
    prefsPath: prefsExist ? prefsPath : null,
    sizePresets: require('./size-presets.cjs'),
    opacityCycle: OPACITY_CYCLE,
    isTruthyEnv,
    hasBoolFlag,
    uptimeSeconds: Math.round(process.uptime()),
  });

  if (hasBoolFlag('--json')) {
    process.stdout.write(JSON.stringify(statusConfig, null, 2) + '\n');
  } else {
    process.stdout.write(formatStatusText(statusConfig));
  }
  process.exit(0);
}

// CLI flags: --disable-gpu disables hardware acceleration.
// Useful on VMs, remote desktops, or Wayland compositors where GPU acceleration
// causes rendering artifacts, blank windows, or crashes.
if (hasBoolFlag('--disable-gpu') || isTruthyEnv(process.env.MOLT_MASCOT_DISABLE_GPU)) {
  app.disableHardwareAcceleration();
}

// CLI flags: --debug opens DevTools on launch for easier development.
// Also accepts MOLT_MASCOT_DEBUG env var for headless/CI scenarios.
const cliDebug = hasBoolFlag('--debug') || isTruthyEnv(process.env.MOLT_MASCOT_DEBUG);

// CLI flags: --no-tray disables the system tray icon entirely.
// Useful on Linux DEs where tray support is flaky (e.g. GNOME without extensions).
const cliNoTray = hasBoolFlag('--no-tray') || isTruthyEnv(process.env.MOLT_MASCOT_NO_TRAY);

// CLI flags: --no-shortcuts disables global keyboard shortcut registration.
// Useful when the mascot's shortcuts (Cmd+Shift+M, etc.) conflict with other apps.
// All actions remain accessible via the tray menu, context menu, and IPC.
const cliNoShortcuts = hasBoolFlag('--no-shortcuts') || isTruthyEnv(process.env.MOLT_MASCOT_NO_SHORTCUTS);

// CLI flags: --help prints usage information and exits.
if (hasBoolFlag('--help') || hasBoolFlag('-h')) {
  // Platform-aware modifier key labels so the help text matches the user's OS.
  const mod = process.platform === 'darwin' ? 'Cmd' : 'Ctrl';
  const alt = process.platform === 'darwin' ? 'Option' : 'Alt';
  process.stdout.write(`molt-mascot ${APP_VERSION}

A tiny always-on-top desktop mascot (pixel lobster) that reflects your
local OpenClaw Gateway state.

Usage:
  molt-mascot [options]

Options:
  -v, --version          Print version and exit
  -h, --help             Print this help and exit
  --gateway <url>        Gateway WebSocket URL (overrides env)
  --token <token>        Gateway auth token (overrides env)
  --align <position>     Window alignment (overrides env/saved prefs)
                         Values: bottom-right, bottom-left, top-right, top-left,
                         bottom-center, top-center, center-left, center-right, center
  --size <preset>        Size preset (overrides env/saved prefs)
                         Values: tiny, small, medium, large, xlarge
  --opacity <0.0-1.0>    Window opacity (overrides env/saved prefs)
  --padding <px>         Edge padding in pixels (overrides env/saved prefs)
  --click-through        Start in ghost mode (click-through)
  --hide-text            Start with HUD text hidden
  --reduced-motion       Disable animations (bob, blink); overrides OS preference
  --start-hidden         Launch hidden (tray-only); toggle with ${mod}+Shift+V
  --debug                Open DevTools on launch
  --disable-gpu          Disable hardware acceleration (useful on VMs,
                         remote desktops, or Wayland compositors)
  --no-tray              Disable system tray icon (useful on Linux DEs
                         without tray support, e.g. GNOME)
  --no-shortcuts         Disable global keyboard shortcuts (use tray/context
                         menu instead; avoids conflicts with other apps)
  --sleep-threshold <s>  Idle seconds before sleep overlay (default: 120)
  --idle-delay <ms>      Delay before returning to idle after activity (default: 800)
  --error-hold <ms>      How long to show error state before reverting (default: 5000)
  --min-protocol <n>     Minimum Gateway protocol version (default: 2)
  --max-protocol <n>     Maximum Gateway protocol version (default: 3)
  --reset-prefs          Clear saved preferences and start fresh
  --list-prefs           Print saved preferences and exit
  --capture-dir <path>   Screenshot capture directory (dev/CI only)
  --status               Print resolved config summary and exit
  --status --json        Print resolved config as JSON and exit

Environment variables:
  MOLT_MASCOT_GATEWAY_URL     Gateway WebSocket URL (e.g. ws://127.0.0.1:18789)
  MOLT_MASCOT_GATEWAY_TOKEN   Gateway auth token
  MOLT_MASCOT_ALIGN           Window alignment (bottom-right, top-left, center, etc.)
  MOLT_MASCOT_SIZE            Size preset (tiny, small, medium, large, xlarge; default: medium)
  MOLT_MASCOT_PADDING         Edge padding in pixels (default: 24)
  MOLT_MASCOT_WIDTH           Window width in pixels (default: 240)
  MOLT_MASCOT_HEIGHT          Window height in pixels (default: 200)
  MOLT_MASCOT_OPACITY         Window opacity 0.0-1.0 (default: 1.0)
  MOLT_MASCOT_CLICK_THROUGH   Enable ghost mode (1/true/yes)
  MOLT_MASCOT_HIDE_TEXT        Hide HUD text pill (1/true/yes)
  MOLT_MASCOT_IDLE_DELAY_MS      Delay before returning to idle after activity (default: 800)
  MOLT_MASCOT_ERROR_HOLD_MS      How long to show error state before reverting (default: 5000)
  MOLT_MASCOT_RECONNECT_BASE_MS     Initial reconnect delay in ms (default: 1500)
  MOLT_MASCOT_RECONNECT_MAX_MS      Max reconnect delay in ms (default: 30000)
  MOLT_MASCOT_STALE_CONNECTION_MS    Stale connection timeout in ms (default: 15000)
  MOLT_MASCOT_STALE_CHECK_INTERVAL_MS  Stale check interval in ms (default: 5000)
  MOLT_MASCOT_SLEEP_THRESHOLD_S  Idle seconds before sleep overlay (default: 120)
  MOLT_MASCOT_MIN_PROTOCOL    Minimum Gateway protocol version (default: 2)
  MOLT_MASCOT_MAX_PROTOCOL    Maximum Gateway protocol version (default: 3)
  MOLT_MASCOT_DEBUG           Open DevTools on launch (1/true/yes)
  MOLT_MASCOT_DISABLE_GPU     Disable hardware acceleration (1/true/yes)
  MOLT_MASCOT_NO_TRAY         Disable system tray icon (1/true/yes)
  MOLT_MASCOT_NO_SHORTCUTS    Disable global keyboard shortcuts (1/true/yes)
  MOLT_MASCOT_REDUCED_MOTION  Force reduced motion (1/true/yes; overrides OS preference)
  MOLT_MASCOT_START_HIDDEN    Launch hidden, tray-only (1/true/yes; toggle with shortcut)
  MOLT_MASCOT_CAPTURE_DIR     Screenshot capture directory (dev/CI only)

Keyboard shortcuts (while mascot is focused):
  ${mod}+Shift+M   Toggle ghost mode (click-through)
  ${mod}+Shift+H   Toggle HUD text visibility
  ${mod}+Shift+A   Cycle alignment
  ${mod}+Shift+S   Snap to position
  ${mod}+Shift+Z   Cycle size preset
  ${mod}+Shift+O   Cycle opacity
  ${mod}+Shift+R   Reset state
  ${mod}+Shift+C   Force reconnect
  ${mod}+Shift+I   Copy debug info
  ${mod}+Shift+D   Toggle DevTools
  ${mod}+Shift+V   Toggle visibility
  ${mod}+${alt}+Q     Quit

Mouse interactions:
  Double-click lobster   Toggle ghost mode
  Scroll wheel           Adjust opacity
  Middle-click lobster   Force reconnect
  Right-click            Open context menu
  Double-click pill      Copy status text
  Middle-click pill      Toggle HUD text
`);
  process.exit(0);
}

// Fix for Windows notifications/taskbar grouping (matches package.json appId)
if (process.platform === 'win32') {
  app.setAppUserModelId('com.mightcomeback.molt-mascot');
}

// Single-instance lock: prevent duplicate mascots from cluttering the desktop.
// If a second instance is launched, focus the existing window instead.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    withMainWin((w) => {
      if (!w.isVisible()) w.show();
      w.focus();
    });
  });
}

const CAPTURE_DIR = process.env.MOLT_MASCOT_CAPTURE_DIR;

// Late-bound reference set once the window is created.
let _mainWin = null;

/**
 * Run `fn(win)` only if the main window is alive.
 * Eliminates 14+ `mainWin && !mainWin.isDestroyed()` guards scattered through the file.
 */
function withMainWin(fn) {
  if (_mainWin && !_mainWin.isDestroyed()) return fn(_mainWin);
}

// Runtime overrides (can be pushed from the plugin via IPC)
let paddingOverride = null;
let alignmentOverride = null;

// Track whether the user has manually dragged the window.
// If they have, skip automatic repositioning (display-metrics-changed, etc.)
// until the next explicit alignment change resets this flag.
let userDragged = false;

/**
 * Wrapper that reads env vars (MOLT_MASCOT_PADDING, MOLT_MASCOT_ALIGN) and
 * delegates to the pure getPosition helper. The pure function is in
 * get-position.cjs for testability.
 */
function getPosition(display, width, height, alignOverride, paddingOvr) {
  const envPadding = Number(process.env.MOLT_MASCOT_PADDING);
  const basePadding = Math.max(0, Number.isFinite(envPadding) ? envPadding : 24);
  const resolvedPadding = (Number.isFinite(paddingOvr) && paddingOvr >= 0) ? paddingOvr : basePadding;

  const resolvedAlign = (typeof alignOverride === 'string' && alignOverride.trim())
    ? alignOverride
    : (process.env.MOLT_MASCOT_ALIGN || 'bottom-right');

  return _getPosition(display, width, height, resolvedAlign, resolvedPadding);
}

/**
 * Resolve the initial window opacity.
 * Priority: env var > saved preference > 1.0 (fully opaque).
 * Extracted so createWindow() applies the correct opacity on first paint,
 * avoiding a visible flash from 100% → saved value.
 */
function _resolveInitialOpacity(savedOpacityIndex, savedOpacity) {
  const envVal = Number(process.env.MOLT_MASCOT_OPACITY);
  if (Number.isFinite(envVal) && envVal >= 0 && envVal <= 1) return envVal;
  // Prefer raw opacity value (preserves arbitrary scroll-wheel values like 0.3
  // that don't exist in the preset cycle and would be lost via opacityIndex).
  if (typeof savedOpacity === 'number' && Number.isFinite(savedOpacity) && savedOpacity >= 0 && savedOpacity <= 1) {
    return savedOpacity;
  }
  // Fall back to saved preset index for backward compatibility with prefs
  // saved before the raw opacity key was introduced.
  if (typeof savedOpacityIndex === 'number' && savedOpacityIndex >= 0 && savedOpacityIndex < OPACITY_CYCLE.length) {
    return OPACITY_CYCLE[savedOpacityIndex];
  }
  return 1.0;
}

function createWindow({ capture = false, initWidth, initHeight, initOpacity, initPosition } = {}) {
  const display = screen.getPrimaryDisplay();
  const envWidth = Number(process.env.MOLT_MASCOT_WIDTH);
  const envHeight = Number(process.env.MOLT_MASCOT_HEIGHT);
  const width = (Number.isFinite(initWidth) && initWidth > 0) ? initWidth
    : (Number.isFinite(envWidth) && envWidth > 0 ? envWidth : 240);
  const height = (Number.isFinite(initHeight) && initHeight > 0) ? initHeight
    : (Number.isFinite(envHeight) && envHeight > 0 ? envHeight : 200);
  // Use saved drag position if provided and valid; otherwise compute from alignment.
  const pos = (initPosition && Number.isFinite(initPosition.x) && Number.isFinite(initPosition.y))
    ? initPosition
    : getPosition(display, width, height, alignmentOverride, paddingOverride);

  const win = new BrowserWindow({
    width,
    height,
    x: Math.round(pos.x),
    y: Math.round(pos.y),
    transparent: capture ? false : true,
    backgroundColor: capture ? '#111827' : '#00000000',
    opacity: capture ? 1.0 : (typeof initOpacity === 'number' ? initOpacity : 1.0),
    show: capture ? false : !isTruthyEnv(process.env.MOLT_MASCOT_START_HIDDEN),
    frame: false,
    resizable: false,
    movable: !capture,
    alwaysOnTop: capture ? false : true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
    },
  });

  if (!capture) win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'index.html'));
  return win;
}

async function captureScreenshots() {
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });

  const win = createWindow({ capture: true });
  await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));

  const modes = ['idle', 'thinking', 'tool', 'error', 'connecting', 'connected', 'disconnected'];
  
  // Freeze time at 0 for deterministic bobbing (frame 0)
  await win.webContents.executeJavaScript(`window.__moltMascotSetTime && window.__moltMascotSetTime(0)`);

  for (const mode of modes) {
    await win.webContents.executeJavaScript(`window.__moltMascotSetMode && window.__moltMascotSetMode(${JSON.stringify(mode)})`);
    await new Promise((r) => setTimeout(r, 120));
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(CAPTURE_DIR, `${mode}.png`), img.toPNG());
  }

  // Capture the sleeping state by setting idle mode and backdating modeSince
  // past the sleep threshold so the ZZZ overlay renders.
  await win.webContents.executeJavaScript(`
    window.__moltMascotSetMode && window.__moltMascotSetMode('idle');
    window.__moltMascotSetModeSince && window.__moltMascotSetModeSince(Date.now() - 300000);
  `);
  await new Promise((r) => setTimeout(r, 120));
  const sleepImg = await win.webContents.capturePage();
  fs.writeFileSync(path.join(CAPTURE_DIR, 'sleeping.png'), sleepImg.toPNG());

  // Capture tray icon sprites for each mode (useful for docs/README assets).
  // Renders at 2× scale (32×32) for crisp display on retina/HiDPI screens.
  const trayScale = 2;
  const traySize = 16 * trayScale;
  const allTrayModes = [...modes, 'sleeping'];
  const trayDir = path.join(CAPTURE_DIR, 'tray');
  fs.mkdirSync(trayDir, { recursive: true });
  for (const mode of allTrayModes) {
    const buf = renderTraySprite(trayScale, { mode });
    const img = nativeImage.createFromBuffer(buf, { width: traySize, height: traySize });
    fs.writeFileSync(path.join(trayDir, `tray-${mode}.png`), img.toPNG());
  }
  // Also capture base sprite without status dot
  const baseBuf = renderTraySprite(trayScale);
  const baseImg = nativeImage.createFromBuffer(baseBuf, { width: traySize, height: traySize });
  fs.writeFileSync(path.join(trayDir, 'tray-base.png'), baseImg.toPNG());

  try { win.close(); } catch {}
}

function applyClickThrough(win, enabled) {
  try {
    win.setIgnoreMouseEvents(Boolean(enabled), { forward: true });
  } catch {}
}

app.whenReady().then(async () => {
  // macOS About panel (visible via tray > right-click on app name in menu bar)
  app.setAboutPanelOptions({
    applicationName: 'Molt Mascot',
    applicationVersion: APP_VERSION,
    copyright: (() => {
      const startYear = 2026;
      const currentYear = new Date().getFullYear();
      return currentYear > startYear
        ? `© ${startYear}–${currentYear} MightComeback`
        : `© ${startYear} MightComeback`;
    })(),
    website: REPO_URL,
  });

  // Hide dock icon on macOS for a true desktop widget experience
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  if (CAPTURE_DIR) {
    await captureScreenshots();
    app.quit();
    return;
  }

  // Detect manual drags: if the window moves and we didn't trigger it,
  // mark as user-dragged so auto-reposition doesn't snap it back.
  let repositioning = false;

  // Load saved preferences (alignment, size, ghost mode, hide-text).
  // Env vars take precedence over saved prefs; saved prefs take precedence over defaults.
  const savedPrefs = loadPrefs();

  // Optional UX: make the mascot click-through so it never blocks clicks.
  // Toggle at runtime with Cmd/Ctrl+Shift+M.
  // Back-compat: accept both MOLT_MASCOT_CLICKTHROUGH and MOLT_MASCOT_CLICK_THROUGH
  const envClickThrough = process.env.MOLT_MASCOT_CLICKTHROUGH ?? process.env.MOLT_MASCOT_CLICK_THROUGH;
  let clickThrough = parseBooleanEnv(envClickThrough) ?? savedPrefs.clickThrough ?? false;

  // Back-compat: accept both MOLT_MASCOT_HIDETEXT and MOLT_MASCOT_HIDE_TEXT
  const envHideText = process.env.MOLT_MASCOT_HIDETEXT ?? process.env.MOLT_MASCOT_HIDE_TEXT;
  let hideText = parseBooleanEnv(envHideText) ?? savedPrefs.hideText ?? false;

  // Restore saved alignment if no env override
  if (!alignmentOverride && savedPrefs.alignment) {
    alignmentOverride = savedPrefs.alignment;
  }

  // Restore saved padding if no env override
  if (paddingOverride === null && typeof savedPrefs.padding === 'number' && savedPrefs.padding >= 0) {
    paddingOverride = savedPrefs.padding;
  }

  // --- Core action helpers ---
  // Deduplicated logic used by keyboard shortcuts, tray menu, IPC, and context menu.
  // Each action is defined once to prevent drift between the three trigger paths.

  function actionToggleGhostMode(forceValue) {
    clickThrough = forceValue !== undefined
      ? (parseBooleanEnv(forceValue) ?? !clickThrough)
      : !clickThrough;
    withMainWin((w) => {
      applyClickThrough(w, clickThrough);
      w.webContents.send('molt-mascot:click-through', clickThrough);
    });
    savePrefs({ clickThrough });
    rebuildTrayMenu();
  }

  function actionToggleHideText(forceValue) {
    hideText = forceValue !== undefined
      ? (parseBooleanEnv(forceValue) ?? !hideText)
      : !hideText;
    withMainWin((w) => w.webContents.send('molt-mascot:hide-text', hideText));
    savePrefs({ hideText });
    rebuildTrayMenu();
  }

  function actionResetState() {
    withMainWin((w) => w.webContents.send('molt-mascot:reset'));
  }

  function actionCycleAlignment() {
    alignmentIndex = (alignmentIndex + 1) % alignmentCycle.length;
    alignmentOverride = alignmentCycle[alignmentIndex];
    repositionMainWindow({ force: true });
    withMainWin((w) => w.webContents.send('molt-mascot:alignment', alignmentOverride));
    savePrefs({ alignment: alignmentOverride, draggedPosition: null });
    rebuildTrayMenu();
  }

  function actionToggleVisibility() {
    withMainWin((w) => {
      if (w.isVisible()) w.hide();
      else w.show();
      rebuildTrayMenu();
    });
  }

  function actionSnapToPosition() {
    userDragged = false;
    withMainWin((w) => w.webContents.send('molt-mascot:drag-position', false));
    savePrefs({ draggedPosition: null });
    repositionMainWindow({ force: true });
  }

  // Opacity presets for cycling (Cmd+Shift+O)
  const opacityCycle = OPACITY_CYCLE;
  let opacityIndex = 0;

  function actionCycleOpacity() {
    opacityIndex = (opacityIndex + 1) % opacityCycle.length;
    const opacity = opacityCycle[opacityIndex];
    withMainWin((w) => {
      w.setOpacity(opacity);
      w.webContents.send('molt-mascot:opacity', opacity);
    });
    savePrefs({ opacityIndex, opacity });
    rebuildTrayMenu();
  }

  function actionCycleSize() {
    sizeIndex = (sizeIndex + 1) % sizeCycle.length;
    const { label, width, height } = sizeCycle[sizeIndex];
    withMainWin((w) => {
      w.setSize(width, height, true);
      repositionMainWindow({ force: true });
      w.webContents.send('molt-mascot:size', label);
    });
    savePrefs({ sizeIndex });
    rebuildTrayMenu();
  }

  function actionForceReconnect() {
    withMainWin((w) => w.webContents.send('molt-mascot:force-reconnect'));
  }

  function actionToggleDevTools() {
    withMainWin((w) => {
      if (w.webContents.isDevToolsOpened()) w.webContents.closeDevTools();
      else w.webContents.openDevTools({ mode: 'detach' });
    });
  }

  async function actionCopyDebugInfo() {
    const info = await withMainWin((w) =>
      w.webContents.executeJavaScript('window.__moltMascotBuildDebugInfo ? window.__moltMascotBuildDebugInfo() : "debug info unavailable"')
    );
    if (info) {
      const { clipboard } = require('electron');
      clipboard.writeText(info);
      // Notify the renderer so it can show "Copied ✓" feedback in the pill,
      // matching the behavior when copy is triggered from the context menu.
      withMainWin((w) => w.webContents.send('molt-mascot:copied'));
    }
  }

  /**
   * Wire up common event listeners on a freshly created main window.
   * Shared between initial creation and macOS `activate` re-creation
   * to avoid duplicating the same setup in two places.
   */
  function wireMainWindow(win) {
    win.on('closed', () => {
      if (_mainWin === win) _mainWin = null;
    });
    win.on('moved', () => {
      if (!repositioning) {
        userDragged = true;
        win.webContents.send('molt-mascot:drag-position', true);
        // Persist dragged position so it survives app restarts.
        // Debounced via savePrefs() so rapid drag events don't hammer disk.
        const [px, py] = win.getPosition();
        savePrefs({ draggedPosition: { x: px, y: py } });
      }
    });
    applyClickThrough(win, clickThrough);
    win.webContents.once('did-finish-load', () => {
      withMainWin((w) => {
        if (hideText) w.webContents.send('molt-mascot:hide-text', hideText);
        if (clickThrough) w.webContents.send('molt-mascot:click-through', clickThrough);
        // Send initial alignment so the renderer context menu reflects the saved
        // preference even when no plugin is connected to push it.
        if (alignmentOverride) w.webContents.send('molt-mascot:alignment', alignmentOverride);
        // Send initial opacity so the renderer displays the correct percentage
        // in the context menu without waiting for a plugin state push.
        if (opacityIndex !== 0) w.webContents.send('molt-mascot:opacity', opacityCycle[opacityIndex]);
        // Send initial size label so the renderer context menu reflects the
        // saved preference. Previously this was only sent outside wireMainWindow,
        // so macOS `activate` re-creation would miss it.
        if (sizeIndex !== 1) w.webContents.send('molt-mascot:size', sizeCycle[sizeIndex].label);
        // Send initial drag state so "Snap to Position" is correctly enabled/disabled
        // in the renderer's custom context menu from the start.
        if (userDragged) w.webContents.send('molt-mascot:drag-position', true);
        // Auto-open DevTools when --debug flag is passed (dev ergonomics).
        if (cliDebug) w.webContents.openDevTools({ mode: 'detach' });
      });
    });
  }

  // Size presets from shared module (single source of truth).
  const sizeCycle = SIZE_PRESETS;
  let sizeIndex = (typeof savedPrefs.sizeIndex === 'number' && savedPrefs.sizeIndex >= 0 && savedPrefs.sizeIndex < sizeCycle.length)
    ? savedPrefs.sizeIndex : DEFAULT_SIZE_INDEX;
  // Env var MOLT_MASCOT_SIZE overrides saved preference (parity with MOLT_MASCOT_ALIGN etc.).
  const envSize = (process.env.MOLT_MASCOT_SIZE || '').trim().toLowerCase();
  if (envSize) {
    const envSizeIdx = sizeCycle.findIndex((s) => s.label === envSize);
    if (envSizeIdx >= 0) sizeIndex = envSizeIdx;
  }
  // CLI --size is validated early and sets MOLT_MASCOT_SIZE, so the env var
  // lookup above already handles it. No separate cliSize block needed.

  // Pass saved size and opacity into createWindow to avoid visible flash on launch.
  const initSize = sizeCycle[sizeIndex];
  const initOpacity = _resolveInitialOpacity(savedPrefs.opacityIndex, savedPrefs.opacity);
  // Restore drag position if the user previously dragged the window manually.
  const savedDragPos = savedPrefs.draggedPosition;
  const initPosition = (savedDragPos && Number.isFinite(savedDragPos.x) && Number.isFinite(savedDragPos.y))
    ? savedDragPos : undefined;
  if (initPosition) userDragged = true; // Prevent auto-reposition from overriding on first display-metrics event
  _mainWin = createWindow({ initWidth: initSize.width, initHeight: initSize.height, initOpacity, initPosition });
  wireMainWindow(_mainWin);

  // --- System tray (makes the app discoverable when dock is hidden) ---
  // Skipped entirely when --no-tray is passed (useful on Linux DEs without tray support).
  let tray = null;
  if (!cliNoTray) {
    // Build a multi-resolution tray icon: 16px @1x + 32px @2x + 48px @3x for crisp rendering on all DPIs.
    const trayIcon = nativeImage.createFromBuffer(renderTraySprite(1), { width: 16, height: 16 });
    trayIcon.addRepresentation({ buffer: renderTraySprite(2), width: 32, height: 32, scaleFactor: 2.0 });
    trayIcon.addRepresentation({ buffer: renderTraySprite(3), width: 48, height: 48, scaleFactor: 3.0 });
    // Mark as template on macOS so the system auto-tints the icon for light/dark menu bars.
    // Template images use alpha as the shape and ignore RGB values, which means the icon
    // stays legible regardless of the user's appearance setting.
    if (process.platform === 'darwin') {
      trayIcon.setTemplateImage(true);
    }
    tray = new Tray(trayIcon);
    tray.setToolTip(`Molt Mascot v${APP_VERSION}`);

    // Left-click (or double-click on Windows) toggles mascot visibility.
    // On macOS, `click` fires on left-click; on Windows/Linux, `double-click` is more conventional.
    const trayToggle = () => {
      withMainWin((w) => {
        if (w.isVisible()) w.hide();
        else w.show();
        rebuildTrayMenu();
      });
    };
    tray.on('click', trayToggle);
  }

  // Alignment cycling order for Cmd+Shift+A shortcut
  const alignmentCycle = [
    'bottom-right', 'bottom-left', 'top-right', 'top-left',
    'bottom-center', 'top-center', 'center-left', 'center-right', 'center',
  ];
  let alignmentIndex = alignmentCycle.indexOf(
    (alignmentOverride || process.env.MOLT_MASCOT_ALIGN || 'bottom-right').toLowerCase()
  );
  if (alignmentIndex < 0) alignmentIndex = 0;

  // Restore saved opacity preference.
  // Note: the initial window opacity is already applied during createWindow() via
  // _resolveInitialOpacity(), so we only need to sync the opacityIndex here for
  // keyboard shortcut cycling to continue from the correct position.
  if (typeof savedPrefs.opacityIndex === 'number' && savedPrefs.opacityIndex >= 0 && savedPrefs.opacityIndex < opacityCycle.length) {
    opacityIndex = savedPrefs.opacityIndex;
  }

  // Track current renderer mode for tray tooltip/icon updates.
  // Declared before rebuildTrayMenu() to avoid TDZ (temporal dead zone) errors
  // since rebuildTrayMenu() reads this variable and is called immediately below.
  let currentRendererMode = 'idle';
  let modeChangedAt = Date.now();

  // Debounced wrapper: coalesces rapid consecutive calls (e.g. mode-update
  // fires every ~1s from plugin polling, tool/error changes trigger extra calls)
  // into a single Menu.buildFromTemplate() + tray.setContextMenu() cycle.
  // The 200ms window is short enough to feel instant on user actions but long
  // enough to batch the 3-4 calls that often fire together on mode transitions.
  let _trayRebuildTimer = null;
  function rebuildTrayMenu() {
    if (_trayRebuildTimer) clearTimeout(_trayRebuildTimer);
    _trayRebuildTimer = setTimeout(_rebuildTrayMenuNow, 200);
  }

  function _rebuildTrayMenuNow() {
    _trayRebuildTimer = null;
    if (!tray) return;
    // Update tooltip to reflect current state (ghost mode, alignment, etc.)
    // Compute connection uptime string for tray tooltip (if connected).
    let uptimeStr;
    if (connectedSinceMs) {
      uptimeStr = formatDuration(Math.max(0, Math.round((Date.now() - connectedSinceMs) / 1000)));
    }
    // Compute connection uptime percentage from process lifetime.
    const _uptimePct = (() => {
      if (firstConnectedMs === null) return null;
      const now = Date.now();
      const totalMs = process.uptime() * 1000;
      if (totalMs <= 0) return null;
      const currentGap = connectedSinceMs ? 0 : (now - (firstConnectedMs || now));
      const sinceFc = now - firstConnectedMs;
      const approx = Math.max(0, sinceFc - currentGap);
      return Math.min(100, Math.round((approx / totalMs) * 100));
    })();
    tray.setToolTip(buildTrayTooltip({
      appVersion: APP_VERSION,
      mode: trayShowsSleeping ? 'sleeping' : (currentRendererMode || 'idle'),
      clickThrough,
      hideText,
      alignment: (alignmentOverride || process.env.MOLT_MASCOT_ALIGN || 'bottom-right').toLowerCase(),
      sizeLabel: sizeCycle[sizeIndex].label,
      opacityPercent: Math.round(opacityCycle[opacityIndex] * 100),
      uptimeStr,
      latencyMs: currentLatencyMs,
      currentTool: currentToolName,
      lastErrorMessage: currentErrorMessage,
      modeDurationSec: Math.max(0, Math.round((Date.now() - modeChangedAt) / 1000)),
      processUptimeS: process.uptime(),
      processMemoryRssBytes: process.memoryUsage.rss(),
      sessionConnectCount,
      sessionAttemptCount,
      toolCalls: currentToolCalls,
      toolErrors: currentToolErrors,
      lastCloseDetail: currentCloseDetail,
      reconnectAttempt: currentReconnectAttempt,
      targetUrl: currentTargetUrl,
      activeAgents: currentActiveAgents,
      activeTools: currentActiveTools,
      pluginVersion: currentPluginVersion,
      lastMessageAt: currentLastMessageAt,
      latencyStats: currentLatencyStats,
      pluginStartedAt: currentPluginStartedAt,
      lastResetAt: currentLastResetAt,
      healthStatus: currentHealthStatus,
      connectionUptimePct: _uptimePct,
      latencyTrend: currentLatencyTrend,
    }));

    const menu = Menu.buildFromTemplate([
      { label: `Molt Mascot v${APP_VERSION}`, enabled: false },
      { label: 'About Molt Mascot', click: () => app.showAboutPanel() },
      { label: 'Open on GitHub…', click: () => { const { shell } = require('electron'); shell.openExternal(REPO_URL); } },
      { type: 'separator' },
      {
        label: withMainWin((w) => w.isVisible()) ? 'Hide Mascot' : 'Show Mascot',
        accelerator: 'CommandOrControl+Shift+V',
        click: actionToggleVisibility,
      },
      {
        label: 'Ghost Mode (Click-Through)',
        type: 'checkbox',
        checked: clickThrough,
        accelerator: 'CommandOrControl+Shift+M',
        click: () => actionToggleGhostMode(),
      },
      {
        label: 'Hide Text',
        type: 'checkbox',
        checked: hideText,
        accelerator: 'CommandOrControl+Shift+H',
        click: () => actionToggleHideText(),
      },
      {
        label: `Cycle Alignment (${(alignmentOverride || process.env.MOLT_MASCOT_ALIGN || 'bottom-right').toLowerCase()})`,
        accelerator: 'CommandOrControl+Shift+A',
        click: actionCycleAlignment,
      },
      {
        label: `Size: ${sizeCycle[sizeIndex].label} (${sizeCycle[sizeIndex].width}×${sizeCycle[sizeIndex].height})`,
        accelerator: 'CommandOrControl+Shift+Z',
        click: actionCycleSize,
      },
      {
        label: `Opacity: ${formatOpacity(opacityCycle[opacityIndex])}`,
        accelerator: 'CommandOrControl+Shift+O',
        click: actionCycleOpacity,
      },
      {
        label: 'Snap to Position',
        toolTip: 'Reset manual drag and snap back to the configured alignment corner',
        accelerator: 'CommandOrControl+Shift+S',
        click: actionSnapToPosition,
      },
      { type: 'separator' },
      {
        label: 'Force Reconnect',
        accelerator: 'CommandOrControl+Shift+C',
        click: actionForceReconnect,
      },
      {
        label: 'Reset State',
        accelerator: 'CommandOrControl+Shift+R',
        click: actionResetState,
      },
      {
        label: 'Copy Debug Info',
        accelerator: 'CommandOrControl+Shift+I',
        click: actionCopyDebugInfo,
      },
      {
        label: 'DevTools',
        accelerator: 'CommandOrControl+Shift+D',
        click: actionToggleDevTools,
      },
      { type: 'separator' },
      { label: 'Quit', accelerator: 'CommandOrControl+Alt+Q', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
  }

  rebuildTrayMenu();

  if (!cliNoShortcuts) {
    try {
      const register = (acc, cb) => {
        if (!globalShortcut.register(acc, cb)) {
          console.warn(`molt-mascot: failed to register shortcut ${acc}`);
        }
      };

      register('CommandOrControl+Shift+M', () => actionToggleGhostMode());
      register('CommandOrControl+Shift+H', () => actionToggleHideText());
      register('CommandOrControl+Shift+R', actionResetState);
      register('CommandOrControl+Shift+A', actionCycleAlignment);
      register('CommandOrControl+Shift+V', actionToggleVisibility);
      register('CommandOrControl+Alt+Q', () => app.quit());
      register('CommandOrControl+Shift+S', actionSnapToPosition);
      register('CommandOrControl+Shift+Z', actionCycleSize);
      register('CommandOrControl+Shift+O', actionCycleOpacity);
      register('CommandOrControl+Shift+C', actionForceReconnect);
      register('CommandOrControl+Shift+D', actionToggleDevTools);
      register('CommandOrControl+Shift+I', actionCopyDebugInfo);
    } catch (err) {
      console.error('molt-mascot: failed to register shortcuts', err);
    }
  }

  ipcMain.on('molt-mascot:quit', () => app.quit());
  ipcMain.on('molt-mascot:show-about', () => app.showAboutPanel());
  ipcMain.on('molt-mascot:toggle-devtools', actionToggleDevTools);
  ipcMain.on('molt-mascot:cycle-alignment', actionCycleAlignment);
  ipcMain.on('molt-mascot:snap-to-position', actionSnapToPosition);
  ipcMain.on('molt-mascot:hide', () => {
    withMainWin((w) => {
      w.hide();
      rebuildTrayMenu();
    });
  });
  ipcMain.on('molt-mascot:cycle-size', actionCycleSize);
  ipcMain.on('molt-mascot:set-click-through', (_event, enabled) => actionToggleGhostMode(enabled));
  ipcMain.on('molt-mascot:set-hide-text', (_event, hidden) => actionToggleHideText(hidden));
  ipcMain.on('molt-mascot:cycle-opacity', actionCycleOpacity);
  ipcMain.on('molt-mascot:force-reconnect', actionForceReconnect);
  ipcMain.on('molt-mascot:copy-debug-info', actionCopyDebugInfo);
  ipcMain.on('molt-mascot:reset-prefs', () => {
    const { dialog } = require('electron');
    dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Reset', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Reset Preferences',
      message: 'Reset all preferences to defaults?',
      detail: 'This clears saved alignment, size, opacity, ghost mode, and gateway URL. The app will restart.',
    }).then(({ response }) => {
      if (response === 0) {
        _prefs.clear();
        app.relaunch();
        app.quit();
      }
    });
  });
  ipcMain.on('molt-mascot:open-external', (_event, url) => {
    // Only allow https URLs to prevent shell injection via IPC.
    if (typeof url === 'string' && /^https:\/\//i.test(url)) {
      const { shell } = require('electron');
      shell.openExternal(url);
    }
  });

  // Live mode updates from the renderer — used to enrich the tray tooltip
  // so hovering the system tray shows the current gateway state even when
  // the mascot window is hidden.
  // (currentRendererMode is declared above rebuildTrayMenu to avoid TDZ.)

  /**
   * Rebuild the tray icon with a status dot reflecting the current mode.
   * Called when the renderer reports a mode change so the menu bar icon
   * gives at-a-glance feedback without hovering for the tooltip.
   *
   * Icons are cached per mode since the sprite data is static — avoids
   * re-rendering 3 scale factors on every mode transition.
   */
  const _trayIconCache = new Map();
  function updateTrayIcon(mode) {
    if (!tray) return;
    try {
      let icon = _trayIconCache.get(mode);
      if (!icon) {
        icon = nativeImage.createFromBuffer(
          renderTraySprite(1, { mode }), { width: 16, height: 16 }
        );
        icon.addRepresentation({
          buffer: renderTraySprite(2, { mode }), width: 32, height: 32, scaleFactor: 2.0,
        });
        icon.addRepresentation({
          buffer: renderTraySprite(3, { mode }), width: 48, height: 48, scaleFactor: 3.0,
        });
        if (process.platform === 'darwin') icon.setTemplateImage(true);
        _trayIconCache.set(mode, icon);
      }
      tray.setImage(icon);
    } catch {
      // Best-effort — don't crash if image creation fails
    }
  }

  // Track when the gateway connection was established (for tray tooltip uptime).
  let connectedSinceMs = null;
  // Timestamp of the very first successful handshake (for connection uptime % calculation).
  let firstConnectedMs = null;

  // Track latest plugin state poll latency and active tool for tray tooltip.
  let currentLatencyMs = null;
  let currentToolName = null;
  let currentErrorMessage = null;
  let currentToolCalls = 0;
  let currentToolErrors = 0;
  let sessionConnectCount = 0;
  let sessionAttemptCount = 0;
  let currentCloseDetail = null;
  let currentReconnectAttempt = 0;
  let currentTargetUrl = null;
  let currentActiveAgents = 0;
  let currentActiveTools = 0;
  let currentPluginVersion = null;
  let currentLastMessageAt = null;
  let currentLatencyStats = null;
  let currentPluginStartedAt = null;
  let currentLastResetAt = null;
  let currentHealthStatus = null;
  let currentLatencyTrend = null;
  ipcMain.on('molt-mascot:mode-update', (_event, raw) => {
    // Delegate all field validation/coercion to the extracted pure function.
    // Previously this was ~70 lines of inline typeof checks; now parseModeUpdate
    // handles type narrowing, NaN guards, and domain validation in one place.
    const p = parseModeUpdate(raw);

    // Apply validated fields to tray state variables.
    if (p.toolCalls !== null) currentToolCalls = p.toolCalls;
    if (p.toolErrors !== null) currentToolErrors = p.toolErrors;
    if (p.activeAgents !== null) currentActiveAgents = p.activeAgents;
    if (p.activeTools !== null) currentActiveTools = p.activeTools;
    if (p.pluginVersion !== null) currentPluginVersion = p.pluginVersion;
    // Latency: update when provided, clear when explicitly null in raw payload.
    if (p.latencyMs !== null) currentLatencyMs = p.latencyMs;
    else if (raw && (raw.latency === null || raw.latency === undefined || raw.latencyMs === null || raw.latencyMs === undefined)) currentLatencyMs = null;

    if (p.closeDetail !== null) currentCloseDetail = p.closeDetail;
    else if (raw && raw.closeDetail === null) currentCloseDetail = null;
    if (p.reconnectAttempt !== null) currentReconnectAttempt = p.reconnectAttempt;

    if (p.sessionConnectCount !== null) sessionConnectCount = p.sessionConnectCount;
    if (p.sessionAttemptCount !== null) sessionAttemptCount = p.sessionAttemptCount;

    if (p.targetUrl !== null) currentTargetUrl = p.targetUrl;
    else if (raw && raw.targetUrl === null) currentTargetUrl = null;

    if (p.lastMessageAt !== null) currentLastMessageAt = p.lastMessageAt;
    else if (raw && raw.lastMessageAt === null) currentLastMessageAt = null;

    if (p.latencyStats !== null) currentLatencyStats = p.latencyStats;
    else if (raw && raw.latencyStats === null) currentLatencyStats = null;

    if (p.pluginStartedAt !== null) currentPluginStartedAt = p.pluginStartedAt;
    else if (raw && raw.pluginStartedAt === null) currentPluginStartedAt = null;

    if (p.lastResetAt !== null) currentLastResetAt = p.lastResetAt;
    else if (raw && raw.lastResetAt === null) currentLastResetAt = null;

    if (p.healthStatus !== null) currentHealthStatus = p.healthStatus;
    else if (raw && raw.healthStatus === null) currentHealthStatus = null;

    if (p.latencyTrend !== null) currentLatencyTrend = p.latencyTrend;
    else if (raw && raw.latencyTrend === null) currentLatencyTrend = null;

    // Track active tool name for tray tooltip (e.g. "🔧 read" instead of "🔧 tool").
    const nextTool = p.tool;
    if (nextTool !== currentToolName) {
      currentToolName = nextTool;
      rebuildTrayMenu();
    }

    // Track error message for tray tooltip (e.g. "❌ spawn ENOENT" instead of "❌ error").
    const nextError = p.errorMessage;
    if (nextError !== currentErrorMessage) {
      currentErrorMessage = nextError;
      rebuildTrayMenu();
    }

    if (p.mode !== null && p.mode !== currentRendererMode) {
      currentRendererMode = p.mode;
      modeChangedAt = Date.now();
      if (p.mode !== 'idle') trayShowsSleeping = false;
      if (p.mode === 'connected') {
        connectedSinceMs = Date.now();
        if (firstConnectedMs === null) firstConnectedMs = connectedSinceMs;
        currentCloseDetail = null;
        currentReconnectAttempt = 0;
      } else if (p.mode === 'disconnected' || p.mode === 'connecting') {
        connectedSinceMs = null;
        currentLatencyMs = null;
        currentLatencyTrend = null;
      }
      updateTrayIcon(p.mode);
      rebuildTrayMenu();
    }
  });

  // Sleep detection: when the renderer stays in 'idle' mode for longer than
  // the sleep threshold, update the tray icon/tooltip to show the sleeping state.
  // The renderer handles its own ZZZ overlay; this mirrors that state in the tray
  // so the menu bar icon gives at-a-glance feedback even when the mascot is hidden.
  const SLEEP_THRESHOLD_MS = (() => {
    const raw = Number(process.env.MOLT_MASCOT_SLEEP_THRESHOLD_S);
    return (Number.isFinite(raw) && raw >= 0 ? raw : 120) * 1000;
  })();
  let trayShowsSleeping = false;
  const sleepCheckTimer = setInterval(() => {
    if (currentRendererMode !== 'idle') {
      if (trayShowsSleeping) {
        trayShowsSleeping = false;
        updateTrayIcon('idle');
        rebuildTrayMenu();
      }
      return;
    }
    const idleDuration = Date.now() - modeChangedAt;
    if (idleDuration > SLEEP_THRESHOLD_MS && !trayShowsSleeping) {
      trayShowsSleeping = true;
      updateTrayIcon('sleeping');
      rebuildTrayMenu();
    }
  }, 10000); // Check every 10s — sleep threshold is 120s, so 10s granularity is fine.

  function repositionMainWindow({ force = false } = {}) {
    withMainWin((w) => {
      // If the user dragged the window manually, don't snap it back
      // unless this is an explicit alignment/padding change (force=true).
      // However, always recover if the window ended up off-screen (e.g. after
      // a display was removed or resolution changed).
      if (userDragged && !force) {
        // Off-screen recovery: clamp the user-dragged position to the nearest
        // visible work area so the mascot is never stranded on a phantom display.
        const [wx, wy] = w.getPosition();
        const [ww, wh] = w.getSize();
        const display = screen.getDisplayNearestPoint({ x: wx, y: wy });
        const clamped = clampToWorkArea({ x: wx, y: wy }, { width: ww, height: wh }, display.workArea);
        if (clamped.changed) {
          repositioning = true;
          w.setPosition(clamped.x, clamped.y, true);
          savePrefs({ draggedPosition: { x: clamped.x, y: clamped.y } });
          setTimeout(() => { repositioning = false; }, 100);
        }
        return;
      }
      // Use the display the mascot is currently on (not always the primary).
      // This prevents the mascot from jumping to the primary monitor when the
      // user cycles alignment/size on a secondary display.
      const [wx, wy] = w.getPosition();
      const display = screen.getDisplayNearestPoint({ x: wx, y: wy });
      const [width, height] = w.getSize();
      const pos = getPosition(display, width, height, alignmentOverride, paddingOverride);
      // Guard flag so the 'moved' event doesn't mark this as a user drag.
      repositioning = true;
      w.setPosition(Math.round(pos.x), Math.round(pos.y), true);
      userDragged = false;
      // Small delay to let the 'moved' event fire before clearing the guard.
      setTimeout(() => { repositioning = false; }, 100);
    });
  }

  ipcMain.on('molt-mascot:set-alignment', (event, align) => {
    // Persist runtime alignment so other IPC updates (like padding) don't snap back
    // to the env/default alignment.
    alignmentOverride = align;
    // Update cycle index so keyboard shortcut continues from the new position.
    const idx = alignmentCycle.indexOf(String(align).toLowerCase());
    if (idx >= 0) alignmentIndex = idx;

    repositionMainWindow({ force: true });
    // Notify renderer so the context menu label updates immediately
    withMainWin((w) => w.webContents.send('molt-mascot:alignment', alignmentOverride));
    savePrefs({ alignment: alignmentOverride, draggedPosition: null });
    rebuildTrayMenu();
  });

  ipcMain.on('molt-mascot:set-opacity', (event, opacity) => {
    withMainWin((w) => {
      const v = Number(opacity);
      if (isValidOpacity(v)) {
        w.setOpacity(v);
        // Sync the cycle index to the closest preset so keyboard cycling
        // continues from a sensible position after a plugin-pushed value.
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < opacityCycle.length; i++) {
          const d = Math.abs(opacityCycle[i] - v);
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        opacityIndex = bestIdx;
        // Notify the renderer so the context menu and tooltip reflect the
        // updated opacity immediately (without waiting for the next plugin poll).
        w.webContents.send('molt-mascot:opacity', v);
        savePrefs({ opacityIndex, opacity: v });
        rebuildTrayMenu();
      }
    });
  });

  ipcMain.on('molt-mascot:set-size', (event, size) => {
    // Accept preset name (string) or explicit { width, height } object.
    if (typeof size === 'string') {
      const idx = sizeCycle.findIndex((s) => s.label === size);
      if (idx === -1) return;
      sizeIndex = idx;
      const { label, width, height } = sizeCycle[idx];
      withMainWin((win) => {
        win.setSize(width, height, true);
        repositionMainWindow({ force: true });
        win.webContents.send('molt-mascot:size', label);
      });
      savePrefs({ sizeIndex });
      rebuildTrayMenu();
      return;
    }
    const w = Number(size?.width);
    const h = Number(size?.height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 80 || h < 80) return;
    withMainWin((win) => {
      win.setSize(Math.round(w), Math.round(h), true);
      repositionMainWindow({ force: true });
    });
  });

  ipcMain.on('molt-mascot:set-padding', (event, padding) => {
    const v = Number(padding);
    if (!isValidPadding(v)) return;
    paddingOverride = v;
    repositionMainWindow({ force: true });
    savePrefs({ padding: v });
  });

  // Keep the mascot pinned when display workArea changes (monitor attach/detach,
  // resolution/dock changes, etc.).
  // Debounce to avoid jittery repositioning when metrics fire rapidly
  // (e.g. during resolution transitions, dock auto-hide, or display scaling changes).
  let displayDebounce = null;
  const debouncedReposition = () => {
    if (displayDebounce) clearTimeout(displayDebounce);
    displayDebounce = setTimeout(() => {
      displayDebounce = null;
      repositionMainWindow();
    }, 150);
  };
  try {
    screen.on('display-metrics-changed', debouncedReposition);
    screen.on('display-added', debouncedReposition);
    screen.on('display-removed', debouncedReposition);
  } catch {}

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const sz = sizeCycle[sizeIndex];
      const reactivatePos = (savedPrefs.draggedPosition && userDragged) ? savedPrefs.draggedPosition : undefined;
      _mainWin = createWindow({ initWidth: sz.width, initHeight: sz.height, initOpacity: opacityCycle[opacityIndex], initPosition: reactivatePos });
      wireMainWindow(_mainWin);
    }
  });

  app.on('will-quit', () => {
    try { globalShortcut.unregisterAll(); } catch {}
    // Flush any pending preference writes before exit so the last action isn't lost.
    _prefs.flush();
    // Cancel pending tray menu rebuild.
    if (_trayRebuildTimer) { clearTimeout(_trayRebuildTimer); _trayRebuildTimer = null; }
    // Destroy tray icon to prevent ghost icons on Windows/Linux after quit.
    try { if (tray) { tray.destroy(); tray = null; } } catch {}
    // Cancel any pending display-metrics debounce timer.
    if (displayDebounce) { clearTimeout(displayDebounce); displayDebounce = null; }
    // Cancel sleep detection timer.
    if (sleepCheckTimer) clearInterval(sleepCheckTimer);
  });
});

app.on('window-all-closed', () => {
  // With app.dock.hide(), we cannot re-activate the app if the window closes.
  // Ensure the process quits on all platforms to prevent zombies.
  app.quit();
});
