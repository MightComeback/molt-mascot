import { describe, it, expect } from "bun:test";
import {
  isActivateKey,
  isContextMenuKey,
  isEscapeKey,
  isNavDownKey,
  isNavUpKey,
  isHomeKey,
  isEndKey,
  isTabKey,
  isPrintableKey,
} from "../src/keyboard-utils.js";

describe("isActivateKey", () => {
  it("returns true for Enter", () => {
    expect(isActivateKey("Enter")).toBe(true);
  });

  it("returns true for Space", () => {
    expect(isActivateKey(" ")).toBe(true);
  });

  it("returns false for other keys", () => {
    expect(isActivateKey("Tab")).toBe(false);
    expect(isActivateKey("Escape")).toBe(false);
    expect(isActivateKey("a")).toBe(false);
    expect(isActivateKey("ArrowDown")).toBe(false);
    expect(isActivateKey("F10")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isActivateKey("")).toBe(false);
  });
});

describe("isContextMenuKey", () => {
  it("returns true for Shift+F10", () => {
    expect(isContextMenuKey("F10", true)).toBe(true);
  });

  it("returns true for ContextMenu key", () => {
    expect(isContextMenuKey("ContextMenu", false)).toBe(true);
    expect(isContextMenuKey("ContextMenu", true)).toBe(true);
  });

  it("returns false for F10 without Shift", () => {
    expect(isContextMenuKey("F10", false)).toBe(false);
  });

  it("returns false for other keys", () => {
    expect(isContextMenuKey("Enter", false)).toBe(false);
    expect(isContextMenuKey("Escape", true)).toBe(false);
    expect(isContextMenuKey(" ", true)).toBe(false);
  });
});

describe("isEscapeKey", () => {
  it("returns true for Escape", () => {
    expect(isEscapeKey("Escape")).toBe(true);
  });

  it("returns false for other keys", () => {
    expect(isEscapeKey("Enter")).toBe(false);
    expect(isEscapeKey(" ")).toBe(false);
    expect(isEscapeKey("Tab")).toBe(false);
    expect(isEscapeKey("Esc")).toBe(false);
    expect(isEscapeKey("F10")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isEscapeKey("")).toBe(false);
  });
});

describe("isNavDownKey", () => {
  it("returns true for ArrowDown", () => {
    expect(isNavDownKey("ArrowDown")).toBe(true);
  });

  it("returns false for other keys", () => {
    expect(isNavDownKey("ArrowUp")).toBe(false);
    expect(isNavDownKey("ArrowLeft")).toBe(false);
    expect(isNavDownKey("Enter")).toBe(false);
    expect(isNavDownKey("")).toBe(false);
  });
});

describe("isNavUpKey", () => {
  it("returns true for ArrowUp", () => {
    expect(isNavUpKey("ArrowUp")).toBe(true);
  });

  it("returns false for other keys", () => {
    expect(isNavUpKey("ArrowDown")).toBe(false);
    expect(isNavUpKey("ArrowRight")).toBe(false);
    expect(isNavUpKey("Enter")).toBe(false);
    expect(isNavUpKey("")).toBe(false);
  });
});

describe("isHomeKey", () => {
  it("returns true for Home", () => {
    expect(isHomeKey("Home")).toBe(true);
  });

  it("returns false for other keys", () => {
    expect(isHomeKey("End")).toBe(false);
    expect(isHomeKey("PageUp")).toBe(false);
    expect(isHomeKey("")).toBe(false);
  });
});

describe("isEndKey", () => {
  it("returns true for End", () => {
    expect(isEndKey("End")).toBe(true);
  });

  it("returns false for other keys", () => {
    expect(isEndKey("Home")).toBe(false);
    expect(isEndKey("PageDown")).toBe(false);
    expect(isEndKey("")).toBe(false);
  });
});

describe("isTabKey", () => {
  it("returns true for Tab", () => {
    expect(isTabKey("Tab")).toBe(true);
  });

  it("returns false for other keys", () => {
    expect(isTabKey("Enter")).toBe(false);
    expect(isTabKey(" ")).toBe(false);
    expect(isTabKey("Escape")).toBe(false);
    expect(isTabKey("")).toBe(false);
  });
});

describe("isPrintableKey", () => {
  it("returns true for single characters without modifiers", () => {
    expect(isPrintableKey("a", {})).toBe(true);
    expect(isPrintableKey("Z", {})).toBe(true);
    expect(isPrintableKey("5", {})).toBe(true);
    expect(isPrintableKey(".", {})).toBe(true);
  });

  it("returns true when modifiers object is omitted", () => {
    expect(isPrintableKey("a")).toBe(true);
    expect(isPrintableKey("f")).toBe(true);
  });

  it("returns false when Ctrl is held", () => {
    expect(isPrintableKey("a", { ctrlKey: true })).toBe(false);
  });

  it("returns false when Meta is held", () => {
    expect(isPrintableKey("c", { metaKey: true })).toBe(false);
  });

  it("returns false when Alt is held", () => {
    expect(isPrintableKey("x", { altKey: true })).toBe(false);
  });

  it("returns false for multi-character keys", () => {
    expect(isPrintableKey("Enter", {})).toBe(false);
    expect(isPrintableKey("ArrowDown", {})).toBe(false);
    expect(isPrintableKey("Escape", {})).toBe(false);
    expect(isPrintableKey("Tab", {})).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isPrintableKey("", {})).toBe(false);
  });

  it("returns false for non-string values", () => {
    expect(isPrintableKey(null, {})).toBe(false);
    expect(isPrintableKey(undefined, {})).toBe(false);
    expect(isPrintableKey(42, {})).toBe(false);
  });
});
