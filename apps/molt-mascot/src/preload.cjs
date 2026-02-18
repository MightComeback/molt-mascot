const { contextBridge, ipcRenderer } = require('electron');
const pkg = require('../package.json');

// Helper: create a send function for a given IPC channel.
const send = (ch) => (...args) => ipcRenderer.send(ch, ...args);

// Helper: subscribe to an IPC channel, returning an unsubscribe function.
// For channels with a payload arg, the callback receives the payload directly.
// For channels without a payload (e.g. reset, force-reconnect), callback is called with no args.
function onIpc(channel, callback) {
  const handler = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('moltMascot', {
  setClickThrough: send('molt-mascot:set-click-through'),
  setHideText: send('molt-mascot:set-hide-text'),
  setAlignment: send('molt-mascot:set-alignment'),
  setOpacity: send('molt-mascot:set-opacity'),
  setPadding: send('molt-mascot:set-padding'),
  setSize: send('molt-mascot:set-size'),
  cycleAlignment: send('molt-mascot:cycle-alignment'),
  snapToPosition: send('molt-mascot:snap-to-position'),
  cycleSize: send('molt-mascot:cycle-size'),
  hide: send('molt-mascot:hide'),
  toggleDevTools: send('molt-mascot:toggle-devtools'),
  quit: send('molt-mascot:quit'),
  showAbout: send('molt-mascot:show-about'),
  forceReconnect: send('molt-mascot:force-reconnect'),
  cycleOpacity: send('molt-mascot:cycle-opacity'),
  copyDebugInfo: send('molt-mascot:copy-debug-info'),
  updateMode: send('molt-mascot:mode-update'),
  onClickThrough: (cb) => onIpc('molt-mascot:click-through', cb),
  onHideText: (cb) => onIpc('molt-mascot:hide-text', cb),
  onReset: (cb) => onIpc('molt-mascot:reset', cb),
  onAlignment: (cb) => onIpc('molt-mascot:alignment', cb),
  onSize: (cb) => onIpc('molt-mascot:size', cb),
  onOpacity: (cb) => onIpc('molt-mascot:opacity', cb),
  onForceReconnect: (cb) => onIpc('molt-mascot:force-reconnect', cb),
  onCopied: (cb) => onIpc('molt-mascot:copied', cb),
  processUptimeS: () => process.uptime(),
  platform: process.platform,
  version: pkg.version,
  versions: {
    electron: process.versions.electron || '',
    chrome: process.versions.chrome || '',
    node: process.versions.node || '',
  },
  env: {
    gatewayUrl: process.env.GATEWAY_URL || process.env.OPENCLAW_GATEWAY_URL || process.env.CLAWDBOT_GATEWAY_URL || process.env.gatewayUrl || '',
    gatewayToken: process.env.GATEWAY_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN || process.env.CLAWDBOT_GATEWAY_TOKEN || process.env.gatewayToken || '',
    // Allow protocol negotiation for older/newer Gateways.
    // Prefer the same env vars as tools/ws-dump for consistency.
    minProtocol: process.env.GATEWAY_MIN_PROTOCOL || process.env.MOLT_MASCOT_MIN_PROTOCOL || '',
    maxProtocol: process.env.GATEWAY_MAX_PROTOCOL || process.env.MOLT_MASCOT_MAX_PROTOCOL || '',
    sleepThresholdS: process.env.MOLT_MASCOT_SLEEP_THRESHOLD_S || '',
    captureDir: process.env.MOLT_MASCOT_CAPTURE_DIR || '',
    idleDelayMs: process.env.MOLT_MASCOT_IDLE_DELAY_MS || '',
    errorHoldMs: process.env.MOLT_MASCOT_ERROR_HOLD_MS || '',
    // Back-compat: accept MOLT_MASCOT_HIDE_TEXT and older var spellings
    hideText: process.env.MOLT_MASCOT_HIDE_TEXT || process.env.MOLT_MASCOT_HIDETEXT || '',
    // Back-compat: accept both MOLT_MASCOT_CLICKTHROUGH and MOLT_MASCOT_CLICK_THROUGH
    clickThrough: process.env.MOLT_MASCOT_CLICKTHROUGH || process.env.MOLT_MASCOT_CLICK_THROUGH || '',
  },
});
