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
  formatCount,
  formatLatency,
  connectionQuality,
  connectionQualityEmoji,
  healthStatusEmoji,
  MODE_EMOJI,
  computeHealthStatus,
  isRecoverableCloseCode,
  RECOVERABLE_CLOSE_CODES,
  connectionUptimePercent,
  computeHealthReasons,
  validateWsUrl,
  VALID_MODES,
  isValidMode,
  computeConnectionSuccessRate,
  isSleepingMode,
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

  it("returns ~15fps (66ms) for connecting and ~7fps (150ms) for connected mode", () => {
    expect(getFrameIntervalMs("connecting", 0, SLEEP_MS, false)).toBe(66);
    expect(getFrameIntervalMs("connected", 0, SLEEP_MS, false)).toBe(150);
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

  it("treats connectedSince=0 as connected (epoch timestamp)", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, connectedSince: 0, now: 60000 });
    expect(tip).toContain("connected 1m");
    expect(tip).not.toContain("retry");
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

  it("formats large tool counts with compact notation", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, pluginToolCalls: 1500, pluginToolErrors: 200 });
    expect(tip).toContain("1.5K calls");
    expect(tip).toContain("200 errors");
    expect(tip).toContain("87% ok");
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

  it("appends connection quality label from instant latency", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, latencyMs: 10 });
    expect(tip).toContain("[excellent]");
  });

  it("uses median for quality label when latencyStats available", () => {
    // Instant latency is 400ms (fair) but median is 30ms (excellent) — should use median
    const tip = buildTooltip({
      displayMode: "idle", durationSec: 0, latencyMs: 400,
      latencyStats: { min: 10, max: 500, avg: 100, median: 30, p95: 450, samples: 10 },
    });
    expect(tip).toContain("[excellent]");
    expect(tip).not.toContain("[fair]");
  });

  it("falls back to instant latency for quality when stats have 1 sample", () => {
    const tip = buildTooltip({
      displayMode: "idle", durationSec: 0, latencyMs: 200,
      latencyStats: { min: 200, max: 200, avg: 200, median: 200, samples: 1 },
    });
    expect(tip).toContain("[fair]");
  });

  it("shows jitter when it exceeds 50% of median", () => {
    const tip = buildTooltip({
      displayMode: "idle", durationSec: 0, latencyMs: 50,
      latencyStats: { min: 10, max: 200, avg: 80, median: 50, p95: 180, jitter: 40, samples: 10 },
    });
    expect(tip).toContain("jitter 40ms");
  });

  it("omits jitter when below 50% of median", () => {
    const tip = buildTooltip({
      displayMode: "idle", durationSec: 0, latencyMs: 50,
      latencyStats: { min: 10, max: 200, avg: 80, median: 100, p95: 180, jitter: 40, samples: 10 },
    });
    expect(tip).not.toContain("jitter");
  });

  it("omits jitter when not present in stats", () => {
    const tip = buildTooltip({
      displayMode: "idle", durationSec: 0, latencyMs: 50,
      latencyStats: { min: 10, max: 200, avg: 80, median: 50, p95: 180, samples: 10 },
    });
    expect(tip).not.toContain("jitter");
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

  it("shows lastResetAt when provided", () => {
    const now = Date.now();
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, lastResetAt: now - 300_000, now });
    expect(tip).toContain("reset 5m ago");
  });

  it("omits lastResetAt when not provided or zero", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0 });
    expect(tip).not.toContain("reset");
    const tip2 = buildTooltip({ displayMode: "idle", durationSec: 0, lastResetAt: 0 });
    expect(tip2).not.toContain("reset");
  });

  it("shows degraded health status", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, healthStatus: "degraded" });
    expect(tip).toContain("⚠️ degraded");
  });

  it("shows unhealthy health status", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, healthStatus: "unhealthy" });
    expect(tip).toContain("🔴 unhealthy");
  });

  it("includes stale connection reason when lastMessageAt is provided", () => {
    const now = 1000000;
    const tip = buildTooltip({
      displayMode: "idle",
      durationSec: 0,
      connectedSince: now - 60000,
      healthStatus: "degraded",
      lastMessageAt: now - 15000,
      isPollingPaused: false,
      now,
    });
    expect(tip).toContain("stale connection: 15s");
  });

  it("includes low success rate reason when connectionSuccessRate is provided", () => {
    const now = 1000000;
    const tip = buildTooltip({
      displayMode: "idle",
      durationSec: 0,
      connectedSince: now - 60000,
      healthStatus: "degraded",
      connectionSuccessRate: 50,
      now,
    });
    expect(tip).toContain("low success rate: 50%");
  });

  it("omits health status when healthy or not provided", () => {
    const tip1 = buildTooltip({ displayMode: "idle", durationSec: 0, healthStatus: "healthy" });
    expect(tip1).not.toContain("degraded");
    expect(tip1).not.toContain("unhealthy");
    const tip2 = buildTooltip({ displayMode: "idle", durationSec: 0 });
    expect(tip2).not.toContain("degraded");
    expect(tip2).not.toContain("unhealthy");
  });

  it("shows rising latency trend arrow", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, latencyMs: 50, latencyTrend: "rising" });
    expect(tip).toContain("↑");
  });

  it("shows falling latency trend arrow", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, latencyMs: 50, latencyTrend: "falling" });
    expect(tip).toContain("↓");
  });

  it("omits trend arrow when stable", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, latencyMs: 50, latencyTrend: "stable" });
    expect(tip).not.toContain("↑");
    expect(tip).not.toContain("↓");
  });

  it("omits trend arrow when latencyTrend is null or not provided", () => {
    const tip1 = buildTooltip({ displayMode: "idle", durationSec: 0, latencyMs: 50, latencyTrend: null });
    expect(tip1).not.toContain("↑");
    expect(tip1).not.toContain("↓");
    const tip2 = buildTooltip({ displayMode: "idle", durationSec: 0, latencyMs: 50 });
    expect(tip2).not.toContain("↑");
    expect(tip2).not.toContain("↓");
  });

  it("omits trend arrow when latencyMs is not provided", () => {
    const tip = buildTooltip({ displayMode: "idle", durationSec: 0, latencyTrend: "rising" });
    expect(tip).not.toContain("↑");
  });

  it("shows last msg indicator when gap exceeds 5s while connected", () => {
    const now = 1700000010000;
    const tip = buildTooltip({
      displayMode: "idle",
      durationSec: 60,
      connectedSince: now - 60000,
      lastMessageAt: now - 8000,
      now,
    });
    expect(tip).toContain("last msg");
  });

  it("omits last msg indicator when gap is under 5s", () => {
    const now = 1700000010000;
    const tip = buildTooltip({
      displayMode: "idle",
      durationSec: 60,
      connectedSince: now - 60000,
      lastMessageAt: now - 3000,
      now,
    });
    expect(tip).not.toContain("last msg");
  });

  it("omits last msg indicator when not connected", () => {
    const now = 1700000010000;
    const tip = buildTooltip({
      displayMode: "disconnected",
      durationSec: 10,
      lastMessageAt: now - 8000,
      now,
    });
    expect(tip).not.toContain("last msg");
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

  it("is case-insensitive for http/https scheme", () => {
    expect(normalizeWsUrl("HTTP://localhost:8080")).toBe("ws://localhost:8080");
    expect(normalizeWsUrl("HTTPS://localhost")).toBe("wss://localhost");
  });

  it("normalizes uppercase WS/WSS schemes to lowercase", () => {
    expect(normalizeWsUrl("WS://127.0.0.1:18789")).toBe("ws://127.0.0.1:18789");
    expect(normalizeWsUrl("WSS://gateway.example.com")).toBe("wss://gateway.example.com");
    expect(normalizeWsUrl("Ws://localhost:8080")).toBe("ws://localhost:8080");
    expect(normalizeWsUrl("Wss://localhost")).toBe("wss://localhost");
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

describe("validateWsUrl", () => {
  it("returns null for valid ws:// URLs", () => {
    expect(validateWsUrl("ws://127.0.0.1:18789")).toBe(null);
    expect(validateWsUrl("ws://localhost:8080/ws")).toBe(null);
    expect(validateWsUrl("wss://gateway.example.com")).toBe(null);
    expect(validateWsUrl("wss://gateway.example.com:443/path")).toBe(null);
  });

  it("rejects empty or non-string input", () => {
    expect(validateWsUrl("")).toBe("URL is empty");
    expect(validateWsUrl("   ")).toBe("URL is empty");
    expect(validateWsUrl(null)).toBe("URL is empty");
    expect(validateWsUrl(undefined)).toBe("URL is empty");
    expect(validateWsUrl(42)).toBe("URL is empty");
  });

  it("rejects non-WebSocket schemes", () => {
    expect(validateWsUrl("http://localhost:8080")).toBe("URL must start with ws:// or wss://");
    expect(validateWsUrl("https://localhost")).toBe("URL must start with ws:// or wss://");
    expect(validateWsUrl("ftp://example.com")).toBe("URL must start with ws:// or wss://");
  });

  it("rejects URLs with missing hostname", () => {
    // URL constructor throws for bare scheme-only URLs, caught as malformed
    expect(validateWsUrl("ws://")).toBe("URL is malformed");
    expect(validateWsUrl("wss://")).toBe("URL is malformed");
  });

  it("rejects out-of-range ports", () => {
    expect(validateWsUrl("ws://localhost:0")).toMatch(/Invalid port/);
    // Very large ports cause URL constructor to throw
    expect(validateWsUrl("ws://localhost:99999")).toBe("URL is malformed");
    expect(validateWsUrl("ws://localhost:70000")).toBe("URL is malformed");
  });

  it("accepts valid port numbers", () => {
    expect(validateWsUrl("ws://localhost:1")).toBe(null);
    expect(validateWsUrl("ws://localhost:65535")).toBe(null);
    expect(validateWsUrl("ws://localhost:18789")).toBe(null);
  });

  it("accepts URLs without explicit port", () => {
    expect(validateWsUrl("ws://localhost")).toBe(null);
    expect(validateWsUrl("wss://example.com/path")).toBe(null);
  });

  it("rejects URLs with embedded credentials", () => {
    expect(validateWsUrl("ws://user:pass@localhost:8080")).toMatch(/credentials/i);
    expect(validateWsUrl("wss://admin:secret@example.com/ws")).toMatch(/credentials/i);
    expect(validateWsUrl("ws://user@localhost")).toMatch(/credentials/i);
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

  it("formats all application-specific close codes (4000-4014)", () => {
    expect(formatCloseDetail(4004, "")).toBe("not found (4004)");
    expect(formatCloseDetail(4005, null)).toBe("already connected (4005)");
    expect(formatCloseDetail(4007, "")).toBe("invalid payload (4007)");
    expect(formatCloseDetail(4008, null)).toBe("request timeout (4008)");
    expect(formatCloseDetail(4011, "")).toBe("reconnect required (4011)");
    expect(formatCloseDetail(4012, null)).toBe("invalid version (4012)");
    expect(formatCloseDetail(4013, "")).toBe("invalid intent (4013)");
  });

  it("WS_CLOSE_CODE_LABELS covers all defined codes", () => {
    // IANA standard codes
    expect(WS_CLOSE_CODE_LABELS[1000]).toBe("normal");
    expect(WS_CLOSE_CODE_LABELS[1001]).toBe("going away");
    expect(WS_CLOSE_CODE_LABELS[1002]).toBe("protocol error");
    expect(WS_CLOSE_CODE_LABELS[1003]).toBe("unsupported data");
    expect(WS_CLOSE_CODE_LABELS[1005]).toBe("no status");
    expect(WS_CLOSE_CODE_LABELS[1006]).toBe("abnormal closure");
    expect(WS_CLOSE_CODE_LABELS[1007]).toBe("invalid payload");
    expect(WS_CLOSE_CODE_LABELS[1008]).toBe("policy violation");
    expect(WS_CLOSE_CODE_LABELS[1009]).toBe("message too big");
    expect(WS_CLOSE_CODE_LABELS[1010]).toBe("missing extension");
    expect(WS_CLOSE_CODE_LABELS[1011]).toBe("internal error");
    expect(WS_CLOSE_CODE_LABELS[1012]).toBe("service restart");
    expect(WS_CLOSE_CODE_LABELS[1013]).toBe("try again later");
    expect(WS_CLOSE_CODE_LABELS[1014]).toBe("bad gateway");
    expect(WS_CLOSE_CODE_LABELS[1015]).toBe("TLS handshake failed");
    // Application-specific range (4000-4014)
    expect(WS_CLOSE_CODE_LABELS[4000]).toBe("unknown error");
    expect(WS_CLOSE_CODE_LABELS[4001]).toBe("auth failed");
    expect(WS_CLOSE_CODE_LABELS[4002]).toBe("rate limited");
    expect(WS_CLOSE_CODE_LABELS[4003]).toBe("forbidden");
    expect(WS_CLOSE_CODE_LABELS[4004]).toBe("not found");
    expect(WS_CLOSE_CODE_LABELS[4005]).toBe("already connected");
    expect(WS_CLOSE_CODE_LABELS[4006]).toBe("session replaced");
    expect(WS_CLOSE_CODE_LABELS[4007]).toBe("invalid payload");
    expect(WS_CLOSE_CODE_LABELS[4008]).toBe("request timeout");
    expect(WS_CLOSE_CODE_LABELS[4009]).toBe("session expired");
    expect(WS_CLOSE_CODE_LABELS[4010]).toBe("server restart");
    expect(WS_CLOSE_CODE_LABELS[4011]).toBe("reconnect required");
    expect(WS_CLOSE_CODE_LABELS[4012]).toBe("invalid version");
    expect(WS_CLOSE_CODE_LABELS[4013]).toBe("invalid intent");
    expect(WS_CLOSE_CODE_LABELS[4014]).toBe("disallowed intent");
  });

  it("every WS_CLOSE_CODE_LABELS entry produces a valid formatCloseDetail result", () => {
    for (const [code, label] of Object.entries(WS_CLOSE_CODE_LABELS)) {
      const result = formatCloseDetail(Number(code), "");
      expect(result).toBe(`${label} (${code})`);
    }
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

describe("formatCount", () => {
  it("formats small numbers as plain integers", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(1)).toBe("1");
    expect(formatCount(42)).toBe("42");
    expect(formatCount(999)).toBe("999");
  });

  it("formats thousands with K suffix", () => {
    expect(formatCount(1000)).toBe("1.0K");
    expect(formatCount(1500)).toBe("1.5K");
    expect(formatCount(9999)).toBe("10.0K");
    expect(formatCount(999999)).toBe("1000.0K");
  });

  it("formats millions with M suffix", () => {
    expect(formatCount(1000000)).toBe("1.0M");
    expect(formatCount(2500000)).toBe("2.5M");
  });

  it("formats billions with B suffix", () => {
    expect(formatCount(1000000000)).toBe("1.0B");
  });

  it("returns '0' for invalid inputs", () => {
    expect(formatCount(-1)).toBe("0");
    expect(formatCount(NaN)).toBe("0");
    expect(formatCount(Infinity)).toBe("0");
  });

  it("rounds fractional values below 1000", () => {
    expect(formatCount(1.7)).toBe("2");
    expect(formatCount(0.4)).toBe("0");
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

describe("connectionQuality", () => {
  it("categorizes latency into quality labels", () => {
    expect(connectionQuality(0)).toBe("excellent");
    expect(connectionQuality(49)).toBe("excellent");
    expect(connectionQuality(50)).toBe("good");
    expect(connectionQuality(149)).toBe("good");
    expect(connectionQuality(150)).toBe("fair");
    expect(connectionQuality(499)).toBe("fair");
    expect(connectionQuality(500)).toBe("poor");
    expect(connectionQuality(9999)).toBe("poor");
  });

  it("returns null for invalid inputs", () => {
    expect(connectionQuality(-1)).toBeNull();
    expect(connectionQuality(NaN)).toBeNull();
    expect(connectionQuality(Infinity)).toBeNull();
  });
});

describe("connectionQualityEmoji", () => {
  it("maps quality labels to colored circle emojis", () => {
    expect(connectionQualityEmoji("excellent")).toBe("🟢");
    expect(connectionQualityEmoji("good")).toBe("🟡");
    expect(connectionQualityEmoji("fair")).toBe("🟠");
    expect(connectionQualityEmoji("poor")).toBe("🔴");
  });

  it("returns grey circle for null or unknown values", () => {
    expect(connectionQualityEmoji(null)).toBe("⚪");
    expect(connectionQualityEmoji(undefined)).toBe("⚪");
    expect(connectionQualityEmoji("unknown")).toBe("⚪");
  });
});

describe("healthStatusEmoji", () => {
  it("maps known statuses to correct emojis", () => {
    expect(healthStatusEmoji("healthy")).toBe("🟢");
    expect(healthStatusEmoji("degraded")).toBe("⚠️");
    expect(healthStatusEmoji("unhealthy")).toBe("🔴");
  });

  it("returns grey circle for null or unknown values", () => {
    expect(healthStatusEmoji(null)).toBe("⚪");
    expect(healthStatusEmoji(undefined)).toBe("⚪");
    expect(healthStatusEmoji("unknown")).toBe("⚪");
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

describe("computeHealthStatus", () => {
  const now = 1700000000000;

  it("returns unhealthy when not connected", () => {
    expect(computeHealthStatus({ isConnected: false, now })).toBe("unhealthy");
  });

  it("returns unhealthy with no arguments", () => {
    expect(computeHealthStatus()).toBe("unhealthy");
  });

  it("returns healthy when connected with good latency", () => {
    expect(computeHealthStatus({ isConnected: true, latencyMs: 20, now })).toBe("healthy");
  });

  it("returns degraded when latency is poor (>=500ms)", () => {
    expect(computeHealthStatus({ isConnected: true, latencyMs: 600, now })).toBe("degraded");
  });

  it("returns degraded when connection is stale (>10s no messages)", () => {
    expect(computeHealthStatus({
      isConnected: true,
      isPollingPaused: false,
      lastMessageAt: now - 11000,
      latencyMs: 20,
      now,
    })).toBe("degraded");
  });

  it("ignores stale check when polling is paused", () => {
    expect(computeHealthStatus({
      isConnected: true,
      isPollingPaused: true,
      lastMessageAt: now - 20000,
      latencyMs: 20,
      now,
    })).toBe("healthy");
  });

  it("returns degraded when connection success rate is below 80%", () => {
    expect(computeHealthStatus({
      isConnected: true,
      connectionSuccessRate: 50,
      latencyMs: 20,
      now,
    })).toBe("degraded");
  });

  it("returns healthy when success rate is 80% or above", () => {
    expect(computeHealthStatus({
      isConnected: true,
      connectionSuccessRate: 80,
      latencyMs: 20,
      now,
    })).toBe("healthy");
  });

  it("prefers median from latency stats over instant latency", () => {
    // Instant latency is fine (20ms) but median is poor (600ms)
    expect(computeHealthStatus({
      isConnected: true,
      latencyMs: 20,
      latencyStats: { median: 600, samples: 10 },
      now,
    })).toBe("degraded");
  });

  it("returns degraded when jitter exceeds 200ms", () => {
    expect(computeHealthStatus({
      isConnected: true,
      latencyMs: 40,
      latencyStats: { median: 40, jitter: 250, samples: 10 },
      now,
    })).toBe("degraded");
  });

  it("returns degraded when jitter exceeds 150% of median", () => {
    expect(computeHealthStatus({
      isConnected: true,
      latencyMs: 30,
      latencyStats: { median: 50, jitter: 80, samples: 10 },
      now,
    })).toBe("degraded");
  });

  it("returns healthy when jitter is moderate", () => {
    expect(computeHealthStatus({
      isConnected: true,
      latencyMs: 30,
      latencyStats: { median: 40, jitter: 50, samples: 10 },
      now,
    })).toBe("healthy");
  });

  it("returns healthy when all signals are good", () => {
    expect(computeHealthStatus({
      isConnected: true,
      isPollingPaused: false,
      lastMessageAt: now - 1000,
      latencyMs: 30,
      latencyStats: { median: 40, samples: 30 },
      connectionSuccessRate: 95,
      now,
    })).toBe("healthy");
  });

  it("returns unhealthy when connection is very stale (>30s no messages)", () => {
    expect(computeHealthStatus({
      isConnected: true,
      isPollingPaused: false,
      lastMessageAt: now - 35000,
      latencyMs: 20,
      now,
    })).toBe("unhealthy");
  });

  it("returns unhealthy when latency exceeds 5s", () => {
    expect(computeHealthStatus({
      isConnected: true,
      latencyMs: 6000,
      now,
    })).toBe("unhealthy");
  });

  it("returns unhealthy when median latency from stats exceeds 5s", () => {
    expect(computeHealthStatus({
      isConnected: true,
      latencyMs: 20,
      latencyStats: { median: 7000, samples: 10 },
      now,
    })).toBe("unhealthy");
  });
});

describe("computeHealthReasons", () => {
  const now = 1700000000000;

  it("returns empty array when healthy", () => {
    expect(computeHealthReasons({ isConnected: true, now })).toEqual([]);
  });

  it("returns 'disconnected' when not connected", () => {
    expect(computeHealthReasons({ isConnected: false, now })).toEqual(["disconnected"]);
  });

  it("reports stale connection", () => {
    const reasons = computeHealthReasons({
      isConnected: true,
      lastMessageAt: now - 15000,
      now,
    });
    expect(reasons.length).toBe(1);
    expect(reasons[0]).toMatch(/stale connection: 15s/);
  });

  it("reports extreme latency", () => {
    const reasons = computeHealthReasons({
      isConnected: true,
      latencyMs: 6000,
      now,
    });
    expect(reasons.some(r => r.includes("extreme latency"))).toBe(true);
  });

  it("reports poor latency", () => {
    const reasons = computeHealthReasons({
      isConnected: true,
      latencyMs: 600,
      now,
    });
    expect(reasons.some(r => r.includes("poor latency"))).toBe(true);
  });

  it("reports high jitter", () => {
    const reasons = computeHealthReasons({
      isConnected: true,
      latencyMs: 50,
      latencyStats: { median: 50, jitter: 250, samples: 10 },
      now,
    });
    expect(reasons.some(r => r.includes("high jitter"))).toBe(true);
  });

  it("reports low success rate", () => {
    const reasons = computeHealthReasons({
      isConnected: true,
      connectionSuccessRate: 60,
      now,
    });
    expect(reasons.some(r => r.includes("low success rate: 60%"))).toBe(true);
  });

  it("distinguishes severely stale (>30s) from mildly stale (>10s)", () => {
    const severe = computeHealthReasons({
      isConnected: true,
      lastMessageAt: now - 35000,
      now,
    });
    expect(severe[0]).toMatch(/stale connection: 35s \(dead\)/);

    const mild = computeHealthReasons({
      isConnected: true,
      lastMessageAt: now - 15000,
      now,
    });
    expect(mild[0]).toMatch(/stale connection: 15s$/);
    expect(mild[0]).not.toContain('dead');
  });

  it("collects multiple reasons", () => {
    const reasons = computeHealthReasons({
      isConnected: true,
      lastMessageAt: now - 35000,
      latencyMs: 600,
      connectionSuccessRate: 50,
      now,
    });
    expect(reasons.length).toBeGreaterThanOrEqual(2);
  });
});

describe("isRecoverableCloseCode", () => {
  it("returns true for null/undefined (abnormal drop)", () => {
    expect(isRecoverableCloseCode(null)).toBe(true);
    expect(isRecoverableCloseCode(undefined)).toBe(true);
  });

  it("returns true for transient codes", () => {
    for (const code of [1000, 1001, 1006, 1012, 1013, 4000, 4002, 4005, 4006, 4008, 4009, 4010, 4011]) {
      expect(isRecoverableCloseCode(code)).toBe(true);
    }
  });

  it("returns false for fatal codes", () => {
    for (const code of [1002, 1003, 1008, 4001, 4003, 4004, 4007, 4012, 4013, 4014]) {
      expect(isRecoverableCloseCode(code)).toBe(false);
    }
  });
});

describe("RECOVERABLE_CLOSE_CODES", () => {
  it("is a non-empty Set containing all recoverable codes", () => {
    expect(RECOVERABLE_CLOSE_CODES).toBeInstanceOf(Set);
    expect(RECOVERABLE_CLOSE_CODES.size).toBeGreaterThan(0);
    for (const code of [1000, 1001, 1006, 1012, 1013, 4000, 4002, 4005, 4006, 4008, 4009, 4010, 4011]) {
      expect(RECOVERABLE_CLOSE_CODES.has(code)).toBe(true);
    }
  });

  it("does not contain fatal codes", () => {
    for (const code of [1002, 1003, 1008, 4001, 4003, 4004, 4007, 4012, 4013, 4014]) {
      expect(RECOVERABLE_CLOSE_CODES.has(code)).toBe(false);
    }
  });

  it("is consistent with isRecoverableCloseCode", () => {
    for (const code of RECOVERABLE_CLOSE_CODES) {
      expect(isRecoverableCloseCode(code)).toBe(true);
    }
  });
});

describe("connectionUptimePercent", () => {
  const base = {
    processUptimeS: 100,
    firstConnectedAt: 1000,
    connectedSince: 50000,
    lastDisconnectedAt: null,
    now: 101000,
  };

  it("returns 100% when connected the entire time since first connect", () => {
    expect(connectionUptimePercent(base)).toBe(100);
  });

  it("returns null when processUptimeS is 0 or negative", () => {
    expect(connectionUptimePercent({ ...base, processUptimeS: 0 })).toBeNull();
    expect(connectionUptimePercent({ ...base, processUptimeS: -1 })).toBeNull();
  });

  it("returns null when firstConnectedAt is null or 0", () => {
    expect(connectionUptimePercent({ ...base, firstConnectedAt: null })).toBeNull();
    expect(connectionUptimePercent({ ...base, firstConnectedAt: 0 })).toBeNull();
  });

  it("returns null when now is not finite", () => {
    expect(connectionUptimePercent({ ...base, now: NaN })).toBeNull();
    expect(connectionUptimePercent({ ...base, now: Infinity })).toBeNull();
  });

  it("accounts for current disconnect gap", () => {
    // Disconnected 20s ago out of 100s process uptime, first connected at t=1000
    const result = connectionUptimePercent({
      processUptimeS: 100,
      firstConnectedAt: 1000,
      connectedSince: null,
      lastDisconnectedAt: 81000,
      now: 101000,
    });
    // timeSinceFirstConnect = 100000, gap = 20000, connected = 80000, pct = 80%
    expect(result).toBe(80);
  });

  it("caps at 100% even if firstConnectedAt is before process start", () => {
    const result = connectionUptimePercent({
      processUptimeS: 10,
      firstConnectedAt: 1000,
      connectedSince: 1000,
      lastDisconnectedAt: null,
      now: 1000000,
    });
    expect(result).toBe(100);
  });
});

describe("VALID_MODES and isValidMode re-exports", () => {
  it("VALID_MODES contains all MODE_EMOJI keys", () => {
    const emojiKeys = Object.keys(MODE_EMOJI);
    expect(VALID_MODES).toEqual(emojiKeys);
  });

  it("isValidMode returns true for known modes", () => {
    for (const mode of VALID_MODES) {
      expect(isValidMode(mode)).toBe(true);
    }
  });

  it("isValidMode returns false for unknown strings and non-strings", () => {
    expect(isValidMode("banana")).toBe(false);
    expect(isValidMode("")).toBe(false);
    expect(isValidMode(null)).toBe(false);
    expect(isValidMode(42)).toBe(false);
    expect(isValidMode(undefined)).toBe(false);
  });
});

describe("computeConnectionSuccessRate", () => {
  it("returns percentage for valid inputs", () => {
    expect(computeConnectionSuccessRate(5, 10)).toBe(50);
    expect(computeConnectionSuccessRate(10, 10)).toBe(100);
    expect(computeConnectionSuccessRate(1, 3)).toBe(33);
  });

  it("returns null when attempts is 0 or negative", () => {
    expect(computeConnectionSuccessRate(0, 0)).toBeNull();
    expect(computeConnectionSuccessRate(5, -1)).toBeNull();
  });

  it("returns null for non-number inputs", () => {
    expect(computeConnectionSuccessRate(null, 10)).toBeNull();
    expect(computeConnectionSuccessRate(5, null)).toBeNull();
    expect(computeConnectionSuccessRate("5", "10")).toBeNull();
  });

  it("returns null for NaN/Infinity", () => {
    expect(computeConnectionSuccessRate(NaN, 10)).toBeNull();
    expect(computeConnectionSuccessRate(5, Infinity)).toBeNull();
  });

  it("clamps connects to [0, attempts]", () => {
    expect(computeConnectionSuccessRate(-1, 10)).toBe(0);
    expect(computeConnectionSuccessRate(15, 10)).toBe(100);
  });

  it("returns 0 when connects is 0", () => {
    expect(computeConnectionSuccessRate(0, 10)).toBe(0);
  });
});

describe("isSleepingMode", () => {
  it("returns true when idle and past threshold", () => {
    expect(isSleepingMode("idle", 130000, 120000)).toBe(true);
  });

  it("returns false when idle but under threshold", () => {
    expect(isSleepingMode("idle", 60000, 120000)).toBe(false);
  });

  it("returns false at exact threshold (not exceeded)", () => {
    expect(isSleepingMode("idle", 120000, 120000)).toBe(false);
  });

  it("returns false for non-idle modes regardless of duration", () => {
    expect(isSleepingMode("thinking", 999999, 120000)).toBe(false);
    expect(isSleepingMode("tool", 999999, 120000)).toBe(false);
    expect(isSleepingMode("error", 999999, 120000)).toBe(false);
  });
});

describe("formatProtocolRange (re-exported from format-latency.cjs)", () => {
  const { formatProtocolRange } = require("../src/utils.js");

  it("returns single version when min === max", () => {
    expect(formatProtocolRange(2, 2)).toBe("v2");
  });

  it("returns range when min !== max", () => {
    expect(formatProtocolRange(2, 3)).toBe("v2–v3");
  });
});

describe("formatOpacity (re-exported from opacity-presets.cjs)", () => {
  const { formatOpacity } = require("../src/utils.js");

  it("formats numeric opacity as percentage string", () => {
    expect(formatOpacity(1)).toBe("100%");
    expect(formatOpacity(0.8)).toBe("80%");
    expect(formatOpacity(0.6)).toBe("60%");
    expect(formatOpacity(0.4)).toBe("40%");
    expect(formatOpacity(0.2)).toBe("20%");
    expect(formatOpacity(0)).toBe("0%");
  });

  it("returns '100%' for non-finite / non-number inputs", () => {
    expect(formatOpacity(NaN)).toBe("100%");
    expect(formatOpacity(Infinity)).toBe("100%");
    expect(formatOpacity(null)).toBe("100%");
    expect(formatOpacity(undefined)).toBe("100%");
    expect(formatOpacity("0.5")).toBe("100%");
  });

  it("rounds fractional percentages", () => {
    expect(formatOpacity(0.333)).toBe("33%");
    expect(formatOpacity(0.666)).toBe("67%");
    expect(formatOpacity(0.005)).toBe("1%");
  });
});

describe("isFalsyEnv (re-exported from is-truthy-env.cjs)", () => {
  const { isFalsyEnv } = require("../src/utils.js");

  it("returns true for falsy env strings", () => {
    expect(isFalsyEnv("0")).toBe(true);
    expect(isFalsyEnv("false")).toBe(true);
    expect(isFalsyEnv("no")).toBe(true);
    expect(isFalsyEnv("off")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isFalsyEnv("")).toBe(false);
  });

  it("returns false for truthy env strings", () => {
    expect(isFalsyEnv("1")).toBe(false);
    expect(isFalsyEnv("true")).toBe(false);
    expect(isFalsyEnv("yes")).toBe(false);
  });

  it("returns false for undefined/null", () => {
    expect(isFalsyEnv(undefined)).toBe(false);
    expect(isFalsyEnv(null)).toBe(false);
  });
});

describe("parseBooleanEnv (re-exported from is-truthy-env.cjs)", () => {
  const { parseBooleanEnv } = require("../src/utils.js");

  it("returns true for truthy strings", () => {
    expect(parseBooleanEnv("1")).toBe(true);
    expect(parseBooleanEnv("true")).toBe(true);
    expect(parseBooleanEnv("yes")).toBe(true);
  });

  it("returns false for falsy strings", () => {
    expect(parseBooleanEnv("0")).toBe(false);
    expect(parseBooleanEnv("false")).toBe(false);
    expect(parseBooleanEnv("no")).toBe(false);
  });

  it("returns undefined for ambiguous/missing values", () => {
    expect(parseBooleanEnv(undefined)).toBe(undefined);
    expect(parseBooleanEnv("maybe")).toBe(undefined);
  });
});

describe("MODE_DESCRIPTIONS (re-exported from mode-emoji.cjs)", () => {
  const { MODE_DESCRIPTIONS, VALID_MODES } = require("../src/utils.js");

  it("has a description for every valid mode", () => {
    for (const mode of VALID_MODES) {
      expect(typeof MODE_DESCRIPTIONS[mode]).toBe("string");
      expect(MODE_DESCRIPTIONS[mode].length).toBeGreaterThan(0);
    }
  });

  it("is frozen", () => {
    expect(Object.isFrozen(MODE_DESCRIPTIONS)).toBe(true);
  });
});
