import { describe, expect, it } from "bun:test";

const {
  getPosition,
  clampToWorkArea,
  VALID_ALIGNMENTS,
  isValidAlignment,
  MAX_PADDING,
  isValidPadding,
  nextAlignmentIndex,
  prevAlignmentIndex,
  findAlignmentIndex,
  ALIGNMENT_ARROWS,
  alignmentArrow,
  formatAlignment,
} = require("../src/get-position.cjs");
const { isValidOpacity } = require("../src/opacity-presets.cjs");

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

describe("clampToWorkArea", () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  const size = { width: 240, height: 200 };

  it("returns unchanged position when already inside", () => {
    const result = clampToWorkArea({ x: 100, y: 100 }, size, workArea);
    expect(result).toEqual({ x: 100, y: 100, changed: false });
  });

  it("clamps position that overflows right edge", () => {
    const result = clampToWorkArea({ x: 1800, y: 100 }, size, workArea);
    expect(result.x).toBe(1920 - 240);
    expect(result.y).toBe(100);
    expect(result.changed).toBe(true);
  });

  it("clamps position that overflows bottom edge", () => {
    const result = clampToWorkArea({ x: 100, y: 1000 }, size, workArea);
    expect(result.x).toBe(100);
    expect(result.y).toBe(1080 - 200);
    expect(result.changed).toBe(true);
  });

  it("clamps negative position to work area origin", () => {
    const result = clampToWorkArea({ x: -50, y: -30 }, size, workArea);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.changed).toBe(true);
  });

  it("respects work area offset", () => {
    const offset = { x: 200, y: 100, width: 1600, height: 900 };
    const result = clampToWorkArea({ x: 100, y: 50 }, size, offset);
    expect(result.x).toBe(200);
    expect(result.y).toBe(100);
    expect(result.changed).toBe(true);
  });

  it("rounds to integers", () => {
    const result = clampToWorkArea({ x: 100.7, y: 200.3 }, size, workArea);
    expect(Number.isInteger(result.x)).toBe(true);
    expect(Number.isInteger(result.y)).toBe(true);
  });

  it("reports changed=false for already-rounded positions at edges", () => {
    const result = clampToWorkArea({ x: 1680, y: 880 }, size, workArea);
    expect(result).toEqual({ x: 1680, y: 880, changed: false });
  });
});

describe("VALID_ALIGNMENTS", () => {
  it("contains all 9 alignment values", () => {
    expect(VALID_ALIGNMENTS).toHaveLength(9);
    expect(VALID_ALIGNMENTS).toContain("bottom-right");
    expect(VALID_ALIGNMENTS).toContain("center");
  });

  it("is frozen", () => {
    expect(Object.isFrozen(VALID_ALIGNMENTS)).toBe(true);
  });

  it("every value is accepted by getPosition without falling to default", () => {
    const display = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
    const defaultPos = getPosition(display, 240, 200, "bottom-right", 24);
    for (const align of VALID_ALIGNMENTS) {
      if (align === "bottom-right") continue;
      const pos = getPosition(display, 240, 200, align, 24);
      // Non-default alignments should produce a different position
      expect(pos.x !== defaultPos.x || pos.y !== defaultPos.y).toBe(true);
    }
  });
});

describe("isValidAlignment", () => {
  it("returns true for valid alignments", () => {
    expect(isValidAlignment("bottom-right")).toBe(true);
    expect(isValidAlignment("center")).toBe(true);
    expect(isValidAlignment("top-left")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isValidAlignment("Bottom-Right")).toBe(true);
    expect(isValidAlignment("TOP-CENTER")).toBe(true);
  });

  it("trims whitespace", () => {
    expect(isValidAlignment("  center  ")).toBe(true);
  });

  it("returns false for invalid values", () => {
    expect(isValidAlignment("diagonal")).toBe(false);
    expect(isValidAlignment("")).toBe(false);
    expect(isValidAlignment(null)).toBe(false);
    expect(isValidAlignment(undefined)).toBe(false);
    expect(isValidAlignment(42)).toBe(false);
  });
});

