import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { GatewayClient } from '../src/gateway-client.js';

// GatewayClient requires WebSocket in the global scope; provide a controllable stub
// so we can test connection lifecycle without a real server.
class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = FakeWebSocket.CONNECTING;
  onclose = null;
  _listeners = {};
  _sent = [];
  constructor(url) {
    this.url = url;
    FakeWebSocket._last = this;
  }
  send(data) { this._sent.push(data); }
  close() { this.readyState = FakeWebSocket.CLOSED; }
  addEventListener(event, fn) {
    (this._listeners[event] ??= []).push(fn);
  }
  removeEventListener(event, fn) {
    const arr = this._listeners[event];
    if (arr) this._listeners[event] = arr.filter(f => f !== fn);
  }
  // Test helpers: simulate server events
  _emit(event, data) {
    for (const fn of (this._listeners[event] || [])) fn(data);
  }
  _open() {
    this.readyState = FakeWebSocket.OPEN;
    this._emit('open', {});
  }
  _message(obj) {
    this._emit('message', { data: JSON.stringify(obj) });
  }
  _close(code = 1006, reason = '') {
    this.readyState = FakeWebSocket.CLOSED;
    if (this.onclose) this.onclose({ code, reason });
  }
  static _last = null;
}
globalThis.WebSocket = FakeWebSocket;

