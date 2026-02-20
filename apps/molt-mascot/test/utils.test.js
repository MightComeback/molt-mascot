import { describe, expect, it } from "bun:test";
import {
  coerceDelayMs,
  truncate,
  cleanErrorString,
  isMissingMethodResponse,
  formatDuration,
  formatElapsed,
  isTruthyEnv,
  wsReadyStateLabel,
  getFrameIntervalMs,
  getReconnectDelayMs,
  buildTooltip,
  normalizeWsUrl,
  formatCloseDetail,
  capitalize,
  WS_CLOSE_CODE_LABELS,
  PLUGIN_STATE_METHODS,
  PLUGIN_RESET_METHODS,
  successRate,
  formatBytes,
  formatLatency,
  MODE_EMOJI,
} from "../src/utils.js";

describe("capitalize", () => {
  it("capitalizes the first character", () => {
    expect(capitalize("idle")).toBe("Idle");
    expect(capitalize("thinking")).toBe("Thinking");
  });

  it("returns empty/falsy values unchanged", () => {
    expect(capitalize("")).toBe("");
    expect(capitalize(null)).toBe(null);
    expect(capitalize(undefined)).toBe(undefined);
  });

  it("handles single-character strings", () => {
    expect(capitalize("a")).toBe("A");
  });

  it("does not alter already-capitalized strings", () => {
    expect(capitalize("Connected")).toBe("Connected");
  });
});

describe("coerceDelayMs", () => {
  it("returns the number when valid and >= 0", () => {
    expect(coerceDelayMs(500, 800)).toBe(500);
    expect(coerceDelayMs(0, 800)).toBe(0);
  });

  it("coerces string numbers", () => {
    expect(coerceDelayMs("1200", 800)).toBe(1200);
  });

  it("returns fallback for invalid values", () => {
    expect(coerceDelayMs("abc", 800)).toBe(800);
    expect(coerceDelayMs(-1, 800)).toBe(800);
    expect(coerceDelayMs(NaN, 800)).toBe(800);
    expect(coerceDelayMs(Infinity, 800)).toBe(800);
  });

  it("returns fallback for empty/null/undefined", () => {
    expect(coerceDelayMs("", 800)).toBe(800);
    expect(coerceDelayMs(null, 800)).toBe(800);
    expect(coerceDelayMs(undefined, 800)).toBe(800);
  });
});

describe("truncate", () => {
  it("returns short strings unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates long strings with ellipsis", () => {
    expect(truncate("hello world", 5)).toBe("hell…");
  });

  it("prefers word boundaries", () => {
    expect(truncate("hello world", 9)).toBe("hello…");
  });

  it("handles unicode surrogate pairs", () => {
    expect(truncate("🦞🦞🦞", 2)).toBe("🦞…");
  });

  it("collapses whitespace", () => {
    expect(truncate("hello\n  world", 140)).toBe("hello world");
  });

  it("handles limit of 1", () => {
    expect(truncate("hello", 1)).toBe("h");
  });

  it("handles limit of 0", () => {
    expect(truncate("hello", 0)).toBe("");
  });
});

describe("cleanErrorString", () => {
  it("strips Error: prefix", () => {
    expect(cleanErrorString("Error: foo")).toBe("foo");
  });

  it("strips nested prefixes", () => {
    expect(cleanErrorString("Tool failed: Error: foo")).toBe("foo");
  });

  it("strips ANSI codes", () => {
    expect(cleanErrorString("\u001b[31mError:\u001b[0m foo")).toBe("foo");
  });

  it("handles exit code lines", () => {
    expect(cleanErrorString("Command exited with code 1\nDetails here")).toBe("Details here");
  });

  it("prefers concrete error lines over info lines", () => {
    expect(cleanErrorString("info: starting\nError: Failed to connect\nmore"))
      .toBe("Failed to connect");
  });

  it("handles Python tracebacks", () => {
    expect(
      cleanErrorString(
        "Traceback (most recent call last):\n  File \"main.py\", line 1\nValueError: bad input"
      )
    ).toBe("bad input");
  });
});