describe("isValidOpacity", () => {
  it("accepts valid opacity values (0–1)", () => {
    expect(isValidOpacity(0)).toBe(true);
    expect(isValidOpacity(0.5)).toBe(true);
    expect(isValidOpacity(1)).toBe(true);
    expect(isValidOpacity(0.01)).toBe(true);
    expect(isValidOpacity(0.99)).toBe(true);
  });

  it("rejects out-of-range values", () => {
    expect(isValidOpacity(-0.1)).toBe(false);
    expect(isValidOpacity(1.1)).toBe(false);
    expect(isValidOpacity(2)).toBe(false);
    expect(isValidOpacity(-1)).toBe(false);
  });

  it("rejects non-finite and non-number values", () => {
    expect(isValidOpacity(NaN)).toBe(false);
    expect(isValidOpacity(Infinity)).toBe(false);
    expect(isValidOpacity(-Infinity)).toBe(false);
    expect(isValidOpacity("0.5")).toBe(false);
    expect(isValidOpacity(null)).toBe(false);
    expect(isValidOpacity(undefined)).toBe(false);
  });
});

describe("isValidPadding", () => {
  it("accepts valid padding values (>= 0, <= MAX_PADDING)", () => {
    expect(isValidPadding(0)).toBe(true);
    expect(isValidPadding(24)).toBe(true);
    expect(isValidPadding(100.5)).toBe(true);
    expect(isValidPadding(MAX_PADDING)).toBe(true);
  });

  it("rejects negative values", () => {
    expect(isValidPadding(-1)).toBe(false);
    expect(isValidPadding(-0.1)).toBe(false);
  });

  it("rejects values exceeding MAX_PADDING", () => {
    expect(isValidPadding(MAX_PADDING + 1)).toBe(false);
    expect(isValidPadding(100000)).toBe(false);
  });

  it("rejects non-finite and non-number values", () => {
    expect(isValidPadding(NaN)).toBe(false);
    expect(isValidPadding(Infinity)).toBe(false);
    expect(isValidPadding("24")).toBe(false);
    expect(isValidPadding(null)).toBe(false);
    expect(isValidPadding(undefined)).toBe(false);
  });

  it("exports MAX_PADDING as 1000", () => {
    expect(MAX_PADDING).toBe(1000);
  });
});

describe("nextAlignmentIndex", () => {
  it("cycles forward through alignments", () => {
    expect(nextAlignmentIndex(0)).toBe(1);
    expect(nextAlignmentIndex(1)).toBe(2);
  });

  it("wraps around at the end", () => {
    expect(nextAlignmentIndex(VALID_ALIGNMENTS.length - 1)).toBe(0);
  });

  it("returns 0 for invalid input", () => {
    expect(nextAlignmentIndex(-1)).toBe(0);
    expect(nextAlignmentIndex(NaN)).toBe(0);
    expect(nextAlignmentIndex(null)).toBe(0);
    expect(nextAlignmentIndex(undefined)).toBe(0);
    expect(nextAlignmentIndex(1.5)).toBe(0);
  });

  it("respects custom count", () => {
    expect(nextAlignmentIndex(2, 4)).toBe(3);
    expect(nextAlignmentIndex(3, 4)).toBe(0);
  });
});

