const { app, BrowserWindow, screen, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

const CAPTURE_DIR = process.env.MOLT_MASCOT_CAPTURE_DIR;

function isTruthyEnv(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function getPosition(display, width, height, padding = 24) {
  const align = (process.env.MOLT_MASCOT_ALIGN || 'bottom-right').toLowerCase();
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
    case 'bottom-right':
    default:
      return { x: x + dw - width - padding, y: y + dh - height - padding };
  }
}

function createWindow({ capture = false } = {}) {
  const display = screen.getPrimaryDisplay();
  const width = 240;
  const height = 200;
  const pos = getPosition(display, width, height);

  const win = new BrowserWindow({
    width,
    height,
    x: Math.round(pos.x),
    y: Math.round(pos.y),
    transparent: capture ? false : true,
    backgroundColor: capture ? '#111827' : '#00000000',
    show: capture ? false : true,
    frame: false,
    resizable: false,
    movable: !capture,
    alwaysOnTop: capture ? false : true,
    skipTaskbar: true,
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
  if (CAPTURE_DIR) {
    await captureScreenshots();
    app.quit();
    return;
  }

  let mainWin = createWindow();

  // Optional UX: make the mascot click-through so it never blocks clicks.
  // Toggle at runtime with Cmd/Ctrl+Shift+M.
  let clickThrough = isTruthyEnv(process.env.MOLT_MASCOT_CLICKTHROUGH);
  applyClickThrough(mainWin, clickThrough);

  try {
    globalShortcut.register('CommandOrControl+Shift+M', () => {
      clickThrough = !clickThrough;
      if (mainWin && !mainWin.isDestroyed()) {
        applyClickThrough(mainWin, clickThrough);
      }
      // eslint-disable-next-line no-console
      console.log(`molt-mascot: click-through ${clickThrough ? 'ON' : 'OFF'}`);
    });
  } catch {}

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWin = createWindow();
      applyClickThrough(mainWin, clickThrough);
    }
  });

  app.on('will-quit', () => {
    try { globalShortcut.unregisterAll(); } catch {}
  });
});

app.on('window-all-closed', () => {
  // Keep mascot running like a widget on macOS; quit on other platforms.
  if (process.platform !== 'darwin') app.quit();
});
