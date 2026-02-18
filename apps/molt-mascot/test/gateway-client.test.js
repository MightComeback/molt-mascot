import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { GatewayClient, normalizeWsUrl } from "../src/gateway-client.js";

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

  it("fires onDisconnect with close info and schedules reconnect on close", () => {
    const client = new GatewayClient({ reconnectBaseMs: 50, reconnectMaxMs: 100 });
    let disconnectInfo = null;
    let countdownFired = false;
    client.onDisconnect = (info) => { disconnectInfo = info; };
    client.onReconnectCountdown = () => { countdownFired = true; };
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    // Trigger onclose with code and reason
    if (ws.onclose) ws.onclose({ code: 1006, reason: "abnormal closure" });

    expect(disconnectInfo).not.toBeNull();
    expect(disconnectInfo.code).toBe(1006);
    expect(disconnectInfo.reason).toBe("abnormal closure");
    expect(countdownFired).toBe(true);

    client.destroy();
  });

  it("onDisconnect omits empty reason", () => {
    const client = new GatewayClient({ reconnectBaseMs: 50000 });
    let disconnectInfo = null;
    client.onDisconnect = (info) => { disconnectInfo = info; };
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    if (ws.onclose) ws.onclose({ code: 1000, reason: "" });

    expect(disconnectInfo.code).toBe(1000);
    expect(disconnectInfo.reason).toBeUndefined();

    client.destroy();
  });

  it("pluginStateMethod returns resolved method after successful plugin handshake", () => {
    const client = new GatewayClient();
    expect(client.pluginStateMethod).toBeNull();

    client.connect({ url: "ws://localhost:18789" });
    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    // Still null before plugin responds
    expect(client.pluginStateMethod).toBeNull();

    const stateReqId = ws._sent[1].id;
    ws._emitMessage({
      type: "res", id: stateReqId, ok: true,
      payload: { ok: true, state: { mode: "idle", since: Date.now() } },
    });

    expect(client.pluginStateMethod).toBe("@molt/mascot-plugin.state");
    expect(client.pluginResetMethod).toBe("@molt/mascot-plugin.reset");

    client.destroy();
  });

  it("pluginStateMethod reflects fallback method after primary fails", () => {
    const client = new GatewayClient();
    client.connect({ url: "ws://localhost:18789" });
    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    // First method fails
    const stateReqId1 = ws._sent[1].id;
    ws._emitMessage({
      type: "res", id: stateReqId1, ok: false,
      payload: { error: { message: "unknown method" } },
    });

    // Second method succeeds
    const stateReqId2 = ws._sent[2].id;
    ws._emitMessage({
      type: "res", id: stateReqId2, ok: true,
      payload: { ok: true, state: { mode: "thinking", since: Date.now() } },
    });

    expect(client.pluginStateMethod).toBe("molt-mascot.state");
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

  it("fires onError and onHandshakeFailure for invalid WebSocket URL", () => {
    // Temporarily make WebSocket constructor throw for invalid URLs
    const OrigWS = globalThis.WebSocket;
    globalThis.WebSocket = class extends OrigWS {
      constructor(url) {
        if (!url || !url.startsWith("ws")) throw new Error("Invalid URL");
        super(url);
      }
    };

    const client = new GatewayClient();
    let errorMsg = "";
    let failureMsg = "";
    client.onError = (msg) => { errorMsg = msg; };
    client.onHandshakeFailure = (msg) => { failureMsg = msg; };
    client.connect({ url: "" });

    expect(errorMsg).toBe("Invalid URL");
    expect(failureMsg).toBe("Invalid URL");

    globalThis.WebSocket = OrigWS;
    client.destroy();
  });

  it("refreshPluginState triggers an immediate state poll", async () => {
    const client = new GatewayClient();
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    // Respond to the initial state request to clear pending flag
    const stateReqId = ws._sent[1].id;
    ws._emitMessage({
      type: "res", id: stateReqId, ok: true,
      payload: { ok: true, state: { mode: "idle", since: Date.now() } },
    });

    // Wait past the 150ms rate-limit window
    await new Promise((r) => setTimeout(r, 200));

    const countBefore = ws._sent.length;
    client.refreshPluginState();
    expect(ws._sent.length).toBe(countBefore + 1);

    client.destroy();
  });

  it("rate-limits plugin state requests within 150ms window", async () => {
    const client = new GatewayClient();
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    // Respond to the initial state request to clear pending flag
    const stateReqId = ws._sent[1].id;
    ws._emitMessage({
      type: "res", id: stateReqId, ok: true,
      payload: { ok: true, state: { mode: "idle", since: Date.now() } },
    });

    // Wait past the rate-limit window so the first refresh goes through
    await new Promise((r) => setTimeout(r, 200));

    const countBefore = ws._sent.length;
    client.refreshPluginState(); // goes through (past rate-limit + not pending)

    // Respond to clear pending flag
    const reqId2 = ws._sent[ws._sent.length - 1].id;
    ws._emitMessage({
      type: "res", id: reqId2, ok: true,
      payload: { ok: true, state: { mode: "idle", since: Date.now() } },
    });

    // Immediately try again — should be throttled by the 150ms time window
    client.refreshPluginState();

    // Only one additional request since countBefore (the rate-limited one is skipped)
    expect(ws._sent.length).toBe(countBefore + 1);

    client.destroy();
  });

  it("plugin reset fallback succeeds on second method", () => {
    const client = new GatewayClient();
    let _pluginState = null;
    client.onPluginState = (s) => { _pluginState = s; };
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    // Respond to plugin state to mark hasPlugin=true
    const stateReqId = ws._sent[1].id;
    ws._emitMessage({
      type: "res", id: stateReqId, ok: true,
      payload: { ok: true, state: { mode: "idle", since: Date.now() } },
    });

    // Send reset — first method fails
    client.sendPluginReset();
    const resetReqId1 = ws._sent[ws._sent.length - 1].id;
    expect(ws._sent[ws._sent.length - 1].method).toBe("@molt/mascot-plugin.reset");

    ws._emitMessage({
      type: "res", id: resetReqId1, ok: false,
      payload: { error: { message: "method not found" } },
    });

    // Should have retried with the next method
    const resetReqId2 = ws._sent[ws._sent.length - 1].id;
    expect(ws._sent[ws._sent.length - 1].method).toBe("molt-mascot.reset");
    expect(resetReqId2).not.toBe(resetReqId1);

    client.destroy();
  });

  it("fires onError when WebSocket emits error", () => {
    const client = new GatewayClient();
    let errorMsg = "";
    client.onError = (msg) => { errorMsg = msg; };
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    ws._emit("error", {});

    expect(errorMsg).toBe("WebSocket error");
    client.destroy();
  });

  it("destroy prevents reconnect after disconnect", async () => {
    const client = new GatewayClient({ reconnectBaseMs: 30 });
    let connectCount = 0;
    client.onConnectionStateChange = () => { connectCount++; };
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    // Destroy before any disconnect
    client.destroy();
    connectCount = 0;

    // Wait longer than reconnectBaseMs to ensure no reconnect fires
    await new Promise((r) => setTimeout(r, 80));

    expect(connectCount).toBe(0);
  });

  it("detects stale connection and closes socket", async () => {
    const client = new GatewayClient({
      staleConnectionMs: 50,
      staleCheckIntervalMs: 20,
    });
    let errorMsg = "";
    client.onError = (msg) => { errorMsg = msg; };
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    // Wait for stale check to fire (50ms stale + 20ms check interval)
    await new Promise((r) => setTimeout(r, 120));

    expect(errorMsg).toBe("connection stale");
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);

    client.destroy();
  });

  it("forwards raw messages via onMessage callback", () => {
    const client = new GatewayClient();
    const messages = [];
    client.onMessage = (msg) => { messages.push(msg); };
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    ws._emit("open", {});
    ws._emitMessage({ type: "custom", data: "test" });

    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages.some((m) => m.type === "custom")).toBe(true);

    client.destroy();
  });

  it("triggers snappy plugin state poll on events when plugin is active", async () => {
    const client = new GatewayClient();
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    // Mark plugin as active
    const stateReqId = ws._sent[1].id;
    ws._emitMessage({
      type: "res", id: stateReqId, ok: true,
      payload: { ok: true, state: { mode: "idle", since: Date.now() } },
    });

    // Wait past the 150ms rate-limit window so the next poll isn't throttled
    await new Promise((r) => setTimeout(r, 200));

    const sentBefore = ws._sent.length;

    // Emit an event — should trigger an immediate plugin state poll
    ws._emitMessage({ type: "event", event: "agent", payload: { phase: "start" } });

    // Should have sent at least one more plugin state request
    expect(ws._sent.length).toBeGreaterThan(sentBefore);

    client.destroy();
  });

  it("isConnected returns true after handshake and false before/after", () => {
    const client = new GatewayClient();
    expect(client.isConnected).toBe(false);

    client.connect({ url: "ws://localhost:18789" });
    const ws = MockWebSocket._last;
    ws._emit("open", {});

    // Open but not yet authenticated
    expect(client.isConnected).toBe(false);

    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    // Now authenticated
    expect(client.isConnected).toBe(true);

    client.destroy();

    // After destroy
    expect(client.isConnected).toBe(false);
  });

  it("sets lastDisconnectedAt on disconnect", () => {
    const client = new GatewayClient({ reconnectBaseMs: 50000 });
    expect(client.lastDisconnectedAt).toBeNull();

    client.connect({ url: "ws://localhost:18789" });
    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    const before = Date.now();
    ws.onclose();
    const after = Date.now();

    expect(client.lastDisconnectedAt).toBeGreaterThanOrEqual(before);
    expect(client.lastDisconnectedAt).toBeLessThanOrEqual(after);

    client.destroy();
  });

  it("destroy() clears connection state to prevent stale tooltips", () => {
    const client = new GatewayClient({ reconnectBaseMs: 50000 });
    client.connect({ url: "ws://localhost:18789" });
    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    // Verify connected state is set
    expect(client.connectedSince).not.toBeNull();
    expect(client.connectedUrl).toBe("ws://localhost:18789");

    client.destroy();

    // After destroy, all connection state should be cleared
    expect(client.connectedSince).toBeNull();
    expect(client.connectedUrl).toBe('');
    expect(client.hasPlugin).toBe(false);
    expect(client.isConnected).toBe(false);
  });

  it("fires onPluginStateReset on disconnect so consumers clear cached config", async () => {
    const client = new GatewayClient({ reconnectBaseMs: 50000 });
    let resetFired = false;
    let disconnectFired = false;
    let resetBeforeDisconnect = false;

    client.onPluginStateReset = () => {
      resetFired = true;
      // Verify reset fires BEFORE disconnect
      resetBeforeDisconnect = !disconnectFired;
    };
    client.onDisconnect = () => { disconnectFired = true; };

    client.connect({ url: "ws://localhost:18789" });
    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    // Simulate disconnect
    ws.onclose();

    expect(resetFired).toBe(true);
    expect(disconnectFired).toBe(true);
    expect(resetBeforeDisconnect).toBe(true);

    client.destroy();
  });

  it("wsReadyState returns null when no socket exists", () => {
    const client = new GatewayClient();
    expect(client.wsReadyState).toBeNull();
    client.destroy();
  });

  it("wsReadyState reflects the underlying socket state", () => {
    const client = new GatewayClient();
    client.connect({ url: "ws://localhost:18789" });
    const ws = MockWebSocket._last;
    expect(client.wsReadyState).toBe(MockWebSocket.OPEN);
    ws.readyState = MockWebSocket.CLOSED;
    expect(client.wsReadyState).toBe(MockWebSocket.CLOSED);
    client.destroy();
  });

  it("wsReadyState returns null after destroy", () => {
    const client = new GatewayClient();
    client.connect({ url: "ws://localhost:18789" });
    client.destroy();
    expect(client.wsReadyState).toBeNull();
  });

  it("uptimeSeconds returns null when not connected", () => {
    const client = new GatewayClient();
    expect(client.uptimeSeconds).toBeNull();
    client.destroy();
  });

  it("uptimeSeconds returns seconds since connection", () => {
    const client = new GatewayClient();
    client.connect({ url: "ws://localhost:18789" });
    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    // connectedSince is set to Date.now() on handshake success
    expect(client.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(client.uptimeSeconds).toBeLessThanOrEqual(1);
    client.destroy();
  });

  it("uptimeSeconds returns null after disconnect", () => {
    const client = new GatewayClient();
    client.connect({ url: "ws://localhost:18789" });
    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });
    expect(client.uptimeSeconds).not.toBeNull();

    client.destroy();
    expect(client.uptimeSeconds).toBeNull();
  });

  it("recovers from ws.send() race condition during plugin state poll", async () => {
    const client = new GatewayClient();
    client.onPluginState = () => {};
    client.connect({ url: "ws://localhost:18789" });

    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    // Respond to initial state request
    const stateReqId = ws._sent[1].id;
    ws._emitMessage({
      type: "res", id: stateReqId, ok: true,
      payload: { ok: true, state: { mode: "idle", since: Date.now() } },
    });

    // Wait past rate-limit window
    await new Promise((r) => setTimeout(r, 200));

    // Make ws.send() throw (simulates race: readyState=OPEN but socket closing)
    const origSend = ws.send.bind(ws);
    let throwOnce = true;
    ws.send = (data) => {
      if (throwOnce) { throwOnce = false; throw new Error("WebSocket is already in CLOSING state"); }
      origSend(data);
    };

    // This should NOT throw — the try/catch in _sendPluginStateReq handles it
    client.refreshPluginState();

    // The pending flag should be cleared so subsequent polls aren't permanently blocked
    await new Promise((r) => setTimeout(r, 200));

    // Next poll should succeed (throwOnce is now false)
    const countBefore = ws._sent.length;
    client.refreshPluginState();
    expect(ws._sent.length).toBe(countBefore + 1);

    client.destroy();
  });
});

