import { describe, expect, it } from "bun:test";
import { palette, lobsterIdle, overlay } from "../src/sprites.js";
import { MODE_EMOJI } from "../src/mode-emoji.cjs";

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
      throw new Error(
        `${name} row ${r}: expected ${EXPECTED_COLS} cols, got ${row.length}`,
      );
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
    for (const [_key, value] of Object.entries(palette)) {
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

    it("idle frames differ (animation would be static otherwise)", () => {
      // At least one row must differ between the two frames for visible animation.
      const hasDiff = lobsterIdle[0].some(
        (row, i) => row !== lobsterIdle[1][i],
      );
      expect(hasDiff).toBe(true);
    });

    it("both frames use the same set of palette characters", () => {
      const charsOf = (frame) => new Set(frame.flatMap((row) => [...row]));
      const chars0 = charsOf(lobsterIdle[0]);
      const chars1 = charsOf(lobsterIdle[1]);
      expect([...chars0].sort()).toEqual([...chars1].sort());
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

    it("sleep frames differ (animation would be static otherwise)", () => {
      const hasDiff = overlay.sleep[0].some(
        (row, i) => row !== overlay.sleep[1][i],
      );
      expect(hasDiff).toBe(true);
    });
  });

  describe("overlay.thinking", () => {
    it("has 2 frames", () => {
      expect(overlay.thinking.length).toBe(2);
    });

    it("frames are valid 32x32 sprites", () => {
      validateFrame(overlay.thinking[0], "thinking[0]");
      validateFrame(overlay.thinking[1], "thinking[1]");
    });

    it("thinking frames differ (animation would be static otherwise)", () => {
      const hasDiff = overlay.thinking[0].some(
        (row, i) => row !== overlay.thinking[1][i],
      );
      expect(hasDiff).toBe(true);
    });
  });

  describe("overlay.tool", () => {
    it("has 2 frames", () => {
      expect(overlay.tool.length).toBe(2);
    });
    it("each frame is a valid 32x32 sprite", () => {
      for (const frame of overlay.tool) validateFrame(frame, "tool");
    });
    it("frames differ (animation)", () => {
      const hasDiff = overlay.tool[0].some(
        (row, i) => row !== overlay.tool[1][i],
      );
      expect(hasDiff).toBe(true);
    });
  });

  describe("overlay.error", () => {
    it("has 2 frames", () => {
      expect(overlay.error.length).toBe(2);
    });

    it("frames are valid 32x32 sprites", () => {
      validateFrame(overlay.error[0], "error[0]");
      validateFrame(overlay.error[1], "error[1]");
    });

    it("frames differ (animation)", () => {
      const hasDiff = overlay.error[0].some(
        (row, i) => row !== overlay.error[1][i],
      );
      expect(hasDiff).toBe(true);
    });
  });

  describe("overlay.disconnected", () => {
    it("has 2 frames", () => {
      expect(overlay.disconnected.length).toBe(2);
    });

    it("frames are valid 32x32 sprites", () => {
      validateFrame(overlay.disconnected[0], "disconnected[0]");
      validateFrame(overlay.disconnected[1], "disconnected[1]");
    });

    it("disconnected frames differ (animation would be static otherwise)", () => {
      const hasDiff = overlay.disconnected[0].some(
        (row, i) => row !== overlay.disconnected[1][i],
      );
      expect(hasDiff).toBe(true);
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

    it("connecting frames differ (animation would be static otherwise)", () => {
      const hasDiff = overlay.connecting[0].some(
        (row, i) => row !== overlay.connecting[1][i],
      );
      expect(hasDiff).toBe(true);
    });
  });

  describe("structural integrity", () => {
    it("every overlay key is a recognized visual mode or alias", () => {
      // All overlay keys should map to a known mode (from MODE_EMOJI) or be
      // a recognized alias like "sleep" (which maps to extended idle).
      const knownKeys = new Set([...Object.keys(MODE_EMOJI), "sleep"]);
      for (const key of Object.keys(overlay)) {
        expect(knownKeys.has(key)).toBe(true);
      }
    });

    it("all active visual modes have overlays", () => {
      // Modes that display overlays in the renderer. "idle" uses "sleep" overlay
      // (triggered by duration threshold), so it doesn't need its own key.
      const modesNeedingOverlays = [
        "thinking",
        "tool",
        "error",
        "connecting",
        "connected",
        "disconnected",
      ];
      for (const mode of modesNeedingOverlays) {
        expect(overlay[mode]).toBeDefined();
        expect(overlay[mode].length).toBeGreaterThanOrEqual(1);
      }
    });

    it("all overlay entries have exactly 2 frames", () => {
      for (const [key, frames] of Object.entries(overlay)) {
        if (frames.length !== 2) {
          throw new Error(
            `overlay.${key} has ${frames.length} frames, expected 2`,
          );
        }
      }
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

    it("connected frames differ (animation would be static otherwise)", () => {
      const hasDiff = overlay.connected[0].some(
        (row, i) => row !== overlay.connected[1][i],
      );
      expect(hasDiff).toBe(true);
    });
  });
});
