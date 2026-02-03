const { contextBridge, ipcRenderer } = require('electron');
const pkg = require('../package.json');

contextBridge.exposeInMainWorld('moltMascot', {
  setClickThrough: (enabled) => ipcRenderer.send('molt-mascot:set-click-through', enabled),
  setAlignment: (align) => ipcRenderer.send('molt-mascot:set-alignment', align),
  setOpacity: (opacity) => ipcRenderer.send('molt-mascot:set-opacity', opacity),
  setPadding: (padding) => ipcRenderer.send('molt-mascot:set-padding', padding),
  onClickThrough: (callback) => ipcRenderer.on('molt-mascot:click-through', (_event, enabled) => callback(enabled)), 
  onHideText: (callback) => ipcRenderer.on('molt-mascot:hide-text', (_event, hidden) => callback(hidden)),
  onReset: (callback) => ipcRenderer.on('molt-mascot:reset', () => callback()),
  platform: process.platform,
  version: pkg.version,
  env: {
    gatewayUrl: process.env.GATEWAY_URL || process.env.CLAWDBOT_GATEWAY_URL || process.env.gatewayUrl || '',
    gatewayToken: process.env.GATEWAY_TOKEN || process.env.CLAWDBOT_GATEWAY_TOKEN || process.env.gatewayToken || '',
    captureDir: process.env.MOLT_MASCOT_CAPTURE_DIR || '',
    idleDelayMs: process.env.MOLT_MASCOT_IDLE_DELAY_MS || '',
    errorHoldMs: process.env.MOLT_MASCOT_ERROR_HOLD_MS || '',
    hideText: process.env.MOLT_MASCOT_HIDE_TEXT || '',
    clickThrough: process.env.MOLT_MASCOT_CLICKTHROUGH || '',
  },
});
