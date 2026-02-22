/**
 * Gateway WebSocket client for Molt Mascot.
 * Extracted from renderer.js for maintainability and testability.
 *
 * Handles: connection lifecycle, reconnect with exponential backoff,
 * stale-connection detection, protocol negotiation, and plugin state polling.
 */

import { isMissingMethodResponse, getReconnectDelayMs, normalizeWsUrl, formatCloseDetail, formatLatency, connectionQuality, connectionQualityEmoji, resolveQualitySource, PLUGIN_STATE_METHODS, PLUGIN_RESET_METHODS } from './utils.js';

// Re-export so existing consumers of gateway-client.js don't break.
export { normalizeWsUrl };

/** @typedef {'idle'|'thinking'|'tool'|'error'|'connecting'|'connected'|'disconnected'} Mode */

/**
 * @typedef {Object} GatewayClientOptions
 * @property {number} [reconnectBaseMs=1500]
 * @property {number} [reconnectMaxMs=30000]
 * @property {number} [staleConnectionMs=15000]
 * @property {number} [staleCheckIntervalMs=5000]
 * @property {number} [pollIntervalMs=1000]
 * @property {number} [minProtocol]
 * @property {number} [maxProtocol]
 * @property {string} [clientVersion]
 * @property {string} [clientPlatform]
 * @property {string} [clientArch]
 */

export class GatewayClient {
  /**
   * @param {GatewayClientOptions} [opts]
   */
  constructor(opts = {}) {
    this._reconnectBaseMs = opts.reconnectBaseMs ?? 1500;
    this._reconnectMaxMs = opts.reconnectMaxMs ?? 30000;
    this._staleConnectionMs = opts.staleConnectionMs ?? 15000;
    this._staleCheckIntervalMs = opts.staleCheckIntervalMs ?? 5000;
    this._pollIntervalMs = opts.pollIntervalMs ?? 1000;
    this._minProtocol = opts.minProtocol ?? 2;
    this._maxProtocol = opts.maxProtocol ?? 3;
    this._clientVersion = opts.clientVersion ?? 'dev';
    this._clientPlatform = opts.clientPlatform ?? '';
    this._clientArch = opts.clientArch ?? '';

    /** @type {WebSocket|null} */
    this._ws = null;
    this._reqId = 0;
    this._reconnectAttempt = 0;
    this._reconnectCountdownTimer = null;
    this._reconnectTimer = null;

    /** @type {number|null} */
    this.connectedSince = null;
    this.connectedUrl = '';
    /** The URL currently being connected/reconnected to (persists across disconnects). */
    this.targetUrl = '';
    /** @type {number|null} Timestamp of last disconnect (for tooltip "disconnected X ago") */
    this.lastDisconnectedAt = null;
    /** @type {number|null} WebSocket close code from the last disconnect */
    this.lastCloseCode = null;
    /** @type {string|null} WebSocket close reason from the last disconnect */
    this.lastCloseReason = null;
    /** Total successful handshakes since client creation (diagnoses flappy connections). */
    this.sessionConnectCount = 0;
    /** Total connection attempts since client creation (including failures). */
    this.sessionAttemptCount = 0;
    /** Timestamp of the very first successful handshake (null if never connected). */
    this.firstConnectedAt = null;

    // Stale connection detection
    this._lastMessageAt = 0;
    this._staleCheckTimer = null;

    // Visibility-aware polling: when paused, the plugin poller skips ticks
    // to save bandwidth (e.g. when the window is hidden/minimized).
    this._pollingPaused = false;

    // Round-trip latency tracking for plugin state polls.
    // Updated on each successful plugin state response; consumers can display
    // this in tooltips/debug info to diagnose gateway responsiveness.
    /** @type {number|null} Most recent plugin state poll round-trip time in ms. */
    this.latencyMs = null;
    /** @private Circular buffer for latency history (rolling window for min/max/avg). */
    this._latencyBuffer = [];
    /** @private Max entries in the latency ring buffer. ~60 samples = ~1 min at 1s poll. */
    this._latencyBufferMax = 60;
    /** @private Cached latencyStats result (invalidated when new samples are added). */
    this._latencyStatsCache = null;
    /** @private */
    this._pluginStateSentAt = 0;

    // Plugin state polling
    this.hasPlugin = false;
    this._pluginPollerStarted = false;
    this._pluginStatePending = false;
    this._pluginStateLastSentAt = 0;
    this._pluginStateMethodIndex = 0;
    this._pluginResetMethodIndex = 0;
    this._pluginStateReqId = null;
    this._pluginResetReqId = null;
    this._pollInterval = null;
    this._connectReqId = null;

    // Stable instance ID: generated once per client lifetime so reconnects
    // don't create duplicate sessions on the gateway (session fragmentation).
    this._instanceId = `moltMascot-${Math.random().toString(16).slice(2)}`;

    // Lifecycle flag: set to true after destroy() so consumers can guard
    // against accidental use of a torn-down client.
    this._destroyed = false;

    // Event callbacks (set by consumer)
    /** @type {((msg: object) => void)|null} */
    this.onMessage = null;
    /** @type {((state: string, detail?: string) => void)|null} */
    this.onConnectionStateChange = null;
    /** @type {((secondsLeft: number) => void)|null} */
    this.onReconnectCountdown = null;
    /** @type {(() => void)|null} */
    this.onHandshakeSuccess = null;
    /** @type {((error: string) => void)|null} */
    this.onHandshakeFailure = null;
    /** @type {((state: object) => void)|null} */
    this.onPluginState = null;
    /** @type {((msg: object) => void)|null} */
    this.onAgentEvent = null;
    /** @type {((info: { code?: number, reason?: string }) => void)|null} */
    this.onDisconnect = null;
    /** @type {((error: string) => void)|null} */
    this.onError = null;
    /** @type {(() => void)|null} Called on disconnect so consumers can clear cached plugin config (clickThrough, alignment, etc.) */
    this.onPluginStateReset = null;
  }

