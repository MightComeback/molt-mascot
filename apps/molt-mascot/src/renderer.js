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

function coerceDelayMs(v, fallback) {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const idleDelayMs = coerceDelayMs(window.moltMascot?.env?.idleDelayMs, DEFAULT_IDLE_DELAY_MS);
const errorHoldMs = coerceDelayMs(window.moltMascot?.env?.errorHoldMs, DEFAULT_ERROR_HOLD_MS);

function truncate(str, limit = 140) {
  const s = String(str).trim();
  if (s.length <= limit) return s;
  if (limit <= 3) return s.slice(0, limit);
  return s.slice(0, limit - 3) + "...";
}

function cleanErrorString(s) {
  // Strip ANSI escape codes
  // eslint-disable-next-line no-control-regex
  let str = String(s).replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").trim();
  let prev = "";
  while (str !== prev) {
    prev = str;
    str = str.replace(/^(Error|Tool failed|Exception|Warning|Alert|Fatal|panic|TypeError|ReferenceError|SyntaxError|EvalError|RangeError|URIError|AggregateError|TimeoutError|SystemError|AssertionError|AbortError|CancellationError|node:|bun:|uncaughtException|Uncaught|GitError|GraphQLError|ProtocolError|IPCError|RuntimeError|BrowserError|ExecError|SpawnError|ShellError|NetworkError|BroadcastError|PermissionError|SecurityError|EvaluationError|GatewayError|FetchError)(\s*:\s*|\s+)/i, "").trim();
  }
  const lines = str.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1 && /^Command exited with code \d+$/.test(lines[0])) {
    return lines[1];
  }
  return lines[0] || str;
}

// UX Polish: Hide HUD text if requested (e.g. strict pixel-only mode)
const hideText = (window.moltMascot?.env?.hideText || '').trim();
if (hideText === '1' || hideText.toLowerCase() === 'true') {
  const hud = document.getElementById('hud');
  if (hud) hud.hidden = true;
}

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
  setup.hidden = false;
  // Ensure we can click the form!
  if (window.moltMascot?.setClickThrough) {
    window.moltMascot.setClickThrough(false);
  }
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
let modeSince = Date.now();
let idleTimer = null;
let errorHoldTimer = null;
let lastErrorMessage = '';
let isClickThrough = false;

function syncPill() {
  const duration = Math.max(0, Math.round((Date.now() - modeSince) / 1000));

  let label = currentMode.charAt(0).toUpperCase() + currentMode.slice(1);
  if (currentMode === Mode.error && lastErrorMessage) {
    // UX Polish: show actual error in the HUD (truncated)
    label = lastErrorMessage;
  }
  
  if (isClickThrough) {
    label += ' 🔒';
  }

  pill.textContent = label;

  let tip = `${currentMode} for ${duration}s`;
  if (currentMode === Mode.error && lastErrorMessage) {
    tip += ` — ${lastErrorMessage}`;
  }
  if (isClickThrough) {
    tip += ' (click-through active)';
  }
  const ver = window.moltMascot?.version ? ` (v${window.moltMascot.version})` : '';
  pill.title = tip + ver;
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
let hasPlugin = false;

function nextId(prefix) {
  reqId += 1;
  return `${prefix}${reqId}`;
}

function connect(cfg) {
  setup.hidden = true;
  pill.textContent = 'connecting…';

  if (ws) {
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
          version: window.moltMascot?.version || '0.1.18',
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
      const pid = nextId('p');
      pluginStateReqId = pid;
      ws.send(JSON.stringify({ type: 'req', id: pid, method: pluginStateMethod, params: {} }));
    }

    if (msg.type === 'res' && msg.payload?.type === 'hello-ok') {
      pill.textContent = 'connected';
      setMode(Mode.idle);
      // Optional: fetch plugin simplified state once.
      // Prefer the canonical pluginId.action name (plugin id: "@molt/mascot-plugin").
      // The plugin still exposes "molt-mascot.state" as a back-compat alias.
      const id = nextId('s');
      pluginStateReqId = id;
      pluginStateMethod = '@molt/mascot-plugin.state';
      pluginStateTriedAlias = false;
      ws.send(JSON.stringify({ type: 'req', id, method: pluginStateMethod, params: {} }));

      // Start polling status to keep in sync with plugin-side logic (timers, error holding, etc)
      if (window._pollInterval) clearInterval(window._pollInterval);
      window._pollInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
             const pid = nextId('p');
             pluginStateReqId = pid;
             ws.send(JSON.stringify({ type: 'req', id: pid, method: pluginStateMethod, params: {} }));
        }
      }, 1000);
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
      hasPlugin = true;
      const nextMode = msg.payload.state.mode;
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
      pluginStateTriedAlias = true;
      pluginStateMethod = 'molt-mascot-plugin.state';
      const id = nextId('s');
      pluginStateReqId = id;
      ws.send(JSON.stringify({ type: 'req', id, method: pluginStateMethod, params: {} }));
      return;
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

  ws.addEventListener('close', () => {
    hasPlugin = false;
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
  });

  ws.addEventListener('error', () => {
    lastErrorMessage = 'WebSocket error';
    setMode(Mode.error);
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
      const id = nextId('reset');
      // Try canonical method
      ws.send(JSON.stringify({ type: 'req', id, method: '@molt/mascot-plugin.reset', params: {} }));
    }
  });
}

if (window.moltMascot?.onClickThrough) {
  window.moltMascot.onClickThrough((enabled) => {
    isClickThrough = Boolean(enabled);
    syncPill();
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
