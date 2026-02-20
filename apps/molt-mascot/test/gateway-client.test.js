import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { GatewayClient } from '../src/gateway-client.js';

// GatewayClient requires WebSocket in the global scope; provide a minimal stub
// so we can test non-network logic without a real server.
class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = FakeWebSocket.OPEN;
  onclose = null;
  constructor() {}
  send() {}
  close() { this.readyState = FakeWebSocket.CLOSED; }
  addEventListener() {}
  removeEventListener() {}
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
      expect(status.hasPlugin).toBe(false);
      expect(status.sessionConnectCount).toBe(0);
      expect(status.sessionAttemptCount).toBe(0);
      expect(status.latencyMs).toBeNull();
      expect(typeof status.reconnectAttempt).toBe('number');
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
});
