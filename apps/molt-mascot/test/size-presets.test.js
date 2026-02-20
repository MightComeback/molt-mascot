import { describe, it, expect } from 'bun:test';
import { SIZE_PRESETS, DEFAULT_SIZE_INDEX, findSizePreset, resolveSizePreset } from '../src/size-presets.cjs';

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
});
