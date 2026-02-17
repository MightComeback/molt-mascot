import { describe, expect, it } from "bun:test";
import { palette, lobsterIdle, overlay } from "../src/sprites.js";

const EXPECTED_ROWS = 32;
const EXPECTED_COLS = 32;

/**
 * Validate that a sprite frame has exactly 32 rows of 32 characters,
 * and every character is a known palette key.
 */
function validateFrame(frame, name) {
  expect(frame.length).toBe(EXPECTED_ROWS);
  for (let r = 0; r < frame.length; r++) {
    const row = frame[r];
    if (row.length !== EXPECTED_COLS) {
      throw new Error(`${name} row ${r}: expected ${EXPECTED_COLS} cols, got ${row.length}`);
    }
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (!(ch in palette)) {
        throw new Error(`${name} [${r},${c}]: unknown palette char '${ch}'`);
      }
    }
  }
}

describe("sprites", () => {
  it("palette has null for transparent", () => {
    expect(palette["."]).toBeNull();
  });

  it("palette values are valid CSS colors or null", () => {
    for (const [key, value] of Object.entries(palette)) {
      if (value === null) continue;
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });

  describe("lobsterIdle", () => {
    it("has exactly 2 frames", () => {
      expect(lobsterIdle.length).toBe(2);
    });

    it("frame 0 is a valid 32x32 sprite", () => {
      validateFrame(lobsterIdle[0], "lobsterIdle[0]");
    });

    it("frame 1 is a valid 32x32 sprite", () => {
      validateFrame(lobsterIdle[1], "lobsterIdle[1]");
    });
  });

  describe("overlay.sleep", () => {
    it("has 2 frames", () => {
      expect(overlay.sleep.length).toBe(2);
    });

    it("frames are valid 32x32 sprites", () => {
      validateFrame(overlay.sleep[0], "sleep[0]");
      validateFrame(overlay.sleep[1], "sleep[1]");
    });
  });

  describe("overlay.thinking", () => {
    it("is a valid 32x32 sprite", () => {
      validateFrame(overlay.thinking, "thinking");
    });
  });

  describe("overlay.tool", () => {
    it("is a valid 32x32 sprite", () => {
      validateFrame(overlay.tool, "tool");
    });
  });

  describe("overlay.error", () => {
    it("is a valid 32x32 sprite", () => {
      validateFrame(overlay.error, "error");
    });
  });

  describe("overlay.connecting", () => {
    it("has 2 frames", () => {
      expect(overlay.connecting.length).toBe(2);
    });

    it("frames are valid 32x32 sprites", () => {
      validateFrame(overlay.connecting[0], "connecting[0]");
      validateFrame(overlay.connecting[1], "connecting[1]");
    });
  });

  describe("overlay.connected", () => {
    it("has 2 frames", () => {
      expect(overlay.connected.length).toBe(2);
    });

    it("frames are valid 32x32 sprites", () => {
      validateFrame(overlay.connected[0], "connected[0]");
      validateFrame(overlay.connected[1], "connected[1]");
    });
  });
});
