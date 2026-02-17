// package.json
var package_default = {
  name: "@molt/mascot-plugin",
  version: "0.1.35",
  description: "OpenClaw plugin for Molt Mascot (pixel mascot)",
  publishConfig: {
    access: "public"
  },
  author: "Might",
  license: "MIT",
  homepage: "https://github.com/MightComeback/molt-mascot/tree/main/packages/molt-mascot-plugin#readme",
  repository: {
    type: "git",
    url: "https://github.com/MightComeback/molt-mascot.git",
    directory: "packages/molt-mascot-plugin"
  },
  bugs: {
    url: "https://github.com/MightComeback/molt-mascot/issues"
  },
  main: "dist/index.js",
  module: "dist/index.mjs",
  types: "dist/index.d.ts",
  exports: {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.mjs",
      require: "./dist/index.js"
    }
  },
  scripts: {
    build: "node tools/sync-plugin-manifest.mjs && tsup src/index.ts --format cjs,esm --dts",
    dev: "node tools/sync-plugin-manifest.mjs && tsup src/index.ts --watch",
    test: "bun test",
    lint: "oxlint .",
    prepack: `node -e "try{require('fs').chmodSync('clawdbot.plugin.json',0o644)}catch(e){}" && bun run build`
  },
  keywords: [
    "clawdbot",
    "plugin",
    "mascot",
    "ai",
    "agent"
  ],
  files: [
    "dist",
    "clawdbot.plugin.json",
    "README.md",
    "LICENSE"
  ],
  devDependencies: {
    tsup: "^8.0.0",
    typescript: "^5.0.0"
  }
};

