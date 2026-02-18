import { coerceDelayMs, truncate, cleanErrorString, isMissingMethodResponse, isTruthyEnv, formatDuration, getFrameIntervalMs as _getFrameIntervalMs, getReconnectDelayMs, buildTooltip } from './utils.js';
import * as ctxMenu from './context-menu.js';
import { buildDebugInfo as _buildDebugInfo } from './debug-info.js';

const pill = document.getElementById('pill');
const setup = document.getElementById('setup');
const urlInput = document.getElementById('url');
const tokenInput = document.getElementById('token');
const captureDir = (window.moltMascot?.env?.captureDir || '').trim();
const isCapture = Boolean(captureDir);

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// Dynamic canvas scaling: adjust pixel scale based on container size so the lobster
// fills the window proportionally across small/medium/large presets.
// The sprite is 32 rows × 32 cols; we pick the largest integer scale that fits.
const SPRITE_SIZE = 32;
let currentScale = 3; // default for 240×200 (medium)

function recalcCanvasScale() {
  const wrap = document.getElementById('wrap');
  if (!wrap) return;
  // Reserve ~20% for the HUD pill and padding
  const availW = wrap.clientWidth * 0.9;
  const availH = wrap.clientHeight * 0.8;
  const maxScale = Math.max(2, Math.floor(Math.min(availW / SPRITE_SIZE, availH / SPRITE_SIZE)));
  if (maxScale !== currentScale) {
    currentScale = maxScale;
    canvas.width = SPRITE_SIZE * currentScale;
    canvas.height = SPRITE_SIZE * currentScale;
  }
}

recalcCanvasScale();
// Re-check on resize (triggered by Electron setSize via cycleSize).
// Debounced to avoid redundant recalculations during rapid resize sequences
// (e.g. display-metrics-changed firing multiple times in quick succession).
let _resizeTimer = null;
function _debouncedRecalcScale() {
  if (_resizeTimer) clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => { _resizeTimer = null; recalcCanvasScale(); }, 50);
}
window.addEventListener('resize', _debouncedRecalcScale);

const STORAGE_KEY = 'moltMascot:gateway';

const DEFAULT_IDLE_DELAY_MS = 800;
const DEFAULT_ERROR_HOLD_MS = 5000;
// How long (seconds) the mascot must be idle before showing the sleeping state (ZZZ overlay).
// 120s avoids false "sleeping" during normal usage pauses between queries.
// Configurable via MOLT_MASCOT_SLEEP_THRESHOLD_S env var.
const DEFAULT_SLEEP_THRESHOLD_S = 120;
const SLEEP_THRESHOLD_S = (() => {
  const raw = window.moltMascot?.env?.sleepThresholdS;
  if (raw === '' || raw === null || raw === undefined) return DEFAULT_SLEEP_THRESHOLD_S;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_SLEEP_THRESHOLD_S;
})();
const SLEEP_THRESHOLD_MS = SLEEP_THRESHOLD_S * 1000;

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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // Storage full or unavailable (e.g. private browsing) — silently ignore.
    // The app will still work for the current session; credentials just won't persist.
  }
}

function showSetup(prefill) {
  if (isCapture) return;
  setup.hidden = false;
  // Re-enable form controls in case they were disabled during a connection attempt
  const saveBtnEl = document.getElementById('save');
  if (saveBtnEl) { saveBtnEl.disabled = false; saveBtnEl.textContent = 'Save + connect'; }
  urlInput.disabled = false;
  tokenInput.disabled = false;
  // Only show Cancel button when there's a saved config to fall back to
  const cancelBtn = document.getElementById('cancel');
  if (cancelBtn) cancelBtn.hidden = !loadCfg()?.url;
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
  // Show version in setup form so users can identify their build
  const versionEl = document.getElementById('setup-version');
  if (versionEl && window.moltMascot?.version) {
    versionEl.textContent = `v${window.moltMascot.version}`;
  }
}

import { drawLobster as _drawLobster, createBlinkState } from './draw.js';
import { createPluginSync } from './plugin-sync.js';

