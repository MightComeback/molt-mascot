import { describe, expect, it } from "bun:test";
import { parseCliArg } from "../src/parse-cli-arg.cjs";

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
