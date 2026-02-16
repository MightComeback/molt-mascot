import { describe, expect, it } from "bun:test";
import register, { cleanErrorString, truncate, coerceNumber, coerceBoolean, summarizeToolResultMessage, type PluginApi } from "../src/index.ts";

function createMockApi(overrides: Partial<PluginApi> = {}): PluginApi & {
  handlers: Map<string, any>;
  listeners: Map<string, any>;
  services: Map<string, { start?: () => void; stop?: () => void }>;
} {
  const handlers = new Map<string, any>();
  const listeners = new Map<string, any>();
  const services = new Map<string, { start?: () => void; stop?: () => void }>();
  return {
    id: "@molt/mascot-plugin",
    logger: { info() {}, warn() {}, error() {} },
    registerGatewayMethod(name: string, fn: any) { handlers.set(name, fn); },
    registerService(svc: { id: string; start?: () => void; stop?: () => void }) { services.set(svc.id, svc); },
    on(name: string, fn: any) { listeners.set(name, fn); },
    handlers,
    listeners,
    services,
    ...overrides,
  };
}

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
    // Trailing colon after exit code (some shells format this way)
    expect(cleanErrorString("Command failed with exit code 1:\nError: missing token")).toBe("missing token");

    // Multi-line logs: prefer the first strong error line over noisy info
    expect(cleanErrorString("info: starting\nError: Failed to connect\nmore"))
      .toBe("Failed to connect");
    // Python-style traceback: prefer concrete final error over traceback header
    expect(
      cleanErrorString(
        "Traceback (most recent call last):\n  File \"main.py\", line 1\nValueError: bad input"
      )
    ).toBe("bad input");
    // Log-level prefixes
    expect(cleanErrorString("info: starting up")).toBe("starting up");
    expect(cleanErrorString("debug: variable dump")).toBe("variable dump");
    expect(cleanErrorString("trace: call stack")).toBe("call stack");
    expect(cleanErrorString("warn: deprecation notice")).toBe("deprecation notice");
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

  it("auto-heals when activeAgents exceeds threshold (prevents unbounded growth)", async () => {
    const api = createMockApi();
    register(api);

    const agentListener = api.listeners.get("agent");
    const stateFn = api.handlers.get("@molt/mascot-plugin.state");

    // Start 12 agents without ending them (simulates leaked/orphaned sessions)
    for (let i = 0; i < 12; i++) {
      agentListener({ phase: "start", sessionKey: `leak-${i}` });
    }

    // The 12th start should trigger auto-heal (threshold is 10)
    // After heal, the set is cleared and only the triggering agent remains
    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    // Mode should still be thinking (the triggering agent is active)
    expect(payload?.state?.mode).toBe("thinking");
  });

  it("transitions from error to idle after errorHoldMs expires", async () => {
    const api = createMockApi({
      pluginConfig: { errorHoldMs: 50 }, // short hold for test
    });
    register(api);

    const toolListener = api.listeners.get("tool");
    const stateFn = api.handlers.get("@molt/mascot-plugin.state");

    // Start a tool, then end it with an error
    toolListener({ phase: "start", sessionKey: "s1", tool: "exec" });
    toolListener({
      phase: "end",
      sessionKey: "s1",
      tool: "exec",
      result: { status: "error", error: "something broke" },
    });

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("error");
    expect(payload?.state?.lastError?.message).toContain("something broke");

    // Wait for error hold to expire
    await new Promise((r) => setTimeout(r, 80));

    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("idle");
    // lastError should be cleared when not in error mode
    expect(payload?.state?.lastError).toBeUndefined();
  });

  it("reset clears error state and active counters", async () => {
    const api = createMockApi();
    register(api);

    const agentListener = api.listeners.get("agent");
    const toolListener = api.listeners.get("tool");
    const stateFn = api.handlers.get("@molt/mascot-plugin.state");
    const resetFn = api.handlers.get("@molt/mascot-plugin.reset");

    // Put into a complex state: agent running + tool active
    agentListener({ phase: "start", sessionKey: "s1" });
    toolListener({ phase: "start", sessionKey: "s1", tool: "web_search" });

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("tool");
    expect(payload?.state?.currentTool).toBe("web_search");

    // Reset
    await resetFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.ok).toBe(true);
    expect(payload?.state?.mode).toBe("idle");
    expect(payload?.state?.currentTool).toBeUndefined();
  });

  it("stop() resets published state so clients don't see stale data after reload", async () => {
    const api = createMockApi();
    register(api);

    const agentListener = api.listeners.get("agent");
    const toolListener = api.listeners.get("tool");
    const stateFn = api.handlers.get("@molt/mascot-plugin.state");

    // Put into active state
    agentListener({ phase: "start", sessionKey: "s1" });
    toolListener({ phase: "start", sessionKey: "s1", tool: "exec" });

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("tool");
    expect(payload?.state?.currentTool).toBe("exec");

    // Call stop() on the registered service
    const svc = api.services.get("@molt/mascot-plugin");
    expect(svc).toBeDefined();
    svc!.stop?.();

    // State should be fully reset
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("idle");
    expect(payload?.state?.currentTool).toBeUndefined();
    expect(payload?.state?.lastError).toBeUndefined();
  });

  it("summarizeToolResultMessage skips generic exit-code message when better detail exists", () => {
    // When both a generic exit message and a meaningful error are present,
    // the summary should prefer the meaningful one.
    expect(
      summarizeToolResultMessage({
        message: "Command exited with code 1",
        stderr: "ENOENT: no such file or directory",
      })
    ).toBe("ENOENT: no such file or directory");

    // When the only info IS the exit code, still return it
    expect(
      summarizeToolResultMessage({ message: "Command exited with code 127" })
    ).toBe("Command exited with code 127");

    // undefined returns the string "undefined"
    expect(summarizeToolResultMessage(undefined)).toBe("undefined");
  });

  it("multi-session tools show the most recently active tool", async () => {
    const api = createMockApi();
    register(api);

    const toolListener = api.listeners.get("tool");
    const stateFn = api.handlers.get("@molt/mascot-plugin.state");

    // Session A starts a tool
    toolListener({ phase: "start", sessionKey: "a", tool: "web_search" });

    // Small delay so timestamps differ
    await new Promise((r) => setTimeout(r, 5));

    // Session B starts a different tool (more recent)
    toolListener({ phase: "start", sessionKey: "b", tool: "exec" });

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("tool");
    // Most recent tool (session B) should win
    expect(payload?.state?.currentTool).toBe("exec");

    // End session B's tool — session A's tool should now show
    toolListener({ phase: "end", sessionKey: "b", tool: "exec", result: { status: "ok" } });

    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("tool");
    expect(payload?.state?.currentTool).toBe("web_search");
  });

  it("content tools (image, tts) don't false-positive on text containing 'error:'", async () => {
    const api = createMockApi({ pluginConfig: { idleDelayMs: 30 } });
    register(api);

    const agentListener = api.listeners.get("agent");
    const toolListener = api.listeners.get("tool");
    const stateFn = api.handlers.get("@molt/mascot-plugin.state");

    agentListener({ phase: "start", sessionKey: "s1" });

    // image tool returns content with "error:" in the text — should NOT trigger error mode
    toolListener({ phase: "start", sessionKey: "s1", tool: "image" });
    toolListener({
      phase: "end",
      sessionKey: "s1",
      tool: "image",
      result: "The image shows an error: 404 page not found displayed on screen",
    });

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("thinking"); // back to thinking, not error

    // tts tool similarly
    toolListener({ phase: "start", sessionKey: "s1", tool: "tts" });
    toolListener({
      phase: "end",
      sessionKey: "s1",
      tool: "tts",
      result: "error: this is just the text being spoken",
    });

    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("thinking"); // still not error
  });

  it("nested tools maintain correct depth and show most recent tool", async () => {
    const api = createMockApi({ pluginConfig: { idleDelayMs: 30 } });
    register(api);

    const toolListener = api.listeners.get("tool");
    const stateFn = api.handlers.get("@molt/mascot-plugin.state");

    // Start two nested tools
    toolListener({ phase: "start", sessionKey: "s1", tool: "sessions_spawn" });
    toolListener({ phase: "start", sessionKey: "s1", tool: "read" });

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("tool");
    expect(payload?.state?.currentTool).toBe("read");

    // End inner tool — should show outer tool
    toolListener({ phase: "end", sessionKey: "s1", tool: "read", result: { status: "ok" } });

    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("tool");
    expect(payload?.state?.currentTool).toBe("sessions_spawn");

    // End outer tool — triggers scheduleIdle (800ms default delay)
    toolListener({ phase: "end", sessionKey: "s1", tool: "sessions_spawn", result: { status: "ok" } });

    // Wait for idle delay to fire (30ms configured above)
    await new Promise((r) => setTimeout(r, 60));

    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("idle");
    expect(payload?.state?.currentTool).toBeUndefined();
  });
});