// Respect prefers-reduced-motion: disable bobbing, blinking, and pill pulse animation.
const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
let reducedMotion = motionQuery?.matches ?? false;
const _onMotionChange = (e) => { reducedMotion = e.matches; };
motionQuery?.addEventListener?.('change', _onMotionChange);

// Blink state (delegated to extracted module for testability)
const _blinkState = createBlinkState();

function drawLobster(mode, t, idleDurationMs = 0) {
  _drawLobster(ctx, {
    mode,
    t,
    scale: currentScale,
    spriteSize: SPRITE_SIZE,
    reducedMotion,
    blinking: _blinkState.isBlinking(t),
    idleDurationMs,
    sleepThresholdMs: SLEEP_THRESHOLD_MS,
    canvas,
  });
}

// --- State machine ---
const Mode = {
  idle: 'idle',
  thinking: 'thinking',
  tool: 'tool',
  error: 'error',
  connecting: 'connecting',
  connected: 'connected',
  disconnected: 'disconnected',
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

// Track alignment from IPC (keyboard shortcut cycling) — separate from plugin sync.
let lastPluginAlignment = null;
let currentSizeLabel = 'medium';
let pluginVersion = '';
let pluginToolCalls = 0;
let pluginToolErrors = 0;
let pluginStartedAt = null;

// Centralized plugin state synchronizer (change-detection + dispatch).
const _pluginSync = createPluginSync({
  onClickThrough(v) {
    if (window.moltMascot?.setClickThrough) {
      isClickThrough = v;
      window.moltMascot.setClickThrough(v);
      syncPill();
    }
  },
  onAlignment(v) {
    lastPluginAlignment = v;
    if (window.moltMascot?.setAlignment) window.moltMascot.setAlignment(v);
  },
  onOpacity(v) {
    if (window.moltMascot?.setOpacity) {
      currentOpacity = v;
      window.moltMascot.setOpacity(v);
    }
  },
  onPadding(v) {
    if (window.moltMascot?.setPadding) window.moltMascot.setPadding(v);
  },
  onSize(v) {
    if (window.moltMascot?.setSize) {
      currentSizeLabel = v;
      window.moltMascot.setSize(v);
    }
  },
  onHideText(v) {
    isTextHidden = v;
    updateHudVisibility();
    if (window.moltMascot?.setHideText) window.moltMascot.setHideText(v);
  },
  onVersion(v) { pluginVersion = v; },
  onToolCalls(v) { pluginToolCalls = v; },
  onToolErrors(v) { pluginToolErrors = v; },
  onStartedAt(v) { pluginStartedAt = v; },
});

// Guard: while > 0, syncPill() skips updates so clipboard "Copied!" feedback stays visible.
let copiedUntil = 0;

/**
 * Show "Copied!" in the pill for a brief period, suppressing syncPill() updates.
 * This prevents the 1-second pill refresh from immediately overwriting the feedback.
 */
function showCopiedFeedback() {
  pill.textContent = 'Copied ✓';
  pill.className = 'pill--idle';
  copiedUntil = Date.now() + 700;
}

function syncPill() {
  // Don't overwrite "Copied!" feedback while it's showing
  if (copiedUntil > 0) {
    if (Date.now() < copiedUntil) return;
    copiedUntil = 0;
  }
  // Dynamically adjust aria-live so error announcements are immediate (assertive)
  // while routine status updates remain polite and non-intrusive.
  const ariaLive = currentMode === Mode.error ? 'assertive' : 'polite';
  if (pill.getAttribute('aria-live') !== ariaLive) {
    pill.setAttribute('aria-live', ariaLive);
  }

  const duration = Math.max(0, Math.round((Date.now() - modeSince) / 1000));

  let label = currentMode.charAt(0).toUpperCase() + currentMode.slice(1);
  if (currentMode === Mode.connected) {
    label = 'Connected ✓';
  }
  if (currentMode === Mode.idle && duration > SLEEP_THRESHOLD_S) {
    label = `Sleeping ${formatDuration(duration)}`;
  }
  if (currentMode === Mode.connecting && duration > 2) {
    label = `Connecting… ${formatDuration(duration)}`;
  }
  if (currentMode === Mode.disconnected) {
    label = `Disconnected ${formatDuration(duration)}`;
  }
  if (currentMode === Mode.thinking && duration > 2) {
    label = `Thinking ${formatDuration(duration)}`;
  }
  if (currentMode === Mode.tool && currentTool) {
    label = duration > 2
      ? truncate(`${currentTool} ${formatDuration(duration)}`, 32)
      : truncate(currentTool, 24);
  }
  if (currentMode === Mode.error && lastErrorMessage) {
    // UX Polish: show actual error in the HUD (truncated)
    label = truncate(lastErrorMessage, 48);
  }
  
  if (isClickThrough) {
    label += ' 👻';
  }

  pill.textContent = label;

  // Color-coded pill background per mode (sleeping gets its own class)
  const isSleeping = currentMode === Mode.idle && duration > SLEEP_THRESHOLD_S;
  pill.className = isSleeping ? 'pill--sleeping' : `pill--${currentMode}`;

  // Update canvas aria-label for screen readers (use display mode, not raw mode)
  const ariaMode = isSleeping ? 'sleeping' : currentMode;
  canvas.setAttribute('aria-label', `Molt Mascot lobster — ${ariaMode}`);

  const displayMode = currentMode === Mode.connected ? 'connected'
    : (currentMode === Mode.idle && duration > SLEEP_THRESHOLD_S) ? 'sleeping' : currentMode;
  const tip = buildTooltip({
    displayMode,
    durationSec: duration,
    lastErrorMessage: currentMode === Mode.error ? lastErrorMessage : undefined,
    isClickThrough,
    connectedSince,
    connectedUrl,
    reconnectAttempt,
    pluginToolCalls,
    pluginToolErrors,
    appVersion: window.moltMascot?.version,
    pluginVersion,
  });
  pill.title = tip;
  // Mirror tooltip on the canvas so hovering the lobster sprite also shows status
  canvas.title = tip;
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
  // Clear stale tool name when leaving tool mode so it doesn't linger
  // if the plugin connection drops and native events take over.
  if (mode !== Mode.tool) currentTool = '';
  syncPill();
}

/**
 * Show an error message in the pill for errorHoldMs, then revert to idle.
 * Centralizes the repeated error-hold-then-idle pattern used by agent lifecycle,
 * WebSocket errors, and global uncaught error handlers.
 */
function showError(rawMessage, fallback = 'error') {
  lastErrorMessage = truncate(cleanErrorString(rawMessage || fallback), 48);
  if (currentMode === Mode.error) {
    // Already in error mode — setMode would early-return, so manually update
    // the pill text and re-trigger the shake animation for the new error.
    if (errorHoldTimer) clearTimeout(errorHoldTimer);
    // Force CSS animation restart by briefly removing the class
    pill.classList.remove('pill--error');
    // Reading offsetWidth forces a reflow so the browser registers the class removal
    // before re-adding it — necessary for animation restart.
    void pill.offsetWidth;
    pill.classList.add('pill--error');
    syncPill();
  } else {
    setMode(Mode.error);
  }
  if (errorHoldTimer) clearTimeout(errorHoldTimer);
  errorHoldTimer = setTimeout(() => {
    errorHoldTimer = null;
    scheduleIdle(0);
  }, errorHoldMs);
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
let reconnectTimer = null;    // setTimeout id for the reconnect attempt itself
let connectedSince = null;   // Date.now() when gateway handshake succeeded
let connectedUrl = '';        // URL of the current gateway connection
let lastDisconnectedAt = null; // Date.now() when the last disconnect occurred
const RECONNECT_BASE_MS = 1500;
const RECONNECT_MAX_MS = 30000;

// Application-level connection health check.
// If no WS message is received within this window, assume the connection is
// stale (zombie TCP) and force a reconnect. The 1s plugin poller ensures
// at least one message per second on a healthy connection, so 15s is generous.
const STALE_CONNECTION_MS = 15000;
const STALE_CHECK_INTERVAL_MS = 5000;
let lastMessageAt = 0;
let staleCheckTimer = null;

function startStaleCheck() {
  stopStaleCheck();
  lastMessageAt = Date.now();
  staleCheckTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!connectedSince) return; // Not yet handshaked
    if (Date.now() - lastMessageAt > STALE_CONNECTION_MS) {
      // eslint-disable-next-line no-console
      console.warn('molt-mascot: connection stale, forcing reconnect');
      showError('connection stale');
      try { ws.close(); } catch {}
    }
  }, STALE_CHECK_INTERVAL_MS);
}

