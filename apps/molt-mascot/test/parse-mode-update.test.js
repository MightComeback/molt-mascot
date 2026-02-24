import { describe, it, expect } from 'bun:test';
import { parseModeUpdate, formatModeUpdate, nonNegNum, nonNegInt, posEpoch, nonEmptyStr, validMode, validHealthStatus, validLatencyTrend, VALID_HEALTH, VALID_LATENCY_TRENDS } from '../src/parse-mode-update.cjs';

describe('parse-mode-update', () => {
  describe('nonNegNum', () => {
    it('accepts zero and positive numbers', () => {
      expect(nonNegNum(0)).toBe(0);
      expect(nonNegNum(42)).toBe(42);
      expect(nonNegNum(3.14)).toBe(3.14);
    });

    it('rejects negative, NaN, Infinity, and non-numbers', () => {
      expect(nonNegNum(-1)).toBeNull();
      expect(nonNegNum(NaN)).toBeNull();
      expect(nonNegNum(Infinity)).toBeNull();
      expect(nonNegNum(-Infinity)).toBeNull();
      expect(nonNegNum('42')).toBeNull();
      expect(nonNegNum(null)).toBeNull();
      expect(nonNegNum(undefined)).toBeNull();
    });
  });

  describe('nonNegInt', () => {
    it('accepts zero and positive integers', () => {
      expect(nonNegInt(0)).toBe(0);
      expect(nonNegInt(5)).toBe(5);
      expect(nonNegInt(100)).toBe(100);
    });

    it('rejects non-integers', () => {
      expect(nonNegInt(3.5)).toBeNull();
      expect(nonNegInt(0.1)).toBeNull();
    });

    it('rejects negative, NaN, and non-numbers', () => {
      expect(nonNegInt(-1)).toBeNull();
      expect(nonNegInt(NaN)).toBeNull();
      expect(nonNegInt('5')).toBeNull();
    });
  });

  describe('posEpoch', () => {
    it('accepts positive numbers', () => {
      expect(posEpoch(1700000000000)).toBe(1700000000000);
      expect(posEpoch(1)).toBe(1);
    });

    it('rejects zero, negative, and non-numbers', () => {
      expect(posEpoch(0)).toBeNull();
      expect(posEpoch(-1)).toBeNull();
      expect(posEpoch(NaN)).toBeNull();
      expect(posEpoch('1700000000000')).toBeNull();
      expect(posEpoch(null)).toBeNull();
    });
  });

  describe('nonEmptyStr', () => {
    it('accepts non-empty strings', () => {
      expect(nonEmptyStr('hello')).toBe('hello');
      expect(nonEmptyStr('idle')).toBe('idle');
    });

    it('rejects empty strings and non-strings', () => {
      expect(nonEmptyStr('')).toBeNull();
      expect(nonEmptyStr(null)).toBeNull();
      expect(nonEmptyStr(undefined)).toBeNull();
      expect(nonEmptyStr(42)).toBeNull();
      expect(nonEmptyStr(true)).toBeNull();
    });
  });

  describe('validHealthStatus', () => {
    it('accepts known health status values', () => {
      expect(validHealthStatus('healthy')).toBe('healthy');
      expect(validHealthStatus('degraded')).toBe('degraded');
      expect(validHealthStatus('unhealthy')).toBe('unhealthy');
    });

    it('rejects unknown strings and non-strings', () => {
      expect(validHealthStatus('excellent')).toBeNull();
      expect(validHealthStatus('')).toBeNull();
      expect(validHealthStatus(null)).toBeNull();
      expect(validHealthStatus(undefined)).toBeNull();
      expect(validHealthStatus(42)).toBeNull();
      expect(validHealthStatus(true)).toBeNull();
    });
  });

  describe('VALID_HEALTH', () => {
    it('is a frozen array of known health status strings', () => {
      expect(Object.isFrozen(VALID_HEALTH)).toBe(true);
      expect(VALID_HEALTH).toEqual(['healthy', 'degraded', 'unhealthy']);
    });

    it('matches the set of values accepted by validHealthStatus', () => {
      for (const h of VALID_HEALTH) {
        expect(validHealthStatus(h)).toBe(h);
      }
    });
  });

  describe('validMode', () => {
    it('accepts known mode strings', () => {
      for (const m of ['idle', 'thinking', 'tool', 'error', 'connecting', 'disconnected', 'connected', 'sleeping']) {
        expect(validMode(m)).toBe(m);
      }
    });

    it('rejects unknown mode strings', () => {
      expect(validMode('unknown')).toBeNull();
      expect(validMode('running')).toBeNull();
      expect(validMode('')).toBeNull();
      expect(validMode('IDLE')).toBeNull(); // case-sensitive
    });

    it('rejects non-string values', () => {
      expect(validMode(null)).toBeNull();
      expect(validMode(undefined)).toBeNull();
      expect(validMode(42)).toBeNull();
      expect(validMode(true)).toBeNull();
    });
  });

  describe('validLatencyTrend', () => {
    it('accepts known trend values', () => {
      expect(validLatencyTrend('rising')).toBe('rising');
      expect(validLatencyTrend('falling')).toBe('falling');
      expect(validLatencyTrend('stable')).toBe('stable');
    });

    it('rejects unknown strings and non-strings', () => {
      expect(validLatencyTrend('improving')).toBeNull();
      expect(validLatencyTrend('')).toBeNull();
      expect(validLatencyTrend(null)).toBeNull();
      expect(validLatencyTrend(undefined)).toBeNull();
      expect(validLatencyTrend(42)).toBeNull();
      expect(validLatencyTrend(true)).toBeNull();
    });
  });

  describe('VALID_LATENCY_TRENDS', () => {
    it('contains expected trend values', () => {
      expect(VALID_LATENCY_TRENDS).toContain('rising');
      expect(VALID_LATENCY_TRENDS).toContain('falling');
      expect(VALID_LATENCY_TRENDS).toContain('stable');
      expect(VALID_LATENCY_TRENDS).toHaveLength(3);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(VALID_LATENCY_TRENDS)).toBe(true);
    });
  });

  describe('parseModeUpdate', () => {
    it('parses a full valid payload', () => {
      const result = parseModeUpdate({
        mode: 'thinking',
        latency: 42,
        tool: 'web_fetch',
        errorMessage: 'spawn ENOENT',
        toolCalls: 10,
        toolErrors: 2,
        sessionConnectCount: 3,
        sessionAttemptCount: 5,
        closeDetail: 'abnormal closure (1006)',
        reconnectAttempt: 1,
        targetUrl: 'ws://127.0.0.1:18789',
        activeAgents: 2,
        activeTools: 1,
        agentSessions: 15,
        pluginVersion: '0.5.2',
        lastMessageAt: 1700000000000,
        latencyStats: { min: 30, max: 80, avg: 45, median: 38, samples: 10 },
        pluginStartedAt: 1700000000000,
        lastResetAt: 1700000050000,
        healthStatus: 'degraded',
        latencyTrend: 'rising',
      });

      expect(result.mode).toBe('thinking');
      expect(result.latencyMs).toBe(42);
      expect(result.tool).toBe('web_fetch');
      expect(result.errorMessage).toBe('spawn ENOENT');
      expect(result.toolCalls).toBe(10);
      expect(result.toolErrors).toBe(2);
      expect(result.sessionConnectCount).toBe(3);
      expect(result.sessionAttemptCount).toBe(5);
      expect(result.closeDetail).toBe('abnormal closure (1006)');
      expect(result.reconnectAttempt).toBe(1);
      expect(result.targetUrl).toBe('ws://127.0.0.1:18789');
      expect(result.activeAgents).toBe(2);
      expect(result.activeTools).toBe(1);
      expect(result.agentSessions).toBe(15);
      expect(result.pluginVersion).toBe('0.5.2');
      expect(result.lastMessageAt).toBe(1700000000000);
      expect(result.latencyStats).toEqual({ min: 30, max: 80, avg: 45, median: 38, samples: 10 });
      expect(result.pluginStartedAt).toBe(1700000000000);
      expect(result.lastResetAt).toBe(1700000050000);
      expect(result.healthStatus).toBe('degraded');
      expect(result.latencyTrend).toBe('rising');
    });

    it('returns all nulls for empty object', () => {
      const result = parseModeUpdate({});
      expect(result.mode).toBeNull();
      expect(result.latencyMs).toBeNull();
      expect(result.tool).toBeNull();
      expect(result.errorMessage).toBeNull();
      expect(result.toolCalls).toBeNull();
      expect(result.toolErrors).toBeNull();
      expect(result.sessionConnectCount).toBeNull();
      expect(result.sessionAttemptCount).toBeNull();
      expect(result.closeDetail).toBeNull();
      expect(result.reconnectAttempt).toBeNull();
      expect(result.targetUrl).toBeNull();
      expect(result.activeAgents).toBeNull();
      expect(result.activeTools).toBeNull();
      expect(result.agentSessions).toBeNull();
      expect(result.pluginVersion).toBeNull();
      expect(result.lastMessageAt).toBeNull();
      expect(result.latencyStats).toBeNull();
      expect(result.pluginStartedAt).toBeNull();
      expect(result.lastResetAt).toBeNull();
      expect(result.healthStatus).toBeNull();
      expect(result.latencyTrend).toBeNull();
    });

    it('parses latencyTrend values', () => {
      expect(parseModeUpdate({ latencyTrend: 'rising' }).latencyTrend).toBe('rising');
      expect(parseModeUpdate({ latencyTrend: 'falling' }).latencyTrend).toBe('falling');
      expect(parseModeUpdate({ latencyTrend: 'stable' }).latencyTrend).toBe('stable');
      expect(parseModeUpdate({ latencyTrend: 'unknown' }).latencyTrend).toBeNull();
      expect(parseModeUpdate({ latencyTrend: 42 }).latencyTrend).toBeNull();
    });

    it('handles null/undefined input gracefully', () => {
      const fromNull = parseModeUpdate(null);
      expect(fromNull.mode).toBeNull();
      expect(fromNull.latencyMs).toBeNull();

      const fromUndef = parseModeUpdate(undefined);
      expect(fromUndef.mode).toBeNull();

      const fromString = parseModeUpdate('not an object');
      expect(fromString.mode).toBeNull();
    });

    it('independently validates each field (one bad field doesnt affect others)', () => {
      const result = parseModeUpdate({
        mode: 'idle',
        latency: -5,        // invalid
        toolCalls: 3.5,     // invalid (not integer)
        activeAgents: 2,    // valid
        pluginVersion: '',  // invalid (empty)
      });

      expect(result.mode).toBe('idle');
      expect(result.latencyMs).toBeNull();
      expect(result.toolCalls).toBeNull();
      expect(result.activeAgents).toBe(2);
      expect(result.pluginVersion).toBeNull();
    });

    it('rejects unknown mode strings', () => {
      expect(parseModeUpdate({ mode: 'bogus' }).mode).toBeNull();
      expect(parseModeUpdate({ mode: 'IDLE' }).mode).toBeNull();
      expect(parseModeUpdate({ mode: '' }).mode).toBeNull();
    });

    it('rejects latencyStats without numeric samples field', () => {
      expect(parseModeUpdate({ latencyStats: { median: 38 } }).latencyStats).toBeNull();
      expect(parseModeUpdate({ latencyStats: 'not an object' }).latencyStats).toBeNull();
      expect(parseModeUpdate({ latencyStats: null }).latencyStats).toBeNull();
    });

    it('accepts latencyStats with numeric samples field', () => {
      const stats = { samples: 5, median: 20 };
      expect(parseModeUpdate({ latencyStats: stats }).latencyStats).toEqual(stats);
    });

    it('rejects latencyStats with non-integer samples', () => {
      expect(parseModeUpdate({ latencyStats: { samples: 1.5 } }).latencyStats).toBeNull();
    });

    it('rejects latencyStats with zero samples', () => {
      expect(parseModeUpdate({ latencyStats: { samples: 0 } }).latencyStats).toBeNull();
    });

    it('rejects latencyStats with NaN/Infinity in numeric fields', () => {
      expect(parseModeUpdate({ latencyStats: { samples: 5, min: NaN } }).latencyStats).toBeNull();
      expect(parseModeUpdate({ latencyStats: { samples: 5, max: Infinity } }).latencyStats).toBeNull();
      expect(parseModeUpdate({ latencyStats: { samples: 5, avg: -Infinity } }).latencyStats).toBeNull();
    });

    it('rejects latencyStats with negative numeric fields', () => {
      expect(parseModeUpdate({ latencyStats: { samples: 5, median: -1 } }).latencyStats).toBeNull();
      expect(parseModeUpdate({ latencyStats: { samples: 5, p95: -10 } }).latencyStats).toBeNull();
      expect(parseModeUpdate({ latencyStats: { samples: 5, jitter: -5 } }).latencyStats).toBeNull();
    });

    it('accepts latencyStats with all valid numeric fields', () => {
      const stats = { samples: 10, min: 5, max: 100, avg: 42, median: 38, p95: 80, p99: 95, jitter: 12 };
      expect(parseModeUpdate({ latencyStats: stats }).latencyStats).toEqual(stats);
    });

    it('maps latency field to latencyMs in output', () => {
      const result = parseModeUpdate({ latency: 100 });
      expect(result.latencyMs).toBe(100);
      expect(result).not.toHaveProperty('latency');
    });

    it('accepts latencyMs as an alias for latency', () => {
      expect(parseModeUpdate({ latencyMs: 55 }).latencyMs).toBe(55);
      // latencyMs takes precedence over latency when both are present
      expect(parseModeUpdate({ latencyMs: 55, latency: 99 }).latencyMs).toBe(55);
      // falls back to latency when latencyMs is absent
      expect(parseModeUpdate({ latency: 99 }).latencyMs).toBe(99);
    });

    it('parses connectionSuccessRate as integer percentage 0-100', () => {
      expect(parseModeUpdate({ connectionSuccessRate: 95 }).connectionSuccessRate).toBe(95);
      expect(parseModeUpdate({ connectionSuccessRate: 0 }).connectionSuccessRate).toBe(0);
      expect(parseModeUpdate({ connectionSuccessRate: 100 }).connectionSuccessRate).toBe(100);
      // rejects out-of-range
      expect(parseModeUpdate({ connectionSuccessRate: 101 }).connectionSuccessRate).toBeNull();
      expect(parseModeUpdate({ connectionSuccessRate: -1 }).connectionSuccessRate).toBeNull();
      // rejects non-integer
      expect(parseModeUpdate({ connectionSuccessRate: 95.5 }).connectionSuccessRate).toBeNull();
      // rejects non-number
      expect(parseModeUpdate({ connectionSuccessRate: '95' }).connectionSuccessRate).toBeNull();
      expect(parseModeUpdate({ connectionSuccessRate: null }).connectionSuccessRate).toBeNull();
    });

    it('accepts zero for numeric fields where appropriate', () => {
      const result = parseModeUpdate({
        latency: 0,
        toolCalls: 0,
        toolErrors: 0,
        reconnectAttempt: 0,
        activeAgents: 0,
        activeTools: 0,
        agentSessions: 0,
      });
      expect(result.latencyMs).toBe(0);
      expect(result.toolCalls).toBe(0);
      expect(result.toolErrors).toBe(0);
      expect(result.reconnectAttempt).toBe(0);
      expect(result.activeAgents).toBe(0);
      expect(result.activeTools).toBe(0);
      expect(result.agentSessions).toBe(0);
    });
  });

  describe('formatModeUpdate', () => {
    it('returns "ModeUpdate<invalid>" for null/undefined input', () => {
      expect(formatModeUpdate(null)).toBe('ModeUpdate<invalid>');
      expect(formatModeUpdate(undefined)).toBe('ModeUpdate<invalid>');
    });

    it('returns "ModeUpdate<empty>" when all fields are null', () => {
      const parsed = parseModeUpdate({});
      expect(formatModeUpdate(parsed)).toBe('ModeUpdate<empty>');
    });

    it('includes mode and latency', () => {
      const parsed = parseModeUpdate({ mode: 'thinking', latency: 42 });
      const str = formatModeUpdate(parsed);
      expect(str).toContain('thinking');
      expect(str).toContain('42ms');
    });

    it('includes tool name', () => {
      const parsed = parseModeUpdate({ mode: 'tool', tool: 'exec' });
      expect(formatModeUpdate(parsed)).toContain('tool=exec');
    });

    it('includes error message', () => {
      const parsed = parseModeUpdate({ mode: 'error', errorMessage: 'connection refused' });
      expect(formatModeUpdate(parsed)).toContain('err="connection refused"');
    });

    it('includes active agents and tools when non-zero', () => {
      const parsed = parseModeUpdate({ mode: 'thinking', activeAgents: 2, activeTools: 3 });
      const str = formatModeUpdate(parsed);
      expect(str).toContain('agents=2');
      expect(str).toContain('tools=3');
    });

    it('omits zero active agents and tools', () => {
      const parsed = parseModeUpdate({ mode: 'idle', activeAgents: 0, activeTools: 0 });
      const str = formatModeUpdate(parsed);
      expect(str).not.toContain('agents=');
      expect(str).not.toContain('tools=');
    });

    it('includes agentSessions when non-zero', () => {
      const parsed = parseModeUpdate({ mode: 'idle', agentSessions: 15 });
      expect(formatModeUpdate(parsed)).toContain('sessions=15');
    });

    it('omits agentSessions when zero', () => {
      const parsed = parseModeUpdate({ mode: 'idle', agentSessions: 0 });
      expect(formatModeUpdate(parsed)).not.toContain('sessions=');
    });

    it('includes reconnect attempt when non-zero', () => {
      const parsed = parseModeUpdate({ mode: 'disconnected', reconnectAttempt: 3 });
      expect(formatModeUpdate(parsed)).toContain('retry #3');
    });

    it('includes degraded health status with emoji', () => {
      const parsed = parseModeUpdate({ mode: 'idle', healthStatus: 'degraded' });
      const str = formatModeUpdate(parsed);
      expect(str).toContain('⚠️');
      expect(str).toContain('degraded');
    });

    it('includes unhealthy health status with emoji', () => {
      const parsed = parseModeUpdate({ mode: 'disconnected', healthStatus: 'unhealthy' });
      const str = formatModeUpdate(parsed);
      expect(str).toContain('🔴');
      expect(str).toContain('unhealthy');
    });

    it('omits healthy health status', () => {
      const parsed = parseModeUpdate({ mode: 'idle', healthStatus: 'healthy' });
      expect(formatModeUpdate(parsed)).not.toContain('healthy');
    });

    it('includes toolCalls count when present', () => {
      const parsed = parseModeUpdate({ mode: 'idle', toolCalls: 42 });
      expect(formatModeUpdate(parsed)).toContain('42calls');
    });

    it('includes toolCalls with toolErrors when both present', () => {
      const parsed = parseModeUpdate({ mode: 'idle', toolCalls: 100, toolErrors: 3 });
      const str = formatModeUpdate(parsed);
      expect(str).toContain('100calls/3err');
    });

    it('omits toolCalls when zero', () => {
      const parsed = parseModeUpdate({ mode: 'idle', toolCalls: 0 });
      expect(formatModeUpdate(parsed)).not.toContain('calls');
    });

    it('includes closeDetail when present', () => {
      const parsed = parseModeUpdate({ mode: 'disconnected', closeDetail: 'abnormal closure (1006)' });
      expect(formatModeUpdate(parsed)).toContain('close="abnormal closure (1006)"');
    });

    it('includes targetUrl when present', () => {
      const parsed = parseModeUpdate({ mode: 'connecting', targetUrl: 'ws://localhost:18789' });
      expect(formatModeUpdate(parsed)).toContain('→ ws://localhost:18789');
    });

    it('includes connectionSuccessRate when below 100', () => {
      const parsed = parseModeUpdate({ mode: 'idle', connectionSuccessRate: 75 });
      expect(formatModeUpdate(parsed)).toContain('75% ok');
    });

    it('omits connectionSuccessRate when 100', () => {
      const parsed = parseModeUpdate({ mode: 'idle', connectionSuccessRate: 100 });
      expect(formatModeUpdate(parsed)).not.toContain('% ok');
    });

    it('includes plugin version', () => {
      const parsed = parseModeUpdate({ mode: 'idle', pluginVersion: '1.2.3' });
      expect(formatModeUpdate(parsed)).toContain('v1.2.3');
    });

    it('includes latencyTrend arrow when rising or falling', () => {
      expect(formatModeUpdate(parseModeUpdate({ latencyTrend: 'rising' }))).toContain('↑');
      expect(formatModeUpdate(parseModeUpdate({ latencyTrend: 'falling' }))).toContain('↓');
    });

    it('omits latencyTrend when stable', () => {
      const str = formatModeUpdate(parseModeUpdate({ mode: 'idle', latencyTrend: 'stable' }));
      expect(str).not.toContain('↑');
      expect(str).not.toContain('↓');
    });

    it('formats a full update compactly', () => {
      const parsed = parseModeUpdate({
        mode: 'tool',
        latency: 15,
        tool: 'web_search',
        activeAgents: 1,
        pluginVersion: '0.2.0',
        healthStatus: 'healthy',
      });
      const str = formatModeUpdate(parsed);
      expect(str).toMatch(/^ModeUpdate<.+>$/);
      expect(str).toContain('tool');
      expect(str).toContain('15ms');
      expect(str).toContain('web_search');
      expect(str).toContain('v0.2.0');
    });
  });
});