describe("isMissingMethodResponse", () => {
  it("returns false for successful responses", () => {
    expect(isMissingMethodResponse({ ok: true, payload: { ok: true } })).toBe(false);
  });

  it("detects method not found", () => {
    expect(isMissingMethodResponse({
      ok: false,
      payload: { error: { message: "method not found" } },
    })).toBe(true);
  });

  it("detects unknown method", () => {
    expect(isMissingMethodResponse({
      ok: false,
      error: { message: "unknown method" },
    })).toBe(true);
  });

  it("detects JSON-RPC -32601 error code", () => {
    expect(isMissingMethodResponse({
      ok: false,
      payload: { error: { code: -32601, message: "Method not found" } },
    })).toBe(true);
    // numeric code alone, no descriptive message
    expect(isMissingMethodResponse({
      ok: false,
      error: { code: -32601 },
    })).toBe(true);
  });

  it("detects unknown rpc method", () => {
    expect(isMissingMethodResponse({
      ok: false,
      error: "unknown rpc method",
    })).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isMissingMethodResponse({
      ok: false,
      payload: { error: { message: "auth denied" } },
    })).toBe(false);
  });
});

describe("formatDuration", () => {
  it("formats seconds", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(59)).toBe("59s");
  });

  it("formats minutes", () => {
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(3599)).toBe("59m 59s");
  });

  it("formats hours", () => {
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(5400)).toBe("1h 30m");
    expect(formatDuration(86399)).toBe("23h 59m");
  });

  it("formats days", () => {
    expect(formatDuration(86400)).toBe("1d");
    expect(formatDuration(90000)).toBe("1d 1h");
    expect(formatDuration(172800)).toBe("2d");
  });

  it("formats weeks", () => {
    expect(formatDuration(604800)).toBe("1w");
    expect(formatDuration(691200)).toBe("1w 1d");
    expect(formatDuration(1209600)).toBe("2w");
  });

  it("handles negative values", () => {
    expect(formatDuration(-5)).toBe("0s");
  });

  it("handles non-finite values", () => {
    expect(formatDuration(Infinity)).toBe("0s");
    expect(formatDuration(-Infinity)).toBe("0s");
    expect(formatDuration(NaN)).toBe("0s");
  });
});

describe("formatElapsed", () => {
  it("formats elapsed time from timestamp to now", () => {
    const now = 1000000;
    expect(formatElapsed(now - 45000, now)).toBe("45s");
    expect(formatElapsed(now - 90000, now)).toBe("1m 30s");
    expect(formatElapsed(now - 3600000, now)).toBe("1h");
  });

  it("clamps negative elapsed to 0s", () => {
    // since is in the future relative to now
    expect(formatElapsed(2000, 1000)).toBe("0s");
  });

  it("handles zero elapsed", () => {
    expect(formatElapsed(5000, 5000)).toBe("0s");
  });

  it("returns 0s for non-number inputs", () => {
    expect(formatElapsed(null, 1000)).toBe("0s");
    expect(formatElapsed(undefined, 1000)).toBe("0s");
    expect(formatElapsed("abc", 1000)).toBe("0s");
    expect(formatElapsed(1000, null)).toBe("0s");
    expect(formatElapsed(1000, undefined)).toBe("0s");
  });

  it("returns 0s for non-finite inputs", () => {
    expect(formatElapsed(NaN, 1000)).toBe("0s");
    expect(formatElapsed(Infinity, 1000)).toBe("0s");
    expect(formatElapsed(1000, -Infinity)).toBe("0s");
  });
});

