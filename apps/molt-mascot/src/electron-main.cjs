const { app, BrowserWindow, screen, globalShortcut, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const { isTruthyEnv } = require('./is-truthy-env.cjs');

// Fix for Windows notifications/taskbar grouping (matches package.json appId)
if (process.platform === 'win32') {
  app.setAppUserModelId('com.mightcomeback.molt-mascot');
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

function getPosition(display, width, height, alignOverride, paddingOverride) {
  const envPadding = Number(process.env.MOLT_MASCOT_PADDING);
  const basePadding = Math.max(0, Number.isFinite(envPadding) ? envPadding : 24);
  const padding = (Number.isFinite(paddingOverride) && paddingOverride >= 0) ? paddingOverride : basePadding;

  const rawAlign = (typeof alignOverride === 'string' && alignOverride.trim())
    ? alignOverride
    : (process.env.MOLT_MASCOT_ALIGN || 'bottom-right');
  const align = rawAlign.toLowerCase();
  const { x, y, width: dw, height: dh } = display.workArea;

  switch (align) {
    case 'bottom-left':
      return { x: x + padding, y: y + dh - height - padding };
    case 'top-right':
      return { x: x + dw - width - padding, y: y + padding };
    case 'top-left':
      return { x: x + padding, y: y + padding };
    case 'center':
      return { x: x + (dw - width) / 2, y: y + (dh - height) / 2 };
    case 'center-left':
      return { x: x + padding, y: y + (dh - height) / 2 };
    case 'center-right':
      return { x: x + dw - width - padding, y: y + (dh - height) / 2 };
    case 'top-center':
      return { x: x + (dw - width) / 2, y: y + padding };
    case 'bottom-center':
      return { x: x + (dw - width) / 2, y: y + dh - height - padding };
    case 'bottom-right':
    default:
      return { x: x + dw - width - padding, y: y + dh - height - padding };
  }
}

function createWindow({ capture = false } = {}) {
  const display = screen.getPrimaryDisplay();
  const envWidth = Number(process.env.MOLT_MASCOT_WIDTH);
  const envHeight = Number(process.env.MOLT_MASCOT_HEIGHT);
  const width = Number.isFinite(envWidth) && envWidth > 0 ? envWidth : 240;
  const height = Number.isFinite(envHeight) && envHeight > 0 ? envHeight : 200;
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

  const modes = ['idle', 'thinking', 'tool', 'error'];
  
  // Freeze time at 0 for deterministic bobbing (frame 0)
  await win.webContents.executeJavaScript(`window.__moltMascotSetTime && window.__moltMascotSetTime(0)`);

  for (const mode of modes) {
    await win.webContents.executeJavaScript(`window.__moltMascotSetMode && window.__moltMascotSetMode(${JSON.stringify(mode)})`);
    await new Promise((r) => setTimeout(r, 120));
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(CAPTURE_DIR, `${mode}.png`), img.toPNG());
  }

  try { win.close(); } catch {}
}

function applyClickThrough(win, enabled) {
  try {
    win.setIgnoreMouseEvents(Boolean(enabled), { forward: true });
  } catch {}
}

app.whenReady().then(async () => {
  // Hide dock icon on macOS for a true desktop widget experience
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  if (CAPTURE_DIR) {
    await captureScreenshots();
    app.quit();
    return;
  }

  _mainWin = createWindow();

  // Detect manual drags: if the window moves and we didn't trigger it,
  // mark as user-dragged so auto-reposition doesn't snap it back.
  let repositioning = false;

  _mainWin.on('moved', () => {
    if (!repositioning) {
      userDragged = true;
    }
  });

  // Optional UX: make the mascot click-through so it never blocks clicks.
  // Toggle at runtime with Cmd/Ctrl+Shift+M.
  // Back-compat: accept both MOLT_MASCOT_CLICKTHROUGH and MOLT_MASCOT_CLICK_THROUGH
  let clickThrough = isTruthyEnv(process.env.MOLT_MASCOT_CLICKTHROUGH ?? process.env.MOLT_MASCOT_CLICK_THROUGH);
  applyClickThrough(_mainWin, clickThrough);

  let hideText = isTruthyEnv(process.env.MOLT_MASCOT_HIDE_TEXT);

  // --- System tray (makes the app discoverable when dock is hidden) ---
  // Create a tiny 16x16 red square as a tray icon (lobster-red).
  const trayCanvas = Buffer.alloc(16 * 16 * 4);
  for (let i = 0; i < 16 * 16; i++) {
    // #e0433a (lobster red)
    trayCanvas[i * 4 + 0] = 0xe0;
    trayCanvas[i * 4 + 1] = 0x43;
    trayCanvas[i * 4 + 2] = 0x3a;
    trayCanvas[i * 4 + 3] = 0xff;
  }
  const trayIcon = nativeImage.createFromBuffer(trayCanvas, { width: 16, height: 16 });
  let tray = new Tray(trayIcon);
  tray.setToolTip(`Molt Mascot v${require('../package.json').version}`);

  // Alignment cycling order for Cmd+Shift+A shortcut
  const alignmentCycle = [
    'bottom-right', 'bottom-left', 'top-right', 'top-left',
    'bottom-center', 'top-center', 'center-left', 'center-right', 'center',
  ];
  let alignmentIndex = alignmentCycle.indexOf(
    (alignmentOverride || process.env.MOLT_MASCOT_ALIGN || 'bottom-right').toLowerCase()
  );
  if (alignmentIndex < 0) alignmentIndex = 0;

  function rebuildTrayMenu() {
    // Update tooltip to reflect current state (ghost mode, alignment, etc.)
    const tooltipParts = [`Molt Mascot v${require('../package.json').version}`];
    if (clickThrough) tooltipParts.push('👻 Ghost');
    if (hideText) tooltipParts.push('🙈 Text hidden');
    const currentAlign = (alignmentOverride || process.env.MOLT_MASCOT_ALIGN || 'bottom-right').toLowerCase();
    tooltipParts.push(`📍 ${currentAlign}`);
    tray.setToolTip(tooltipParts.join(' · '));

    const menu = Menu.buildFromTemplate([
      { label: `Molt Mascot v${require('../package.json').version}`, enabled: false },
      { type: 'separator' },
      {
        label: withMainWin((w) => w.isVisible()) ? 'Hide Mascot' : 'Show Mascot',
        accelerator: 'CommandOrControl+Shift+V',
        click: () => {
          withMainWin((w) => {
            if (w.isVisible()) w.hide();
            else w.show();
            rebuildTrayMenu();
          });
        },
      },
      {
        label: 'Ghost Mode (Click-Through)',
        type: 'checkbox',
        checked: clickThrough,
        accelerator: 'CommandOrControl+Shift+M',
        click: () => {
          clickThrough = !clickThrough;
          withMainWin((w) => {
            applyClickThrough(w, clickThrough);
            w.webContents.send('molt-mascot:click-through', clickThrough);
          });
          rebuildTrayMenu();
        },
      },
      {
        label: 'Hide Text',
        type: 'checkbox',
        checked: hideText,
        accelerator: 'CommandOrControl+Shift+H',
        click: () => {
          hideText = !hideText;
          withMainWin((w) => w.webContents.send('molt-mascot:hide-text', hideText));
          rebuildTrayMenu();
        },
      },
      {
        label: `Cycle Alignment (${(alignmentOverride || process.env.MOLT_MASCOT_ALIGN || 'bottom-right').toLowerCase()})`,
        accelerator: 'CommandOrControl+Shift+A',
        click: () => {
          alignmentIndex = (alignmentIndex + 1) % alignmentCycle.length;
          alignmentOverride = alignmentCycle[alignmentIndex];
          repositionMainWindow({ force: true });
          rebuildTrayMenu();
        },
      },
      {
        label: 'Snap to Position',
        toolTip: 'Reset manual drag and snap back to the configured alignment corner',
        accelerator: 'CommandOrControl+Shift+S',
        click: () => {
          userDragged = false;
          repositionMainWindow({ force: true });
        },
      },
      { type: 'separator' },
      {
        label: 'Reset State',
        accelerator: 'CommandOrControl+Shift+R',
        click: () => {
          withMainWin((w) => w.webContents.send('molt-mascot:reset'));
        },
      },
      {
        label: 'DevTools',
        accelerator: 'CommandOrControl+Shift+D',
        click: () => {
          withMainWin((w) => {
            if (w.webContents.isDevToolsOpened()) w.webContents.closeDevTools();
            else w.webContents.openDevTools({ mode: 'detach' });
          });
        },
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
  }

  rebuildTrayMenu();

  // Apply initial state once loaded
  _mainWin.webContents.once('did-finish-load', () => {
    withMainWin((w) => {
      if (hideText) w.webContents.send('molt-mascot:hide-text', hideText);
      if (clickThrough) w.webContents.send('molt-mascot:click-through', clickThrough);
    });
  });

  try {
    const register = (acc, cb) => {
      if (!globalShortcut.register(acc, cb)) {
        console.warn(`molt-mascot: failed to register shortcut ${acc}`);
      }
    };

    register('CommandOrControl+Shift+M', () => {
      clickThrough = !clickThrough;
      withMainWin((w) => {
        applyClickThrough(w, clickThrough);
        w.webContents.send('molt-mascot:click-through', clickThrough);
      });
      // eslint-disable-next-line no-console
      console.log(`molt-mascot: click-through ${clickThrough ? 'ON' : 'OFF'}`);
      rebuildTrayMenu();
    });

    register('CommandOrControl+Shift+H', () => {
      hideText = !hideText;
      withMainWin((w) => w.webContents.send('molt-mascot:hide-text', hideText));
      // eslint-disable-next-line no-console
      console.log(`molt-mascot: hide-text ${hideText ? 'ON' : 'OFF'}`);
      rebuildTrayMenu();
    });

    register('CommandOrControl+Shift+R', () => {
      // eslint-disable-next-line no-console
      console.log('molt-mascot: reset triggered');
      withMainWin((w) => w.webContents.send('molt-mascot:reset'));
    });

    register('CommandOrControl+Shift+A', () => {
      alignmentIndex = (alignmentIndex + 1) % alignmentCycle.length;
      alignmentOverride = alignmentCycle[alignmentIndex];
      repositionMainWindow({ force: true });
      rebuildTrayMenu();
      // eslint-disable-next-line no-console
      console.log(`molt-mascot: alignment → ${alignmentOverride}`);
    });

    register('CommandOrControl+Shift+V', () => {
      withMainWin((w) => {
        if (w.isVisible()) w.hide();
        else w.show();
        rebuildTrayMenu();
        // eslint-disable-next-line no-console
        console.log(`molt-mascot: visibility ${w.isVisible() ? 'ON' : 'OFF'}`);
      });
    });

    register('CommandOrControl+Alt+Q', () => {
      // eslint-disable-next-line no-console
      console.log('molt-mascot: quit triggered');
      app.quit();
    });

    register('CommandOrControl+Shift+S', () => {
      userDragged = false;
      repositionMainWindow({ force: true });
      // eslint-disable-next-line no-console
      console.log('molt-mascot: snapped to position');
    });

    register('CommandOrControl+Shift+D', () => {
      withMainWin((w) => {
        if (w.webContents.isDevToolsOpened()) w.webContents.closeDevTools();
        else w.webContents.openDevTools({ mode: 'detach' });
        // eslint-disable-next-line no-console
        console.log('molt-mascot: devtools toggled');
      });
    });
  } catch (err) {
    console.error('molt-mascot: failed to register shortcuts', err);
  }

  ipcMain.on('molt-mascot:quit', () => app.quit());

  ipcMain.on('molt-mascot:set-click-through', (event, enabled) => {
    // `Boolean("false") === true`, so we need a more careful coercion here.
    clickThrough = (typeof enabled === 'boolean') ? enabled : isTruthyEnv(enabled);
    withMainWin((w) => {
      applyClickThrough(w, clickThrough);
      w.webContents.send('molt-mascot:click-through', clickThrough);
    });
  });

  ipcMain.on('molt-mascot:set-hide-text', (event, hidden) => {
    hideText = (typeof hidden === 'boolean') ? hidden : isTruthyEnv(hidden);
    withMainWin((w) => w.webContents.send('molt-mascot:hide-text', hideText));
  });

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

    repositionMainWindow({ force: true });
  });

  ipcMain.on('molt-mascot:set-opacity', (event, opacity) => {
    withMainWin((w) => {
      const v = Number(opacity);
      if (Number.isFinite(v) && v >= 0 && v <= 1) w.setOpacity(v);
    });
  });

  ipcMain.on('molt-mascot:set-padding', (event, padding) => {
    const v = Number(padding);
    if (!Number.isFinite(v) || v < 0) return;
    paddingOverride = v;
    repositionMainWindow({ force: true });
  });

  // Keep the mascot pinned when display workArea changes (monitor attach/detach,
  // resolution/dock changes, etc.).
  try {
    screen.on('display-metrics-changed', repositionMainWindow);
    screen.on('display-added', repositionMainWindow);
    screen.on('display-removed', repositionMainWindow);
  } catch {}

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      _mainWin = createWindow();
      applyClickThrough(_mainWin, clickThrough);
    }
  });

  app.on('will-quit', () => {
    try { globalShortcut.unregisterAll(); } catch {}
  });
});

app.on('window-all-closed', () => {
  // With app.dock.hide(), we cannot re-activate the app if the window closes.
  // Ensure the process quits on all platforms to prevent zombies.
  app.quit();
});
