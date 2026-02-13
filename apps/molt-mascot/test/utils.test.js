import { describe, it, expect } from 'bun:test';
import { coerceDelayMs, truncate, cleanErrorString, isMissingMethodResponse, isTruthyEnv, formatDuration } from '../src/utils.js';

describe('coerceDelayMs', () => {
  it('returns fallback for empty/null/undefined', () => {
    expect(coerceDelayMs('', 500)).toBe(500);
    expect(coerceDelayMs(null, 500)).toBe(500);
    expect(coerceDelayMs(undefined, 500)).toBe(500);
  });

  it('parses valid numbers', () => {
    expect(coerceDelayMs('100', 500)).toBe(100);
    expect(coerceDelayMs(0, 500)).toBe(0);
    expect(coerceDelayMs(1000, 500)).toBe(1000);
  });

  it('returns fallback for negative/NaN', () => {
    expect(coerceDelayMs(-1, 500)).toBe(500);
    expect(coerceDelayMs('abc', 500)).toBe(500);
    expect(coerceDelayMs(Infinity, 500)).toBe(500);
  });
});

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates long strings with ellipsis', () => {
    const result = truncate('hello world this is long', 10);
    expect(result.length).toBeLessThanOrEqual(10);
    expect(result.endsWith('…')).toBe(true);
  });

  it('handles limit=1', () => {
    expect(truncate('hello', 1)).toBe('h');
  });

  it('collapses whitespace and newlines', () => {
    expect(truncate('hello\n  world', 140)).toBe('hello world');
    expect(truncate('foo   bar\tbaz', 140)).toBe('foo bar baz');
  });

  it('prefers word boundaries', () => {
    // limit=14: 13 chars + ellipsis; "hello world f" has space at 5, within 20 chars
    const result = truncate('hello world foobar baz', 14);
    expect(result).toBe('hello world…');
  });
});

describe('cleanErrorString', () => {
  it('strips log/error prefixes', () => {
    expect(cleanErrorString('Error: something broke')).toBe('something broke');
    expect(cleanErrorString('TypeError: bad type')).toBe('bad type');
    expect(cleanErrorString('info: starting up')).toBe('starting up');
    expect(cleanErrorString('debug: details')).toBe('details');
    expect(cleanErrorString('warn: heads up')).toBe('heads up');
  });

  it('strips ANSI codes', () => {
    expect(cleanErrorString('\x1B[31mred error\x1B[0m')).toBe('red error');
  });

  it('extracts deeper error from generic exit code', () => {
    expect(cleanErrorString('Command exited with code 1\nFailed to connect')).toBe('Failed to connect');
  });

  it('finds strong error line in multi-line output', () => {
    expect(cleanErrorString('info: starting\nerror: disk full\ndone')).toBe('disk full');
  });

  it('handles empty string', () => {
    expect(cleanErrorString('')).toBe('');
  });
});

describe('isMissingMethodResponse', () => {
  it('returns true for method not found error', () => {
    expect(isMissingMethodResponse({
      ok: false,
      payload: { error: { message: 'method not found' } },
    })).toBe(true);
  });

  it('returns true for unknown method', () => {
    expect(isMissingMethodResponse({
      ok: false,
      error: { message: 'unknown method' },
    })).toBe(true);
  });

  it('returns true for unknown rpc method', () => {
    expect(isMissingMethodResponse({
      ok: false,
      error: { message: 'unknown rpc method' },
    })).toBe(true);
  });

  it('returns true for code-based method not found', () => {
    expect(isMissingMethodResponse({
      ok: false,
      payload: { error: { code: 'METHOD_NOT_FOUND' } },
    })).toBe(true);
  });

  it('returns false for successful response', () => {
    expect(isMissingMethodResponse({ ok: true, payload: { ok: true } })).toBe(false);
  });

  it('returns false for unrelated error', () => {
    expect(isMissingMethodResponse({
      ok: false,
      payload: { error: { message: 'timeout' } },
    })).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isMissingMethodResponse(null)).toBe(false);
    expect(isMissingMethodResponse(undefined)).toBe(false);
  });
});

describe('formatDuration', () => {
  it('shows seconds for < 60s', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45)).toBe('45s');
  });

  it('shows minutes and seconds', () => {
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(135)).toBe('2m 15s');
  });

  it('shows hours and minutes', () => {
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(3660)).toBe('1h 1m');
    expect(formatDuration(7200)).toBe('2h');
  });

  it('handles negative input', () => {
    expect(formatDuration(-5)).toBe('0s');
  });
});

describe('isTruthyEnv', () => {
  it('truthy strings', () => {
    for (const v of ['1', 'true', 'yes', 'y', 'on', 'TRUE', 'Yes', ' 1 ']) {
      expect(isTruthyEnv(v)).toBe(true);
    }
  });

  it('falsy strings', () => {
    for (const v of ['0', 'false', 'no', 'n', 'off', '', 'random']) {
      expect(isTruthyEnv(v)).toBe(false);
    }
  });

  it('booleans', () => {
    expect(isTruthyEnv(true)).toBe(true);
    expect(isTruthyEnv(false)).toBe(false);
  });

  it('numbers', () => {
    expect(isTruthyEnv(1)).toBe(true);
    expect(isTruthyEnv(0)).toBe(false);
    expect(isTruthyEnv(-1)).toBe(false);
    expect(isTruthyEnv(Infinity)).toBe(false);
  });

  it('null/undefined', () => {
    expect(isTruthyEnv(null)).toBe(false);
    expect(isTruthyEnv(undefined)).toBe(false);
  });
});