describe("isTruthyEnv", () => {
  it("returns true for truthy strings", () => {
    for (const v of ["1", "true", "t", "yes", "y", "on", "TRUE", "Yes", " 1 ", " ON "]) {
      expect(isTruthyEnv(v)).toBe(true);
    }
  });

  it("returns false for falsy strings", () => {
    for (const v of ["0", "false", "f", "no", "n", "off", "", " ", "random"]) {
      expect(isTruthyEnv(v)).toBe(false);
    }
  });

  it("handles booleans", () => {
    expect(isTruthyEnv(true)).toBe(true);
    expect(isTruthyEnv(false)).toBe(false);
  });

  it("handles numbers", () => {
    expect(isTruthyEnv(1)).toBe(true);
    expect(isTruthyEnv(42)).toBe(true);
    expect(isTruthyEnv(0.5)).toBe(true);
    expect(isTruthyEnv(0)).toBe(false);
    expect(isTruthyEnv(-1)).toBe(false);
    expect(isTruthyEnv(NaN)).toBe(false);
    expect(isTruthyEnv(Infinity)).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isTruthyEnv(null)).toBe(false);
    expect(isTruthyEnv(undefined)).toBe(false);
  });
});

describe("wsReadyStateLabel", () => {
  it("maps standard WebSocket readyState values", () => {
    expect(wsReadyStateLabel(0)).toBe("CONNECTING");
    expect(wsReadyStateLabel(1)).toBe("OPEN");
    expect(wsReadyStateLabel(2)).toBe("CLOSING");
    expect(wsReadyStateLabel(3)).toBe("CLOSED");
  });

  it("returns 'null' for null/undefined", () => {
    expect(wsReadyStateLabel(null)).toBe("null");
    expect(wsReadyStateLabel(undefined)).toBe("null");
  });

  it("returns stringified value for unknown states", () => {
    expect(wsReadyStateLabel(99)).toBe("99");
  });
});

describe("getFrameIntervalMs", () => {
  const SLEEP_MS = 120000;

  it("returns ~15fps (66ms) for thinking mode", () => {
    // Thinking overlay alternates every 600ms — ~15fps is plenty for smooth bob.
    expect(getFrameIntervalMs("thinking", 0, SLEEP_MS, false)).toBe(66);
  });

  it("returns ~15fps (66ms) for tool mode (2-frame animation + bob)", () => {
    expect(getFrameIntervalMs("tool", 0, SLEEP_MS, false)).toBe(66);
  });

  it("returns ~15fps (66ms) for connecting/connected modes", () => {
    expect(getFrameIntervalMs("connecting", 0, SLEEP_MS, false)).toBe(66);
    expect(getFrameIntervalMs("connected", 0, SLEEP_MS, false)).toBe(66);
  });

  it("returns ~15fps (66ms) for idle below sleep threshold", () => {
    expect(getFrameIntervalMs("idle", 5000, SLEEP_MS, false)).toBe(66);
  });

  it("returns ~4fps (250ms) for idle above sleep threshold", () => {
    expect(getFrameIntervalMs("idle", SLEEP_MS + 1, SLEEP_MS, false)).toBe(250);
  });

  it("returns 100ms (~10fps) for disconnected and error modes", () => {
    expect(getFrameIntervalMs("disconnected", 0, SLEEP_MS, false)).toBe(100);
    expect(getFrameIntervalMs("error", 0, SLEEP_MS, false)).toBe(100);
  });

  it("throttles harder with reduced motion", () => {
    // Active modes: 500ms (~2fps)
    expect(getFrameIntervalMs("thinking", 0, SLEEP_MS, true)).toBe(500);
    // Idle: 1000ms (~1fps)
    expect(getFrameIntervalMs("idle", 5000, SLEEP_MS, true)).toBe(1000);
    // Sleeping: 2000ms (~0.5fps)
    expect(getFrameIntervalMs("idle", SLEEP_MS + 1, SLEEP_MS, true)).toBe(2000);
  });

  it("treats exact sleep threshold as not sleeping", () => {
    // idleDurationMs must be > sleepThresholdMs to sleep
    expect(getFrameIntervalMs("idle", SLEEP_MS, SLEEP_MS, false)).toBe(66);
  });

  it("defaults to ~15fps for unknown/future modes instead of full 60fps", () => {
    expect(getFrameIntervalMs("some-future-mode", 0, SLEEP_MS, false)).toBe(66);
    expect(getFrameIntervalMs("", 0, SLEEP_MS, false)).toBe(66);
  });
});

