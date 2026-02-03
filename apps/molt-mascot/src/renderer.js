const pill = document.getElementById('pill');
const setup = document.getElementById('setup');
const urlInput = document.getElementById('url');
const tokenInput = document.getElementById('token');
const saveBtn = document.getElementById('save');

const captureDir = (window.moltMascot?.env?.captureDir || '').trim();
const isCapture = Boolean(captureDir);

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const STORAGE_KEY = 'moltMascot:gateway';

const DEFAULT_IDLE_DELAY_MS = 800;
const DEFAULT_ERROR_HOLD_MS = 5000;

// click-through (ghost mode). Declared early so setup UI can reliably disable it.
let isClickThrough = false;

function coerceDelayMs(v, fallback) {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const idleDelayMs = coerceDelayMs(window.moltMascot?.env?.idleDelayMs, DEFAULT_IDLE_DELAY_MS);
const errorHoldMs = coerceDelayMs(window.moltMascot?.env?.errorHoldMs, DEFAULT_ERROR_HOLD_MS);

function truncate(str, limit = 140) {
  const s = String(str).trim();
  const chars = [...s];
  if (chars.length <= limit) return s;
  // If limit is too small to fit ellipsis, just truncate hard
  if (limit <= 1) return chars.slice(0, limit).join("");

  // Basic truncate (leave room for 1 char ellipsis)
  let cut = chars.slice(0, limit - 1).join("");
  // Try to cut at space if reasonably close (last 20 chars) to avoid chopping words
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > -1 && cut.length - lastSpace < 20) {
    cut = cut.slice(0, lastSpace);
  }

  return cut + "…";
}

function cleanErrorString(s) {
  // Performance guard: truncate huge outputs before regex processing
  if (String(s).length > 4096) s = String(s).slice(0, 4096);

  // Strip ANSI escape codes (colors, cursor moves, etc)
  /* eslint-disable no-control-regex */
  let str = String(s)
    // CSI sequences: ESC [ parameters intermediates final-byte
    // (final byte is in the range @-~; not just letters)
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    // OSC sequences: ESC ] ... BEL  OR  ESC ] ... ESC \\
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\\\)/g, "")
    .trim();
  /* eslint-enable no-control-regex */
  let prev = "";
  while (str !== prev) {
    prev = str;
    str = str.replace(/^([a-zA-Z0-9_]*Error|Tool failed|Command failed|Exception|Warning|Alert|Fatal|panic|TypeError|ReferenceError|SyntaxError|EvalError|RangeError|URIError|AggregateError|TimeoutError|SystemError|AssertionError|AbortError|CancellationError|node:|fs:|process:|internal:|commonjs:|bun:|sh:|bash:|zsh:|git:|curl:|wget:|npm:|pnpm:|yarn:|hakky:|hakky-tools:|clawd:|clawdbot:|rpc:|grpc:|deno:|docker:|kubectl:|terraform:|ansible:|make:|cmake:|gradle:|mvn:|ffmpeg:|python:|python3:|go:|rustc:|cargo:|browser:|playwright:|chrome:|firefox:|safari:|cron:|nodes:|uncaughtException|Uncaught|GitError|GraphQLError|ProtocolError|IPCError|RuntimeError|BrowserError|CanvasError|ExecError|SpawnError|ShellError|NetworkError|BroadcastError|PermissionError|SecurityError|AuthError|ForbiddenError|EvaluationError|GatewayError|FetchError|ClawdError|AgentSkillError|PluginError|RpcError|MoltError|MoltMascotError|AnthropicError|OpenAIError|OllamaError|DeepSeekError|GoogleGenerativeAIError|GaxiosError|AxiosError|ProviderError|PerplexityError|SonarError|BraveError|BunError|RateLimitError|ValidationError|ZodError|LinearError|GitHubError|TelegramError|DiscordError|SlackError|SignalError|WhatsAppError|BlueBubblesError|BirdError|ClawdHubError|GeminiError|GogError|NotionError|PeekabooError|SummarizeError|VideoFramesError|SkillCreatorError|CodingAgentError|WeatherError|McpError|WebSocketError|SocketError|CronError|ConnectionError|RequestError|ResponseError|DatabaseError|SqlError|PrismaError|MongoError|RedisError|ValueError|KeyError|IndexError|AttributeError|NameError|ImportError|ModuleNotFoundError)(\s*:\s*|\s+)/i, "").trim();
  }
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
    const errorLine = lines.find(l => /^(error|fatal|panic|exception|traceback|failed|denied|rejected)/i.test(l));
    if (errorLine && errorLine !== lines[0]) {
      return cleanErrorString(errorLine);
    }
  }

  return lines[0] || str;
}

