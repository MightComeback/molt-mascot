export const id = "molt-mascot";

type Mode = "idle" | "thinking" | "tool" | "error";

type PluginConfig = {
  idleDelayMs?: number;
  errorHoldMs?: number;
};

type State = {
  mode: Mode;
  since: number;
  lastError?: { message: string; ts: number };
};

function coerceNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function summarizeToolResultMessage(msg: any): string {
  const blocks = msg?.content;
  if (Array.isArray(blocks)) {
    const text = blocks
      .map((b) => (typeof b?.text === "string" ? b.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text) return text.slice(0, 400);
  }
  if (typeof msg?.errorMessage === "string" && msg.errorMessage.trim()) return msg.errorMessage.trim().slice(0, 400);
  if (typeof msg?.error === "string" && msg.error.trim()) return msg.error.trim().slice(0, 400);
  if (typeof msg?.message === "string" && msg.message.trim()) return msg.message.trim().slice(0, 400);
  return "tool error";
}

export default function register(api: any) {
  // Prefer the validated per-plugin config injected by Clawdbot.
  // Fallback: read from the global config using this plugin's id.
  const pluginId = typeof api?.id === "string" ? api.id : "molt-mascot";
  const cfg: PluginConfig =
    api?.pluginConfig ?? api?.config?.plugins?.entries?.[pluginId]?.config ?? {};

  const idleDelayMs = Math.max(0, coerceNumber(cfg.idleDelayMs, 800));
  const errorHoldMs = Math.max(0, coerceNumber(cfg.errorHoldMs, 5000));

  const state: State = { mode: "idle", since: Date.now() };

  let idleTimer: any = null;
  let errorTimer: any = null;

  // Defensive bookkeeping: tool calls can be nested; don't flicker tool→thinking→tool.
  let agentRunning = false;
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
      mode === "error" ? (extra?.lastError ?? state.lastError) : (extra?.lastError ?? undefined);

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
    else delete (state as any).lastError;

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
    return agentRunning ? "thinking" : "idle";
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

  // Expose current simplified state to WS clients.
  // Primary (recommended) name follows the pluginId.action convention.
  api.registerGatewayMethod?.(`${pluginId}.state`, (_params: any, { respond }: any) => {
    respond(true, { ok: true, state });
  });

  // Ensure legacy IDs are available if the user is using the new scoped ID.
  if (pluginId !== "molt-mascot") {
    api.registerGatewayMethod?.("molt-mascot.state", (_params: any, { respond }: any) => {
      respond(true, { ok: true, state });
    });
  }

  // Back-compat alias for early adopters.
  api.registerGatewayMethod?.("moltMascot.state", (_params: any, { respond }: any) => {
    respond(true, { ok: true, state });
  });

  const on = api?.on;
  if (typeof on !== "function") {
    api?.logger?.warn?.(
      "molt-mascot plugin: api.on() is unavailable; mascot state will not track agent/tool lifecycle"
    );
  } else {
    on("before_agent_run", async () => {
      // Clear timers to prevent flapping
      clearIdleTimer();
      clearErrorTimer();
      agentRunning = true;
      // Force update to reflect new state immediately
      const mode = resolveNativeMode();
      setMode(mode);
    });

    on("before_tool_use", async () => {
      clearIdleTimer();
      // If we are starting a tool, we probably want to clear any old error to show progress?
      // But syncModeFromCounters handles the override logic.
      toolDepth++;
      syncModeFromCounters();
    });

    on("after_tool_use", async () => {
      clearIdleTimer();
      // Do NOT clear error timer here, let syncMode determine if we stick with error.
      toolDepth--;
      clampToolDepth();
      syncModeFromCounters();
    });

    on("after_agent_run", async (event: any) => {
      agentRunning = false;

      const err = event?.error;
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
      if (msg.trim()) {
        enterError(msg.trim());
        return;
      }
      if (event?.success === false) {
        enterError("agent ended unsuccessfully");
        return;
      }
      syncModeFromCounters();
    });

    on("tool_result", (event: any) => {
      const msg = event?.result;
      const toolName = typeof event?.tool === "string" ? event.tool : "tool";
      // Support both isError boolean and status string
      const isError = msg?.isError === true || msg?.status === "error";
      if (isError) {
        const detail = summarizeToolResultMessage(msg);
        enterError(`${toolName} error: ${detail}`);
        // Do not sync counters here; let the error stick until active work resumes or timeout
      }
    });
  }

  api.registerService?.({
    // Keep service id aligned with the runtime plugin id (avoid config/entry mismatches).
    id: pluginId,
    start: () => api?.logger?.info?.(`${pluginId} plugin ready`),
    stop: () => {
      clearIdleTimer();
      clearErrorTimer();
      // Reset published state on shutdown so clients don't show a stale mode.
      setMode("idle");
    },
  });
}
