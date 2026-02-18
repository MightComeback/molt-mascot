/**
 * Gateway WebSocket client for Molt Mascot.
 * Extracted from renderer.js for maintainability and testability.
 *
 * Handles: connection lifecycle, reconnect with exponential backoff,
 * stale-connection detection, protocol negotiation, and plugin state polling.
 */

import { isMissingMethodResponse } from './utils.js';

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
 */

const PLUGIN_STATE_METHODS = [
  '@molt/mascot-plugin.state',
  'molt-mascot.state',
  'molt-mascot-plugin.state',
  'moltMascot.state',
  'moltMascotPlugin.state',
];

const PLUGIN_RESET_METHODS = [
  '@molt/mascot-plugin.reset',
  'molt-mascot.reset',
  'molt-mascot-plugin.reset',
  'moltMascot.reset',
  'moltMascotPlugin.reset',
];

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

    /** @type {WebSocket|null} */
    this._ws = null;
    this._reqId = 0;
    this._reconnectAttempt = 0;
    this._reconnectCountdownTimer = null;
    this._reconnectTimer = null;

    /** @type {number|null} */
    this.connectedSince = null;
    this.connectedUrl = '';
    /** @type {number|null} Timestamp of last disconnect (for tooltip "disconnected X ago") */
    this.lastDisconnectedAt = null;

    // Stale connection detection
    this._lastMessageAt = 0;
    this._staleCheckTimer = null;

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
    const delay = Math.min(
      this._reconnectBaseMs * Math.pow(2, this._reconnectAttempt),
      this._reconnectMaxMs
    );
    const jitter = delay * 0.2 * Math.random();
    this._reconnectAttempt++;
    return Math.round(delay + jitter);
  }

  _startStaleCheck() {
    this._stopStaleCheck();
    this._lastMessageAt = Date.now();
    this._staleCheckTimer = setInterval(() => {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
      if (!this.connectedSince) return;
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
    this._ws.send(JSON.stringify({
      type: 'req', id,
      method: PLUGIN_STATE_METHODS[this._pluginStateMethodIndex],
      params: {},
    }));
  }

  _startPluginPoller() {
    if (this._pluginPollerStarted) return;
    this._pluginPollerStarted = true;
    if (this._pollInterval) clearInterval(this._pollInterval);
    this._pollInterval = setInterval(() => {
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

    let ws;
    try {
      ws = new WebSocket(cfg.url);
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
        this.connectedSince = Date.now();
        this.connectedUrl = cfg.url || '';
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

      // Handshake failure
      if (msg.type === 'res' && msg.id && msg.id === this._connectReqId && !msg.payload?.type?.startsWith('hello')) {
        const err = msg.payload?.error || msg.error;
        const detail = typeof err === 'string' ? err
          : err?.message || err?.code || 'connection rejected';
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
          ws.send(JSON.stringify({ type: 'req', id, method: PLUGIN_RESET_METHODS[this._pluginResetMethodIndex], params: {} }));
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
      this.connectedSince = null;
      this.connectedUrl = '';
      this._stopStaleCheck();

      this.onPluginStateReset?.();
      this.onDisconnect?.({ code: ev?.code, reason: (ev?.reason || '').trim() || undefined });

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
   * Request an immediate plugin state refresh.
   * Useful after actions that change state (e.g., reset, config change)
   * so the UI updates without waiting for the next 1s poll cycle.
   */
  refreshPluginState() {
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
    this._ws.send(JSON.stringify({
      type: 'req', id,
      method: PLUGIN_RESET_METHODS[0],
      params: {},
    }));
  }

  /**
   * Force an immediate reconnect, resetting backoff.
   * @param {{ url: string, token?: string }} [cfg] - Config to use; if omitted, caller must call connect() manually.
   */
  forceReconnect(cfg) {
    this._reconnectAttempt = 0;
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

  /**
   * Tear down all timers and close the socket.
   */
  destroy() {
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
    // Clear connection state so stale values don't leak into tooltips/status
    // if the instance is inspected after destruction.
    this.connectedSince = null;
    this.connectedUrl = '';
    this.hasPlugin = false;
    this._pluginStatePending = false;
    this._pluginStateLastSentAt = 0;
  }

  /** @private */
  _isMissingMethod(msg) {
    return isMissingMethodResponse(msg);
  }
}