describe("getReconnectDelayMs", () => {
  it("returns base delay for attempt 0", () => {
    const delay = getReconnectDelayMs(0, { baseMs: 1500, maxMs: 30000, jitterFraction: 0 });
    expect(delay).toBe(1500);
  });

  it("doubles delay with each attempt", () => {
    const d0 = getReconnectDelayMs(0, { baseMs: 1000, maxMs: 100000, jitterFraction: 0 });
    const d1 = getReconnectDelayMs(1, { baseMs: 1000, maxMs: 100000, jitterFraction: 0 });
    const d2 = getReconnectDelayMs(2, { baseMs: 1000, maxMs: 100000, jitterFraction: 0 });
    expect(d0).toBe(1000);
    expect(d1).toBe(2000);
    expect(d2).toBe(4000);
  });

  it("caps at maxMs", () => {
    const delay = getReconnectDelayMs(20, { baseMs: 1500, maxMs: 30000, jitterFraction: 0 });
    expect(delay).toBe(30000);
  });

  it("adds jitter within expected range", () => {
    // With jitterFraction=0.2, delay should be in [base, base * 1.2]
    for (let i = 0; i < 20; i++) {
      const delay = getReconnectDelayMs(0, { baseMs: 1000, maxMs: 30000, jitterFraction: 0.2 });
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(1200);
    }
  });

  it("uses sensible defaults", () => {
    const delay = getReconnectDelayMs(0);
    // Default baseMs=1500, jitterFraction=0.2 → [1500, 1800]
    expect(delay).toBeGreaterThanOrEqual(1500);
    expect(delay).toBeLessThanOrEqual(1800);
  });
});

