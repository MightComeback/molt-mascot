import { describe, it, expect } from "bun:test";
import {
  formatLatency,
  connectionQuality,
  connectionQualityEmoji,
  resolveQualitySource,
  formatQualitySummary,
  formatLatencyWithQuality,
  QUALITY_THRESHOLDS,
  HEALTH_THRESHOLDS,
  VALID_HEALTH_STATUSES,
  isValidHealth,
  VALID_LATENCY_TRENDS,
  isValidLatencyTrend,
  healthStatusEmoji,
  computeHealthReasons,
  computeHealthStatus,
  formatHealthSummary,
  formatActiveSummary,
  formatProtocolRange,
  computeConnectionSuccessRate,
  connectionUptimePercent,
  formatLatencyTrendArrow,
  formatReconnectCount,
  formatConnectionReliability,
  VALID_CONNECTION_QUALITIES,
  isValidConnectionQuality,
  formatProcessUptime,
  formatToolThroughput,
} from "../src/format-latency.cjs";

describe("formatLatency (canonical source)", () => {
  it('sub-millisecond returns "< 1ms"', () => {
    expect(formatLatency(0)).toBe("< 1ms");
    expect(formatLatency(0.1)).toBe("< 1ms");
    expect(formatLatency(0.999)).toBe("< 1ms");
  });

  it('millisecond range returns rounded "Xms"', () => {
    expect(formatLatency(1)).toBe("1ms");
    expect(formatLatency(42)).toBe("42ms");
    expect(formatLatency(999)).toBe("999ms");
  });

  it("fractional milliseconds are rounded", () => {
    expect(formatLatency(1.4)).toBe("1ms");
    expect(formatLatency(1.6)).toBe("2ms");
    expect(formatLatency(3.7)).toBe("4ms");
    expect(formatLatency(0.4)).toBe("< 1ms");
  });

  it('seconds range returns "X.Ys"', () => {
    expect(formatLatency(1000)).toBe("1.0s");
    expect(formatLatency(1200)).toBe("1.2s");
    expect(formatLatency(5432)).toBe("5.4s");
    expect(formatLatency(10000)).toBe("10.0s");
  });

  it("boundary at 1000ms uses seconds format", () => {
    expect(formatLatency(999)).toBe("999ms");
    expect(formatLatency(1000)).toBe("1.0s");
  });

  it("negative values return dash", () => {
    expect(formatLatency(-1)).toBe("–");
    expect(formatLatency(-100)).toBe("–");
  });

  it("NaN and Infinity return dash", () => {
    expect(formatLatency(NaN)).toBe("–");
    expect(formatLatency(Infinity)).toBe("–");
    expect(formatLatency(-Infinity)).toBe("–");
  });

  it("non-number types return dash", () => {
    expect(formatLatency(null)).toBe("–");
    expect(formatLatency(undefined)).toBe("–");
    expect(formatLatency("42")).toBe("–");
    expect(formatLatency(true)).toBe("–");
    expect(formatLatency({})).toBe("–");
  });
});

describe("connectionQuality", () => {
  it('returns "excellent" for < 50ms', () => {
    expect(connectionQuality(0)).toBe("excellent");
    expect(connectionQuality(10)).toBe("excellent");
    expect(connectionQuality(49)).toBe("excellent");
    expect(connectionQuality(49.9)).toBe("excellent");
  });

  it('returns "good" for 50–149ms', () => {
    expect(connectionQuality(50)).toBe("good");
    expect(connectionQuality(100)).toBe("good");
    expect(connectionQuality(149)).toBe("good");
  });

  it('returns "fair" for 150–499ms', () => {
    expect(connectionQuality(150)).toBe("fair");
    expect(connectionQuality(300)).toBe("fair");
    expect(connectionQuality(499)).toBe("fair");
  });

  it('returns "poor" for >= 500ms', () => {
    expect(connectionQuality(500)).toBe("poor");
    expect(connectionQuality(1000)).toBe("poor");
    expect(connectionQuality(9999)).toBe("poor");
  });

  it("returns null for invalid inputs", () => {
    expect(connectionQuality(-1)).toBeNull();
    expect(connectionQuality(NaN)).toBeNull();
    expect(connectionQuality(Infinity)).toBeNull();
    expect(connectionQuality(null)).toBeNull();
    expect(connectionQuality(undefined)).toBeNull();
    expect(connectionQuality("42")).toBeNull();
  });
});

describe("resolveQualitySource", () => {
  it("prefers median from stats when >1 sample", () => {
    expect(resolveQualitySource(400, { median: 30, samples: 10 })).toBe(30);
  });

  it("falls back to instant when stats have 1 sample", () => {
    expect(resolveQualitySource(200, { median: 200, samples: 1 })).toBe(200);
  });

  it("falls back to instant when stats is null", () => {
    expect(resolveQualitySource(42, null)).toBe(42);
  });

  it("falls back to instant when stats is undefined", () => {
    expect(resolveQualitySource(42, undefined)).toBe(42);
  });

  it("falls back to instant when stats lacks median", () => {
    expect(resolveQualitySource(100, { samples: 5 })).toBe(100);
  });

  it("falls back to instant when stats lacks samples", () => {
    expect(resolveQualitySource(100, { median: 50 })).toBe(100);
  });

  it("returns null when both are unavailable", () => {
    expect(resolveQualitySource(null, null)).toBeNull();
    expect(resolveQualitySource(undefined, undefined)).toBeNull();
  });

  it("returns null for negative instant without valid stats", () => {
    expect(resolveQualitySource(-1, null)).toBeNull();
  });

  it("handles instant of 0 (valid)", () => {
    expect(resolveQualitySource(0, null)).toBe(0);
  });
});

