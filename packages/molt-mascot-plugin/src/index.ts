import pkg from "../package.json";

// Single source of truth: keep runtime id aligned with package.json name.
// (Avoids subtle mismatches if the package is renamed.)
export const id = pkg.name as string;
export const version = pkg.version;

export type Mode = "idle" | "thinking" | "tool" | "error";

export type Size = "small" | "medium" | "large";

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

const allowedAlignments: NonNullable<PluginConfig["alignment"]>[] = [
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

const allowedSizes: Size[] = ["small", "medium", "large"];

function coerceSize(v: unknown, fallback: Size): Size {
  if (typeof v === "string" && (allowedSizes as string[]).includes(v)) {
    return v as Size;
  }
  return fallback;
}

function coerceAlignment(
  v: unknown,
  fallback: NonNullable<PluginConfig["alignment"]>
): NonNullable<PluginConfig["alignment"]> {
  if (typeof v === "string" && (allowedAlignments as string[]).includes(v)) {
    return v as NonNullable<PluginConfig["alignment"]>;
  }
  return fallback;
}

export function truncate(str: string, limit = 140): string {
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
 * Common error prefixes to strip for cleaner display.
 * Organized by category for maintainability.
 * Exported so the Electron renderer can reuse the same list (single source of truth).
 */
export const ERROR_PREFIXES = [
  // Generic patterns
  "[a-zA-Z0-9_]*Error",
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
  // JavaScript/TypeScript built-in errors
  "TypeError",
  "ReferenceError",
  "SyntaxError",
  "EvalError",
  "RangeError",
  "URIError",
  "AggregateError",
  // Runtime/System errors
  "TimeoutError",
  "SystemError",
  "AssertionError",
  "AbortError",
  "CancellationError",
  // Environment/Tool prefixes
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
  "pnpm:",
  "yarn:",
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
  "kubectl:",
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
  "go:",
  "rustc:",
  "cargo:",
  // Browser automation
  "browser:",
  "playwright:",
  "chrome:",
  "firefox:",
  "safari:",
  // OpenClaw specific
  "cron:",
  "nodes:",
  // Domain-specific errors
  "GitError",
  "GraphQLError",
  "ProtocolError",
  "IPCError",
  "RuntimeError",
  "BrowserError",
  "CanvasError",
  "ExecError",
  "SpawnError",
  "ShellError",
  "NetworkError",
  "BroadcastError",
  "PermissionError",
  "SecurityError",
  "AuthError",
  "ForbiddenError",
  "EvaluationError",
  "GatewayError",
  "FetchError",
  "ClawdError",
  "OpenClawError",
  "AgentSkillError",
  "PluginError",
  "RpcError",
  "MoltError",
  "MoltMascotError",
  // AI Provider errors
  "AnthropicError",
  "OpenAIError",
  "OllamaError",
  "DeepSeekError",
  "GoogleGenerativeAIError",
  "GaxiosError",
  "AxiosError",
  "ProviderError",
  // Service errors
  "PerplexityError",
  "SonarError",
  "BraveError",
  "BunError",
  "RateLimitError",
  "ValidationError",
  "ZodError",
  // Integration errors
  "LinearError",
  "GitHubError",
  "TelegramError",
  "DiscordError",
  "SlackError",
  "SignalError",
  "WhatsAppError",
  "BlueBubblesError",
  "BirdError",
  "ClawdHubError",
  "GeminiError",
  "GogError",
  "NotionError",
  "PeekabooError",
  "SummarizeError",
  "VideoFramesError",
  "SkillCreatorError",
  "CodingAgentError",
  "WeatherError",
  "McpError",
  // Network/IO errors
  "WebSocketError",
  "SocketError",
  "CronError",
  "ConnectionError",
  "RequestError",
  "ResponseError",
  // Database errors
  "DatabaseError",
  "SqlError",
  "PrismaError",
  "MongoError",
  "RedisError",
  // Python-style errors
  "ValueError",
  "KeyError",
  "IndexError",
  "AttributeError",
  "NameError",
  "ImportError",
  "ModuleNotFoundError",
];

/** Build the error prefix regex once for performance. */
export const ERROR_PREFIX_REGEX = new RegExp(
  `^(?:${ERROR_PREFIXES.join("|")})(\\s*:\\s*|\\s+)`,
  "i"
);

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
    // CSI sequences: ESC [ ... <final>
    // Full match per ANSI: ESC [ parameters intermediates final-byte
    // (final byte is in the range @-~; not just letters)
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    // OSC sequences: ESC ] ... BEL  OR  ESC ] ... ESC \
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "")
    .trim();
  /* eslint-enable no-control-regex */

  // Iteratively strip error prefixes (handles nested prefixes like "Error: Tool failed: msg")
  let prev = "";
  while (str !== prev) {
    prev = str;
    str = str.replace(ERROR_PREFIX_REGEX, "").trim();
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

  const blocks = msg?.content;
  if (Array.isArray(blocks)) {
    const text = blocks
      .map((b) => (typeof b?.text === "string" ? b.text : ""))
      .filter(Boolean)
      .join("\n");
    if (text.trim()) return truncate(cleanErrorString(text));
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

  const state: State = {
    mode: "idle",
    since: Date.now(),
    alignment,
    clickThrough,
    hideText,
    padding,
    opacity,
    size,
  };

  let idleTimer: any = null;
  let errorTimer: any = null;

  // Defensive bookkeeping: tool calls can be nested; don't flicker tool→thinking→tool.
  const activeAgents = new Set<string>();
  // Map sessionKey -> stack of tool names to handle cleanup and nested tools (e.g. sessions_spawn -> read)
  const agentToolStacks = new Map<string, string[]>();
  // Track recency so we can show the most recently-active tool when multiple sessions are running tools.
  const agentLastToolTs = new Map<string, number>();

  // Some tools (read/write/web_fetch/etc) can legitimately return strings containing
  // "error:" without that implying the tool itself failed. For these tools we avoid
  // text-sniffing and rely on explicit failure signals (status/exitCode/etc).
  const contentTools = new Set<string>([
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
    "tts",
    // multi_tool_use.parallel becomes just "parallel" after prefix stripping
    "parallel",
    // Linear integration via hakky-tools
    "hakky-tools",
  ]);

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
    respond(true, { ok: true, state });
  });

  const resetInternalState = () => {
    state.mode = "idle";
    state.since = Date.now();
    delete state.lastError;
    delete state.currentTool;
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
          ? err.message || err.text || err.code || (typeof err.error === "string" ? err.error : "") || ""
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