// UX Polish: Hide HUD text if requested (e.g. strict pixel-only mode)
const hideTextEnv = (window.moltMascot?.env?.hideText || '').trim();
let isTextHidden = hideTextEnv === '1' || hideTextEnv.toLowerCase() === 'true';

// Helper to manage HUD visibility:
// If the user requested hidden text, we respect it—UNLESS we are in error mode.
// We force the HUD visible during errors so the user can see what went wrong.
function updateHudVisibility() {
  const hud = document.getElementById('hud');
  if (!hud) return;
  // If in error mode, force visibility. Otherwise, respect the preference.
  hud.hidden = isTextHidden && currentMode !== Mode.error;
}

// Apply initial state (moved below after state machine init)

function loadCfg() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || null;
  } catch {
    return null;
  }
}

function saveCfg(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

function showSetup(prefill) {
  if (isCapture) return;
  setup.hidden = false;
  // Ensure we can click the form!
  if (window.moltMascot?.setClickThrough) {
    window.moltMascot.setClickThrough(false);
  }
  // Keep local state consistent with the native window flag so the HUD doesn't
  // claim ghost mode is active while the setup form is visible.
  isClickThrough = false;
  syncPill();
  urlInput.value = prefill?.url || 'ws://127.0.0.1:18789';
  tokenInput.value = prefill?.token || '';
}

import { palette, lobsterIdle, overlay } from './sprites.js';

function drawSprite(sprite, { x = 0, y = 0, scale = 3 } = {}) {
  for (let py = 0; py < sprite.length; py += 1) {
    const row = sprite[py];
    for (let px = 0; px < row.length; px += 1) {
      const ch = row[px];
      const color = palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + px * scale, y + py * scale, scale, scale);
    }
  }
}

function drawLobster(mode, t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // subtle shadow (keeps it readable on transparent backgrounds)
  ctx.fillStyle = palette.s;
  ctx.beginPath();
  ctx.ellipse(48, 78, 26, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  const frame = Math.floor(t / 260) % 2;
  const bob = Math.sin(t / 260) * 2;

  // main sprite
  const bobY = Math.round(bob);
  drawSprite(lobsterIdle[frame], { x: 0, y: bobY, scale: 3 });

  // overlays (simple icons) - attached to bob
  if (mode === 'thinking') drawSprite(overlay.thinking, { x: 0, y: bobY - 2, scale: 3 });
  if (mode === 'tool') drawSprite(overlay.tool, { x: 0, y: bobY - 2, scale: 3 });
  if (mode === 'error') drawSprite(overlay.error, { x: 0, y: bobY - 2, scale: 3 });
}

// --- State machine ---
const Mode = {
  idle: 'idle',
  thinking: 'thinking',
  tool: 'tool',
  error: 'error',
};

let currentMode = Mode.idle;
// Apply initial state now that Mode/currentMode exist
updateHudVisibility();
let currentTool = '';
let modeSince = Date.now();
let idleTimer = null;
let errorHoldTimer = null;
let lastErrorMessage = '';
const envClickThrough = (window.moltMascot?.env?.clickThrough || '').trim();
isClickThrough = envClickThrough === '1' || envClickThrough.toLowerCase() === 'true';

let lastPluginClickThrough = null;
let lastPluginAlignment = null;
let lastPluginHideText = null;
let lastPluginOpacity = null;
let lastPluginPadding = null;

function syncPill() {
  const duration = Math.max(0, Math.round((Date.now() - modeSince) / 1000));

  let label = currentMode.charAt(0).toUpperCase() + currentMode.slice(1);
  if (currentMode === Mode.tool && currentTool) {
    label = truncate(currentTool, 24);
  }
  if (currentMode === Mode.error && lastErrorMessage) {
    // UX Polish: show actual error in the HUD (truncated)
    label = truncate(lastErrorMessage, 48);
  }
  
  if (isClickThrough) {
    label += ' 👻';
  }

  pill.textContent = label;

  let tip = `${currentMode} for ${duration}s`;
  if (currentMode === Mode.error && lastErrorMessage) {
    tip += ` — ${lastErrorMessage}`;
  }
  if (isClickThrough) {
    tip += ' (ghost mode active)';
  }
  const ver = window.moltMascot?.version ? ` (v${window.moltMascot.version})` : '';
  pill.title = tip + ver;
  updateHudVisibility();
}

function setMode(mode) {
  if (currentMode === mode) return;
  currentMode = mode;
  modeSince = Date.now();
  if (idleTimer) clearTimeout(idleTimer);
  if (errorHoldTimer) {
    clearTimeout(errorHoldTimer);
    errorHoldTimer = null;
  }

  if (mode !== Mode.error) lastErrorMessage = '';
  syncPill();
}

// For deterministic screenshots / demos.
window.__moltMascotSetMode = (mode) => {
  if (Object.values(Mode).includes(mode)) setMode(mode);
};

let manualTime = null;
window.__moltMascotSetTime = (t) => {
  manualTime = t;
};

function scheduleIdle(delayMs = idleDelayMs) {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => setMode(Mode.idle), delayMs);
}

