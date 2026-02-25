import { describe, expect, it } from 'bun:test';
const {
  OPACITY_PRESETS,
  DEFAULT_OPACITY_INDEX,
  nextOpacityIndex,
  prevOpacityIndex,
  findOpacityIndex,
  formatOpacity,
  isPresetOpacity,
  isValidOpacity,
  stepOpacity,
} = require('../src/opacity-presets.cjs');

describe('opacity-presets', () => {
  describe('OPACITY_PRESETS', () => {
    it('is a frozen array of 5 values', () => {
      expect(Object.isFrozen(OPACITY_PRESETS)).toBe(true);
      expect(OPACITY_PRESETS).toHaveLength(5);
    });

    it('starts at 1.0 and ends at 0.2', () => {
      expect(OPACITY_PRESETS[0]).toBe(1.0);
      expect(OPACITY_PRESETS[OPACITY_PRESETS.length - 1]).toBe(0.2);
    });

    it('is in descending order', () => {
      for (let i = 1; i < OPACITY_PRESETS.length; i++) {
        expect(OPACITY_PRESETS[i]).toBeLessThan(OPACITY_PRESETS[i - 1]);
      }
    });

    it('all values are between 0 and 1 inclusive', () => {
      for (const v of OPACITY_PRESETS) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('DEFAULT_OPACITY_INDEX', () => {
    it('is 0 (fully opaque)', () => {
      expect(DEFAULT_OPACITY_INDEX).toBe(0);
      expect(OPACITY_PRESETS[DEFAULT_OPACITY_INDEX]).toBe(1.0);
    });
  });

  describe('nextOpacityIndex', () => {
    it('advances by 1', () => {
      expect(nextOpacityIndex(0)).toBe(1);
      expect(nextOpacityIndex(1)).toBe(2);
      expect(nextOpacityIndex(3)).toBe(4);
    });

    it('wraps around at the end', () => {
      expect(nextOpacityIndex(4)).toBe(0);
    });

    it('returns 0 for invalid input', () => {
      expect(nextOpacityIndex(-1)).toBe(0);
      expect(nextOpacityIndex(NaN)).toBe(0);
      expect(nextOpacityIndex(1.5)).toBe(0);
      expect(nextOpacityIndex(undefined)).toBe(0);
      expect(nextOpacityIndex(null)).toBe(0);
    });

    it('respects custom count', () => {
      expect(nextOpacityIndex(2, 3)).toBe(0); // wraps at 3
      expect(nextOpacityIndex(1, 3)).toBe(2);
    });
  });

  describe('prevOpacityIndex', () => {
    it('goes back by 1', () => {
      expect(prevOpacityIndex(2)).toBe(1);
      expect(prevOpacityIndex(4)).toBe(3);
      expect(prevOpacityIndex(1)).toBe(0);
    });

    it('wraps around at the beginning', () => {
      expect(prevOpacityIndex(0)).toBe(4);
    });

    it('returns last index for invalid input', () => {
      expect(prevOpacityIndex(-1)).toBe(4);
      expect(prevOpacityIndex(NaN)).toBe(4);
      expect(prevOpacityIndex(1.5)).toBe(4);
      expect(prevOpacityIndex(undefined)).toBe(4);
    });

    it('respects custom count', () => {
      expect(prevOpacityIndex(0, 3)).toBe(2);
      expect(prevOpacityIndex(1, 3)).toBe(0);
    });
  });

  describe('findOpacityIndex', () => {
    it('finds exact matches', () => {
      expect(findOpacityIndex(1.0)).toBe(0);
      expect(findOpacityIndex(0.8)).toBe(1);
      expect(findOpacityIndex(0.6)).toBe(2);
      expect(findOpacityIndex(0.4)).toBe(3);
      expect(findOpacityIndex(0.2)).toBe(4);
    });

    it('snaps to closest preset within tolerance', () => {
      expect(findOpacityIndex(0.81)).toBe(1); // close to 0.8
      expect(findOpacityIndex(0.79)).toBe(1); // close to 0.8
      expect(findOpacityIndex(0.61)).toBe(2); // close to 0.6
    });

    it('returns default for values outside tolerance', () => {
      expect(findOpacityIndex(0.5)).toBe(DEFAULT_OPACITY_INDEX); // between 0.4 and 0.6, >0.05 from both
      expect(findOpacityIndex(0.7)).toBe(DEFAULT_OPACITY_INDEX); // between 0.6 and 0.8
    });

    it('returns default for invalid input', () => {
      expect(findOpacityIndex(NaN)).toBe(DEFAULT_OPACITY_INDEX);
      expect(findOpacityIndex(Infinity)).toBe(DEFAULT_OPACITY_INDEX);
      expect(findOpacityIndex(undefined)).toBe(DEFAULT_OPACITY_INDEX);
      expect(findOpacityIndex('0.8')).toBe(DEFAULT_OPACITY_INDEX);
    });
  });

  describe('formatOpacity', () => {
    it('formats as percentage', () => {
      expect(formatOpacity(1.0)).toBe('100%');
      expect(formatOpacity(0.8)).toBe('80%');
      expect(formatOpacity(0.6)).toBe('60%');
      expect(formatOpacity(0.4)).toBe('40%');
      expect(formatOpacity(0.2)).toBe('20%');
      expect(formatOpacity(0)).toBe('0%');
    });

    it('rounds to nearest integer', () => {
      expect(formatOpacity(0.333)).toBe('33%');
      expect(formatOpacity(0.666)).toBe('67%');
    });

    it('returns 100% for invalid input', () => {
      expect(formatOpacity(NaN)).toBe('100%');
      expect(formatOpacity(Infinity)).toBe('100%');
      expect(formatOpacity(undefined)).toBe('100%');
      expect(formatOpacity('0.5')).toBe('100%');
    });
  });

  describe('round-trip cycling', () => {
    it('cycling forward 5 times returns to start', () => {
      let idx = 0;
      for (let i = 0; i < 5; i++) idx = nextOpacityIndex(idx);
      expect(idx).toBe(0);
    });

    it('cycling backward 5 times returns to start', () => {
      let idx = 0;
      for (let i = 0; i < 5; i++) idx = prevOpacityIndex(idx);
      expect(idx).toBe(0);
    });

    it('forward then backward is identity', () => {
      for (let start = 0; start < OPACITY_PRESETS.length; start++) {
        const next = nextOpacityIndex(start);
        const back = prevOpacityIndex(next);
        expect(back).toBe(start);
      }
    });
  });

  describe('isPresetOpacity', () => {
    it('returns true for all preset values', () => {
      for (const v of OPACITY_PRESETS) {
        expect(isPresetOpacity(v)).toBe(true);
      }
    });

    it('returns false for non-preset values', () => {
      expect(isPresetOpacity(0.73)).toBe(false);
      expect(isPresetOpacity(0.5)).toBe(false);
      expect(isPresetOpacity(0.8000000001)).toBe(false);
      expect(isPresetOpacity(0)).toBe(false);
    });

    it('returns false for non-number inputs', () => {
      expect(isPresetOpacity(null)).toBe(false);
      expect(isPresetOpacity(undefined)).toBe(false);
      expect(isPresetOpacity('0.8')).toBe(false);
      expect(isPresetOpacity(NaN)).toBe(false);
      expect(isPresetOpacity(Infinity)).toBe(false);
    });
  });

  describe('stepOpacity', () => {
    it('steps up by 0.1 default', () => {
      expect(stepOpacity(0.5, 1)).toBe(0.6);
    });

    it('steps down by 0.1 default', () => {
      expect(stepOpacity(0.5, -1)).toBe(0.4);
    });

    it('clamps to max (1.0)', () => {
      expect(stepOpacity(1.0, 1)).toBe(1.0);
      expect(stepOpacity(0.9, 1)).toBe(1.0);
    });

    it('clamps to min (0.1)', () => {
      expect(stepOpacity(0.1, -1)).toBe(0.1);
      expect(stepOpacity(0.2, -1)).toBe(0.1);
    });

    it('avoids floating-point drift', () => {
      // 0.1 + 0.2 === 0.30000000000000004 in JS; stepOpacity should round cleanly
      expect(stepOpacity(0.2, 1)).toBe(0.3);
      expect(stepOpacity(0.7, 1)).toBe(0.8);
    });

    it('returns no change for direction 0', () => {
      expect(stepOpacity(0.5, 0)).toBe(0.5);
    });

    it('handles custom step size', () => {
      expect(stepOpacity(0.5, 1, { step: 0.05 })).toBe(0.55);
      expect(stepOpacity(0.5, -1, { step: 0.25 })).toBe(0.25);
    });

    it('handles custom min/max', () => {
      expect(stepOpacity(0.3, -1, { min: 0.3 })).toBe(0.3);
      expect(stepOpacity(0.8, 1, { max: 0.8 })).toBe(0.8);
    });

    it('handles invalid current value', () => {
      expect(stepOpacity(NaN, -1)).toBe(0.9);
      expect(stepOpacity(undefined, 1)).toBe(1.0);
    });
  });

  describe('isValidOpacity', () => {
    it('accepts valid opacity values', () => {
      expect(isValidOpacity(0)).toBe(true);
      expect(isValidOpacity(0.5)).toBe(true);
      expect(isValidOpacity(1)).toBe(true);
      expect(isValidOpacity(0.001)).toBe(true);
      expect(isValidOpacity(0.999)).toBe(true);
    });

    it('rejects out-of-range numbers', () => {
      expect(isValidOpacity(-0.1)).toBe(false);
      expect(isValidOpacity(1.1)).toBe(false);
      expect(isValidOpacity(2)).toBe(false);
      expect(isValidOpacity(-1)).toBe(false);
    });

    it('rejects non-finite numbers', () => {
      expect(isValidOpacity(NaN)).toBe(false);
      expect(isValidOpacity(Infinity)).toBe(false);
      expect(isValidOpacity(-Infinity)).toBe(false);
    });

    it('rejects non-number types', () => {
      expect(isValidOpacity('0.5')).toBe(false);
      expect(isValidOpacity(null)).toBe(false);
      expect(isValidOpacity(undefined)).toBe(false);
      expect(isValidOpacity(true)).toBe(false);
      expect(isValidOpacity({})).toBe(false);
    });
  });
});
