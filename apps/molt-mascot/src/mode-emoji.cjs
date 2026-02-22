/**
 * Shared mode → emoji map for display across renderer and tray icon.
 * Single source of truth: previously duplicated in renderer.js and tray-icon.cjs.
 */
const MODE_EMOJI = Object.freeze({
  idle: '●',
  thinking: '🧠',
  tool: '🔧',
  error: '❌',
  connecting: '🔄',
  disconnected: '⚡',
  connected: '✅',
  sleeping: '💤',
});

/**
 * Canonical set of valid mode strings.
 * Frozen array derived from MODE_EMOJI keys — single source of truth.
 */
const VALID_MODES = Object.freeze(Object.keys(MODE_EMOJI));

/**
 * Check whether a string is a recognized mascot mode (case-sensitive).
 * Useful for validating mode values from external sources (plugin state,
 * IPC messages, config) without scattering ad-hoc `in` checks everywhere.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isValidMode(value) {
  if (typeof value !== 'string') return false;
  return VALID_MODES.includes(value);
}

module.exports = { MODE_EMOJI, VALID_MODES, isValidMode };