// --- Gateway WS ---
let ws = null;
let reqId = 0;

let pluginStateReqId = null;
let pluginStateMethod = '@molt/mascot-plugin.state';
let pluginStateTriedAlias = false;

let pluginResetReqId = null;
let pluginResetMethod = '@molt/mascot-plugin.reset';
let pluginResetTriedAlias = false;

let hasPlugin = false;
let pluginPollerStarted = false;
let pluginStatePending = false;
let pluginStateLastSentAt = 0;

function sendPluginStateReq(prefix = 'p') {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  // If we fire a new request on every event, we can easily stomp our own request id
  // and end up ignoring responses (because only the latest id is honored).
  // Keep at most one in flight at a time, and also rate-limit a little.
  const now = Date.now();
  if (pluginStatePending) return;
  if (now - pluginStateLastSentAt < 150) return;

  const id = nextId(prefix);
  pluginStateReqId = id;
  pluginStatePending = true;
  pluginStateLastSentAt = now;
  ws.send(JSON.stringify({ type: 'req', id, method: pluginStateMethod, params: {} }));
}

function startPluginPoller() {
  if (pluginPollerStarted) return;
  pluginPollerStarted = true;
  // Poll status to keep in sync with plugin-side logic (timers, error holding, etc)
  if (window._pollInterval) clearInterval(window._pollInterval);
  window._pollInterval = setInterval(() => {
    sendPluginStateReq('p');
  }, 1000);
}

function nextId(prefix) {
  reqId += 1;
  return `${prefix}${reqId}`;
}