  _nextId(prefix) {
    this._reqId += 1;
    return `${prefix}${this._reqId}`;
  }

  _getReconnectDelay() {
    const delay = getReconnectDelayMs(this._reconnectAttempt, {
      baseMs: this._reconnectBaseMs,
      maxMs: this._reconnectMaxMs,
      jitterFraction: 0.2,
    });
    this._reconnectAttempt++;
    return delay;
  }

  _startStaleCheck() {
    this._stopStaleCheck();
    this._lastMessageAt = Date.now();
    this._staleCheckTimer = setInterval(() => {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
      if (!this.connectedSince) return;
      // Skip stale detection while polling is paused (e.g. window hidden) —
      // no poll requests are sent, so no messages arrive, which would cause
      // a false positive reconnect.
      if (this._pollingPaused) return;
      if (Date.now() - this._lastMessageAt > this._staleConnectionMs) {
        this.onError?.('connection stale');
        try { this._ws.close(); } catch {}
      }
    }, this._staleCheckIntervalMs);
  }

  _stopStaleCheck() {
    if (this._staleCheckTimer) {
      clearInterval(this._staleCheckTimer);
      this._staleCheckTimer = null;
    }
  }

  _sendPluginStateReq(prefix = 'p') {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (this._pluginStatePending) return;
    if (now - this._pluginStateLastSentAt < 150) return;

    const id = this._nextId(prefix);
    this._pluginStateReqId = id;
    this._pluginStatePending = true;
    this._pluginStateLastSentAt = now;
    this._pluginStateSentAt = now;
    try {
      this._ws.send(JSON.stringify({
        type: 'req', id,
        method: PLUGIN_STATE_METHODS[this._pluginStateMethodIndex],
        params: {},
      }));
    } catch {
      // Socket closed between readyState check and send — clear pending flag
      // so the next poll can retry instead of permanently stalling.
      this._pluginStatePending = false;
    }
  }

  _startPluginPoller() {
    if (this._pluginPollerStarted) return;
    this._pluginPollerStarted = true;
    if (this._pollInterval) clearInterval(this._pollInterval);
    this._pollInterval = setInterval(() => {
      // Skip polling when paused (e.g. window hidden/minimized) to avoid
      // unnecessary WebSocket traffic. The consumer resumes via resumePolling().
      if (this._pollingPaused) return;
      this._sendPluginStateReq('p');
    }, this._pollIntervalMs);
  }