describe("buildTooltip", () => {
  it("returns basic mode + duration", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 30 });
    expect(tip).toContain("idle for");
    expect(tip).toContain("30s");
  });

  it("includes error message when provided", () => {
    const tip = buildTooltip({ displayMode: "error", durationSec: 5, lastErrorMessage: "timeout" });
    expect(tip).toContain("— timeout");
  });

  it("includes ghost mode indicator", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, isClickThrough: true });
    expect(tip).toContain("ghost mode");
  });

  it("includes connected URL", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, connectedUrl: "ws://localhost:18789" });
    expect(tip).toContain("ws://localhost:18789");
  });

  it("includes retry count when disconnected", () => {
    const tip = buildTooltip({ displayMode: "disconnected", durationSec: 10, reconnectAttempt: 3, connectedSince: null });
    expect(tip).toContain("retry #3");
  });

  it("shows disconnected duration when lastDisconnectedAt is provided and not connected", () => {
    const now = Date.now();
    const tip = buildTooltip({ displayMode: "disconnected", durationSec: 10, lastDisconnectedAt: now - 120_000, connectedSince: null, now });
    expect(tip).toContain("disconnected 2m ago");
  });

  it("omits disconnected duration when connected", () => {
    const now = Date.now();
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, lastDisconnectedAt: now - 60_000, connectedSince: now - 30_000, now });
    expect(tip).not.toContain("disconnected");
  });

  it("omits disconnected duration when lastDisconnectedAt is null", () => {
    const tip = buildTooltip({ displayMode: "disconnected", durationSec: 5, lastDisconnectedAt: null, connectedSince: null });
    expect(tip).not.toContain("ago");
  });

  it("omits retry count when connected", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, reconnectAttempt: 3, connectedSince: Date.now() });
    expect(tip).not.toContain("retry");
  });

  it("includes tool call stats", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, pluginToolCalls: 42, pluginToolErrors: 3 });
    expect(tip).toContain("42 calls");
    expect(tip).toContain("3 errors");
    expect(tip).toContain("93% ok");
  });

  it("omits success rate when no tool errors", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, pluginToolCalls: 10, pluginToolErrors: 0 });
    expect(tip).toContain("10 calls");
    expect(tip).not.toContain("errors");
    expect(tip).not.toContain("% ok");
  });

  it("includes version info", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, appVersion: "1.2.3", pluginVersion: "0.5.0" });
    expect(tip).toContain("v1.2.3");
    expect(tip).toContain("plugin v0.5.0");
  });

  it("omits version parentheses when no versions provided", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0 });
    expect(tip).not.toContain("(");
  });

  it("includes current tool name when in tool mode", () => {
    const tip = buildTooltip({ displayMode: "tool", durationSec: 5, currentTool: "web_search" });
    expect(tip).toContain("(web_search)");
  });

  it("omits tool name when not in tool mode", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 5, currentTool: "web_search" });
    expect(tip).not.toContain("web_search");
  });

  it("includes size label when non-default", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, sizeLabel: "large" });
    expect(tip).toContain("large");
  });

  it("omits size label when medium (default)", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, sizeLabel: "medium" });
    expect(tip).not.toContain("medium");
  });

  it("includes opacity when below 100%", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, opacity: 0.6 });
    expect(tip).toContain("60%");
  });

  it("omits opacity when at 100%", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, opacity: 1 });
    expect(tip).not.toContain("%");
  });

  it("includes alignment when non-default", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, alignment: "top-left" });
    expect(tip).toContain("top-left");
  });

  it("omits alignment when bottom-right (default)", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, alignment: "bottom-right" });
    expect(tip).not.toContain("bottom-right");
  });

  it("omits alignment when null/undefined", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, alignment: null });
    expect(tip).not.toContain("null");
  });

  it("shows plugin uptime when pluginStartedAt is provided", () => {
    const now = Date.now();
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, pluginStartedAt: now - 3600_000, now });
    expect(tip).toContain("plugin up 1h");
  });

  it("omits plugin uptime when pluginStartedAt is null", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, pluginStartedAt: null });
    expect(tip).not.toContain("plugin up");
  });

  it("shows text hidden indicator when isTextHidden is true", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, isTextHidden: true });
    expect(tip).toContain("text hidden");
  });

  it("omits text hidden indicator when isTextHidden is false", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, isTextHidden: false });
    expect(tip).not.toContain("text hidden");
  });

  it("shows reconnect count when sessionConnectCount > 1", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, sessionConnectCount: 4 });
    expect(tip).toContain("reconnected 3×");
  });

  it("omits reconnect count when sessionConnectCount is 1 (no flaps)", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, sessionConnectCount: 1 });
    expect(tip).not.toContain("reconnected");
  });

  it("omits reconnect count when sessionConnectCount is 0 or not provided", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, sessionConnectCount: 0 });
    expect(tip).not.toContain("reconnected");
    const tip2 = buildTooltip({ displayMode: "idle", durationSec: 0 });
    expect(tip2).not.toContain("reconnected");
  });

  it("includes lastCloseDetail when disconnected", () => {
    const tip = buildTooltip({ displayMode: "disconnected", durationSec: 5, lastCloseDetail: "code 1006" });
    expect(tip).toContain("last close: code 1006");
  });

  it("omits lastCloseDetail when not provided", () => {
    const tip = buildTooltip({ displayMode: "disconnected", durationSec: 5 });
    expect(tip).not.toContain("last close");
  });

  it("shows lastCloseDetail when connected + flappy (sessionConnectCount > 1)", () => {
    const now = Date.now();
    const tip = buildTooltip({
      displayMode: "thinking",
      durationSec: 10,
      connectedSince: now - 60000,
      connectedUrl: "ws://localhost:18789",
      lastCloseDetail: "abnormal closure",
      sessionConnectCount: 3,
      now,
    });
    expect(tip).toContain("last close: abnormal closure");
  });

  it("omits lastCloseDetail when connected + stable (sessionConnectCount <= 1)", () => {
    const now = Date.now();
    const tip = buildTooltip({
      displayMode: "thinking",
      durationSec: 10,
      connectedSince: now - 60000,
      connectedUrl: "ws://localhost:18789",
      lastCloseDetail: "normal",
      sessionConnectCount: 1,
      now,
    });
    expect(tip).not.toContain("last close");
  });

  it("includes latencyMs when provided", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, latencyMs: 42 });
    expect(tip).toContain("42ms");
  });

  it("omits latencyMs when null or undefined", () => {
    const tip1 = buildTooltip({ displayMode: "idle", durationSec: 0, latencyMs: null });
    const tip2 = buildTooltip({ displayMode: "idle", durationSec: 0 });
    expect(tip1).not.toContain("ms");
    // "ms" appears in formatDuration output for durations like "0s", so check no standalone ms
    expect(tip2).not.toMatch(/\d+ms/);
  });

  it("includes latencyMs of 0", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, latencyMs: 0 });
    expect(tip).toContain("< 1ms");
  });

  it("shows active agents and tools when non-zero", () => {
    const tip = buildTooltip({ displayMode: "thinking", durationSec: 5, activeAgents: 2, activeTools: 3 });
    expect(tip).toContain("2 agents, 3 tools");
  });

  it("uses singular form for 1 agent/tool", () => {
    const tip = buildTooltip({ displayMode: "tool", durationSec: 1, activeAgents: 1, activeTools: 1 });
    expect(tip).toContain("1 agent, 1 tool");
  });

  it("omits active agents/tools when both zero", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, activeAgents: 0, activeTools: 0 });
    expect(tip).not.toContain("agent");
    expect(tip).not.toContain("tool");
  });

  it("omits active agents/tools when not provided", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0 });
    expect(tip).not.toMatch(/\d+ agents?/);
  });

  it("shows targetUrl when disconnected", () => {
    const tip = buildTooltip({ displayMode: "disconnected", durationSec: 10, targetUrl: "ws://127.0.0.1:18789" });
    expect(tip).toContain("→ ws://127.0.0.1:18789");
  });

  it("omits targetUrl when connected", () => {
    const tip = buildTooltip({ displayMode: "connected", durationSec: 10, connectedSince: Date.now() - 5000, targetUrl: "ws://127.0.0.1:18789" });
    expect(tip).not.toContain("→ ws://127.0.0.1:18789");
  });

  it("omits targetUrl when not provided", () => {
    const tip = buildTooltip({ displayMode: "disconnected", durationSec: 10 });
    expect(tip).not.toContain("→");
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

  it("auto-adds ws:// for bare host:port URLs", () => {
    expect(normalizeWsUrl("127.0.0.1:18789")).toBe("ws://127.0.0.1:18789");
    expect(normalizeWsUrl("localhost:8080/ws")).toBe("ws://localhost:8080/ws");
    expect(normalizeWsUrl("gateway.example.com")).toBe("ws://gateway.example.com");
  });

  it("handles empty string", () => {
    expect(normalizeWsUrl("")).toBe("");
  });
});

