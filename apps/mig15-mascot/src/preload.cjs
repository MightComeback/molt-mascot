const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('mig15', {
  platform: process.platform,
  env: {
    gatewayUrl: process.env.GATEWAY_URL || process.env.CLAWDBOT_GATEWAY_URL || '',
    gatewayToken: process.env.GATEWAY_TOKEN || '',
  },
});