describe("VALID_CONNECTION_QUALITIES", () => {
  it("exports a frozen array of quality strings", () => {
    expect(VALID_CONNECTION_QUALITIES).toBeDefined();
    expect(Object.isFrozen(VALID_CONNECTION_QUALITIES)).toBe(true);
    expect(Array.isArray(VALID_CONNECTION_QUALITIES)).toBe(true);
  });

  it("contains expected quality levels", () => {
    expect(VALID_CONNECTION_QUALITIES).toContain("excellent");
    expect(VALID_CONNECTION_QUALITIES).toContain("good");
    expect(VALID_CONNECTION_QUALITIES).toContain("fair");
    expect(VALID_CONNECTION_QUALITIES).toContain("poor");
  });

  it("all entries are non-empty strings", () => {
    for (const q of VALID_CONNECTION_QUALITIES) {
      expect(typeof q).toBe("string");
      expect(q.length).toBeGreaterThan(0);
    }
  });
});

describe("isValidConnectionQuality", () => {
  it("accepts all VALID_CONNECTION_QUALITIES entries", () => {
    for (const q of VALID_CONNECTION_QUALITIES) {
      expect(isValidConnectionQuality(q)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    expect(isValidConnectionQuality("amazing")).toBe(false);
    expect(isValidConnectionQuality("")).toBe(false);
    expect(isValidConnectionQuality("EXCELLENT")).toBe(false);
  });

  it("rejects non-string types", () => {
    expect(isValidConnectionQuality(null)).toBe(false);
    expect(isValidConnectionQuality(undefined)).toBe(false);
    expect(isValidConnectionQuality(42)).toBe(false);
    expect(isValidConnectionQuality(true)).toBe(false);
    expect(isValidConnectionQuality({})).toBe(false);
    expect(isValidConnectionQuality([])).toBe(false);
  });
});

describe("QUALITY_THRESHOLDS", () => {
  it("exports frozen threshold constants", () => {
    expect(QUALITY_THRESHOLDS).toBeDefined();
    expect(Object.isFrozen(QUALITY_THRESHOLDS)).toBe(true);
  });

  it("has expected threshold values", () => {
    expect(QUALITY_THRESHOLDS.EXCELLENT_MAX_MS).toBe(50);
    expect(QUALITY_THRESHOLDS.GOOD_MAX_MS).toBe(150);
    expect(QUALITY_THRESHOLDS.FAIR_MAX_MS).toBe(500);
  });

  it("connectionQuality transitions align with thresholds", () => {
    const { EXCELLENT_MAX_MS, GOOD_MAX_MS, FAIR_MAX_MS } = QUALITY_THRESHOLDS;
    // Just below each threshold
    expect(connectionQuality(EXCELLENT_MAX_MS - 1)).toBe("excellent");
    expect(connectionQuality(GOOD_MAX_MS - 1)).toBe("good");
    expect(connectionQuality(FAIR_MAX_MS - 1)).toBe("fair");
    // At each threshold
    expect(connectionQuality(EXCELLENT_MAX_MS)).toBe("good");
    expect(connectionQuality(GOOD_MAX_MS)).toBe("fair");
    expect(connectionQuality(FAIR_MAX_MS)).toBe("poor");
  });
});

describe("HEALTH_THRESHOLDS", () => {
  it("exports frozen threshold constants", () => {
    expect(HEALTH_THRESHOLDS).toBeDefined();
    expect(Object.isFrozen(HEALTH_THRESHOLDS)).toBe(true);
  });

  it("has expected threshold values", () => {
    expect(HEALTH_THRESHOLDS.STALE_UNHEALTHY_MS).toBe(30000);
    expect(HEALTH_THRESHOLDS.STALE_DEGRADED_MS).toBe(10000);
    expect(HEALTH_THRESHOLDS.LATENCY_UNHEALTHY_MS).toBe(5000);
    expect(HEALTH_THRESHOLDS.JITTER_DEGRADED_MS).toBe(200);
    expect(HEALTH_THRESHOLDS.JITTER_MEDIAN_RATIO).toBe(1.5);
    expect(HEALTH_THRESHOLDS.SUCCESS_RATE_MIN_PCT).toBe(80);
  });

  it("stale thresholds are ordered (degraded < unhealthy)", () => {
    expect(HEALTH_THRESHOLDS.STALE_DEGRADED_MS).toBeLessThan(
      HEALTH_THRESHOLDS.STALE_UNHEALTHY_MS,
    );
  });

  it("computeHealthStatus transitions align with thresholds", () => {
    const NOW = 100000;
    // Stale at exactly degraded threshold → healthy (threshold check is >)
    expect(
      computeHealthStatus({
        isConnected: true,
        lastMessageAt: NOW - HEALTH_THRESHOLDS.STALE_DEGRADED_MS,
        now: NOW,
      }),
    ).toBe("healthy");
    // Stale above degraded threshold → degraded
    expect(
      computeHealthStatus({
        isConnected: true,
        lastMessageAt: NOW - HEALTH_THRESHOLDS.STALE_DEGRADED_MS - 1,
        now: NOW,
      }),
    ).toBe("degraded");
    // Stale above unhealthy threshold → unhealthy
    expect(
      computeHealthStatus({
        isConnected: true,
        lastMessageAt: NOW - HEALTH_THRESHOLDS.STALE_UNHEALTHY_MS - 1,
        now: NOW,
      }),
    ).toBe("unhealthy");
    // Latency above unhealthy threshold → unhealthy
    expect(
      computeHealthStatus({
        isConnected: true,
        latencyMs: HEALTH_THRESHOLDS.LATENCY_UNHEALTHY_MS + 1,
        now: NOW,
      }),
    ).toBe("unhealthy");
    // Latency below unhealthy but above "poor" quality threshold → degraded
    expect(
      computeHealthStatus({
        isConnected: true,
        latencyMs: HEALTH_THRESHOLDS.LATENCY_UNHEALTHY_MS - 1,
        now: NOW,
      }),
    ).toBe("degraded");
    // Latency within "fair" quality range → healthy
    expect(
      computeHealthStatus({
        isConnected: true,
        latencyMs: QUALITY_THRESHOLDS.FAIR_MAX_MS - 1,
        now: NOW,
      }),
    ).toBe("healthy");
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
    expect(connectionQualityEmoji("")).toBe("⚪");
  });
});

describe("formatQualitySummary", () => {
  it("returns formatted latency with quality emoji by default", () => {
    const result = formatQualitySummary(25, null);
    expect(result.text).toBe("25ms 🟢");
    expect(result.quality).toBe("excellent");
    expect(result.emoji).toBe("🟢");
  });

  it("uses quality label instead of emoji when emoji=false", () => {
    const result = formatQualitySummary(25, null, { emoji: false });
    expect(result.text).toBe("25ms [excellent]");
  });

  it("prefers median from stats for quality assessment", () => {
    const result = formatQualitySummary(400, { median: 30, samples: 10 });
    expect(result.quality).toBe("excellent");
    expect(result.text).toContain("400ms");
    expect(result.text).toContain("🟢");
  });

  it("appends jitter when exceeding threshold", () => {
    const stats = { median: 40, samples: 10, jitter: 30 };
    const result = formatQualitySummary(42, stats);
    expect(result.text).toContain("jitter 30ms");
  });

  it("omits jitter when below threshold", () => {
    const stats = { median: 40, samples: 10, jitter: 10 };
    const result = formatQualitySummary(42, stats);
    expect(result.text).not.toContain("jitter");
  });

  it("supports custom jitter threshold", () => {
    const stats = { median: 100, samples: 10, jitter: 30 };
    // Default 0.5 threshold: 30 < 100*0.5=50, no jitter shown
    expect(formatQualitySummary(100, stats).text).not.toContain("jitter");
    // Custom 0.2 threshold: 30 > 100*0.2=20, jitter shown
    expect(
      formatQualitySummary(100, stats, { jitterThreshold: 0.2 }).text,
    ).toContain("jitter");
  });

  it("handles invalid latency gracefully", () => {
    const result = formatQualitySummary(-1, null);
    expect(result.text).toBe("–");
    expect(result.quality).toBeNull();
  });

  it("handles null stats gracefully", () => {
    const result = formatQualitySummary(200, null);
    expect(result.quality).toBe("fair");
  });
});

describe("VALID_HEALTH_STATUSES", () => {
  it("contains all three health statuses", () => {
    expect(VALID_HEALTH_STATUSES).toEqual(["healthy", "degraded", "unhealthy"]);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(VALID_HEALTH_STATUSES)).toBe(true);
  });
});

describe("isValidHealth", () => {
  it("accepts valid health statuses", () => {
    expect(isValidHealth("healthy")).toBe(true);
    expect(isValidHealth("degraded")).toBe(true);
    expect(isValidHealth("unhealthy")).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isValidHealth("unknown")).toBe(false);
    expect(isValidHealth("Healthy")).toBe(false);
    expect(isValidHealth("")).toBe(false);
    expect(isValidHealth(null)).toBe(false);
    expect(isValidHealth(undefined)).toBe(false);
    expect(isValidHealth(42)).toBe(false);
  });
});

