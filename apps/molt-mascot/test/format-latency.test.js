import { describe, it, expect } from 'bun:test';
import { formatLatency, connectionQuality, connectionQualityEmoji, resolveQualitySource, formatQualitySummary, QUALITY_THRESHOLDS, VALID_HEALTH_STATUSES, isValidHealth, healthStatusEmoji, computeHealthReasons, formatHealthSummary } from '../src/format-latency.cjs';

describe('formatLatency (canonical source)', () => {
  it('sub-millisecond returns "< 1ms"', () => {
    expect(formatLatency(0)).toBe('< 1ms');
    expect(formatLatency(0.1)).toBe('< 1ms');
    expect(formatLatency(0.999)).toBe('< 1ms');
  });

  it('millisecond range returns rounded "Xms"', () => {
    expect(formatLatency(1)).toBe('1ms');
    expect(formatLatency(42)).toBe('42ms');
    expect(formatLatency(999)).toBe('999ms');
  });

  it('fractional milliseconds are rounded', () => {
    expect(formatLatency(1.4)).toBe('1ms');
    expect(formatLatency(1.6)).toBe('2ms');
    expect(formatLatency(3.7)).toBe('4ms');
    expect(formatLatency(0.4)).toBe('< 1ms');
  });

  it('seconds range returns "X.Ys"', () => {
    expect(formatLatency(1000)).toBe('1.0s');
    expect(formatLatency(1200)).toBe('1.2s');
    expect(formatLatency(5432)).toBe('5.4s');
    expect(formatLatency(10000)).toBe('10.0s');
  });

  it('boundary at 1000ms uses seconds format', () => {
    expect(formatLatency(999)).toBe('999ms');
    expect(formatLatency(1000)).toBe('1.0s');
  });

  it('negative values return dash', () => {
    expect(formatLatency(-1)).toBe('–');
    expect(formatLatency(-100)).toBe('–');
  });

  it('NaN and Infinity return dash', () => {
    expect(formatLatency(NaN)).toBe('–');
    expect(formatLatency(Infinity)).toBe('–');
    expect(formatLatency(-Infinity)).toBe('–');
  });

  it('non-number types return dash', () => {
    expect(formatLatency(null)).toBe('–');
    expect(formatLatency(undefined)).toBe('–');
    expect(formatLatency('42')).toBe('–');
    expect(formatLatency(true)).toBe('–');
    expect(formatLatency({})).toBe('–');
  });
});

describe('connectionQuality', () => {
  it('returns "excellent" for < 50ms', () => {
    expect(connectionQuality(0)).toBe('excellent');
    expect(connectionQuality(10)).toBe('excellent');
    expect(connectionQuality(49)).toBe('excellent');
    expect(connectionQuality(49.9)).toBe('excellent');
  });

  it('returns "good" for 50–149ms', () => {
    expect(connectionQuality(50)).toBe('good');
    expect(connectionQuality(100)).toBe('good');
    expect(connectionQuality(149)).toBe('good');
  });

  it('returns "fair" for 150–499ms', () => {
    expect(connectionQuality(150)).toBe('fair');
    expect(connectionQuality(300)).toBe('fair');
    expect(connectionQuality(499)).toBe('fair');
  });

  it('returns "poor" for >= 500ms', () => {
    expect(connectionQuality(500)).toBe('poor');
    expect(connectionQuality(1000)).toBe('poor');
    expect(connectionQuality(9999)).toBe('poor');
  });

  it('returns null for invalid inputs', () => {
    expect(connectionQuality(-1)).toBeNull();
    expect(connectionQuality(NaN)).toBeNull();
    expect(connectionQuality(Infinity)).toBeNull();
    expect(connectionQuality(null)).toBeNull();
    expect(connectionQuality(undefined)).toBeNull();
    expect(connectionQuality('42')).toBeNull();
  });
});

describe('resolveQualitySource', () => {
  it('prefers median from stats when >1 sample', () => {
    expect(resolveQualitySource(400, { median: 30, samples: 10 })).toBe(30);
  });

  it('falls back to instant when stats have 1 sample', () => {
    expect(resolveQualitySource(200, { median: 200, samples: 1 })).toBe(200);
  });

  it('falls back to instant when stats is null', () => {
    expect(resolveQualitySource(42, null)).toBe(42);
  });

  it('falls back to instant when stats is undefined', () => {
    expect(resolveQualitySource(42, undefined)).toBe(42);
  });

  it('falls back to instant when stats lacks median', () => {
    expect(resolveQualitySource(100, { samples: 5 })).toBe(100);
  });

  it('falls back to instant when stats lacks samples', () => {
    expect(resolveQualitySource(100, { median: 50 })).toBe(100);
  });

  it('returns null when both are unavailable', () => {
    expect(resolveQualitySource(null, null)).toBeNull();
    expect(resolveQualitySource(undefined, undefined)).toBeNull();
  });

  it('returns null for negative instant without valid stats', () => {
    expect(resolveQualitySource(-1, null)).toBeNull();
  });

  it('handles instant of 0 (valid)', () => {
    expect(resolveQualitySource(0, null)).toBe(0);
  });
});

