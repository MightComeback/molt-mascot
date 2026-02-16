import { describe, expect, it } from "bun:test";
import {
  coerceDelayMs,
  truncate,
  cleanErrorString,
  isMissingMethodResponse,
  formatDuration,
} from "../src/utils.js";

describe("coerceDelayMs", () => {
  it("returns the number when valid and >= 0", () => {
    expect(coerceDelayMs(500, 800)).toBe(500);
    expect(coerceDelayMs(0, 800)).toBe(0);
  });

  it("coerces string numbers", () => {
    expect(coerceDelayMs("1200", 800)).toBe(1200);
  });

  it("returns fallback for invalid values", () => {
    expect(coerceDelayMs("abc", 800)).toBe(800);
    expect(coerceDelayMs(-1, 800)).toBe(800);
    expect(coerceDelayMs(NaN, 800)).toBe(800);
    expect(coerceDelayMs(Infinity, 800)).toBe(800);
  });

  it("returns fallback for empty/null/undefined", () => {
    expect(coerceDelayMs("", 800)).toBe(800);
    expect(coerceDelayMs(null, 800)).toBe(800);
    expect(coerceDelayMs(undefined, 800)).toBe(800);
  });
});

describe("truncate", () => {
  it("returns short strings unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates long strings with ellipsis", () => {
    expect(truncate("hello world", 5)).toBe("hell…");
  });

  it("prefers word boundaries", () => {
    expect(truncate("hello world", 9)).toBe("hello…");
  });

  it("handles unicode surrogate pairs", () => {
    expect(truncate("🦞🦞🦞", 2)).toBe("🦞…");
  });

  it("collapses whitespace", () => {
    expect(truncate("hello\n  world", 140)).toBe("hello world");
  });

  it("handles limit of 1", () => {
    expect(truncate("hello", 1)).toBe("h");
  });

  it("handles limit of 0", () => {
    expect(truncate("hello", 0)).toBe("");
  });
});

describe("cleanErrorString", () => {
  it("strips Error: prefix", () => {
    expect(cleanErrorString("Error: foo")).toBe("foo");
  });

  it("strips nested prefixes", () => {
    expect(cleanErrorString("Tool failed: Error: foo")).toBe("foo");
  });

  it("strips ANSI codes", () => {
    expect(cleanErrorString("\u001b[31mError:\u001b[0m foo")).toBe("foo");
  });

  it("handles exit code lines", () => {
    expect(cleanErrorString("Command exited with code 1\nDetails here")).toBe("Details here");
  });

  it("prefers concrete error lines over info lines", () => {
    expect(cleanErrorString("info: starting\nError: Failed to connect\nmore"))
      .toBe("Failed to connect");
  });

  it("handles Python tracebacks", () => {
    expect(
      cleanErrorString(
        "Traceback (most recent call last):\n  File \"main.py\", line 1\nValueError: bad input"
      )
    ).toBe("bad input");
  });
});

describe("isMissingMethodResponse", () => {
  it("returns false for successful responses", () => {
    expect(isMissingMethodResponse({ ok: true, payload: { ok: true } })).toBe(false);
  });

  it("detects method not found", () => {
    expect(isMissingMethodResponse({
      ok: false,
      payload: { error: { message: "method not found" } },
    })).toBe(true);
  });

  it("detects unknown method", () => {
    expect(isMissingMethodResponse({
      ok: false,
      error: { message: "unknown method" },
    })).toBe(true);
  });

  it("detects unknown rpc method", () => {
    expect(isMissingMethodResponse({
      ok: false,
      error: "unknown rpc method",
    })).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isMissingMethodResponse({
      ok: false,
      payload: { error: { message: "auth denied" } },
    })).toBe(false);
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
    expect(formatDuration(5400)).toBe("1h 30m");
    expect(formatDuration(86399)).toBe("23h 59m");
  });

  it("formats days", () => {
    expect(formatDuration(86400)).toBe("1d");
    expect(formatDuration(90000)).toBe("1d 1h");
    expect(formatDuration(172800)).toBe("2d");
  });

  it("handles negative values", () => {
    expect(formatDuration(-5)).toBe("0s");
  });
});