describe("healthStatusEmoji", () => {
  it("maps health statuses to emojis", () => {
    expect(healthStatusEmoji("healthy")).toBe("🟢");
    expect(healthStatusEmoji("degraded")).toBe("⚠️");
    expect(healthStatusEmoji("unhealthy")).toBe("🔴");
  });

  it("returns grey circle for null/unknown values", () => {
    expect(healthStatusEmoji(null)).toBe("⚪");
    expect(healthStatusEmoji(undefined)).toBe("⚪");
    expect(healthStatusEmoji("unknown")).toBe("⚪");
    expect(healthStatusEmoji("")).toBe("⚪");
  });
});

describe("computeHealthReasons", () => {
  it('returns ["disconnected"] when not connected', () => {
    expect(computeHealthReasons({ isConnected: false })).toEqual([
      "disconnected",
    ]);
  });

  it("returns empty array for healthy connection", () => {
    expect(computeHealthReasons({ isConnected: true, latencyMs: 20 })).toEqual(
      [],
    );
  });

  it("detects stale connection (>10s)", () => {
    const now = Date.now();
    const reasons = computeHealthReasons({
      isConnected: true,
      lastMessageAt: now - 15000,
      now,
    });
    expect(reasons.length).toBe(1);
    expect(reasons[0]).toContain("stale connection");
    expect(reasons[0]).not.toContain("dead");
  });

  it("detects severely stale (dead) connection (>30s)", () => {
    const now = Date.now();
    const reasons = computeHealthReasons({
      isConnected: true,
      lastMessageAt: now - 45000,
      now,
    });
    expect(reasons[0]).toContain("dead");
  });

  it("skips staleness check when polling is paused", () => {
    const now = Date.now();
    const reasons = computeHealthReasons({
      isConnected: true,
      isPollingPaused: true,
      lastMessageAt: now - 60000,
      now,
    });
    expect(reasons.filter((r) => r.includes("stale"))).toEqual([]);
  });

  it("detects poor latency", () => {
    const reasons = computeHealthReasons({ isConnected: true, latencyMs: 600 });
    expect(reasons.some((r) => r.includes("poor latency"))).toBe(true);
  });

  it("detects extreme latency (>5s)", () => {
    const reasons = computeHealthReasons({
      isConnected: true,
      latencyMs: 6000,
    });
    expect(reasons.some((r) => r.includes("extreme latency"))).toBe(true);
  });

  it("detects high absolute jitter (>200ms)", () => {
    const reasons = computeHealthReasons({
      isConnected: true,
      latencyMs: 50,
      latencyStats: { median: 50, samples: 10, jitter: 250 },
    });
    expect(reasons.some((r) => r.includes("high jitter"))).toBe(true);
  });

  it("detects high relative jitter (>150% of median)", () => {
    const reasons = computeHealthReasons({
      isConnected: true,
      latencyMs: 50,
      latencyStats: { median: 50, samples: 10, jitter: 100 },
    });
    expect(
      reasons.some(
        (r) => r.includes("high jitter") && r.includes("% of median"),
      ),
    ).toBe(true);
  });

  it("detects low connection success rate", () => {
    const reasons = computeHealthReasons({
      isConnected: true,
      connectionSuccessRate: 60,
    });
    expect(reasons.some((r) => r.includes("low success rate"))).toBe(true);
  });

  it("returns empty for default/no params", () => {
    expect(computeHealthReasons()).toEqual(["disconnected"]);
  });

  it("accumulates multiple reasons", () => {
    const now = Date.now();
    const reasons = computeHealthReasons({
      isConnected: true,
      lastMessageAt: now - 45000,
      latencyMs: 6000,
      connectionSuccessRate: 50,
      now,
    });
    expect(reasons.length).toBeGreaterThanOrEqual(3);
  });
});

