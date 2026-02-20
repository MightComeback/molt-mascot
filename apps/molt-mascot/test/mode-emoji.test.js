import { describe, it, expect } from 'bun:test';
import { MODE_EMOJI } from '../src/mode-emoji.cjs';

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
