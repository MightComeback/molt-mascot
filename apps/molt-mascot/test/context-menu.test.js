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
      return el._children.map((c) => c.textContent || "").join("");
    },
    set textContent(v) {
      el._ownText = v;
      el._children = [];
    },
    className: "",
    style: {},
    getBoundingClientRect() {
      // Approximate: 140×(children * 28) or fallback
      const itemCount = Math.max(1, el._children.length);
      return {
        width: 140,
        height: itemCount * 28,
        top: 0,
        left: 0,
        right: 140,
        bottom: itemCount * 28,
      };
    },
    classList: {
      add(c) {
        el._classes.add(c);
      },
      remove(c) {
        el._classes.delete(c);
      },
      contains(c) {
        return el._classes.has(c);
      },
    },
    setAttribute(k, v) {
      el._attrs[k] = v;
    },
    getAttribute(k) {
      return el._attrs[k] ?? null;
    },
    appendChild(child) {
      el._children.push(child);
      child._parent = el;
    },
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
    focus(_opts) {
      el._focused = true;
    },
    scrollIntoView(_opts) {
      el._scrolledIntoView = true;
    },
    click() {
      (el._listeners["click"] || []).forEach((fn) => fn({ target: el }));
    },
    get children() {
      return el._children;
    },
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
    addEventListener(type, fn, _capture) {
      (doc._listeners[type] ??= []).push(fn);
    },
    removeEventListener(type, fn, _capture) {
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
  for (const k of [
    "innerWidth",
    "innerHeight",
    "addEventListener",
    "removeEventListener",
  ]) {
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
    expect(
      document.body._children[0]._children[0]._children[0].textContent,
    ).toBe("Second");
  });

  it("clicking a menu item calls its action and removes the menu", () => {
    let called = false;
    const menu = ctxMenu.show(
      [
        {
          label: "Do it",
          action: () => {
            called = true;
          },
        },
      ],
      { x: 0, y: 0 },
    );
    // Click the menu item (first child)
    menu._children[0].click();
    expect(called).toBe(true);
    expect(document.body._children.length).toBe(0);
  });

  it("renders hint text when provided", () => {
    const menu = ctxMenu.show(
      [{ label: "Ghost", hint: "⌘⇧M", action: () => {} }],
      { x: 0, y: 0 },
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
      { x: 0, y: 0 },
    );
    // Wait for deferred listener registration
    await new Promise((r) => setTimeout(r, 5));

    // Arrow down twice to move focus to Gamma
    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) =>
      keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));
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
      { x: 0, y: 0 },
    );
    await new Promise((r) => setTimeout(r, 5));

    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) =>
      keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));

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
    ctxMenu.show(
      [
        {
          label: "Go",
          action: () => {
            activated = true;
          },
        },
      ],
      { x: 0, y: 0 },
    );
    await new Promise((r) => setTimeout(r, 5));

    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) =>
      keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));
    // First item is auto-focused on show
    dispatch("Enter");
    expect(activated).toBe(true);
    expect(document.body._children.length).toBe(0);
  });

  it("Space key activates focused item (WAI-ARIA menu pattern)", async () => {
    let activated = false;
    ctxMenu.show(
      [
        {
          label: "Go",
          action: () => {
            activated = true;
          },
        },
      ],
      { x: 0, y: 0 },
    );
    await new Promise((r) => setTimeout(r, 5));

    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) =>
      keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));
    dispatch(" ");
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
      { x: 0, y: 0 },
    );
    await new Promise((r) => setTimeout(r, 5));

    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) =>
      keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));
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
      { x: 500, y: 500 },
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

  it("sets transform-origin to top-left when menu is not clamped", () => {
    globalThis.innerWidth = 800;
    globalThis.innerHeight = 600;
    const menu = ctxMenu.show([{ label: "A", action: () => {} }], {
      x: 50,
      y: 50,
    });
    // Menu fits without clamping: origin should be top left
    expect(menu.style.transformOrigin).toBe("top left");
  });

  it("sets transform-origin to bottom-right when menu is clamped to bottom-right", () => {
    globalThis.innerWidth = 160;
    globalThis.innerHeight = 100;
    const menu = ctxMenu.show(
      [
        { label: "Alpha", action: () => {} },
        { label: "Beta", action: () => {} },
        { label: "Gamma", action: () => {} },
      ],
      { x: 500, y: 500 },
    );
    // Clamped on both axes: origin should flip to bottom right
    expect(menu.style.transformOrigin).toBe("bottom right");
  });

  it("sets transform-origin to top-right when only X is clamped", () => {
    globalThis.innerWidth = 160;
    globalThis.innerHeight = 600;
    const menu = ctxMenu.show([{ label: "A", action: () => {} }], {
      x: 500,
      y: 50,
    });
    expect(menu.style.transformOrigin).toBe("top right");
  });

  it("sets transform-origin to bottom-left when only Y is clamped", () => {
    globalThis.innerWidth = 800;
    globalThis.innerHeight = 100;
    const menu = ctxMenu.show(
      [
        { label: "Alpha", action: () => {} },
        { label: "Beta", action: () => {} },
        { label: "Gamma", action: () => {} },
      ],
      { x: 50, y: 500 },
    );
    expect(menu.style.transformOrigin).toBe("bottom left");
  });

  it("Tab key dismisses the menu", async () => {
    ctxMenu.show([{ label: "X", action: () => {} }], { x: 0, y: 0 });
    await new Promise((r) => setTimeout(r, 5));
    expect(document.body._children.length).toBe(1);

    const keyHandlers = document._listeners["keydown"] || [];
    keyHandlers.forEach((fn) => fn({ key: "Tab", preventDefault() {} }));
    expect(document.body._children.length).toBe(0);
  });

  it("scroll wheel outside menu dismisses it", async () => {
    ctxMenu.show([{ label: "X", action: () => {} }], { x: 0, y: 0 });
    await new Promise((r) => setTimeout(r, 5));
    expect(document.body._children.length).toBe(1);

    const wheelHandlers = document._listeners["wheel"] || [];
    // Simulate wheel event outside the menu (target is not a child of the menu)
    const outsideTarget = makeElement("div");
    wheelHandlers.forEach((fn) => fn({ target: outsideTarget }));
    expect(document.body._children.length).toBe(0);
  });

  it("scroll wheel inside menu does not dismiss it", async () => {
    const menu = ctxMenu.show([{ label: "X", action: () => {} }], {
      x: 0,
      y: 0,
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(document.body._children.length).toBe(1);

    const wheelHandlers = document._listeners["wheel"] || [];
    // Simulate wheel event on a child of the menu
    wheelHandlers.forEach((fn) => fn({ target: menu._children[0] }));
    expect(document.body._children.length).toBe(1);
    ctxMenu.dismiss();
  });

  it("type-ahead jumps to matching menu item by first letter", async () => {
    const menu = ctxMenu.show(
      [
        { label: "Alpha", action: () => {} },
        { label: "Beta", action: () => {} },
        { label: "Gamma", action: () => {} },
      ],
      { x: 0, y: 0 },
    );
    await new Promise((r) => setTimeout(r, 5));

    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) =>
      keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));
    // Auto-focused on Alpha; press "g" to jump to Gamma
    dispatch("g");
    expect(menu._children[2]._classes.has("ctx-focus")).toBe(true);
  });

  it("type-ahead skips checkmark prefix", async () => {
    const menu = ctxMenu.show(
      [
        { label: "Alpha", action: () => {} },
        { label: "Ghost Mode", checked: true, action: () => {} },
        { label: "Beta", action: () => {} },
      ],
      { x: 0, y: 0 },
    );
    await new Promise((r) => setTimeout(r, 5));

    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) =>
      keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));
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
      { x: 0, y: 0 },
    );
    await new Promise((r) => setTimeout(r, 5));

    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) =>
      keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));
    // Auto-focused on Alpha (index 0); press "a" to jump to Another (index 1)
    dispatch("a");
    expect(menu._children[1]._classes.has("ctx-focus")).toBe(true);
    // Press "a" again to wrap to Alpha (index 0)
    dispatch("a");
    expect(menu._children[0]._classes.has("ctx-focus")).toBe(true);
  });

  it("multi-character type-ahead matches longer prefixes", async () => {
    const menu = ctxMenu.show(
      [
        { label: "Alpha", action: () => {} },
        { label: "Force Reconnect", action: () => {} },
        { label: "Format Output", action: () => {} },
      ],
      { x: 0, y: 0 },
    );
    await new Promise((r) => setTimeout(r, 5));

    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) =>
      keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));
    // Auto-focused on Alpha (0). Type "fo" quickly — multi-char search from
    // current position finds "Force Reconnect" (1) first.
    dispatch("f");
    dispatch("o");
    expect(menu._children[1]._classes.has("ctx-focus")).toBe(true);

    // Continue typing "rc" to narrow to "force" — still matches "Force Reconnect"
    dispatch("r");
    dispatch("c");
    expect(menu._children[1]._classes.has("ctx-focus")).toBe(true);
  });

  it("multi-character type-ahead distinguishes between similar prefixes", async () => {
    const menu = ctxMenu.show(
      [
        { label: "Alpha", action: () => {} },
        { label: "Reset State", action: () => {} },
        { label: "Reconnect Now", action: () => {} },
      ],
      { x: 0, y: 0 },
    );
    await new Promise((r) => setTimeout(r, 5));

    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) =>
      keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));
    // Type "rec" — skips "Reset State", matches "Reconnect Now"
    dispatch("r");
    dispatch("e");
    dispatch("c");
    expect(menu._children[2]._classes.has("ctx-focus")).toBe(true);
  });

  it("multi-character type-ahead resets after timeout", async () => {
    const menu = ctxMenu.show(
      [
        { label: "Alpha", action: () => {} },
        { label: "Beta", action: () => {} },
        { label: "Gamma", action: () => {} },
      ],
      { x: 0, y: 0 },
    );
    await new Promise((r) => setTimeout(r, 5));

    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) =>
      keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));
    // Type "b" to jump to Beta
    dispatch("b");
    expect(menu._children[1]._classes.has("ctx-focus")).toBe(true);

    // Wait for type-ahead timeout to reset (TYPE_AHEAD_TIMEOUT_MS + buffer)
    await new Promise((r) =>
      setTimeout(r, ctxMenu.TYPE_AHEAD_TIMEOUT_MS + 100),
    );

    // Type "g" to jump to Gamma (new search, not "bg")
    dispatch("g");
    expect(menu._children[2]._classes.has("ctx-focus")).toBe(true);
  });

  it("mouseenter on item moves focus indicator to that item", async () => {
    const menu = ctxMenu.show(
      [
        { label: "First", action: () => {} },
        { label: "Second", action: () => {} },
        { label: "Third", action: () => {} },
      ],
      { x: 0, y: 0 },
    );
    await new Promise((r) => setTimeout(r, 5));

    // Auto-focused on First (index 0)
    expect(menu._children[0]._classes.has("ctx-focus")).toBe(true);

    // Simulate mouseenter on Third (index 2)
    const enterHandlers = menu._children[2]._listeners["mouseenter"] || [];
    enterHandlers.forEach((fn) => fn());
    expect(menu._children[2]._classes.has("ctx-focus")).toBe(true);
    expect(menu._children[0]._classes.has("ctx-focus")).toBe(false);
  });

  it("disabled items are skipped by keyboard navigation", async () => {
    let _called = false;
    const menu = ctxMenu.show(
      [
        { label: "Alpha", action: () => {} },
        {
          label: "Disabled",
          disabled: true,
          action: () => {
            _called = true;
          },
        },
        { label: "Gamma", action: () => {} },
      ],
      { x: 0, y: 0 },
    );
    await new Promise((r) => setTimeout(r, 5));

    const keyHandlers = document._listeners["keydown"] || [];
    const dispatch = (key) =>
      keyHandlers.forEach((fn) => fn({ key, preventDefault() {} }));
    // ArrowDown from Alpha should skip Disabled and land on Gamma
    dispatch("ArrowDown");
    expect(menu._children[2]._classes.has("ctx-focus")).toBe(true);
    expect(menu._children[1]._classes.has("ctx-focus")).toBe(false);
  });

  it("clicking a disabled item does not call action or dismiss menu", () => {
    let called = false;
    const menu = ctxMenu.show(
      [
        {
          label: "No",
          disabled: true,
          action: () => {
            called = true;
          },
        },
      ],
      { x: 0, y: 0 },
    );
    menu._children[0].click();
    expect(called).toBe(false);
    expect(document.body._children.length).toBe(1);
  });

  it("mouseleave on menu clears focus indicator", async () => {
    const menu = ctxMenu.show(
      [
        { label: "First", action: () => {} },
        { label: "Second", action: () => {} },
      ],
      { x: 0, y: 0 },
    );
    await new Promise((r) => setTimeout(r, 5));

    // Auto-focused on First
    expect(menu._children[0]._classes.has("ctx-focus")).toBe(true);

    // Simulate mouseleave on the menu element
    const leaveHandlers = menu._listeners["mouseleave"] || [];
    leaveHandlers.forEach((fn) => fn());
    expect(menu._children[0]._classes.has("ctx-focus")).toBe(false);
    expect(menu._children[1]._classes.has("ctx-focus")).toBe(false);
  });

  it("disabled items have aria-disabled attribute", () => {
    const menu = ctxMenu.show(
      [
        { label: "Enabled", action: () => {} },
        { label: "Disabled", disabled: true, action: () => {} },
      ],
      { x: 0, y: 0 },
    );
    expect(menu._children[0]._attrs["aria-disabled"]).toBeUndefined();
    expect(menu._children[1]._attrs["aria-disabled"]).toBe("true");
  });

  it("toggle items use menuitemcheckbox role with aria-checked", () => {
    const menu = ctxMenu.show(
      [
        { label: "Ghost Mode", checked: true, action: () => {} },
        { label: "Hide Text", checked: false, action: () => {} },
        { label: "Normal Item", action: () => {} },
      ],
      { x: 0, y: 0 },
    );
    // checked=true → menuitemcheckbox with aria-checked="true" and ✓ prefix
    expect(menu._children[0]._attrs["role"]).toBe("menuitemcheckbox");
    expect(menu._children[0]._attrs["aria-checked"]).toBe("true");
    expect(menu._children[0]._children[0].textContent).toBe("✓ Ghost Mode");
    // checked=false → menuitemcheckbox with aria-checked="false" and no ✓ prefix
    expect(menu._children[1]._attrs["role"]).toBe("menuitemcheckbox");
    expect(menu._children[1]._attrs["aria-checked"]).toBe("false");
    expect(menu._children[1]._children[0].textContent).toBe("Hide Text");
    // no checked property → plain menuitem
    expect(menu._children[2]._attrs["role"]).toBe("menuitem");
    expect(menu._children[2]._attrs["aria-checked"]).toBeUndefined();
  });

  it("sets aria-keyshortcuts on items with hint text", () => {
    const menu = ctxMenu.show(
      [
        { label: "With Hint", hint: "⌘⇧M", action: () => {} },
        { label: "No Hint", action: () => {} },
      ],
      { x: 0, y: 0 },
    );
    expect(menu._children[0]._attrs["aria-keyshortcuts"]).toBe("⌘⇧M");
    expect(menu._children[1]._attrs["aria-keyshortcuts"]).toBeUndefined();
  });

  it("isVisible() returns false when no menu is open", () => {
    expect(ctxMenu.isVisible()).toBe(false);
  });

  it("dismiss() before deferred timeout prevents orphaned listeners", async () => {
    ctxMenu.show([{ label: "X", action: () => {} }], { x: 0, y: 0 });
    // Dismiss immediately — before the deferred setTimeout(…, 0) fires
    ctxMenu.dismiss();
    expect(document.body._children.length).toBe(0);
    // Let the deferred timeout fire
    await new Promise((r) => setTimeout(r, 5));
    // No document keydown listeners should have been registered
    // (if they were, pressing Escape would throw since the menu element is gone)
    expect((document._listeners["keydown"] || []).length).toBe(0);
  });

  it("isVisible() returns true after show() and false after dismiss()", () => {
    ctxMenu.show([{ label: "Test", action: () => {} }], { x: 0, y: 0 });
    expect(ctxMenu.isVisible()).toBe(true);
    ctxMenu.dismiss();
    expect(ctxMenu.isVisible()).toBe(false);
  });

  it("keyboard navigation scrolls focused item into view", async () => {
    const menu = ctxMenu.show(
      [
        { label: "Alpha", action: () => {} },
        { label: "Beta", action: () => {} },
      ],
      { x: 10, y: 10 },
    );
    await new Promise((r) => setTimeout(r, 5));

    // Auto-focus on first item should trigger scrollIntoView
    expect(menu._children[0]._scrolledIntoView).toBe(true);

    // Arrow down should also scroll the newly focused item
    const keydown = (document._listeners["keydown"] || [])[0];
    keydown({ key: "ArrowDown", preventDefault() {} });
    expect(menu._children[1]._scrolledIntoView).toBe(true);

    ctxMenu.dismiss();
  });

  it("restores focus to previously focused element on dismiss", async () => {
    // Simulate a focused element before opening the menu
    const button = makeElement("button");
    button._focused = false;
    button.focus = (opts) => {
      button._focused = true;
      button._focusOpts = opts;
    };
    document.body.appendChild(button);
    // Set activeElement to the button
    document.activeElement = button;

    ctxMenu.show([{ label: "X", action: () => {} }], { x: 0, y: 0 });
    await new Promise((r) => setTimeout(r, 5));

    ctxMenu.dismiss();
    expect(button._focused).toBe(true);
    expect(button._focusOpts).toEqual({ preventScroll: true });

    // Cleanup
    delete document.activeElement;
  });

  it("restores focus after Escape key dismisses menu", async () => {
    const trigger = makeElement("canvas");
    trigger._focused = false;
    trigger.focus = () => {
      trigger._focused = true;
    };
    document.body.appendChild(trigger);
    document.activeElement = trigger;

    ctxMenu.show([{ label: "Go", action: () => {} }], { x: 0, y: 0 });
    await new Promise((r) => setTimeout(r, 5));

    const keyHandlers = document._listeners["keydown"] || [];
    keyHandlers.forEach((fn) => fn({ key: "Escape", preventDefault() {} }));
    expect(trigger._focused).toBe(true);

    delete document.activeElement;
  });

  it("restores focus after clicking a menu item", () => {
    const trigger = makeElement("span");
    trigger._focused = false;
    trigger.focus = () => {
      trigger._focused = true;
    };
    document.body.appendChild(trigger);
    document.activeElement = trigger;

    const menu = ctxMenu.show([{ label: "Do it", action: () => {} }], {
      x: 0,
      y: 0,
    });
    menu._children[0].click();
    expect(trigger._focused).toBe(true);

    delete document.activeElement;
  });

  it("keyboard navigation moves DOM focus to the active item", async () => {
    const menu = ctxMenu.show(
      [
        { label: "Alpha", action: () => {} },
        { label: "Beta", action: () => {} },
      ],
      { x: 10, y: 10 },
    );
    await new Promise((r) => setTimeout(r, 5));

    // Auto-focus should have called .focus() on the first item
    const items = menu._children;
    expect(items[0]._focused).toBe(true);

    // Arrow down should move focus to the second item
    const keydown = (document._listeners["keydown"] || [])[0];
    keydown({ key: "ArrowDown", preventDefault() {} });
    expect(items[1]._focused).toBe(true);
    expect(items[1]._classes.has("ctx-focus")).toBe(true);

    ctxMenu.dismiss();
  });

  it("getSnapshot returns visible state", () => {
    expect(ctxMenu.getSnapshot()).toEqual({ visible: false });
    ctxMenu.show([{ label: "Test" }], { x: 10, y: 10 });
    expect(ctxMenu.getSnapshot()).toEqual({ visible: true });
    ctxMenu.dismiss();
    expect(ctxMenu.getSnapshot()).toEqual({ visible: false });
  });

  it("toJSON delegates to getSnapshot for JSON.stringify consistency", () => {
    expect(ctxMenu.toJSON()).toEqual(ctxMenu.getSnapshot());
    expect(ctxMenu.toJSON()).toEqual({ visible: false });
    ctxMenu.show([{ label: "A" }], { x: 0, y: 0 });
    expect(ctxMenu.toJSON()).toEqual({ visible: true });
    // JSON.stringify should produce the same output
    expect(JSON.stringify(ctxMenu)).toBe(JSON.stringify({ visible: true }));
    ctxMenu.dismiss();
  });

  it("TYPE_AHEAD_TIMEOUT_MS is exported and matches expected value", () => {
    expect(ctxMenu.TYPE_AHEAD_TIMEOUT_MS).toBe(500);
    expect(typeof ctxMenu.TYPE_AHEAD_TIMEOUT_MS).toBe("number");
  });

  it("toString returns human-readable summary for diagnostic logging", () => {
    expect(ctxMenu.toString()).toBe("ContextMenu<hidden>");
    ctxMenu.show([{ label: "A" }], { x: 0, y: 0 });
    expect(ctxMenu.toString()).toBe("ContextMenu<visible>");
    ctxMenu.dismiss();
    expect(ctxMenu.toString()).toBe("ContextMenu<hidden>");
  });
});
