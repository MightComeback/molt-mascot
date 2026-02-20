import pkg from "../package.json";

// Single source of truth: keep runtime id aligned with package.json name.
// (Avoids subtle mismatches if the package is renamed.)
export const id = pkg.name as string;
export const version = pkg.version;

export type Mode = "idle" | "thinking" | "tool" | "error";

export type Size = "small" | "medium" | "large" | "xlarge";

export type PluginConfig = {
  idleDelayMs?: number;
  errorHoldMs?: number;
  alignment?:
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right"
    | "top-center"
    | "bottom-center"
    | "center-left"
    | "center-right"
    | "center";
  clickThrough?: boolean;
  hideText?: boolean;
  padding?: number;
  opacity?: number;
  size?: Size;
};

export type State = {
  mode: Mode;
  since: number;
  lastError?: { message: string; ts: number };
  alignment?: PluginConfig["alignment"];
  clickThrough?: boolean;
  hideText?: boolean;
  padding?: number;
  opacity?: number;
  size?: Size;
  currentTool?: string;
  version?: string;
  /** Cumulative count of tool invocations since plugin start. */
  toolCalls?: number;
  /** Cumulative count of tool errors since plugin start. */
  toolErrors?: number;
  /** Epoch ms when the plugin was registered (for uptime calculation). */
  startedAt?: number;
  /** Number of currently active agent sessions (helps diagnose stuck thinking state). */
  activeAgents?: number;
  /** Number of currently in-flight tool calls across all sessions (helps diagnose stuck tool state). */
  activeTools?: number;
};

// Plugin API contract definition for better type safety
export interface PluginApi {
  id?: string;
  pluginConfig?: PluginConfig;
  config?: {
    plugins?: {
      entries?: Record<string, { config?: any }>;
    };
  };
  logger?: {
    info?: (msg: string) => void;
    warn?: (msg: string) => void;
    error?: (msg: string) => void;
  };
  registerGatewayMethod?: (method: string, handler: any) => void;
  registerService?: (service: {
    id: string;
    start?: () => void;
    stop?: () => void;
  }) => void;
  on?: (event: string, handler: (data: any) => void) => void | (() => void);
  off?: (event: string, handler: (data: any) => void) => void;
}

export function coerceNumber(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function coerceBoolean(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
    if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  }
  return fallback;
}

export const allowedAlignments: NonNullable<PluginConfig["alignment"]>[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "top-center",
  "bottom-center",
  "center-left",
  "center-right",
  "center",
];

export const allowedSizes: Size[] = ["small", "medium", "large", "xlarge"];

export function coerceSize(v: unknown, fallback: Size): Size {
  if (typeof v === "string" && (allowedSizes as string[]).includes(v)) {
    return v as Size;
  }
  return fallback;
}

export function coerceAlignment(
  v: unknown,
  fallback: NonNullable<PluginConfig["alignment"]>
): NonNullable<PluginConfig["alignment"]> {
  if (typeof v === "string" && (allowedAlignments as string[]).includes(v)) {
    return v as NonNullable<PluginConfig["alignment"]>;
  }
  return fallback;
}

/**
 * Compute a success-rate percentage from total calls and error count.
 * Returns null if totalCalls is 0 (avoids division by zero).
 *
 * @param totalCalls - Total number of calls
 * @param errorCount - Number of errors
 * @returns Integer percentage (0-100), or null if no calls
 */
export function successRate(totalCalls: number, errorCount: number): number | null {
  if (!totalCalls || totalCalls <= 0) return null;
  const errors = Math.max(0, Math.min(errorCount || 0, totalCalls));
  return Math.round(((totalCalls - errors) / totalCalls) * 100);
}

export function truncate(str: string, limit = 140): string {
  if (limit <= 0) return "";
  // Collapse whitespace/newlines to single spaces for cleaner display
  const s = str.trim().replace(/\s+/g, " ");
  // Use iterator to handle surrogate pairs (unicode-safe)
  const chars = [...s];
  if (chars.length <= limit) return s;
  // If limit is too small to fit ellipsis, just truncate hard
  if (limit <= 1) return chars.slice(0, limit).join("");

  // Basic truncate
  let cut = chars.slice(0, limit - 1).join("");
  // Try to cut at space if reasonably close (last 20 chars) to avoid chopping words
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > -1 && cut.length - lastSpace < 20) {
    cut = cut.slice(0, lastSpace);
  }

  return cut + "…";
}

/**
 * Format a byte count into a compact human-readable string with appropriate unit.
 * e.g. 0 → "0 B", 1023 → "1023 B", 1536 → "1.5 KB", 1048576 → "1.0 MB"
 * Uses binary units (1 KB = 1024 bytes) consistent with OS conventions.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  for (const unit of units) {
    value /= 1024;
    if (value < 1024 || unit === "TB") {
      return `${value.toFixed(1)} ${unit}`;
    }
  }
  return `${value.toFixed(1)} TB`;
}

/**
 * Format a duration in seconds into a compact human-readable string.
 * e.g. 45 → "45s", 90 → "1m 30s", 3661 → "1h 1m", 90000 → "1d 1h"
 * Exported so the Electron renderer can reuse the same implementation (single source of truth).
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0s";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  if (d < 7) return remH > 0 ? `${d}d ${remH}h` : `${d}d`;
  const w = Math.floor(d / 7);
  const remD = d % 7;
  return remD > 0 ? `${w}w ${remD}d` : `${w}w`;
}

/**
 * Common error prefixes to strip for cleaner display.
 * Organized by category for maintainability.
 * Exported so the Electron renderer can reuse the same list (single source of truth).
 */
