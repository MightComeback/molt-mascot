import { coerceDelayMs, truncate, cleanErrorString, isMissingMethodResponse, isTruthyEnv, formatDuration } from './utils.js';

const pill = document.getElementById('pill');
const setup = document.getElementById('setup');
const urlInput = document.getElementById('url');
const tokenInput = document.getElementById('token');
const captureDir = (window.moltMascot?.env?.captureDir || '').trim();
const isCapture = Boolean(captureDir);

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const STORAGE_KEY = 'moltMascot:gateway';

const DEFAULT_IDLE_DELAY_MS = 800;
const DEFAULT_ERROR_HOLD_MS = 5000;

// click-through (ghost mode). Declared early so setup UI can reliably disable it.
let isClickThrough = false;

const idleDelayMs = coerceDelayMs(window.moltMascot?.env?.idleDelayMs, DEFAULT_IDLE_DELAY_MS);
const errorHoldMs = coerceDelayMs(window.moltMascot?.env?.errorHoldMs, DEFAULT_ERROR_HOLD_MS);

// UX Polish: Hide HUD text if requested (e.g. strict pixel-only mode)
// Note: env values may be boolean/number (not always strings), so don't call .trim() here.
const hideTextEnv = window.moltMascot?.env?.hideText;
let isTextHidden = isTruthyEnv(hideTextEnv);

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

// Blink state: the lobster blinks every 3-6 seconds for ~150ms
let nextBlinkAt = 2000 + Math.random() * 4000;
const BLINK_DURATION_MS = 150;

function isBlinking(t) {
  if (t >= nextBlinkAt) {
    if (t < nextBlinkAt + BLINK_DURATION_MS) return true;
    // Schedule next blink 3-6s from now
    nextBlinkAt = t + 3000 + Math.random() * 3000;
  }
  return false;
}

function drawLobster(mode, t, idleDurationMs = 0) {
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

  // Blink: paint over the white+pupil eye pixels with the body red color
  if (isBlinking(t)) {
    const scale = 3;
    // Eye positions from sprite: row 8 cols 14-15 (left), 18-19 (right) for whites
    // Row 9 cols 14 'w',15 'b' (left), 18 'w',19 'b' (right)
    // Paint a horizontal line of body color over both eye rows
    ctx.fillStyle = palette.r;
    // Left eye area (cols 14-15, rows 8-9)
    ctx.fillRect(14 * scale, (8 + bobY) * scale, 2 * scale, 2 * scale);
    // Right eye area (cols 18-19, rows 8-9)
    ctx.fillRect(18 * scale, (8 + bobY) * scale, 2 * scale, 2 * scale);
  }

  // overlays (simple icons) - attached to bob
  if (mode === 'thinking') drawSprite(overlay.thinking, { x: 0, y: bobY - 2, scale: 3 });
  if (mode === 'tool') drawSprite(overlay.tool, { x: 0, y: bobY - 2, scale: 3 });
  if (mode === 'error') drawSprite(overlay.error, { x: 0, y: bobY - 2, scale: 3 });
  if (mode === 'idle' && idleDurationMs > 30000) drawSprite(overlay.sleep, { x: 0, y: bobY - 2, scale: 3 });
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
const envClickThrough = window.moltMascot?.env?.clickThrough;
isClickThrough = isTruthyEnv(envClickThrough);

let lastPluginClickThrough = null;
let lastPluginAlignment = null;
let lastPluginHideText = null;
let lastPluginOpacity = null;
let lastPluginPadding = null;

function syncPill() {
  const duration = Math.max(0, Math.round((Date.now() - modeSince) / 1000));

  let label = currentMode.charAt(0).toUpperCase() + currentMode.slice(1);
  if (currentMode === Mode.idle && duration > 30) {
    label = 'Sleeping';
  }
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

  // Color-coded pill background per mode
  pill.className = `pill--${currentMode}`;

  // Update canvas aria-label for screen readers
  canvas.setAttribute('aria-label', `Molt Mascot lobster — ${currentMode}`);

  let tip = `${currentMode} for ${formatDuration(duration)}`;
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
let reconnectAttempt = 0;
let reconnectCountdownTimer = null;
const RECONNECT_BASE_MS = 1500;
const RECONNECT_MAX_MS = 30000;

function getReconnectDelay() {
  // Exponential backoff with jitter: 1.5s, 3s, 6s, 12s... capped at 30s
  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt), RECONNECT_MAX_MS);
  const jitter = delay * 0.2 * Math.random();
  reconnectAttempt++;
  return Math.round(delay + jitter);
}

