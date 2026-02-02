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
  cleanErrorString: () => cleanErrorString,
  coerceNumber: () => coerceNumber,
  default: () => register,
  id: () => id,
  summarizeToolResultMessage: () => summarizeToolResultMessage,
  truncate: () => truncate
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
  const s = str.trim().replace(/\s+/g, " ");
  const chars = [...s];
  if (chars.length <= limit) return s;
  if (limit <= 1) return chars.slice(0, limit).join("");
  let cut = chars.slice(0, limit - 1).join("");
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
    str = str.replace(/^([a-zA-Z0-9_]*Error|Tool failed|Command failed|Exception|Warning|Alert|Fatal|panic|TypeError|ReferenceError|SyntaxError|EvalError|RangeError|URIError|AggregateError|TimeoutError|SystemError|AssertionError|AbortError|CancellationError|node:|fs:|process:|internal:|commonjs:|bun:|sh:|bash:|zsh:|git:|curl:|wget:|npm:|pnpm:|yarn:|hakky:|hakky-tools:|clawd:|clawdbot:|rpc:|grpc:|deno:|docker:|kubectl:|terraform:|ansible:|make:|cmake:|gradle:|mvn:|ffmpeg:|python:|python3:|go:|rustc:|cargo:|browser:|playwright:|chrome:|firefox:|safari:|uncaughtException|Uncaught|GitError|GraphQLError|ProtocolError|IPCError|RuntimeError|BrowserError|CanvasError|ExecError|SpawnError|ShellError|NetworkError|BroadcastError|PermissionError|SecurityError|EvaluationError|GatewayError|FetchError|ClawdError|AgentSkillError|PluginError|RpcError|MoltError|MoltMascotError|AnthropicError|OpenAIError|OllamaError|DeepSeekError|GoogleGenerativeAIError|GaxiosError|AxiosError|ProviderError|PerplexityError|SonarError|BraveError|BunError|RateLimitError|ValidationError|ZodError|LinearError|GitHubError|TelegramError|DiscordError|SlackError|SignalError|WhatsAppError|BlueBubblesError|McpError|WebSocketError|SocketError|ValueError|KeyError|IndexError|AttributeError|NameError|ImportError|ModuleNotFoundError)(\s*:\s*|\s+)/i, "").trim();
  }
  const lines = str.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    if (/^Command (exited|failed) with (exit )?code \d+$/.test(lines[0])) {
      return cleanErrorString(lines[1]);
    }
    const errorLine = lines.find((l) => /^(error|fatal|panic|exception|traceback|failed)/i.test(l));
    if (errorLine && errorLine !== lines[0]) {
      return cleanErrorString(errorLine);
    }
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
  const idleDelayMs = Math.max(0, coerceNumber(cfg.idleDelayMs, 800));
  const errorHoldMs = Math.max(0, coerceNumber(cfg.errorHoldMs, 5e3));
  const alignment = cfg.alignment;
  const clickThrough = cfg.clickThrough;
  const hideText = cfg.hideText;
  const state = { mode: "idle", since: Date.now(), alignment, clickThrough, hideText };
  let idleTimer = null;
  let errorTimer = null;
  const activeAgents = /* @__PURE__ */ new Set();
  const agentToolDepths = /* @__PURE__ */ new Map();
  const getToolDepth = () => {
    let inputs = 0;
    for (const d of agentToolDepths.values()) inputs += d;
    return inputs;
  };
  const getSessionKey = (event) => event?.sessionKey ?? event?.sessionId ?? event?.id ?? "unknown";
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
    if (getToolDepth() > 0) return "tool";
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
    agentToolDepths.clear();
    activeAgents.clear();
    clearIdleTimer();
    clearErrorTimer();
  };
  registerAlias("reset", (_params, { respond }) => {
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
    const onAgentStart = async (event) => {
      clearIdleTimer();
      clearErrorTimer();
      const sessionKey = getSessionKey(event);
      if (activeAgents.size > 10) {
        activeAgents.clear();
        agentToolDepths.clear();
      }
      activeAgents.add(sessionKey);
      agentToolDepths.set(sessionKey, 0);
      const mode = resolveNativeMode();
      setMode(mode);
    };
    const onToolStart = async (event) => {
      clearIdleTimer();
      const key = getSessionKey(event);
      agentToolDepths.set(key, (agentToolDepths.get(key) || 0) + 1);
      const rawName = typeof event?.tool === "string" ? event.tool : "";
      if (rawName) {
        state.currentTool = rawName.replace(/^default_api:/, "");
      }
      syncModeFromCounters();
    };
    const onToolEnd = async (event) => {
      clearIdleTimer();
      const key = getSessionKey(event);
      const d = agentToolDepths.get(key) || 0;
      if (d > 0) agentToolDepths.set(key, d - 1);
      if (getToolDepth() === 0) delete state.currentTool;
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
      const isContentTool = ["read", "web_fetch", "memory_get", "memory_search", "browser", "canvas"].includes(rawToolName);
      const textSniffing = !isContentTool && (typeof msg === "string" && /^\s*error:/i.test(msg) || typeof msg === "string" && /Command exited with code [1-9]\d*/.test(msg));
      const isExplicitError = msg?.isError === true || msg?.status === "error" || msg?.status === "failed" || typeof msg?.error === "string" && msg.error.trim().length > 0 || textSniffing;
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
      const sessionKey = getSessionKey(event);
      activeAgents.delete(sessionKey);
      agentToolDepths.delete(sessionKey);
      const err = event?.error;
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : typeof err === "object" && err ? err.message || err.text || err.code || (typeof err.error === "string" ? err.error : "") || "" : "";
      if (String(msg).trim()) {
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
    const mergeEnvelope = (envelope, payload) => {
      if (!payload) return envelope;
      if (typeof payload !== "object") return payload;
      if (!payload.sessionKey && envelope.sessionKey) {
        return { ...payload, sessionKey: envelope.sessionKey };
      }
      return payload;
    };
    const handleAgentEvent = (e) => {
      const p = mergeEnvelope(e, e?.payload || e);
      if (p?.phase === "start") onAgentStart(p);
      else if (p?.phase === "end" || p?.phase === "result" || p?.phase === "error") onAgentEnd(p);
    };
    const handleToolEvent = (e) => {
      const p = mergeEnvelope(e, e?.payload || e);
      if (p?.phase === "start" || p?.phase === "call" || p?.stream === "call") onToolStart(p);
      else if (p?.phase === "end" || p?.phase === "result" || p?.stream === "result") onToolEnd(p);
    };
    const registerListeners = () => {
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cleanErrorString,
  coerceNumber,
  id,
  summarizeToolResultMessage,
  truncate
});