  _stopPluginPoller() {
    this._pluginPollerStarted = false;
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  /**
   * Connect to a gateway WebSocket.
   * @param {{ url: string, token?: string }} cfg
   */
  connect(cfg) {
    if (this._destroyed) return;
    this.sessionAttemptCount++;
    this.onConnectionStateChange?.('connecting');

    if (this._reconnectCountdownTimer) {
      clearInterval(this._reconnectCountdownTimer);
      this._reconnectCountdownTimer = null;
    }
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (this._ws) {
      this._ws.onclose = null;
      try { this._ws.close(); } catch {}
      this._ws = null;
    }

    // Auto-correct common URL scheme mistakes: http(s) → ws(s)
    const url = normalizeWsUrl(cfg.url);
    // Persist the target URL so consumers can display it even when disconnected
    // (e.g. debug info "Saved URL:" or tray tooltip) without re-reading config.
    this.targetUrl = url || '';

    let ws;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      // Invalid URL (empty string, missing protocol, etc.) throws synchronously.
      // Surface the error via callback instead of crashing the consumer.
      this.onError?.(err?.message || 'Invalid WebSocket URL');
      this.onHandshakeFailure?.(err?.message || 'Invalid WebSocket URL');
      return;
    }
    this._ws = ws;

    ws.addEventListener('open', () => {
      this._connectReqId = this._nextId('c');
      const connectFrame = {
        type: 'req',
        id: this._connectReqId,
        method: 'connect',
        params: {
          minProtocol: this._minProtocol,
          maxProtocol: this._maxProtocol,
          client: {
            id: 'molt-mascot-desktop',
            displayName: 'Molt Mascot',
            version: this._clientVersion,
            platform: this._clientPlatform,
            arch: this._clientArch,
            mode: 'gui',
            instanceId: this._instanceId,
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
        // and the send call. Surface the error and close so the onclose handler
        // triggers a reconnect (previously the socket would dangle until stale
        // detection kicked in after ~15s).
        this.onError?.(err?.message || 'Failed to send connect frame');
        try { ws.close(); } catch {}
      }
    });

    ws.addEventListener('message', (ev) => {
      this._lastMessageAt = Date.now();
      let msg;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }

      // Forward raw message for consumers that want it
      this.onMessage?.(msg);

      // Snappy plugin state refresh on any event
      if (this.hasPlugin && msg.type === 'event') {
        this._sendPluginStateReq('p');
      }

      // Handshake success
      if (msg.type === 'res' && msg.payload?.type === 'hello-ok') {
        this._reconnectAttempt = 0;
        this.sessionConnectCount += 1;
        this.connectedSince = Date.now();
        if (this.firstConnectedAt === null) this.firstConnectedAt = this.connectedSince;
        this.connectedUrl = url || '';
        this._startStaleCheck();

        // Reset plugin method probing
        this._pluginStateMethodIndex = 0;
        this._pluginStatePending = false;
        this._pluginStateLastSentAt = 0;
        this._pluginResetMethodIndex = 0;
        this._pluginResetReqId = null;

        this.onHandshakeSuccess?.();
        this._sendPluginStateReq('s');
        return;
      }

      // Handshake failure — detach onclose before closing so the reconnect-on-close
      // handler doesn't fire and start an infinite retry loop with bad credentials.
      if (msg.type === 'res' && msg.id && msg.id === this._connectReqId && !msg.payload?.type?.startsWith('hello')) {
        const err = msg.payload?.error || msg.error;
        const detail = typeof err === 'string' ? err
          : err?.message || err?.code || 'connection rejected';
        // Prevent reconnect loop: _cleanup nulls onclose before closing the socket.
        this._cleanup();
        this.onHandshakeFailure?.(String(detail));
        return;
      }

      // Clear in-flight flag for any plugin state response
      if (msg.type === 'res' && msg.id && msg.id === this._pluginStateReqId) {
        this._pluginStatePending = false;
      }

      // Plugin state success
      if (
        msg.type === 'res' &&
        msg.id && msg.id === this._pluginStateReqId &&
        msg.ok && msg.payload?.ok && msg.payload?.state?.mode
      ) {
        this.hasPlugin = true;
        this._startPluginPoller();
        // Track round-trip latency for diagnostics
        if (this._pluginStateSentAt > 0) {
          this.latencyMs = Date.now() - this._pluginStateSentAt;
          // Push into ring buffer for min/max/avg stats
          if (this._latencyBuffer.length >= this._latencyBufferMax) {
            this._latencyBuffer.shift();
          }
          this._latencyBuffer.push(this.latencyMs);
          this._latencyStatsCache = null; // invalidate cached stats
        }
        this.onPluginState?.(msg.payload.state);
        return;
      }

      // Plugin state method fallback
      if (msg.type === 'res' && msg.id && msg.id === this._pluginStateReqId && this._isMissingMethod(msg)) {
        this._pluginStatePending = false;
        if (this._pluginStateMethodIndex < PLUGIN_STATE_METHODS.length - 1) {
          this._pluginStateMethodIndex += 1;
          this._pluginStateLastSentAt = 0;
          this._sendPluginStateReq('s');
          return;
        }
      }

      // Plugin reset method fallback
      if (msg.type === 'res' && msg.id && msg.id === this._pluginResetReqId && this._isMissingMethod(msg)) {
        if (this._pluginResetMethodIndex < PLUGIN_RESET_METHODS.length - 1) {
          this._pluginResetMethodIndex += 1;
          const id = this._nextId('reset');
          this._pluginResetReqId = id;
          try {
            ws.send(JSON.stringify({ type: 'req', id, method: PLUGIN_RESET_METHODS[this._pluginResetMethodIndex], params: {} }));
          } catch {
            // Socket closed between readyState check and send — best-effort.
          }
          return;
        }
      }

      // Native agent events (no plugin)
      if (!this.hasPlugin && msg.type === 'event' && msg.event === 'agent') {
        this.onAgentEvent?.(msg.payload);
      }
    });

    ws.onclose = (ev) => {
      this.hasPlugin = false;
      this._stopPluginPoller();
      this._pluginStatePending = false;
      this._pluginStateLastSentAt = 0;
      this.lastDisconnectedAt = Date.now();
      this.lastCloseCode = ev?.code ?? null;
      this.lastCloseReason = (ev?.reason || '').trim() || null;
      this.connectedSince = null;
      this.connectedUrl = '';
      this.latencyMs = null;
      this._pluginStateSentAt = 0;
      this._stopStaleCheck();

      this.onPluginStateReset?.();
      this.onDisconnect?.({ code: ev?.code, reason: this.lastCloseReason || undefined });

      const delay = this._getReconnectDelay();
      const reconnectAt = Date.now() + delay;

      const updateCountdown = () => {
        const remaining = Math.max(0, Math.ceil((reconnectAt - Date.now()) / 1000));
        this.onReconnectCountdown?.(remaining);
      };
      updateCountdown();
      this._reconnectCountdownTimer = setInterval(updateCountdown, 1000);

      this._reconnectTimer = setTimeout(() => {
        if (this._reconnectCountdownTimer) {
          clearInterval(this._reconnectCountdownTimer);
          this._reconnectCountdownTimer = null;
        }
        this.onConnectionStateChange?.('connecting');
        this.connect(cfg);
      }, delay);
    };

    ws.addEventListener('error', () => {
      this.onError?.('WebSocket error');
    });
  }

  /**
   * Pause plugin state polling (e.g. when the window is hidden/minimized).
   * The poller interval keeps ticking but skips sending requests.
   * Call resumePolling() to resume; it also triggers an immediate refresh.
   */
  pausePolling() {
    this._pollingPaused = true;
  }

  /**
   * Resume plugin state polling after a pause.
   * Triggers an immediate state refresh so the UI catches up instantly.
   */
  resumePolling() {
    if (!this._pollingPaused) return;
    this._pollingPaused = false;
    // Reset rate-limit and in-flight guard so the refresh isn't suppressed.
    // While paused, no new responses arrive to clear a stale pending flag,
    // so we must reset it here to avoid blocking the immediate refresh.
    this._pluginStateLastSentAt = 0;
    this._pluginStatePending = false;
    // Reset stale-check baseline so the first check after un-pausing doesn't
    // false-positive — no messages arrived while paused, so _lastMessageAt
    // could be very old. Without this, the stale timer sees pollingPaused=false
    // and an ancient _lastMessageAt on the next tick, triggering a spurious reconnect.
    this._lastMessageAt = Date.now();
    // Immediate refresh so the UI doesn't show stale data for up to 1s
    if (this.hasPlugin) this._sendPluginStateReq('v');
  }

  /**
   * Request an immediate plugin state refresh.
   * Useful after actions that change state (e.g., reset, config change)
   * so the UI updates without waiting for the next 1s poll cycle.
   *
   * Clears the rate-limit and in-flight guards so the request isn't silently
   * dropped when a previous poll is still pending or was sent recently.
   */
  refreshPluginState() {
    this._pluginStatePending = false;
    this._pluginStateLastSentAt = 0;
    this._sendPluginStateReq('r');
  }

  /**
   * Send a plugin reset request over the current connection.
   */
  sendPluginReset() {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    this._pluginResetMethodIndex = 0;
    const id = this._nextId('reset');
    this._pluginResetReqId = id;
    try {
      this._ws.send(JSON.stringify({
        type: 'req', id,
        method: PLUGIN_RESET_METHODS[0],
        params: {},
      }));
    } catch {
      // Socket closed between readyState check and send — best-effort.
    }
  }

  /**
   * Tear down all timers, close the socket, and reset connection/plugin state.
   * Shared by forceReconnect() and destroy() to avoid duplicated cleanup logic.
   *
   * @param {{ notifyPluginReset?: boolean }} [opts] - When true, fires
   *   onPluginStateReset so consumers clear cached plugin config (clickThrough,
   *   alignment, etc.). Defaults to false for back-compat; callers that need
   *   the notification pass `{ notifyPluginReset: true }`.
   * @private
   */
  _cleanup(opts) {
    const hadPlugin = this.hasPlugin;
    this._stopStaleCheck();
    this._stopPluginPoller();
    if (this._reconnectCountdownTimer) {
      clearInterval(this._reconnectCountdownTimer);
      this._reconnectCountdownTimer = null;
    }
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.onclose = null;
      try { this._ws.close(); } catch {}
      this._ws = null;
    }
    this.connectedSince = null;
    this.connectedUrl = '';
    // Intentionally do NOT clear targetUrl here — it persists across
    // reconnects so consumers can show which URL is being retried.
    this.hasPlugin = false;
    this._pluginStatePending = false;
    this._pluginStateLastSentAt = 0;
    this._pluginStateSentAt = 0;
    this.latencyMs = null;
    this._latencyBuffer = [];
    this._latencyStatsCache = null;

    // Notify consumers to clear cached plugin config (clickThrough, alignment,
    // etc.) so stale values don't persist across reconnections.
    if (opts?.notifyPluginReset && hadPlugin) {
      this.onPluginStateReset?.();
    }
  }

