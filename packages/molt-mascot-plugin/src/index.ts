export const id = "@molt/mascot-plugin";

export type Mode = "idle" | "thinking" | "tool" | "error";

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
};

export type State = {
  mode: Mode;
  since: number;
  lastError?: { message: string; ts: number };
  alignment?: string;
  clickThrough?: boolean;
  hideText?: boolean;
  currentTool?: string;
};

export function coerceNumber(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
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
 * Remove common error prefixes to save space on the pixel display.
 * e.g. "Error: Tool failed: File not found" -> "File not found"
 */
export function cleanErrorString(s: string): string {
  // Strip ANSI escape codes (colors, cursor moves, etc)
  // eslint-disable-next-line no-control-regex
  let str = s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").trim();
  let prev = "";
  while (str !== prev) {
    prev = str;
    str = str.replace(/^([a-zA-Z0-9_]*Error|Tool failed|Command failed|Exception|Warning|Alert|Fatal|panic|TypeError|ReferenceError|SyntaxError|EvalError|RangeError|URIError|AggregateError|TimeoutError|SystemError|AssertionError|AbortError|CancellationError|node:|fs:|process:|internal:|commonjs:|bun:|sh:|bash:|zsh:|git:|curl:|wget:|npm:|pnpm:|yarn:|hakky:|hakky-tools:|clawd:|clawdbot:|rpc:|grpc:|deno:|docker:|kubectl:|terraform:|ansible:|make:|cmake:|gradle:|mvn:|ffmpeg:|python:|python3:|go:|rustc:|cargo:|browser:|playwright:|chrome:|firefox:|safari:|uncaughtException|Uncaught|GitError|GraphQLError|ProtocolError|IPCError|RuntimeError|BrowserError|CanvasError|ExecError|SpawnError|ShellError|NetworkError|BroadcastError|PermissionError|SecurityError|EvaluationError|GatewayError|FetchError|ClawdError|AgentSkillError|PluginError|RpcError|MoltError|MoltMascotError|AnthropicError|OpenAIError|OllamaError|DeepSeekError|GoogleGenerativeAIError|GaxiosError|AxiosError|ProviderError|PerplexityError|SonarError|BraveError|BunError|RateLimitError|ValidationError|ZodError|LinearError|GitHubError|TelegramError|DiscordError|SlackError|SignalError|WhatsAppError|BlueBubblesError|McpError|WebSocketError|SocketError|ValueError|KeyError|IndexError|AttributeError|NameError|ImportError|ModuleNotFoundError)(\s*:\s*|\s+)/i, "").trim();
  }
  // Take only the first line to avoid dumping stack traces into the pixel display
  const lines = str.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);

  // UX Improvement: If we have multiple lines, scan for the most relevant error line.
  // This extracts "Error: Failed" from logs that might start with "info: starting..."
  if (lines.length > 1) {
    // If first line is a generic exit code, always look deeper
    if (/^Command (exited|failed) with (exit )?code \d+$/.test(lines[0])) {
      return cleanErrorString(lines[1]);
    }
    
    // Check if any line (other than the first) looks like a strong error signal.
    // We look for common error prefixes (case-insensitive).
    const errorLine = lines.find(l => /^(error|fatal|panic|exception|traceback|failed)/i.test(l));
    if (errorLine && errorLine !== lines[0]) {
      return cleanErrorString(errorLine);
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
export default function register(api: any) {
  // Prefer the validated per-plugin config injected by Clawdbot.
  // Fallback: read from the global config using this plugin's id.
  // Robustness fix: also check "molt-mascot" short alias if the canonical ID yields no config.
  const pluginId = typeof api?.id === "string" ? api.id : id;
  let cfg: PluginConfig =
    api?.pluginConfig ?? api?.config?.plugins?.entries?.[pluginId]?.config;

  if (!cfg && pluginId === id) {
    // Try short aliases that users likely typed
    cfg =
      api?.config?.plugins?.entries?.["molt-mascot"]?.config ??
      api?.config?.plugins?.entries?.["moltMascot"]?.config;
  }
  
  if (!cfg) cfg = {};

  const idleDelayMs = Math.max(0, coerceNumber(cfg.idleDelayMs, 800));
  const errorHoldMs = Math.max(0, coerceNumber(cfg.errorHoldMs, 5000));
  // Allow client to handle defaults if not explicitly configured on the server
  const alignment = cfg.alignment;
  const clickThrough = cfg.clickThrough;
  const hideText = cfg.hideText;

  const state: State = { mode: "idle", since: Date.now(), alignment, clickThrough, hideText };

  let idleTimer: any = null;
  let errorTimer: any = null;

  // Defensive bookkeeping: tool calls can be nested; don't flicker tool→thinking→tool.
  const activeAgents = new Set<string>();
  // Map sessionKey -> depth to handle cleanup if an agent crashes/ends while tool is open
  const agentToolDepths = new Map<string, number>();

  const getToolDepth = () => {
    let inputs = 0;
    for (const d of agentToolDepths.values()) inputs += d;
    return inputs;
  };

  const getSessionKey = (event: any) =>
    event?.sessionKey ?? event?.sessionId ?? event?.id ?? "unknown";

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
    agentToolDepths.clear();
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
      "molt-mascot plugin: api.on() is unavailable; mascot state will not track agent/tool lifecycle"
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
        agentToolDepths.clear();
      }
      
      activeAgents.add(sessionKey);

      // Auto-heal: ensure this agent starts fresh
      agentToolDepths.set(sessionKey, 0);

      // Force update to reflect new state immediately
      const mode = resolveNativeMode();
      setMode(mode);
    };

    const onToolStart = async (event: any) => {
      clearIdleTimer();
      // If we are starting a tool, we probably want to clear any old error to show progress?
      // But syncModeFromCounters handles the override logic.
      const key = getSessionKey(event);
      agentToolDepths.set(key, (agentToolDepths.get(key) || 0) + 1);

      const rawName = typeof event?.tool === "string" ? event.tool : "";
      if (rawName) {
        state.currentTool = rawName.replace(/^default_api:/, "");
      }
      syncModeFromCounters();
    };

    const onToolEnd = async (event: any) => {
      clearIdleTimer();
      const key = getSessionKey(event);
      const d = agentToolDepths.get(key) || 0;
      if (d > 0) agentToolDepths.set(key, d - 1);

      if (getToolDepth() === 0) delete state.currentTool;

      // Check for tool errors (capture exit codes or explicit error fields)
      // "event.error" handles infrastructure failures (timeout, not found)
      // "event.result" handles tool-level failures (runtime errors)
      const infraError = event?.error;
      const msg = event?.result ?? event?.output ?? event?.data;
      let rawToolName = typeof event?.tool === "string" ? event.tool : "tool";
      // UX: Remove verbose default_api: prefix for compact display
      rawToolName = rawToolName.replace(/^default_api:/, "");

      // Truncate tool name if it's absurdly long to save space on the pixel display
      const toolName =
        rawToolName.length > 20
          ? rawToolName.slice(0, 17) + "..."
          : rawToolName;

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
      const isContentTool = ["read", "web_fetch", "memory_get", "memory_search", "browser", "canvas"].includes(rawToolName);
      
      const textSniffing = !isContentTool && 
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
      agentToolDepths.delete(sessionKey);

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

    // Helper to ensure we capture sessionKey from the envelope if missing in payload
    const mergeEnvelope = (envelope: any, payload: any) => {
      if (!payload) return envelope;
      // If payload is just a string/primitive, we can't attach properties easily without wrapping
      if (typeof payload !== "object") return payload;
      
      // If payload already has the key, use it. Otherwise, borrow from envelope.
      if (!payload.sessionKey && envelope.sessionKey) {
        return { ...payload, sessionKey: envelope.sessionKey };
      }
      return payload;
    };

    // Wrappers for v2 events to ensure we handle both envelope (v2) and payload (internal) styles
    const handleAgentEvent = (e: any) => {
      const p = mergeEnvelope(e, e?.payload || e);
      if (p?.phase === "start") onAgentStart(p);
      else if (p?.phase === "end" || p?.phase === "result" || p?.phase === "error") onAgentEnd(p);
    };

    const handleToolEvent = (e: any) => {
      const p = mergeEnvelope(e, e?.payload || e);
      // Support both v1 (stream) and v2 (phase) event formats
      if (p?.phase === "start" || p?.phase === "call" || p?.stream === "call") onToolStart(p);
      else if (p?.phase === "end" || p?.phase === "result" || p?.stream === "result") onToolEnd(p);
    };

    const registerListeners = () => {
      // Modern hooks (v2)
      if (typeof on === "function") {
        on("agent", handleAgentEvent);
        on("tool", handleToolEvent);
      }
    };

    const unregisterListeners = () => {
      if (typeof off === "function") {
        off("agent", handleAgentEvent);
        off("tool", handleToolEvent);
      }
    };

    registerListeners();

    // Attach cleanup to the stop method (closure captures unregisterListeners)
    api.registerService?.({
      // Keep service id aligned with the runtime plugin id (avoid config/entry mismatches).
      id: pluginId,
      start: () => api?.logger?.info?.(`${pluginId} plugin ready`),
      stop: () => {
        clearIdleTimer();
        clearErrorTimer();
        unregisterListeners();
        // Reset published state on shutdown so clients don't show a stale mode.
        setMode("idle");
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
      clearIdleTimer();
      clearErrorTimer();
      setMode("idle");
    },
  });
}