// src/index.ts
var id = package_default.name;
var version = package_default.version;
function coerceNumber(v, fallback) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
function coerceBoolean(v, fallback) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
    if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  }
  return fallback;
}
var allowedAlignments = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "top-center",
  "bottom-center",
  "center-left",
  "center-right",
  "center"
];
var allowedSizes = ["small", "medium", "large"];
function coerceSize(v, fallback) {
  if (typeof v === "string" && allowedSizes.includes(v)) {
    return v;
  }
  return fallback;
}
function coerceAlignment(v, fallback) {
  if (typeof v === "string" && allowedAlignments.includes(v)) {
    return v;
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
var ERROR_PREFIXES = [
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
  "ModuleNotFoundError"
];
var ERROR_PREFIX_REGEX = new RegExp(
  `^(?:${ERROR_PREFIXES.join("|")})(\\s*:\\s*|\\s+)`,
  "i"
);
function cleanErrorString(s) {
  if (s.length > 4096) s = s.slice(0, 4096);
  let str = s.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "").replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "").trim();
  let prev = "";
  while (str !== prev) {
    prev = str;
    str = str.replace(ERROR_PREFIX_REGEX, "").trim();
  }
  const lines = str.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    if (/^Command (exited|failed) with (exit )?code \d+(?:\b|:)/i.test(lines[0])) {
      return cleanErrorString(lines[1]);
    }
    const concreteErrorLine = lines.find(
      (l) => /^(error|fatal|panic|exception|failed|denied|rejected|[a-zA-Z]+Error\b)/i.test(l)
    );
    if (concreteErrorLine && concreteErrorLine !== lines[0]) {
      return cleanErrorString(concreteErrorLine);
    }
    const tracebackLine = lines.find((l) => /^traceback\b/i.test(l));
    if (tracebackLine && lines[lines.length - 1] !== tracebackLine) {
      return cleanErrorString(lines[lines.length - 1]);
    }
  }
  return lines[0] || str;
}
function summarizeToolResultMessage(msg) {
  if (typeof msg === "string" && msg.trim()) return truncate(cleanErrorString(msg));
  if (typeof msg === "number" && Number.isFinite(msg)) {
    return truncate(String(msg));
  }
  if (typeof msg === "boolean") {
    return truncate(String(msg));
  }
  if (msg === null) {
    return "null";
  }
  if (msg === void 0) {
    return "undefined";
  }
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
      }
    }
  }
  if (typeof msg === "object" && typeof msg?.exitCode === "number") {
    return `exit code ${msg.exitCode}`;
  }
  return "tool error";
}
function register(api) {
  const pluginId = typeof api?.id === "string" ? api.id : id;
  let cfg = api?.pluginConfig;
  if (!cfg) {
    const entries = api?.config?.plugins?.entries;
    const keysToTry = [
      pluginId,
      id,
      "@molt/mascot-plugin",
      "molt-mascot",
      "moltMascot",
      "molt-mascot-plugin",
      "moltMascotPlugin"
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
  const errorHoldMs = Math.max(0, coerceNumber(cfg.errorHoldMs, 5e3));
  const alignment = coerceAlignment(cfg.alignment, "bottom-right");
  const clickThrough = coerceBoolean(cfg.clickThrough, false);
  const hideText = coerceBoolean(cfg.hideText, false);
  const paddingNum = coerceNumber(cfg.padding, 24);
  const padding = paddingNum >= 0 ? paddingNum : 24;
  const opacityNum = coerceNumber(cfg.opacity, 1);
  const opacity = opacityNum >= 0 && opacityNum <= 1 ? opacityNum : 1;
  const size = coerceSize(cfg.size, "medium");
  const state = {
    mode: "idle",
    since: Date.now(),
    alignment,
    clickThrough,
    hideText,
    padding,
    opacity,
    size
  };
  let idleTimer = null;
  let errorTimer = null;
  const activeAgents = /* @__PURE__ */ new Set();
  const agentToolStacks = /* @__PURE__ */ new Map();
  const agentLastToolTs = /* @__PURE__ */ new Map();
  const contentTools = /* @__PURE__ */ new Set([
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
    "hakky-tools"
  ]);
  const getToolDepth = () => {
    let inputs = 0;
    for (const stack of agentToolStacks.values()) inputs += stack.length;
    return inputs;
  };
  const getSessionKey = (event) => {
    const raw = event?.sessionKey ?? event?.sessionId ?? // Prefer *stable* identifiers so tool nesting works; per-request ids cause stack flicker.
    event?.agentSessionKey ?? event?.agentSessionId ?? event?.agentId ?? event?.agentKey;
    if (typeof raw === "string" && raw.trim()) return raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
    return "unknown";
  };
  const recalcCurrentTool = () => {
    let found;
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
      state.currentTool = found.replace(/^default_api:/, "").replace(/^functions\./, "").replace(/^multi_tool_use\./, "");
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
    if (mode !== "tool") {
      delete state.currentTool;
    }
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
      "moltMascotPlugin",
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
    agentToolStacks.clear();
    agentLastToolTs.clear();
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
      `${pluginId} plugin: api.on() is unavailable; mascot state will not track agent/tool lifecycle`
    );
  } else {
    const onAgentStart = async (event) => {
      clearIdleTimer();
      clearErrorTimer();
      const sessionKey = getSessionKey(event);
      if (activeAgents.size > 10) {
        activeAgents.clear();
        agentToolStacks.clear();
        agentLastToolTs.clear();
        delete state.currentTool;
      }
      activeAgents.add(sessionKey);
      agentToolStacks.set(sessionKey, []);
      agentLastToolTs.set(sessionKey, 0);
      const mode = resolveNativeMode();
      setMode(mode);
    };
    const onToolStart = async (event) => {
      clearIdleTimer();
      clearErrorTimer();
      const key = getSessionKey(event);
      const stack = agentToolStacks.get(key) || [];
      const rawName = typeof event?.tool === "string" ? event.tool : typeof event?.toolName === "string" ? event.toolName : typeof event?.name === "string" ? event.name : "";
      const toolName = rawName || "tool";
      stack.push(toolName);
      agentToolStacks.set(key, stack);
      agentLastToolTs.set(key, Date.now());
      state.currentTool = toolName.replace(/^default_api:/, "").replace(/^functions\./, "").replace(/^multi_tool_use\./, "");
      syncModeFromCounters();
    };
    const onToolEnd = async (event) => {
      clearIdleTimer();
      const key = getSessionKey(event);
      const stack = agentToolStacks.get(key) || [];
      if (stack.length > 0) stack.pop();
      agentToolStacks.set(key, stack);
      agentLastToolTs.set(key, Date.now());
      recalcCurrentTool();
      const infraError = event?.error;
      const msg = event?.result ?? event?.output ?? event?.data ?? event?.payload;
      const toolFromEvent = event?.tool ?? event?.toolName ?? event?.name;
      const rawToolName = typeof toolFromEvent === "string" ? toolFromEvent : "";
      const toolName = rawToolName.replace(/^default_api:/, "").replace(/^functions\./, "").replace(/^multi_tool_use\./, "").slice(0, 20);
      if (infraError) {
        const detail = typeof infraError === "string" ? infraError : infraError.message || infraError.code || "unknown error";
        enterError(truncate(`${toolName}: ${detail}`));
        return;
      }
      const hasExitCode = typeof msg?.exitCode === "number";
      const isExitError = hasExitCode && msg.exitCode !== 0;
      const isContentTool = contentTools.has(rawToolName);
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
      agentToolStacks.delete(sessionKey);
      agentLastToolTs.delete(sessionKey);
      recalcCurrentTool();
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
      if (payload == null) return envelope;
      if (typeof payload !== "object") {
        return { ...envelope, payload };
      }
      const merged = { ...envelope, ...payload };
      const missingId = (v) => v === void 0 || v === null || typeof v === "string" && v.trim().length === 0;
      if (missingId(merged.sessionKey) && !missingId(envelope?.sessionKey)) {
        merged.sessionKey = envelope.sessionKey;
      }
      if (missingId(merged.sessionId) && !missingId(envelope?.sessionId)) {
        merged.sessionId = envelope.sessionId;
      }
      if (missingId(merged.sessionKey) && !missingId(merged.sessionId)) {
        merged.sessionKey = merged.sessionId;
      }
      return merged;
    };
    const handleAgentEvent = (e) => {
      const payload = e && typeof e === "object" && "payload" in e ? e.payload : e;
      const p = mergeEnvelope(e, payload);
      if (p?.phase === "start") onAgentStart(p);
      else if (p?.phase === "end" || p?.phase === "result" || p?.phase === "error") onAgentEnd(p);
    };
    const handleToolEvent = (e) => {
      const payload = e && typeof e === "object" && "payload" in e ? e.payload : e;
      const p = mergeEnvelope(e, payload);
      if (p?.phase === "start" || p?.phase === "call" || p?.stream === "call") onToolStart(p);
      else if (p?.phase === "end" || p?.phase === "result" || p?.phase === "error" || p?.stream === "result" || p?.stream === "error")
        onToolEnd(p);
    };
    let unsubAgent;
    let unsubTool;
    const registerListeners = () => {
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
      try {
        unsubAgent?.();
      } finally {
        unsubAgent = void 0;
      }
      try {
        unsubTool?.();
      } finally {
        unsubTool = void 0;
      }
    };
    registerListeners();
    api.registerService?.({
      // Keep service id aligned with the runtime plugin id (avoid config/entry mismatches).
      id: pluginId,
      start: () => api?.logger?.info?.(`${pluginId} plugin ready`),
      stop: () => {
        resetInternalState();
        unregisterListeners();
      }
    });
    return;
  }
  api.registerService?.({
    // Keep service id aligned with the runtime plugin id (avoid config/entry mismatches).
    id: pluginId,
    start: () => api?.logger?.info?.(`${pluginId} plugin ready (no events)`),
    stop: () => {
      resetInternalState();
    }
  });
}
export {
  ERROR_PREFIXES,
  ERROR_PREFIX_REGEX,
  cleanErrorString,
  coerceBoolean,
  coerceNumber,
  register as default,
  id,
  summarizeToolResultMessage,
  truncate,
  version
};
