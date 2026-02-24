import { describe, it, expect } from 'bun:test';
import { GATEWAY_URL_KEYS, GATEWAY_TOKEN_KEYS, resolveEnv, resolveEnvWithSource, parseEnvNumber, REPO_URL } from '../src/env-keys.cjs';

describe('env-keys constants', () => {
  it('GATEWAY_URL_KEYS is a frozen array with expected first entry', () => {
    expect(Object.isFrozen(GATEWAY_URL_KEYS)).toBe(true);
    expect(GATEWAY_URL_KEYS[0]).toBe('MOLT_MASCOT_GATEWAY_URL');
    expect(GATEWAY_URL_KEYS.length).toBe(5);
  });

  it('GATEWAY_TOKEN_KEYS is a frozen array with expected first entry', () => {
    expect(Object.isFrozen(GATEWAY_TOKEN_KEYS)).toBe(true);
    expect(GATEWAY_TOKEN_KEYS[0]).toBe('MOLT_MASCOT_GATEWAY_TOKEN');
    expect(GATEWAY_TOKEN_KEYS.length).toBe(5);
  });

  it('URL and token key lists have parallel structure', () => {
    // Both should cover the same prefixes in the same order
    for (let i = 0; i < GATEWAY_URL_KEYS.length; i++) {
      const urlKey = GATEWAY_URL_KEYS[i].replace(/URL$/i, '').replace(/Url$/, '');
      const tokenKey = GATEWAY_TOKEN_KEYS[i].replace(/TOKEN$/i, '').replace(/Token$/, '');
      expect(urlKey).toBe(tokenKey);
    }
  });
});

describe('resolveEnv', () => {
  it('returns the first non-empty match', () => {
    const env = { B: 'second', A: 'first' };
    expect(resolveEnv(['A', 'B'], env)).toBe('first');
  });

  it('skips empty strings', () => {
    const env = { A: '', B: 'fallback' };
    expect(resolveEnv(['A', 'B'], env)).toBe('fallback');
  });

  it('skips undefined keys', () => {
    const env = { B: 'found' };
    expect(resolveEnv(['A', 'B'], env)).toBe('found');
  });

  it('returns fallback when no key matches', () => {
    expect(resolveEnv(['X', 'Y'], {})).toBe('');
    expect(resolveEnv(['X', 'Y'], {}, 'default')).toBe('default');
  });

  it('returns fallback for empty keys array', () => {
    expect(resolveEnv([], { A: 'val' })).toBe('');
  });

  it('works with real gateway URL keys', () => {
    const env = { GATEWAY_URL: 'ws://localhost:18789' };
    expect(resolveEnv(GATEWAY_URL_KEYS, env)).toBe('ws://localhost:18789');
  });

  it('higher-priority key wins over lower', () => {
    const env = {
      MOLT_MASCOT_GATEWAY_URL: 'ws://custom:1234',
      GATEWAY_URL: 'ws://default:5678',
    };
    expect(resolveEnv(GATEWAY_URL_KEYS, env)).toBe('ws://custom:1234');
  });
});

describe('resolveEnvWithSource', () => {
  it('returns matched key and value', () => {
    const env = { B: 'second', A: 'first' };
    expect(resolveEnvWithSource(['A', 'B'], env)).toEqual({ key: 'A', value: 'first' });
  });

  it('skips empty strings', () => {
    const env = { A: '', B: 'fallback' };
    expect(resolveEnvWithSource(['A', 'B'], env)).toEqual({ key: 'B', value: 'fallback' });
  });

  it('returns null when no key matches', () => {
    expect(resolveEnvWithSource(['X', 'Y'], {})).toBeNull();
  });

  it('returns null for empty keys array', () => {
    expect(resolveEnvWithSource([], { A: 'val' })).toBeNull();
  });

  it('higher-priority key wins', () => {
    const env = {
      MOLT_MASCOT_GATEWAY_URL: 'ws://custom:1234',
      GATEWAY_URL: 'ws://default:5678',
    };
    const result = resolveEnvWithSource(GATEWAY_URL_KEYS, env);
    expect(result).toEqual({ key: 'MOLT_MASCOT_GATEWAY_URL', value: 'ws://custom:1234' });
  });
});

describe('parseEnvNumber', () => {
  it('returns parsed number from env', () => {
    expect(parseEnvNumber({ FOO: '42' }, 'FOO', 0)).toBe(42);
  });

  it('returns fallback when key is absent', () => {
    expect(parseEnvNumber({}, 'FOO', 99)).toBe(99);
  });

  it('returns fallback for empty string', () => {
    expect(parseEnvNumber({ FOO: '' }, 'FOO', 99)).toBe(99);
  });

  it('returns fallback for non-numeric value', () => {
    expect(parseEnvNumber({ FOO: 'abc' }, 'FOO', 99)).toBe(99);
  });

  it('returns fallback for Infinity', () => {
    expect(parseEnvNumber({ FOO: 'Infinity' }, 'FOO', 99)).toBe(99);
  });

  it('returns fallback for NaN', () => {
    expect(parseEnvNumber({ FOO: 'NaN' }, 'FOO', 99)).toBe(99);
  });

  it('respects min constraint', () => {
    expect(parseEnvNumber({ FOO: '-1' }, 'FOO', 99, { min: 0 })).toBe(99);
    expect(parseEnvNumber({ FOO: '0' }, 'FOO', 99, { min: 0 })).toBe(0);
  });

  it('respects max constraint', () => {
    expect(parseEnvNumber({ FOO: '200' }, 'FOO', 99, { max: 100 })).toBe(99);
    expect(parseEnvNumber({ FOO: '100' }, 'FOO', 99, { max: 100 })).toBe(100);
  });

  it('respects integer constraint', () => {
    expect(parseEnvNumber({ FOO: '3.5' }, 'FOO', 99, { integer: true })).toBe(99);
    expect(parseEnvNumber({ FOO: '3' }, 'FOO', 99, { integer: true })).toBe(3);
  });

  it('accepts array of keys (first non-empty wins)', () => {
    expect(parseEnvNumber({ B: '10' }, ['A', 'B'], 99)).toBe(10);
    expect(parseEnvNumber({ A: '5', B: '10' }, ['A', 'B'], 99)).toBe(5);
  });

  it('parses float values', () => {
    expect(parseEnvNumber({ FOO: '0.5' }, 'FOO', 1)).toBe(0.5);
  });
});

describe('REPO_URL', () => {
  it('is a valid GitHub HTTPS URL', () => {
    expect(typeof REPO_URL).toBe('string');
    expect(REPO_URL).toMatch(/^https:\/\/github\.com\//);
  });
});
