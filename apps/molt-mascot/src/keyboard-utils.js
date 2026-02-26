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

/**
 * Whether a key event represents a dismiss/cancel action (Escape key).
 * Used by the context menu and setup form to close on keyboard input,
 * matching native OS behavior for dismissing dialogs and menus.
 *
 * @param {string} key - The KeyboardEvent.key value
 * @returns {boolean}
 */
export function isEscapeKey(key) {
  return key === "Escape";
}

/**
 * Whether a key event represents a "navigate next" action (ArrowDown).
 * Used by the context menu for keyboard item navigation.
 *
 * @param {string} key - The KeyboardEvent.key value
 * @returns {boolean}
 */
export function isNavDownKey(key) {
  return key === "ArrowDown";
}

/**
 * Whether a key event represents a "navigate previous" action (ArrowUp).
 * Used by the context menu for keyboard item navigation.
 *
 * @param {string} key - The KeyboardEvent.key value
 * @returns {boolean}
 */
export function isNavUpKey(key) {
  return key === "ArrowUp";
}

/**
 * Whether a key event represents a "jump to first" action (Home key).
 * Used by the context menu to jump to the first interactive item.
 *
 * @param {string} key - The KeyboardEvent.key value
 * @returns {boolean}
 */
export function isHomeKey(key) {
  return key === "Home";
}

/**
 * Whether a key event represents a "jump to last" action (End key).
 * Used by the context menu to jump to the last interactive item.
 *
 * @param {string} key - The KeyboardEvent.key value
 * @returns {boolean}
 */
export function isEndKey(key) {
  return key === "End";
}

/**
 * Whether a key event represents a tab/dismiss action (Tab key).
 * Used by the context menu to dismiss on Tab (focus leaves the menu).
 *
 * @param {string} key - The KeyboardEvent.key value
 * @returns {boolean}
 */
export function isTabKey(key) {
  return key === "Tab";
}

/**
 * Whether a keyboard event represents a printable (type-ahead) character.
 * Returns true when the pressed key is a single character and no command
 * modifiers (Ctrl, Meta, Alt) are held — i.e., the user is typing text,
 * not invoking a shortcut.
 *
 * Used by the context menu for type-ahead navigation.
 *
 * @param {string} key - The KeyboardEvent.key value
 * @param {{ ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} [modifiers] - Modifier state
 * @returns {boolean}
 */
export function isPrintableKey(key, modifiers) {
  if (typeof key !== "string" || key.length !== 1) return false;
  if (modifiers?.ctrlKey || modifiers?.metaKey || modifiers?.altKey)
    return false;
  return true;
}