describe("prevAlignmentIndex", () => {
  it("cycles backward through alignments", () => {
    expect(prevAlignmentIndex(2)).toBe(1);
    expect(prevAlignmentIndex(1)).toBe(0);
  });

  it("wraps around at the start", () => {
    expect(prevAlignmentIndex(0)).toBe(VALID_ALIGNMENTS.length - 1);
  });

  it("returns last index for invalid input", () => {
    expect(prevAlignmentIndex(-1)).toBe(VALID_ALIGNMENTS.length - 1);
    expect(prevAlignmentIndex(NaN)).toBe(VALID_ALIGNMENTS.length - 1);
    expect(prevAlignmentIndex(null)).toBe(VALID_ALIGNMENTS.length - 1);
    expect(prevAlignmentIndex(undefined)).toBe(VALID_ALIGNMENTS.length - 1);
  });

  it("respects custom count", () => {
    expect(prevAlignmentIndex(0, 4)).toBe(3);
    expect(prevAlignmentIndex(1, 4)).toBe(0);
  });
});

describe("findAlignmentIndex", () => {
  it("finds valid alignments (case-insensitive)", () => {
    expect(findAlignmentIndex("bottom-right")).toBe(
      VALID_ALIGNMENTS.indexOf("bottom-right"),
    );
    expect(findAlignmentIndex("TOP-LEFT")).toBe(
      VALID_ALIGNMENTS.indexOf("top-left"),
    );
    expect(findAlignmentIndex("  Center  ")).toBe(
      VALID_ALIGNMENTS.indexOf("center"),
    );
  });

  it("returns -1 for invalid alignments", () => {
    expect(findAlignmentIndex("diagonal")).toBe(-1);
    expect(findAlignmentIndex("")).toBe(-1);
    expect(findAlignmentIndex(null)).toBe(-1);
    expect(findAlignmentIndex(undefined)).toBe(-1);
    expect(findAlignmentIndex(42)).toBe(-1);
  });
});

describe("ALIGNMENT_ARROWS", () => {
  it("has an arrow for every valid alignment", () => {
    for (const a of VALID_ALIGNMENTS) {
      expect(ALIGNMENT_ARROWS[a]).toBeDefined();
      expect(typeof ALIGNMENT_ARROWS[a]).toBe("string");
      expect(ALIGNMENT_ARROWS[a].length).toBeGreaterThan(0);
    }
  });

  it("is frozen", () => {
    expect(Object.isFrozen(ALIGNMENT_ARROWS)).toBe(true);
  });
});

describe("alignmentArrow", () => {
  it("returns correct arrows for each alignment", () => {
    expect(alignmentArrow("top-left")).toBe("↖");
    expect(alignmentArrow("top-center")).toBe("↑");
    expect(alignmentArrow("top-right")).toBe("↗");
    expect(alignmentArrow("center-left")).toBe("←");
    expect(alignmentArrow("center")).toBe("·");
    expect(alignmentArrow("center-right")).toBe("→");
    expect(alignmentArrow("bottom-left")).toBe("↙");
    expect(alignmentArrow("bottom-center")).toBe("↓");
    expect(alignmentArrow("bottom-right")).toBe("↘");
  });

  it("is case-insensitive", () => {
    expect(alignmentArrow("Bottom-Right")).toBe("↘");
    expect(alignmentArrow("TOP-LEFT")).toBe("↖");
  });

  it("returns fallback for invalid input", () => {
    expect(alignmentArrow("invalid")).toBe("·");
    expect(alignmentArrow(null)).toBe("·");
    expect(alignmentArrow(undefined)).toBe("·");
    expect(alignmentArrow(42)).toBe("·");
  });
});

describe("formatAlignment", () => {
  it("formats alignment with arrow prefix", () => {
    expect(formatAlignment("bottom-right")).toBe("↘ bottom-right");
    expect(formatAlignment("top-left")).toBe("↖ top-left");
    expect(formatAlignment("center")).toBe("· center");
  });

  it("normalizes case", () => {
    expect(formatAlignment("Bottom-Right")).toBe("↘ bottom-right");
  });

  it("defaults to bottom-right for empty/null input", () => {
    expect(formatAlignment("")).toBe("↘ bottom-right");
    expect(formatAlignment(null)).toBe("↘ bottom-right");
    expect(formatAlignment(undefined)).toBe("↘ bottom-right");
  });
});