function stopStaleCheck() {
  if (staleCheckTimer) {
    clearInterval(staleCheckTimer);
    staleCheckTimer = null;
  }
}

function getReconnectDelay() {
  const delay = getReconnectDelayMs(reconnectAttempt, {
    baseMs: RECONNECT_BASE_MS,
    maxMs: RECONNECT_MAX_MS,
  });
  reconnectAttempt++;
  return delay;
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
  try {
    ws.send(JSON.stringify({ type: 'req', id, method: pluginStateMethod, params: {} }));
  } catch {
    // Socket closed between readyState check and send — clear pending flag
    // so the next poll can retry instead of permanently stalling.
    pluginStatePending = false;
  }
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
  currentMode = Mode.connecting;
  modeSince = Date.now();
  pill.textContent = 'connecting…';
  pill.className = 'pill--connecting';

  // Clear any stale reconnect timers from a previous connection cycle.
  if (reconnectCountdownTimer) {
    clearInterval(reconnectCountdownTimer);
    reconnectCountdownTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (ws) {
    ws.onclose = null;
    try { ws.close(); } catch {}
    ws = null;
  }

  try {
    ws = new WebSocket(cfg.url);
  } catch (err) {
    // Invalid URL (e.g. empty string, missing protocol) throws synchronously.
    // Surface the error instead of crashing the renderer.
    showError(err?.message || 'Invalid WebSocket URL');
    showSetup(cfg);
    return;
  }

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
    try {
      ws.send(JSON.stringify(connectFrame));
    } catch (err) {
      // Socket may have transitioned to CLOSING/CLOSED between the 'open' event
      // and the send call. Surface the error instead of crashing the renderer.
      showError(err?.message || 'Failed to send connect frame');
    }
  });

  ws.addEventListener('message', (ev) => {
    lastMessageAt = Date.now();
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
      connectedSince = Date.now();
      connectedUrl = cfg.url || '';
      startStaleCheck();
      // Brief "Connected ✓" flash with sparkle animation so the user sees
      // the handshake succeeded before settling into idle mode.
      pill.textContent = 'Connected ✓';
      pill.className = 'pill--connected';
      currentMode = Mode.connected;
      modeSince = Date.now();
      // Transition to idle after the celebration
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setMode(Mode.idle), 2000);
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
      // Show setup so the user can fix credentials.
      // Use the actual URL/token we connected with (from cfg) rather than stale input values,
      // so the form reflects what was attempted — especially important when env vars seeded the config.
      showSetup(cfg);
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

      // Sync all plugin config properties via centralized change-detection.
      _pluginSync.sync(msg.payload.state);

      const nextErr = msg.payload?.state?.lastError?.message;
      if (nextMode === Mode.error && typeof nextErr === 'string' && nextErr.trim()) {
        lastErrorMessage = nextErr.trim();
      }
      // Don't let a plugin idle state cut short the connection celebration sparkle.
      // Active states (thinking/tool/error) override immediately.
      if (currentMode === Mode.connected && nextMode === 'idle') {
        // Let the 2s timer handle the transition naturally.
      } else {
        setMode(nextMode);
      }
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
        try {
          ws.send(JSON.stringify({ type: 'req', id, method: pluginResetMethod, params: {} }));
        } catch {
          // Socket closed between readyState check and send — best-effort.
        }
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
          showError(raw, 'agent error');
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

  ws.onclose = (ev) => {
    hasPlugin = false;
    pluginPollerStarted = false;
    pluginStatePending = false;
    pluginStateLastSentAt = 0;
    lastDisconnectedAt = Date.now();
    connectedSince = null;
    connectedUrl = '';
    // Reset cached plugin state so re-syncing works after reconnect.
    // Without this, change-detection guards suppress identical values
    // from a fresh plugin handshake, leaving stale local config.
    _pluginSync.reset();
    stopStaleCheck();
    // Surface close code for debugging (1006 = abnormal, 1000 = normal, etc.)
    const closeCode = ev?.code;
    const closeReason = (ev?.reason || '').trim();
    const disconnectLabel = closeReason
      ? `disconnected: ${truncate(closeReason, 32)}`
      : (closeCode && closeCode !== 1000 ? `disconnected (${closeCode})` : 'disconnected');
    pill.textContent = disconnectLabel;
    pill.className = 'pill--disconnected';
    if (window._pollInterval) {
      clearInterval(window._pollInterval);
      window._pollInterval = null;
    }
    if (reconnectCountdownTimer) {
      clearInterval(reconnectCountdownTimer);
      reconnectCountdownTimer = null;
    }
    setMode(Mode.disconnected);
    const delay = getReconnectDelay();
    const reconnectAt = Date.now() + delay;

    // Live countdown so the user sees progress instead of a static message
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((reconnectAt - Date.now()) / 1000));
      pill.textContent = `reconnecting in ${remaining}s…`;
      pill.className = 'pill--disconnected';
    };
    updateCountdown();
    reconnectCountdownTimer = setInterval(updateCountdown, 1000);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
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
    // Only show a generic message if we don't already have a more specific error
    // (e.g. auth failure from the connect handshake). The 'error' event fires
    // before 'close', so blindly overwriting loses useful context.
    // If we're already in error mode with a specific message, don't reset the
    // timer and duration counter — that causes a visual "jump" for no reason.
    if (currentMode === Mode.error && lastErrorMessage) return;
    showError(lastErrorMessage || 'WebSocket error');
  });
}


