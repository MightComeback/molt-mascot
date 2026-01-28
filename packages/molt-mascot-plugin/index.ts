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

export default function register(api: any) {
  const cfg: PluginConfig = api?.pluginConfig ?? api?.config?.plugins?.entries?.["molt-mascot"]?.config ?? {};
  const idleDelayMs = typeof cfg.idleDelayMs === "number" ? cfg.idleDelayMs : 800;
  const errorHoldMs = typeof cfg.errorHoldMs === "number" ? cfg.errorHoldMs : 5000;

  const state: State = { mode: "idle", since: Date.now() };

  const setMode = (mode: Mode, extra?: Partial<State>) => {
    if (state.mode === mode) return;
    state.mode = mode;
    state.since = Date.now();
    if (extra?.lastError) state.lastError = extra.lastError;
    api?.logger?.info?.({ mode }, "moltMascot: state");
  };

  let idleTimer: any = null;
  const scheduleIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => setMode("idle"), idleDelayMs);
  };

  // Expose current simplified state to WS clients.
  api.registerGatewayMethod?.("moltMascot.state", ({ respond }: any) => {
    respond(true, { ok: true, state });
  });

  // Hooks (best-effort; harmless if the hook name changes in future builds).
  api.registerHook?.("before_agent_start", async () => {
    setMode("thinking");
  });

  api.registerHook?.("before_tool_call", async () => {
    setMode("tool");
  });

  api.registerHook?.("after_tool_call", async () => {
    setMode("thinking");
  });

  api.registerHook?.("agent_end", async () => {
    scheduleIdle();
  });

  api.registerHook?.("agent_error", async (ctx: any) => {
    const message = String(ctx?.error?.message ?? ctx?.error ?? "agent error");
    setMode("error", { lastError: { message, ts: Date.now() } });
    setTimeout(() => scheduleIdle(), errorHoldMs);
  });

  api.registerService?.({
    id: "molt-mascot",
    start: () => api?.logger?.info?.("molt-mascot plugin ready"),
    stop: () => {
      if (idleTimer) clearTimeout(idleTimer);
    },
  });
}