describe('QUALITY_THRESHOLDS', () => {
  it('exports frozen threshold constants', () => {
    expect(QUALITY_THRESHOLDS).toBeDefined();
    expect(Object.isFrozen(QUALITY_THRESHOLDS)).toBe(true);
  });

  it('has expected threshold values', () => {
    expect(QUALITY_THRESHOLDS.EXCELLENT_MAX_MS).toBe(50);
    expect(QUALITY_THRESHOLDS.GOOD_MAX_MS).toBe(150);
    expect(QUALITY_THRESHOLDS.FAIR_MAX_MS).toBe(500);
  });

  it('connectionQuality transitions align with thresholds', () => {
    const { EXCELLENT_MAX_MS, GOOD_MAX_MS, FAIR_MAX_MS } = QUALITY_THRESHOLDS;
    // Just below each threshold
    expect(connectionQuality(EXCELLENT_MAX_MS - 1)).toBe('excellent');
    expect(connectionQuality(GOOD_MAX_MS - 1)).toBe('good');
    expect(connectionQuality(FAIR_MAX_MS - 1)).toBe('fair');
    // At each threshold
    expect(connectionQuality(EXCELLENT_MAX_MS)).toBe('good');
    expect(connectionQuality(GOOD_MAX_MS)).toBe('fair');
    expect(connectionQuality(FAIR_MAX_MS)).toBe('poor');
  });
});

describe('connectionQualityEmoji', () => {
  it('maps quality labels to colored circle emojis', () => {
    expect(connectionQualityEmoji('excellent')).toBe('🟢');
    expect(connectionQualityEmoji('good')).toBe('🟡');
    expect(connectionQualityEmoji('fair')).toBe('🟠');
    expect(connectionQualityEmoji('poor')).toBe('🔴');
  });

  it('returns grey circle for null or unknown values', () => {
    expect(connectionQualityEmoji(null)).toBe('⚪');
    expect(connectionQualityEmoji(undefined)).toBe('⚪');
    expect(connectionQualityEmoji('unknown')).toBe('⚪');
    expect(connectionQualityEmoji('')).toBe('⚪');
  });
});

describe('formatQualitySummary', () => {
  it('returns formatted latency with quality emoji by default', () => {
    const result = formatQualitySummary(25, null);
    expect(result.text).toBe('25ms 🟢');
    expect(result.quality).toBe('excellent');
    expect(result.emoji).toBe('🟢');
  });

  it('uses quality label instead of emoji when emoji=false', () => {
    const result = formatQualitySummary(25, null, { emoji: false });
    expect(result.text).toBe('25ms [excellent]');
  });

  it('prefers median from stats for quality assessment', () => {
    const result = formatQualitySummary(400, { median: 30, samples: 10 });
    expect(result.quality).toBe('excellent');
    expect(result.text).toContain('400ms');
    expect(result.text).toContain('🟢');
  });

  it('appends jitter when exceeding threshold', () => {
    const stats = { median: 40, samples: 10, jitter: 30 };
    const result = formatQualitySummary(42, stats);
    expect(result.text).toContain('jitter 30ms');
  });

  it('omits jitter when below threshold', () => {
    const stats = { median: 40, samples: 10, jitter: 10 };
    const result = formatQualitySummary(42, stats);
    expect(result.text).not.toContain('jitter');
  });

  it('supports custom jitter threshold', () => {
    const stats = { median: 100, samples: 10, jitter: 30 };
    // Default 0.5 threshold: 30 < 100*0.5=50, no jitter shown
    expect(formatQualitySummary(100, stats).text).not.toContain('jitter');
    // Custom 0.2 threshold: 30 > 100*0.2=20, jitter shown
    expect(formatQualitySummary(100, stats, { jitterThreshold: 0.2 }).text).toContain('jitter');
  });

  it('handles invalid latency gracefully', () => {
    const result = formatQualitySummary(-1, null);
    expect(result.text).toBe('–');
    expect(result.quality).toBeNull();
  });

  it('handles null stats gracefully', () => {
    const result = formatQualitySummary(200, null);
    expect(result.quality).toBe('fair');
  });
});

describe('VALID_HEALTH_STATUSES', () => {
  it('contains all three health statuses', () => {
    expect(VALID_HEALTH_STATUSES).toEqual(['healthy', 'degraded', 'unhealthy']);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(VALID_HEALTH_STATUSES)).toBe(true);
  });
});

describe('isValidHealth', () => {
  it('accepts valid health statuses', () => {
    expect(isValidHealth('healthy')).toBe(true);
    expect(isValidHealth('degraded')).toBe(true);
    expect(isValidHealth('unhealthy')).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(isValidHealth('unknown')).toBe(false);
    expect(isValidHealth('Healthy')).toBe(false);
    expect(isValidHealth('')).toBe(false);
    expect(isValidHealth(null)).toBe(false);
    expect(isValidHealth(undefined)).toBe(false);
    expect(isValidHealth(42)).toBe(false);
  });
});