// Clear validation error as user types (prevents sticky custom validity)
urlInput.addEventListener('input', () => urlInput.setCustomValidity(''));

// Dismiss setup form and reconnect with saved config (shared by ESC key and Cancel button).
function dismissSetup() {
  if (setup.hidden) return;
  const cfg = loadCfg();
  if (cfg?.url) {
    setup.hidden = true;
    connect(cfg);
  }
}

// ESC dismisses the setup form if we have a saved config (reconnect with existing creds)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !setup.hidden) dismissSetup();
});

// Cancel button dismisses the setup form (visible alternative to ESC)
const cancelBtn = document.getElementById('cancel');
if (cancelBtn) {
  cancelBtn.addEventListener('click', dismissSetup);
}

const saveBtn = document.getElementById('save');

setup.addEventListener('submit', (e) => {
  e.preventDefault();
  let url = urlInput.value.trim();

  // Auto-normalize http(s) URLs to ws(s) so users can paste Gateway URLs directly.
  // Matches the same normalization in tools/ws-dump.ts for consistency.
  if (/^https:\/\//i.test(url)) url = url.replace(/^https:\/\//i, 'wss://');
  else if (/^http:\/\//i.test(url)) url = url.replace(/^http:\/\//i, 'ws://');

  // Validate WebSocket URL before attempting connection
  if (url && !/^wss?:\/\/.+/i.test(url)) {
    urlInput.setCustomValidity('URL must start with ws:// or wss://');
    urlInput.reportValidity();
    return;
  }
  urlInput.setCustomValidity('');

  // Disable form controls while connecting to prevent double-submits
  // and provide visual feedback that the connection attempt is in progress.
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Connecting…';
  }
  urlInput.disabled = true;
  tokenInput.disabled = true;

  const cfg = { url, token: tokenInput.value.trim() };
  saveCfg(cfg);
  connect(cfg);
});

// IPC listener subscriptions — store unsubscribe functions for cleanup on unload.
const ipcUnsubs = [];

/**
 * Reset the mascot state locally and (if connected) on the plugin side.
 * Extracted to avoid duplicating the reset sequence across IPC + context menu.
 */
function resetState() {
  setMode(Mode.idle);
  if (hasPlugin && ws && ws.readyState === WebSocket.OPEN) {
    pluginResetMethodIndex = 0;
    pluginResetMethod = pluginResetMethods[pluginResetMethodIndex];
    const id = nextId('reset');
    pluginResetReqId = id;
    try {
      ws.send(JSON.stringify({ type: 'req', id, method: pluginResetMethod, params: {} }));
    } catch {
      // Socket closed between readyState check and send — best-effort.
    }
  }
}

if (window.moltMascot?.onReset) {
  ipcUnsubs.push(window.moltMascot.onReset(() => {
    // eslint-disable-next-line no-console
    console.log('Resetting state...');
    resetState();
  }));
}

if (window.moltMascot?.onClickThrough) {
  ipcUnsubs.push(window.moltMascot.onClickThrough((enabled) => {
    isClickThrough = Boolean(enabled);
    syncPill();
  }));
}

if (window.moltMascot?.onHideText) {
  ipcUnsubs.push(window.moltMascot.onHideText((hidden) => {
    isTextHidden = hidden;
    updateHudVisibility();
  }));
}

if (window.moltMascot?.onAlignment) {
  ipcUnsubs.push(window.moltMascot.onAlignment((alignment) => {
    lastPluginAlignment = alignment;
    syncPill();
  }));
}

if (window.moltMascot?.onSize) {
  ipcUnsubs.push(window.moltMascot.onSize((size) => {
    currentSizeLabel = size;
  }));
}

let currentOpacity = 1.0;
if (window.moltMascot?.onOpacity) {
  ipcUnsubs.push(window.moltMascot.onOpacity((opacity) => {
    currentOpacity = opacity;
  }));
}

// Double-click pill to copy current status text to clipboard
pill.addEventListener('dblclick', () => {
  const text = pill.textContent || '';
  if (!text || text === 'Initializing...') return;
  navigator.clipboard.writeText(text).then(() => {
    showCopiedFeedback();
  }).catch(() => {});
});

// Keyboard: Enter or Space on the pill opens the context menu (a11y)
pill.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    const rect = pill.getBoundingClientRect();
    pill.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: rect.left,
      clientY: rect.bottom + 4,
    }));
  }
});