describe("formatCloseDetail", () => {
  it("returns friendly label for well-known codes", () => {
    expect(formatCloseDetail(1006, null)).toBe("abnormal closure (1006)");
    expect(formatCloseDetail(1001, "")).toBe("going away (1001)");
    expect(formatCloseDetail(1011, undefined)).toBe("internal error (1011)");
    expect(formatCloseDetail(1012, "")).toBe("service restart (1012)");
    expect(formatCloseDetail(1013, null)).toBe("try again later (1013)");
  });

  it("shows reason with code for searchability", () => {
    expect(formatCloseDetail(1006, "server restarting")).toBe("server restarting (1006)");
    expect(formatCloseDetail(1001, "shutting down")).toBe("shutting down (1001)");
  });

  it("shows reason without code when code is null", () => {
    expect(formatCloseDetail(null, "server restarting")).toBe("server restarting");
    expect(formatCloseDetail(undefined, "custom reason")).toBe("custom reason");
  });

  it("returns raw code for unknown codes without reason", () => {
    expect(formatCloseDetail(4999, null)).toBe("code 4999");
    expect(formatCloseDetail(3999, "")).toBe("code 3999");
  });

  it("returns friendly label for application-specific codes (4000-4014)", () => {
    expect(formatCloseDetail(4000, "")).toBe("unknown error (4000)");
    expect(formatCloseDetail(4001, "")).toBe("auth failed (4001)");
    expect(formatCloseDetail(4002, null)).toBe("rate limited (4002)");
    expect(formatCloseDetail(4003, "")).toBe("forbidden (4003)");
    expect(formatCloseDetail(4006, "")).toBe("session replaced (4006)");
    expect(formatCloseDetail(4009, null)).toBe("session expired (4009)");
    expect(formatCloseDetail(4010, "")).toBe("server restart (4010)");
    expect(formatCloseDetail(4014, "")).toBe("disallowed intent (4014)");
  });

  it("prefers custom reason over label for application-specific codes", () => {
    // When the server provides a custom reason, it takes precedence over the generic label
    expect(formatCloseDetail(4001, "invalid token")).toBe("invalid token (4001)");
    expect(formatCloseDetail(4010, "upgrading to v2")).toBe("upgrading to v2 (4010)");
  });

  it("returns friendly label for normal close (1000) with no reason", () => {
    expect(formatCloseDetail(1000, "")).toBe("normal (1000)");
    expect(formatCloseDetail(1000, null)).toBe("normal (1000)");
  });

  it("returns empty string when both null", () => {
    expect(formatCloseDetail(null, null)).toBe("");
    expect(formatCloseDetail(undefined, undefined)).toBe("");
  });

  it("truncates long reason strings to keep tooltips readable", () => {
    const longReason = "a".repeat(120);
    const result = formatCloseDetail(1006, longReason);
    // Reason is truncated to ~80 chars, then " (1006)" is appended
    expect(result).toContain("…");
    expect(result).toEndWith(" (1006)");
    // Truncated reason (≤80) + " (1006)" (7) = ≤87
    expect(result.length).toBeLessThanOrEqual(87);
  });

  it("preserves short reason strings with code appended", () => {
    const shortReason = "server restarting gracefully";
    expect(formatCloseDetail(1006, shortReason)).toBe("server restarting gracefully (1006)");
  });

  it("collapses multi-line close reasons into a single line", () => {
    const multiLine = "server shutting down\nplease reconnect later";
    expect(formatCloseDetail(1001, multiLine)).toBe("server shutting down please reconnect later (1001)");
  });

  it("WS_CLOSE_CODE_LABELS covers common codes", () => {
    expect(WS_CLOSE_CODE_LABELS[1000]).toBe("normal");
    expect(WS_CLOSE_CODE_LABELS[1006]).toBe("abnormal closure");
    expect(WS_CLOSE_CODE_LABELS[1015]).toBe("TLS handshake failed");
    // Application-specific range (4000-4999)
    expect(WS_CLOSE_CODE_LABELS[4001]).toBe("auth failed");
    expect(WS_CLOSE_CODE_LABELS[4006]).toBe("session replaced");
    expect(WS_CLOSE_CODE_LABELS[4010]).toBe("server restart");
  });
});

