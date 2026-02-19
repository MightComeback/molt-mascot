import { describe, expect, it } from "bun:test";
import register, { cleanErrorString, truncate, coerceNumber, coerceBoolean, summarizeToolResultMessage, formatDuration, coerceSize, coerceAlignment, allowedAlignments, allowedSizes, type PluginApi } from "../src/index.ts";

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
    // Limit of 0 or negative: return empty string
    expect(truncate("hello", 0)).toBe("");
    expect(truncate("hello", -5)).toBe("");
  });

  it("formatDuration", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(3661)).toBe("1h 1m");
    expect(formatDuration(86400)).toBe("1d");
    expect(formatDuration(90000)).toBe("1d 1h");
    // Negative clamps to 0
    expect(formatDuration(-5)).toBe("0s");
    // Fractional rounds
    expect(formatDuration(59.7)).toBe("1m");
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
    // 8-bit CSI (0x9B) sequences
    expect(cleanErrorString("\x9B31mError:\x9B0m foo")).toBe("foo");
    // Custom error types
    expect(cleanErrorString("MoltError: Connection lost")).toBe("Connection lost");
    // New channels
    expect(cleanErrorString("DiscordError: API unavailable")).toBe("API unavailable");
    expect(cleanErrorString("SlackError: channel_not_found")).toBe("channel_not_found");
    // Python built-in exceptions
    expect(cleanErrorString("FileNotFoundError: [Errno 2] No such file")).toBe("[Errno 2] No such file");
    expect(cleanErrorString("ConnectionRefusedError: [Errno 111] Connection refused")).toBe("[Errno 111] Connection refused");
    expect(cleanErrorString("BrokenPipeError: [Errno 32] Broken pipe")).toBe("[Errno 32] Broken pipe");
    expect(cleanErrorString("RecursionError: maximum recursion depth exceeded")).toBe("maximum recursion depth exceeded");
    expect(cleanErrorString("NotImplementedError: abstract method")).toBe("abstract method");
    expect(cleanErrorString("OSError: [Errno 28] No space left on device")).toBe("[Errno 28] No space left on device");
    // ISO-8601 timestamp prefixes from log output
    expect(cleanErrorString("[2026-02-17T15:30:00Z] Error: timeout")).toBe("timeout");
    expect(cleanErrorString("2026-02-17T15:30:00.123Z Error: connection lost")).toBe("connection lost");
    expect(cleanErrorString("[2026-02-17 15:30:00] fatal: bad ref")).toBe("bad ref");
    // POSIX errno codes (Node/Bun style)
    expect(cleanErrorString("ENOENT: no such file or directory, open '/foo'")).toBe("no such file or directory, open '/foo'");
    expect(cleanErrorString("EACCES: permission denied, open '/etc/shadow'")).toBe("permission denied, open '/etc/shadow'");
    expect(cleanErrorString("EPERM: operation not permitted")).toBe("operation not permitted");
    expect(cleanErrorString("ECONNREFUSED: connection refused")).toBe("connection refused");
    expect(cleanErrorString("Error: ENOENT: no such file")).toBe("no such file");
    // POSIX signal descriptions: strip trailing signal number for brevity
    expect(cleanErrorString("Killed: 9")).toBe("Killed");
    expect(cleanErrorString("Segmentation fault: 11")).toBe("Segmentation fault");
    expect(cleanErrorString("Abort trap: 6")).toBe("Abort trap");
    expect(cleanErrorString("Bus error: 10")).toBe("Bus error");
    // Multi-line with signal: first line kept as-is (regex only matches at end of string)
    expect(cleanErrorString("Killed: 9\nError: out of memory")).toBe("out of memory");
    expect(cleanErrorString("Terminated: 15")).toBe("Terminated");

    // File-path:line:col prefixes (Node/Bun stack traces)
    expect(cleanErrorString("/Users/foo/bar.js:42:10: TypeError: Cannot read properties")).toBe("Cannot read properties");
    expect(cleanErrorString("/app/src/index.ts:100: Error: connection failed")).toBe("connection failed");
    expect(cleanErrorString("C:\\Users\\dev\\app.js:15:3: RangeError: out of bounds")).toBe("out of bounds");
    // file:// URL prefixes
    expect(cleanErrorString("file:///Users/foo/bar.js:42:10: TypeError: oops")).toBe("oops");
    // Trailing " at <path>:<line>:<col>" suffixes from flattened stack traces
    expect(cleanErrorString("Cannot find module 'foo' at /app/index.js:10:5")).toBe("Cannot find module 'foo'");
    expect(cleanErrorString("ENOENT at /app/src/main.ts:42")).toBe("ENOENT");
    expect(cleanErrorString("Missing key at Object.<anonymous> (/app/index.js:10:5)")).toBe("Missing key");
    // Node.js bracketed error codes: [ERR_*]:
    expect(cleanErrorString("Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'foo'")).toBe("Cannot find package 'foo'");
    expect(cleanErrorString("TypeError [ERR_INVALID_ARG_TYPE]: The argument must be string")).toBe("The argument must be string");
    expect(cleanErrorString("[ERR_REQUIRE_ESM]: require() of ES Module not supported")).toBe("require() of ES Module not supported");
    // Rust panic messages (old format, pre-1.73)
    expect(cleanErrorString("thread 'main' panicked at 'index out of bounds', src/main.rs:42:5")).toBe("index out of bounds");
    expect(cleanErrorString("thread 'tokio-runtime-worker' panicked at 'connection refused', src/net.rs:10")).toBe("connection refused");
    // Rust panic messages (new format, 1.73+)
    expect(cleanErrorString("thread 'main' panicked at src/main.rs:42:5:\nindex out of bounds")).toBe("index out of bounds");
    expect(cleanErrorString("thread 'tokio-runtime-worker' panicked at src/net.rs:10:3:\nconnection refused")).toBe("connection refused");
    // Go runtime errors
    expect(cleanErrorString("runtime: out of memory")).toBe("out of memory");
    expect(cleanErrorString("fatal error: runtime: out of memory")).toBe("out of memory");
    // Bracketed log-level prefixes (Java/Rust/Go structured loggers)
    expect(cleanErrorString("[ERROR] connection refused")).toBe("connection refused");
    expect(cleanErrorString("[WARN] deprecated API")).toBe("deprecated API");
    expect(cleanErrorString("[WARNING] slow query")).toBe("slow query");
    expect(cleanErrorString("[INFO] starting up")).toBe("starting up");
    expect(cleanErrorString("[FATAL] out of memory")).toBe("out of memory");
    expect(cleanErrorString("[CRITICAL] disk full")).toBe("disk full");
    expect(cleanErrorString("[PANIC] stack overflow")).toBe("stack overflow");
    // With timestamp prefix inside brackets
    expect(cleanErrorString("[2026-02-18 12:00:00 ERROR] connection refused")).toBe("connection refused");
    // With colon after bracket
    expect(cleanErrorString("[ERROR]: connection refused")).toBe("connection refused");
    // Java/JVM-style fully-qualified exception class prefixes
    expect(cleanErrorString("java.lang.NullPointerException: Cannot invoke method on null")).toBe("Cannot invoke method on null");
    expect(cleanErrorString("java.io.FileNotFoundException: /tmp/missing.txt (No such file)")).toBe("/tmp/missing.txt (No such file)");
    expect(cleanErrorString("kotlin.KotlinNullPointerException: parameter must not be null")).toBe("parameter must not be null");
    // .NET/C# exceptions
    expect(cleanErrorString("System.InvalidOperationException: Sequence contains no elements")).toBe("Sequence contains no elements");
    expect(cleanErrorString("System.IO.FileNotFoundException: Could not find file")).toBe("Could not find file");
    // Java "Caused by:" chained exception prefix
    expect(cleanErrorString("Caused by: java.net.ConnectException: Connection refused")).toBe("Connection refused");
    // Python non-Error exceptions
    expect(cleanErrorString("KeyboardInterrupt: ")).toBe("");
    expect(cleanErrorString("SystemExit: 1")).toBe("1");
    expect(cleanErrorString("GeneratorExit: cleanup")).toBe("cleanup");
    // Cloud CLI prefixes
    expect(cleanErrorString("aws: error: no such command")).toBe("no such command");
    expect(cleanErrorString("gcloud: ERROR: permission denied")).toBe("permission denied");
    expect(cleanErrorString("az: command not found")).toBe("command not found");
    expect(cleanErrorString("pip: No matching distribution found")).toBe("No matching distribution found");
    // Go goroutine stack trace headers
    expect(cleanErrorString("goroutine 1 [running]:\npanic: runtime error: index out of range")).toBe("runtime error: index out of range");
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

  it("defaults size to medium and accepts valid presets", async () => {
    const handlers = new Map<string, any>();

    // Default
    register({
      id: "@molt/mascot-plugin",
      pluginConfig: {},
      logger: { info() {}, warn() {} },
      registerGatewayMethod(name: string, fn: any) { handlers.set(name, fn); },
    });

    const fn = handlers.get("@molt/mascot-plugin.state");
    let payload: any;
    await fn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.size).toBe("medium");

    // Explicit small
    const handlers2 = new Map<string, any>();
    register({
      id: "@molt/mascot-plugin",
      pluginConfig: { size: "small" },
      logger: { info() {}, warn() {} },
      registerGatewayMethod(name: string, fn: any) { handlers2.set(name, fn); },
    });
    const fn2 = handlers2.get("@molt/mascot-plugin.state");
    await fn2({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.size).toBe("small");

    // Invalid falls back to medium
    const handlers3 = new Map<string, any>();
    register({
      id: "@molt/mascot-plugin",
      // @ts-expect-error - intentionally invalid for test
      pluginConfig: { size: "huge" },
      logger: { info() {}, warn() {} },
      registerGatewayMethod(name: string, fn: any) { handlers3.set(name, fn); },
    });
    const fn3 = handlers3.get("@molt/mascot-plugin.state");
    await fn3({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.size).toBe("medium");
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
    ).toBe("no such file or directory");

    // When the only info IS the exit code, still return it
    expect(
      summarizeToolResultMessage({ message: "Command exited with code 127" })
    ).toBe("Command exited with code 127");

    // undefined returns the string "undefined"
    expect(summarizeToolResultMessage(undefined)).toBe("undefined");

    // Top-level arrays (e.g. memory_search, agents_list results)
    expect(summarizeToolResultMessage(["foo", "bar"])).toBe("foo, bar");
    expect(summarizeToolResultMessage([{ text: "a" }, { text: "b" }])).toBe("a, b");
    expect(summarizeToolResultMessage([{ name: "agent1" }, { name: "agent2" }])).toBe("agent1, agent2");
    expect(summarizeToolResultMessage([{ title: "Task A" }])).toBe("Task A");
    expect(summarizeToolResultMessage([])).toBe("empty");

    // Non-text content blocks (e.g. image results from vision tools)
    expect(summarizeToolResultMessage({ content: [{ type: "image", source: { data: "..." } }] })).toBe("image");
    expect(summarizeToolResultMessage({ content: [{ type: "image" }, { type: "audio" }] })).toBe("image, audio");
    // Mixed text + non-text: text wins
    expect(summarizeToolResultMessage({ content: [{ type: "text", text: "ok" }, { type: "image" }] })).toBe("ok");

    // REST API error fields: detail and description
    expect(summarizeToolResultMessage({ detail: "rate limit exceeded" })).toBe("rate limit exceeded");
    expect(summarizeToolResultMessage({ description: "invalid API key" })).toBe("invalid API key");
    // detail/description are lower priority than stderr/error
    expect(summarizeToolResultMessage({ error: "auth failed", detail: "see docs" })).toBe("auth failed");

    // error as object with .text field
    expect(summarizeToolResultMessage({ error: { text: "socket hangup" } })).toBe("socket hangup");
    // error as object with .message takes priority over .text
    expect(summarizeToolResultMessage({ error: { message: "timeout", text: "fallback" } })).toBe("timeout");

    // data.message and data.error paths
    expect(summarizeToolResultMessage({ data: { message: "rate limited" } })).toBe("rate limited");
    expect(summarizeToolResultMessage({ data: { error: "quota exceeded" } })).toBe("quota exceeded");

    // Structured error fallback via JSON.stringify when no stable .message exists
    expect(summarizeToolResultMessage({ error: { code: 503, status: "unavailable" } })).toBe('{"code":503,"status":"unavailable"}');

    // errorMessage and error_message fields (common in REST APIs)
    expect(summarizeToolResultMessage({ errorMessage: "not found" })).toBe("not found");
    expect(summarizeToolResultMessage({ error_message: "bad request" })).toBe("bad request");

    // failure field
    expect(summarizeToolResultMessage({ failure: "disk full" })).toBe("disk full");

    // NaN and Infinity are not finite, should fall through
    expect(summarizeToolResultMessage(NaN)).toBe("tool error");
    expect(summarizeToolResultMessage(Infinity)).toBe("tool error");
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

  it("exposes startedAt timestamp in state response and preserves it across resets", async () => {
    const api = createMockApi();
    const before = Date.now();
    register(api);
    const after = Date.now();

    const stateFn = api.handlers.get("@molt/mascot-plugin.state");
    const resetFn = api.handlers.get("@molt/mascot-plugin.reset");

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });

    expect(typeof payload?.state?.startedAt).toBe("number");
    expect(payload.state.startedAt).toBeGreaterThanOrEqual(before);
    expect(payload.state.startedAt).toBeLessThanOrEqual(after);

    const originalStartedAt = payload.state.startedAt;

    // Reset should preserve startedAt (it's static metadata)
    await resetFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.startedAt).toBe(originalStartedAt);
  });

  it("exposes plugin version in state response", async () => {
    const api = createMockApi();
    register(api);

    const stateFn = api.handlers.get("@molt/mascot-plugin.state");
    expect(typeof stateFn).toBe("function");

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });

    expect(payload?.ok).toBe(true);
    // Version should be a non-empty semver-like string from package.json
    expect(typeof payload?.state?.version).toBe("string");
    expect(payload.state.version.length).toBeGreaterThan(0);
    expect(payload.state.version).toMatch(/^\d+\.\d+/);
  });

  it("tracks toolCalls and toolErrors counters", async () => {
    const api = createMockApi({ pluginConfig: { idleDelayMs: 30 } });
    register(api);

    const toolListener = api.listeners.get("tool");
    const stateFn = api.handlers.get("@molt/mascot-plugin.state");
    const resetFn = api.handlers.get("@molt/mascot-plugin.reset");

    let payload: any;

    // Initially zero
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.toolCalls).toBe(0);
    expect(payload?.state?.toolErrors).toBe(0);

    // Start and end a tool successfully — increments toolCalls only
    toolListener({ phase: "start", sessionKey: "s1", tool: "read" });
    toolListener({ phase: "end", sessionKey: "s1", tool: "read", result: { status: "ok" } });

    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.toolCalls).toBe(1);
    expect(payload?.state?.toolErrors).toBe(0);

    // Start and end a tool with error — increments both
    toolListener({ phase: "start", sessionKey: "s1", tool: "exec" });
    toolListener({ phase: "end", sessionKey: "s1", tool: "exec", result: { status: "error", error: "fail" } });

    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.toolCalls).toBe(2);
    expect(payload?.state?.toolErrors).toBe(1);

    // Reset clears counters
    await resetFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.toolCalls).toBe(0);
    expect(payload?.state?.toolErrors).toBe(0);
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

  it("coerceSize returns valid sizes and falls back for invalid values", () => {
    expect(coerceSize("small", "medium")).toBe("small");
    expect(coerceSize("medium", "small")).toBe("medium");
    expect(coerceSize("large", "small")).toBe("large");
    expect(coerceSize("xlarge", "medium")).toBe("xlarge");
    expect(coerceSize("huge", "medium")).toBe("medium");
    expect(coerceSize(42, "medium")).toBe("medium");
    expect(coerceSize(undefined, "large")).toBe("large");
    expect(coerceSize(null, "small")).toBe("small");
  });

  it("coerceAlignment returns valid alignments and falls back for invalid values", () => {
    expect(coerceAlignment("top-left", "bottom-right")).toBe("top-left");
    expect(coerceAlignment("center", "bottom-right")).toBe("center");
    expect(coerceAlignment("bottom-center", "top-left")).toBe("bottom-center");
    expect(coerceAlignment("invalid", "bottom-right")).toBe("bottom-right");
    expect(coerceAlignment(123, "top-right")).toBe("top-right");
    expect(coerceAlignment(undefined, "center-left")).toBe("center-left");
  });

  it("infrastructure error on tool end enters error mode with tool name prefix", async () => {
    const api = createMockApi({ pluginConfig: { errorHoldMs: 100 } });
    register(api);

    const toolListener = api.listeners.get("tool");
    const stateFn = api.handlers.get("@molt/mascot-plugin.state");

    // Start a tool, then end it with an infrastructure error (e.g. timeout, not found)
    toolListener({ phase: "start", sessionKey: "s1", tool: "web_fetch" });
    toolListener({
      phase: "end",
      sessionKey: "s1",
      tool: "web_fetch",
      error: "request timed out",
    });

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("error");
    expect(payload?.state?.lastError?.message).toContain("web_fetch");
    expect(payload?.state?.lastError?.message).toContain("request timed out");
  });

  it("infrastructure error object with .message is displayed correctly", async () => {
    const api = createMockApi({ pluginConfig: { errorHoldMs: 100 } });
    register(api);

    const toolListener = api.listeners.get("tool");
    const stateFn = api.handlers.get("@molt/mascot-plugin.state");

    toolListener({ phase: "start", sessionKey: "s1", tool: "exec" });
    toolListener({
      phase: "end",
      sessionKey: "s1",
      tool: "exec",
      error: { message: "spawn ENOENT" },
    });

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("error");
    expect(payload?.state?.lastError?.message).toContain("spawn ENOENT");
  });

  it("agent end with error code (no message) still enters error mode", async () => {
    const api = createMockApi({ pluginConfig: { errorHoldMs: 100 } });
    register(api);

    const agentListener = api.listeners.get("agent");
    const stateFn = api.handlers.get("@molt/mascot-plugin.state");

    agentListener({ phase: "start", sessionKey: "s1" });
    agentListener({
      phase: "end",
      sessionKey: "s1",
      error: { code: "ECONNRESET" },
    });

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("error");
    expect(payload?.state?.lastError?.message).toContain("ECONNRESET");
  });

  it("non-zero exitCode on content tool triggers error mode", async () => {
    const api = createMockApi({ pluginConfig: { errorHoldMs: 100 } });
    register(api);

    const toolListener = api.listeners.get("tool");
    const stateFn = api.handlers.get("@molt/mascot-plugin.state");

    toolListener({ phase: "start", sessionKey: "s1", tool: "exec" });
    toolListener({
      phase: "end",
      sessionKey: "s1",
      tool: "exec",
      result: { exitCode: 1, stderr: "permission denied" },
    });

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("error");
    expect(payload?.state?.lastError?.message).toContain("permission denied");
  });

  it("zero exitCode on content tool does not trigger error mode", async () => {
    const api = createMockApi({ pluginConfig: { idleDelayMs: 30 } });
    register(api);

    const agentListener = api.listeners.get("agent");
    const toolListener = api.listeners.get("tool");
    const stateFn = api.handlers.get("@molt/mascot-plugin.state");

    agentListener({ phase: "start", sessionKey: "s1" });
    toolListener({ phase: "start", sessionKey: "s1", tool: "exec" });
    toolListener({
      phase: "end",
      sessionKey: "s1",
      tool: "exec",
      result: { exitCode: 0, stdout: "ok" },
    });

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("thinking");
  });

  it("allowedAlignments and allowedSizes are complete", () => {
    expect(allowedAlignments).toContain("top-left");
    expect(allowedAlignments).toContain("bottom-right");
    expect(allowedAlignments).toContain("center");
    expect(allowedAlignments).toHaveLength(9);
    expect(allowedSizes).toEqual(["small", "medium", "large", "xlarge"]);
  });

  it("success: false on tool result triggers error mode", async () => {
    const api = createMockApi({ pluginConfig: { errorHoldMs: 100 } });
    register(api);

    const toolListener = api.listeners.get("tool");
    const stateFn = api.handlers.get("@molt/mascot-plugin.state");

    toolListener({ phase: "start", sessionKey: "s1", tool: "web_fetch" });
    toolListener({
      phase: "end",
      sessionKey: "s1",
      tool: "web_fetch",
      result: { success: false, error: "DNS resolution failed" },
    });

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("error");
    expect(payload?.state?.lastError?.message).toContain("DNS resolution failed");
  });
});
