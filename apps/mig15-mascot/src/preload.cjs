const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('mig15', {
  platform: process.platform,
});