  /**
   * Force an immediate reconnect, resetting backoff.
   * @param {{ url: string, token?: string }} [cfg] - Config to use; if omitted, caller must call connect() manually.
   */
  forceReconnect(cfg) {
    if (this._destroyed) return;
    this._reconnectAttempt = 0;
    // Record disconnect timestamp before cleanup nulls the socket reference.
    // Without this, tooltips/debug info show stale lastDisconnectedAt after force reconnect.
    this.lastDisconnectedAt = Date.now();
    this._cleanup({ notifyPluginReset: true });
    if (cfg) this.connect(cfg);
  }

  /** Whether the client has an active, authenticated gateway connection. */
  get isConnected() {
    return this._ws !== null &&
      this._ws.readyState === WebSocket.OPEN &&
      this.connectedSince !== null;
  }

  /** Current reconnect attempt count (for tooltip display). */
  get reconnectAttempt() {
    return this._reconnectAttempt;
  }

  /** The plugin state method name that last succeeded (null if not yet resolved). */
  get pluginStateMethod() {
    return this.hasPlugin ? PLUGIN_STATE_METHODS[this._pluginStateMethodIndex] : null;
  }

  /** The plugin reset method name currently in use (follows state method resolution). */
  get pluginResetMethod() {
    return this.hasPlugin ? PLUGIN_RESET_METHODS[this._pluginResetMethodIndex] : null;
  }

