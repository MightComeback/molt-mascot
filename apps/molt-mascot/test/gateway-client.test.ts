import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";

// gateway-client.js uses WebSocket which isn't available in Bun test by default.
// We mock WebSocket to test the client logic in isolation.

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  sent: string[] = [];
  onclose: (() => void) | null = null;
  private listeners = new Map<string, Function[]>();

  send(data: string) {
    this.sent.push(data);
  }

  addEventListener(event: string, fn: Function) {
    const fns = this.listeners.get(event) || [];
    fns.push(fn);
    this.listeners.set(event, fns);
  }

  removeEventListener(event: string, fn: Function) {
    const fns = this.listeners.get(event) || [];
    this.listeners.set(event, fns.filter(f => f !== fn));
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  // Test helpers to simulate events
  _emit(event: string, data?: any) {
    for (const fn of this.listeners.get(event) || []) {
      fn(data);
    }
  }

  _emitMessage(obj: object) {
    this._emit('message', { data: JSON.stringify(obj) });
  }
}

// Inject mock WebSocket globally before importing the module
(globalThis as any).WebSocket = MockWebSocket;

// Now import the client
const { GatewayClient } = await import("../src/gateway-client.js");

describe("GatewayClient", () => {
  let client: InstanceType<typeof GatewayClient>;
  let createdSockets: MockWebSocket[];

  beforeEach(() => {
    createdSockets = [];
    // Capture WebSocket instances created by the client
    (globalThis as any).WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super();
        createdSockets.push(this);
      }
    };
    // Also set OPEN on the subclass
    (globalThis as any).WebSocket.OPEN = 1;
    (globalThis as any).WebSocket.CLOSED = 3;

    client = new GatewayClient({
      reconnectBaseMs: 50,
      reconnectMaxMs: 200,
      staleConnectionMs: 500,
      staleCheckIntervalMs: 100,
      pollIntervalMs: 500,
    });
  });

  afterEach(() => {
    client.destroy();
  });

  it("creates a WebSocket on connect and sends handshake on open", () => {
    client.connect({ url: "ws://localhost:1234", token: "test-token" });
    expect(createdSockets.length).toBe(1);

    const ws = createdSockets[0];
    ws._emit("open");

    expect(ws.sent.length).toBe(1);
    const frame = JSON.parse(ws.sent[0]);
    expect(frame.type).toBe("req");
    expect(frame.method).toBe("connect");
    expect(frame.params.auth.token).toBe("test-token");
    expect(frame.params.client.id).toBe("molt-mascot-desktop");
  });

  it("calls onHandshakeSuccess on hello-ok response", () => {
    let called = false;
    client.onHandshakeSuccess = () => { called = true; };
    client.connect({ url: "ws://localhost:1234" });

    const ws = createdSockets[0];
    ws._emit("open");
    const connectId = JSON.parse(ws.sent[0]).id;

    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });
    expect(called).toBe(true);
    expect(client.connectedSince).toBeGreaterThan(0);
    expect(client.isConnected).toBe(true);
  });

  it("calls onHandshakeFailure on auth rejection", () => {
    let errorMsg = "";
    client.onHandshakeFailure = (msg: string) => { errorMsg = msg; };
    client.connect({ url: "ws://localhost:1234" });

    const ws = createdSockets[0];
    ws._emit("open");
    const connectId = JSON.parse(ws.sent[0]).id;

    ws._emitMessage({
      type: "res",
      id: connectId,
      payload: { type: "error", error: { message: "invalid token" } },
    });
    expect(errorMsg).toBe("invalid token");
  });

  it("calls onPluginState when plugin responds successfully", () => {
    let pluginState: any = null;
    client.onPluginState = (s: any) => { pluginState = s; };
    client.connect({ url: "ws://localhost:1234" });

    const ws = createdSockets[0];
    ws._emit("open");
    const connectId = JSON.parse(ws.sent[0]).id;

    // Complete handshake
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    // The client sends a plugin state request after handshake
    expect(ws.sent.length).toBe(2);
    const stateReqId = JSON.parse(ws.sent[1]).id;

    ws._emitMessage({
      type: "res",
      id: stateReqId,
      ok: true,
      payload: { ok: true, state: { mode: "idle", since: Date.now() } },
    });

    expect(pluginState).not.toBeNull();
    expect(pluginState.mode).toBe("idle");
    expect(client.hasPlugin).toBe(true);
  });

  it("falls back through plugin method aliases on missing method", () => {
    client.connect({ url: "ws://localhost:1234" });

    const ws = createdSockets[0];
    ws._emit("open");
    const connectId = JSON.parse(ws.sent[0]).id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    // First plugin state request
    const req1 = JSON.parse(ws.sent[1]);
    expect(req1.method).toBe("@molt/mascot-plugin.state");

    // Respond with method not found
    ws._emitMessage({
      type: "res",
      id: req1.id,
      ok: false,
      payload: { ok: false, error: { code: -32601, message: "Method not found" } },
    });

    // Should send retry with next alias
    expect(ws.sent.length).toBe(3);
    const req2 = JSON.parse(ws.sent[2]);
    expect(req2.method).toBe("molt-mascot.state");
  });

  it("forceReconnect resets backoff and reconnects", () => {
    let stateChanges: string[] = [];
    client.onConnectionStateChange = (s: string) => { stateChanges.push(s); };

    client.connect({ url: "ws://localhost:1234" });
    expect(createdSockets.length).toBe(1);

    client.forceReconnect({ url: "ws://localhost:5678" });
    expect(createdSockets.length).toBe(2);
    expect(stateChanges).toContain("connecting");
  });

  it("sendPluginReset sends reset request with first method", () => {
    client.connect({ url: "ws://localhost:1234" });
    const ws = createdSockets[0];
    ws._emit("open");
    const connectId = JSON.parse(ws.sent[0]).id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    client.sendPluginReset();
    const resetFrame = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(resetFrame.method).toBe("@molt/mascot-plugin.reset");
  });

  it("destroy cleans up all timers and closes socket", () => {
    client.connect({ url: "ws://localhost:1234" });
    const ws = createdSockets[0];
    ws._emit("open");
    const connectId = JSON.parse(ws.sent[0]).id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    client.destroy();
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    expect(client.isConnected).toBe(false);
  });

  it("forwards native agent events when no plugin", () => {
    let agentPayload: any = null;
    client.onAgentEvent = (p: any) => { agentPayload = p; };
    client.connect({ url: "ws://localhost:1234" });

    const ws = createdSockets[0];
    ws._emit("open");
    const connectId = JSON.parse(ws.sent[0]).id;
    ws._emitMessage({ type: "res", id: connectId, payload: { type: "hello-ok" } });

    // Simulate agent event (no plugin installed)
    ws._emitMessage({ type: "event", event: "agent", payload: { stream: "lifecycle", phase: "start" } });
    expect(agentPayload).not.toBeNull();
    expect(agentPayload.phase).toBe("start");
  });
});
