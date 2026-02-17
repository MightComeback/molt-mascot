import { describe, expect, it } from "bun:test";
import { coerceDelayMs, truncate, isMissingMethodResponse } from "../src/utils.js";

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

describe("coerceDelayMs", () => {
  it("returns fallback for null/undefined/empty string", () => {
    expect(coerceDelayMs(null, 800)).toBe(800);
    expect(coerceDelayMs(undefined, 800)).toBe(800);
    expect(coerceDelayMs("", 800)).toBe(800);
  });

  it("parses valid numeric strings", () => {
    expect(coerceDelayMs("500", 800)).toBe(500);
    expect(coerceDelayMs("0", 800)).toBe(0);
    expect(coerceDelayMs("1200.5", 800)).toBe(1200.5);
  });

  it("passes through valid numbers", () => {
    expect(coerceDelayMs(500, 800)).toBe(500);
    expect(coerceDelayMs(0, 800)).toBe(0);
  });

  it("returns fallback for non-numeric strings", () => {
    expect(coerceDelayMs("abc", 800)).toBe(800);
    expect(coerceDelayMs("NaN", 800)).toBe(800);
  });

  it("returns fallback for negative numbers", () => {
    expect(coerceDelayMs(-100, 800)).toBe(800);
  });

  it("returns fallback for NaN and Infinity", () => {
    expect(coerceDelayMs(NaN, 800)).toBe(800);
    expect(coerceDelayMs(Infinity, 800)).toBe(800);
  });
});

describe("truncate (renderer)", () => {
  it("returns short strings unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates long strings with ellipsis", () => {
    expect(truncate("hello world foo bar", 10)).toBe("hello…");
  });

  it("collapses whitespace", () => {
    expect(truncate("a\n  b\tc", 140)).toBe("a b c");
  });

  it("handles unicode (surrogate pairs)", () => {
    expect(truncate("🦞🦞🦞", 2)).toBe("🦞…");
  });

  it("handles zero and negative limits", () => {
    expect(truncate("hello", 0)).toBe("");
    expect(truncate("hello", -1)).toBe("");
  });

  it("limit of 1 returns single char without ellipsis", () => {
    expect(truncate("hello", 1)).toBe("h");
  });
});

describe("isMissingMethodResponse", () => {
  it("returns false for successful responses", () => {
    expect(isMissingMethodResponse({ ok: true, payload: { ok: true } })).toBe(false);
  });

  it("detects JSON-RPC -32601 code", () => {
    expect(isMissingMethodResponse({
      ok: false,
      payload: { ok: false, error: { code: -32601, message: "Method not found" } },
    })).toBe(true);
  });

  it("detects 'method not found' in error message", () => {
    expect(isMissingMethodResponse({
      ok: false,
      payload: { ok: false, error: { message: "Method not found" } },
    })).toBe(true);
  });

  it("detects 'unknown method' in error message", () => {
    expect(isMissingMethodResponse({
      ok: false,
      payload: { ok: false, error: { message: "unknown method foo" } },
    })).toBe(true);
  });

  it("detects 'unknown rpc method' in error message", () => {
    expect(isMissingMethodResponse({
      ok: false,
      error: { message: "unknown rpc method bar" },
    })).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isMissingMethodResponse({
      ok: false,
      payload: { ok: false, error: { message: "auth failed" } },
    })).toBe(false);
  });

  it("returns false for null/undefined input", () => {
    expect(isMissingMethodResponse(null)).toBe(false);
    expect(isMissingMethodResponse(undefined)).toBe(false);
  });
});
