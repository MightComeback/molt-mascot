import { capitalize, coerceDelayMs, truncate, cleanErrorString, isMissingMethodResponse, isTruthyEnv, formatDuration, formatElapsed, formatLatency, getFrameIntervalMs as _getFrameIntervalMs, getReconnectDelayMs, buildTooltip, normalizeWsUrl, formatCloseDetail, successRate, PLUGIN_STATE_METHODS, PLUGIN_RESET_METHODS, MODE_EMOJI } from './utils.js';
import * as ctxMenu from './context-menu.js';
import { buildDebugInfo as _buildDebugInfo } from './debug-info.js';
import { createFpsCounter } from './fps-counter.js';

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

// Stable instance ID across reconnects so the gateway can track this client
// as a single session rather than treating each reconnect as a new client.
const INSTANCE_ID = `moltMascot-${Math.random().toString(16).slice(2)}`;

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
  // Programmatically focus the URL input since the HTML autofocus attribute
  // only fires on initial page load, not when the form is dynamically shown.
  // Use requestAnimationFrame to ensure the DOM is ready and focus is reliable.
  requestAnimationFrame(() => urlInput.focus());
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
const Mode = Object.freeze({
  idle: 'idle',
  thinking: 'thinking',
  tool: 'tool',
  error: 'error',
  connecting: 'connecting',
  connected: 'connected',
  disconnected: 'disconnected',
});

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
let pluginActiveAgents = 0;
let pluginActiveTools = 0;

// Rolling latency buffer for min/max/avg diagnostics in debug info.
// Keeps the last ~60 samples (one per second via the plugin poller).
const LATENCY_BUFFER_MAX = 60;
const _latencyBuffer = [];

/**
 * Push a latency sample into the rolling buffer.
 * @param {number} ms - Round-trip latency in milliseconds
 */
function pushLatencySample(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return;
  _latencyBuffer.push(ms);
  if (_latencyBuffer.length > LATENCY_BUFFER_MAX) _latencyBuffer.shift();
}

/**
 * Compute min/max/avg latency from the rolling buffer.
 * @returns {{ min: number, max: number, avg: number, samples: number } | null}
 */
function getLatencyStats() {
  if (_latencyBuffer.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let i = 0; i < _latencyBuffer.length; i++) {
    const v = _latencyBuffer[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return {
    min: Math.round(min),
    max: Math.round(max),
    avg: Math.round(sum / _latencyBuffer.length),
    samples: _latencyBuffer.length,
  };
}

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
  onActiveAgents(v) { pluginActiveAgents = v; },
  onActiveTools(v) { pluginActiveTools = v; },
  onCurrentTool(v) {
    if (v !== currentTool) {
      currentTool = v;
      if (currentMode === Mode.tool) syncPill();
    }
  },
});

// Track the last mode reported to the main process (including 'sleeping') to avoid
// redundant IPC and to enable sleeping-state tray icon dot.
let _lastReportedMode = 'idle';
let _lastReportedTool = '';
// Timestamp of last tray state IPC to ensure periodic refresh of stats
// (latency, toolCalls, sessionConnectCount, etc.) even when mode/tool are unchanged.
let _lastTrayIpcAt = 0;
const _TRAY_IPC_INTERVAL_MS = 5000;

// Guard: while > 0, syncPill() skips updates so clipboard "Copied!" feedback stays visible.
let copiedUntil = 0;

/**
 * Show "Copied!" in the pill for a brief period, suppressing syncPill() updates.
 * This prevents the 1-second pill refresh from immediately overwriting the feedback.
 */
function showCopiedFeedback() {
  showTransientFeedback('Copied ✓', 700);
}

/**
 * Show transient feedback text in the pill for a brief period, suppressing
 * syncPill() updates so the message isn't immediately overwritten.
 * Used for clipboard confirmation, opacity scroll feedback, etc.
 *
 * @param {string} text - Text to display in the pill
 * @param {number} [durationMs=700] - How long to show the feedback
 * @param {string} [pillClass='pill--idle'] - CSS class for the pill during feedback
 */
