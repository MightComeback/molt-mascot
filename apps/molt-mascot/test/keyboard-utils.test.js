import { describe, it, expect } from "bun:test";
import { isActivateKey, isContextMenuKey } from "../src/keyboard-utils.js";

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
