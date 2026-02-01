const { contextBridge, ipcRenderer } = require('electron');
const pkg = require('../package.json');

contextBridge.exposeInMainWorld('moltMascot', {
  setClickThrough: (enabled) => ipcRenderer.send('molt-mascot:set-click-through', enabled),
  onReset: (callback) => ipcRenderer.on('molt-mascot:reset', () => callback()),
  platform: process.platform,
  version: pkg.version,
  env: {
    gatewayUrl: process.env.GATEWAY_URL || process.env.CLAWDBOT_GATEWAY_URL || '',
    gatewayToken: process.env.GATEWAY_TOKEN || process.env.CLAWDBOT_GATEWAY_TOKEN || '',
    captureDir: process.env.MOLT_MASCOT_CAPTURE_DIR || '',
    idleDelayMs: process.env.MOLT_MASCOT_IDLE_DELAY_MS || '',
    errorHoldMs: process.env.MOLT_MASCOT_ERROR_HOLD_MS || '',
    hideText: process.env.MOLT_MASCOT_HIDE_TEXT || '',
  },
});
