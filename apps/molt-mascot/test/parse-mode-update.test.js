import { describe, it, expect } from 'bun:test';
import { parseModeUpdate, nonNegNum, nonNegInt, posEpoch, nonEmptyStr, validMode, validHealthStatus, VALID_HEALTH } from '../src/parse-mode-update.cjs';

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
        pluginVersion: '0.5.2',
        lastMessageAt: 1700000000000,
        latencyStats: { min: 30, max: 80, avg: 45, median: 38, samples: 10 },
        pluginStartedAt: 1700000000000,
        lastResetAt: 1700000050000,
        healthStatus: 'degraded',
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
      expect(result.pluginVersion).toBe('0.5.2');
      expect(result.lastMessageAt).toBe(1700000000000);
      expect(result.latencyStats).toEqual({ min: 30, max: 80, avg: 45, median: 38, samples: 10 });
      expect(result.pluginStartedAt).toBe(1700000000000);
      expect(result.lastResetAt).toBe(1700000050000);
      expect(result.healthStatus).toBe('degraded');
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
      expect(result.pluginVersion).toBeNull();
      expect(result.lastMessageAt).toBeNull();
      expect(result.latencyStats).toBeNull();
      expect(result.pluginStartedAt).toBeNull();
      expect(result.lastResetAt).toBeNull();
      expect(result.healthStatus).toBeNull();
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
      });
      expect(result.latencyMs).toBe(0);
      expect(result.toolCalls).toBe(0);
      expect(result.toolErrors).toBe(0);
      expect(result.reconnectAttempt).toBe(0);
      expect(result.activeAgents).toBe(0);
      expect(result.activeTools).toBe(0);
    });
  });
});
