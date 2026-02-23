import { describe, expect, it } from 'bun:test';
import { isTruthyEnv, isFalsyEnv } from '../src/is-truthy-env.cjs';

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

describe('isFalsyEnv', () => {
  it('returns true for explicitly falsy string values', () => {
    for (const v of ['0', 'false', 'FALSE', 'False', 'f', 'F', 'no', 'NO', 'n', 'N', 'off', 'OFF']) {
      expect(isFalsyEnv(v)).toBe(true);
    }
  });

  it('returns false for truthy string values', () => {
    for (const v of ['1', 'true', 'yes', 'on', 't', 'y']) {
      expect(isFalsyEnv(v)).toBe(false);
    }
  });

  it('returns false for ambiguous/empty strings (not set, not explicitly false)', () => {
    for (const v of ['', ' ', 'maybe', 'nope', 'disabled']) {
      expect(isFalsyEnv(v)).toBe(false);
    }
  });

  it('handles whitespace-padded strings', () => {
    expect(isFalsyEnv('  false  ')).toBe(true);
    expect(isFalsyEnv('  0  ')).toBe(true);
    expect(isFalsyEnv('  off  ')).toBe(true);
  });

  it('handles boolean inputs', () => {
    expect(isFalsyEnv(false)).toBe(true);
    expect(isFalsyEnv(true)).toBe(false);
  });

  it('handles number inputs', () => {
    expect(isFalsyEnv(0)).toBe(true);
    expect(isFalsyEnv(1)).toBe(false);
    expect(isFalsyEnv(-1)).toBe(false);
    expect(isFalsyEnv(NaN)).toBe(false);
    expect(isFalsyEnv(Infinity)).toBe(false);
  });

  it('returns false for null/undefined/objects (not set ≠ explicitly false)', () => {
    expect(isFalsyEnv(null)).toBe(false);
    expect(isFalsyEnv(undefined)).toBe(false);
    expect(isFalsyEnv({})).toBe(false);
    expect(isFalsyEnv([])).toBe(false);
  });

  it('is complementary to isTruthyEnv (three-state: truthy/falsy/unset)', () => {
    // Explicitly true
    expect(isTruthyEnv('true')).toBe(true);
    expect(isFalsyEnv('true')).toBe(false);
    // Explicitly false
    expect(isTruthyEnv('false')).toBe(false);
    expect(isFalsyEnv('false')).toBe(true);
    // Not set (neither truthy nor falsy)
    expect(isTruthyEnv(undefined)).toBe(false);
    expect(isFalsyEnv(undefined)).toBe(false);
    expect(isTruthyEnv('')).toBe(false);
    expect(isFalsyEnv('')).toBe(false);
  });
});
