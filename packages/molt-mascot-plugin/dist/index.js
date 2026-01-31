"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => register,
  id: () => id
});
module.exports = __toCommonJS(index_exports);
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
  if (limit <= 3) return s.slice(0, limit);
  return s.slice(0, limit - 3) + "...";
}
function summarizeToolResultMessage(msg) {
  if (typeof msg === "string" && msg.trim()) return truncate(msg);
  const blocks = msg?.content;
  if (Array.isArray(blocks)) {
    const text = blocks.map((b) => typeof b?.text === "string" ? b.text : "").filter(Boolean).join("\n");
    if (text.trim()) return truncate(text);
  }
  const candidates = [
    msg?.errorMessage,
    msg?.stderr,
    msg?.details,
    // Handle string error or object error with message
    typeof msg?.error === "string" ? msg.error : msg?.error?.message,
    msg?.text,
    msg?.message,
    msg?.result,
    msg?.output
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      const s = c.trim();
      if (s.match(/^Command exited with code \d+$/)) continue;
      return truncate(s.replace(/^Error:\s*/i, ""));
    }
  }
  const fallbackStr = typeof msg?.error === "string" ? msg.error : msg?.error?.message;
  if (typeof fallbackStr === "string" && fallbackStr.trim()) {
    return truncate(fallbackStr.trim().replace(/^Error:\s*/i, ""));
  }
  return "tool error";
}
function register(api) {
  const pluginId = typeof api?.id === "string" ? api.id : id;
  const cfg = api?.pluginConfig ?? api?.config?.plugins?.entries?.[pluginId]?.config ?? {};
  const idleDelayMs = Math.max(0, coerceNumber(cfg.idleDelayMs, 800));
  const errorHoldMs = Math.max(0, coerceNumber(cfg.errorHoldMs, 5e3));
  const state = { mode: "idle", since: Date.now() };
  let idleTimer = null;
  let errorTimer = null;
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
    return activeAgentCount > 0 ? "thinking" : "idle";
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
    const aliases = /* @__PURE__ */ new Set(["molt-mascot-plugin", "molt-mascot", "moltMascot"]);
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
    toolDepth = 0;
    activeAgentCount = 0;
    clearIdleTimer();
    clearErrorTimer();
  };
  registerAlias("reset", (_params, { respond }) => {
    resetInternalState();
    respond(true, { ok: true, state });
  });
  const on = api?.on;
  if (typeof on !== "function") {
    api?.logger?.warn?.(
      "molt-mascot plugin: api.on() is unavailable; mascot state will not track agent/tool lifecycle"
    );
  } else {
    const onAgentStart = async () => {
      clearIdleTimer();
      clearErrorTimer();
      activeAgentCount++;
      const mode = resolveNativeMode();
      setMode(mode);
    };
    on("before_agent_run", onAgentStart);
    const onToolStart = async () => {
      clearIdleTimer();
      toolDepth++;
      syncModeFromCounters();
    };
    on("before_tool_call", onToolStart);
    const onToolEnd = async (event) => {
      clearIdleTimer();
      toolDepth--;
      clampToolDepth();
      const msg = event?.result;
      const toolName = typeof event?.tool === "string" ? event.tool : "tool";
      const hasExitCode = typeof msg?.exitCode === "number";
      const isExitError = hasExitCode && msg.exitCode !== 0;
      const isExplicitError = msg?.isError === true || msg?.status === "error" || typeof msg?.error === "string" && msg.error.trim().length > 0 || typeof msg === "string" && /^\s*error:/i.test(msg);
      const isError = hasExitCode ? isExitError : isExplicitError;
      if (isError) {
        const detail = summarizeToolResultMessage(msg);
        enterError(truncate(`${toolName} error: ${detail}`));
      } else {
        syncModeFromCounters();
      }
    };
    on("after_tool_call", onToolEnd);
    const onAgentEnd = async (event) => {
      activeAgentCount--;
      if (activeAgentCount < 0) activeAgentCount = 0;
      if (activeAgentCount === 0) {
        toolDepth = 0;
      }
      const err = event?.error;
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
      if (msg.trim()) {
        enterError(truncate(msg.trim()));
        return;
      }
      if (event?.success === false) {
        enterError("agent ended unsuccessfully");
        return;
      }
      syncModeFromCounters();
    };
    on("after_agent_run", onAgentEnd);
  }
  api.registerService?.({
    // Keep service id aligned with the runtime plugin id (avoid config/entry mismatches).
    id: pluginId,
    start: () => api?.logger?.info?.(`${pluginId} plugin ready`),
    stop: () => {
      clearIdleTimer();
      clearErrorTimer();
      setMode("idle");
    }
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  id
});