function connect(cfg) {
  setup.hidden = true;
  pill.textContent = 'connecting…';

  if (ws) {
    ws.onclose = null;
    try { ws.close(); } catch {}
    ws = null;
  }

  ws = new WebSocket(cfg.url);

  ws.addEventListener('open', () => {
    const id = nextId('c');
    const connectFrame = {
      type: 'req',
      id,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'molt-mascot-desktop',
          displayName: 'Molt Mascot',
          version: window.moltMascot?.version || 'dev',
          platform: window.moltMascot?.platform || navigator.userAgent,
          mode: 'gui',
          instanceId: `moltMascot-${Math.random().toString(16).slice(2)}`,
        },
        role: 'operator',
        scopes: ['operator.read'],
        auth: cfg.token ? { token: cfg.token } : undefined,
      },
    };
    ws.send(JSON.stringify(connectFrame));
  });

  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }

    // Always print raw frames for MVP (dev ergonomics).
    // eslint-disable-next-line no-console
    // console.log('gateway:', msg);

    // If we have a plugin, any event is a hint to poll state immediately
    // so the UI feels snappy (instead of waiting for the 1s poller).
    if (hasPlugin && msg.type === 'event') {
      sendPluginStateReq('p');
    }

    if (msg.type === 'res' && msg.payload?.type === 'hello-ok') {
      pill.textContent = 'connected';
      setMode(Mode.idle);
      // Optional: fetch plugin simplified state once.
      // Prefer the canonical pluginId.action name (plugin id: "@molt/mascot-plugin").
      // The plugin still exposes "molt-mascot.state" as a back-compat alias.
      pluginStateMethod = '@molt/mascot-plugin.state';
      pluginStateTriedAlias = false;
      pluginStatePending = false;
      pluginStateLastSentAt = 0;

      pluginResetMethod = '@molt/mascot-plugin.reset';
      pluginResetTriedAlias = false;
      pluginResetReqId = null;

      sendPluginStateReq('s');

      return;
    }

    // Plugin state response (only honor the response to *our* request).
    // This avoids accidentally treating unrelated "res" frames as mascot state.
    if (
      msg.type === 'res' &&
      msg.id &&
      msg.id === pluginStateReqId &&
      msg.ok &&
      msg.payload?.ok &&
      msg.payload?.state?.mode
    ) {
      pluginStatePending = false;
      hasPlugin = true;
      startPluginPoller();
      const nextMode = msg.payload.state.mode;
      const nextTool = msg.payload.state.currentTool || '';
      if (nextTool !== currentTool) {
        currentTool = nextTool;
        // If we are already in tool mode, update immediately
        if (currentMode === Mode.tool) syncPill();
      }

      // Sync clickThrough from plugin config/state
      if (typeof msg.payload.state.clickThrough === 'boolean') {
        const nextClickThrough = msg.payload.state.clickThrough;
        // Only apply if the server value actually changed (local overrides static config)
        if (nextClickThrough !== lastPluginClickThrough && window.moltMascot?.setClickThrough) {
          lastPluginClickThrough = nextClickThrough;
          isClickThrough = nextClickThrough;
          window.moltMascot.setClickThrough(nextClickThrough);
          syncPill();
        }
      }

      // Sync alignment
      if (typeof msg.payload.state.alignment === 'string' && msg.payload.state.alignment) {
        const nextAlign = msg.payload.state.alignment;
        if (nextAlign !== lastPluginAlignment && window.moltMascot?.setAlignment) {
          lastPluginAlignment = nextAlign;
          window.moltMascot.setAlignment(nextAlign);
        }
      }

      // Sync opacity
      if (typeof msg.payload.state.opacity === 'number') {
        const nextOpacity = msg.payload.state.opacity;
        if (nextOpacity !== lastPluginOpacity && window.moltMascot?.setOpacity) {
          lastPluginOpacity = nextOpacity;
          window.moltMascot.setOpacity(nextOpacity);
        }
      }

      // Sync padding (affects window position)
      if (typeof msg.payload.state.padding === 'number') {
        const nextPadding = msg.payload.state.padding;
        if (nextPadding !== lastPluginPadding && window.moltMascot?.setPadding) {
          lastPluginPadding = nextPadding;
          window.moltMascot.setPadding(nextPadding);
        }
      }

      // Sync hideText
      if (typeof msg.payload.state.hideText === 'boolean') {
        const nextHideText = msg.payload.state.hideText;
        if (nextHideText !== lastPluginHideText) {
          lastPluginHideText = nextHideText;
          isTextHidden = nextHideText;
          updateHudVisibility();
        }
      }

      const nextErr = msg.payload?.state?.lastError?.message;
      if (nextMode === Mode.error && typeof nextErr === 'string' && nextErr.trim()) {
        lastErrorMessage = nextErr.trim();
      }
      setMode(nextMode);
      // If mode didn't change but we learned about an error detail, update tooltip.
      if (currentMode === Mode.error) syncPill();
      return;
    }

    // If the canonical plugin method isn't installed (older plugin), fall back once.
    if (msg.type === 'res' && msg.id && msg.id === pluginStateReqId && msg.ok === false && !pluginStateTriedAlias) {
      pluginStatePending = false;
      pluginStateTriedAlias = true;
      pluginStateMethod = 'molt-mascot.state';
      pluginStateLastSentAt = 0;
      sendPluginStateReq('s');
      return;
    }

    // If the canonical plugin reset method isn't installed (older plugin), fall back once.
    if (msg.type === 'res' && msg.id && msg.id === pluginResetReqId && msg.ok === false && !pluginResetTriedAlias) {
      pluginResetTriedAlias = true;
      pluginResetMethod = 'molt-mascot.reset';
      const id = nextId('reset');
      pluginResetReqId = id;
      ws.send(JSON.stringify({ type: 'req', id, method: pluginResetMethod, params: {} }));
      return;
    }

    // If we got *any* response to our plugin-state request but it didn't match the
    // success path above (e.g., method missing, auth failure), don't deadlock the poller.
    if (msg.type === 'res' && msg.id && msg.id === pluginStateReqId) {
      pluginStatePending = false;
    }

    // Native agent stream mapping (no plugin required).
    if (!hasPlugin && msg.type === 'event' && msg.event === 'agent') {
      const p = msg.payload;
      const stream = p?.stream;
      if (stream === 'lifecycle') {
        if (p?.phase === 'start') setMode(Mode.thinking);
        if (p?.phase === 'end') scheduleIdle(idleDelayMs);
        if (p?.phase === 'error') {
          const raw = p?.error?.message || (typeof p?.error === 'string' ? p.error : 'agent error');
          lastErrorMessage = truncate(cleanErrorString(raw));
          setMode(Mode.error);
          // Hold the error state for the configured duration, then return to idle.
          // (Don't add the idle-delay on top of the error hold.)
          if (errorHoldTimer) clearTimeout(errorHoldTimer);
          errorHoldTimer = setTimeout(() => {
            errorHoldTimer = null;
            scheduleIdle(0);
          }, errorHoldMs);
        }
      }
      if (stream === 'tool') {
        // Heuristic: any tool activity => tool
        setMode(Mode.tool);
        // bounce back to thinking unless lifecycle ends
        setTimeout(() => {
          if (currentMode === Mode.tool) setMode(Mode.thinking);
        }, 250);
      }
    }
  });

  ws.onclose = () => {
    hasPlugin = false;
    pluginPollerStarted = false;
    pill.textContent = 'disconnected';
    if (window._pollInterval) {
      clearInterval(window._pollInterval);
      window._pollInterval = null;
    }
    setMode(Mode.idle);
    setTimeout(() => {
      // Re-read config to pickup changes or use current env
      const fresh = loadCfg();
      // If we have a valid config, retry. Otherwise, show setup.
      if (fresh && fresh.url) connect(fresh);
      else showSetup({ url: cfg.url, token: cfg.token });
    }, 1500);
  };

  ws.addEventListener('error', () => {
    lastErrorMessage = 'WebSocket error';
    setMode(Mode.error);

    // Mirror the native error hold behavior: don't let a transient WS error
    // freeze the mascot in error mode forever.
    if (errorHoldTimer) clearTimeout(errorHoldTimer);
    errorHoldTimer = setTimeout(() => {
      errorHoldTimer = null;
      // If we're still in error mode, revert to idle immediately.
      if (currentMode === Mode.error) scheduleIdle(0);
    }, errorHoldMs);
  });
}


