import { describe, expect, it } from "bun:test";
import { buildDebugInfo, formatElapsed } from "../src/debug-info.js";

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
  arch: "arm64",
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

  it("shows target URL when disconnected", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, targetUrl: "ws://10.0.0.5:18789" });
    expect(info).toContain("Target URL: ws://10.0.0.5:18789");
  });

  it("omits target URL when connected", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, connectedSince: Date.now() - 60000, connectedUrl: "ws://localhost:18789", targetUrl: "ws://localhost:18789" });
    expect(info).not.toContain("Target URL");
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

  it("shows plugin reset method alongside state method when both present", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      hasPlugin: true,
      pluginStateMethod: "@molt/mascot-plugin.state",
      pluginResetMethod: "@molt/mascot-plugin.reset",
      pluginStartedAt: NOW - 120000,
    });
    expect(info).toContain("Plugin method: @molt/mascot-plugin.state (reset: @molt/mascot-plugin.reset)");
  });

  it("omits reset method suffix when pluginResetMethod is not provided", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      hasPlugin: true,
      pluginStateMethod: "@molt/mascot-plugin.state",
      pluginStartedAt: NOW - 120000,
    });
    expect(info).toContain("Plugin method: @molt/mascot-plugin.state");
    expect(info).not.toContain("reset:");
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

  it("shows actual FPS when provided", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, frameIntervalMs: 66, actualFps: 12 });
    expect(info).toContain("Frame rate: ~15fps, actual 12fps");
  });

  it("omits actual FPS when not provided", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, frameIntervalMs: 66 });
    expect(info).toContain("Frame rate: ~15fps");
    expect(info).not.toContain("actual");
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
    expect(info).toContain("Memory: 10.0 MB used / 20.0 MB total (limit 2.0 GB)");
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

  it("shows process RSS when provided", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, processMemoryRssBytes: 104857600 }); // 100 MB
    expect(info).toContain("Process RSS: 100.0 MB");
  });

  it("omits process RSS when not provided", () => {
    const info = buildDebugInfo(BASE_PARAMS);
    expect(info).not.toContain("Process RSS:");
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

  it("omits close reason when connected and stable (sessionConnectCount <= 1)", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      connectedSince: NOW - 60000,
      connectedUrl: "ws://localhost:18789",
      wsReadyState: 1,
      lastCloseDetail: "abnormal closure",
      sessionConnectCount: 1,
    });
    expect(info).not.toContain("close reason");
  });

  it("shows last close reason when connected but flappy (sessionConnectCount > 1)", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      connectedSince: NOW - 60000,
      connectedUrl: "ws://localhost:18789",
      wsReadyState: 1,
      lastCloseDetail: "abnormal closure",
      sessionConnectCount: 3,
    });
    expect(info).toContain("Last close reason: abnormal closure");
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

  it("shows attempt count alongside connect count when attempts exceed connects", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, sessionConnectCount: 3, sessionAttemptCount: 7 });
    expect(info).toContain("Session connects: 3 (reconnected 2×, 7 attempts)");
  });

  it("omits attempt count when it equals connect count (no failures)", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, sessionConnectCount: 3, sessionAttemptCount: 3 });
    expect(info).not.toContain("attempts");
  });

  it("shows 'idle (sleeping)' when idle duration exceeds sleep threshold", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      currentMode: "idle",
      modeSince: NOW - 300000, // 5 minutes idle, threshold is 120s
    });
    expect(info).toContain("Mode: idle (sleeping)");
  });

  it("shows 'Polling: paused' when isPollingPaused is true", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, isPollingPaused: true });
    expect(info).toContain("Polling: paused");
  });

  it("omits polling line when isPollingPaused is false and no plugin", () => {
    expect(buildDebugInfo({ ...BASE_PARAMS, isPollingPaused: false })).not.toContain("Polling:");
    expect(buildDebugInfo({ ...BASE_PARAMS })).not.toContain("Polling:");
  });

  it("shows 'Polling: active' when plugin is active and not paused", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, hasPlugin: true, isPollingPaused: false });
    expect(info).toContain("Polling: active");
  });

  it("shows plain 'idle' when idle duration is below sleep threshold", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      currentMode: "idle",
      modeSince: NOW - 5000, // 5 seconds idle, threshold is 120s
    });
    expect(info).toContain("Mode: idle");
    expect(info).not.toContain("sleeping");
  });

  it("includes latency line when latencyMs is provided", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, latencyMs: 25 });
    expect(info).toContain("Latency: 25ms");
  });

  it("includes latency line for 0ms", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, latencyMs: 0 });
    expect(info).toContain("Latency: < 1ms");
  });

  it("omits latency line when latencyMs is null or undefined", () => {
    expect(buildDebugInfo({ ...BASE_PARAMS, latencyMs: null })).not.toContain("Latency:");
    expect(buildDebugInfo({ ...BASE_PARAMS })).not.toContain("Latency:");
  });

  it("includes latency stats when latencyStats has multiple samples", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, latencyMs: 20, latencyStats: { min: 5, max: 40, avg: 20, median: 18, p95: 38, samples: 30 } });
    expect(info).toContain("Latency stats: min 5ms, max 40ms, avg 20ms, median 18ms, p95 38ms (30 samples)");
  });

  it("omits p95 from latency stats when not provided", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, latencyMs: 20, latencyStats: { min: 5, max: 40, avg: 20, median: 18, samples: 30 } });
    expect(info).toContain("Latency stats: min 5ms, max 40ms, avg 20ms, median 18ms (30 samples)");
  });

  it("omits latency stats when only 1 sample (not useful)", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, latencyMs: 10, latencyStats: { min: 10, max: 10, avg: 10, samples: 1 } });
    expect(info).not.toContain("Latency stats");
  });

  it("omits latency stats when null", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, latencyMs: 10, latencyStats: null });
    expect(info).not.toContain("Latency stats");
  });

  it("appends connection quality emoji to latency line", () => {
    // < 50ms → excellent 🟢
    expect(buildDebugInfo({ ...BASE_PARAMS, latencyMs: 25 })).toContain("Latency: 25ms 🟢");
    // 50–149ms → good 🟡
    expect(buildDebugInfo({ ...BASE_PARAMS, latencyMs: 100 })).toContain("Latency: 100ms 🟡");
    // 150–499ms → fair 🟠
    expect(buildDebugInfo({ ...BASE_PARAMS, latencyMs: 300 })).toContain("Latency: 300ms 🟠");
    // >= 500ms → poor 🔴
    expect(buildDebugInfo({ ...BASE_PARAMS, latencyMs: 600 })).toContain("Latency: 600ms 🔴");
  });

  it("uses median from latency stats for quality label when available", () => {
    // Instant latency is 10ms (excellent) but median is 200ms (fair) — quality should reflect median
    const info = buildDebugInfo({ ...BASE_PARAMS, latencyMs: 10, latencyStats: { min: 5, max: 400, avg: 200, median: 200, samples: 30 } });
    expect(info).toContain("Latency: 10ms 🟠");
  });

  it("includes active agents/tools line when counts are non-zero", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, activeAgents: 2, activeTools: 3 });
    expect(info).toContain("Active: 2 agents, 3 tools");
  });

  it("includes singular forms for 1 agent/1 tool", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, activeAgents: 1, activeTools: 1 });
    expect(info).toContain("Active: 1 agent, 1 tool");
  });

  it("omits active line when both counts are zero", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, activeAgents: 0, activeTools: 0 });
    expect(info).not.toContain("Active:");
  });

  it("omits active line when counts are not provided", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS });
    expect(info).not.toContain("Active:");
  });

  it("shows first connected time when connected and flappy (sessionConnectCount > 1)", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      connectedSince: NOW - 120000, // connected 2m ago
      connectedUrl: "ws://localhost:18789",
      wsReadyState: 1,
      firstConnectedAt: NOW - 3600000, // first connected 1h ago
      sessionConnectCount: 3,
    });
    expect(info).toContain("First connected: 1h ago");
  });

  it("omits first connected time when sessionConnectCount <= 1 (no reconnects)", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      connectedSince: NOW - 120000,
      connectedUrl: "ws://localhost:18789",
      wsReadyState: 1,
      firstConnectedAt: NOW - 3600000,
      sessionConnectCount: 1,
    });
    expect(info).not.toContain("First connected");
  });

  it("omits first connected time when not connected", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      firstConnectedAt: NOW - 3600000,
      sessionConnectCount: 3,
    });
    expect(info).not.toContain("First connected");
  });

  it("omits first connected time when null", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      connectedSince: NOW - 120000,
      connectedUrl: "ws://localhost:18789",
      wsReadyState: 1,
      firstConnectedAt: null,
      sessionConnectCount: 3,
    });
    expect(info).not.toContain("First connected");
  });

  it("shows last message time when connected and lastMessageAt is set", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      connectedSince: NOW - 120000,
      connectedUrl: "ws://localhost:18789",
      wsReadyState: 1,
      lastMessageAt: NOW - 5000, // 5s ago
    });
    expect(info).toContain("Last message: 5s ago");
  });

  it("omits last message line when not connected", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      lastMessageAt: NOW - 5000,
    });
    expect(info).not.toContain("Last message");
  });

  it("omits last message line when lastMessageAt is null/zero", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      connectedSince: NOW - 120000,
      connectedUrl: "ws://localhost:18789",
      wsReadyState: 1,
      lastMessageAt: 0,
    });
    expect(info).not.toContain("Last message");
  });

  it("includes arch in Platform line when provided", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, arch: "arm64" });
    expect(info).toContain("Platform: MacIntel arm64");
  });

  it("omits arch from Platform line when not provided", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, arch: undefined });
    expect(info).toContain("Platform: MacIntel");
    expect(info).not.toContain("Platform: MacIntel arm64");
  });
});

