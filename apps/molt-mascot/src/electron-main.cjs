const { app, BrowserWindow, screen, globalShortcut, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const { isTruthyEnv } = require('./is-truthy-env.cjs');
const { getPosition: _getPosition } = require('./get-position.cjs');
const { renderTraySprite } = require('./tray-icon.cjs');

const APP_VERSION = require('../package.json').version;

// --- User preference persistence ---
// Save runtime preferences (alignment, size, ghost mode, hide-text) to a JSON file
// so they survive app restarts without requiring env vars.
const PREFS_FILE = path.join(app.getPath('userData'), 'preferences.json');

function loadPrefs() {
  try {
    return JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

// Debounced preference persistence.
// Rapid actions (e.g. cycling alignment 5× quickly) batch into a single disk write
// instead of 5 synchronous writeFileSync calls. The 500ms window is long enough to
// coalesce bursts but short enough that prefs survive an unexpected quit.
let _prefsPending = null;
let _prefsTimer = null;

function _flushPrefs() {
  if (_prefsTimer) { clearTimeout(_prefsTimer); _prefsTimer = null; }
  if (!_prefsPending) return;
  const merged = _prefsPending;
  _prefsPending = null;
  try {
    const dir = path.dirname(PREFS_FILE);
    fs.mkdirSync(dir, { recursive: true });
    // Atomic write: write to a temp file then rename, so a crash mid-write
    // doesn't corrupt the preferences file.
    const tmp = path.join(dir, `.preferences.${process.pid}.tmp`);
    fs.writeFileSync(tmp, JSON.stringify(merged, null, 2));
    try {
      fs.renameSync(tmp, PREFS_FILE);
    } catch {
      // On Windows, renameSync can fail with EPERM/EACCES when overwriting.
      // Fall back to copy + unlink which is less atomic but more portable.
      fs.copyFileSync(tmp, PREFS_FILE);
      try { fs.unlinkSync(tmp); } catch {}
    }
  } catch {
    // Best-effort; don't crash if disk is full or permissions are wrong.
  }
}

function savePrefs(patch) {
  try {
    const current = _prefsPending || loadPrefs();
    _prefsPending = { ...current, ...patch };
    if (_prefsTimer) clearTimeout(_prefsTimer);
    _prefsTimer = setTimeout(_flushPrefs, 500);
  } catch {
    // Best-effort
  }
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

function createWindow({ capture = false, initWidth, initHeight } = {}) {
  const display = screen.getPrimaryDisplay();
  const envWidth = Number(process.env.MOLT_MASCOT_WIDTH);
  const envHeight = Number(process.env.MOLT_MASCOT_HEIGHT);
  const width = (Number.isFinite(initWidth) && initWidth > 0) ? initWidth
    : (Number.isFinite(envWidth) && envWidth > 0 ? envWidth : 240);
  const height = (Number.isFinite(initHeight) && initHeight > 0) ? initHeight
    : (Number.isFinite(envHeight) && envHeight > 0 ? envHeight : 200);
  const pos = getPosition(display, width, height, alignmentOverride, paddingOverride);

  const win = new BrowserWindow({
    width,
    height,
    x: Math.round(pos.x),
    y: Math.round(pos.y),
    transparent: capture ? false : true,
    backgroundColor: capture ? '#111827' : '#00000000',
    opacity: capture ? 1.0 : (function() {
      const v = Number(process.env.MOLT_MASCOT_OPACITY);
      return (Number.isFinite(v) && v >= 0 && v <= 1) ? v : 1.0;
    })(),
    show: capture ? false : true,
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

  // Note: sleeping state requires backdating modeSince inside the renderer scope;
  // use __moltMascotSetMode('idle') + manual wait > sleep threshold for manual captures.

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
    copyright: `© 2025–${new Date().getFullYear()} MightComeback`,
    website: 'https://github.com/MightComeback/molt-mascot',
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
  let clickThrough = envClickThrough ? isTruthyEnv(envClickThrough) : (savedPrefs.clickThrough ?? false);

  const envHideText = process.env.MOLT_MASCOT_HIDE_TEXT;
  let hideText = envHideText ? isTruthyEnv(envHideText) : (savedPrefs.hideText ?? false);

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
      ? ((typeof forceValue === 'boolean') ? forceValue : isTruthyEnv(forceValue))
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
      ? ((typeof forceValue === 'boolean') ? forceValue : isTruthyEnv(forceValue))
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
    savePrefs({ alignment: alignmentOverride });
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
    repositionMainWindow({ force: true });
  }

  // Opacity presets for cycling (Cmd+Shift+O)
  const opacityCycle = [1.0, 0.8, 0.6, 0.4];
  let opacityIndex = 0;

  function actionCycleOpacity() {
    opacityIndex = (opacityIndex + 1) % opacityCycle.length;
    const opacity = opacityCycle[opacityIndex];
    withMainWin((w) => {
      w.setOpacity(opacity);
      w.webContents.send('molt-mascot:opacity', opacity);
    });
    savePrefs({ opacityIndex });
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
      if (!repositioning) userDragged = true;
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
      });
    });
  }

  // Size presets for Cmd+Shift+Z cycling (label, width, height).
  // Declared before window creation so the initial window can use the saved size.
  const sizeCycle = [
    { label: 'small', width: 160, height: 140 },
    { label: 'medium', width: 240, height: 200 },
    { label: 'large', width: 360, height: 300 },
  ];
  let sizeIndex = (typeof savedPrefs.sizeIndex === 'number' && savedPrefs.sizeIndex >= 0 && savedPrefs.sizeIndex < sizeCycle.length)
    ? savedPrefs.sizeIndex : 1;

  // Pass saved size into createWindow to avoid a visible flash-resize on launch.
  const initSize = sizeCycle[sizeIndex];
  _mainWin = createWindow({ initWidth: initSize.width, initHeight: initSize.height });
  wireMainWindow(_mainWin);

  // --- System tray (makes the app discoverable when dock is hidden) ---
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
  let tray = new Tray(trayIcon);
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

  // Alignment cycling order for Cmd+Shift+A shortcut
  const alignmentCycle = [
    'bottom-right', 'bottom-left', 'top-right', 'top-left',
    'bottom-center', 'top-center', 'center-left', 'center-right', 'center',
  ];
  let alignmentIndex = alignmentCycle.indexOf(
    (alignmentOverride || process.env.MOLT_MASCOT_ALIGN || 'bottom-right').toLowerCase()
  );
  if (alignmentIndex < 0) alignmentIndex = 0;

  // Restore saved opacity preference
  if (typeof savedPrefs.opacityIndex === 'number' && savedPrefs.opacityIndex >= 0 && savedPrefs.opacityIndex < opacityCycle.length) {
    opacityIndex = savedPrefs.opacityIndex;
    if (opacityIndex !== 0) {
      withMainWin((w) => w.setOpacity(opacityCycle[opacityIndex]));
    }
  }

  function rebuildTrayMenu() {
    // Update tooltip to reflect current state (ghost mode, alignment, etc.)
    const tooltipParts = [`Molt Mascot v${APP_VERSION}`];
    if (clickThrough) tooltipParts.push('👻 Ghost');
    if (hideText) tooltipParts.push('🙈 Text hidden');
    const currentAlign = (alignmentOverride || process.env.MOLT_MASCOT_ALIGN || 'bottom-right').toLowerCase();
    tooltipParts.push(`📍 ${currentAlign}`);
    tooltipParts.push(`📐 ${sizeCycle[sizeIndex].label}`);
    if (opacityIndex !== 0) tooltipParts.push(`🔅 ${Math.round(opacityCycle[opacityIndex] * 100)}%`);
    tray.setToolTip(tooltipParts.join(' · '));

    const menu = Menu.buildFromTemplate([
      { label: `Molt Mascot v${APP_VERSION}`, enabled: false },
      { label: 'About Molt Mascot', click: () => app.showAboutPanel() },
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
        label: `Opacity: ${Math.round(opacityCycle[opacityIndex] * 100)}%`,
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

  function repositionMainWindow({ force = false } = {}) {
    withMainWin((w) => {
      // If the user dragged the window manually, don't snap it back
      // unless this is an explicit alignment/padding change (force=true).
      if (userDragged && !force) return;
      const display = screen.getPrimaryDisplay();
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
    savePrefs({ alignment: alignmentOverride });
    rebuildTrayMenu();
  });

  ipcMain.on('molt-mascot:set-opacity', (event, opacity) => {
    withMainWin((w) => {
      const v = Number(opacity);
      if (Number.isFinite(v) && v >= 0 && v <= 1) {
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
        savePrefs({ opacityIndex });
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
    if (!Number.isFinite(v) || v < 0) return;
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
      _mainWin = createWindow({ initWidth: sz.width, initHeight: sz.height });
      wireMainWindow(_mainWin);
    }
  });

  app.on('will-quit', () => {
    try { globalShortcut.unregisterAll(); } catch {}
    // Flush any pending preference writes before exit so the last action isn't lost.
    _flushPrefs();
    // Destroy tray icon to prevent ghost icons on Windows/Linux after quit.
    try { if (tray) { tray.destroy(); tray = null; } } catch {}
    // Cancel any pending display-metrics debounce timer.
    if (displayDebounce) { clearTimeout(displayDebounce); displayDebounce = null; }
  });
});

app.on('window-all-closed', () => {
  // With app.dock.hide(), we cannot re-activate the app if the window closes.
  // Ensure the process quits on all platforms to prevent zombies.
  app.quit();
});