describe("normalizeWsUrl", () => {
  it("converts http:// to ws://", () => {
    expect(normalizeWsUrl("http://127.0.0.1:18789")).toBe("ws://127.0.0.1:18789");
  });

  it("converts https:// to wss://", () => {
    expect(normalizeWsUrl("https://gateway.example.com/ws")).toBe("wss://gateway.example.com/ws");
  });

  it("leaves ws:// unchanged", () => {
    expect(normalizeWsUrl("ws://127.0.0.1:18789")).toBe("ws://127.0.0.1:18789");
  });

  it("leaves wss:// unchanged", () => {
    expect(normalizeWsUrl("wss://gateway.example.com")).toBe("wss://gateway.example.com");
  });

  it("is case-insensitive for scheme", () => {
    expect(normalizeWsUrl("HTTP://localhost:8080")).toBe("ws://localhost:8080");
    expect(normalizeWsUrl("HTTPS://localhost")).toBe("wss://localhost");
  });

  it("trims whitespace", () => {
    expect(normalizeWsUrl("  http://localhost:18789  ")).toBe("ws://localhost:18789");
  });

  it("passes through non-string values", () => {
    expect(normalizeWsUrl(null)).toBe(null);
    expect(normalizeWsUrl(undefined)).toBe(undefined);
  });

  it("passes through URLs without a recognized scheme", () => {
    expect(normalizeWsUrl("127.0.0.1:18789")).toBe("127.0.0.1:18789");
  });
});