export const ERROR_PREFIXES = [
  // Generic catch-all: matches TypeError, ReferenceError, SyntaxError, CustomError, etc.
  // All specific *Error entries are redundant with this pattern and have been removed.
  "[a-zA-Z0-9_]*Error",
  // Java/JVM-style: java.lang.NullPointerException, kotlin.KotlinNullPointerException, etc.
  // Also handles .NET: System.InvalidOperationException, System.IO.FileNotFoundException, etc.
  "(?:[a-zA-Z_][a-zA-Z0-9_]*\\.)+[a-zA-Z_][a-zA-Z0-9_]*(?:Error|Exception|Fault)",
  // Generic non-Error prefixes
  "Tool failed",
  "Command failed",
  "Exception",
  "Warning",
  "Alert",
  "Fatal",
  "panic",
  "uncaughtException",
  "Uncaught",
  // Log-level prefixes (parity with renderer cleanErrorString)
  "info",
  "debug",
  "trace",
  "warn",
  // Python non-Error exceptions (not matched by *Error pattern)
  "StopIteration",
  "StopAsyncIteration",
  "KeyboardInterrupt",
  "SystemExit",
  "GeneratorExit",
  // Java/JVM "Caused by:" chained exception prefix
  "Caused by",
  // Environment/Tool colon-prefixes
  "node:",
  "fs:",
  "process:",
  "internal:",
  "commonjs:",
  "bun:",
  "sh:",
  "bash:",
  "zsh:",
  // CLI tools
  "git:",
  "curl:",
  "wget:",
  "npm:",
  "npx:",
  "pnpm:",
  "pnpx:",
  "yarn:",
  "bunx:",
  "hakky:",
  "hakky-tools:",
  "clawd:",
  "clawdbot:",
  "openclaw:",
  // Protocol/API prefixes
  "rpc:",
  "grpc:",
  "deno:",
  // Infrastructure tools
  "docker:",
  "podman:",
  "kubectl:",
  "helm:",
  "terraform:",
  "ansible:",
  "make:",
  "cmake:",
  "gradle:",
  "mvn:",
  // Media/Processing tools
  "ffmpeg:",
  "python:",
  "python3:",
  "ruby:",
  "php:",
  "perl:",
  "elixir:",
  "mix:",
  "bundle:",
  "gem:",
  "go:",
  "rustc:",
  "cargo:",
  // Compilers / type-checkers
  "tsc:",
  "swiftc:",
  "javac:",
  "gcc:",
  "g\\+\\+:",
  "clang:",
  "clang\\+\\+:",
  "zig:",
  "esbuild:",
  "vite:",
  "swift:",
  "swc:",
  "biome:",
  "oxlint:",
  "eslint:",
  "prettier:",
  "turbo:",
  "nx:",
  // Browser automation
  "browser:",
  "playwright:",
  "chrome:",
  "firefox:",
  "safari:",
  // .NET CLI
  "dotnet:",
  // Cloud CLIs
  "aws:",
  "gcloud:",
  "az:",
  "gsutil:",
  "pip:",
  "wrangler:",
  "miniflare:",
  "workerd:",
  // OpenClaw specific
  "cron:",
  "nodes:",
];

/** Build the error prefix regex once for performance. */
export const ERROR_PREFIX_REGEX = new RegExp(
  `^(?:${ERROR_PREFIXES.join("|")})(\\s*:\\s*|\\s+)`,
  "i"
);

// Regex constants used in the iterative prefix-stripping loop inside cleanErrorString.
// Hoisted to module level so they're compiled once rather than on every function call.
const ERRNO_REGEX = /^E[A-Z]{2,}(?:_[A-Z]+)*\s*:\s*/;
const NODE_ERR_CODE_REGEX = /^\[ERR_[A-Z_]+\]\s*:\s*/;
const GO_RUNTIME_REGEX = /^runtime(?:\/\w+)?:\s+/i;
const IN_PROMISE_REGEX = /^\(in promise\)\s*/i;

/**
 * Remove common error prefixes to save space on the pixel display.
 * e.g. "Error: Tool failed: File not found" -> "File not found"
 */