describe('healthStatusEmoji', () => {
  it('maps health statuses to emojis', () => {
    expect(healthStatusEmoji('healthy')).toBe('🟢');
    expect(healthStatusEmoji('degraded')).toBe('⚠️');
    expect(healthStatusEmoji('unhealthy')).toBe('🔴');
  });

  it('returns grey circle for null/unknown values', () => {
    expect(healthStatusEmoji(null)).toBe('⚪');
    expect(healthStatusEmoji(undefined)).toBe('⚪');
    expect(healthStatusEmoji('unknown')).toBe('⚪');
    expect(healthStatusEmoji('')).toBe('⚪');
  });
});

describe('computeHealthReasons', () => {
  it('returns ["disconnected"] when not connected', () => {
    expect(computeHealthReasons({ isConnected: false })).toEqual(['disconnected']);
  });

  it('returns empty array for healthy connection', () => {
    expect(computeHealthReasons({ isConnected: true, latencyMs: 20 })).toEqual([]);
  });

  it('detects stale connection (>10s)', () => {
    const now = Date.now();
    const reasons = computeHealthReasons({
      isConnected: true,
      lastMessageAt: now - 15000,
      now,
    });
    expect(reasons.length).toBe(1);
    expect(reasons[0]).toContain('stale connection');
    expect(reasons[0]).not.toContain('dead');
  });

  it('detects severely stale (dead) connection (>30s)', () => {
    const now = Date.now();
    const reasons = computeHealthReasons({
      isConnected: true,
      lastMessageAt: now - 45000,
      now,
    });
    expect(reasons[0]).toContain('dead');
  });

  it('skips staleness check when polling is paused', () => {
    const now = Date.now();
    const reasons = computeHealthReasons({
      isConnected: true,
      isPollingPaused: true,
      lastMessageAt: now - 60000,
      now,
    });
    expect(reasons.filter(r => r.includes('stale'))).toEqual([]);
  });

  it('detects poor latency', () => {
    const reasons = computeHealthReasons({ isConnected: true, latencyMs: 600 });
    expect(reasons.some(r => r.includes('poor latency'))).toBe(true);
  });

  it('detects extreme latency (>5s)', () => {
    const reasons = computeHealthReasons({ isConnected: true, latencyMs: 6000 });
    expect(reasons.some(r => r.includes('extreme latency'))).toBe(true);
  });

  it('detects high absolute jitter (>200ms)', () => {
    const reasons = computeHealthReasons({
      isConnected: true,
      latencyMs: 50,
      latencyStats: { median: 50, samples: 10, jitter: 250 },
    });
    expect(reasons.some(r => r.includes('high jitter'))).toBe(true);
  });

  it('detects high relative jitter (>150% of median)', () => {
    const reasons = computeHealthReasons({
      isConnected: true,
      latencyMs: 50,
      latencyStats: { median: 50, samples: 10, jitter: 100 },
    });
    expect(reasons.some(r => r.includes('high jitter') && r.includes('% of median'))).toBe(true);
  });

  it('detects low connection success rate', () => {
    const reasons = computeHealthReasons({
      isConnected: true,
      connectionSuccessRate: 60,
    });
    expect(reasons.some(r => r.includes('low success rate'))).toBe(true);
  });

  it('returns empty for default/no params', () => {
    expect(computeHealthReasons()).toEqual(['disconnected']);
  });

  it('accumulates multiple reasons', () => {
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

describe('formatHealthSummary', () => {
  const now = 1700000000000;

  it('returns null for healthy status', () => {
    expect(formatHealthSummary('healthy', { isConnected: true, now })).toBe(null);
  });

  it('returns null for null/undefined status', () => {
    expect(formatHealthSummary(null, { isConnected: true, now })).toBe(null);
    expect(formatHealthSummary(undefined, { isConnected: true, now })).toBe(null);
  });

  it('returns summary for degraded status', () => {
    const result = formatHealthSummary('degraded', { isConnected: true, latencyMs: 600, now });
    expect(result).not.toBe(null);
    expect(result.text).toContain('⚠️');
    expect(result.text).toContain('degraded');
    expect(result.text).toContain('poor latency');
    expect(result.emoji).toBe('⚠️');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('returns summary for unhealthy status', () => {
    const result = formatHealthSummary('unhealthy', { isConnected: false, now });
    expect(result).not.toBe(null);
    expect(result.text).toContain('🔴');
    expect(result.text).toContain('unhealthy');
    expect(result.text).toContain('disconnected');
    expect(result.emoji).toBe('🔴');
  });

  it('returns summary with no reasons when params are minimal', () => {
    const result = formatHealthSummary('degraded', { isConnected: true, now });
    expect(result).not.toBe(null);
    expect(result.text).toBe('⚠️ degraded');
    expect(result.reasons).toEqual([]);
  });

  it('handles missing reasonParams gracefully', () => {
    const result = formatHealthSummary('unhealthy');
    expect(result).not.toBe(null);
    expect(result.text).toContain('🔴 unhealthy');
  });
});