describe("pausePolling / resumePolling", () => {
  let origWS;
  beforeEach(() => { origWS = globalThis.WebSocket; globalThis.WebSocket = MockWebSocket; });
  afterEach(() => { globalThis.WebSocket = origWS; });

  function connectAndHandshake(client) {
    client.connect({ url: "ws://localhost:18789", token: "t" });
    const ws = MockWebSocket._last;
    ws._emit("open", {});
    const connectId = ws._sent[0].id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });
    return ws;
  }

  function activatePlugin(ws) {
    const stateReqId = ws._sent.find(m => m.method?.includes("state"))?.id;
    ws._emitMessage({
      type: "res", id: stateReqId, ok: true,
      payload: { ok: true, state: { mode: "idle" } },
    });
  }

  it("pauses polling so the pause flag is set", () => {
    const client = new GatewayClient({ pollIntervalMs: 50 });
    const ws = connectAndHandshake(client);
    activatePlugin(ws);

    client.pausePolling();
    expect(client._pollingPaused).toBe(true);

    client.destroy();
  });

  it("resumePolling sends an immediate refresh and clears the pause flag", () => {
    const client = new GatewayClient({ pollIntervalMs: 50 });
    const ws = connectAndHandshake(client);
    activatePlugin(ws);

    client.pausePolling();
    expect(client._pollingPaused).toBe(true);

    const countBefore = ws._sent.length;
    client.resumePolling();
    expect(client._pollingPaused).toBe(false);
    // Should have sent an immediate refresh
    expect(ws._sent.length).toBe(countBefore + 1);

    client.destroy();
  });

  it("resumePolling is a no-op when not paused", () => {
    const client = new GatewayClient({ pollIntervalMs: 50 });
    const ws = connectAndHandshake(client);
    activatePlugin(ws);

    const countBefore = ws._sent.length;
    client.resumePolling(); // not paused, should be no-op
    expect(ws._sent.length).toBe(countBefore);

    client.destroy();
  });

  it("stores lastCloseCode and lastCloseReason on disconnect", () => {
    const client = new GatewayClient();
    const ws = connectAndHandshake(client);

    expect(client.lastCloseCode).toBeNull();
    expect(client.lastCloseReason).toBeNull();
    expect(client.lastCloseDetail).toBeNull();

    // Simulate a close event with code and reason
    ws.onclose({ code: 1006, reason: 'abnormal closure' });

    expect(client.lastCloseCode).toBe(1006);
    expect(client.lastCloseReason).toBe('abnormal closure');
    expect(client.lastCloseDetail).toBe('1006 abnormal closure');
    expect(client.lastDisconnectedAt).toBeGreaterThan(0);

    client.destroy();
  });

  it("lastCloseDetail handles code-only and reason-only cases", () => {
    const client = new GatewayClient();
    const ws = connectAndHandshake(client);

    // Code only (empty reason)
    ws.onclose({ code: 1000, reason: '' });
    expect(client.lastCloseDetail).toBe('1000');

    client.destroy();
  });

  it("lastCloseDetail trims whitespace from reason", () => {
    const client = new GatewayClient();
    const ws = connectAndHandshake(client);

    ws.onclose({ code: 1001, reason: '  going away  ' });
    expect(client.lastCloseReason).toBe('going away');
    expect(client.lastCloseDetail).toBe('1001 going away');

    client.destroy();
  });

  it("forceReconnect resets plugin state and fires onPluginStateReset", () => {
    const client = new GatewayClient({ pollIntervalMs: 50 });
    const ws = connectAndHandshake(client);
    activatePlugin(ws);

    expect(client.hasPlugin).toBe(true);
    expect(client.connectedSince).not.toBeNull();

    let resetFired = false;
    client.onPluginStateReset = () => { resetFired = true; };

    // Force reconnect without providing cfg (just tear down)
    client.forceReconnect();

    expect(client.hasPlugin).toBe(false);
    expect(client.connectedSince).toBeNull();
    expect(client.connectedUrl).toBe('');
    expect(resetFired).toBe(true);

    client.destroy();
  });
});
