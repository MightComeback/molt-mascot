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
 * Internal Set for O(1) mode validation lookups.
 * Used by isValidMode() on every IPC message — Set.has() avoids the
 * linear scan of Array.includes() (8 modes today, but good hygiene).
 */
const _VALID_MODES_SET = new Set(VALID_MODES);

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
  return _VALID_MODES_SET.has(value);
}

module.exports = { MODE_EMOJI, VALID_MODES, isValidMode };