describe('GatewayClient', () => {
  let client;

  beforeEach(() => {
    client = new GatewayClient({
      reconnectBaseMs: 100,
      reconnectMaxMs: 1000,
    });
  });

  describe('constructor defaults', () => {
    it('starts with no connection', () => {
      expect(client.isConnected).toBe(false);
      expect(client.connectedSince).toBeNull();
      expect(client.connectedUrl).toBe('');
      expect(client.targetUrl).toBe('');
      expect(client.sessionConnectCount).toBe(0);
      expect(client.sessionAttemptCount).toBe(0);
      expect(client.latencyMs).toBeNull();
      expect(client.hasPlugin).toBe(false);
      expect(client.isDestroyed).toBe(false);
    });

    it('reports null uptime when not connected', () => {
      expect(client.uptimeSeconds).toBeNull();
    });

    it('reports null lastCloseDetail when no disconnects', () => {
      expect(client.lastCloseDetail).toBeNull();
    });

    it('reports null plugin methods when no plugin', () => {
      expect(client.pluginStateMethod).toBeNull();
      expect(client.pluginResetMethod).toBeNull();
    });
  });

  describe('getStatus()', () => {
    it('returns a serializable snapshot', () => {
      const status = client.getStatus();
      expect(status.isConnected).toBe(false);
      expect(status.isDestroyed).toBe(false);
      expect(status.connectedSince).toBeNull();
      expect(status.firstConnectedAt).toBeNull();
      expect(status.hasPlugin).toBe(false);
      expect(status.sessionConnectCount).toBe(0);
      expect(status.sessionAttemptCount).toBe(0);
      expect(status.latencyMs).toBeNull();
      expect(typeof status.reconnectAttempt).toBe('number');
      expect(status.pluginPollerStarted).toBe(false);
      expect(status.pollingPaused).toBe(false);
      // Ensure it's JSON-serializable (no circular refs, no functions)
      const json = JSON.stringify(status);
      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed.isConnected).toBe(false);
    });
  });

  describe('destroy()', () => {
    it('sets isDestroyed and prevents further connect()', () => {
      const onState = mock(() => {});
      client.onConnectionStateChange = onState;
      client.destroy();
      expect(client.isDestroyed).toBe(true);
      // connect() after destroy should be a no-op
      client.connect({ url: 'ws://localhost:1234' });
      expect(onState).not.toHaveBeenCalled();
    });

    it('fires onPluginStateReset if plugin was active', () => {
      const onReset = mock(() => {});
      client.onPluginStateReset = onReset;
      client.hasPlugin = true;
      client.destroy();
      expect(onReset).toHaveBeenCalledTimes(1);
    });

    it('does not fire onPluginStateReset if no plugin was active', () => {
      const onReset = mock(() => {});
      client.onPluginStateReset = onReset;
      client.hasPlugin = false;
      client.destroy();
      expect(onReset).not.toHaveBeenCalled();
    });
  });

  describe('forceReconnect()', () => {
    it('resets reconnect attempt counter', () => {
      // Simulate some reconnect attempts
      client._reconnectAttempt = 5;
      client.forceReconnect();
      expect(client._reconnectAttempt).toBe(0);
    });

    it('records lastDisconnectedAt', () => {
      expect(client.lastDisconnectedAt).toBeNull();
      const before = Date.now();
      client.forceReconnect();
      expect(client.lastDisconnectedAt).toBeGreaterThanOrEqual(before);
    });

    it('is a no-op after destroy()', () => {
      client.destroy();
      client.lastDisconnectedAt = null;
      client.forceReconnect();
      // lastDisconnectedAt should not change since forceReconnect bails early
      expect(client.lastDisconnectedAt).toBeNull();
    });
  });

  describe('pausePolling / resumePolling', () => {
    it('toggles polling pause state', () => {
      expect(client.isPollingPaused).toBe(false);
      client.pausePolling();
      expect(client.isPollingPaused).toBe(true);
      client.resumePolling();
      expect(client.isPollingPaused).toBe(false);
    });

    it('resumePolling resets rate-limit guards', () => {
      client._pluginStatePending = true;
      client._pluginStateLastSentAt = Date.now();
      client.pausePolling();
      client.resumePolling();
      expect(client._pluginStatePending).toBe(false);
      expect(client._pluginStateLastSentAt).toBe(0);
    });

    it('resumePolling is idempotent when not paused', () => {
      client._pluginStatePending = true;
      client.resumePolling(); // not paused, should be no-op
      expect(client._pluginStatePending).toBe(true); // unchanged
    });
  });

  describe('reconnect delay', () => {
    it('increases with each attempt (exponential backoff)', () => {
      const d0 = client._getReconnectDelay();
      const d1 = client._getReconnectDelay();
      const d2 = client._getReconnectDelay();
      // Each delay should be >= previous (with jitter, not strictly monotone,
      // but the base doubles so statistically d2 > d0 is nearly certain)
      expect(d1).toBeGreaterThanOrEqual(d0 * 0.8); // allow for jitter
      expect(d2).toBeGreaterThanOrEqual(d1 * 0.8);
    });

    it('caps at maxMs', () => {
      // Exhaust the backoff
      for (let i = 0; i < 20; i++) client._getReconnectDelay();
      const delay = client._getReconnectDelay();
      // maxMs=1000 + 20% jitter max = 1200
      expect(delay).toBeLessThanOrEqual(1200);
    });
  });

  describe('lastCloseDetail', () => {
    it('formats code and reason', () => {
      client.lastCloseCode = 1006;
      client.lastCloseReason = null;
      const detail = client.lastCloseDetail;
      expect(detail).toContain('1006');
    });

    it('prefers reason text when provided', () => {
      client.lastCloseCode = 1001;
      client.lastCloseReason = 'server going down';
      const detail = client.lastCloseDetail;
      expect(detail).toContain('server going down');
      expect(detail).toContain('1001');
    });
  });

  describe('_cleanup()', () => {
    it('resets connection state', () => {
      client.connectedSince = Date.now();
      client.connectedUrl = 'ws://test';
      client.hasPlugin = true;
      client.latencyMs = 42;

      client._cleanup();

      expect(client.connectedSince).toBeNull();
      expect(client.connectedUrl).toBe('');
      expect(client.hasPlugin).toBe(false);
      expect(client.latencyMs).toBeNull();
    });

    it('preserves targetUrl across cleanup', () => {
      client.targetUrl = 'ws://my-gateway';
      client._cleanup();
      expect(client.targetUrl).toBe('ws://my-gateway');
    });
  });

  describe('connect()', () => {
    it('fires onConnectionStateChange with connecting', () => {
      const onState = mock(() => {});
      client.onConnectionStateChange = onState;
      client.connect({ url: 'ws://localhost:9999' });
      expect(onState).toHaveBeenCalledWith('connecting');
      expect(client.sessionAttemptCount).toBe(1);
    });

    it('sends connect frame on WebSocket open', () => {
      client.connect({ url: 'ws://localhost:9999', token: 'abc' });
      const ws = FakeWebSocket._last;
      ws._open();
      expect(ws._sent.length).toBe(1);
      const frame = JSON.parse(ws._sent[0]);
      expect(frame.type).toBe('req');
      expect(frame.method).toBe('connect');
      expect(frame.params.auth.token).toBe('abc');
      expect(frame.params.client.id).toBe('molt-mascot-desktop');
    });

    it('handles hello-ok handshake', () => {
      const onSuccess = mock(() => {});
      client.onHandshakeSuccess = onSuccess;
      client.connect({ url: 'ws://localhost:9999' });
      const ws = FakeWebSocket._last;
      ws._open();
      const connectFrame = JSON.parse(ws._sent[0]);
      ws._message({ type: 'res', id: connectFrame.id, ok: true, payload: { type: 'hello-ok' } });
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(client.connectedSince).not.toBeNull();
      expect(client.sessionConnectCount).toBe(1);
      expect(client.connectedUrl).toBe('ws://localhost:9999');
    });

    it('handles handshake failure without reconnect loop', () => {
      const onFailure = mock(() => {});
      const onState = mock(() => {});
      client.onHandshakeFailure = onFailure;
      client.onConnectionStateChange = onState;
      client.connect({ url: 'ws://localhost:9999', token: 'bad' });
      const ws = FakeWebSocket._last;
      ws._open();
      const connectFrame = JSON.parse(ws._sent[0]);
      ws._message({ type: 'res', id: connectFrame.id, ok: false, payload: { error: 'auth denied' } });
      expect(onFailure).toHaveBeenCalledWith('auth denied');
      // Should NOT trigger reconnect (onclose was detached)
      expect(client.connectedSince).toBeNull();
    });

    it('fires onPluginState when plugin responds', () => {
      const onPlugin = mock(() => {});
      client.onPluginState = onPlugin;
      client.connect({ url: 'ws://localhost:9999' });
      const ws = FakeWebSocket._last;
      ws._open();
      const connectFrame = JSON.parse(ws._sent[0]);
      // Complete handshake
      ws._message({ type: 'res', id: connectFrame.id, ok: true, payload: { type: 'hello-ok' } });
      // Plugin state request was sent
      expect(ws._sent.length).toBe(2);
      const stateReq = JSON.parse(ws._sent[1]);
      // Respond with plugin state
      ws._message({ type: 'res', id: stateReq.id, ok: true, payload: { ok: true, state: { mode: 'idle' } } });
      expect(onPlugin).toHaveBeenCalledTimes(1);
      expect(onPlugin.mock.calls[0][0].mode).toBe('idle');
      expect(client.hasPlugin).toBe(true);
    });

    it('falls back through plugin method aliases on missing method', () => {
      client.connect({ url: 'ws://localhost:9999' });
      const ws = FakeWebSocket._last;
      ws._open();
      const connectFrame = JSON.parse(ws._sent[0]);
      ws._message({ type: 'res', id: connectFrame.id, ok: true, payload: { type: 'hello-ok' } });
      const stateReq1 = JSON.parse(ws._sent[1]);
      // Respond with method not found
      ws._message({ type: 'res', id: stateReq1.id, ok: false, payload: { error: { code: -32601, message: 'Method not found' } } });
      // Should have sent a second request with the next method alias
      expect(ws._sent.length).toBe(3);
      const stateReq2 = JSON.parse(ws._sent[2]);
      expect(stateReq2.method).not.toBe(stateReq1.method);
    });

    it('fires onAgentEvent for native agent events when no plugin', () => {
      const onAgent = mock(() => {});
      client.onAgentEvent = onAgent;
      client.connect({ url: 'ws://localhost:9999' });
      const ws = FakeWebSocket._last;
      ws._open();
      const connectFrame = JSON.parse(ws._sent[0]);
      ws._message({ type: 'res', id: connectFrame.id, ok: true, payload: { type: 'hello-ok' } });
      // Don't complete plugin discovery — leave hasPlugin=false
      // Send a native agent event
      ws._message({ type: 'event', event: 'agent', payload: { phase: 'start' } });
      expect(onAgent).toHaveBeenCalledWith({ phase: 'start' });
    });

    it('fires onDisconnect and schedules reconnect on close', () => {
      const onDisconnect = mock(() => {});
      const onCountdown = mock(() => {});
      client.onDisconnect = onDisconnect;
      client.onReconnectCountdown = onCountdown;
      client.connect({ url: 'ws://localhost:9999' });
      const ws = FakeWebSocket._last;
      ws._open();
      const connectFrame = JSON.parse(ws._sent[0]);
      ws._message({ type: 'res', id: connectFrame.id, ok: true, payload: { type: 'hello-ok' } });
      // Now close
      ws._close(1006, 'abnormal');
      expect(onDisconnect).toHaveBeenCalledTimes(1);
      expect(onDisconnect.mock.calls[0][0].code).toBe(1006);
      expect(client.connectedSince).toBeNull();
      expect(client.lastDisconnectedAt).not.toBeNull();
      expect(client.lastCloseCode).toBe(1006);
    });

    it('normalizes http:// URLs to ws://', () => {
      client.connect({ url: 'http://localhost:9999' });
      expect(client.targetUrl).toBe('ws://localhost:9999');
    });

    it('normalizes https:// URLs to wss://', () => {
      client.connect({ url: 'https://gateway.example.com' });
      expect(client.targetUrl).toBe('wss://gateway.example.com');
    });

    it('tracks latency from plugin state response', () => {
      const onPlugin = mock(() => {});
      client.onPluginState = onPlugin;
      client.connect({ url: 'ws://localhost:9999' });
      const ws = FakeWebSocket._last;
      ws._open();
      const connectFrame = JSON.parse(ws._sent[0]);
      ws._message({ type: 'res', id: connectFrame.id, ok: true, payload: { type: 'hello-ok' } });
      const stateReq = JSON.parse(ws._sent[1]);
      ws._message({ type: 'res', id: stateReq.id, ok: true, payload: { ok: true, state: { mode: 'thinking' } } });
      expect(client.latencyMs).not.toBeNull();
      expect(typeof client.latencyMs).toBe('number');
      expect(client.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('sendPluginReset()', () => {
    it('sends reset request when connected', () => {
      client.connect({ url: 'ws://localhost:9999' });
      const ws = FakeWebSocket._last;
      ws._open();
      const connectFrame = JSON.parse(ws._sent[0]);
      ws._message({ type: 'res', id: connectFrame.id, ok: true, payload: { type: 'hello-ok' } });
      const sentBefore = ws._sent.length;
      client.sendPluginReset();
      expect(ws._sent.length).toBe(sentBefore + 1);
      const resetReq = JSON.parse(ws._sent[ws._sent.length - 1]);
      expect(resetReq.method).toContain('reset');
    });

    it('is a no-op when not connected', () => {
      // No connect() call — ws is null
      client.sendPluginReset(); // should not throw
    });
  });

  describe('refreshPluginState()', () => {
    it('sends an immediate state request', () => {
      client.connect({ url: 'ws://localhost:9999' });
      const ws = FakeWebSocket._last;
      ws._open();
      const connectFrame = JSON.parse(ws._sent[0]);
      ws._message({ type: 'res', id: connectFrame.id, ok: true, payload: { type: 'hello-ok' } });
      // Clear the pending flag from the initial state request
      const stateReq = JSON.parse(ws._sent[1]);
      ws._message({ type: 'res', id: stateReq.id, ok: true, payload: { ok: true, state: { mode: 'idle' } } });
      // Reset rate-limit so refreshPluginState() can send immediately
      client._pluginStateLastSentAt = 0;
      const sentBefore = ws._sent.length;
      client.refreshPluginState();
      expect(ws._sent.length).toBe(sentBefore + 1);
    });
  });
});
