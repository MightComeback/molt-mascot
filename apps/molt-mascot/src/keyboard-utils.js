/**
 * Keyboard event classification helpers.
 *
 * Extracted from renderer.js for testability — the original inline functions
 * were duplicated across pill and canvas keydown handlers. Now both import
 * from this single source of truth.
 *
 * @module keyboard-utils
 */

/**
 * Whether a key event represents an "activate" action (Enter or Space).
 * Used by interactive elements (pill, canvas) to trigger their primary action
 * on keyboard input, matching native button behavior per WAI-ARIA practices.
 *
 * @param {string} key - The KeyboardEvent.key value
 * @returns {boolean}
 */
export function isActivateKey(key) {
  return key === "Enter" || key === " ";
}

/**
 * Whether a key event represents a context menu request (Shift+F10 or ContextMenu key).
 * Matches the native OS convention for opening context menus via keyboard.
 *
 * @param {string} key - The KeyboardEvent.key value
 * @param {boolean} shiftKey - Whether the Shift modifier is held
 * @returns {boolean}
 */
export function isContextMenuKey(key, shiftKey) {
  return (key === "F10" && shiftKey) || key === "ContextMenu";
}