  /** Raw WebSocket readyState (0-3) or null if no socket exists. */
  get wsReadyState() {
    return this._ws?.readyState ?? null;
  }

  /**
   * Connection uptime in seconds, or null if not connected.
   * Avoids repeated `Math.round((Date.now() - connectedSince) / 1000)` in consumers.
   */
  get uptimeSeconds() {
    if (this.connectedSince === null) return null;
    return Math.max(0, Math.round((Date.now() - this.connectedSince) / 1000));
  }

  /** Whether plugin state polling is currently paused (e.g. window hidden). */
  get isPollingPaused() {
    return this._pollingPaused;
  }

  /**
   * Human-readable close detail string (e.g. "1006 (abnormal)" or "going away").
   * Returns null if no disconnect has occurred yet.
   * Consumers can use this directly in tooltips/debug info instead of
   * manually formatting from the onDisconnect callback.
   */
  get lastCloseDetail() {
    if (this.lastCloseCode === null && !this.lastCloseReason) return null;
    return formatCloseDetail(this.lastCloseCode, this.lastCloseReason) || null;
  }

  /** Whether the client has been destroyed via destroy(). */
  get isDestroyed() {
    return this._destroyed;
  }

  /**
   * Stable client instance ID (generated once per client lifetime).
   * Prevents duplicate sessions on the gateway after reconnects.
   * Exposed as a getter so consumers (debug info, tray tooltip) can access
   * it directly without calling getStatus().
   */
  get instanceId() {
    return this._instanceId;
  }