let connectReqId = null;

let pluginStateReqId = null;
const pluginStateMethods = [
  '@molt/mascot-plugin.state',
  // Back-compat aliases (older plugin / older configs)
  'molt-mascot.state',
  'molt-mascot-plugin.state',
  'moltMascot.state',
  'moltMascotPlugin.state',
];
let pluginStateMethodIndex = 0;
let pluginStateMethod = pluginStateMethods[pluginStateMethodIndex];

let pluginResetReqId = null;
const pluginResetMethods = [
  '@molt/mascot-plugin.reset',
  // Back-compat aliases (older plugin / older configs)
  'molt-mascot.reset',
  'molt-mascot-plugin.reset',
  'moltMascot.reset',
  'moltMascotPlugin.reset',
];
let pluginResetMethodIndex = 0;
let pluginResetMethod = pluginResetMethods[pluginResetMethodIndex];

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
  pill.className = 'pill--connecting';

  // Clear any stale reconnect countdown from a previous connection cycle.
  if (reconnectCountdownTimer) {
    clearInterval(reconnectCountdownTimer);
    reconnectCountdownTimer = null;
  }

  if (ws) {
    ws.onclose = null;
    try { ws.close(); } catch {}
    ws = null;
  }

  ws = new WebSocket(cfg.url);

  ws.addEventListener('open', () => {
    // NOTE: Don't reset reconnectAttempt here — only after hello-ok.
    // A successful TCP/WS handshake doesn't mean auth passed; resetting
    // backoff prematurely causes tight reconnect loops on auth failures.
    connectReqId = nextId('c');
    const connectFrame = {
      type: 'req',
      id: connectReqId,
      method: 'connect',
      params: {
        // Default to a safe negotiation range so the mascot works across Gateway versions.
        // (Protocol 3 is preferred, but older Gateways might only speak 2.)
        minProtocol: (function () {
          const raw = window.moltMascot?.env?.minProtocol;
          const v = Number(raw);
          return Number.isFinite(v) && v > 0 ? v : 2;
        })(),
        maxProtocol: (function () {
          const raw = window.moltMascot?.env?.maxProtocol;
          const v = Number(raw);
          return Number.isFinite(v) && v > 0 ? v : 3;
        })(),
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
      reconnectAttempt = 0; // Reset backoff only after successful auth handshake
      pill.textContent = 'connected';
      setMode(Mode.idle);
      // Optional: fetch plugin simplified state once.
      // Prefer the canonical pluginId.action name (plugin id: "@molt/mascot-plugin").
      // If missing, we'll fall back through back-compat aliases.
      pluginStateMethodIndex = 0;
      pluginStateMethod = pluginStateMethods[pluginStateMethodIndex];
      pluginStatePending = false;
      pluginStateLastSentAt = 0;

      pluginResetMethodIndex = 0;
      pluginResetMethod = pluginResetMethods[pluginResetMethodIndex];
      pluginResetReqId = null;

      sendPluginStateReq('s');

      return;
    }

    // Handle connect handshake failure (auth denied, protocol mismatch, etc.)
    // Without this, a rejected connect leaves the pill stuck on "connecting…" forever.
    if (msg.type === 'res' && msg.id && msg.id === connectReqId && !msg.payload?.type?.startsWith('hello')) {
      const err = msg.payload?.error || msg.error;
      const detail = typeof err === 'string' ? err
        : err?.message || err?.code || 'connection rejected';
      lastErrorMessage = truncate(cleanErrorString(String(detail)), 48);
      setMode(Mode.error);
      pill.textContent = lastErrorMessage;
      // Show setup so the user can fix credentials
      showSetup({ url: urlInput.value, token: tokenInput.value });
      return;
    }

    // Any response to the plugin state request clears the in-flight flag,
    // otherwise a single error frame can permanently stall polling.
    if (msg.type === 'res' && msg.id && msg.id === pluginStateReqId) {
      pluginStatePending = false;
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
          // Notify main process so the keyboard toggle stays in sync
          if (window.moltMascot?.setHideText) {
            window.moltMascot.setHideText(nextHideText);
          }
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

    // If the current plugin method isn't installed (older plugin), fall back through aliases.
    if (msg.type === 'res' && msg.id && msg.id === pluginStateReqId && isMissingMethodResponse(msg)) {
      pluginStatePending = false;
      if (pluginStateMethodIndex < pluginStateMethods.length - 1) {
        pluginStateMethodIndex += 1;
        pluginStateMethod = pluginStateMethods[pluginStateMethodIndex];
        pluginStateLastSentAt = 0;
        sendPluginStateReq('s');
        return;
      }
    }

    // If the current plugin reset method isn't installed (older plugin), fall back through aliases.
    if (msg.type === 'res' && msg.id && msg.id === pluginResetReqId && isMissingMethodResponse(msg)) {
      if (pluginResetMethodIndex < pluginResetMethods.length - 1) {
        pluginResetMethodIndex += 1;
        pluginResetMethod = pluginResetMethods[pluginResetMethodIndex];
        const id = nextId('reset');
        pluginResetReqId = id;
        ws.send(JSON.stringify({ type: 'req', id, method: pluginResetMethod, params: {} }));
        return;
      }
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
    pill.className = 'pill--connecting';
    if (window._pollInterval) {
      clearInterval(window._pollInterval);
      window._pollInterval = null;
    }
    if (reconnectCountdownTimer) {
      clearInterval(reconnectCountdownTimer);
      reconnectCountdownTimer = null;
    }
    setMode(Mode.idle);
    const delay = getReconnectDelay();
    const reconnectAt = Date.now() + delay;

    // Live countdown so the user sees progress instead of a static message
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((reconnectAt - Date.now()) / 1000));
      pill.textContent = `reconnecting in ${remaining}s…`;
      pill.className = 'pill--connecting';
    };
    updateCountdown();
    reconnectCountdownTimer = setInterval(updateCountdown, 1000);

    setTimeout(() => {
      if (reconnectCountdownTimer) {
        clearInterval(reconnectCountdownTimer);
        reconnectCountdownTimer = null;
      }
      pill.textContent = 'connecting…';
      pill.className = 'pill--connecting';
      // Re-read config to pickup changes or use current env
      const fresh = loadCfg();
      // If we have a valid config, retry. Otherwise, show setup.
      if (fresh && fresh.url) connect(fresh);
      else showSetup({ url: cfg.url, token: cfg.token });
    }, delay);
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


setup.addEventListener('submit', (e) => {
  e.preventDefault();
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
      pluginResetMethodIndex = 0;
      pluginResetMethod = pluginResetMethods[pluginResetMethodIndex];
      const id = nextId('reset');
      pluginResetReqId = id;
      // Try canonical method first; on older plugins we fall back through aliases.
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

// Double-click pill to copy current status text to clipboard
pill.addEventListener('dblclick', () => {
  const text = pill.textContent || '';
  if (!text || text === 'Initializing...') return;
  navigator.clipboard.writeText(text).then(() => {
    const prev = pill.textContent;
    pill.textContent = 'Copied!';
    setTimeout(() => { pill.textContent = prev; }, 800);
  }).catch(() => {});
});

// Right-click context menu on pill for quick access to common actions
pill.addEventListener('contextmenu', (e) => {
  e.preventDefault();

  // Remove any existing context menu
  const existing = document.getElementById('molt-ctx');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'molt-ctx';
  Object.assign(menu.style, {
    position: 'fixed',
    left: `${Math.min(e.clientX, window.innerWidth - 140)}px`,
    top: `${Math.min(e.clientY, window.innerHeight - 120)}px`,
    background: 'rgba(20,20,20,0.9)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px',
    padding: '4px 0',
    fontSize: '11px',
    color: 'rgba(255,255,255,0.9)',
    backdropFilter: 'blur(12px)',
    zIndex: '9999',
    minWidth: '120px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  });

  const items = [
    { label: `${isClickThrough ? '✓ ' : ''}Ghost Mode`, action: () => {
      if (window.moltMascot?.setClickThrough) {
        isClickThrough = !isClickThrough;
        window.moltMascot.setClickThrough(isClickThrough);
        syncPill();
      }
    }},
    { label: `${isTextHidden ? '✓ ' : ''}Hide Text`, action: () => {
      if (window.moltMascot?.setHideText) {
        isTextHidden = !isTextHidden;
        window.moltMascot.setHideText(isTextHidden);
        updateHudVisibility();
      }
    }},
    { label: 'Reset State', action: () => {
      setMode(Mode.idle);
      if (hasPlugin && ws && ws.readyState === WebSocket.OPEN) {
        pluginResetMethodIndex = 0;
        pluginResetMethod = pluginResetMethods[pluginResetMethodIndex];
        const id = nextId('reset');
        pluginResetReqId = id;
        ws.send(JSON.stringify({ type: 'req', id, method: pluginResetMethod, params: {} }));
      }
    }},
    { label: 'Copy Status', action: () => {
      const text = pill.textContent || '';
      if (text) navigator.clipboard.writeText(text).catch(() => {});
    }},
  ];

  for (const item of items) {
    const row = document.createElement('div');
    row.textContent = item.label;
    Object.assign(row.style, {
      padding: '5px 12px',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    });
    row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.1)'; });
    row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
    row.addEventListener('click', () => { menu.remove(); item.action(); });
    menu.appendChild(row);
  }

  document.body.appendChild(menu);

  // Dismiss on click outside or Escape key
  const dismiss = (ev) => {
    if (!menu.contains(ev.target)) { cleanup(); }
  };
  const onKey = (ev) => {
    if (ev.key === 'Escape') { cleanup(); }
  };
  const cleanup = () => {
    menu.remove();
    document.removeEventListener('click', dismiss, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', cleanup);
  };
  // Use setTimeout so the current click cycle doesn't immediately dismiss
  setTimeout(() => {
    document.addEventListener('click', dismiss, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', cleanup);
  }, 0);
});

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

// Global error handlers: surface uncaught errors in the pill so they're visible
// instead of silently dying in the console.
window.addEventListener('error', (ev) => {
  const msg = ev.message || 'Uncaught error';
  lastErrorMessage = truncate(cleanErrorString(msg), 48);
  setMode(Mode.error);
  if (errorHoldTimer) clearTimeout(errorHoldTimer);
  errorHoldTimer = setTimeout(() => {
    errorHoldTimer = null;
    scheduleIdle(0);
  }, errorHoldMs);
});

window.addEventListener('unhandledrejection', (ev) => {
  const raw = ev.reason;
  const msg = typeof raw === 'string' ? raw : (raw?.message || 'Unhandled promise rejection');
  lastErrorMessage = truncate(cleanErrorString(msg), 48);
  setMode(Mode.error);
  if (errorHoldTimer) clearTimeout(errorHoldTimer);
  errorHoldTimer = setTimeout(() => {
    errorHoldTimer = null;
    scheduleIdle(0);
  }, errorHoldMs);
});

let lastPillSec = -1;
let animFrameId = null;

function frame(t) {
  const idleDur = currentMode === Mode.idle ? Date.now() - modeSince : 0;
  drawLobster(currentMode, manualTime !== null ? manualTime : t, idleDur);
  // Update tooltip duration every second (frame-rate independent)
  const sec = Math.floor(t / 1000);
  if (sec !== lastPillSec) {
    lastPillSec = sec;
    syncPill();
  }
  animFrameId = requestAnimationFrame(frame);
}

function startAnimation() {
  if (animFrameId === null) {
    animFrameId = requestAnimationFrame(frame);
  }
}

function stopAnimation() {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

// Pause animation when the window is hidden/minimized to save CPU.
// requestAnimationFrame already throttles in background tabs in most browsers,
// but Electron BrowserWindows may not honor that—explicit control is safer.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopAnimation();
  } else {
    startAnimation();
  }
});

startAnimation();
