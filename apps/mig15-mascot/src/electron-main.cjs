const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const width = 240;
  const height = 200;

  const win = new BrowserWindow({
    width,
    height,
    x: display.workArea.x + display.workArea.width - width - 24,
    y: display.workArea.y + display.workArea.height - height - 24,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Keep mascot running like a widget on macOS; quit on other platforms.
  if (process.platform !== 'darwin') app.quit();
});
