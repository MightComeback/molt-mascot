import { describe, it, expect } from 'bun:test';
import { SIZE_PRESETS, DEFAULT_SIZE_INDEX, findSizePreset, findSizeIndex, resolveSizePreset, VALID_SIZES, isValidSize, nextSizeIndex, prevSizeIndex, formatSizeLabel } from '../src/size-presets.cjs';

describe('size-presets', () => {
  it('SIZE_PRESETS has exactly 5 entries', () => {
    expect(SIZE_PRESETS).toHaveLength(5);
    expect(SIZE_PRESETS.map(p => p.label)).toEqual(['tiny', 'small', 'medium', 'large', 'xlarge']);
  });

  it('DEFAULT_SIZE_INDEX points to medium', () => {
    expect(SIZE_PRESETS[DEFAULT_SIZE_INDEX].label).toBe('medium');
  });

  it('all presets have positive width and height', () => {
    for (const preset of SIZE_PRESETS) {
      expect(preset.width).toBeGreaterThan(0);
      expect(preset.height).toBeGreaterThan(0);
    }
  });

  it('presets are frozen (immutable)', () => {
    expect(Object.isFrozen(SIZE_PRESETS)).toBe(true);
    for (const preset of SIZE_PRESETS) {
      expect(Object.isFrozen(preset)).toBe(true);
    }
  });

  describe('findSizePreset', () => {
    it('finds by exact label', () => {
      expect(findSizePreset('small')).toEqual({ label: 'small', width: 160, height: 140 });
      expect(findSizePreset('xlarge')).toEqual({ label: 'xlarge', width: 480, height: 400 });
    });

    it('is case-insensitive', () => {
      expect(findSizePreset('MEDIUM')).toEqual({ label: 'medium', width: 240, height: 200 });
      expect(findSizePreset('Large')).toEqual({ label: 'large', width: 360, height: 300 });
    });

    it('trims whitespace', () => {
      expect(findSizePreset('  small  ')).toEqual({ label: 'small', width: 160, height: 140 });
    });

    it('returns null for invalid labels', () => {
      expect(findSizePreset('huge')).toBeNull();
      expect(findSizePreset('')).toBeNull();
      expect(findSizePreset(null)).toBeNull();
      expect(findSizePreset(undefined)).toBeNull();
      expect(findSizePreset(42)).toBeNull();
    });
  });

  describe('resolveSizePreset', () => {
    it('resolves valid labels with index', () => {
      const result = resolveSizePreset('large');
      expect(result.label).toBe('large');
      expect(result.width).toBe(360);
      expect(result.height).toBe(300);
      expect(result.index).toBe(3);
    });

    it('falls back to medium for invalid labels', () => {
      const result = resolveSizePreset('invalid');
      expect(result.label).toBe('medium');
      expect(result.index).toBe(DEFAULT_SIZE_INDEX);
    });

    it('falls back to medium for undefined', () => {
      const result = resolveSizePreset();
      expect(result.label).toBe('medium');
    });

    it('is case-insensitive', () => {
      expect(resolveSizePreset('XLARGE').index).toBe(4);
    });
  });

  describe('VALID_SIZES', () => {
    it('is a frozen array of lowercase label strings', () => {
      expect(Object.isFrozen(VALID_SIZES)).toBe(true);
      expect(VALID_SIZES).toEqual(['tiny', 'small', 'medium', 'large', 'xlarge']);
    });

    it('matches SIZE_PRESETS labels exactly', () => {
      expect(VALID_SIZES).toEqual(SIZE_PRESETS.map(p => p.label));
    });
  });

  describe('isValidSize', () => {
    it('returns true for valid size labels', () => {
      for (const label of VALID_SIZES) {
        expect(isValidSize(label)).toBe(true);
      }
    });

    it('is case-insensitive', () => {
      expect(isValidSize('SMALL')).toBe(true);
      expect(isValidSize('Large')).toBe(true);
      expect(isValidSize('xLaRgE')).toBe(true);
    });

    it('trims whitespace', () => {
      expect(isValidSize('  medium  ')).toBe(true);
    });

    it('returns false for invalid labels', () => {
      expect(isValidSize('huge')).toBe(false);
      expect(isValidSize('giant')).toBe(false);
      expect(isValidSize('')).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(isValidSize(null)).toBe(false);
      expect(isValidSize(undefined)).toBe(false);
      expect(isValidSize(42)).toBe(false);
      expect(isValidSize(true)).toBe(false);
      expect(isValidSize({})).toBe(false);
    });
  });

  describe('nextSizeIndex', () => {
    it('advances to the next index', () => {
      expect(nextSizeIndex(0)).toBe(1);
      expect(nextSizeIndex(1)).toBe(2);
      expect(nextSizeIndex(3)).toBe(4);
    });

    it('wraps around at the end', () => {
      expect(nextSizeIndex(4)).toBe(0);
    });

    it('accepts custom count', () => {
      expect(nextSizeIndex(2, 3)).toBe(0);
      expect(nextSizeIndex(1, 3)).toBe(2);
    });

    it('returns 0 for invalid inputs', () => {
      expect(nextSizeIndex(-1)).toBe(0);
      expect(nextSizeIndex(null)).toBe(0);
      expect(nextSizeIndex(undefined)).toBe(0);
      expect(nextSizeIndex(1.5)).toBe(0);
    });
  });

  describe('prevSizeIndex', () => {
    it('goes to the previous index', () => {
      expect(prevSizeIndex(4)).toBe(3);
      expect(prevSizeIndex(2)).toBe(1);
      expect(prevSizeIndex(1)).toBe(0);
    });

    it('wraps around at the beginning', () => {
      expect(prevSizeIndex(0)).toBe(4);
    });

    it('accepts custom count', () => {
      expect(prevSizeIndex(0, 3)).toBe(2);
      expect(prevSizeIndex(2, 3)).toBe(1);
    });

    it('returns last index for invalid inputs', () => {
      expect(prevSizeIndex(-1)).toBe(4);
      expect(prevSizeIndex(null)).toBe(4);
      expect(prevSizeIndex(undefined)).toBe(4);
      expect(prevSizeIndex(1.5)).toBe(4);
    });

    it('is inverse of nextSizeIndex', () => {
      for (let i = 0; i < SIZE_PRESETS.length; i++) {
        expect(prevSizeIndex(nextSizeIndex(i))).toBe(i);
        expect(nextSizeIndex(prevSizeIndex(i))).toBe(i);
      }
    });
  });

  describe('formatSizeLabel', () => {
    it('formats label with dimensions', () => {
      expect(formatSizeLabel('medium', 240, 200)).toBe('medium (240×200)');
    });

    it('returns dimensions only when label is empty', () => {
      expect(formatSizeLabel('', 100, 80)).toBe('100×80');
    });

    it('returns dimensions only when label is null/undefined', () => {
      expect(formatSizeLabel(null, 100, 80)).toBe('100×80');
      expect(formatSizeLabel(undefined, 100, 80)).toBe('100×80');
    });
  });

  describe('findSizeIndex', () => {
    it('returns correct index for each valid label', () => {
      expect(findSizeIndex('tiny')).toBe(0);
      expect(findSizeIndex('small')).toBe(1);
      expect(findSizeIndex('medium')).toBe(2);
      expect(findSizeIndex('large')).toBe(3);
      expect(findSizeIndex('xlarge')).toBe(4);
    });

    it('is case-insensitive', () => {
      expect(findSizeIndex('Medium')).toBe(2);
      expect(findSizeIndex('LARGE')).toBe(3);
    });

    it('trims whitespace', () => {
      expect(findSizeIndex('  small  ')).toBe(1);
    });

    it('returns -1 for unknown labels', () => {
      expect(findSizeIndex('huge')).toBe(-1);
      expect(findSizeIndex('')).toBe(-1);
    });

    it('returns -1 for non-string inputs', () => {
      expect(findSizeIndex(null)).toBe(-1);
      expect(findSizeIndex(undefined)).toBe(-1);
      expect(findSizeIndex(42)).toBe(-1);
    });
  });
});
