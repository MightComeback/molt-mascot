import { describe, it, expect } from 'bun:test';
import { MODE, MODE_EMOJI, MODE_DESCRIPTIONS, VALID_MODES, isValidMode } from '../src/mode-emoji.cjs';

describe('MODE', () => {
  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(MODE)).toBe(true);
  });

  it('every key maps to itself as a string value', () => {
    for (const [key, value] of Object.entries(MODE)) {
      expect(value).toBe(key);
    }
  });

  it('contains all VALID_MODES entries', () => {
    for (const mode of VALID_MODES) {
      expect(MODE).toHaveProperty(mode);
    }
  });

  it('has no extra keys beyond VALID_MODES + sleeping', () => {
    const modeKeys = Object.keys(MODE).sort();
    const expected = [...new Set([...VALID_MODES, 'sleeping'])].sort();
    expect(modeKeys).toEqual(expected);
  });
});

describe('MODE_EMOJI', () => {
  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(MODE_EMOJI)).toBe(true);
  });

  const EXPECTED_MODES = [
    'idle',
    'thinking',
    'tool',
    'error',
    'connecting',
    'disconnected',
    'connected',
    'sleeping',
  ];

  it('has entries for all expected modes', () => {
    for (const mode of EXPECTED_MODES) {
      expect(MODE_EMOJI).toHaveProperty(mode);
      expect(typeof MODE_EMOJI[mode]).toBe('string');
      expect(MODE_EMOJI[mode].length).toBeGreaterThan(0);
    }
  });

  it('has no unexpected extra modes', () => {
    const keys = Object.keys(MODE_EMOJI);
    expect(keys.sort()).toEqual([...EXPECTED_MODES].sort());
  });

  it('each emoji is a non-empty string', () => {
    for (const [, emoji] of Object.entries(MODE_EMOJI)) {
      expect(typeof emoji).toBe('string');
      expect(emoji.trim().length).toBeGreaterThan(0);
    }
  });

  it('all emojis are unique', () => {
    const values = Object.values(MODE_EMOJI);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('VALID_MODES', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(VALID_MODES)).toBe(true);
  });

  it('matches MODE_EMOJI keys', () => {
    expect([...VALID_MODES].sort()).toEqual(Object.keys(MODE_EMOJI).sort());
  });
});

describe('MODE_DESCRIPTIONS', () => {
  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(MODE_DESCRIPTIONS)).toBe(true);
  });

  it('has a description for every MODE_EMOJI key', () => {
    for (const mode of Object.keys(MODE_EMOJI)) {
      expect(MODE_DESCRIPTIONS).toHaveProperty(mode);
      expect(typeof MODE_DESCRIPTIONS[mode]).toBe('string');
      expect(MODE_DESCRIPTIONS[mode].length).toBeGreaterThan(0);
    }
  });

  it('has no extra keys beyond MODE_EMOJI', () => {
    expect(Object.keys(MODE_DESCRIPTIONS).sort()).toEqual(Object.keys(MODE_EMOJI).sort());
  });

  it('all descriptions are unique', () => {
    const values = Object.values(MODE_DESCRIPTIONS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('isValidMode', () => {
  it('returns true for all known modes', () => {
    for (const mode of VALID_MODES) {
      expect(isValidMode(mode)).toBe(true);
    }
  });

  it('returns false for unknown strings', () => {
    expect(isValidMode('unknown')).toBe(false);
    expect(isValidMode('IDLE')).toBe(false);
    expect(isValidMode('')).toBe(false);
  });

  it('returns false for non-string values', () => {
    expect(isValidMode(null)).toBe(false);
    expect(isValidMode(undefined)).toBe(false);
    expect(isValidMode(42)).toBe(false);
    expect(isValidMode(true)).toBe(false);
  });
});
