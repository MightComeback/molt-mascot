import { describe, expect, it } from 'bun:test';
import { isTruthyEnv } from '../src/is-truthy-env.cjs';

describe('isTruthyEnv', () => {
  it('returns true for truthy string values', () => {
    for (const v of ['1', 'true', 'TRUE', 'True', 't', 'T', 'yes', 'YES', 'y', 'Y', 'on', 'ON']) {
      expect(isTruthyEnv(v)).toBe(true);
    }
  });

  it('returns false for falsy string values', () => {
    for (const v of ['0', 'false', 'FALSE', 'no', 'off', '', ' ', 'maybe', 'nope']) {
      expect(isTruthyEnv(v)).toBe(false);
    }
  });

  it('handles whitespace-padded strings', () => {
    expect(isTruthyEnv('  true  ')).toBe(true);
    expect(isTruthyEnv('  false  ')).toBe(false);
    expect(isTruthyEnv('  1  ')).toBe(true);
  });

  it('handles boolean inputs', () => {
    expect(isTruthyEnv(true)).toBe(true);
    expect(isTruthyEnv(false)).toBe(false);
  });

  it('handles number inputs', () => {
    expect(isTruthyEnv(1)).toBe(true);
    expect(isTruthyEnv(42)).toBe(true);
    expect(isTruthyEnv(0)).toBe(false);
    expect(isTruthyEnv(-1)).toBe(false);
    expect(isTruthyEnv(NaN)).toBe(false);
    expect(isTruthyEnv(Infinity)).toBe(false); // Number.isFinite(Infinity) is false
  });

  it('returns false for null/undefined/objects', () => {
    expect(isTruthyEnv(null)).toBe(false);
    expect(isTruthyEnv(undefined)).toBe(false);
    expect(isTruthyEnv({})).toBe(false);
    expect(isTruthyEnv([])).toBe(false);
  });
});