function showTransientFeedback(text, durationMs = 700, pillClass) {
  pill.textContent = text;
  // Preserve the current pill color when no explicit class is given,
  // so feedback like "Opacity 80%" doesn't flash to idle-green while
  // the mascot is in thinking/error/tool mode.
  if (pillClass !== undefined) pill.className = pillClass;
  copiedUntil = Date.now() + durationMs;
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

  let label = capitalize(currentMode);
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
    label = lastCloseDetail
      ? truncate(`Disconnected: ${lastCloseDetail}`, 40)
      : `Disconnected ${formatDuration(duration)}`;
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

  // Expose effective mode on <body> so external CSS/automation can target state.
  const bodyMode = isSleeping ? 'sleeping' : currentMode;
  if (document.body.dataset.mode !== bodyMode) document.body.dataset.mode = bodyMode;

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
    lastCloseDetail: lastCloseDetail || undefined,
    lastDisconnectedAt,
    pluginToolCalls,
    pluginToolErrors,
    currentTool: currentMode === Mode.tool ? currentTool : undefined,
    isTextHidden,
    alignment: lastPluginAlignment,
    sizeLabel: currentSizeLabel,
    opacity: currentOpacity,
    appVersion: window.moltMascot?.version,
    pluginVersion,
    pluginStartedAt,
    sessionConnectCount,
    latencyMs,
    activeAgents: pluginActiveAgents,
    activeTools: pluginActiveTools,
    targetUrl: !connectedSince ? (loadCfg()?.url || undefined) : undefined,
  });
  pill.title = tip;
  // Mirror tooltip on the canvas so hovering the lobster sprite also shows status
  canvas.title = tip;
  updateHudVisibility();

  // Notify main process of the effective display mode (including 'sleeping')
  // so the tray icon status dot and tooltip reflect the visual state.
  const effectiveMode = isSleeping ? 'sleeping' : currentMode;
  const effectiveTool = currentTool || '';
  const now = Date.now();
  const modeOrToolChanged = effectiveMode !== _lastReportedMode || effectiveTool !== _lastReportedTool;
  // Periodically refresh tray stats (latency, toolCalls, sessionConnectCount, etc.)
  // even when mode/tool are unchanged, so the tray tooltip stays accurate.
  const periodicRefresh = now - _lastTrayIpcAt >= _TRAY_IPC_INTERVAL_MS;
  if (modeOrToolChanged || periodicRefresh) {
    _lastReportedMode = effectiveMode;
    _lastReportedTool = effectiveTool;
    _lastTrayIpcAt = now;
    if (window.moltMascot?.updateMode) window.moltMascot.updateMode({
      mode: effectiveMode,
      latency: latencyMs,
      tool: effectiveTool || null,
      errorMessage: currentMode === Mode.error ? lastErrorMessage || null : null,
      toolCalls: pluginToolCalls || 0,
      toolErrors: pluginToolErrors || 0,
      closeDetail: lastCloseDetail || null,
      reconnectAttempt: reconnectAttempt || 0,
      targetUrl: connectedUrl || loadCfg()?.url || null,
      activeAgents: pluginActiveAgents || 0,
      activeTools: pluginActiveTools || 0,
      pluginVersion: pluginVersion || null,
      sessionConnectCount,
      sessionAttemptCount,
    });
  }
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
  const newMessage = truncate(cleanErrorString(rawMessage || fallback), 48);
  if (currentMode === Mode.error) {
    // Already in error mode — setMode would early-return, so manually update
    // the pill text and re-trigger the shake animation for the new error.
    if (errorHoldTimer) clearTimeout(errorHoldTimer);
    // Only restart the shake animation when the error message actually changed.
    // Repeated identical errors (e.g. rapid WebSocket failures) skip the reflow
    // to avoid distracting visual noise.
    if (newMessage !== lastErrorMessage) {
      // Force CSS animation restart by briefly removing the class
      pill.classList.remove('pill--error');
      // Reading offsetWidth forces a reflow so the browser registers the class removal
      // before re-adding it — necessary for animation restart.
      void pill.offsetWidth;
      pill.classList.add('pill--error');
    }
    lastErrorMessage = newMessage;
    syncPill();
  } else {
    lastErrorMessage = newMessage;
    setMode(Mode.error);
  }
  if (errorHoldTimer) clearTimeout(errorHoldTimer);
  errorHoldTimer = setTimeout(() => {
    errorHoldTimer = null;
    // Only revert to idle if we're still in error mode. If ws.onclose already
    // transitioned us to disconnected (or another mode), don't override it.
    if (currentMode === Mode.error) scheduleIdle(0);
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

/**
 * Read-only snapshot of the renderer state for external tooling, automation,
 * and test assertions. Returns a plain object (no live references).
 */
window.__moltMascotGetState = () => ({
  mode: currentMode,
  modeSince,
  currentTool,
  lastErrorMessage,
  isClickThrough,
  isTextHidden,
  alignment: lastPluginAlignment,
  sizeLabel: currentSizeLabel,
  opacity: currentOpacity,
  connectedSince,
  connectedUrl,
  hasPlugin,
  reconnectAttempt,
  lastCloseDetail,
  lastDisconnectedAt,
  pluginVersion,
  pluginToolCalls,
  pluginToolErrors,
  pluginStartedAt,
  sessionConnectCount,
  sessionAttemptCount,
  firstConnectedAt,
  sleepThresholdMs: SLEEP_THRESHOLD_MS,
  isSleeping: currentMode === Mode.idle && (Date.now() - modeSince) > SLEEP_THRESHOLD_MS,
  latencyMs,
  activeAgents: pluginActiveAgents,
  activeTools: pluginActiveTools,
  reducedMotion,
  pillText: pill.textContent || '',
  pillClass: pill.className || '',
});

// Allow capture scripts to backdate modeSince for sleeping-state screenshots.
window.__moltMascotSetModeSince = (t) => {
  if (typeof t === 'number' && Number.isFinite(t)) modeSince = t;
};

function scheduleIdle(delayMs = idleDelayMs) {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => setMode(Mode.idle), delayMs);
}

// --- Gateway WS ---
let nativeToolBounceTimer = null;
let ws = null;
let reqId = 0;
let reconnectAttempt = 0;
let reconnectCountdownTimer = null;
let reconnectTimer = null;    // setTimeout id for the reconnect attempt itself
let connectedSince = null;   // Date.now() when gateway handshake succeeded
let connectedUrl = '';        // URL of the current gateway connection
let lastDisconnectedAt = null; // Date.now() when the last disconnect occurred
let lastCloseDetail = '';      // Close reason/code from the last WebSocket disconnect
let sessionConnectCount = 0;   // Total successful handshakes since app launch (diagnoses flappy connections)
let firstConnectedAt = null;   // Timestamp of the very first successful handshake (helps diagnose "running for Xh but connected only Ym ago")
let sessionAttemptCount = 0;   // Total connection attempts since app launch (including failures)
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

/**
 * Reset all connection-related state to a clean baseline.
 * Shared between ws.onclose and forceReconnectNow() to avoid duplicating
 * the same 8+ lines of cleanup in both code paths.
 */
function resetConnectionState() {
  hasPlugin = false;
  pluginPollerStarted = false;
  pluginStatePending = false;
  pluginStateLastSentAt = 0;
  pluginStateSentAt = 0;
  latencyMs = null;
  _latencyBuffer.length = 0;
  connectedSince = null;
  connectedUrl = '';
  lastCloseDetail = '';
  _pluginSync.reset();
  stopStaleCheck();
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function startStaleCheck() {
  stopStaleCheck();
  lastMessageAt = Date.now();
  staleCheckTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!connectedSince) return; // Not yet handshaked
    // Skip stale detection while the window is hidden — the poller pauses when
    // hidden so no messages arrive, which would cause a false positive reconnect.
    if (document.hidden) return;
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
// Plugin RPC method arrays imported from utils.js (single source of truth).
let pluginStateMethodIndex = 0;
let pluginStateMethod = PLUGIN_STATE_METHODS[pluginStateMethodIndex];

let pluginResetReqId = null;
let pluginResetMethodIndex = 0;
let pluginResetMethod = PLUGIN_RESET_METHODS[pluginResetMethodIndex];

let hasPlugin = false;
let pluginPollerStarted = false;
let pluginStatePending = false;
let pluginStateLastSentAt = 0;
let pluginStateSentAt = 0;
let latencyMs = null;
let pollInterval = null;

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
  pluginStateSentAt = now;
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
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => {
    // Skip polling when the window is hidden (minimized, occluded, etc.)
    // to avoid unnecessary WebSocket traffic. The poller resumes automatically
    // when the window becomes visible again, and the visibilitychange handler
    // triggers an immediate refresh so the UI catches up instantly.
    if (document.hidden) return;
    sendPluginStateReq('p');
  }, 1000);
}

