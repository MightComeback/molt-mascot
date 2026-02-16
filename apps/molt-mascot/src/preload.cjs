const { contextBridge, ipcRenderer } = require('electron');
const pkg = require('../package.json');

contextBridge.exposeInMainWorld('moltMascot', {
  setClickThrough: (enabled) => ipcRenderer.send('molt-mascot:set-click-through', enabled),
  setHideText: (hidden) => ipcRenderer.send('molt-mascot:set-hide-text', hidden),
  setAlignment: (align) => ipcRenderer.send('molt-mascot:set-alignment', align),
  setOpacity: (opacity) => ipcRenderer.send('molt-mascot:set-opacity', opacity),
  setPadding: (padding) => ipcRenderer.send('molt-mascot:set-padding', padding),
  quit: () => ipcRenderer.send('molt-mascot:quit'),
  onClickThrough: (callback) => ipcRenderer.on('molt-mascot:click-through', (_event, enabled) => callback(enabled)),
  onHideText: (callback) => ipcRenderer.on('molt-mascot:hide-text', (_event, hidden) => callback(hidden)),
  onReset: (callback) => ipcRenderer.on('molt-mascot:reset', () => callback()),
  platform: process.platform,
  version: pkg.version,
  env: {
    gatewayUrl: process.env.GATEWAY_URL || process.env.OPENCLAW_GATEWAY_URL || process.env.CLAWDBOT_GATEWAY_URL || process.env.gatewayUrl || '',
    gatewayToken: process.env.GATEWAY_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN || process.env.CLAWDBOT_GATEWAY_TOKEN || process.env.gatewayToken || '',
    // Allow protocol negotiation for older/newer Gateways.
    // Prefer the same env vars as tools/ws-dump for consistency.
    minProtocol: process.env.GATEWAY_MIN_PROTOCOL || process.env.MOLT_MASCOT_MIN_PROTOCOL || '',
    maxProtocol: process.env.GATEWAY_MAX_PROTOCOL || process.env.MOLT_MASCOT_MAX_PROTOCOL || '',
    captureDir: process.env.MOLT_MASCOT_CAPTURE_DIR || '',
    idleDelayMs: process.env.MOLT_MASCOT_IDLE_DELAY_MS || '',
    errorHoldMs: process.env.MOLT_MASCOT_ERROR_HOLD_MS || '',
    // Back-compat: accept MOLT_MASCOT_HIDE_TEXT and older var spellings
    hideText: process.env.MOLT_MASCOT_HIDE_TEXT || process.env.MOLT_MASCOT_HIDETEXT || '',
    // Back-compat: accept both MOLT_MASCOT_CLICKTHROUGH and MOLT_MASCOT_CLICK_THROUGH
    clickThrough: process.env.MOLT_MASCOT_CLICKTHROUGH || process.env.MOLT_MASCOT_CLICK_THROUGH || '',
  },
});
