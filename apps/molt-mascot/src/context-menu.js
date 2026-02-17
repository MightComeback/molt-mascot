/**
 * Context menu module for Molt Mascot.
 * Extracted from renderer.js for maintainability and testability.
 */

/**
 * @typedef {Object} MenuItem
 * @property {string} [label]
 * @property {string} [hint]
 * @property {() => void} [action]
 * @property {boolean} [separator]
 */

let _activeMenu = null;
let activeCleanup = null;

/**
 * Dismiss any currently open context menu.
 */
export function dismiss() {
  if (activeCleanup) activeCleanup();
}

/**
 * Show a context menu at the given coordinates.
 * Automatically dismisses any previously open menu.
 *
 * @param {MenuItem[]} items - Menu items (use { separator: true } for dividers)
 * @param {{ x: number, y: number }} position - Screen coordinates
 * @returns {HTMLElement} The menu DOM element
 */
export function show(items, { x, y }) {
  dismiss();

  const menu = document.createElement('div');
  menu.id = 'molt-ctx';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Mascot actions');
  // Position initially off-screen so we can measure actual dimensions
  menu.style.left = '-9999px';
  menu.style.top = '-9999px';

  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.dataset.separator = '';
      sep.setAttribute('role', 'separator');
      menu.appendChild(sep);
      continue;
    }
    const row = document.createElement('div');
    row.setAttribute('role', 'menuitem');
    row.tabIndex = -1;
    if (item.disabled) {
      row.setAttribute('aria-disabled', 'true');
      row.dataset.disabled = '';
    }
    const labelSpan = document.createElement('span');
    labelSpan.textContent = item.label;
    row.appendChild(labelSpan);
    if (item.hint) {
      const hintSpan = document.createElement('span');
      hintSpan.textContent = item.hint;
      hintSpan.className = 'ctx-hint';
      // Expose keyboard shortcut to assistive technology
      row.setAttribute('aria-keyshortcuts', item.hint);
      row.appendChild(hintSpan);
    }
    row.addEventListener('click', () => { if (item.disabled) return; cleanup(); item.action?.(); });
    menu.appendChild(row);
  }

  document.body.appendChild(menu);

  // Reposition using actual measured dimensions to prevent overflow
  const menuRect = typeof menu.getBoundingClientRect === 'function'
    ? menu.getBoundingClientRect()
    : { width: 140, height: 120 };
  const clampedX = Math.max(0, Math.min(x, window.innerWidth - menuRect.width));
  const clampedY = Math.max(0, Math.min(y, window.innerHeight - menuRect.height));
  menu.style.left = `${clampedX}px`;
  menu.style.top = `${clampedY}px`;

  _activeMenu = menu;

  // Keyboard navigation
  const menuItems = Array.from(menu.children);
  let focusIdx = -1;

  const interactiveIndices = menuItems
    .map((el, i) => ({ el, i }))
    .filter(({ el }) => el.dataset.separator === undefined && el.dataset.disabled === undefined)
    .map(({ i }) => i);

  const setFocus = (idx) => {
    if (idx < 0 || idx >= menuItems.length) return;
    if (focusIdx >= 0 && focusIdx < menuItems.length) {
      menuItems[focusIdx].classList.remove('ctx-focus');
    }
    focusIdx = idx;
    menuItems[focusIdx].classList.add('ctx-focus');
  };

  const focusNext = () => {
    if (!interactiveIndices.length) return;
    const cur = interactiveIndices.indexOf(focusIdx);
    const next = cur < interactiveIndices.length - 1 ? cur + 1 : 0;
    setFocus(interactiveIndices[next]);
  };

  const focusPrev = () => {
    if (!interactiveIndices.length) return;
    const cur = interactiveIndices.indexOf(focusIdx);
    const prev = cur > 0 ? cur - 1 : interactiveIndices.length - 1;
    setFocus(interactiveIndices[prev]);
  };

  const onOutsideClick = (ev) => {
    if (!menu.contains(ev.target)) cleanup();
  };

  const onKey = (ev) => {
    if (ev.key === 'Escape') { cleanup(); return; }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); focusNext(); return; }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); focusPrev(); return; }
    if (ev.key === 'Tab') { cleanup(); return; }
    if (ev.key === 'Home') { ev.preventDefault(); if (interactiveIndices.length) setFocus(interactiveIndices[0]); return; }
    if (ev.key === 'End') { ev.preventDefault(); if (interactiveIndices.length) setFocus(interactiveIndices[interactiveIndices.length - 1]); return; }
    if (ev.key === 'Enter' && focusIdx >= 0 && focusIdx < menuItems.length) {
      ev.preventDefault();
      menuItems[focusIdx].click();
      return;
    }
    // Type-ahead: jump to the next menu item starting with the pressed letter
    if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      const ch = ev.key.toLowerCase();
      const curPos = interactiveIndices.indexOf(focusIdx);
      // Search from the item after the current focus, wrapping around
      for (let offset = 1; offset <= interactiveIndices.length; offset++) {
        const candidate = interactiveIndices[(curPos + offset) % interactiveIndices.length];
        const label = (menuItems[candidate].textContent || '').trim().toLowerCase();
        // Skip checkmark prefix (✓) for matching
        const cleanLabel = label.replace(/^✓\s*/, '');
        if (cleanLabel.startsWith(ch)) {
          setFocus(candidate);
          break;
        }
      }
    }
  };

  function cleanup() {
    menu.remove();
    document.removeEventListener('click', onOutsideClick, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', cleanup);
    _activeMenu = null;
    activeCleanup = null;
  }

  activeCleanup = cleanup;

  // Defer listener registration so the triggering click doesn't immediately dismiss
  setTimeout(() => {
    document.addEventListener('click', onOutsideClick, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', cleanup);
  }, 0);

  // Hybrid mouse/keyboard navigation: when the mouse enters a menu item,
  // move the visual focus indicator to it so keyboard and pointer highlighting
  // never conflict (mirrors native OS context-menu behavior).
  for (const idx of interactiveIndices) {
    menuItems[idx].addEventListener('mouseenter', () => setFocus(idx));
  }

  // Auto-focus first interactive item
  if (interactiveIndices.length) setFocus(interactiveIndices[0]);

  return menu;
}