function nextId(prefix) {
  reqId += 1;
  return `${prefix}${reqId}`;
}

function connect(cfg) {
  sessionAttemptCount++;
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
          instanceId: INSTANCE_ID,
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
      sessionConnectCount += 1;
      connectedSince = Date.now();
      if (firstConnectedAt === null) firstConnectedAt = connectedSince;
      lastCloseDetail = '';
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
      pluginStateMethod = PLUGIN_STATE_METHODS[pluginStateMethodIndex];
      pluginStatePending = false;
      pluginStateLastSentAt = 0;

      pluginResetMethodIndex = 0;
      pluginResetMethod = PLUGIN_RESET_METHODS[pluginResetMethodIndex];
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
      // Detach onclose before closing so the reconnect-on-close handler doesn't
      // fire and start a reconnect cycle while the setup form is showing.
      // Without this, the user briefly sees setup, then the socket's onclose
      // triggers a reconnect that hides the form and retries with the same
      // bad credentials — an infinite loop of failed auth attempts.
      ws.onclose = null;
      try { ws.close(); } catch {}
      ws = null;
      resetConnectionState();
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
      // Track round-trip latency for diagnostics
      if (pluginStateSentAt > 0) {
        latencyMs = Date.now() - pluginStateSentAt;
        pushLatencySample(latencyMs);
      }
      const nextMode = msg.payload.state.mode;

      // Sync all plugin config properties via centralized change-detection.
      // currentTool is handled by onCurrentTool callback in _pluginSync.
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
      if (pluginStateMethodIndex < PLUGIN_STATE_METHODS.length - 1) {
        pluginStateMethodIndex += 1;
        pluginStateMethod = PLUGIN_STATE_METHODS[pluginStateMethodIndex];
        pluginStateLastSentAt = 0;
        sendPluginStateReq('s');
        return;
      }
    }

    // If the current plugin reset method isn't installed (older plugin), fall back through aliases.
    if (msg.type === 'res' && msg.id && msg.id === pluginResetReqId && isMissingMethodResponse(msg)) {
      if (pluginResetMethodIndex < PLUGIN_RESET_METHODS.length - 1) {
        pluginResetMethodIndex += 1;
        pluginResetMethod = PLUGIN_RESET_METHODS[pluginResetMethodIndex];
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
        // bounce back to thinking unless lifecycle ends.
        // Cancel previous bounce timer to avoid stale timeouts from rapid
        // tool events fighting with fresh ones (each new tool restarts the clock).
        if (nativeToolBounceTimer) clearTimeout(nativeToolBounceTimer);
        nativeToolBounceTimer = setTimeout(() => {
          nativeToolBounceTimer = null;
          if (currentMode === Mode.tool) setMode(Mode.thinking);
        }, 250);
      }
    }
  });

  ws.onclose = (ev) => {
    lastDisconnectedAt = Date.now();
    // Reset all connection state (plugin, poller, stale check, etc.)
    resetConnectionState();
    // Preserve close code/reason for display in the disconnected pill and tooltip.
    lastCloseDetail = formatCloseDetail(ev?.code, ev?.reason);
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
  let url = normalizeWsUrl(urlInput.value);

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
  showTransientFeedback('Reset ✓', 700);
  if (hasPlugin && ws && ws.readyState === WebSocket.OPEN) {
    pluginResetMethodIndex = 0;
    pluginResetMethod = PLUGIN_RESET_METHODS[pluginResetMethodIndex];
    const id = nextId('reset');
    pluginResetReqId = id;
    try {
      ws.send(JSON.stringify({ type: 'req', id, method: pluginResetMethod, params: {} }));
    } catch {
      // Socket closed between readyState check and send — best-effort.
    }
    // Immediately refresh plugin state so the UI reflects the reset without
    // waiting for the next 1s poll cycle (same pattern as visibility resume).
    pluginStatePending = false;
    pluginStateLastSentAt = 0;
    sendPluginStateReq('r');
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

/**
 * Force an immediate reconnect, bypassing the exponential backoff timer.
 * Works even when connected (useful for config changes or stale connections).
 */
function forceReconnectNow() {
  reconnectAttempt = 0;
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
  // Record disconnect timestamp before resetting (onclose is nulled above,
  // so the normal ws.onclose path won't fire to set this).
  lastDisconnectedAt = Date.now();
  // Reset all connection state so change-detection works correctly after reconnect.
  resetConnectionState();
  const cfg = loadCfg();
  if (cfg?.url) connect(cfg);
  else showSetup({ url: 'ws://127.0.0.1:18789', token: '' });
}

if (window.moltMascot?.onForceReconnect) {
  ipcUnsubs.push(window.moltMascot.onForceReconnect(() => {
    forceReconnectNow();
  }));

  if (window.moltMascot.onCopied) {
    ipcUnsubs.push(window.moltMascot.onCopied(() => {
      showCopiedFeedback();
    }));
  }
}

// Double-click pill to copy current status text to clipboard
pill.addEventListener('dblclick', () => {
  const text = pill.textContent || '';
  if (!text || text === 'Initializing...') return;
  navigator.clipboard.writeText(text).then(() => {
    showCopiedFeedback();
  }).catch(() => {});
});

// Middle-click the pill to toggle hide-text mode.
// Completes the pill interaction trio: double-click=copy, middle-click=toggle text, right-click=menu.
pill.addEventListener('mousedown', (e) => {
  if (e.button !== 1) return; // 1 = middle button
  e.preventDefault();
  if (window.moltMascot?.setHideText) {
    isTextHidden = !isTextHidden;
    window.moltMascot.setHideText(isTextHidden);
    updateHudVisibility();
    showTransientFeedback(isTextHidden ? 'Text hidden' : 'Text shown');
  }
});

// Double-click lobster sprite to toggle ghost mode (most common toggle action).
// This complements the pill double-click (copy) with a sprite-specific shortcut,
// since users instinctively interact with the lobster rather than the tiny pill.
canvas.addEventListener('dblclick', () => {
  if (window.moltMascot?.setClickThrough) {
    isClickThrough = !isClickThrough;
    window.moltMascot.setClickThrough(isClickThrough);
    showTransientFeedback(isClickThrough ? '👻 Ghost on' : '👻 Ghost off');
    syncPill();
  }
});

// Mouse wheel on the lobster sprite adjusts opacity in 10% steps.
// Complements the keyboard shortcut (⌘⇧O) with a more tactile, discoverable
// interaction — scrolling over the mascot to fade it in/out feels natural.
canvas.addEventListener('wheel', (e) => {
  if (!window.moltMascot?.setOpacity) return;
  e.preventDefault();
  // deltaY > 0 = scroll down = decrease opacity; deltaY < 0 = scroll up = increase
  const step = 0.1;
  const direction = e.deltaY > 0 ? -step : step;
  const next = Math.round(Math.min(1, Math.max(0.1, currentOpacity + direction)) * 10) / 10;
  if (next === currentOpacity) return;
  currentOpacity = next;
  window.moltMascot.setOpacity(currentOpacity);
  // Brief visual feedback in the pill so the user sees the current opacity level
  // while scrolling (the tooltip updates too, but it's not always visible).
  showTransientFeedback(`Opacity ${Math.round(currentOpacity * 100)}%`);
  syncPill();
}, { passive: false });

// Middle-click on the lobster sprite to force reconnect.
// Complements double-click (ghost mode) and scroll wheel (opacity) with another
// common desktop-widget interaction — middle-click to refresh/reconnect.
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 1) return; // 1 = middle button
  e.preventDefault();
  forceReconnectNow();
  showTransientFeedback('Reconnecting…', 700, 'pill--connecting');
});

