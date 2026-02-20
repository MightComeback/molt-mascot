import { describe, expect, it } from "bun:test";
import register, { cleanErrorString, truncate, coerceNumber, coerceBoolean, summarizeToolResultMessage, formatDuration, formatBytes, coerceSize, coerceAlignment, allowedAlignments, allowedSizes, successRate, CONTENT_TOOLS, type PluginApi } from "../src/index.ts";

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
    // Weeks
    expect(formatDuration(604800)).toBe("1w");
    expect(formatDuration(691200)).toBe("1w 1d");
    expect(formatDuration(1209600)).toBe("2w");
    expect(formatDuration(1296000)).toBe("2w 1d");
    // Negative clamps to 0
    expect(formatDuration(-5)).toBe("0s");
    // Non-finite values return "0s" instead of crashing
    expect(formatDuration(Infinity)).toBe("0s");
    expect(formatDuration(-Infinity)).toBe("0s");
    expect(formatDuration(NaN)).toBe("0s");
    // Fractional rounds
    expect(formatDuration(59.7)).toBe("1m");
  });

  it("formatBytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1048576)).toBe("1.0 MB");
    expect(formatBytes(1572864)).toBe("1.5 MB");
    expect(formatBytes(1073741824)).toBe("1.0 GB");
    expect(formatBytes(1099511627776)).toBe("1.0 TB");
    // Edge cases
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(NaN)).toBe("0 B");
    expect(formatBytes(Infinity)).toBe("0 B");
  });

  it("successRate", () => {
    expect(successRate(0, 0)).toBeNull();
    expect(successRate(10, 0)).toBe(100);
    expect(successRate(10, 2)).toBe(80);
    expect(successRate(10, 10)).toBe(0);
    expect(successRate(3, 1)).toBe(67);
    // Edge: errorCount > totalCalls (clamped)
    expect(successRate(5, 50)).toBe(0);
    // Edge: negative totalCalls
    expect(successRate(-1, 0)).toBeNull();
    // Edge: undefined/NaN errorCount treated as 0
    expect(successRate(10, NaN)).toBe(100);
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
    expect(cleanErrorString("StopAsyncIteration: exhausted")).toBe("exhausted");
    // Container tools
    expect(cleanErrorString("podman: Error: no such container")).toBe("no such container");
    expect(cleanErrorString("helm: Error: chart not found")).toBe("chart not found");
    // Cloud CLI prefixes
    expect(cleanErrorString("aws: error: no such command")).toBe("no such command");
    expect(cleanErrorString("gcloud: ERROR: permission denied")).toBe("permission denied");
    expect(cleanErrorString("az: command not found")).toBe("command not found");
    expect(cleanErrorString("pip: No matching distribution found")).toBe("No matching distribution found");
    // Cloudflare tooling
    expect(cleanErrorString("wrangler: Error: No account id found")).toBe("No account id found");
    expect(cleanErrorString("workerd: Error: Worker exceeded CPU time limit")).toBe("Worker exceeded CPU time limit");
    expect(cleanErrorString("miniflare: TypeError: fetch failed")).toBe("fetch failed");
    // Deno runtime
    expect(cleanErrorString("deno: error: Module not found")).toBe("Module not found");
    // RPC/gRPC prefixes
    expect(cleanErrorString("rpc: connection refused")).toBe("connection refused");
    expect(cleanErrorString("grpc: deadline exceeded")).toBe("deadline exceeded");
    // Docker/container tools
    expect(cleanErrorString("docker: Error response from daemon: conflict")).toBe("response from daemon: conflict");
    expect(cleanErrorString("kubectl: error: no matching resources found")).toBe("no matching resources found");
    expect(cleanErrorString("terraform: Error: Invalid provider configuration")).toBe("Invalid provider configuration");
    expect(cleanErrorString("ansible: fatal: unreachable host")).toBe("unreachable host");
    // Build tools
    expect(cleanErrorString("make: *** [all] Error 2")).toBe("*** [all] Error 2");
    expect(cleanErrorString("cmake: Error: could not find CMakeLists.txt")).toBe("could not find CMakeLists.txt");
    expect(cleanErrorString("gradle: FAILURE: Build failed with an exception")).toBe("FAILURE: Build failed with an exception");
    expect(cleanErrorString("mvn: BUILD FAILURE")).toBe("BUILD FAILURE");
    // Media tools
    expect(cleanErrorString("ffmpeg: error: codec not found")).toBe("codec not found");
    // Browser automation
    expect(cleanErrorString("browser: timeout waiting for selector")).toBe("timeout waiting for selector");
    expect(cleanErrorString("playwright: Error: page.click: Timeout 30000ms exceeded")).toBe("page.click: Timeout 30000ms exceeded");
    expect(cleanErrorString("chrome: ERR_CONNECTION_REFUSED")).toBe("ERR_CONNECTION_REFUSED");
    expect(cleanErrorString("firefox: NS_ERROR_FAILURE")).toBe("NS_ERROR_FAILURE");
    expect(cleanErrorString("safari: WebDriver error: timeout")).toBe("WebDriver error: timeout");
    // Cloud storage
    expect(cleanErrorString("gsutil: CommandException: No URLs matched")).toBe("CommandException: No URLs matched");
    // Go goroutine stack trace headers
    expect(cleanErrorString("goroutine 1 [running]:\npanic: runtime error: index out of range")).toBe("runtime error: index out of range");
    // Unhandled promise rejection wrapper (Node.js / Deno)
    expect(cleanErrorString("Uncaught (in promise) TypeError: Failed to fetch")).toBe("Failed to fetch");
    expect(cleanErrorString("(in promise) ReferenceError: x is not defined")).toBe("x is not defined");
    expect(cleanErrorString("error: Uncaught (in promise) TypeError: Cannot read properties of null")).toBe("Cannot read properties of null");
    // Compiler / type-checker prefixes
    expect(cleanErrorString("tsc: error TS2304: Cannot find name 'foo'")).toBe("TS2304: Cannot find name 'foo'");
    expect(cleanErrorString("swiftc: error: no such module 'Bar'")).toBe("no such module 'Bar'");
    expect(cleanErrorString("javac: error: class not found: Foo")).toBe("class not found: Foo");
    expect(cleanErrorString("gcc: error: unrecognized option '-foo'")).toBe("unrecognized option '-foo'");
    expect(cleanErrorString("g++: error: missing argument")).toBe("missing argument");
    expect(cleanErrorString("clang: error: linker command failed")).toBe("linker command failed");
    expect(cleanErrorString("clang++: error: no input files")).toBe("no input files");
    expect(cleanErrorString("esbuild: error: Could not resolve 'missing'")).toBe("Could not resolve 'missing'");
    expect(cleanErrorString("vite: error: Build failed")).toBe("Build failed");
    expect(cleanErrorString("zig: error: expected token '}'")).toBe("expected token '}'");
    expect(cleanErrorString("swc: failed to compile module")).toBe("failed to compile module");
    expect(cleanErrorString("biome: lint error in src/index.ts")).toBe("lint error in src/index.ts");
    expect(cleanErrorString("oxlint: 3 errors found")).toBe("3 errors found");
    expect(cleanErrorString("eslint: Unexpected token")).toBe("Unexpected token");
    expect(cleanErrorString("prettier: SyntaxError: Unexpected token")).toBe("Unexpected token");
    expect(cleanErrorString("turbo: error: could not find turbo.json")).toBe("could not find turbo.json");
    expect(cleanErrorString("nx: Cannot find project 'app'")).toBe("Cannot find project 'app'");
    // Package runner prefixes (npx, pnpx, bunx)
    expect(cleanErrorString("npx: command not found")).toBe("command not found");
    expect(cleanErrorString("pnpx: command not found")).toBe("command not found");
    expect(cleanErrorString("bunx: failed to resolve 'missing-pkg'")).toBe("failed to resolve 'missing-pkg'");
    // Ruby/PHP/Perl/Elixir ecosystem
    expect(cleanErrorString("ruby: No such file or directory -- script.rb")).toBe("No such file or directory -- script.rb");
    expect(cleanErrorString("php: Parse error: syntax error")).toBe("Parse error: syntax error");
    expect(cleanErrorString("perl: warning: Setting locale failed")).toBe("Setting locale failed");
    expect(cleanErrorString("elixir: ** (CompileError) lib/app.ex:1")).toBe("** (CompileError) lib/app.ex:1");
    expect(cleanErrorString("mix: Could not find task 'phx.server'")).toBe("Could not find task 'phx.server'");
    expect(cleanErrorString("bundle: command not found: rails")).toBe("command not found: rails");
    expect(cleanErrorString("gem: ERROR: While executing gem")).toBe("While executing gem");
    // Swift runtime
    expect(cleanErrorString("swift: error: no such module 'Foundation'")).toBe("no such module 'Foundation'");
    // .NET CLI
    expect(cleanErrorString("dotnet: error: Project file does not exist")).toBe("Project file does not exist");
    // Python ecosystem tools (pip3, uv, poetry, conda, etc.)
    expect(cleanErrorString("pip3: No matching distribution found for foo")).toBe("No matching distribution found for foo");
    expect(cleanErrorString("uv: error: No solution found")).toBe("No solution found");
    expect(cleanErrorString("uvx: error: Package 'missing' not found")).toBe("Package 'missing' not found");
    expect(cleanErrorString("poetry: command not found")).toBe("command not found");
    expect(cleanErrorString("pdm: No matching version found")).toBe("No matching version found");
    expect(cleanErrorString("rye: error: failed to download")).toBe("failed to download");
    expect(cleanErrorString("hatch: error: Environment 'test' not found")).toBe("Environment 'test' not found");
    expect(cleanErrorString("conda: PackagesNotFoundError: missing")).toBe("missing");
    expect(cleanErrorString("mamba: error: libmamba Could not solve")).toBe("libmamba Could not solve");
    expect(cleanErrorString("pixi: error: No task named 'build'")).toBe("No task named 'build'");
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

    // err field (shorthand used by some tools)
    expect(summarizeToolResultMessage({ err: "connection reset" })).toBe("connection reset");

    // status: 'failed' triggers isError detection (tested via plugin error mode, but also verify summary)
    expect(summarizeToolResultMessage({ status: "failed", message: "build broke" })).toBe("build broke");

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

  it("exposes activeAgents and activeTools counts in state response", async () => {
    const api = createMockApi({ pluginConfig: { idleDelayMs: 30 } });
    register(api);

    const agentListener = api.listeners.get("agent");
    const toolListener = api.listeners.get("tool");
    const stateFn = api.handlers.get("@molt/mascot-plugin.state");
    const resetFn = api.handlers.get("@molt/mascot-plugin.reset");

    let payload: any;

    // Initially zero
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.activeAgents).toBe(0);
    expect(payload?.state?.activeTools).toBe(0);

    // Start an agent — activeAgents increments
    agentListener({ phase: "start", sessionKey: "s1" });
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.activeAgents).toBe(1);
    expect(payload?.state?.activeTools).toBe(0);

    // Start a tool — activeTools increments
    toolListener({ phase: "start", sessionKey: "s1", tool: "exec" });
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.activeAgents).toBe(1);
    expect(payload?.state?.activeTools).toBe(1);

    // Start a nested tool — activeTools increments again
    toolListener({ phase: "start", sessionKey: "s1", tool: "read" });
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.activeTools).toBe(2);

    // End one tool — activeTools decrements
    toolListener({ phase: "end", sessionKey: "s1", tool: "read", result: { status: "ok" } });
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.activeTools).toBe(1);

    // End agent — activeAgents decrements, tool stack cleared
    agentListener({ phase: "end", sessionKey: "s1" });
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.activeAgents).toBe(0);
    expect(payload?.state?.activeTools).toBe(0);

    // Reset clears counters
    agentListener({ phase: "start", sessionKey: "s2" });
    toolListener({ phase: "start", sessionKey: "s2", tool: "web_search" });
    await resetFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.activeAgents).toBe(0);
    expect(payload?.state?.activeTools).toBe(0);
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

  it("agent end with error.detail or error.description enters error mode", async () => {
    const api = createMockApi({ pluginConfig: { errorHoldMs: 100 } });
    register(api);

    const agentListener = api.listeners.get("agent");
    const stateFn = api.handlers.get("@molt/mascot-plugin.state");

    // error.detail (common in REST API error payloads)
    agentListener({ phase: "start", sessionKey: "s1" });
    agentListener({
      phase: "end",
      sessionKey: "s1",
      error: { detail: "rate limit exceeded" },
    });

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("error");
    expect(payload?.state?.lastError?.message).toContain("rate limit exceeded");

    // Wait for error hold to expire before next test
    await new Promise((r) => setTimeout(r, 120));

    // error.description (common in OAuth/API error responses)
    agentListener({ phase: "start", sessionKey: "s2" });
    agentListener({
      phase: "end",
      sessionKey: "s2",
      error: { description: "invalid API key" },
    });

    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("error");
    expect(payload?.state?.lastError?.message).toContain("invalid API key");
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

  it("status: 'failed' on tool result triggers error mode", async () => {
    const api = createMockApi({ pluginConfig: { errorHoldMs: 100 } });
    register(api);

    const toolListener = api.listeners.get("tool");
    const stateFn = api.handlers.get("@molt/mascot-plugin.state");

    toolListener({ phase: "start", sessionKey: "s1", tool: "web_fetch" });
    toolListener({
      phase: "end",
      sessionKey: "s1",
      tool: "web_fetch",
      result: { status: "failed", message: "timeout after 30s" },
    });

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("error");
    expect(payload?.state?.lastError?.message).toContain("timeout after 30s");
  });

  it("isError: true on tool result triggers error mode", async () => {
    const api = createMockApi({ pluginConfig: { errorHoldMs: 100 } });
    register(api);

    const toolListener = api.listeners.get("tool");
    const stateFn = api.handlers.get("@molt/mascot-plugin.state");

    toolListener({ phase: "start", sessionKey: "s1", tool: "exec" });
    toolListener({
      phase: "end",
      sessionKey: "s1",
      tool: "exec",
      result: { isError: true, error: "permission denied" },
    });

    let payload: any;
    await stateFn({}, { respond: (_ok: boolean, data: any) => (payload = data) });
    expect(payload?.state?.mode).toBe("error");
    expect(payload?.state?.lastError?.message).toContain("permission denied");
  });

  it("successRate", () => {
    expect(successRate(100, 5)).toBe(95);
    expect(successRate(10, 3)).toBe(70);
    expect(successRate(1, 1)).toBe(0);
    expect(successRate(1, 0)).toBe(100);
    // Zero/negative/null/undefined totalCalls returns null
    expect(successRate(0, 0)).toBe(null);
    expect(successRate(-1, 0)).toBe(null);
    // Clamps errorCount to totalCalls (can't have more errors than calls)
    expect(successRate(5, 10)).toBe(0);
    // Null/undefined errorCount treated as 0
    expect(successRate(10, null as any)).toBe(100);
    expect(successRate(10, undefined as any)).toBe(100);
  });

  it("CONTENT_TOOLS is a non-empty ReadonlySet containing core tools", () => {
    expect(CONTENT_TOOLS).toBeInstanceOf(Set);
    expect(CONTENT_TOOLS.size).toBeGreaterThan(0);
    // Verify core tools are present
    for (const tool of ["read", "write", "edit", "exec", "web_fetch", "browser", "image"]) {
      expect(CONTENT_TOOLS.has(tool)).toBe(true);
    }
    // Verify both dash and underscore variants are included for aliased tools
    expect(CONTENT_TOOLS.has("video_frames")).toBe(true);
    expect(CONTENT_TOOLS.has("video-frames")).toBe(true);
    expect(CONTENT_TOOLS.has("coding_agent")).toBe(true);
    expect(CONTENT_TOOLS.has("coding-agent")).toBe(true);
  });
});