  /**
   * Compute min/max/avg latency from the rolling buffer.
   * Returns null if no samples are available.
   *
   * @returns {{ min: number, max: number, avg: number, median: number, p95: number, jitter: number, samples: number } | null}
   */
  get latencyStats() {
    const buf = this._latencyBuffer;
    if (!buf || buf.length === 0) return null;
    // Return cached result if available (invalidated when new samples are added).
    // Avoids re-sorting the buffer on every access within the same poll tick
    // (tray tooltip, debug info, and renderer all read this per frame).
    if (this._latencyStatsCache) return this._latencyStatsCache;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    const avg = sum / buf.length;
    // Jitter: standard deviation of latency samples. High jitter indicates
    // an unstable connection even when median/avg look acceptable.
    // Uses population stddev (not sample) since we have the full rolling window.
    let sqDiffSum = 0;
    for (let i = 0; i < buf.length; i++) {
      const diff = buf[i] - avg;
      sqDiffSum += diff * diff;
    }
    const jitter = Math.round(Math.sqrt(sqDiffSum / buf.length));
    // Median is more meaningful than average for latency because it's robust
    // against outlier spikes (e.g. a single 2s GC pause doesn't skew it).
    const sorted = buf.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : Math.round(sorted[mid]);
    // p95: 95th percentile — reveals tail latency that median/avg hide.
    // Uses nearest-rank method: ceil(0.95 * n) - 1, clamped to valid index.
    const p95Idx = Math.min(Math.ceil(sorted.length * 0.95) - 1, sorted.length - 1);
    const p95 = Math.round(sorted[Math.max(0, p95Idx)]);
    this._latencyStatsCache = {
      min: Math.round(min),
      max: Math.round(max),
      avg: Math.round(avg),
      median,
      p95,
      jitter,
      samples: buf.length,
    };
    return this._latencyStatsCache;
  }

  /**
   * Connection success rate as an integer percentage (0-100), or null if no attempts.
   * Computed from sessionConnectCount / sessionAttemptCount.
   * Useful for diagnosing flaky connections at a glance (e.g. "50% → half your connects fail").
   */
  get connectionSuccessRate() {
    if (this.sessionAttemptCount <= 0) return null;
    return Math.round((this.sessionConnectCount / this.sessionAttemptCount) * 100);
  }

