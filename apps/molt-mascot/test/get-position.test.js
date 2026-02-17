import { describe, expect, it } from "bun:test";

const { getPosition } = require("../src/get-position.cjs");

const display = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
const W = 240;
const H = 200;

describe("getPosition", () => {
  it("defaults to bottom-right with 24px padding", () => {
    const pos = getPosition(display, W, H, null, null);
    expect(pos).toEqual({ x: 1920 - 240 - 24, y: 1080 - 200 - 24 });
  });

  it("bottom-left", () => {
    const pos = getPosition(display, W, H, "bottom-left", 24);
    expect(pos).toEqual({ x: 24, y: 1080 - 200 - 24 });
  });

  it("top-right", () => {
    const pos = getPosition(display, W, H, "top-right", 24);
    expect(pos).toEqual({ x: 1920 - 240 - 24, y: 24 });
  });

  it("top-left", () => {
    const pos = getPosition(display, W, H, "top-left", 24);
    expect(pos).toEqual({ x: 24, y: 24 });
  });

  it("center", () => {
    const pos = getPosition(display, W, H, "center", 0);
    expect(pos).toEqual({ x: (1920 - 240) / 2, y: (1080 - 200) / 2 });
  });

  it("center-left", () => {
    const pos = getPosition(display, W, H, "center-left", 10);
    expect(pos).toEqual({ x: 10, y: (1080 - 200) / 2 });
  });

  it("center-right", () => {
    const pos = getPosition(display, W, H, "center-right", 10);
    expect(pos).toEqual({ x: 1920 - 240 - 10, y: (1080 - 200) / 2 });
  });

  it("top-center", () => {
    const pos = getPosition(display, W, H, "top-center", 16);
    expect(pos).toEqual({ x: (1920 - 240) / 2, y: 16 });
  });

  it("bottom-center", () => {
    const pos = getPosition(display, W, H, "bottom-center", 16);
    expect(pos).toEqual({ x: (1920 - 240) / 2, y: 1080 - 200 - 16 });
  });

  it("respects display workArea offset", () => {
    const offset = { workArea: { x: 100, y: 50, width: 1600, height: 900 } };
    const pos = getPosition(offset, W, H, "top-left", 0);
    expect(pos).toEqual({ x: 100, y: 50 });
  });

  it("treats unknown alignment as bottom-right", () => {
    const pos = getPosition(display, W, H, "diagonal", 24);
    expect(pos).toEqual({ x: 1920 - 240 - 24, y: 1080 - 200 - 24 });
  });

  it("case-insensitive alignment", () => {
    const pos = getPosition(display, W, H, "Top-Right", 24);
    expect(pos).toEqual({ x: 1920 - 240 - 24, y: 24 });
  });

  it("uses default padding (24) when paddingOverride is null", () => {
    const pos = getPosition(display, W, H, "top-left", null);
    expect(pos).toEqual({ x: 24, y: 24 });
  });

  it("uses default padding when paddingOverride is negative", () => {
    const pos = getPosition(display, W, H, "top-left", -10);
    expect(pos).toEqual({ x: 24, y: 24 });
  });

  it("allows zero padding", () => {
    const pos = getPosition(display, W, H, "top-left", 0);
    expect(pos).toEqual({ x: 0, y: 0 });
  });

  it("clamps position when padding exceeds display size", () => {
    const small = { workArea: { x: 0, y: 0, width: 300, height: 250 } };
    // padding=500 would push top-left to (500, 500), way off-screen
    const pos = getPosition(small, W, H, "top-left", 500);
    // Should clamp to keep window inside work area
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeGreaterThanOrEqual(0);
    expect(pos.x + W).toBeLessThanOrEqual(300);
    expect(pos.y + H).toBeLessThanOrEqual(250);
  });

  it("clamps position when window is larger than display", () => {
    const tiny = { workArea: { x: 0, y: 0, width: 100, height: 80 } };
    const pos = getPosition(tiny, W, H, "bottom-right", 0);
    // Window (240x200) exceeds display (100x80); clamp to origin
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(0);
  });

  it("clamps with work area offset", () => {
    const offset = { workArea: { x: 200, y: 100, width: 300, height: 250 } };
    const pos = getPosition(offset, W, H, "bottom-right", 500);
    // Should stay within [200, 200+300-240] x [100, 100+250-200]
    expect(pos.x).toBeGreaterThanOrEqual(200);
    expect(pos.y).toBeGreaterThanOrEqual(100);
  });

  it("rounds fractional center positions to integers", () => {
    // Odd display width/height produces fractional center coords
    const odd = { workArea: { x: 0, y: 0, width: 1921, height: 1081 } };
    const pos = getPosition(odd, W, H, "center", 0);
    expect(pos.x).toBe(Math.round((1921 - 240) / 2));
    expect(pos.y).toBe(Math.round((1081 - 200) / 2));
    // Verify they're integers (no fractional pixels)
    expect(Number.isInteger(pos.x)).toBe(true);
    expect(Number.isInteger(pos.y)).toBe(true);
  });
});
