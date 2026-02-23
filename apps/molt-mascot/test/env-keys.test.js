import { describe, it, expect } from 'bun:test';
import { GATEWAY_URL_KEYS, GATEWAY_TOKEN_KEYS, resolveEnv, REPO_URL } from '../src/env-keys.cjs';

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

describe('REPO_URL', () => {
  it('is a valid GitHub HTTPS URL', () => {
    expect(typeof REPO_URL).toBe('string');
    expect(REPO_URL).toMatch(/^https:\/\/github\.com\//);
  });
});
