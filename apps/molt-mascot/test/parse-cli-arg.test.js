import { describe, expect, it } from "bun:test";
import { parseCliArg, hasBoolFlag, parseNumericArg } from "../src/parse-cli-arg.cjs";

describe("parseCliArg", () => {
  it("returns null when flag is not present", () => {
    expect(parseCliArg("--gateway", ["node", "app"])).toBeNull();
  });

  it("parses --flag value syntax", () => {
    expect(parseCliArg("--gateway", ["node", "app", "--gateway", "ws://localhost:18789"])).toBe("ws://localhost:18789");
  });

  it("parses --flag=value syntax", () => {
    expect(parseCliArg("--gateway", ["node", "app", "--gateway=ws://localhost:18789"])).toBe("ws://localhost:18789");
  });

  it("returns null when flag is last arg with no value (positional syntax)", () => {
    expect(parseCliArg("--token", ["node", "app", "--token"])).toBeNull();
  });

  it("returns empty string for --flag= (explicit empty value)", () => {
    expect(parseCliArg("--gateway", ["node", "app", "--gateway="])).toBe("");
  });

  it("returns the first match when flag appears multiple times", () => {
    expect(parseCliArg("--size", ["node", "app", "--size", "small", "--size", "large"])).toBe("small");
  });

  it("does not match partial flag names", () => {
    expect(parseCliArg("--gate", ["node", "app", "--gateway", "ws://localhost"])).toBeNull();
  });

  it("handles = inside the value", () => {
    expect(parseCliArg("--token", ["node", "app", "--token=abc=def"])).toBe("abc=def");
  });

  it("handles values that look like flags", () => {
    expect(parseCliArg("--gateway", ["node", "app", "--gateway", "--not-a-value"])).toBe("--not-a-value");
  });

  it("works with mixed flags and values", () => {
    const argv = ["node", "app", "--debug", "--gateway", "ws://localhost", "--size=large", "--token", "secret"];
    expect(parseCliArg("--gateway", argv)).toBe("ws://localhost");
    expect(parseCliArg("--size", argv)).toBe("large");
    expect(parseCliArg("--token", argv)).toBe("secret");
    // Note: parseCliArg doesn't distinguish boolean flags from value flags —
    // it returns the next arg regardless. Callers are responsible for knowing
    // which flags take values (this matches the original electron-main behavior).
    expect(parseCliArg("--debug", argv)).toBe("--gateway");
  });
});

describe("hasBoolFlag", () => {
  it("returns true when flag is present", () => {
    expect(hasBoolFlag("--debug", ["node", "app", "--debug"])).toBe(true);
  });

  it("returns false when flag is absent", () => {
    expect(hasBoolFlag("--debug", ["node", "app"])).toBe(false);
  });

  it("does not match partial flag names", () => {
    expect(hasBoolFlag("--no", ["node", "app", "--no-tray"])).toBe(false);
  });

  it("matches exact flag among many args", () => {
    const argv = ["node", "app", "--click-through", "--debug", "--no-tray"];
    expect(hasBoolFlag("--debug", argv)).toBe(true);
    expect(hasBoolFlag("--no-tray", argv)).toBe(true);
    expect(hasBoolFlag("--help", argv)).toBe(false);
  });

  it("returns false for empty argv", () => {
    expect(hasBoolFlag("--debug", [])).toBe(false);
  });
});

describe("parseNumericArg", () => {
  it("returns fallback when flag is absent", () => {
    expect(parseNumericArg("--count", 10, { argv: ["node", "app"] })).toBe(10);
  });

  it("parses a valid integer", () => {
    expect(parseNumericArg("--count", 10, { argv: ["node", "app", "--count", "5"] })).toBe(5);
  });

  it("parses a valid float", () => {
    expect(parseNumericArg("--opacity", 1.0, { argv: ["node", "app", "--opacity=0.75"] })).toBe(0.75);
  });

  it("returns fallback for non-numeric value", () => {
    expect(parseNumericArg("--count", 10, { argv: ["node", "app", "--count", "abc"] })).toBe(10);
  });

  it("returns fallback for NaN", () => {
    expect(parseNumericArg("--count", 10, { argv: ["node", "app", "--count", "NaN"] })).toBe(10);
  });

  it("returns fallback for Infinity", () => {
    expect(parseNumericArg("--count", 10, { argv: ["node", "app", "--count", "Infinity"] })).toBe(10);
  });

  it("respects min constraint", () => {
    expect(parseNumericArg("--count", 10, { argv: ["node", "app", "--count", "-5"], min: 0 })).toBe(10);
    expect(parseNumericArg("--count", 10, { argv: ["node", "app", "--count", "0"], min: 0 })).toBe(0);
  });

  it("respects max constraint", () => {
    expect(parseNumericArg("--count", 10, { argv: ["node", "app", "--count", "200"], max: 100 })).toBe(10);
    expect(parseNumericArg("--count", 10, { argv: ["node", "app", "--count", "100"], max: 100 })).toBe(100);
  });

  it("respects integer constraint", () => {
    expect(parseNumericArg("--count", 10, { argv: ["node", "app", "--count", "3.5"], integer: true })).toBe(10);
    expect(parseNumericArg("--count", 10, { argv: ["node", "app", "--count", "3"], integer: true })).toBe(3);
  });

  it("combines min, max, and integer constraints", () => {
    const opts = { argv: ["node", "app", "--count", "5"], min: 1, max: 10, integer: true };
    expect(parseNumericArg("--count", 3, opts)).toBe(5);
  });

  it("returns fallback for empty --flag= value", () => {
    expect(parseNumericArg("--count", 10, { argv: ["node", "app", "--count="] })).toBe(10);
  });

  it("handles negative numbers when no min constraint", () => {
    expect(parseNumericArg("--offset", 0, { argv: ["node", "app", "--offset", "-10"] })).toBe(-10);
  });
});
