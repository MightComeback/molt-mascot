/**
 * Shared mode → emoji map for display across renderer and tray icon.
 * Single source of truth: previously duplicated in renderer.js and tray-icon.cjs.
 */
const MODE_EMOJI = Object.freeze({
  thinking: '🧠',
  tool: '🔧',
  error: '❌',
  connecting: '🔄',
  disconnected: '⚡',
  connected: '✅',
  sleeping: '💤',
});

module.exports = { MODE_EMOJI };
