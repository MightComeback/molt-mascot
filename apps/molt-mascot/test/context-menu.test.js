import { describe, expect, it, beforeEach, afterEach } from "bun:test";

// Minimal DOM shim for context-menu tests (jsdom-free).
// context-menu.js uses: document.createElement, document.body.appendChild,
// document.addEventListener, document.removeEventListener, window.addEventListener,
// window.removeEventListener, window.innerWidth, window.innerHeight.

function makeElement(tag) {
  const el = {
    _tag: tag,
    _children: [],
    _listeners: {},
    _classes: new Set(),
    _attrs: {},
    id: "",
    tabIndex: -1,
    hidden: false,
    dataset: {},
    _ownText: "",
    get textContent() {
      if (el._children.length === 0) return el._ownText;
      return el._children.map((c) => c.textContent || '').join('');
    },
    set textContent(v) { el._ownText = v; el._children = []; },
    className: "",
    style: {},
    getBoundingClientRect() {
      // Approximate: 140×(children * 28) or fallback
      const itemCount = Math.max(1, el._children.length);
      return { width: 140, height: itemCount * 28, top: 0, left: 0, right: 140, bottom: itemCount * 28 };
    },
    classList: {
      add(c) { el._classes.add(c); },
      remove(c) { el._classes.delete(c); },
      contains(c) { return el._classes.has(c); },
    },
    setAttribute(k, v) { el._attrs[k] = v; },
    getAttribute(k) { return el._attrs[k] ?? null; },
    appendChild(child) { el._children.push(child); child._parent = el; },
    remove() {
      if (el._parent) {
        el._parent._children = el._parent._children.filter((c) => c !== el);
      }
    },
    contains(other) {
      if (other === el) return true;
      return el._children.some((c) => c === other || c.contains?.(other));
    },
    addEventListener(type, fn) {
      (el._listeners[type] ??= []).push(fn);
    },
    removeEventListener(type, fn) {
      if (el._listeners[type]) {
        el._listeners[type] = el._listeners[type].filter((f) => f !== fn);
      }
    },
    click() {
      (el._listeners["click"] || []).forEach((fn) => fn({ target: el }));
    },
    get children() { return el._children; },
  };
  return el;
}

let _origDocument, _origWindow;

function setupDom() {
  const body = makeElement("body");

  const doc = {
    createElement: (tag) => makeElement(tag),
    body,
    _listeners: {},
    addEventListener(type, fn, capture) {
      (doc._listeners[type] ??= []).push(fn);
    },
    removeEventListener(type, fn, capture) {
      if (doc._listeners[type]) {
        doc._listeners[type] = doc._listeners[type].filter((f) => f !== fn);
      }
    },
    hidden: false,
  };

  _origDocument = globalThis.document;
  globalThis.document = doc;

  // Patch window minimally
  _origWindow = {};
  for (const k of ["innerWidth", "innerHeight", "addEventListener", "removeEventListener"]) {
    _origWindow[k] = globalThis[k];
  }
  globalThis.innerWidth = 800;
  globalThis.innerHeight = 600;

  const winListeners = {};
  globalThis.addEventListener = (type, fn) => {
    (winListeners[type] ??= []).push(fn);
  };
  globalThis.removeEventListener = (type, fn) => {
    if (winListeners[type]) {
      winListeners[type] = winListeners[type].filter((f) => f !== fn);
    }
  };
  globalThis._winListeners = winListeners;

  // context-menu.js references `window` directly (browser global)
  if (typeof globalThis.window === "undefined") {
    globalThis.window = globalThis;
    _origWindow._hadWindow = false;
  } else {
    _origWindow._hadWindow = true;
  }
}

function teardownDom() {
  globalThis.document = _origDocument;
  if (!_origWindow._hadWindow) {
    delete globalThis.window;
  }
  for (const [k, v] of Object.entries(_origWindow)) {
    if (k.startsWith("_")) continue;
    globalThis[k] = v;
  }
  delete globalThis._winListeners;
}

