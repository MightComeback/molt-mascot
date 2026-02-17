import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { GatewayClient } from "../src/gateway-client.js";

// Minimal WebSocket mock
class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.OPEN;
    this._listeners = {};
    this._sent = [];
    this.onclose = null;
    MockWebSocket._last = this;
  }

  addEventListener(type, fn) {
    (this._listeners[type] ??= []).push(fn);
  }

  removeEventListener(type, fn) {
    if (this._listeners[type]) {
      this._listeners[type] = this._listeners[type].filter((f) => f !== fn);
    }
  }

  send(data) {
    this._sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  // Test helpers
  _emit(type, data) {
    for (const fn of this._listeners[type] || []) fn(data);
  }

  _emitMessage(obj) {
    this._emit("message", { data: JSON.stringify(obj) });
  }
}

let _origWS;

function installMockWS() {
  _origWS = globalThis.WebSocket;
  globalThis.WebSocket = MockWebSocket;
}

function restoreMockWS() {
  globalThis.WebSocket = _origWS;
}

describe("GatewayClient", () => {
  beforeEach(() => {
    installMockWS();
  });

  afterEach(() => {
    restoreMockWS();
  });

  it("sends connect frame on WebSocket open", () => {
    const client = new GatewayClient({ clientVersion: "1.0.0" });
    client.connect({ url: "ws://localhost:18789", token: "tok123" });

    const ws = MockWebSocket._last;
    ws._emit("open", {});

    expect(ws._sent.length).toBe(1);
    const frame = ws._sent[0];
    expect(frame.type).toBe("req");
    expect(frame.method).toBe("connect");
    expect(frame.params.auth.token).toBe("tok123");
    expect(frame.params.client.version).toBe("1.0.0");
    expect(frame.params.role).toBe("operator");

    client.destroy();
  });

  it("fires onHandshakeSuccess on hello-ok", () => {
    const client = new GatewayClient();
    let handshakeOk = false;
    client.onHandshakeSuccess = () => { handshakeOk = true; };
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;

    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    expect(handshakeOk).toBe(true);
    expect(client.connectedSince).toBeGreaterThan(0);
    expect(client.connectedUrl).toBe("ws://localhost:18789");

    client.destroy();
  });

  it("fires onHandshakeFailure on rejected connect", () => {
    const client = new GatewayClient();
    let failureMsg = "";
    client.onHandshakeFailure = (msg) => { failureMsg = msg; };
    client.connect({ url: "ws://localhost:18789", token: "bad" });

    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;

    ws._emitMessage({
      type: "res",
      id: connectId,
      payload: { error: { message: "auth denied" } },
    });

    expect(failureMsg).toBe("auth denied");
    client.destroy();
  });

  it("fires onPluginState when plugin responds successfully", () => {
    const client = new GatewayClient();
    let pluginState = null;
    client.onPluginState = (s) => { pluginState = s; };
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    // After handshake, client sends plugin state request
    expect(ws._sent.length).toBe(2);
    const stateReqId = ws._sent[1].id;

    ws._emitMessage({
      type: "res",
      id: stateReqId,
      ok: true,
      payload: { ok: true, state: { mode: "idle", since: Date.now() } },
    });

    expect(pluginState).not.toBeNull();
    expect(pluginState.mode).toBe("idle");
    expect(client.hasPlugin).toBe(true);

    client.destroy();
  });

  it("falls back to next plugin method on method-not-found", () => {
    const client = new GatewayClient();
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    const stateReqId = ws._sent[1].id;
    // First method fails
    ws._emitMessage({
      type: "res",
      id: stateReqId,
      ok: false,
      payload: { error: { message: "unknown method" } },
    });

    // Should have sent a retry with the next method
    expect(ws._sent.length).toBe(3);
    expect(ws._sent[2].method).toBe("molt-mascot.state");

    client.destroy();
  });

  it("fires onAgentEvent for native agent events when no plugin", () => {
    const client = new GatewayClient();
    let agentPayload = null;
    client.onAgentEvent = (p) => { agentPayload = p; };
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    // Simulate plugin state failure (all methods exhausted), hasPlugin stays false
    // Just send an agent event directly
    ws._emitMessage({
      type: "event",
      event: "agent",
      payload: { phase: "start", stream: "lifecycle" },
    });

    expect(agentPayload).not.toBeNull();
    expect(agentPayload.phase).toBe("start");

    client.destroy();
  });

  it("sendPluginReset sends reset frame", () => {
    const client = new GatewayClient();
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    client.sendPluginReset();

    const resetFrame = ws._sent[ws._sent.length - 1];
    expect(resetFrame.method).toBe("@molt/mascot-plugin.reset");
    expect(resetFrame.type).toBe("req");

    client.destroy();
  });

  it("forceReconnect resets backoff and closes existing socket", () => {
    const client = new GatewayClient();
    let connectCount = 0;
    client.onConnectionStateChange = () => { connectCount++; };
    client.connect({ url: "ws://localhost:18789" });
    connectCount = 0; // reset after initial connect

    const oldWs = MockWebSocket._last;
    client.forceReconnect({ url: "ws://localhost:18789" });

    expect(oldWs.readyState).toBe(MockWebSocket.CLOSED);
    expect(client.reconnectAttempt).toBe(0);
    expect(connectCount).toBe(1); // onConnectionStateChange fired for new connect

    client.destroy();
  });

  it("destroy cleans up all state", () => {
    const client = new GatewayClient();
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    client.destroy();

    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
  });

  it("fires onDisconnect and schedules reconnect on close", () => {
    const client = new GatewayClient({ reconnectBaseMs: 50, reconnectMaxMs: 100 });
    let disconnected = false;
    let countdownFired = false;
    client.onDisconnect = () => { disconnected = true; };
    client.onReconnectCountdown = () => { countdownFired = true; };
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    // Trigger onclose
    if (ws.onclose) ws.onclose();

    expect(disconnected).toBe(true);
    expect(countdownFired).toBe(true);

    client.destroy();
  });

  it("omits auth param when no token provided", () => {
    const client = new GatewayClient();
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    ws._emit("open", {});

    const frame = ws._sent[0];
    expect(frame.params.auth).toBeUndefined();

    client.destroy();
  });
});
