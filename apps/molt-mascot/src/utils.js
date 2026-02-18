/**
 * Shared utility functions for Molt Mascot renderer.
 * Extracted for testability and reuse.
 */

export function coerceDelayMs(v, fallback) {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Import shared utilities from the plugin (single source of truth).
// The renderer previously duplicated these implementations; now we delegate
// to the canonical versions to avoid drift between plugin and renderer logic.
import { truncate, cleanErrorString, formatDuration } from '@molt/mascot-plugin';
export { truncate, cleanErrorString, formatDuration };

export function isMissingMethodResponse(msg) {
  const ok = msg?.ok;
  const payloadOk = msg?.payload?.ok;
  const err = msg?.payload?.error || msg?.error || null;
  const code = (err?.code || err?.name || '').toString().toLowerCase();
  const message = (err?.message || err || '').toString().toLowerCase();

  if (ok === true && payloadOk === true) return false;

  // JSON-RPC standard: -32601 means "Method not found"
  const numericCode = Number(err?.code);
  if (numericCode === -32601) return true;

  if (code.includes('method') && code.includes('not') && code.includes('found')) return true;
  if (message.includes('method not found')) return true;
  if (message.includes('unknown method')) return true;
  if (message.includes('unknown rpc method')) return true;

  return false;
}

/**
 * Convert a WebSocket readyState number to a human-readable label.
 * Avoids inline magic-array indexing scattered through rendering/debug code.
 */
const WS_STATE_LABELS = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
export function wsReadyStateLabel(readyState) {
  if (readyState === null || readyState === undefined) return 'null';
  return WS_STATE_LABELS[readyState] ?? String(readyState);
}

/**
 * Compute the render loop frame interval (ms) based on current mode and idle duration.
 * Higher intervals = lower FPS = less CPU.
 *
 * Returns 0 for active modes (full rAF rate, ~60fps).
 *
 * @param {string} mode - Current mascot mode (idle, thinking, tool, error, etc.)
 * @param {number} idleDurationMs - How long the mascot has been idle (0 if not idle)
 * @param {number} sleepThresholdMs - Idle duration before entering sleep (ZZZ overlay)
 * @param {boolean} reducedMotion - Whether prefers-reduced-motion is active
 * @returns {number} Frame interval in milliseconds (0 = no throttle)
 */
export function getFrameIntervalMs(mode, idleDurationMs, sleepThresholdMs, reducedMotion) {
  if (reducedMotion) {
    if (mode === 'idle') {
      return idleDurationMs > sleepThresholdMs ? 2000 : 1000;
    }
    return 500;
  }
  if (mode === 'idle') {
    return idleDurationMs > sleepThresholdMs ? 250 : 66;
  }
  if (mode === 'disconnected' || mode === 'error') return 100;
  // Connecting/connected animations use slow intervals (500ms/300ms sprites),
  // so ~15fps (66ms) is more than enough without wasting CPU at full 60fps.
  if (mode === 'connecting' || mode === 'connected') return 66;
  // Thinking overlay alternates every 600ms, tool overlay is static — neither
  // needs 60fps. ~15fps (66ms) gives smooth bob animation without waste.
  if (mode === 'thinking' || mode === 'tool') return 66;
  return 0;
}

/**
 * Compute the next reconnect delay using exponential backoff with jitter.
 *
 * @param {number} attempt - Current reconnect attempt (0-based)
 * @param {{ baseMs?: number, maxMs?: number, jitterFraction?: number }} [opts]
 * @returns {number} Delay in milliseconds
 */
export function getReconnectDelayMs(attempt, opts = {}) {
  const baseMs = opts.baseMs ?? 1500;
  const maxMs = opts.maxMs ?? 30000;
  const jitterFraction = opts.jitterFraction ?? 0.2;
  const delay = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const jitter = delay * jitterFraction * Math.random();
  return Math.round(delay + jitter);
}

/**
 * Build the tooltip text for the mascot pill/canvas.
 * Extracted for testability — pure function, no DOM access.
 *
 * @param {object} params
 * @param {string} params.displayMode - Current display mode label
 * @param {number} params.durationSec - How long in current mode (seconds)
 * @param {string} [params.lastErrorMessage] - Error message (if in error mode)
 * @param {boolean} [params.isClickThrough] - Ghost mode active
 * @param {number|null} [params.connectedSince] - Timestamp of gateway connection
 * @param {string} [params.connectedUrl] - Gateway URL
 * @param {number} [params.reconnectAttempt] - Current reconnect attempt
 * @param {string} [params.lastCloseDetail] - WebSocket close reason/code (shown when disconnected)
 * @param {number} [params.pluginToolCalls] - Plugin tool call count
 * @param {number} [params.pluginToolErrors] - Plugin tool error count
 * @param {string} [params.currentTool] - Currently active tool name
 * @param {string} [params.alignment] - Current alignment (e.g. 'bottom-right')
 * @param {string} [params.sizeLabel] - Current size preset label (e.g. 'medium')
 * @param {number} [params.opacity] - Current window opacity (0-1)
 * @param {boolean} [params.isTextHidden] - Whether the HUD text pill is hidden
 * @param {string} [params.appVersion] - App version string
 * @param {string} [params.pluginVersion] - Plugin version string
 * @param {number|null} [params.pluginStartedAt] - Plugin start timestamp (for uptime display)
 * @param {number} [params.now] - Current timestamp (defaults to Date.now(); pass explicitly for testability)
 * @returns {string}
 */
export function buildTooltip(params) {
  const {
    displayMode,
    durationSec,
    lastErrorMessage,
    isClickThrough,
    connectedSince,
    connectedUrl,
    reconnectAttempt = 0,
    lastCloseDetail,
    pluginToolCalls = 0,
    pluginToolErrors = 0,
    currentTool,
    alignment,
    sizeLabel,
    opacity,
    isTextHidden,
    appVersion,
    pluginVersion,
    pluginStartedAt,
    now: nowOverride,
  } = params;

  const now = nowOverride ?? Date.now();

  let tip = `${displayMode} for ${formatDuration(durationSec)}`;
  if (displayMode === 'tool' && currentTool) tip += ` (${currentTool})`;
  if (lastErrorMessage) tip += ` — ${lastErrorMessage}`;
  if (isClickThrough) tip += ' (ghost mode)';
  if (isTextHidden) tip += ' (text hidden)';
  if (connectedSince) {
    const uptime = formatDuration(Math.max(0, Math.round((now - connectedSince) / 1000)));
    tip += ` · connected ${uptime}`;
  }
  if (connectedUrl) tip += ` · ${connectedUrl}`;
  if (reconnectAttempt > 0 && !connectedSince) tip += ` · retry #${reconnectAttempt}`;
  if (lastCloseDetail) tip += ` · ${lastCloseDetail}`;
  if (typeof pluginStartedAt === 'number' && pluginStartedAt > 0) {
    const pluginUptime = formatDuration(Math.max(0, Math.round((now - pluginStartedAt) / 1000)));
    tip += ` · plugin up ${pluginUptime}`;
  }
  if (pluginToolCalls > 0) {
    tip += ` · ${pluginToolCalls} calls`;
    if (pluginToolErrors > 0) {
      const successRate = Math.round(((pluginToolCalls - pluginToolErrors) / pluginToolCalls) * 100);
      tip += `, ${pluginToolErrors} errors (${successRate}% ok)`;
    }
  }
  // Show layout info when non-default (avoids tooltip clutter for standard configs)
  if (alignment && alignment !== 'bottom-right') tip += ` · ${alignment}`;
  if (sizeLabel && sizeLabel !== 'medium') tip += ` · ${sizeLabel}`;
  if (typeof opacity === 'number' && opacity < 1) tip += ` · ${Math.round(opacity * 100)}%`;
  const verParts = [appVersion ? `v${appVersion}` : '', pluginVersion ? `plugin v${pluginVersion}` : ''].filter(Boolean).join(', ');
  if (verParts) tip += ` (${verParts})`;
  return tip;
}

/**
 * Normalize a URL to use the WebSocket scheme.
 * Common user mistake: entering http:// or https:// instead of ws:// or wss://.
 * This auto-corrects the scheme while preserving the rest of the URL.
 *
 * Shared between renderer.js (form submit + boot) and gateway-client.js.
 *
 * @param {string} url
 * @returns {string} URL with ws:// or wss:// scheme
 */
export function normalizeWsUrl(url) {
  if (typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (/^https:\/\//i.test(trimmed)) return trimmed.replace(/^https:\/\//i, 'wss://');
  if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, 'ws://');
  return trimmed;
}

/**
 * Human-readable labels for well-known WebSocket close codes.
 * Turns cryptic "code 1006" into "abnormal closure" for user-facing display.
 *
 * @see https://www.iana.org/assignments/websocket/websocket.xhtml#close-code-number
 */
export const WS_CLOSE_CODE_LABELS = {
  1000: 'normal',
  1001: 'going away',
  1002: 'protocol error',
  1003: 'unsupported data',
  1005: 'no status',
  1006: 'abnormal closure',
  1007: 'invalid payload',
  1008: 'policy violation',
  1009: 'message too big',
  1010: 'missing extension',
  1011: 'internal error',
  1012: 'service restart',
  1013: 'try again later',
  1014: 'bad gateway',
  1015: 'TLS handshake failed',
};

/**
 * Format a WebSocket close code + reason into a compact human-readable string.
 *
 * @param {number|null|undefined} code - WebSocket close code
 * @param {string|null|undefined} reason - WebSocket close reason
 * @returns {string} Formatted detail (e.g. "abnormal closure", "1008: policy violation", "going away")
 */
export function formatCloseDetail(code, reason) {
  const trimmedReason = (reason || '').trim();
  const label = (code != null) ? WS_CLOSE_CODE_LABELS[code] : undefined;

  // If we have a human reason string, prefer it (possibly with the friendly label)
  if (trimmedReason) {
    return trimmedReason;
  }
  // No reason — use the friendly label if available
  if (label) {
    return label;
  }
  // Unknown code, no reason — show the raw code
  if (code != null) {
    return `code ${code}`;
  }
  return '';
}

// Re-export from shared CJS module so both electron-main and renderer use the same impl.
// Bun/esbuild handle CJS → ESM interop transparently.
export { isTruthyEnv } from './is-truthy-env.cjs';
