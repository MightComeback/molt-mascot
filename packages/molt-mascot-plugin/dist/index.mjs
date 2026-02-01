// src/index.ts
var id = "@molt/mascot-plugin";
function coerceNumber(v, fallback) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
function truncate(str, limit = 140) {
  const s = str.trim();
  if (s.length <= limit) return s;
  if (limit <= 1) return s.slice(0, limit);
  let cut = s.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > -1 && cut.length - lastSpace < 20) {
    cut = cut.slice(0, lastSpace);
  }
  return cut + "\u2026";
}
function cleanErrorString(s) {
  let str = s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").trim();
  let prev = "";
  while (str !== prev) {
    prev = str;
    str = str.replace(/^([a-zA-Z0-9_]*Error|Tool failed|Command failed|Exception|Warning|Alert|Fatal|panic|node:|bun:|sh:|bash:|zsh:|git:|curl:|wget:|npm:|pnpm:|yarn:|clawd:|clawdbot:|rpc:|grpc:|deno:|docker:|kubectl:|terraform:|ansible:|make:|cmake:|gradle:|mvn:|uncaughtException|Uncaught)(\s*:\s*|\s+)/i, "").trim();
  }
  const lines = str.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1 && /^Command exited with code \d+$/.test(lines[0])) {
    return cleanErrorString(lines[1]);
  }
  return lines[0] || str;
}
function summarizeToolResultMessage(msg) {
  if (typeof msg === "string" && msg.trim()) return truncate(cleanErrorString(msg));
  const blocks = msg?.content;
  if (Array.isArray(blocks)) {
    const text = blocks.map((b) => typeof b?.text === "string" ? b.text : "").filter(Boolean).join("\n");
    if (text.trim()) return truncate(cleanErrorString(text));
  } else if (typeof blocks === "string" && blocks.trim()) {
    return truncate(cleanErrorString(blocks));
  }
  const candidates = [
    msg?.errorMessage,
    msg?.error_message,
    msg?.err,
    msg?.stderr,
    msg?.failure,
    msg?.details,
    // Handle string error or object error with message
    typeof msg?.error === "string" ? msg.error : msg?.error?.message,
    typeof msg?.error === "object" ? msg?.error?.text : void 0,
    msg?.message,
    msg?.text,
    msg?.result,
    msg?.output,
    msg?.stdout,
    msg?.data?.text,
    typeof msg?.data === "string" ? msg.data : void 0,
    typeof msg?.data === "object" ? msg?.data?.message ?? msg?.data?.error : void 0
  ];
  let genericFallback = null;
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      const s = cleanErrorString(c);
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
function register(api) {
  const pluginId = typeof api?.id === "string" ? api.id : id;
  let cfg = api?.pluginConfig ?? api?.config?.plugins?.entries?.[pluginId]?.config;
  if (!cfg && pluginId === id) {
    cfg = api?.config?.plugins?.entries?.["molt-mascot"]?.config ?? api?.config?.plugins?.entries?.["moltMascot"]?.config;
  }
  if (!cfg) cfg = {};
  const idleDelayMs = Math.max(0, coerceNumber(cfg.idleDelayMs, 1e3));
  const errorHoldMs = Math.max(0, coerceNumber(cfg.errorHoldMs, 5e3));
  const alignment = cfg.alignment || "bottom-right";
  const clickThrough = Boolean(cfg.clickThrough);
  const state = { mode: "idle", since: Date.now(), alignment, clickThrough };
  let idleTimer = null;
  let errorTimer = null;
  const activeAgents = /* @__PURE__ */ new Set();
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
  const setMode = (mode, extra) => {
    const nextLastError = mode === "error" ? extra?.lastError ?? state.lastError : void 0;
    const modeUnchanged = state.mode === mode;
    const lastErrorUnchanged = (state.lastError?.message ?? "") === (nextLastError?.message ?? "") && (state.lastError?.ts ?? 0) === (nextLastError?.ts ?? 0);
    if (modeUnchanged && lastErrorUnchanged) return;
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
    if (state.mode === "error") return;
    clearIdleTimer();
    idleTimer = setTimeout(() => setMode("idle"), Math.max(0, delayMs));
  };
  const resolveNativeMode = () => {
    clampToolDepth();
    if (toolDepth > 0) return "tool";
    return activeAgents.size > 0 ? "thinking" : "idle";
  };
  const syncModeFromCounters = () => {
    const target = resolveNativeMode();
    if (state.mode === "error" && target !== "tool") return;
    if (target === "idle") scheduleIdle();
    else setMode(target);
  };
  const enterError = (message) => {
    api?.logger?.warn?.(`${pluginId}: entering error mode: ${message}`);
    clearIdleTimer();
    clearErrorTimer();
    setMode("error", { lastError: { message, ts: Date.now() } });
    errorTimer = setTimeout(() => {
      if (state.mode === "error") {
        const target = resolveNativeMode();
        if (target === "idle") setMode("idle");
        else setMode(target);
      }
    }, errorHoldMs);
  };
  const registerAlias = (method, handler) => {
    api.registerGatewayMethod?.(`${pluginId}.${method}`, handler);
    const aliases = /* @__PURE__ */ new Set([
      "molt-mascot-plugin",
      "molt-mascot",
      "moltMascot",
      "@molt/mascot-plugin"
    ]);
    aliases.delete(pluginId);
    for (const alias of aliases) {
      api.registerGatewayMethod?.(`${alias}.${method}`, handler);
    }
  };
  registerAlias("state", (_params, { respond }) => {
    respond(true, { ok: true, state });
  });
  const resetInternalState = () => {
    state.mode = "idle";
    state.since = Date.now();
    delete state.lastError;
    delete state.currentTool;
    toolDepth = 0;
    activeAgents.clear();
    clearIdleTimer();
    clearErrorTimer();
  };
  registerAlias("reset", (_params, { respond }) => {
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
    const onAgentStart = async (event) => {
      clearIdleTimer();
      clearErrorTimer();
      const sessionKey = event?.sessionKey ?? event?.sessionId ?? event?.id ?? "unknown";
      activeAgents.add(sessionKey);
      if (activeAgents.size === 1) toolDepth = 0;
      const mode = resolveNativeMode();
      setMode(mode);
    };
    const onToolStart = async (event) => {
      clearIdleTimer();
      toolDepth++;
      const rawName = typeof event?.tool === "string" ? event.tool : "";
      if (rawName) {
        state.currentTool = rawName.replace(/^default_api:/, "");
      }
      syncModeFromCounters();
    };
    const onToolEnd = async (event) => {
      clearIdleTimer();
      toolDepth--;
      clampToolDepth();
      if (toolDepth === 0) delete state.currentTool;
      const infraError = event?.error;
      const msg = event?.result ?? event?.output ?? event?.data;
      let rawToolName = typeof event?.tool === "string" ? event.tool : "tool";
      rawToolName = rawToolName.replace(/^default_api:/, "");
      const toolName = rawToolName.length > 20 ? rawToolName.slice(0, 17) + "..." : rawToolName;
      if (infraError) {
        const detail = typeof infraError === "string" ? infraError : infraError.message || infraError.code || "unknown error";
        enterError(truncate(`${toolName}: ${detail}`));
        return;
      }
      const hasExitCode = typeof msg?.exitCode === "number";
      const isExitError = hasExitCode && msg.exitCode !== 0;
      const isExplicitError = msg?.isError === true || msg?.status === "error" || msg?.status === "failed" || typeof msg?.error === "string" && msg.error.trim().length > 0 || typeof msg === "string" && /^\s*error:/i.test(msg) || typeof msg === "string" && /Command exited with code [1-9]\d*/.test(msg);
      const isError = hasExitCode ? isExitError : isExplicitError;
      if (isError) {
        const detail = summarizeToolResultMessage(msg);
        const text = detail === "tool error" ? `${toolName} failed` : `${toolName}: ${detail}`;
        enterError(truncate(text));
      } else {
        syncModeFromCounters();
      }
    };
    const onAgentEnd = async (event) => {
      const sessionKey = event?.sessionKey ?? event?.sessionId ?? event?.id ?? "unknown";
      activeAgents.delete(sessionKey);
      if (activeAgents.size === 0) {
        toolDepth = 0;
      }
      const err = event?.error;
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
      if (msg.trim()) {
        const clean = cleanErrorString(msg);
        enterError(truncate(clean));
        return;
      }
      if (event?.success === false) {
        enterError("Task failed");
        return;
      }
      syncModeFromCounters();
    };
    const registerListeners = () => {
      if (typeof on === "function") {
        on("agent:start", onAgentStart);
        on("tool:call", onToolStart);
        on("tool:result", onToolEnd);
        on("agent:result", onAgentEnd);
        on("agent:end", onAgentEnd);
      }
    };
    const unregisterListeners = () => {
      if (typeof off === "function") {
        off("agent:start", onAgentStart);
        off("tool:call", onToolStart);
        off("tool:result", onToolEnd);
        off("agent:result", onAgentEnd);
        off("agent:end", onAgentEnd);
      }
    };
    registerListeners();
    api.registerService?.({
      // Keep service id aligned with the runtime plugin id (avoid config/entry mismatches).
      id: pluginId,
      start: () => api?.logger?.info?.(`${pluginId} plugin ready`),
      stop: () => {
        clearIdleTimer();
        clearErrorTimer();
        unregisterListeners();
        setMode("idle");
      }
    });
    return;
  }
  api.registerService?.({
    // Keep service id aligned with the runtime plugin id (avoid config/entry mismatches).
    id: pluginId,
    start: () => api?.logger?.info?.(`${pluginId} plugin ready (no events)`),
    stop: () => {
      clearIdleTimer();
      clearErrorTimer();
      setMode("idle");
    }
  });
}
export {
  cleanErrorString,
  coerceNumber,
  register as default,
  id,
  summarizeToolResultMessage,
  truncate
};