saveBtn.addEventListener('click', () => {
  const cfg = { url: urlInput.value.trim(), token: tokenInput.value.trim() };
  saveCfg(cfg);
  connect(cfg);
});

if (window.moltMascot?.onReset) {
  window.moltMascot.onReset(() => {
    // eslint-disable-next-line no-console
    console.log('Resetting state...');
    setMode(Mode.idle);
    if (hasPlugin && ws && ws.readyState === WebSocket.OPEN) {
      pluginResetTriedAlias = false;
      pluginResetMethod = '@molt/mascot-plugin.reset';
      const id = nextId('reset');
      pluginResetReqId = id;
      // Try canonical method first; on older plugins we fall back to "molt-mascot.reset".
      ws.send(JSON.stringify({ type: 'req', id, method: pluginResetMethod, params: {} }));
    }
  });
}

if (window.moltMascot?.onClickThrough) {
  window.moltMascot.onClickThrough((enabled) => {
    isClickThrough = Boolean(enabled);
    syncPill();
  });
}

if (window.moltMascot?.onHideText) {
  window.moltMascot.onHideText((hidden) => {
    isTextHidden = hidden;
    updateHudVisibility();
  });
}

// boot
if (isCapture) {
  setup.hidden = true;
  pill.textContent = 'demo';
} else {
  const cfg = loadCfg();
  const envUrl = (window.moltMascot?.env?.gatewayUrl || '').trim();
  const envToken = (window.moltMascot?.env?.gatewayToken || '').trim();

  // If environment provides credentials at runtime, they take precedence.
  // Update storage to match so we stay in sync.
  if (envUrl) {
    const seeded = { url: envUrl, token: envToken };
    // Only save if different to avoid churn? No, safe to just save.
    saveCfg(seeded);
    connect(seeded);
  } else if (cfg?.url) {
    connect(cfg);
  } else {
    showSetup(cfg);
  }
}

function frame(t) {
  drawLobster(currentMode, manualTime !== null ? manualTime : t);
  // Update tooltip duration every second
  if (Math.floor(t / 1000) > Math.floor((t - 16) / 1000)) {
    syncPill();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