describe("formatHealthSummary", () => {
  const now = 1700000000000;

  it("returns null for healthy status", () => {
    expect(formatHealthSummary("healthy", { isConnected: true, now })).toBe(
      null,
    );
  });

  it("returns null for null/undefined status", () => {
    expect(formatHealthSummary(null, { isConnected: true, now })).toBe(null);
    expect(formatHealthSummary(undefined, { isConnected: true, now })).toBe(
      null,
    );
  });

  it("returns summary for degraded status", () => {
    const result = formatHealthSummary("degraded", {
      isConnected: true,
      latencyMs: 600,
      now,
    });
    expect(result).not.toBe(null);
    expect(result.text).toContain("⚠️");
    expect(result.text).toContain("degraded");
    expect(result.text).toContain("poor latency");
    expect(result.emoji).toBe("⚠️");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("returns summary for unhealthy status", () => {
    const result = formatHealthSummary("unhealthy", {
      isConnected: false,
      now,
    });
    expect(result).not.toBe(null);
    expect(result.text).toContain("🔴");
    expect(result.text).toContain("unhealthy");
    expect(result.text).toContain("disconnected");
    expect(result.emoji).toBe("🔴");
  });

  it("returns summary with no reasons when params are minimal", () => {
    const result = formatHealthSummary("degraded", { isConnected: true, now });
    expect(result).not.toBe(null);
    expect(result.text).toBe("⚠️ degraded");
    expect(result.reasons).toEqual([]);
  });

  it("handles missing reasonParams gracefully", () => {
    const result = formatHealthSummary("unhealthy");
    expect(result).not.toBe(null);
    expect(result.text).toContain("🔴 unhealthy");
  });
});

describe("formatActiveSummary", () => {
  it("pluralizes agents and tools correctly", () => {
    expect(formatActiveSummary(1, 1)).toBe("1 agent, 1 tool");
    expect(formatActiveSummary(2, 1)).toBe("2 agents, 1 tool");
    expect(formatActiveSummary(1, 3)).toBe("1 agent, 3 tools");
    expect(formatActiveSummary(5, 5)).toBe("5 agents, 5 tools");
  });

  it("omits zero-count part for cleaner display", () => {
    expect(formatActiveSummary(2, 0)).toBe("2 agents");
    expect(formatActiveSummary(1, 0)).toBe("1 agent");
    expect(formatActiveSummary(0, 3)).toBe("3 tools");
    expect(formatActiveSummary(0, 1)).toBe("1 tool");
  });

  it("shows both when both are zero (graceful fallback)", () => {
    expect(formatActiveSummary(0, 0)).toBe("0 agents, 0 tools");
  });
});

describe("computeHealthStatus", () => {
  const NOW = 1700000000000;

  it('returns "unhealthy" when disconnected', () => {
    expect(computeHealthStatus({ isConnected: false, now: NOW })).toBe(
      "unhealthy",
    );
  });

  it('returns "healthy" for a good connected state', () => {
    expect(
      computeHealthStatus({
        isConnected: true,
        lastMessageAt: NOW - 1000,
        latencyMs: 30,
        now: NOW,
      }),
    ).toBe("healthy");
  });

  it('returns "healthy" with no optional params when connected', () => {
    expect(computeHealthStatus({ isConnected: true, now: NOW })).toBe(
      "healthy",
    );
  });

  it('returns "healthy" with default (empty) params', () => {
    // Default params: isConnected is falsy → unhealthy
    expect(computeHealthStatus()).toBe("unhealthy");
  });

  // Stale connection checks
  it('returns "degraded" for stale connection (>10s)', () => {
    expect(
      computeHealthStatus({
        isConnected: true,
        isPollingPaused: false,
        lastMessageAt: NOW - HEALTH_THRESHOLDS.STALE_DEGRADED_MS - 1,
        now: NOW,
      }),
    ).toBe("degraded");
  });

  it('returns "unhealthy" for severely stale connection (>30s)', () => {
    expect(
      computeHealthStatus({
        isConnected: true,
        isPollingPaused: false,
        lastMessageAt: NOW - HEALTH_THRESHOLDS.STALE_UNHEALTHY_MS - 1,
        now: NOW,
      }),
    ).toBe("unhealthy");
  });

  it("skips staleness check when polling is paused", () => {
    expect(
      computeHealthStatus({
        isConnected: true,
        isPollingPaused: true,
        lastMessageAt: NOW - 60000, // very stale, but polling paused
        now: NOW,
      }),
    ).toBe("healthy");
  });

  it("skips staleness check when lastMessageAt is missing", () => {
    expect(
      computeHealthStatus({
        isConnected: true,
        isPollingPaused: false,
        now: NOW,
      }),
    ).toBe("healthy");
  });

  // Latency checks
  it('returns "unhealthy" for extreme latency (>5s)', () => {
    expect(
      computeHealthStatus({
        isConnected: true,
        latencyMs: HEALTH_THRESHOLDS.LATENCY_UNHEALTHY_MS + 1,
        now: NOW,
      }),
    ).toBe("unhealthy");
  });

  it('returns "degraded" for poor latency (>=500ms)', () => {
    expect(
      computeHealthStatus({
        isConnected: true,
        latencyMs: 500,
        now: NOW,
      }),
    ).toBe("degraded");
  });

  it('returns "healthy" for good latency', () => {
    expect(
      computeHealthStatus({
        isConnected: true,
        latencyMs: 40,
        now: NOW,
      }),
    ).toBe("healthy");
  });

  it("prefers median from stats for quality assessment", () => {
    // Instant latency is fine (40ms) but median is poor (600ms)
    expect(
      computeHealthStatus({
        isConnected: true,
        latencyMs: 40,
        latencyStats: { median: 600, samples: 10 },
        now: NOW,
      }),
    ).toBe("degraded");
  });

  // Jitter checks
  it('returns "degraded" for high absolute jitter (>200ms)', () => {
    expect(
      computeHealthStatus({
        isConnected: true,
        latencyMs: 50,
        latencyStats: {
          jitter: HEALTH_THRESHOLDS.JITTER_DEGRADED_MS + 1,
          samples: 10,
          median: 50,
        },
        now: NOW,
      }),
    ).toBe("degraded");
  });

  it('returns "degraded" for high relative jitter (>150% of median)', () => {
    // jitter = 80ms, median = 50ms → ratio = 1.6 > 1.5
    expect(
      computeHealthStatus({
        isConnected: true,
        latencyMs: 50,
        latencyStats: { jitter: 80, samples: 10, median: 50 },
        now: NOW,
      }),
    ).toBe("degraded");
  });

  it('returns "healthy" when jitter is within thresholds', () => {
    expect(
      computeHealthStatus({
        isConnected: true,
        latencyMs: 50,
        latencyStats: { jitter: 30, samples: 10, median: 50 },
        now: NOW,
      }),
    ).toBe("healthy");
  });

  it("skips jitter check when samples <= 1", () => {
    expect(
      computeHealthStatus({
        isConnected: true,
        latencyMs: 50,
        latencyStats: { jitter: 500, samples: 1, median: 50 },
        now: NOW,
      }),
    ).toBe("healthy");
  });

  // Connection success rate checks
  it('returns "degraded" for low connection success rate', () => {
    expect(
      computeHealthStatus({
        isConnected: true,
        connectionSuccessRate: HEALTH_THRESHOLDS.SUCCESS_RATE_MIN_PCT - 1,
        now: NOW,
      }),
    ).toBe("degraded");
  });

  it('returns "healthy" for acceptable success rate', () => {
    expect(
      computeHealthStatus({
        isConnected: true,
        connectionSuccessRate: 80,
        now: NOW,
      }),
    ).toBe("healthy");
  });

  // Priority ordering: earlier checks take precedence
  it("stale connection takes precedence over latency", () => {
    // Both stale (unhealthy) and poor latency (degraded)
    expect(
      computeHealthStatus({
        isConnected: true,
        isPollingPaused: false,
        lastMessageAt: NOW - HEALTH_THRESHOLDS.STALE_UNHEALTHY_MS - 1,
        latencyMs: 500,
        now: NOW,
      }),
    ).toBe("unhealthy");
  });

  it("latency check takes precedence over jitter", () => {
    // Extreme latency (unhealthy via median) and high jitter (degraded)
    expect(
      computeHealthStatus({
        isConnected: true,
        latencyMs: HEALTH_THRESHOLDS.LATENCY_UNHEALTHY_MS + 1,
        latencyStats: {
          jitter: 300,
          samples: 10,
          median: HEALTH_THRESHOLDS.LATENCY_UNHEALTHY_MS + 1,
        },
        now: NOW,
      }),
    ).toBe("unhealthy");
  });
});

describe("formatProtocolRange", () => {
  it("shows single version when min equals max", () => {
    expect(formatProtocolRange(3, 3)).toBe("v3");
  });

  it("shows range when min differs from max", () => {
    expect(formatProtocolRange(2, 3)).toBe("v2–v3");
  });

  it("handles version 1", () => {
    expect(formatProtocolRange(1, 1)).toBe("v1");
    expect(formatProtocolRange(1, 3)).toBe("v1–v3");
  });

  it("auto-swaps inverted range (min > max)", () => {
    expect(formatProtocolRange(3, 2)).toBe("v2–v3");
    expect(formatProtocolRange(5, 1)).toBe("v1–v5");
  });

  it("floors fractional versions", () => {
    expect(formatProtocolRange(2.7, 3.9)).toBe("v2–v3");
    expect(formatProtocolRange(2.5, 2.5)).toBe("v2");
  });

  it("returns v? for non-numeric inputs", () => {
    expect(formatProtocolRange(null, null)).toBe("v?");
    expect(formatProtocolRange(undefined, undefined)).toBe("v?");
    expect(formatProtocolRange("abc", "def")).toBe("v?");
  });

  it("handles one valid and one invalid input", () => {
    expect(formatProtocolRange(2, null)).toBe("v2");
    expect(formatProtocolRange(null, 3)).toBe("v3");
    expect(formatProtocolRange(undefined, 5)).toBe("v5");
  });

  it("handles Infinity and NaN", () => {
    expect(formatProtocolRange(Infinity, 3)).toBe("v3");
    expect(formatProtocolRange(2, NaN)).toBe("v2");
    expect(formatProtocolRange(NaN, NaN)).toBe("v?");
  });
});

describe("computeConnectionSuccessRate", () => {
  it("computes correct percentage", () => {
    expect(computeConnectionSuccessRate(5, 10)).toBe(50);
    expect(computeConnectionSuccessRate(10, 10)).toBe(100);
    expect(computeConnectionSuccessRate(1, 3)).toBe(33);
  });

  it("returns null for zero or negative attempts", () => {
    expect(computeConnectionSuccessRate(0, 0)).toBeNull();
    expect(computeConnectionSuccessRate(5, -1)).toBeNull();
  });

  it("returns null for non-numeric inputs", () => {
    expect(computeConnectionSuccessRate(null, 10)).toBeNull();
    expect(computeConnectionSuccessRate(5, null)).toBeNull();
    expect(computeConnectionSuccessRate("5", "10")).toBeNull();
  });

  it("returns null for NaN and Infinity", () => {
    expect(computeConnectionSuccessRate(NaN, 10)).toBeNull();
    expect(computeConnectionSuccessRate(5, Infinity)).toBeNull();
  });

  it("clamps connects to [0, attempts]", () => {
    expect(computeConnectionSuccessRate(-1, 10)).toBe(0);
    expect(computeConnectionSuccessRate(15, 10)).toBe(100);
  });

  it("handles zero connects", () => {
    expect(computeConnectionSuccessRate(0, 10)).toBe(0);
  });
});

describe("connectionUptimePercent", () => {
  const base = {
    processUptimeS: 100,
    firstConnectedAt: 1000,
    connectedSince: 1000,
    lastDisconnectedAt: null,
    now: 101000, // 100s after start
  };

  it("returns ~100% when connected the whole time", () => {
    expect(connectionUptimePercent(base)).toBe(100);
  });

  it("returns null when processUptimeS is 0 or negative", () => {
    expect(connectionUptimePercent({ ...base, processUptimeS: 0 })).toBeNull();
    expect(connectionUptimePercent({ ...base, processUptimeS: -1 })).toBeNull();
  });

  it("returns null when firstConnectedAt is missing", () => {
    expect(
      connectionUptimePercent({ ...base, firstConnectedAt: null }),
    ).toBeNull();
    expect(
      connectionUptimePercent({ ...base, firstConnectedAt: 0 }),
    ).toBeNull();
  });

  it("returns null when now is not finite", () => {
    expect(connectionUptimePercent({ ...base, now: NaN })).toBeNull();
    expect(connectionUptimePercent({ ...base, now: Infinity })).toBeNull();
  });

  it("returns null when firstConnectedAt is in the future (clock skew)", () => {
    expect(
      connectionUptimePercent({
        ...base,
        firstConnectedAt: 200000,
        now: 101000,
      }),
    ).toBeNull();
  });

  it("accounts for disconnect gap when currently disconnected", () => {
    const pct = connectionUptimePercent({
      processUptimeS: 100,
      firstConnectedAt: 1000,
      connectedSince: null, // disconnected
      lastDisconnectedAt: 51000, // disconnected 50s ago
      now: 101000,
    });
    // Connected from 1000→51000 (50s), disconnected 50s. ~50% of 100s uptime.
    expect(pct).toBe(50);
  });

  it("caps at 100%", () => {
    // firstConnectedAt far before processUptimeS would suggest
    expect(
      connectionUptimePercent({
        processUptimeS: 10,
        firstConnectedAt: 1000,
        connectedSince: 1000,
        lastDisconnectedAt: null,
        now: 101000,
      }),
    ).toBe(100);
  });
});

describe("VALID_LATENCY_TRENDS", () => {
  it("contains exactly the three trend directions", () => {
    expect(VALID_LATENCY_TRENDS).toEqual(["rising", "falling", "stable"]);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(VALID_LATENCY_TRENDS)).toBe(true);
  });
});

describe("isValidLatencyTrend", () => {
  it("accepts valid trends", () => {
    expect(isValidLatencyTrend("rising")).toBe(true);
    expect(isValidLatencyTrend("falling")).toBe(true);
    expect(isValidLatencyTrend("stable")).toBe(true);
  });

  it("rejects invalid strings", () => {
    expect(isValidLatencyTrend("unknown")).toBe(false);
    expect(isValidLatencyTrend("RISING")).toBe(false);
    expect(isValidLatencyTrend("")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isValidLatencyTrend(null)).toBe(false);
    expect(isValidLatencyTrend(undefined)).toBe(false);
    expect(isValidLatencyTrend(42)).toBe(false);
    expect(isValidLatencyTrend(true)).toBe(false);
  });
});

describe("formatLatencyTrendArrow", () => {
  it('returns " ↑" for rising', () => {
    expect(formatLatencyTrendArrow("rising")).toBe(" ↑");
  });

  it('returns " ↓" for falling', () => {
    expect(formatLatencyTrendArrow("falling")).toBe(" ↓");
  });

  it('returns "" for stable', () => {
    expect(formatLatencyTrendArrow("stable")).toBe("");
  });

  it('returns "" for null/undefined/invalid', () => {
    expect(formatLatencyTrendArrow(null)).toBe("");
    expect(formatLatencyTrendArrow(undefined)).toBe("");
    expect(formatLatencyTrendArrow("unknown")).toBe("");
    expect(formatLatencyTrendArrow("")).toBe("");
    expect(formatLatencyTrendArrow(42)).toBe("");
  });
});

describe("formatLatencyWithQuality", () => {
  it("includes quality emoji for excellent latency", () => {
    expect(formatLatencyWithQuality(10)).toBe("10ms 🟢");
  });

  it("includes quality emoji for good latency", () => {
    expect(formatLatencyWithQuality(100)).toBe("100ms 🟡");
  });

  it("includes quality emoji for fair latency", () => {
    expect(formatLatencyWithQuality(300)).toBe("300ms 🟠");
  });

  it("includes quality emoji for poor latency", () => {
    expect(formatLatencyWithQuality(600)).toBe("600ms 🔴");
  });

  it("prefers median from stats when available", () => {
    // instant=300 (fair), but median=40 (excellent) — should show excellent emoji
    expect(formatLatencyWithQuality(300, { median: 40, samples: 10 })).toBe(
      "300ms 🟢",
    );
  });

  it("falls back to instant when stats have only 1 sample", () => {
    expect(formatLatencyWithQuality(300, { median: 40, samples: 1 })).toBe(
      "300ms 🟠",
    );
  });

  it("returns just latency for invalid input", () => {
    expect(formatLatencyWithQuality(-1)).toBe("–");
    expect(formatLatencyWithQuality(NaN)).toBe("–");
  });

  it("works without stats parameter", () => {
    expect(formatLatencyWithQuality(42)).toBe("42ms 🟢");
    expect(formatLatencyWithQuality(42, null)).toBe("42ms 🟢");
    expect(formatLatencyWithQuality(42, undefined)).toBe("42ms 🟢");
  });
});

describe("formatReconnectCount", () => {
  it('returns "↻N" for sessionConnectCount > 1', () => {
    expect(formatReconnectCount(2)).toBe("↻1");
    expect(formatReconnectCount(5)).toBe("↻4");
    expect(formatReconnectCount(100)).toBe("↻99");
  });

  it("returns empty string when no reconnections", () => {
    expect(formatReconnectCount(0)).toBe("");
    expect(formatReconnectCount(1)).toBe("");
  });

  it("returns empty string for null/undefined/non-number", () => {
    expect(formatReconnectCount(null)).toBe("");
    expect(formatReconnectCount(undefined)).toBe("");
    expect(formatReconnectCount("3")).toBe("");
    expect(formatReconnectCount(NaN)).toBe("");
    expect(formatReconnectCount(Infinity)).toBe("");
  });

  it("returns empty string for negative values", () => {
    expect(formatReconnectCount(-1)).toBe("");
  });
});

describe("formatPingSummary", () => {
  const { formatPingSummary } = require("../src/format-latency.cjs");

  it("returns null for empty array", () => {
    expect(formatPingSummary([])).toBeNull();
  });

  it("returns null for non-array", () => {
    expect(formatPingSummary(null)).toBeNull();
    expect(formatPingSummary(undefined)).toBeNull();
    expect(formatPingSummary("hello")).toBeNull();
    expect(formatPingSummary(42)).toBeNull();
  });

  it("returns null when all samples are invalid", () => {
    expect(formatPingSummary([NaN, Infinity, -1])).toBeNull();
  });

  it("computes correct stats for a single sample", () => {
    const result = formatPingSummary([42]);
    expect(result).not.toBeNull();
    expect(result.stats.count).toBe(1);
    expect(result.stats.min).toBe(42);
    expect(result.stats.max).toBe(42);
    expect(result.stats.avg).toBe(42);
    expect(result.stats.median).toBe(42);
    expect(result.stats.jitter).toBe(0);
  });

  it("computes correct stats for multiple samples", () => {
    const result = formatPingSummary([10, 20, 30, 40, 50]);
    expect(result).not.toBeNull();
    expect(result.stats.count).toBe(5);
    expect(result.stats.min).toBe(10);
    expect(result.stats.max).toBe(50);
    expect(result.stats.avg).toBe(30);
    expect(result.stats.median).toBe(30);
    expect(result.stats.jitter).toBeGreaterThan(0);
  });

  it("computes correct median for even-length samples", () => {
    const result = formatPingSummary([10, 20, 30, 40]);
    expect(result).not.toBeNull();
    expect(result.stats.median).toBe(25);
  });

  it("filters out invalid samples", () => {
    const result = formatPingSummary([10, NaN, 20, -5, Infinity, 30]);
    expect(result).not.toBeNull();
    expect(result.stats.count).toBe(3);
    expect(result.stats.min).toBe(10);
    expect(result.stats.max).toBe(30);
  });

  it("produces human-readable text by default", () => {
    const result = formatPingSummary([10, 20, 30]);
    expect(result.text).toContain("--- ping statistics ---");
    expect(result.text).toContain("3 pings");
    expect(result.text).toContain("min=10ms");
    expect(result.text).toContain("max=30ms");
  });

  it("produces compact JSON text when compact=true", () => {
    const result = formatPingSummary([10, 20, 30], { compact: true });
    const parsed = JSON.parse(result.text);
    expect(parsed.count).toBe(3);
    expect(parsed.min).toBe(10);
    expect(parsed.max).toBe(30);
  });

  it("handles zero-value samples correctly", () => {
    const result = formatPingSummary([0, 0, 0]);
    expect(result).not.toBeNull();
    expect(result.stats.min).toBe(0);
    expect(result.stats.max).toBe(0);
    expect(result.stats.avg).toBe(0);
    expect(result.stats.jitter).toBe(0);
  });

  it("includes p95 when sample count >= 2", () => {
    const result = formatPingSummary([10, 20, 30, 40, 50]);
    expect(result.stats.p95).toBe(50);
    expect(result.text).toContain("p95=50ms");
  });

  it("omits p95 for single sample", () => {
    const result = formatPingSummary([42]);
    expect(result.stats.p95).toBeUndefined();
    expect(result.text).not.toContain("p95=");
  });

  it("includes p99 when sample count >= 10", () => {
    const samples = [5, 10, 15, 20, 25, 30, 35, 40, 45, 100];
    const result = formatPingSummary(samples);
    expect(result.stats.p99).toBe(100);
    expect(result.text).toContain("p99=100ms");
  });

  it("omits p99 when sample count < 10", () => {
    const result = formatPingSummary([10, 20, 30, 40, 50]);
    expect(result.stats.p99).toBeUndefined();
    expect(result.text).not.toContain("p99=");
  });

  it("includes p95/p99 in compact JSON output", () => {
    const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = formatPingSummary(samples, { compact: true });
    const parsed = JSON.parse(result.text);
    expect(parsed.p95).toBeDefined();
    expect(parsed.p99).toBeDefined();
  });
});

describe("formatConnectionReliability", () => {
  it("returns empty array when both are null", () => {
    expect(formatConnectionReliability(null, null)).toEqual([]);
  });

  it("returns empty array when both are undefined", () => {
    expect(formatConnectionReliability(undefined, undefined)).toEqual([]);
  });

  it("returns empty array when both are 100%", () => {
    expect(formatConnectionReliability(100, 100)).toEqual([]);
  });

  it("includes success rate when below 100%", () => {
    expect(formatConnectionReliability(95, 100)).toEqual(["95% ok"]);
  });

  it("includes uptime when below 100%", () => {
    expect(formatConnectionReliability(100, 87)).toEqual(["87% connected"]);
  });

  it("includes both when both are below 100%", () => {
    expect(formatConnectionReliability(90, 75)).toEqual([
      "90% ok",
      "75% connected",
    ]);
  });

  it("includes 0% values", () => {
    expect(formatConnectionReliability(0, 0)).toEqual([
      "0% ok",
      "0% connected",
    ]);
  });

  it("ignores negative values", () => {
    expect(formatConnectionReliability(-1, -5)).toEqual([]);
  });

  it("ignores non-number types", () => {
    expect(formatConnectionReliability("95", "87")).toEqual([]);
  });

  it("handles mixed null and valid values", () => {
    expect(formatConnectionReliability(null, 80)).toEqual(["80% connected"]);
    expect(formatConnectionReliability(90, null)).toEqual(["90% ok"]);
  });
});

describe("formatProcessUptime", () => {
  it("returns null for invalid uptimeS", () => {
    expect(formatProcessUptime(NaN)).toBeNull();
    expect(formatProcessUptime(-1)).toBeNull();
    expect(formatProcessUptime(Infinity)).toBeNull();
    expect(formatProcessUptime("60")).toBeNull();
    expect(formatProcessUptime(null)).toBeNull();
    expect(formatProcessUptime(undefined)).toBeNull();
  });

  it("formats uptime without startedAt", () => {
    const result = formatProcessUptime(3600);
    expect(result).toBe("1h");
  });

  it("formats uptime with startedAt using default formatter", () => {
    // 2026-01-15T10:30:45.000Z
    const startedAt = new Date(2026, 0, 15, 10, 30, 45).getTime();
    const result = formatProcessUptime(7200, startedAt);
    expect(result).toBe("2h (since 10:30:45)");
  });

  it("formats uptime with custom formatTimestamp", () => {
    const result = formatProcessUptime(45, 1700000000000, {
      formatTimestamp: () => "custom-ts",
    });
    expect(result).toBe("45s (since custom-ts)");
  });

  it("ignores invalid startedAt", () => {
    expect(formatProcessUptime(60, null)).toBe("1m");
    expect(formatProcessUptime(60, 0)).toBe("1m");
    expect(formatProcessUptime(60, -100)).toBe("1m");
    expect(formatProcessUptime(60, NaN)).toBe("1m");
  });

  it("handles zero uptime", () => {
    expect(formatProcessUptime(0)).toBe("0s");
  });
});

describe("formatToolThroughput", () => {
  it("returns rate for sufficient uptime", () => {
    // 120 calls in 120s = 60/min
    expect(formatToolThroughput(120, 120000)).toBe("60.0/min");
  });

  it("returns fractional rate", () => {
    // 10 calls in 180s = 3.33/min
    expect(formatToolThroughput(10, 180000)).toBe("3.3/min");
  });

  it("returns null when uptime is below threshold", () => {
    expect(formatToolThroughput(50, 30000)).toBe(null);
  });

  it("returns null for zero calls", () => {
    expect(formatToolThroughput(0, 120000)).toBe(null);
  });

  it("returns null for negative calls", () => {
    expect(formatToolThroughput(-5, 120000)).toBe(null);
  });

  it("returns null for non-finite inputs", () => {
    expect(formatToolThroughput(NaN, 120000)).toBe(null);
    expect(formatToolThroughput(10, Infinity)).toBe(null);
    expect(formatToolThroughput(10, NaN)).toBe(null);
  });

  it("returns null for non-number inputs", () => {
    expect(formatToolThroughput("10", 120000)).toBe(null);
    expect(formatToolThroughput(10, "120000")).toBe(null);
  });

  it("respects custom minUptimeMs", () => {
    // 10 calls in 10s with minUptime=5000 → should work
    expect(formatToolThroughput(10, 10000, { minUptimeMs: 5000 })).toBe(
      "60.0/min",
    );
    // Same but below custom threshold
    expect(formatToolThroughput(10, 3000, { minUptimeMs: 5000 })).toBe(null);
  });
});

describe("formatToolCallsSummary", () => {
  const { formatToolCallsSummary } = require("../src/format-latency.cjs");

  it("returns null for zero calls", () => {
    expect(formatToolCallsSummary(0, 0)).toBe(null);
  });

  it("returns null for negative calls", () => {
    expect(formatToolCallsSummary(-1, 0)).toBe(null);
  });

  it("returns null for non-number calls", () => {
    expect(formatToolCallsSummary("10", 0)).toBe(null);
    expect(formatToolCallsSummary(undefined, 0)).toBe(null);
    expect(formatToolCallsSummary(null, 0)).toBe(null);
  });

  it("returns null for NaN/Infinity", () => {
    expect(formatToolCallsSummary(NaN, 0)).toBe(null);
    expect(formatToolCallsSummary(Infinity, 0)).toBe(null);
  });

  it("formats calls-only when no errors", () => {
    expect(formatToolCallsSummary(42, 0)).toBe("42 calls");
  });

  it("formats calls with errors and success rate", () => {
    expect(formatToolCallsSummary(100, 5)).toBe("100 calls, 5 err (95% ok)");
  });

  it("handles large counts with compact formatting", () => {
    const result = formatToolCallsSummary(1500, 30);
    expect(result).toContain("1.5K calls");
    expect(result).toContain("err");
    expect(result).toContain("% ok");
  });

  it("treats negative errors as zero", () => {
    expect(formatToolCallsSummary(10, -1)).toBe("10 calls");
  });

  it("treats non-number errors as zero", () => {
    expect(formatToolCallsSummary(10, "bad")).toBe("10 calls");
    expect(formatToolCallsSummary(10, null)).toBe("10 calls");
    expect(formatToolCallsSummary(10, undefined)).toBe("10 calls");
  });

  it("handles all errors (0% ok)", () => {
    expect(formatToolCallsSummary(5, 5)).toBe("5 calls, 5 err (0% ok)");
  });

  it("handles single call with no errors", () => {
    expect(formatToolCallsSummary(1, 0)).toBe("1 calls");
  });
});