describe("PLUGIN_STATE_METHODS / PLUGIN_RESET_METHODS", () => {
  it("are non-empty arrays of strings", () => {
    expect(Array.isArray(PLUGIN_STATE_METHODS)).toBe(true);
    expect(Array.isArray(PLUGIN_RESET_METHODS)).toBe(true);
    expect(PLUGIN_STATE_METHODS.length).toBeGreaterThan(0);
    expect(PLUGIN_RESET_METHODS.length).toBeGreaterThan(0);
    for (const m of PLUGIN_STATE_METHODS) expect(typeof m).toBe("string");
    for (const m of PLUGIN_RESET_METHODS) expect(typeof m).toBe("string");
  });

  it("canonical names use the scoped package id first", () => {
    expect(PLUGIN_STATE_METHODS[0]).toBe("@molt/mascot-plugin.state");
    expect(PLUGIN_RESET_METHODS[0]).toBe("@molt/mascot-plugin.reset");
  });

  it("state and reset arrays have matching length and parallel aliases", () => {
    expect(PLUGIN_STATE_METHODS.length).toBe(PLUGIN_RESET_METHODS.length);
    // Each state method should have a corresponding reset method with same prefix
    for (let i = 0; i < PLUGIN_STATE_METHODS.length; i++) {
      const stateBase = PLUGIN_STATE_METHODS[i].replace(/\.state$/, "");
      const resetBase = PLUGIN_RESET_METHODS[i].replace(/\.reset$/, "");
      expect(stateBase).toBe(resetBase);
    }
  });
});