// Keyboard accessibility on the pill: Enter/Space and Shift+F10/ContextMenu
// all open the context menu. Combined into a single listener to avoid duplicate
// event subscriptions on the same element.
pill.addEventListener('keydown', (e) => {
  const isActivate = e.key === 'Enter' || e.key === ' ';
  const isContextKey = (e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu';
  if (!isActivate && !isContextKey) return;
  e.preventDefault();
  const rect = pill.getBoundingClientRect();
  if (isActivate) {
    pill.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: rect.left,
      clientY: rect.bottom + 4,
    }));
  } else {
    showContextMenu({ clientX: rect.left + rect.width / 2, clientY: rect.bottom + 4, preventDefault() {} });
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
    pluginResetMethod,
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
    actualFps: _fpsCounter.fps(),
    reconnectAttempt,
    canvasScale: currentScale,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    appVersion: window.moltMascot?.version,
    pluginVersion,
    wsReadyState: ws?.readyState,
    lastCloseDetail: lastCloseDetail || undefined,
    savedUrl: !connectedSince ? loadCfg()?.url : undefined,
    platform: navigator.platform,
    arch: window.moltMascot?.arch,
    devicePixelRatio: window.devicePixelRatio,
    memory: performance?.memory,
    versions: window.moltMascot?.versions,
    processUptimeS: window.moltMascot?.processUptimeS?.(),
    processMemoryRssBytes: window.moltMascot?.processMemoryRssBytes?.(),
    sessionConnectCount,
    sessionAttemptCount,
    isPollingPaused: document.hidden,
    latencyMs,
    activeAgents: pluginActiveAgents,
    activeTools: pluginActiveTools,
    firstConnectedAt,
    lastMessageAt,
    latencyStats: getLatencyStats(),
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
  const altKey = isMac ? '⌥' : 'Alt+';

  // Build a status summary line for the context menu header
  const modeDur = Math.max(0, Math.round((Date.now() - modeSince) / 1000));
  const isSleepingCtx = currentMode === Mode.idle && modeDur > SLEEP_THRESHOLD_S;
  const modeEmoji = MODE_EMOJI;
  const emojiKey = isSleepingCtx ? 'sleeping' : currentMode;
  const emoji = modeEmoji[emojiKey] ? `${modeEmoji[emojiKey]} ` : '';
  let modeLabel = isSleepingCtx ? `${emoji}Sleeping` : `${emoji}${capitalize(currentMode)}`;
  if (currentMode === Mode.tool && currentTool) modeLabel = `${modeEmoji.tool} ${truncate(currentTool, 20)}`;
  if (currentMode === Mode.error && lastErrorMessage) modeLabel = `${modeEmoji.error} ${truncate(lastErrorMessage, 28)}`;
  const appVer = window.moltMascot?.version;
  const statusParts = [appVer ? `v${appVer} · ${modeLabel}` : modeLabel];
  if (modeDur > 0) statusParts[0] += ` (${formatDuration(modeDur)})`;
  if (connectedSince) {
    let uptimeStr = `↑ ${formatElapsed(connectedSince, Date.now())}`;
    // Show reconnect count when the connection has flapped (>1 handshake),
    // so users can spot instability at a glance without opening debug info.
    if (sessionConnectCount > 1) uptimeStr += ` ↻${sessionConnectCount - 1}`;
    statusParts.push(uptimeStr);
  }
  if (!connectedSince && reconnectAttempt > 0) {
    statusParts.push(`retry #${reconnectAttempt}`);
  }
  if (pluginToolCalls > 0) {
    const statsStr = pluginToolErrors > 0
      ? `${pluginToolCalls} calls, ${pluginToolErrors} err (${successRate(pluginToolCalls, pluginToolErrors)}% ok)`
      : `${pluginToolCalls} calls`;
    statusParts.push(statsStr);
  }
  if (typeof latencyMs === 'number' && latencyMs >= 0) {
    statusParts.push(formatLatency(latencyMs));
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
    { label: 'Copy Debug Info', hint: `${modKey}⇧I`, action: () => {
      if (window.moltMascot?.copyDebugInfo) {
        window.moltMascot.copyDebugInfo();
        showCopiedFeedback();
      } else {
        const text = buildDebugInfo();
        navigator.clipboard.writeText(text).then(() => {
          showCopiedFeedback();
        }).catch(() => {});
      }
    }},
    { label: connectedSince ? 'Force Reconnect' : 'Reconnect Now', hint: `${modKey}⇧C`, action: forceReconnectNow },
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
    { label: 'Open on GitHub…', action: () => {
      if (window.moltMascot?.openExternal) window.moltMascot.openExternal('https://github.com/MightComeback/molt-mascot');
    }},
    { label: 'DevTools', hint: `${modKey}⇧D`, action: () => {
      if (window.moltMascot?.toggleDevTools) window.moltMascot.toggleDevTools();
    }},
    { label: 'Quit', hint: `${modKey}${altKey}Q`, action: () => {
      if (window.moltMascot?.quit) window.moltMascot.quit();
      else window.close();
    }},
  ], { x: e.clientX, y: e.clientY });
}