/**
 * Build a multi-line debug info string for diagnostics.
 * Delegates to the extracted debug-info module, passing current renderer state.
 */
function buildDebugInfo() {
  return _buildDebugInfo({
    currentMode,
    modeSince,
    connectedSince,
    connectedUrl,
    lastDisconnectedAt,
    hasPlugin,
    pluginStateMethod,
    pluginStartedAt,
    pluginToolCalls,
    pluginToolErrors,
    currentTool,
    lastErrorMessage,
    alignmentLabel: lastPluginAlignment,
    sizeLabel: currentSizeLabel,
    opacity: currentOpacity,
    isClickThrough,
    isTextHidden,
    sleepThresholdS: SLEEP_THRESHOLD_S,
    idleDelayMs,
    errorHoldMs,
    reducedMotion,
    frameIntervalMs: getFrameIntervalMs(),
    reconnectAttempt,
    canvasScale: currentScale,
    appVersion: window.moltMascot?.version,
    pluginVersion,
    wsReadyState: ws?.readyState,
    savedUrl: !connectedSince ? loadCfg()?.url : undefined,
    platform: navigator.platform,
    devicePixelRatio: window.devicePixelRatio,
    memory: performance?.memory,
    versions: window.moltMascot?.versions,
    processUptimeS: window.moltMascot?.processUptimeS?.(),
  });
}