describe("successRate", () => {
  it("computes correct percentage", () => {
    expect(successRate(100, 5)).toBe(95);
    expect(successRate(10, 3)).toBe(70);
    expect(successRate(1, 1)).toBe(0);
    expect(successRate(1, 0)).toBe(100);
  });

  it("returns null for zero or invalid total", () => {
    expect(successRate(0, 0)).toBe(null);
    expect(successRate(-1, 0)).toBe(null);
    expect(successRate(null, 5)).toBe(null);
    expect(successRate(undefined, 5)).toBe(null);
  });

  it("clamps errors to totalCalls", () => {
    // More errors than calls shouldn't go negative
    expect(successRate(5, 10)).toBe(0);
  });

  it("handles missing errorCount", () => {
    expect(successRate(10, null)).toBe(100);
    expect(successRate(10, undefined)).toBe(100);
  });
});

describe("formatBytes", () => {
  it("formats bytes below 1024", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1.0 GB");
  });

  it("returns 0 B for invalid inputs", () => {
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(NaN)).toBe("0 B");
    expect(formatBytes(Infinity)).toBe("0 B");
  });
});

describe("formatLatency", () => {
  it("returns '< 1ms' for zero", () => {
    expect(formatLatency(0)).toBe("< 1ms");
  });

  it("formats milliseconds for values under 1000", () => {
    expect(formatLatency(1)).toBe("1ms");
    expect(formatLatency(42)).toBe("42ms");
    expect(formatLatency(999)).toBe("999ms");
  });

  it("rounds fractional milliseconds", () => {
    expect(formatLatency(1.4)).toBe("1ms");
    expect(formatLatency(1.6)).toBe("2ms");
  });

  it("formats seconds for values >= 1000", () => {
    expect(formatLatency(1000)).toBe("1.0s");
    expect(formatLatency(1200)).toBe("1.2s");
    expect(formatLatency(5432)).toBe("5.4s");
  });

  it("returns dash for negative, NaN, Infinity, and non-numbers", () => {
    expect(formatLatency(-1)).toBe("–");
    expect(formatLatency(NaN)).toBe("–");
    expect(formatLatency(Infinity)).toBe("–");
    expect(formatLatency(undefined)).toBe("–");
    expect(formatLatency(null)).toBe("–");
    expect(formatLatency("50")).toBe("–");
  });
});

describe("MODE_EMOJI", () => {
  it("is a frozen object with expected mode keys", () => {
    expect(Object.isFrozen(MODE_EMOJI)).toBe(true);
    expect(MODE_EMOJI.thinking).toBe("🧠");
    expect(MODE_EMOJI.tool).toBe("🔧");
    expect(MODE_EMOJI.error).toBe("❌");
    expect(MODE_EMOJI.connecting).toBe("🔄");
    expect(MODE_EMOJI.disconnected).toBe("⚡");
    expect(MODE_EMOJI.connected).toBe("✅");
    expect(MODE_EMOJI.sleeping).toBe("💤");
  });

  it("includes idle with a neutral dot indicator", () => {
    expect(MODE_EMOJI.idle).toBe("●");
  });
});
