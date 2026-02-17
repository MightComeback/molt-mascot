import { describe, expect, it } from "bun:test";

// CJS modules — use require for Bun compatibility
const { isTruthyEnv } = require("../src/is-truthy-env.cjs");

describe("isTruthyEnv", () => {
  it("returns true for truthy string values", () => {
    for (const v of ["1", "true", "t", "yes", "y", "on", "TRUE", "Yes", " 1 "]) {
      expect(isTruthyEnv(v)).toBe(true);
    }
  });

  it("returns false for falsy string values", () => {
    for (const v of ["0", "false", "f", "no", "n", "off", "", " ", "maybe"]) {
      expect(isTruthyEnv(v)).toBe(false);
    }
  });

  it("handles booleans directly", () => {
    expect(isTruthyEnv(true)).toBe(true);
    expect(isTruthyEnv(false)).toBe(false);
  });

  it("handles numbers (positive finite = truthy)", () => {
    expect(isTruthyEnv(1)).toBe(true);
    expect(isTruthyEnv(42)).toBe(true);
    expect(isTruthyEnv(0)).toBe(false);
    expect(isTruthyEnv(-1)).toBe(false);
    expect(isTruthyEnv(NaN)).toBe(false);
    expect(isTruthyEnv(Infinity)).toBe(false);
  });

  it("returns false for null/undefined/objects", () => {
    expect(isTruthyEnv(null)).toBe(false);
    expect(isTruthyEnv(undefined)).toBe(false);
    expect(isTruthyEnv({})).toBe(false);
    expect(isTruthyEnv([])).toBe(false);
  });
});
