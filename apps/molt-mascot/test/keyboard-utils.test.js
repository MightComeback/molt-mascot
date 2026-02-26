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