pill.addEventListener('contextmenu', showContextMenu);
canvas.addEventListener('contextmenu', showContextMenu);

// Keyboard accessibility on the canvas: Enter/Space opens context menu,
// matching the double-click → ghost toggle is too destructive for accidental
// key presses, so we open the context menu instead (consistent with pill behavior).
canvas.addEventListener('keydown', (e) => {
  const isActivate = e.key === 'Enter' || e.key === ' ';
  const isContextKey = (e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu';
  if (!isActivate && !isContextKey) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  showContextMenu({
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    preventDefault() {},
  });
});

// boot
if (isCapture) {
  setup.hidden = true;
  pill.textContent = 'demo';
} else {
  const cfg = loadCfg();
  const envUrl = normalizeWsUrl(window.moltMascot?.env?.gatewayUrl || '');
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

// Actual FPS measurement: ring buffer over a rolling 1-second window.
// Uses a fixed-size circular buffer instead of Array.shift() to avoid O(n)
// per-frame overhead in the render loop hot path.
// FPS measurement — delegated to the extracted fps-counter module for testability.
const _fpsCounter = createFpsCounter();

window.__moltMascotActualFps = () => _fpsCounter.fps();

// Throttle frame rate when idle/sleeping to save CPU.
// Delegates to the pure utility function for testability.
// Accepts an optional `now` timestamp to avoid redundant Date.now() calls
// in the hot render loop (the caller already has a timestamp from rAF or Date.now()).
function getFrameIntervalMs(now) {
  const idleDur = currentMode === Mode.idle ? (now || Date.now()) - modeSince : 0;
  return _getFrameIntervalMs(currentMode, idleDur, SLEEP_THRESHOLD_MS, reducedMotion);
}

function frame(t) {
  const now = Date.now();
  const interval = getFrameIntervalMs(now);
  if (interval > 0 && t - lastFrameAt < interval) {
    animFrameId = requestAnimationFrame(frame);
    return;
  }
  lastFrameAt = t;
  _fpsCounter.update(t);

  const idleDur = currentMode === Mode.idle ? now - modeSince : 0;
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
    // Reset pill update guards so the first frame after resume refreshes immediately,
    // rather than potentially skipping if the second/minute counter happens to match.
    lastPillSec = -1;
    lastPillMin = -1;
    // Flush stale timestamps from the FPS ring buffer so the counter doesn't
    // report inflated/deflated values for the first second after un-hiding.
    _fpsCounter.reset();
    startAnimation();
    // Immediately refresh plugin state so the UI catches up after being hidden.
    // The 1s poller skips ticks while hidden, so without this the pill would
    // show stale info for up to 1s after the window reappears.
    // Reset rate-limit and in-flight guards: while hidden, no responses arrive
    // to clear a stale pending flag, and the 150ms debounce could suppress the
    // refresh. Mirrors GatewayClient.resumePolling() logic.
    pluginStatePending = false;
    pluginStateLastSentAt = 0;
    // Reset stale-check baseline so the first check after un-hiding doesn't
    // false-positive (no messages arrived while hidden, so lastMessageAt could
    // be very old). The document.hidden guard in the stale timer prevents checks
    // *during* hidden state, but there's a race on the first tick after visibility
    // resumes where document.hidden is already false but no message has arrived yet.
    lastMessageAt = Date.now();
    if (hasPlugin) sendPluginStateReq('v');
  }
});

// Cleanup on page unload (prevents leaked intervals/sockets during hot-reload or navigation)
window.addEventListener('beforeunload', () => {
  // Dismiss any open context menu to remove its DOM and event listeners cleanly.
  ctxMenu.dismiss();
  stopAnimation();
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
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
  if (nativeToolBounceTimer) {
    clearTimeout(nativeToolBounceTimer);
    nativeToolBounceTimer = null;
  }
  if (ws) {
    ws.onclose = null;
    try { ws.close(); } catch {}
    ws = null;
  }
  // Remove media-query listener to avoid leaks during hot-reload
  motionQuery?.removeEventListener?.('change', _onMotionChange);
  // Remove resize listener and cancel debounced timer to prevent leaked handlers
  window.removeEventListener('resize', _debouncedRecalcScale);
  if (_resizeTimer) { clearTimeout(_resizeTimer); _resizeTimer = null; }
  // Unsubscribe IPC listeners to prevent leaked handlers during hot-reload
  for (const unsub of ipcUnsubs) {
    try { unsub?.(); } catch {}
  }
  ipcUnsubs.length = 0;
});

startAnimation();