export function cleanErrorString(s: string): string {
  // Performance guard: truncate huge outputs before regex processing
  if (s.length > 4096) s = s.slice(0, 4096);

  // Strip ANSI escape codes (colors, cursor moves, etc)
  /* eslint-disable no-control-regex */
  let str = s
    // CSI sequences: ESC [ ... <final>  OR  8-bit CSI (0x9B) ... <final>
    // Full match per ANSI: ESC [ parameters intermediates final-byte
    // (final byte is in the range @-~; not just letters)
    .replace(/(?:\x1B\[|\x9B)[0-?]*[ -/]*[@-~]/g, "")
    // OSC sequences: ESC ] ... BEL  OR  ESC ] ... ESC \
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "")
    .trim();
  /* eslint-enable no-control-regex */

  // Strip leading ISO-8601 timestamps commonly found in log output.
  // e.g. "[2026-02-17T15:30:00Z] Error: ..." or "2026-02-17T15:30:00.123Z Error: ..."
  str = str
    .replace(/^\[?\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\]?\s*[-:]?\s*/i, "")
    .trim();

  // Strip leading file-path:line:col prefixes common in Node/Bun stack traces.
  // e.g. "/Users/foo/bar.js:42:10: TypeError: ..." → "TypeError: ..."
  // Also handles Windows paths: "C:\foo\bar.js:42: Error: ..." → "Error: ..."
  // And file:// URLs: "file:///Users/foo/bar.js:42: Error: ..." → "Error: ..."
  str = str
    .replace(/^(?:file:\/\/)?(?:\/[\w./-]+|[A-Z]:\\[\w.\\-]+):\d+(?::\d+)?[:\s]+/, "")
    .trim();

  // Strip trailing " at <path>:<line>:<col>" suffixes from flattened stack traces.
  // e.g. "Cannot find module 'foo' at /app/index.js:10:5" → "Cannot find module 'foo'"
  str = str
    .replace(/\s+at\s+(?:[\w.<>[\]]+\s+)?\(?(?:\/[\w./-]+|[A-Z]:\\[\w.\\-]+|file:\/\/[\w./-]+):\d+(?::\d+)?\)?$/, "")
    .trim();

  // Rust panics: extract the message from panic output.
  // Old format (pre-1.73): thread 'main' panicked at 'msg', file:line:col
  // New format (1.73+):    thread 'main' panicked at src/main.rs:42:5:\nmsg
  str = str
    .replace(/^thread\s+'[^']*'\s+panicked\s+at\s+'([^']+)'(?:,\s*\S+:\d+(?::\d+)?)?$/i, "$1")
    .trim();
  // New Rust format: "thread '...' panicked at <path>:<line>:<col>:\n<message>"
  str = str
    .replace(/^thread\s+'[^']*'\s+panicked\s+at\s+\S+:\d+(?::\d+)?:\s*/i, "")
    .trim();

  // Clean POSIX signal descriptions: strip the trailing signal number for brevity.
  // e.g. "Killed: 9" → "Killed", "Segmentation fault: 11" → "Segmentation fault"
  // These are common on macOS/Linux when processes are killed by signals.
  str = str
    .replace(/^(Killed|Segmentation fault|Abort trap|Bus error|Illegal instruction|Floating point exception|Hangup|Alarm clock|Terminated|Broken pipe|User defined signal [12]):\s*\d+$/i, "$1")
    .trim();

  // Strip bracketed log-level prefixes common in structured loggers.
  // e.g. "[ERROR] connection refused" → "connection refused"
  // Also handles residual "ERROR] ..." left after ISO timestamp stripping.
  str = str
    .replace(/^\[?(ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE|FATAL|PANIC|CRIT(?:ICAL)?)\]\s*:?\s*/i, "")
    .trim();

  // Iteratively strip error prefixes and POSIX errno codes.
  // Handles nested prefixes like "Error: Tool failed: ENOENT: no such file"
  // Regex constants (ERRNO_REGEX, NODE_ERR_CODE_REGEX, GO_RUNTIME_REGEX, IN_PROMISE_REGEX)
  // are hoisted to module level for performance.
  let prev = "";
  while (str !== prev) {
    prev = str;
    str = str.replace(ERROR_PREFIX_REGEX, "").trim();
    str = str.replace(ERRNO_REGEX, "").trim();
    str = str.replace(NODE_ERR_CODE_REGEX, "").trim();
    str = str.replace(GO_RUNTIME_REGEX, "").trim();
    str = str.replace(IN_PROMISE_REGEX, "").trim();
  }
  // Take only the first line to avoid dumping stack traces into the pixel display
  const lines = str.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);

  // UX Improvement: If we have multiple lines, scan for the most relevant error line.
  // This extracts "Error: Failed" from logs that might start with "info: starting..."
  if (lines.length > 1) {
    // If first line is a generic exit code, always look deeper
    if (/^Command (exited|failed) with (exit )?code \d+(?:\b|:)/i.test(lines[0])) {
      return cleanErrorString(lines[1]);
    }
    
    // Check if any line (other than the first) looks like a strong error signal.
    // Prefer concrete failure lines over generic traceback headers.
    const concreteErrorLine = lines.find(
      (l) => /^(error|fatal|panic|exception|failed|denied|rejected|[a-zA-Z]+Error\b)/i.test(l)
    );
    if (concreteErrorLine && concreteErrorLine !== lines[0]) {
      return cleanErrorString(concreteErrorLine);
    }

    // Python tracebacks often put the useful error on the final line.
    const tracebackLine = lines.find((l) => /^traceback\b/i.test(l));
    if (tracebackLine && lines[lines.length - 1] !== tracebackLine) {
      return cleanErrorString(lines[lines.length - 1]);
    }

    // Go goroutine stack traces: skip "goroutine N [running]:" headers
    // and extract the panic message from the preceding or following line.
    if (/^goroutine\s+\d+\s+\[/i.test(lines[0])) {
      // The useful message is typically further down; recurse on remaining lines
      return cleanErrorString(lines.slice(1).join("\n"));
    }
  }

  return lines[0] || str;
}

/**
 * Extract a short, human-readable summary from a tool result.
 * Strategies:
 * 1. Simple strings are used directly.
 * 2. Block content (Anthropic style) is joined.
 * 3. Error fields are prioritized (stderr, error object).
 *
 * @param msg - The raw result object or string from the tool.
 * @returns A truncated string suitable for the pixel display (max 140 chars).
 */
export function summarizeToolResultMessage(msg: any): string {
  if (typeof msg === "string" && msg.trim()) return truncate(cleanErrorString(msg));

  // Some tools legitimately return primitives (numbers/booleans/null) — treat them as displayable.
  // (Without this, we fall through to the generic "tool error".)
  if (typeof msg === "number" && Number.isFinite(msg)) {
    return truncate(String(msg));
  }
  if (typeof msg === "boolean") {
    return truncate(String(msg));
  }
  if (msg === null) {
    return "null";
  }
  if (msg === undefined) {
    return "undefined";
  }

  // Top-level arrays: join text elements for a compact summary.
  // Some tools (e.g. memory_search, agents_list) return arrays directly.
  if (Array.isArray(msg)) {
    const texts = msg
      .map((item) =>
        typeof item === "string"
          ? item
          : typeof item?.text === "string"
          ? item.text
          : typeof item?.name === "string"
          ? item.name
          : typeof item?.title === "string"
          ? item.title
          : null
      )
      .filter(Boolean);
    if (texts.length > 0) return truncate(cleanErrorString(texts.join(", ")));
    if (msg.length === 0) return "empty";
    // Fall through to object inspection below
  }

  const blocks = msg?.content;
  if (Array.isArray(blocks)) {
    const text = blocks
      .map((b) => (typeof b?.text === "string" ? b.text : ""))
      .filter(Boolean)
      .join("\n");
    if (text.trim()) return truncate(cleanErrorString(text));
    // Non-text content blocks (e.g. image, audio) — describe by type rather than "tool error"
    if (blocks.length > 0) {
      const types = [...new Set(blocks.map((b) => b?.type).filter(Boolean))];
      if (types.length > 0) return truncate(types.join(", "));
    }
  } else if (typeof blocks === "string" && blocks.trim()) {
    return truncate(cleanErrorString(blocks));
  }

  // Prioritize explicit error messages over generic content when reporting errors
  // Skip generic "Command exited with code N" messages to prefer stderr/details
  const candidates = [
    msg?.errorMessage,
    msg?.error_message,
    msg?.err,
    msg?.stderr,
    msg?.failure,
    msg?.details,
    // Handle string error or object error with message
    typeof msg?.error === "string" ? msg.error : msg?.error?.message,
    typeof msg?.error === "object" ? msg?.error?.text : undefined,
    msg?.detail,
    msg?.description,
    msg?.message,
    msg?.text,
    msg?.result,
    msg?.output,
    msg?.stdout,
    msg?.data?.text,
    typeof msg?.data === "string" ? msg.data : undefined,
    typeof msg?.data === "object" ? (msg?.data?.message ?? msg?.data?.error) : undefined,
  ];

  let genericFallback: string | null = null;

  for (const c of candidates) {
    // String candidates
    if (typeof c === "string" && c.trim()) {
      const s = cleanErrorString(c);

      // If it's just the generic exit code message, skip it for now unless it's the only thing we have
      if (s.match(/^Command exited with code \d+$/)) {
        if (!genericFallback) genericFallback = s;
        continue;
      }

      return truncate(s);
    }
  }

  if (genericFallback) return truncate(genericFallback);

  // Last-resort: attempt to stringify structured error payloads.
  // Some tools return `{ error: { ... } }` or `{ data: { ... } }` without a stable `.message`.
  if (msg && typeof msg === "object") {
    const toTry = [msg.error, msg.data, msg.result];
    for (const v of toTry) {
      if (!v || typeof v !== "object") continue;
      try {
        const json = JSON.stringify(v);
        if (typeof json === "string" && json !== "{}") {
          return truncate(cleanErrorString(json));
        }
      } catch {
        // ignore
      }
    }
  }

  if (typeof msg === "object" && typeof msg?.exitCode === "number") {
    return `exit code ${msg.exitCode}`;
  }

  return "tool error";
}

/**
 * Tools that return raw content (like 'read') can contain "error:" in the text
 * without actually failing. For these tools we disable text-sniffing for errors
 * and rely on explicit failure signals (status/exitCode/success/isError).
 *
 * Exported so consumers can check membership or extend the list.
 */
export const CONTENT_TOOLS: ReadonlySet<string> = new Set([
  "read",
  "write",
  "edit",
  "exec",
  "web_fetch",
  "web_search",
  "memory_get",
  "memory_search",
  "browser",
  "canvas",
  "sessions_history",
  "sessions_list",
  "agents_list",
  "session_status",
  "sessions_spawn",
  "sessions_send",
  "tts",
  "cron",
  "nodes",
  "process",
  "gateway",
  "message",
  "slack",
  "gog",
  "github",
  "notion",
  "gemini",
  "bird",
  "bluebubbles",
  "clawdhub",
  "peekaboo",
  "summarize",
  "video_frames",
  "video-frames",
  "weather",
  "skill_creator",
  "skill-creator",
  "coding_agent",
  "coding-agent",
  "image",
  // multi_tool_use.parallel becomes just "parallel" after prefix stripping
  "parallel",
  // Linear integration via hakky-tools
  "hakky-tools",
]);

/**
 * Initialize the molt-mascot plugin.
 * Sets up the state machine, event listeners for tool/agent lifecycle,
 * and exposes the .state and .reset methods to the Gateway.
 */
export default function register(api: PluginApi) {
  // Prefer the validated per-plugin config injected by OpenClaw.
  // Fallback: read from the global config using this plugin's id.
  // Robustness fix: also check common aliases because users often configure plugins
  // under a short name (e.g. "molt-mascot") even when the runtime id is canonical.
  const pluginId = typeof api?.id === "string" ? api.id : id;

  let cfg: PluginConfig | undefined = api?.pluginConfig;

  if (!cfg) {
    const entries = api?.config?.plugins?.entries;
    const keysToTry = [
      pluginId,
      id,
      "@molt/mascot-plugin",
      "molt-mascot",
      "moltMascot",
      "molt-mascot-plugin",
      "moltMascotPlugin",
    ];

    for (const key of keysToTry) {
      const c = entries?.[key]?.config;
      if (c) {
        cfg = c;
        break;
      }
    }
  }

  if (!cfg) cfg = {};

  const idleDelayMs = Math.max(0, coerceNumber(cfg.idleDelayMs, 800));
  const errorHoldMs = Math.max(0, coerceNumber(cfg.errorHoldMs, 5000));

  // Provide stable defaults server-side so the Electron app can render consistently
  // even when the user hasn't explicitly configured the plugin.
  const alignment = coerceAlignment(cfg.alignment, "bottom-right");
  const clickThrough = coerceBoolean(cfg.clickThrough, false);
  const hideText = coerceBoolean(cfg.hideText, false);

  // Padding must be >= 0
  const paddingNum = coerceNumber(cfg.padding, 24);
  const padding = paddingNum >= 0 ? paddingNum : 24;

  // Opacity must be 0-1 (allow strings too, via coerceNumber)
  const opacityNum = coerceNumber(cfg.opacity, 1);
  const opacity = opacityNum >= 0 && opacityNum <= 1 ? opacityNum : 1;

  const size = coerceSize(cfg.size, "medium");

  const startedAt = Date.now();

  const state: State = {
    mode: "idle",
    since: startedAt,
    alignment,
    clickThrough,
    hideText,
    padding,
    opacity,
    size,
    version,
    toolCalls: 0,
    toolErrors: 0,
    startedAt,
  };

  let idleTimer: any = null;
  let errorTimer: any = null;

  // Defensive bookkeeping: tool calls can be nested; don't flicker tool→thinking→tool.
  const activeAgents = new Set<string>();
  // Map sessionKey -> stack of tool names to handle cleanup and nested tools (e.g. sessions_spawn -> read)
  const agentToolStacks = new Map<string, string[]>();
  // Track recency so we can show the most recently-active tool when multiple sessions are running tools.
  const agentLastToolTs = new Map<string, number>();

  const contentTools = CONTENT_TOOLS;

  const getToolDepth = () => {
    let inputs = 0;
    for (const stack of agentToolStacks.values()) inputs += stack.length;
    return inputs;
  };

  const getSessionKey = (event: any) => {
    // Normalize to a string to avoid accidental Set/Map key splits (e.g. 123 vs "123")
    // and to handle gateways that emit numeric ids.
    const raw =
      event?.sessionKey ??
      event?.sessionId ??
      // Prefer *stable* identifiers so tool nesting works; per-request ids cause stack flicker.
      event?.agentSessionKey ??
      event?.agentSessionId ??
      event?.agentId ??
      event?.agentKey;

    if (typeof raw === "string" && raw.trim()) return raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
    return "unknown";
  };

  const recalcCurrentTool = () => {
    // Pick the most recently-active tool across all sessions.
    // Map iteration is insertion-ordered, so without this we can show a stale tool when two agents overlap.
    let found: string | undefined;
    let bestTs = -1;

    for (const [sessionKey, stack] of agentToolStacks.entries()) {
      if (!stack || stack.length === 0) continue;
      const ts = agentLastToolTs.get(sessionKey) ?? 0;
      if (ts >= bestTs) {
        bestTs = ts;
        found = stack[stack.length - 1];
      }
    }

    if (found) {
      state.currentTool = found
        .replace(/^default_api:/, "")
        .replace(/^functions\./, "")
        .replace(/^multi_tool_use\./, "");
    } else {
      delete state.currentTool;
    }
  };

  const clearIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };

  const clearErrorTimer = () => {
    if (errorTimer) clearTimeout(errorTimer);
    errorTimer = null;
  };

  const setMode = (mode: Mode, extra?: Partial<State>) => {
    // Only keep lastError while we're actually in error mode (avoids a "sticky" error indicator).
    const nextLastError =
      mode === "error" ? (extra?.lastError ?? state.lastError) : undefined;

    const modeUnchanged = state.mode === mode;
    const lastErrorUnchanged =
      (state.lastError?.message ?? "") === (nextLastError?.message ?? "") &&
      (state.lastError?.ts ?? 0) === (nextLastError?.ts ?? 0);

    if (modeUnchanged && lastErrorUnchanged) return;

    // Leaving error mode should cancel the hold timer.
    if (state.mode === "error" && mode !== "error") {
      clearErrorTimer();
    }

    state.mode = mode;
    state.since = Date.now();
    if (nextLastError) state.lastError = nextLastError;
    else delete state.lastError;

    // UX polish: currentTool is only meaningful while we're actively in tool mode.
    // Clear it whenever we leave tool mode to avoid a stale tool name lingering
    // if an end event was missed or state transitions happen out of order.
    if (mode !== "tool") {
      delete state.currentTool;
    }

    api?.logger?.info?.(`${pluginId}: state mode=${mode}`);
  };

  const scheduleIdle = (delayMs = idleDelayMs) => {
    // If we're currently showing an error, don't let the idle timer override it.
    if (state.mode === "error") return;

    clearIdleTimer();
    idleTimer = setTimeout(() => setMode("idle"), Math.max(0, delayMs));
  };

  const resolveNativeMode = (): Mode => {
    if (getToolDepth() > 0) return "tool";
    return activeAgents.size > 0 ? "thinking" : "idle";
  };

  const syncModeFromCounters = () => {
    const target = resolveNativeMode();
    // If we are in error mode, do not auto-switch to thinking/idle to preserve the error message.
    // However, if we enter a NEW tool, we override the error to show the tool working.
    if (state.mode === "error" && target !== "tool") return;

    if (target === "idle") scheduleIdle();
    else setMode(target);
  };

  const enterError = (message: string) => {
    api?.logger?.warn?.(`${pluginId}: entering error mode: ${message}`);
    clearIdleTimer();
    clearErrorTimer();
    state.toolErrors = (state.toolErrors ?? 0) + 1;

    setMode("error", { lastError: { message, ts: Date.now() } });

    errorTimer = setTimeout(() => {
      // Upon expiration, revert to the correct state based on current counters.
      if (state.mode === "error") {
        const target = resolveNativeMode();
        if (target === "idle") setMode("idle");
        else setMode(target);
      }
    }, errorHoldMs);
  };

  // Helper to register methods and common aliases
  const registerAlias = (method: string, handler: any) => {
    // Primary registration
    api.registerGatewayMethod?.(`${pluginId}.${method}`, handler);

    // Aliases (avoid duplicates if pluginId overlaps)
    const aliases = new Set([
      "molt-mascot-plugin",
      "molt-mascot",
      "moltMascot",
      "moltMascotPlugin",
      "@molt/mascot-plugin",
    ]);
    aliases.delete(pluginId); // Don't re-register self

    for (const alias of aliases) {
      api.registerGatewayMethod?.(`${alias}.${method}`, handler);
    }
  };

  // Expose current simplified state to WS clients.
  registerAlias("state", (_params: any, { respond }: any) => {
    // Populate dynamic counters (not stored persistently, computed on demand).
    state.activeAgents = activeAgents.size;
    state.activeTools = getToolDepth();
    respond(true, { ok: true, state });
  });

  const resetInternalState = () => {
    state.mode = "idle";
    state.since = Date.now();
    delete state.lastError;
    delete state.currentTool;
    // Preserve version and startedAt through resets (static metadata, not runtime state).
    state.toolCalls = 0;
    state.toolErrors = 0;
    state.activeAgents = 0;
    state.activeTools = 0;
    agentToolStacks.clear();
    agentLastToolTs.clear();
    activeAgents.clear();
    clearIdleTimer();
    clearErrorTimer();
  };

  // Manual reset override (useful for debugging or ghost states).
  registerAlias("reset", (_params: any, { respond }: any) => {
    api?.logger?.info?.(`${pluginId}: manual reset triggered`);
    resetInternalState();
    respond(true, { ok: true, state });
  });

  const on = api?.on;
  const off = api?.off;

  if (typeof on !== "function") {
    api?.logger?.warn?.(
      `${pluginId} plugin: api.on() is unavailable; mascot state will not track agent/tool lifecycle`
    );
  } else {
    // Keep references to handlers for cleanup
    const onAgentStart = async (event: any) => {
      // Clear timers to prevent flapping
      clearIdleTimer();
      clearErrorTimer();
      
      const sessionKey = getSessionKey(event);
      
      // Auto-heal: prevent stale agents from accumulating indefinitely
      if (activeAgents.size > 10) {
        activeAgents.clear();
        agentToolStacks.clear();
        agentLastToolTs.clear();
        delete state.currentTool;
      }
      
      activeAgents.add(sessionKey);

      // Auto-heal: ensure this agent starts fresh
      agentToolStacks.set(sessionKey, []);
      agentLastToolTs.set(sessionKey, 0);

      // Force update to reflect new state immediately
      const mode = resolveNativeMode();
      setMode(mode);
    };

    const onToolStart = async (event: any) => {
      clearIdleTimer();
      // New tool activity should immediately override any previous error hold.
      // (The error timer won't flip modes if we're no longer in error, but clearing it avoids stale timers.)
      clearErrorTimer();
      const key = getSessionKey(event);
      const stack = agentToolStacks.get(key) || [];

      const rawName =
        typeof event?.tool === "string"
          ? event.tool
          : typeof event?.toolName === "string"
          ? event.toolName
          : typeof event?.name === "string"
          ? event.name
          : "";

      const toolName = rawName || "tool";
      stack.push(toolName);
      agentToolStacks.set(key, stack);
      agentLastToolTs.set(key, Date.now());
      state.toolCalls = (state.toolCalls ?? 0) + 1;

      // Always update currentTool on tool start, even if the event didn't provide a name.
      state.currentTool = toolName
        .replace(/^default_api:/, "")
        .replace(/^functions\./, "")
        .replace(/^multi_tool_use\./, "");

      syncModeFromCounters();
    };

    const onToolEnd = async (event: any) => {
      clearIdleTimer();
      const key = getSessionKey(event);
      const stack = agentToolStacks.get(key) || [];
      if (stack.length > 0) stack.pop();
      // Update the map (optional if reference is same, but good for clarity)
      agentToolStacks.set(key, stack);
      agentLastToolTs.set(key, Date.now());

      recalcCurrentTool();

      // Check for tool errors (capture exit codes or explicit error fields)
      // "event.error" handles infrastructure failures (timeout, not found)
      // "event.result" handles tool-level failures (runtime errors)
      const infraError = event?.error;
      // Some Gateway event envelopes carry primitive results under `payload`.
      // After mergeEnvelope(), that primitive ends up at `event.payload`.
      const msg = event?.result ?? event?.output ?? event?.data ?? event?.payload;
      
      // Extract tool name with fallbacks, preserving order of preference
      const toolFromEvent = event?.tool ?? event?.toolName ?? event?.name;
      const rawToolName = typeof toolFromEvent === "string" ? toolFromEvent : "";
      
      // UX: Remove verbose prefixes for compact display
      const toolName = rawToolName
        .replace(/^default_api:/, "")
        .replace(/^functions\./, "")
        .replace(/^multi_tool_use\./, "")
        // Truncate tool name if absurdly long to save space on the pixel display
        .slice(0, 20);

      if (infraError) {
        const detail = typeof infraError === "string" ? infraError : infraError.message || infraError.code || "unknown error";
        enterError(truncate(`${toolName}: ${detail}`));
        return;
      }

      const hasExitCode = typeof msg?.exitCode === "number";
      const isExitError = hasExitCode && msg.exitCode !== 0;

      // Tools that return raw content (like 'read') can contain "error:" in the text
      // without actually failing. For these, we disable text-sniffing for errors
      // unless an explicit error field is present.
      const isContentTool = contentTools.has(rawToolName);

      const textSniffing =
        !isContentTool &&
        ((typeof msg === "string" && /^\s*error:/i.test(msg)) ||
          (typeof msg === "string" && /Command exited with code [1-9]\d*/.test(msg)));

      const isExplicitError =
        msg?.isError === true ||
        msg?.success === false ||
        msg?.status === "error" ||
        msg?.status === "failed" ||
        (typeof msg?.error === "string" && msg.error.trim().length > 0) ||
        textSniffing;

      const isError = hasExitCode ? isExitError : isExplicitError;

      if (isError) {
        const detail = summarizeToolResultMessage(msg);
        const text =
          detail === "tool error"
            ? `${toolName} failed`
            : `${toolName}: ${detail}`;
        enterError(truncate(text));
      } else {
        syncModeFromCounters();
      }
    };

    const onAgentEnd = async (event: any) => {
      const sessionKey = getSessionKey(event);
      activeAgents.delete(sessionKey);
      agentToolStacks.delete(sessionKey);
      agentLastToolTs.delete(sessionKey);

      // If the ending agent was the source of the current tool, we need to update
      recalcCurrentTool();

      const err = event?.error;
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : typeof err === "object" && err
          ? err.message || err.text || err.detail || err.description || err.code || (typeof err.error === "string" ? err.error : "") || ""
          : "";

      if (String(msg).trim()) {
        // UX Polish: strip common error prefixes for the tiny pixel display
        const clean = cleanErrorString(msg);
        enterError(truncate(clean));
        return;
      }
      if (event?.phase === "error" || event?.success === false) {
        enterError("Task failed");
        return;
      }
      syncModeFromCounters();
    };

    // Helper to ensure we capture sessionKey from the envelope if missing in payload.
    // Important: preserve envelope fields (phase/tool/etc) even when payload is primitive.
    const mergeEnvelope = (envelope: any, payload: any) => {
      if (payload == null) return envelope;

      // If payload is just a string/primitive, we can't attach properties to it.
      // Preserve the envelope (phase/tool/sessionKey) and keep the raw payload under `payload`.
      if (typeof payload !== "object") {
        return { ...envelope, payload };
      }

      // Merge envelope + payload, preferring payload fields, but backfilling sessionKey.
      const merged = { ...envelope, ...payload };

      // Backfill session identifiers from the envelope when missing in the payload.
      // Some Gateway versions use sessionId instead of sessionKey.
      const missingId = (v: any) =>
        v === undefined ||
        v === null ||
        (typeof v === "string" && v.trim().length === 0);

      if (missingId(merged.sessionKey) && !missingId(envelope?.sessionKey)) {
        merged.sessionKey = envelope.sessionKey;
      }
      if (missingId(merged.sessionId) && !missingId(envelope?.sessionId)) {
        merged.sessionId = envelope.sessionId;
      }

      // Normalize: if we only have sessionId, treat it as sessionKey for our bookkeeping.
      if (missingId(merged.sessionKey) && !missingId(merged.sessionId)) {
        merged.sessionKey = merged.sessionId;
      }

      return merged;
    };

    // Wrappers for v2 events to ensure we handle both envelope (v2) and payload (internal) styles
    const handleAgentEvent = (e: any) => {
      const payload = e && typeof e === "object" && "payload" in e ? (e as any).payload : e;
      const p = mergeEnvelope(e, payload);
      if (p?.phase === "start") onAgentStart(p);
      else if (p?.phase === "end" || p?.phase === "result" || p?.phase === "error") onAgentEnd(p);
    };

    const handleToolEvent = (e: any) => {
      const payload = e && typeof e === "object" && "payload" in e ? (e as any).payload : e;
      const p = mergeEnvelope(e, payload);
      // Support both v1 (stream) and v2 (phase) event formats
      if (p?.phase === "start" || p?.phase === "call" || p?.stream === "call") onToolStart(p);
      else if (
        p?.phase === "end" ||
        p?.phase === "result" ||
        p?.phase === "error" ||
        p?.stream === "result" ||
        p?.stream === "error"
      )
        onToolEnd(p);
    };

    // Some event emitters return an unsubscribe function from `on()`.
    // Prefer that when `off()` is unavailable so we can still clean up on plugin stop.
    let unsubAgent: undefined | (() => void);
    let unsubTool: undefined | (() => void);

    const registerListeners = () => {
      // Modern hooks (v2)
      if (typeof on === "function") {
        const maybeUnsubAgent = on("agent", handleAgentEvent);
        const maybeUnsubTool = on("tool", handleToolEvent);

        if (typeof maybeUnsubAgent === "function") unsubAgent = maybeUnsubAgent;
        if (typeof maybeUnsubTool === "function") unsubTool = maybeUnsubTool;
      }
    };

    const unregisterListeners = () => {
      if (typeof off === "function") {
        off("agent", handleAgentEvent);
        off("tool", handleToolEvent);
      }

      // Fallback: if we got unsubscribe fns from `on()`, call them too (idempotent).
      try {
        unsubAgent?.();
      } finally {
        unsubAgent = undefined;
      }
      try {
        unsubTool?.();
      } finally {
        unsubTool = undefined;
      }
    };

    registerListeners();

    // Attach cleanup to the stop method (closure captures unregisterListeners)
    api.registerService?.({
      // Keep service id aligned with the runtime plugin id (avoid config/entry mismatches).
      id: pluginId,
      start: () => api?.logger?.info?.(`${pluginId} plugin ready`),
      stop: () => {
        // Reset published state on shutdown so clients don't show stale tool/error data.
        // (e.g. currentTool persisting after plugin reload)
        resetInternalState();
        unregisterListeners();
      },
    });
    return; // Stop execution here, registerService was called above
  }

  // Fallback if no events (just register service without listeners)
  api.registerService?.({
    // Keep service id aligned with the runtime plugin id (avoid config/entry mismatches).
    id: pluginId,
    start: () => api?.logger?.info?.(`${pluginId} plugin ready (no events)`),
    stop: () => {
      // Reset published state on shutdown so clients don't show stale tool/error data.
      resetInternalState();
    },
  });
}
