import { describe, expect, it } from "bun:test";
import { buildDebugInfo } from "../src/debug-info.js";

const NOW = 1700000000000; // Fixed timestamp for deterministic tests

const BASE_PARAMS = {
  now: NOW,
  currentMode: "idle",
  modeSince: NOW - 5000,
  connectedSince: null,
  connectedUrl: "",
  lastDisconnectedAt: null,
  hasPlugin: false,
  pluginStateMethod: null,
  pluginStartedAt: null,
  pluginToolCalls: 0,
  pluginToolErrors: 0,
  currentTool: "",
  lastErrorMessage: "",
  alignmentLabel: "bottom-right",
  sizeLabel: "medium",
  opacity: 1,
  isClickThrough: false,
  isTextHidden: false,
  sleepThresholdS: 120,
  idleDelayMs: 800,
  errorHoldMs: 5000,
  reducedMotion: false,
  frameIntervalMs: 66,
  reconnectAttempt: 0,
  canvasScale: 3,
  appVersion: "0.1.44",
  pluginVersion: "",
  wsReadyState: null,
  savedUrl: undefined,
  platform: "MacIntel",
  devicePixelRatio: 2,
  memory: undefined,
  versions: undefined,
};

describe("buildDebugInfo", () => {
  it("includes app version, capture timestamp, and mode", () => {
    const info = buildDebugInfo(BASE_PARAMS);
    expect(info).toContain("Molt Mascot v0.1.44");
    expect(info).toContain("Captured: 2023-11-14T22:13:20.000Z");
    expect(info).toContain("Mode: idle");
  });

  it("shows plugin version when provided", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, pluginVersion: "1.2.3" });
    expect(info).toContain("(plugin v1.2.3)");
  });

  it("shows 'dev' when no app version", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, appVersion: undefined });
    expect(info).toContain("Molt Mascot dev");
  });

  it("shows uptime and gateway URL when connected", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      connectedSince: NOW - 60000,
      connectedUrl: "ws://127.0.0.1:18789",
      wsReadyState: 1,
    });
    expect(info).toContain("Uptime:");
    expect(info).toContain("Gateway: ws://127.0.0.1:18789");
    expect(info).toContain("WebSocket: OPEN");
  });

  it("shows disconnected state with last disconnect time", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      lastDisconnectedAt: NOW - 30000,
    });
    expect(info).toContain("Gateway: disconnected");
    expect(info).toContain("ago");
  });

  it("shows reconnect attempt when > 0", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, reconnectAttempt: 3 });
    expect(info).toContain("Reconnect attempt: 3");
  });

  it("does not show reconnect attempt when 0", () => {
    const info = buildDebugInfo(BASE_PARAMS);
    expect(info).not.toContain("Reconnect attempt");
  });

  it("shows saved URL when disconnected", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, savedUrl: "ws://localhost:9999" });
    expect(info).toContain("Saved URL: ws://localhost:9999");
  });

  it("shows plugin info when active", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      hasPlugin: true,
      pluginStateMethod: "@molt/mascot-plugin.state",
      pluginStartedAt: NOW - 120000,
    });
    expect(info).toContain("Plugin: active");
    expect(info).toContain("Plugin method: @molt/mascot-plugin.state");
    expect(info).toContain("Plugin uptime:");
  });

  it("shows tool call stats when > 0", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, pluginToolCalls: 42, pluginToolErrors: 3 });
    expect(info).toContain("Tool calls: 42, errors: 3 (93% ok)");
  });

  it("shows tool call stats without percentage when zero errors", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, pluginToolCalls: 10, pluginToolErrors: 0 });
    expect(info).toContain("Tool calls: 10, errors: 0");
    expect(info).not.toContain("% ok");
  });

  it("does not show tool stats when 0", () => {
    const info = buildDebugInfo(BASE_PARAMS);
    expect(info).not.toContain("Tool calls:");
  });

  it("shows current tool when set", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, currentTool: "web_fetch" });
    expect(info).toContain("Current tool: web_fetch");
  });

  it("shows last error when set", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, lastErrorMessage: "connection refused" });
    expect(info).toContain("Last error: connection refused");
  });

  it("shows alignment, size, opacity, ghost, hide-text", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      alignmentLabel: "top-left",
      sizeLabel: "large",
      opacity: 0.6,
      isClickThrough: true,
      isTextHidden: true,
    });
    expect(info).toContain("Alignment: top-left");
    expect(info).toContain("Size: large, Opacity: 60%");
    expect(info).toContain("Ghost: true, Hide text: true");
  });

  it("shows timing config", () => {
    const info = buildDebugInfo(BASE_PARAMS);
    expect(info).toContain("Sleep threshold: 120s, Idle delay: 800ms, Error hold: 5000ms");
  });

  it("shows frame rate from interval", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, frameIntervalMs: 0 });
    expect(info).toContain("Frame rate: ~60fps");
  });

  it("shows throttled frame rate", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, frameIntervalMs: 250 });
    expect(info).toContain("Frame rate: ~4fps");
  });

  it("shows reduced motion suffix", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, reducedMotion: true, frameIntervalMs: 500 });
    expect(info).toContain("(reduced)");
  });

  it("shows display and canvas scale", () => {
    const info = buildDebugInfo(BASE_PARAMS);
    expect(info).toContain("Display scale: 2x (canvas scale: 3)");
  });

  it("shows memory usage when available", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      memory: { usedJSHeapSize: 10485760, totalJSHeapSize: 20971520, jsHeapSizeLimit: 2147483648 },
    });
    expect(info).toContain("Memory: 10.0MB used / 20.0MB total (limit 2048MB)");
  });

  it("omits memory when unavailable", () => {
    const info = buildDebugInfo(BASE_PARAMS);
    expect(info).not.toContain("Memory:");
  });

  it("shows runtime versions when available", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      versions: { electron: "30.0.0", chrome: "124.0.0", node: "20.0.0" },
    });
    expect(info).toContain("Runtime: Electron 30.0.0, Chrome 124.0.0, Node 20.0.0");
  });

  it("omits runtime line when no versions", () => {
    const info = buildDebugInfo(BASE_PARAMS);
    expect(info).not.toContain("Runtime:");
  });

  it("defaults alignment to bottom-right when empty", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, alignmentLabel: "" });
    expect(info).toContain("Alignment: bottom-right");
  });

  it("shows process uptime when provided", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, processUptimeS: 3661 });
    expect(info).toContain("Process uptime: 1h 1m");
  });

  it("omits process uptime when not provided", () => {
    const info = buildDebugInfo(BASE_PARAMS);
    expect(info).not.toContain("Process uptime:");
  });

  it("shows last disconnect time even when currently connected", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      connectedSince: NOW - 60000,
      connectedUrl: "ws://127.0.0.1:18789",
      wsReadyState: 1,
      lastDisconnectedAt: NOW - 300000, // 5 min ago
    });
    expect(info).toContain("Last disconnect: 5m ago");
    expect(info).toContain(new Date(NOW - 300000).toISOString());
  });

  it("omits last disconnect when connected and never disconnected", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      connectedSince: NOW - 60000,
      connectedUrl: "ws://127.0.0.1:18789",
      wsReadyState: 1,
      lastDisconnectedAt: null,
    });
    expect(info).not.toContain("Last disconnect:");
  });

  it("shows canvas pixel dimensions when provided", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, canvasWidth: 96, canvasHeight: 96 });
    expect(info).toContain("canvas scale: 3, 96×96px");
  });

  it("omits canvas pixel dimensions when not provided", () => {
    const info = buildDebugInfo(BASE_PARAMS);
    expect(info).toContain("canvas scale: 3)");
    expect(info).not.toContain("×");
  });

  it("shows close reason when disconnected", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, lastCloseDetail: "abnormal closure" });
    expect(info).toContain("Close reason: abnormal closure");
  });

  it("omits close reason when not provided", () => {
    const info = buildDebugInfo(BASE_PARAMS);
    expect(info).not.toContain("Close reason");
  });

  it("omits close reason when connected (even if previously set)", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      connectedSince: NOW - 60000,
      connectedUrl: "ws://localhost:18789",
      wsReadyState: 1,
      lastCloseDetail: "abnormal closure",
    });
    // Close reason is in the disconnected block which is skipped when connected
    expect(info).not.toContain("Close reason");
  });

  it("computes exact durations from now parameter", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      modeSince: NOW - 65000, // 65 seconds
      connectedSince: NOW - 3661000, // 1h 1m 1s
      connectedUrl: "ws://localhost:18789",
      wsReadyState: 1,
    });
    expect(info).toContain("Mode duration: 1m 5s");
    expect(info).toContain("Uptime: 1h 1m");
  });

  it("shows session connect count when > 1 (flappy connection diagnostic)", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, sessionConnectCount: 5 });
    expect(info).toContain("Session connects: 5 (reconnected 4×)");
  });

  it("omits session connect count when 0 or 1 (no reconnects)", () => {
    expect(buildDebugInfo({ ...BASE_PARAMS, sessionConnectCount: 0 })).not.toContain("Session connects");
    expect(buildDebugInfo({ ...BASE_PARAMS, sessionConnectCount: 1 })).not.toContain("Session connects");
  });

  it("omits session connect count when undefined", () => {
    expect(buildDebugInfo({ ...BASE_PARAMS })).not.toContain("Session connects");
  });
});