describe("connection uptime", () => {
  it("shows connection uptime percentage when process uptime and firstConnectedAt are available", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      connectedSince: NOW - 90_000,
      connectedUrl: "ws://127.0.0.1:18789",
      firstConnectedAt: NOW - 100_000,
      processUptimeS: 200,
      sessionConnectCount: 2,
    });
    expect(info).toContain("Connection uptime: ~50%");
  });

  it("omits connection uptime when process uptime is missing", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      connectedSince: NOW - 90_000,
      connectedUrl: "ws://127.0.0.1:18789",
      firstConnectedAt: NOW - 100_000,
    });
    expect(info).not.toContain("Connection uptime");
  });

  it("shows lower uptime percentage when currently disconnected", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      connectedSince: null,
      connectedUrl: "",
      firstConnectedAt: NOW - 100_000,
      lastDisconnectedAt: NOW - 50_000,
      processUptimeS: 200,
      sessionConnectCount: 2,
    });
    expect(info).toContain("Connection uptime: ~25%");
  });

  it("shows connection success rate when below 100%", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      connectedSince: NOW - 90_000,
      connectedUrl: "ws://127.0.0.1:18789",
      sessionConnectCount: 3,
      sessionAttemptCount: 5,
      connectionSuccessRate: 60,
    });
    expect(info).toContain("reconnected 2×");
    expect(info).toContain("60% success");
  });

  it("omits connection success rate when 100%", () => {
    const info = buildDebugInfo({
      ...BASE_PARAMS,
      connectedSince: NOW - 90_000,
      connectedUrl: "ws://127.0.0.1:18789",
      sessionConnectCount: 3,
      sessionAttemptCount: 3,
      connectionSuccessRate: 100,
    });
    expect(info).toContain("reconnected 2×");
    expect(info).not.toContain("% success");
  });

  it("includes instanceId when provided", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, instanceId: "moltMascot-abc123" });
    expect(info).toContain("Instance: moltMascot-abc123");
  });

  it("omits instanceId when not provided", () => {
    const info = buildDebugInfo(BASE_PARAMS);
    expect(info).not.toContain("Instance:");
  });

  it("includes lastResetAt when provided", () => {
    const now = 1700000060000;
    const info = buildDebugInfo({ ...BASE_PARAMS, lastResetAt: 1700000000000, now });
    expect(info).toContain("Last reset: 1m");
  });

  it("omits lastResetAt when not provided", () => {
    const info = buildDebugInfo(BASE_PARAMS);
    expect(info).not.toContain("Last reset:");
  });

  it("shows PID when provided", () => {
    const info = buildDebugInfo({ ...BASE_PARAMS, pid: 12345 });
    expect(info).toContain("PID: 12345");
  });

  it("omits PID when not provided", () => {
    const info = buildDebugInfo(BASE_PARAMS);
    expect(info).not.toContain("PID:");
  });
});

describe("formatElapsed", () => {
  it("returns human-readable duration between two timestamps", () => {
    const now = 1700000000000;
    expect(formatElapsed(now - 5000, now)).toBe("5s");
    expect(formatElapsed(now - 65000, now)).toBe("1m 5s");
    expect(formatElapsed(now - 3600000, now)).toBe("1h");
  });

  it("clamps negative durations to 0s", () => {
    const now = 1700000000000;
    expect(formatElapsed(now + 5000, now)).toBe("0s");
  });
});
