import { describe, expect, it } from "bun:test";
import register, { cleanErrorString, truncate, coerceNumber, coerceBoolean, summarizeToolResultMessage } from "../src/index.ts";

describe("utils", () => {
  it("coerceNumber", () => {
    expect(coerceNumber(10, 5)).toBe(10);
    expect(coerceNumber("10", 5)).toBe(10);
    expect(coerceNumber("abc", 5)).toBe(5);
    expect(coerceNumber(undefined, 5)).toBe(5);
  });

  it("truncate", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello world", 5)).toBe("hell…"); // 5-1=4 -> hell…
    // Space aware truncation
    expect(truncate("hello world", 9)).toBe("hello…"); 
    // "hello world" (11). limit 9. cut=8. "hello wo" -> lastSpace=5 -> "hello" -> "hello…"
    // Unicode surrogate pairs: emoji counts as 1 char
    expect(truncate("🦞🦞🦞", 2)).toBe("🦞…");
    // Collapses whitespace/newlines
    expect(truncate("hello\n  world", 140)).toBe("hello world");
    // Limit of 1: no room for ellipsis
    expect(truncate("hello", 1)).toBe("h");
  });

  it("coerceBoolean", () => {
    // Actual booleans pass through
    expect(coerceBoolean(true, false)).toBe(true);
    expect(coerceBoolean(false, true)).toBe(false);
    // Numbers: 0 is false, non-zero is true
    expect(coerceBoolean(0, true)).toBe(false);
    expect(coerceBoolean(1, false)).toBe(true);
    // String variants
    expect(coerceBoolean("true", false)).toBe(true);
    expect(coerceBoolean("false", true)).toBe(false);
    expect(coerceBoolean("yes", false)).toBe(true);
    expect(coerceBoolean("no", true)).toBe(false);
    expect(coerceBoolean("on", false)).toBe(true);
    expect(coerceBoolean("off", true)).toBe(false);
    expect(coerceBoolean("1", false)).toBe(true);
    expect(coerceBoolean("0", true)).toBe(false);
    // Case insensitive
    expect(coerceBoolean("TRUE", false)).toBe(true);
    expect(coerceBoolean("False", true)).toBe(false);
    // Fallback for unrecognized
    expect(coerceBoolean("maybe", true)).toBe(true);
    expect(coerceBoolean(undefined, false)).toBe(false);
    expect(coerceBoolean(null, true)).toBe(true);
  });

  it("cleanErrorString", () => {
    expect(cleanErrorString("Error: foo")).toBe("foo");
    expect(cleanErrorString("Tool failed: Error: foo")).toBe("foo");
    expect(cleanErrorString("Command failed: foo")).toBe("foo");
    expect(cleanErrorString("GitError: fatal: branch not found")).toBe("branch not found");
    expect(cleanErrorString("sh: foo: command not found")).toBe("foo: command not found");
    // Strip ANSI
    expect(cleanErrorString("\u001b[31mError:\u001b[0m foo")).toBe("foo");
    // Strip CSI sequences that end with non-letter final bytes (e.g. "~")
    expect(cleanErrorString("\u001b[1~Error: foo")).toBe("foo");
    // Strip OSC (common in terminal hyperlinks / title sequences)
    expect(cleanErrorString("\u001b]8;;https://example.com\u0007Error: boom\u001b]8;;\u0007")).toBe("boom");
    // Exit code handling
    expect(cleanErrorString("Command exited with code 1\nDetails here")).toBe("Details here");

    // Multi-line logs: prefer the first strong error line over noisy info
    expect(cleanErrorString("info: starting\nError: Failed to connect\nmore"))
      .toBe("Failed to connect");
    // Custom error types
    expect(cleanErrorString("MoltError: Connection lost")).toBe("Connection lost");
    // New channels
    expect(cleanErrorString("DiscordError: API unavailable")).toBe("API unavailable");
    expect(cleanErrorString("SlackError: channel_not_found")).toBe("channel_not_found");
  });

  it("summarizeToolResultMessage", () => {
    expect(summarizeToolResultMessage("hello")).toBe("hello");
    expect(summarizeToolResultMessage(0)).toBe("0");
    expect(summarizeToolResultMessage(true)).toBe("true");
    expect(summarizeToolResultMessage(null)).toBe("null");
    expect(summarizeToolResultMessage({ result: "done" })).toBe("done");

    // Priorities
    expect(summarizeToolResultMessage({ error: "fail", result: "ok" })).toBe("fail");
    expect(summarizeToolResultMessage({ stderr: "bad", stdout: "good" })).toBe("bad");

    // Complex objects
    expect(summarizeToolResultMessage({ error: { message: "nested" } })).toBe("nested");

    // Exit codes
    expect(summarizeToolResultMessage({ exitCode: 127 })).toBe("exit code 127");

    // Cleaning
    expect(summarizeToolResultMessage({ error: "Error: something" })).toBe("something");
  });

  it("resolves config from canonical id even when runtime id is an alias", async () => {
    const handlers = new Map<string, any>();

    register({
      id: "molt-mascot",
      config: {
        plugins: {
          entries: {
            "@molt/mascot-plugin": {
              config: {
                alignment: "top-left",
                padding: 12,
              },
            },
          },
        },
      },
      logger: { info() {}, warn() {} },
      registerGatewayMethod(name: string, fn: any) {
        handlers.set(name, fn);
      },
    });

    const fn = handlers.get("molt-mascot.state");
    expect(typeof fn).toBe("function");

    let payload: any;
    await fn({}, { respond: (_ok: boolean, data: any) => (payload = data) });

    expect(payload?.ok).toBe(true);
    expect(payload?.state?.alignment).toBe("top-left");
    expect(payload?.state?.padding).toBe(12);
  });



  it("preserves envelope sessionKey/tool when payload is a primitive (v2 framing)", async () => {
    const handlers = new Map<string, any>();
    const listeners = new Map<string, any>();

    register({
      id: "@molt/mascot-plugin",
      logger: { info() {}, warn() {} },
      registerGatewayMethod(name: string, fn: any) {
        handlers.set(name, fn);
      },
      on(name: string, fn: any) {
        listeners.set(name, fn);
      },
    });

    const toolListener = listeners.get("tool");
    expect(typeof toolListener).toBe("function");

    // Simulate a v2 tool start event where the payload is just a primitive/string.
    toolListener({
      phase: "start",
      sessionKey: "s1",
      tool: "functions.exec",
      payload: "starting",
    });

    const stateFn = handlers.get("@molt/mascot-plugin.state");
    expect(typeof stateFn).toBe("function");

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });

    expect(payload?.ok).toBe(true);
    expect(payload?.state?.mode).toBe("tool");
    expect(payload?.state?.currentTool).toBe("exec");
  });

  it("sets currentTool to a safe fallback when tool start event has no name", async () => {
    const handlers = new Map<string, any>();
    const listeners = new Map<string, any>();

    register({
      id: "@molt/mascot-plugin",
      logger: { info() {}, warn() {} },
      registerGatewayMethod(name: string, fn: any) {
        handlers.set(name, fn);
      },
      on(name: string, fn: any) {
        listeners.set(name, fn);
      },
    });

    const toolListener = listeners.get("tool");
    expect(typeof toolListener).toBe("function");

    toolListener({ phase: "start", sessionKey: "s1" });

    const stateFn = handlers.get("@molt/mascot-plugin.state");
    expect(typeof stateFn).toBe("function");

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });

    expect(payload?.ok).toBe(true);
    expect(payload?.state?.mode).toBe("tool");
    expect(payload?.state?.currentTool).toBe("tool");
  });

  it("defaults alignment when given an invalid value", async () => {
    const handlers = new Map<string, any>();

    register({
      id: "@molt/mascot-plugin",
      pluginConfig: {
        // @ts-expect-error - intentionally invalid for test
        alignment: "diagonal",
      },
      logger: { info() {}, warn() {} },
      registerGatewayMethod(name: string, fn: any) {
        handlers.set(name, fn);
      },
    });

    const fn = handlers.get("@molt/mascot-plugin.state");
    expect(typeof fn).toBe("function");

    let payload: any;
    await fn({}, { respond: (_ok: boolean, data: any) => (payload = data) });

    expect(payload?.ok).toBe(true);
    expect(payload?.state?.alignment).toBe("bottom-right");
  });

  it("clamps padding >= 0 and opacity to [0,1]", async () => {
    const handlers = new Map<string, any>();

    register({
      id: "@molt/mascot-plugin",
      pluginConfig: {
        padding: -10,
        opacity: 2,
      },
      logger: { info() {}, warn() {} },
      registerGatewayMethod(name: string, fn: any) {
        handlers.set(name, fn);
      },
    });

    const fn = handlers.get("@molt/mascot-plugin.state");
    expect(typeof fn).toBe("function");

    let payload: any;
    await fn({}, { respond: (_ok: boolean, data: any) => (payload = data) });

    expect(payload?.ok).toBe(true);
    expect(payload?.state?.padding).toBe(24);
    expect(payload?.state?.opacity).toBe(1);
  });

  it("coerces boolean config values from strings and numbers", async () => {
    const handlers = new Map<string, any>();

    register({
      id: "@molt/mascot-plugin",
      pluginConfig: {
        // String boolean values (common in env var configs)
        clickThrough: "true",
        hideText: "false",
      },
      logger: { info() {}, warn() {} },
      registerGatewayMethod(name: string, fn: any) {
        handlers.set(name, fn);
      },
    });

    const fn = handlers.get("@molt/mascot-plugin.state");
    let payload: any;
    await fn({}, { respond: (_ok: boolean, data: any) => (payload = data) });

    expect(payload?.ok).toBe(true);
    expect(payload?.state?.clickThrough).toBe(true);
    expect(payload?.state?.hideText).toBe(false);
  });

  it("coerces numeric string booleans (1/0) correctly", async () => {
    const handlers = new Map<string, any>();

    register({
      id: "@molt/mascot-plugin",
      pluginConfig: {
        clickThrough: "1",
        hideText: "0",
      },
      logger: { info() {}, warn() {} },
      registerGatewayMethod(name: string, fn: any) {
        handlers.set(name, fn);
      },
    });

    const fn = handlers.get("@molt/mascot-plugin.state");
    let payload: any;
    await fn({}, { respond: (_ok: boolean, data: any) => (payload = data) });

    expect(payload?.ok).toBe(true);
    expect(payload?.state?.clickThrough).toBe(true);
    expect(payload?.state?.hideText).toBe(false);
  });
});
