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

  const clearIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };

  const clearErrorTimer = () => {
    if (errorTimer) clearTimeout(errorTimer);
    errorTimer = null;
  };

  const setMode = (mode: Mode, extra?: Partial<State>) => {
    const nextLastError = extra?.lastError ?? state.lastError;
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

    api?.logger?.info?.({ mode }, "moltMascot: state");
  };

  const scheduleIdle = (delayMs = idleDelayMs) => {
    // If we're currently showing an error, don't let the idle timer override it.
    if (state.mode === "error") return;

    clearIdleTimer();
    idleTimer = setTimeout(() => setMode("idle"), Math.max(0, delayMs));
  };

  const enterError = (message: string) => {
    clearIdleTimer();
    clearErrorTimer();

    setMode("error", { lastError: { message, ts: Date.now() } });

    errorTimer = setTimeout(() => {
      // Only clear the error if nothing else changed the mode in the meantime.
      if (state.mode === "error") setMode("idle");
    }, errorHoldMs);
  };

  // Expose current simplified state to WS clients.
  // Primary (recommended) name follows the pluginId.action convention.
  api.registerGatewayMethod?.(`${pluginId}.state`, ({ respond }: any) => {
    respond(true, { ok: true, state });
  });
  // Back-compat alias for early adopters.
  api.registerGatewayMethod?.("moltMascot.state", ({ respond }: any) => {
    respond(true, { ok: true, state });
  });

  // Typed hooks (Clawdbot hook runner).
  const on = api?.on;
  if (typeof on !== "function") {
    api?.logger?.warn?.(
      "molt-mascot plugin: api.on() is unavailable; mascot state will not track agent/tool lifecycle"
    );
  } else {
    on("before_agent_start", async () => {
      clearIdleTimer();
      clearErrorTimer();
      setMode("thinking");
    });

    on("before_tool_call", async () => {
      clearIdleTimer();
      clearErrorTimer();
      setMode("tool");
    });

    on("after_tool_call", async () => {
      clearIdleTimer();
      clearErrorTimer();
      setMode("thinking");
    });

    // Prompt-level errors/aborts surface here.
    on("agent_end", async (event: any) => {
      const err = event?.error;
      if (typeof err === "string" && err.trim()) {
        enterError(err.trim());
        return;
      }
      if (event?.success === false) {
        enterError("agent ended unsuccessfully");
        return;
      }
      scheduleIdle();
    });

    // Tool errors are reliably present on toolResult messages (isError=true).
    // This hook is synchronous in Clawdbot; keep it sync.
    on("tool_result_persist", (event: any) => {
      const msg = event?.message;
      if (msg?.isError) {
        const toolName = typeof event?.toolName === "string" ? event.toolName : "tool";
        const detail = summarizeToolResultMessage(msg);
        enterError(`${toolName}: ${detail}`);
      }
      return undefined;
    });
  }

  api.registerService?.({
    id: "molt-mascot",
    start: () => api?.logger?.info?.("molt-mascot plugin ready"),
    stop: () => {
      clearIdleTimer();
      clearErrorTimer();
    },
  });
}
