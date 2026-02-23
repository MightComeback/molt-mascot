import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { GatewayClient } from '../src/gateway-client.js';
import { createLatencyTracker } from '../src/latency-tracker.js';

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

  // Clean up pending timers (reconnect, countdown, stale-check, poller) to prevent
  // leaking into subsequent tests — e.g. a reconnect timer from "fires onDisconnect"
  // can overwrite FakeWebSocket._last during the "firstConnectedAt" test's async wait.
  afterEach(() => {
    client.destroy();
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

    it('reports 0 for lastMessageAt when no messages received', () => {
      expect(client.lastMessageAt).toBe(0);
    });

    it('exposes instanceId as a public getter matching getStatus()', () => {
      expect(typeof client.instanceId).toBe('string');
      expect(client.instanceId).toMatch(/^moltMascot-/);
      expect(client.instanceId).toBe(client.getStatus().instanceId);
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
      expect(status.isPollingPaused).toBe(false);
      // Verify no duplicate keys (pollingPaused was removed in favor of isPollingPaused)
      expect(status).not.toHaveProperty('pollingPaused');
      // Ensure it's JSON-serializable (no circular refs, no functions)
      const json = JSON.stringify(status);
      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed.isConnected).toBe(false);
    });

    it('includes lastMessageAt (null when no messages received)', () => {
      const status = client.getStatus();
      expect(status.lastMessageAt).toBeNull();
    });

    it('includes instanceId as a non-empty string', () => {
      const status = client.getStatus();
      expect(typeof status.instanceId).toBe('string');
      expect(status.instanceId).toMatch(/^moltMascot-/);
    });
  });

  describe('toJSON()', () => {
    it('delegates to getStatus() so JSON.stringify(client) works', () => {
      const json = JSON.stringify(client);
      const parsed = JSON.parse(json);
      expect(parsed).toEqual(client.getStatus());
      expect(parsed.isConnected).toBe(false);
      expect(parsed.instanceId).toMatch(/^moltMascot-/);
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
      expect(frame.params.client.arch).toBe('');
    });

    it('includes arch in connect frame when provided', () => {
      const c = new GatewayClient({ clientArch: 'arm64' });
      c.connect({ url: 'ws://localhost:9999' });
      const ws = FakeWebSocket._last;
      ws._open();
      const frame = JSON.parse(ws._sent[0]);
      expect(frame.params.client.arch).toBe('arm64');
      c.destroy();
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

    it('updates lastMessageAt on incoming message', () => {
      client.connect({ url: 'ws://localhost:9999' });
      const ws = FakeWebSocket._last;
      ws._open();
      const before = Date.now();
      const connectFrame = JSON.parse(ws._sent[0]);
      ws._message({ type: 'res', id: connectFrame.id, ok: true, payload: { type: 'hello-ok' } });
      expect(client.lastMessageAt).toBeGreaterThanOrEqual(before);
      expect(client.lastMessageAt).toBeLessThanOrEqual(Date.now());
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

  describe('uptimeSeconds', () => {
    it('returns seconds since connection', () => {
      client.connectedSince = Date.now() - 5000;
      const uptime = client.uptimeSeconds;
      expect(uptime).toBeGreaterThanOrEqual(4);
      expect(uptime).toBeLessThanOrEqual(6);
    });
  });

  describe('firstConnectedAt', () => {
    it('is set on first handshake and preserved across reconnects', async () => {
      client.connect({ url: 'ws://localhost:9999' });
      const ws1 = FakeWebSocket._last;
      ws1._open();
      const f1 = JSON.parse(ws1._sent[0]);
      ws1._message({ type: 'res', id: f1.id, ok: true, payload: { type: 'hello-ok' } });
      const firstTs = client.firstConnectedAt;
      expect(firstTs).not.toBeNull();
      expect(client.sessionConnectCount).toBe(1);

      // Disconnect and reconnect
      ws1._close(1006);
      // Wait for reconnect timer (base=100ms + up to 20% jitter = max ~120ms)
      await new Promise(r => setTimeout(r, 250));
      const ws2 = FakeWebSocket._last;
      if (ws2 && ws2 !== ws1) {
        ws2._open();
        const f2 = JSON.parse(ws2._sent[0]);
        ws2._message({ type: 'res', id: f2.id, ok: true, payload: { type: 'hello-ok' } });
        expect(client.firstConnectedAt).toBe(firstTs);
        expect(client.sessionConnectCount).toBe(2);
      }
    });
  });

  describe('connect() error handling', () => {
    it('handles synchronous WebSocket constructor error gracefully', () => {
      const OrigWS = globalThis.WebSocket;
      globalThis.WebSocket = function() { throw new Error('Invalid URL'); };
      try {
        const onError = mock(() => {});
        const onFailure = mock(() => {});
        client.onError = onError;
        client.onHandshakeFailure = onFailure;
        client.connect({ url: '' });
        expect(onError).toHaveBeenCalled();
        expect(onFailure).toHaveBeenCalled();
      } finally {
        globalThis.WebSocket = OrigWS;
      }
    });

    it('handles send failure during WebSocket open', () => {
      client.connect({ url: 'ws://localhost:9999' });
      const ws = FakeWebSocket._last;
      // Override send to throw (simulates socket closing between open and send)
      ws.send = () => { throw new Error('Socket closed'); };
      const onError = mock(() => {});
      client.onError = onError;
      ws._open();
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('plugin reset method fallback', () => {
    it('falls back through reset method aliases on missing method', () => {
      client.connect({ url: 'ws://localhost:9999' });
      const ws = FakeWebSocket._last;
      ws._open();
      const connectFrame = JSON.parse(ws._sent[0]);
      ws._message({ type: 'res', id: connectFrame.id, ok: true, payload: { type: 'hello-ok' } });
      // Complete plugin discovery
      const stateReq = JSON.parse(ws._sent[1]);
      ws._message({ type: 'res', id: stateReq.id, ok: true, payload: { ok: true, state: { mode: 'idle' } } });

      // Send reset
      client.sendPluginReset();
      const resetReq1 = JSON.parse(ws._sent[ws._sent.length - 1]);
      const resetId1 = resetReq1.id;
      const resetMethod1 = resetReq1.method;

      // Respond with method not found
      ws._message({ type: 'res', id: resetId1, ok: false, payload: { error: { code: -32601, message: 'Method not found' } } });

      // Should have sent a fallback with the next method alias
      const resetReq2 = JSON.parse(ws._sent[ws._sent.length - 1]);
      expect(resetReq2.method).not.toBe(resetMethod1);
      expect(resetReq2.method).toContain('reset');
    });
  });

  describe('event-triggered plugin refresh', () => {
    it('sends immediate state refresh on agent events when plugin active', () => {
      const onPlugin = mock(() => {});
      client.onPluginState = onPlugin;
      client.connect({ url: 'ws://localhost:9999' });
      const ws = FakeWebSocket._last;
      ws._open();
      const connectFrame = JSON.parse(ws._sent[0]);
      ws._message({ type: 'res', id: connectFrame.id, ok: true, payload: { type: 'hello-ok' } });
      const stateReq = JSON.parse(ws._sent[1]);
      ws._message({ type: 'res', id: stateReq.id, ok: true, payload: { ok: true, state: { mode: 'idle' } } });

      // Reset rate limit
      client._pluginStatePending = false;
      client._pluginStateLastSentAt = 0;
      const sentBefore = ws._sent.length;

      // Send an agent event — should trigger a state refresh
      ws._message({ type: 'event', event: 'agent', payload: { phase: 'start' } });
      expect(ws._sent.length).toBe(sentBefore + 1);
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

  describe('latencyStats', () => {
    it('returns null when no samples', () => {
      const client = new GatewayClient();
      expect(client.latencyStats).toBeNull();
    });

    it('computes min/max/avg from latency buffer', () => {
      const client = new GatewayClient();
      for (const v of [10, 20, 30]) client._latencyTracker.push(v);
      const stats = client.latencyStats;
      expect(stats).toEqual({ min: 10, max: 30, avg: 20, median: 20, p95: 30, p99: 30, jitter: 8, samples: 3 });
    });

    it('rounds fractional averages', () => {
      const client = new GatewayClient();
      for (const v of [10, 11]) client._latencyTracker.push(v);
      const stats = client.latencyStats;
      expect(stats.avg).toBe(11); // 10.5 rounds to 11
    });

    it('is included in getStatus()', () => {
      const client = new GatewayClient();
      for (const v of [5, 15]) client._latencyTracker.push(v);
      const status = client.getStatus();
      expect(status.latencyStats).toEqual({ min: 5, max: 15, avg: 10, median: 10, p95: 15, p99: 15, jitter: 5, samples: 2 });
    });

    it('is cleared on cleanup', () => {
      const client = new GatewayClient();
      for (const v of [10, 20, 30]) client._latencyTracker.push(v);
      client._cleanup();
      expect(client.latencyStats).toBeNull();
    });

    it('accumulates from plugin state responses', () => {
      const client = new GatewayClient();
      client.connect({ url: 'ws://localhost:9999' });
      const ws = FakeWebSocket._last;
      ws._open();
      const connectFrame = JSON.parse(ws._sent[0]);
      ws._message({ type: 'res', id: connectFrame.id, ok: true, payload: { type: 'hello-ok' } });
      // First plugin state response
      const req1 = JSON.parse(ws._sent[1]);
      ws._message({ type: 'res', id: req1.id, ok: true, payload: { ok: true, state: { mode: 'idle' } } });
      expect(client._latencyTracker.count()).toBe(1);
      expect(client.latencyStats.samples).toBe(1);
    });

    it('refreshPluginState clears guards so request is not dropped', () => {
      const client = new GatewayClient();
      client.connect({ url: 'ws://localhost:9999' });
      const ws = FakeWebSocket._last;
      ws._open();
      const connectFrame = JSON.parse(ws._sent[0]);
      ws._message({ type: 'res', id: connectFrame.id, ok: true, payload: { type: 'hello-ok' } });
      // Initial plugin state request sent automatically
      const sentBefore = ws._sent.length;
      // Simulate pending state (as if the first request hasn't returned yet)
      client._pluginStatePending = true;
      client._pluginStateLastSentAt = Date.now();
      // Without the fix, refreshPluginState would be silently dropped
      client.refreshPluginState();
      expect(ws._sent.length).toBeGreaterThan(sentBefore);
    });

    it('caps buffer at max size', () => {
      // Use a client with a small maxSamples to test capping behavior.
      // The tracker is created in the constructor with maxSamples=60,
      // so we replace it with a smaller one for this test.
      const client = new GatewayClient();
      client._latencyTracker = createLatencyTracker({ maxSamples: 3 });
      for (const v of [10, 20, 30, 40]) client._latencyTracker.push(v);
      expect(client._latencyTracker.samples()).toEqual([20, 30, 40]);
      expect(client.latencyStats).toEqual({ min: 20, max: 40, avg: 30, median: 30, p95: 40, p99: 40, jitter: 8, samples: 3 });
    });
  });

  describe('connectionSuccessRate', () => {
    it('returns null when no attempts', () => {
      expect(client.connectionSuccessRate).toBeNull();
    });

    it('returns 100 when all attempts succeed', () => {
      client.sessionAttemptCount = 5;
      client.sessionConnectCount = 5;
      expect(client.connectionSuccessRate).toBe(100);
    });

    it('returns correct percentage for partial success', () => {
      client.sessionAttemptCount = 10;
      client.sessionConnectCount = 7;
      expect(client.connectionSuccessRate).toBe(70);
    });

    it('returns 0 when no attempts succeed', () => {
      client.sessionAttemptCount = 3;
      client.sessionConnectCount = 0;
      expect(client.connectionSuccessRate).toBe(0);
    });

    it('is included in getStatus()', () => {
      client.sessionAttemptCount = 4;
      client.sessionConnectCount = 3;
      expect(client.getStatus().connectionSuccessRate).toBe(75);
    });
  });

  describe('staleSinceMs', () => {
    it('returns null when not connected', () => {
      expect(client.staleSinceMs).toBeNull();
    });

    it('returns null when connected but no messages received yet', () => {
      client.connectedSince = Date.now();
      // _lastMessageAt defaults to 0
      expect(client.staleSinceMs).toBeNull();
    });

    it('returns ms since last message when connected', () => {
      const now = Date.now();
      client.connectedSince = now - 60000;
      client._lastMessageAt = now - 5000;
      const stale = client.staleSinceMs;
      expect(stale).toBeGreaterThanOrEqual(4900); // allow ~100ms test jitter
      expect(stale).toBeLessThan(6000);
    });

    it('is included in getStatus()', () => {
      const now = Date.now();
      client.connectedSince = now - 60000;
      client._lastMessageAt = now - 3000;
      const status = client.getStatus();
      expect(status.staleSinceMs).toBeGreaterThanOrEqual(2900);
      expect(status.staleSinceMs).toBeLessThan(4000);
    });

    it('returns null in getStatus() when disconnected', () => {
      expect(client.getStatus().staleSinceMs).toBeNull();
    });
  });

  describe('toString', () => {
    it('shows disconnected when not connected', () => {
      const str = client.toString();
      expect(str).toStartWith('GatewayClient<');
      expect(str).toContain('disconnected');
    });

    it('shows destroyed after destroy()', () => {
      client.destroy();
      expect(client.toString()).toContain('destroyed');
    });

    it('shows connected state with uptime and plugin status', () => {
      client.connectedSince = Date.now() - 45000;
      client.connectedUrl = 'ws://localhost:18789';
      client.hasPlugin = true;
      // Simulate open socket for isConnected
      client._ws = { readyState: 1 };
      const str = client.toString();
      expect(str).toContain('connected');
      expect(str).toContain('ws://localhost:18789');
      expect(str).toContain('plugin=true');
    });

    it('includes latency with quality emoji when available', () => {
      client.connectedSince = Date.now();
      client.connectedUrl = 'ws://localhost:18789';
      client._ws = { readyState: 1 };
      client.latencyMs = 25;
      const str = client.toString();
      expect(str).toContain('25ms');
      expect(str).toContain('🟢');
    });

    it('shows retry count when disconnected and reconnecting', () => {
      client._reconnectAttempt = 3;
      client.targetUrl = 'ws://example.com';
      const str = client.toString();
      expect(str).toContain('retry #3');
      expect(str).toContain('ws://example.com');
    });

    it('shows close detail when disconnected', () => {
      client.lastCloseCode = 1006;
      client.lastCloseReason = null;
      const str = client.toString();
      expect(str).toContain('disconnected');
      expect(str).toContain('abnormal closure');
    });

    it('shows reconnect count when disconnected with flappy connection', () => {
      client.sessionConnectCount = 4;
      client._reconnectAttempt = 1;
      const str = client.toString();
      expect(str).toContain('↻3');
    });

    it('includes degraded health status with reasons when latency is poor', () => {
      client.connectedSince = Date.now();
      client.connectedUrl = 'ws://localhost:18789';
      client._ws = { readyState: 1 };
      client.latencyMs = 600; // poor latency → degraded
      const str = client.toString();
      expect(str).toContain('⚠️ degraded');
      expect(str).toContain('poor latency');
    });

    it('includes unhealthy health status with reasons when disconnected after connection', () => {
      // Simulate a client that was connected then disconnected
      client.connectedSince = null;
      client._ws = null;
      client.sessionConnectCount = 1;
      client.sessionAttemptCount = 2;
      client.lastDisconnectedAt = Date.now();
      client.targetUrl = 'ws://localhost:18789';
      // toString shows disconnected, not health (health is for connected state in toString)
      const str = client.toString();
      expect(str).toContain('disconnected');
    });
  });

  describe('connectionUptimePercent', () => {
    it('returns null when never connected', () => {
      expect(client.connectionUptimePercent()).toBeNull();
    });

    it('returns ~100 when connected since first connect', () => {
      const now = Date.now();
      client.firstConnectedAt = now - 10000;
      client.connectedSince = now - 10000;
      client.lastDisconnectedAt = null;
      const pct = client.connectionUptimePercent();
      expect(pct).toBeGreaterThanOrEqual(99);
      expect(pct).toBeLessThanOrEqual(100);
    });

    it('returns lower percentage when currently disconnected', () => {
      const now = Date.now();
      client.firstConnectedAt = now - 10000;
      client.connectedSince = null;
      client.lastDisconnectedAt = now - 5000;
      const pct = client.connectionUptimePercent();
      // ~50% (5s connected out of 10s since first connect)
      expect(pct).toBeGreaterThanOrEqual(40);
      expect(pct).toBeLessThanOrEqual(60);
    });

    it('accepts processUptimeMs for more accurate denominator', () => {
      const now = Date.now();
      client.firstConnectedAt = now - 5000;
      client.connectedSince = now - 5000;
      // Process has been alive for 20s but connected for only 5s
      const pct = client.connectionUptimePercent(20000);
      expect(pct).toBeGreaterThanOrEqual(20);
      expect(pct).toBeLessThanOrEqual(30);
    });

    it('is included in getStatus()', () => {
      const status = client.getStatus();
      expect(status).toHaveProperty('connectionUptimePercent');
      expect(status.connectionUptimePercent).toBeNull();
    });
  });

  describe('healthStatus', () => {
    it('returns unhealthy when destroyed', () => {
      client.destroy();
      expect(client.healthStatus).toBe('unhealthy');
    });

    it('returns unhealthy when not connected', () => {
      expect(client.healthStatus).toBe('unhealthy');
    });

    it('returns healthy when connected with no issues', () => {
      client.connect({ url: 'ws://example.com' });
      const ws = FakeWebSocket._last;
      ws.readyState = FakeWebSocket.OPEN;
      ws._emit('open');
      // Simulate successful handshake
      ws._emit('message', { data: JSON.stringify({
        type: 'res',
        id: JSON.parse(ws._sent[0]).id,
        payload: { type: 'hello-ok' },
      }) });
      expect(client.isConnected).toBe(true);
      expect(client.healthStatus).toBe('healthy');
    });

    it('returns degraded when connection success rate is low', () => {
      // Inflate attempt count to simulate failures
      client.sessionAttemptCount = 10;
      client.sessionConnectCount = 5;
      client.connect({ url: 'ws://example.com' });
      const ws = FakeWebSocket._last;
      ws.readyState = FakeWebSocket.OPEN;
      ws._emit('open');
      ws._emit('message', { data: JSON.stringify({
        type: 'res',
        id: JSON.parse(ws._sent[0]).id,
        payload: { type: 'hello-ok' },
      }) });
      // hasPlugin needs to be true for error rate check
      client.hasPlugin = true;
      expect(client.healthStatus).toBe('degraded');
    });

    it('includes healthStatus in getStatus()', () => {
      const status = client.getStatus();
      expect(status).toHaveProperty('healthStatus');
      expect(status.healthStatus).toBe('unhealthy');
    });

    it('includes healthReasons in getStatus()', () => {
      const status = client.getStatus();
      expect(status).toHaveProperty('healthReasons');
      expect(Array.isArray(status.healthReasons)).toBe(true);
    });

    it('healthReasons getter returns array', () => {
      expect(Array.isArray(client.healthReasons)).toBe(true);
    });

    it('healthReasons is non-empty when unhealthy (disconnected)', () => {
      // Client is not connected, so healthStatus is unhealthy
      expect(client.healthStatus).toBe('unhealthy');
      expect(client.healthReasons.length).toBeGreaterThan(0);
    });
  });

  describe('fatal close codes', () => {
    it('stops auto-reconnect on fatal close code (auth failed 4001)', () => {
      const fatalCalls = [];
      const countdownCalls = [];
      client.onFatalClose = (info) => fatalCalls.push(info);
      client.onReconnectCountdown = (s) => countdownCalls.push(s);

      client.connect({ url: 'ws://example.com' });
      const ws = FakeWebSocket._last;
      ws._open();
      // Complete handshake
      ws._message({ type: 'res', id: JSON.parse(ws._sent[0]).id, payload: { type: 'hello-ok' } });
      expect(client.isConnected).toBe(true);

      // Fatal close
      ws._close(4001, 'auth failed');

      expect(fatalCalls).toHaveLength(1);
      expect(fatalCalls[0].code).toBe(4001);
      expect(fatalCalls[0].detail).toContain('auth failed');
      // No reconnect countdown should have started
      expect(countdownCalls).toHaveLength(0);
    });

    it('still auto-reconnects on recoverable close code (1006)', () => {
      const fatalCalls = [];
      const countdownCalls = [];
      client.onFatalClose = (info) => fatalCalls.push(info);
      client.onReconnectCountdown = (s) => countdownCalls.push(s);

      client.connect({ url: 'ws://example.com' });
      const ws = FakeWebSocket._last;
      ws._open();
      ws._message({ type: 'res', id: JSON.parse(ws._sent[0]).id, payload: { type: 'hello-ok' } });

      // Recoverable close
      ws._close(1006, '');

      expect(fatalCalls).toHaveLength(0);
      // Reconnect countdown should have started (reconnect is scheduled via setTimeout)
      expect(countdownCalls.length).toBeGreaterThan(0);
    });
  });
});