// Expose for testing
window.__moltMascotBuildDebugInfo = buildDebugInfo;

// Right-click context menu on pill or canvas for quick access to common actions.
// Users often right-click the lobster sprite rather than the tiny pill, so both
// elements open the same context menu for discoverability.
function showContextMenu(e) {
  e.preventDefault();

  const isMac = navigator.platform?.startsWith('Mac') || navigator.userAgent?.includes('Mac');
  const modKey = isMac ? '⌘' : 'Ctrl';

  // Build a status summary line for the context menu header
  const statusParts = [currentMode.charAt(0).toUpperCase() + currentMode.slice(1)];
  const modeDur = Math.max(0, Math.round((Date.now() - modeSince) / 1000));
  if (modeDur > 0) statusParts[0] += ` (${formatDuration(modeDur)})`;
  if (connectedSince) {
    const upSec = Math.max(0, Math.round((Date.now() - connectedSince) / 1000));
    statusParts.push(`↑ ${formatDuration(upSec)}`);
  }
  if (pluginToolCalls > 0) {
    const statsStr = pluginToolErrors > 0
      ? `${pluginToolCalls} calls, ${pluginToolErrors} err`
      : `${pluginToolCalls} calls`;
    statusParts.push(statsStr);
  }

  ctxMenu.show([
    { label: statusParts.join(' · '), disabled: true },
    { separator: true },
    { label: `${isClickThrough ? '✓ ' : ''}Ghost Mode`, hint: `${modKey}⇧M`, action: () => {
      if (window.moltMascot?.setClickThrough) {
        isClickThrough = !isClickThrough;
        window.moltMascot.setClickThrough(isClickThrough);
        syncPill();
      }
    }},
    { label: `${isTextHidden ? '✓ ' : ''}Hide Text`, hint: `${modKey}⇧H`, action: () => {
      if (window.moltMascot?.setHideText) {
        isTextHidden = !isTextHidden;
        window.moltMascot.setHideText(isTextHidden);
        updateHudVisibility();
      }
    }},
    { label: 'Reset State', hint: `${modKey}⇧R`, action: resetState },
    { label: `Cycle Alignment (${lastPluginAlignment || 'bottom-right'})`, hint: `${modKey}⇧A`, action: () => {
      if (window.moltMascot?.cycleAlignment) window.moltMascot.cycleAlignment();
    }},
    { label: 'Snap to Position', hint: `${modKey}⇧S`, action: () => {
      if (window.moltMascot?.snapToPosition) window.moltMascot.snapToPosition();
    }},
    { label: `Cycle Size (${currentSizeLabel})`, hint: `${modKey}⇧Z`, action: () => {
      if (window.moltMascot?.cycleSize) window.moltMascot.cycleSize();
    }},
    { label: `Opacity (${Math.round(currentOpacity * 100)}%)`, hint: `${modKey}⇧O`, action: () => {
      if (window.moltMascot?.cycleOpacity) window.moltMascot.cycleOpacity();
    }},
    { label: 'Copy Status', action: () => {
      const text = pill.textContent || '';
      if (text) navigator.clipboard.writeText(text).then(() => {
        showCopiedFeedback();
      }).catch(() => {});
    }},
    { label: 'Copy Debug Info', action: () => {
      const text = buildDebugInfo();
      navigator.clipboard.writeText(text).then(() => {
        showCopiedFeedback();
      }).catch(() => {});
    }},
    { label: connectedSince ? 'Force Reconnect' : 'Reconnect Now', action: () => {
      // Force an immediate reconnect, bypassing the exponential backoff timer.
      // Works even when connected (useful for config changes or stale connections).
      reconnectAttempt = 0; // reset backoff
      if (reconnectCountdownTimer) {
        clearInterval(reconnectCountdownTimer);
        reconnectCountdownTimer = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws) {
        ws.onclose = null;
        try { ws.close(); } catch {}
        ws = null;
      }
      const cfg = loadCfg();
      if (cfg?.url) connect(cfg);
      else showSetup({ url: 'ws://127.0.0.1:18789', token: '' });
    }},
    { label: 'Change Gateway…', action: () => {
      const cfg = loadCfg();
      showSetup(cfg || { url: 'ws://127.0.0.1:18789', token: '' });
    }},
    { label: 'Hide Mascot', hint: `${modKey}⇧V`, action: () => {
      if (window.moltMascot?.hide) window.moltMascot.hide();
    }},
    { separator: true },
    { label: 'About Molt Mascot', action: () => {
      if (window.moltMascot?.showAbout) window.moltMascot.showAbout();
    }},
    { label: 'DevTools', hint: `${modKey}⇧D`, action: () => {
      if (window.moltMascot?.toggleDevTools) window.moltMascot.toggleDevTools();
    }},
    { label: 'Quit', hint: `${modKey}⌥Q`, action: () => {
      if (window.moltMascot?.quit) window.moltMascot.quit();
      else window.close();
    }},
  ], { x: e.clientX, y: e.clientY });
}