describe("context-menu", () => {
  let ctxMenu;

  beforeEach(async () => {
    setupDom();
    // Fresh import each time (module state resets aren't guaranteed,
    // but the dismiss() call at the start of show() handles it).
    ctxMenu = await import("../src/context-menu.js");
  });

  afterEach(async () => {
    // Dismiss any open menu to cancel deferred setTimeout listeners
    ctxMenu.dismiss();
    // Flush the deferred setTimeout(…, 0) from show() so it doesn't fire after teardown
    await new Promise((r) => setTimeout(r, 5));
    teardownDom();
  });

  it("show() appends a menu element to body", () => {
    const items = [{ label: "Test", action: () => {} }];
    const menu = ctxMenu.show(items, { x: 100, y: 100 });
    expect(menu).toBeDefined();
    expect(menu.id).toBe("molt-ctx");
    expect(document.body._children).toContain(menu);
  });

  it("show() creates menu items with correct labels", () => {
    const items = [
      { label: "Alpha", action: () => {} },
      { separator: true },
      { label: "Beta", action: () => {} },
    ];
    const menu = ctxMenu.show(items, { x: 0, y: 0 });
    // 3 children: Alpha, separator, Beta
    expect(menu._children.length).toBe(3);
    expect(menu._children[1]._attrs.role).toBe("separator");
  });

  it("show() positions menu within viewport bounds", () => {
    globalThis.innerWidth = 200;
    globalThis.innerHeight = 200;
    const menu = ctxMenu.show([{ label: "X" }], { x: 9999, y: 9999 });
    const left = parseInt(menu.style.left);
    const top = parseInt(menu.style.top);
    expect(left).toBeLessThanOrEqual(200);
    expect(top).toBeLessThanOrEqual(200);
  });

  it("dismiss() removes the active menu", () => {
    ctxMenu.show([{ label: "X" }], { x: 0, y: 0 });
    expect(document.body._children.length).toBe(1);
    ctxMenu.dismiss();
    // After dismiss, the menu element calls remove() on itself
    expect(document.body._children.length).toBe(0);
  });

  it("show() dismisses previous menu before creating a new one", () => {
    ctxMenu.show([{ label: "First" }], { x: 0, y: 0 });
    ctxMenu.show([{ label: "Second" }], { x: 0, y: 0 });
    // Only the second menu should remain
    expect(document.body._children.length).toBe(1);
    expect(document.body._children[0]._children[0]._children[0].textContent).toBe("Second");
  });

  it("clicking a menu item calls its action and removes the menu", () => {
    let called = false;
    const menu = ctxMenu.show(
      [{ label: "Do it", action: () => { called = true; } }],
      { x: 0, y: 0 }
    );
    // Click the menu item (first child)
    menu._children[0].click();
    expect(called).toBe(true);
    expect(document.body._children.length).toBe(0);
  });

  it("renders hint text when provided", () => {
    const menu = ctxMenu.show(
      [{ label: "Ghost", hint: "⌘⇧M", action: () => {} }],
      { x: 0, y: 0 }
    );
    const row = menu._children[0];
    // row has label span + hint span
    expect(row._children.length).toBe(2);
    expect(row._children[1].textContent).toBe("⌘⇧M");
    expect(row._children[1].className).toBe("ctx-hint");
  });

  it("Home key focuses first interactive item", async () => {
    const menu = ctxMenu.show(
      [
        { label: "Alpha", action: () => {} },
        { separator: true },
        { label: "Beta", action: () => {} },
        { label: "Gamma", action: () => {} },
      ],
      { x: 0, y: 0 }
    );
    // Wait for deferred listener registration
    await new Promise((r) => setTimeout(r, 5));

    // Arrow down twice to move focus to Gamma
    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) => keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));
    dispatch("ArrowDown"); // Beta (skips separator, wraps from Alpha→Beta)
    dispatch("ArrowDown"); // Gamma

    // Now press Home — should jump to first interactive item (Alpha)
    dispatch("Home");
    expect(menu._children[0]._classes.has("ctx-focus")).toBe(true);
  });

  it("End key focuses last interactive item", async () => {
    const menu = ctxMenu.show(
      [
        { label: "Alpha", action: () => {} },
        { separator: true },
        { label: "Beta", action: () => {} },
        { label: "Gamma", action: () => {} },
      ],
      { x: 0, y: 0 }
    );
    await new Promise((r) => setTimeout(r, 5));

    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) => keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));

    // Press End — should jump to last interactive item (Gamma)
    dispatch("End");
    expect(menu._children[3]._classes.has("ctx-focus")).toBe(true);
    // Alpha should not be focused
    expect(menu._children[0]._classes.has("ctx-focus")).toBe(false);
  });

  it("Escape key dismisses the menu", async () => {
    ctxMenu.show([{ label: "X", action: () => {} }], { x: 0, y: 0 });
    await new Promise((r) => setTimeout(r, 5));
    expect(document.body._children.length).toBe(1);

    const keyHandlers = document._listeners["keydown"] || [];
    keyHandlers.forEach((fn) => fn({ key: "Escape", preventDefault() {} }));
    expect(document.body._children.length).toBe(0);
  });

  it("Enter key activates focused item", async () => {
    let activated = false;
    const menu = ctxMenu.show(
      [{ label: "Go", action: () => { activated = true; } }],
      { x: 0, y: 0 }
    );
    await new Promise((r) => setTimeout(r, 5));

    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) => keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));
    // First item is auto-focused on show
    dispatch("Enter");
    expect(activated).toBe(true);
    expect(document.body._children.length).toBe(0);
  });

  it("ArrowUp wraps to last item from first", async () => {
    const menu = ctxMenu.show(
      [
        { label: "First", action: () => {} },
        { label: "Second", action: () => {} },
        { label: "Third", action: () => {} },
      ],
      { x: 0, y: 0 }
    );
    await new Promise((r) => setTimeout(r, 5));

    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) => keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));
    // Auto-focused on First; ArrowUp should wrap to Third
    dispatch("ArrowUp");
    expect(menu._children[2]._classes.has("ctx-focus")).toBe(true);
    expect(menu._children[0]._classes.has("ctx-focus")).toBe(false);
  });

  it("clamps menu position using getBoundingClientRect dimensions", () => {
    globalThis.innerWidth = 160;
    globalThis.innerHeight = 100;
    const menu = ctxMenu.show(
      [
        { label: "Alpha", action: () => {} },
        { label: "Beta", action: () => {} },
        { label: "Gamma", action: () => {} },
      ],
      { x: 500, y: 500 }
    );
    const left = parseInt(menu.style.left);
    const top = parseInt(menu.style.top);
    // Menu should be clamped so it doesn't overflow the viewport
    // innerWidth(160) - menuWidth(140) = 20 max left
    expect(left).toBeLessThanOrEqual(20);
    expect(left).toBeGreaterThanOrEqual(0);
    // innerHeight(100) - menuHeight(3*28=84) = 16 max top
    expect(top).toBeLessThanOrEqual(16);
    expect(top).toBeGreaterThanOrEqual(0);
  });

  it("Tab key dismisses the menu", async () => {
    ctxMenu.show([{ label: "X", action: () => {} }], { x: 0, y: 0 });
    await new Promise((r) => setTimeout(r, 5));
    expect(document.body._children.length).toBe(1);

    const keyHandlers = document._listeners["keydown"] || [];
    keyHandlers.forEach((fn) => fn({ key: "Tab", preventDefault() {} }));
    expect(document.body._children.length).toBe(0);
  });

  it("type-ahead jumps to matching menu item by first letter", async () => {
    const menu = ctxMenu.show(
      [
        { label: "Alpha", action: () => {} },
        { label: "Beta", action: () => {} },
        { label: "Gamma", action: () => {} },
      ],
      { x: 0, y: 0 }
    );
    await new Promise((r) => setTimeout(r, 5));

    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) => keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));
    // Auto-focused on Alpha; press "g" to jump to Gamma
    dispatch("g");
    expect(menu._children[2]._classes.has("ctx-focus")).toBe(true);
  });

  it("type-ahead skips checkmark prefix", async () => {
    const menu = ctxMenu.show(
      [
        { label: "Alpha", action: () => {} },
        { label: "✓ Ghost Mode", action: () => {} },
        { label: "Beta", action: () => {} },
      ],
      { x: 0, y: 0 }
    );
    await new Promise((r) => setTimeout(r, 5));

    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) => keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));
    // Press "g" to jump to "✓ Ghost Mode"
    dispatch("g");
    expect(menu._children[1]._classes.has("ctx-focus")).toBe(true);
  });

  it("type-ahead wraps around when searching", async () => {
    const menu = ctxMenu.show(
      [
        { label: "Alpha", action: () => {} },
        { label: "Another", action: () => {} },
        { label: "Beta", action: () => {} },
      ],
      { x: 0, y: 0 }
    );
    await new Promise((r) => setTimeout(r, 5));

    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) => keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));
    // Auto-focused on Alpha (index 0); press "a" to jump to Another (index 1)
    dispatch("a");
    expect(menu._children[1]._classes.has("ctx-focus")).toBe(true);
    // Press "a" again to wrap to Alpha (index 0)
    dispatch("a");
    expect(menu._children[0]._classes.has("ctx-focus")).toBe(true);
  });

  it("sets aria-keyshortcuts on items with hint text", () => {
    const menu = ctxMenu.show(
      [
        { label: "With Hint", hint: "⌘⇧M", action: () => {} },
        { label: "No Hint", action: () => {} },
      ],
      { x: 0, y: 0 }
    );
    expect(menu._children[0]._attrs["aria-keyshortcuts"]).toBe("⌘⇧M");
    expect(menu._children[1]._attrs["aria-keyshortcuts"]).toBeUndefined();
  });
});
