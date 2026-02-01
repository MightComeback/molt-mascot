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
};

export type State = {
  mode: Mode;
  since: number;
  lastError?: { message: string; ts: number };
};

function coerceNumber(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function truncate(str: string, limit = 140): string {
  const s = str.trim();
  if (s.length <= limit) return s;
  // If limit is too small to fit ellipsis, just truncate hard
  if (limit <= 3) return s.slice(0, limit);
  return s.slice(0, limit - 3) + "...";
}

/**
 * Remove common error prefixes to save space on the pixel display.
 * e.g. "Error: Tool failed: File not found" -> "File not found"
 */
function cleanErrorString(s: string): string {
  // Strip ANSI escape codes (colors, cursor moves, etc)
  // eslint-disable-next-line no-control-regex
  let str = s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").trim();
  let prev = "";
  while (str !== prev) {
    prev = str;
    str = str.replace(/^(Error|Tool failed|Exception|Warning|Alert|Fatal|panic|TypeError|ReferenceError|SyntaxError|EvalError|RangeError|URIError|AggregateError|TimeoutError|SystemError|AssertionError|node:|bun:|uncaughtException|Uncaught|GitError|GraphQLError|ProtocolError|IPCError)(\s*:\s*|\s+)/i, "").trim();
  }
  // Take only the first line to avoid dumping stack traces into the pixel display
  const lines = str.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  // If first line is a generic exit code, and we have a second line, use the second.
  if (lines.length > 1 && /^Command exited with code \d+$/.test(lines[0])) {
    return lines[1];
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
function summarizeToolResultMessage(msg: any): string {
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
    msg?.stderr,
    msg?.failure,
    msg?.details,
    // Handle string error or object error with message
    typeof msg?.error === "string" ? msg.error : msg?.error?.message,
    typeof msg?.error === "object" ? msg?.error?.text : undefined,
    msg?.text,
    msg?.message,
    msg?.result,
    msg?.output,
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
  const pluginId = typeof api?.id === "string" ? api.id : id;
  const cfg: PluginConfig =
    api?.pluginConfig ?? api?.config?.plugins?.entries?.[pluginId]?.config ?? {};

  const idleDelayMs = Math.max(0, coerceNumber(cfg.idleDelayMs, 800));
  const errorHoldMs = Math.max(0, coerceNumber(cfg.errorHoldMs, 5000));

  const state: State = { mode: "idle", since: Date.now() };

  let idleTimer: any = null;
  let errorTimer: any = null;

  // Defensive bookkeeping: tool calls can be nested; don't flicker tool→thinking→tool.
  let activeAgentCount = 0;
  let toolDepth = 0;

  const clampToolDepth = () => {
    if (!Number.isFinite(toolDepth) || toolDepth < 0) toolDepth = 0;
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

    api?.logger?.info?.(`${pluginId}: state mode=${mode}`);
  };

  const scheduleIdle = (delayMs = idleDelayMs) => {
    // If we're currently showing an error, don't let the idle timer override it.
    if (state.mode === "error") return;

    clearIdleTimer();
    idleTimer = setTimeout(() => setMode("idle"), Math.max(0, delayMs));
  };

  const resolveNativeMode = (): Mode => {
    clampToolDepth();
    if (toolDepth > 0) return "tool";
    return activeAgentCount > 0 ? "thinking" : "idle";
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
    toolDepth = 0;
    activeAgentCount = 0;
    clearIdleTimer();
    clearErrorTimer();
  };

  // Manual reset override (useful for debugging or ghost states).
  registerAlias("reset", (_params: any, { respond }: any) => {
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
    const onAgentStart = async () => {
      // Clear timers to prevent flapping
      clearIdleTimer();
      clearErrorTimer();
      activeAgentCount++;

      // Auto-heal: a new run shouldn't have pending tools from the past
      if (activeAgentCount === 1) toolDepth = 0;

      // Force update to reflect new state immediately
      const mode = resolveNativeMode();
      setMode(mode);
    };

    const onToolStart = async () => {
      clearIdleTimer();
      // If we are starting a tool, we probably want to clear any old error to show progress?
      // But syncModeFromCounters handles the override logic.
      toolDepth++;
      syncModeFromCounters();
    };

    const onToolEnd = async (event: any) => {
      clearIdleTimer();
      toolDepth--;
      clampToolDepth();

      // Check for tool errors (capture exit codes or explicit error fields)
      // "event.error" handles infrastructure failures (timeout, not found)
      // "event.result" handles tool-level failures (runtime errors)
      const infraError = event?.error;
      const msg = event?.result ?? event?.output ?? event?.data;
      const toolName = typeof event?.tool === "string" ? event.tool : "tool";

      if (infraError) {
        const detail = typeof infraError === "string" ? infraError : infraError.message || infraError.code || "unknown error";
        enterError(truncate(`${toolName}: ${detail}`));
        return;
      }

      const hasExitCode = typeof msg?.exitCode === "number";
      const isExitError = hasExitCode && msg.exitCode !== 0;
      const isExplicitError =
        msg?.isError === true ||
        msg?.status === "error" ||
        msg?.status === "failed" ||
        (typeof msg?.error === "string" && msg.error.trim().length > 0) ||
        (typeof msg === "string" && /^\s*error:/i.test(msg)) ||
        (typeof msg === "string" && /Command exited with code [1-9]/.test(msg));

      const isError = hasExitCode ? isExitError : isExplicitError;

      if (isError) {
        const detail = summarizeToolResultMessage(msg);
        enterError(truncate(`${toolName} error: ${detail}`));
      } else {
        syncModeFromCounters();
      }
    };

    const onAgentEnd = async (event: any) => {
      activeAgentCount--;
      if (activeAgentCount < 0) activeAgentCount = 0;

      // Safety: ensure toolDepth is reset if NO agents are running (catch-all for crashed tools)
      if (activeAgentCount === 0) {
        toolDepth = 0;
      }

      const err = event?.error;
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
      if (msg.trim()) {
        // UX Polish: strip common error prefixes for the tiny pixel display
        const clean = cleanErrorString(msg);
        enterError(truncate(clean));
        return;
      }
      if (event?.success === false) {
        enterError("agent ended unsuccessfully");
        return;
      }
      syncModeFromCounters();
    };

    const registerListeners = () => {
      // Modern hooks (v2)
      on("agent:start", onAgentStart);
      on("tool:call", onToolStart);
      on("tool:result", onToolEnd);
      on("agent:end", onAgentEnd);
    };

    const unregisterListeners = () => {
      if (typeof off === "function") {
        off("agent:start", onAgentStart);
        off("tool:call", onToolStart);
        off("tool:result", onToolEnd);
        off("agent:end", onAgentEnd);
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
