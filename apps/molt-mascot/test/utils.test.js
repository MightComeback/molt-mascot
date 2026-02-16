import { describe, expect, it } from "bun:test";
import {
  coerceDelayMs,
  truncate,
  cleanErrorString,
  isMissingMethodResponse,
  formatDuration,
  isTruthyEnv,
} from "../src/utils.js";

describe("coerceDelayMs", () => {
  it("returns the number when valid and >= 0", () => {
    expect(coerceDelayMs(500, 100)).toBe(500);
    expect(coerceDelayMs(0, 100)).toBe(0);
  });

  it("coerces numeric strings", () => {
    expect(coerceDelayMs("800", 100)).toBe(800);
  });

  it("returns fallback for null/undefined/empty", () => {
    expect(coerceDelayMs(null, 42)).toBe(42);
    expect(coerceDelayMs(undefined, 42)).toBe(42);
    expect(coerceDelayMs("", 42)).toBe(42);
  });

  it("returns fallback for negative or NaN", () => {
    expect(coerceDelayMs(-1, 42)).toBe(42);
    expect(coerceDelayMs("abc", 42)).toBe(42);
    expect(coerceDelayMs(NaN, 42)).toBe(42);
    expect(coerceDelayMs(Infinity, 42)).toBe(42);
  });
});

describe("truncate", () => {
  it("returns short strings unchanged", () => {
    expect(truncate("hi", 10)).toBe("hi");
  });

  it("truncates long strings with ellipsis", () => {
    expect(truncate("hello world foo", 10)).toBe("hello…");
  });

  it("handles limit <= 0", () => {
    expect(truncate("hello", 0)).toBe("");
  });

  it("handles limit = 1", () => {
    expect(truncate("hello", 1)).toBe("h");
  });

  it("collapses whitespace and newlines", () => {
    expect(truncate("hello\n\n  world", 140)).toBe("hello world");
  });

  it("handles unicode (surrogate pairs)", () => {
    expect(truncate("🦞🦞🦞", 2)).toBe("🦞…");
  });
});

describe("cleanErrorString", () => {
  it("strips Error: prefix", () => {
    expect(cleanErrorString("Error: something")).toBe("something");
  });

  it("strips nested prefixes", () => {
    expect(cleanErrorString("Tool failed: Error: boom")).toBe("boom");
  });

  it("strips ANSI codes", () => {
    expect(cleanErrorString("\x1b[31mError:\x1b[0m fail")).toBe("fail");
  });

  it("extracts concrete error from multi-line output", () => {
    expect(cleanErrorString("info: starting\nError: connection lost")).toBe(
      "connection lost"
    );
  });

  it("handles exit code lines", () => {
    expect(
      cleanErrorString("Command exited with code 1\nENOENT: not found")
    ).toBe("ENOENT: not found");
  });

  it("extracts final line from Python tracebacks", () => {
    expect(
      cleanErrorString(
        "Traceback (most recent call last):\n  File x\nValueError: bad"
      )
    ).toBe("bad");
  });
});

describe("isMissingMethodResponse", () => {
  it("returns false for successful responses", () => {
    expect(isMissingMethodResponse({ ok: true, payload: { ok: true } })).toBe(
      false
    );
  });

  it("detects method not found in error code", () => {
    expect(
      isMissingMethodResponse({
        ok: false,
        payload: { ok: false, error: { code: "METHOD_NOT_FOUND" } },
      })
    ).toBe(true);
  });

  it("detects method not found in error message", () => {
    expect(
      isMissingMethodResponse({
        ok: false,
        error: { message: "unknown method" },
      })
    ).toBe(true);
  });

  it("detects unknown rpc method", () => {
    expect(
      isMissingMethodResponse({
        ok: false,
        error: { message: "unknown rpc method" },
      })
    ).toBe(true);
  });
});

describe("formatDuration", () => {
  it("formats seconds", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(59)).toBe("59s");
  });

  it("formats minutes", () => {
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(3599)).toBe("59m 59s");
  });

  it("formats hours", () => {
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(3660)).toBe("1h 1m");
    expect(formatDuration(86399)).toBe("23h 59m");
  });

  it("formats days", () => {
    expect(formatDuration(86400)).toBe("1d");
    expect(formatDuration(90000)).toBe("1d 1h");
  });

  it("handles negative input gracefully", () => {
    expect(formatDuration(-5)).toBe("0s");
  });
});

describe("isTruthyEnv", () => {
  it("returns true for truthy string values", () => {
    expect(isTruthyEnv("true")).toBe(true);
    expect(isTruthyEnv("1")).toBe(true);
    expect(isTruthyEnv("yes")).toBe(true);
    expect(isTruthyEnv("on")).toBe(true);
    expect(isTruthyEnv("TRUE")).toBe(true);
    expect(isTruthyEnv("Yes")).toBe(true);
    expect(isTruthyEnv("ON")).toBe(true);
    // Short aliases
    expect(isTruthyEnv("t")).toBe(true);
    expect(isTruthyEnv("T")).toBe(true);
    expect(isTruthyEnv("y")).toBe(true);
    expect(isTruthyEnv("Y")).toBe(true);
  });

  it("returns false for falsy string values", () => {
    expect(isTruthyEnv("false")).toBe(false);
    expect(isTruthyEnv("0")).toBe(false);
    expect(isTruthyEnv("no")).toBe(false);
    expect(isTruthyEnv("off")).toBe(false);
    expect(isTruthyEnv("")).toBe(false);
  });

  it("returns false for whitespace-only strings", () => {
    expect(isTruthyEnv("  ")).toBe(false);
    expect(isTruthyEnv("\t")).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isTruthyEnv(null)).toBe(false);
    expect(isTruthyEnv(undefined)).toBe(false);
  });

  it("handles boolean inputs directly", () => {
    expect(isTruthyEnv(true)).toBe(true);
    expect(isTruthyEnv(false)).toBe(false);
  });

  it("handles numeric inputs", () => {
    expect(isTruthyEnv(1)).toBe(true);
    expect(isTruthyEnv(0)).toBe(false);
    expect(isTruthyEnv(-1)).toBe(false);
    expect(isTruthyEnv(Infinity)).toBe(false);
    expect(isTruthyEnv(NaN)).toBe(false);
  });
});