  /**
   * Timestamp (epoch ms) of the last WebSocket message received, or 0 if none.
   * Useful for diagnosing stale connections: consumers can compare this against
   * Date.now() to detect gaps before the stale-check timer triggers a reconnect.
   */
  get lastMessageAt() {
    return this._lastMessageAt;
  }

  /**
   * Milliseconds since the last WebSocket message, or null if not connected.
   * Lets consumers show proactive staleness warnings (e.g. "no data for 8s")
   * before the automatic stale-check timer (default 15s) triggers a reconnect.
   */
  get staleSinceMs() {
    if (this.connectedSince === null || this._lastMessageAt <= 0) return null;
    return Math.max(0, Date.now() - this._lastMessageAt);
  }

  /**
   * Return a plain, JSON-serializable snapshot of the client's current state.
   * Useful for debug info export, logging, and diagnostics without manually
   * plucking individual properties.
   *
   * @returns {object} Serializable status object
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      isDestroyed: this._destroyed,
      instanceId: this.instanceId,
      connectedSince: this.connectedSince,
      firstConnectedAt: this.firstConnectedAt,
      connectedUrl: this.connectedUrl,
      targetUrl: this.targetUrl,
      hasPlugin: this.hasPlugin,
      pluginStateMethod: this.pluginStateMethod,
      latencyMs: this.latencyMs,
      latencyStats: this.latencyStats,
      wsReadyState: this.wsReadyState,
      reconnectAttempt: this._reconnectAttempt,
      sessionConnectCount: this.sessionConnectCount,
      sessionAttemptCount: this.sessionAttemptCount,
      lastDisconnectedAt: this.lastDisconnectedAt,
      lastCloseCode: this.lastCloseCode,
      lastCloseReason: this.lastCloseReason,
      lastCloseDetail: this.lastCloseDetail,
      isPollingPaused: this._pollingPaused,
      uptimeSeconds: this.uptimeSeconds,
      pluginResetMethod: this.pluginResetMethod,
      pluginStateMethodIndex: this._pluginStateMethodIndex,
      pluginResetMethodIndex: this._pluginResetMethodIndex,
      pluginPollerStarted: this._pluginPollerStarted,
      connectionSuccessRate: this.connectionSuccessRate,
      lastMessageAt: this._lastMessageAt || null,
      staleSinceMs: this.staleSinceMs,
    };
  }

  /**
   * JSON.stringify() support — delegates to getStatus() so
   * `JSON.stringify(client)` produces a clean diagnostic snapshot
   * without manual plucking (useful for logging and IPC serialization).
   *
   * @returns {object}
   */
  toJSON() {
    return this.getStatus();
  }

  /**
   * Human-readable one-line summary for quick diagnostic logging.
   * Example: "GatewayClient<connected 45s, ws://localhost:18789, plugin=true, 12ms 🟢>"
   *
   * @returns {string}
   */
  toString() {
    const parts = [];
    if (this._destroyed) {
      parts.push('destroyed');
    } else if (this.isConnected) {
      const uptime = this.uptimeSeconds;
      parts.push(`connected ${uptime !== null ? `${uptime}s` : ''}`);
      if (this.connectedUrl) parts.push(this.connectedUrl);
      parts.push(`plugin=${this.hasPlugin}`);
      if (this.latencyMs !== null) {
        const source = resolveQualitySource(this.latencyMs, this.latencyStats);
        const quality = connectionQuality(source ?? this.latencyMs);
        const emoji = quality ? ` ${connectionQualityEmoji(quality)}` : '';
        parts.push(`${formatLatency(source ?? this.latencyMs)}${emoji}`);
      }
    } else {
      parts.push('disconnected');
      if (this.targetUrl) parts.push(this.targetUrl);
      if (this._reconnectAttempt > 0) parts.push(`retry #${this._reconnectAttempt}`);
    }
    return `GatewayClient<${parts.join(', ')}>`;
  }

  /**
   * Tear down all timers and close the socket.
   * Fires onPluginStateReset so consumers clear any cached plugin config.
   * After destroy(), connect() and other methods become no-ops.
   */
  destroy() {
    this._destroyed = true;
    this._cleanup({ notifyPluginReset: true });
  }

  /** @private */
  _isMissingMethod(msg) {
    return isMissingMethodResponse(msg);
  }
}