pill.addEventListener('contextmenu', showContextMenu);
canvas.addEventListener('contextmenu', showContextMenu);

// boot
if (isCapture) {
  setup.hidden = true;
  pill.textContent = 'demo';
} else {
  const cfg = loadCfg();
  let envUrl = (window.moltMascot?.env?.gatewayUrl || '').trim();
  // Normalize http(s) to ws(s) for env-seeded URLs too
  if (/^https:\/\//i.test(envUrl)) envUrl = envUrl.replace(/^https:\/\//i, 'wss://');
  else if (/^http:\/\//i.test(envUrl)) envUrl = envUrl.replace(/^http:\/\//i, 'ws://');
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
  showError(ev.message, 'Uncaught error');
});

window.addEventListener('unhandledrejection', (ev) => {
  const raw = ev.reason;
  const msg = typeof raw === 'string' ? raw : (raw?.message || 'Unhandled promise rejection');
  showError(msg, 'Unhandled promise rejection');
});

let lastPillSec = -1;
let lastPillMin = -1;
let animFrameId = null;
let lastFrameAt = 0;

// Throttle frame rate when idle/sleeping to save CPU.
// Delegates to the pure utility function for testability.
function getFrameIntervalMs() {
  const idleDur = currentMode === Mode.idle ? Date.now() - modeSince : 0;
  return _getFrameIntervalMs(currentMode, idleDur, SLEEP_THRESHOLD_MS, reducedMotion);
}

function frame(t) {
  const interval = getFrameIntervalMs();
  if (interval > 0 && t - lastFrameAt < interval) {
    animFrameId = requestAnimationFrame(frame);
    return;
  }
  lastFrameAt = t;

  const idleDur = currentMode === Mode.idle ? Date.now() - modeSince : 0;
  const isSleeping = currentMode === Mode.idle && idleDur > SLEEP_THRESHOLD_MS;
  drawLobster(currentMode, manualTime !== null ? manualTime : t, idleDur);

  // Update pill text at an appropriate cadence:
  // - Sleeping: once per minute (text shows "Sleeping Xm", minute-level granularity)
  // - Active modes: once per second (shows seconds-level counters)
  // This avoids ~60 redundant syncPill() calls per minute while sleeping.
  if (isSleeping) {
    const min = Math.floor(t / 60000);
    if (min !== lastPillMin) {
      lastPillMin = min;
      lastPillSec = -1; // reset so waking up refreshes immediately
      syncPill();
    }
  } else {
    const sec = Math.floor(t / 1000);
    if (sec !== lastPillSec) {
      lastPillSec = sec;
      lastPillMin = -1; // reset so entering sleep refreshes immediately
      syncPill();
    }
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
    // Dismiss any open context menu when the window is hidden (e.g. via ⌘⇧V toggle)
    // to prevent stale menus lingering when the window reappears.
    ctxMenu.dismiss();
  } else {
    startAnimation();
  }
});

// Cleanup on page unload (prevents leaked intervals/sockets during hot-reload or navigation)
window.addEventListener('beforeunload', () => {
  stopAnimation();
  if (window._pollInterval) {
    clearInterval(window._pollInterval);
    window._pollInterval = null;
  }
  if (reconnectCountdownTimer) {
    clearInterval(reconnectCountdownTimer);
    reconnectCountdownTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopStaleCheck();
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (errorHoldTimer) {
    clearTimeout(errorHoldTimer);
    errorHoldTimer = null;
  }
  if (ws) {
    ws.onclose = null;
    try { ws.close(); } catch {}
    ws = null;
  }
  // Remove media-query listener to avoid leaks during hot-reload
  motionQuery?.removeEventListener?.('change', _onMotionChange);
  // Cancel debounced resize timer
  if (_resizeTimer) { clearTimeout(_resizeTimer); _resizeTimer = null; }
  // Unsubscribe IPC listeners to prevent leaked handlers during hot-reload
  for (const unsub of ipcUnsubs) {
    try { unsub?.(); } catch {}
  }
  ipcUnsubs.length = 0;
});

startAnimation();
