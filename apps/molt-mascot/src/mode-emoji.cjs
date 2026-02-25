/**
 * Canonical mode string constants.
 * Single source of truth — previously each consumer defined its own
 * `const Mode = { idle: 'idle', ... }` object (renderer.js, electron-main.cjs).
 * Import this instead to avoid drift between the mode enum and VALID_MODES.
 */
const MODE = Object.freeze({
  idle: "idle",
  thinking: "thinking",
  tool: "tool",
  error: "error",
  connecting: "connecting",
  connected: "connected",
  disconnected: "disconnected",
  sleeping: "sleeping",
});

/**
 * Shared mode → emoji map for display across renderer and tray icon.
 * Single source of truth: previously duplicated in renderer.js and tray-icon.cjs.
 */
const MODE_EMOJI = Object.freeze({
  idle: "●",
  thinking: "🧠",
  tool: "🔧",
  error: "❌",
  connecting: "🔄",
  disconnected: "⚡",
  connected: "✅",
  sleeping: "💤",
});

/**
 * Human-readable descriptions for each mode.
 * Useful for accessibility labels (aria-label, aria-description), tooltip alt-text,
 * About panel, and documentation. Avoids scattering ad-hoc mode descriptions
 * across renderer, tray, and context-menu code.
 */
const MODE_DESCRIPTIONS = Object.freeze({
  idle: "Waiting for activity",
  thinking: "Processing a response",
  tool: "Running a tool",
  error: "An error occurred",
  connecting: "Connecting to gateway",
  disconnected: "Disconnected from gateway",
  connected: "Successfully connected",
  sleeping: "Idle for an extended period",
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
  if (typeof value !== "string") return false;
  return _VALID_MODES_SET.has(value);
}

module.exports = {
  MODE,
  MODE_EMOJI,
  MODE_DESCRIPTIONS,
  VALID_MODES,
  isValidMode,
};
