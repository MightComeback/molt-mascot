const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('moltMascot', {
  platform: process.platform,
  env: {
    gatewayUrl: process.env.GATEWAY_URL || process.env.CLAWDBOT_GATEWAY_URL || '',
    gatewayToken: process.env.GATEWAY_TOKEN || process.env.CLAWDBOT_GATEWAY_TOKEN || '',
    captureDir: process.env.MOLT_MASCOT_CAPTURE_DIR || '',
    idleDelayMs: process.env.MOLT_MASCOT_IDLE_DELAY_MS || '',
    errorHoldMs: process.env.MOLT_MASCOT_ERROR_HOLD_MS || '',
  },
});
