/**
 * Size presets for the Molt Mascot window.
 * Shared between electron-main (window sizing) and renderer (display).
 *
 * Extracted from electron-main.cjs so presets are testable, reusable,
 * and don't drift between components.
 */

const SIZE_PRESETS = Object.freeze([
  Object.freeze({ label: 'tiny',   width: 120, height: 100 }),
  Object.freeze({ label: 'small',  width: 160, height: 140 }),
  Object.freeze({ label: 'medium', width: 240, height: 200 }),
  Object.freeze({ label: 'large',  width: 360, height: 300 }),
  Object.freeze({ label: 'xlarge', width: 480, height: 400 }),
]);

/** Default size preset index (medium). */
const DEFAULT_SIZE_INDEX = 2;

/**
 * Look up a size preset by label (case-insensitive).
 * Returns the preset object or null if not found.
 *
 * @param {string} label - Preset name (e.g. 'small', 'Large', 'XLARGE')
 * @returns {{ label: string, width: number, height: number } | null}
 */
function findSizePreset(label) {
  if (typeof label !== 'string' || !label.trim()) return null;
  const normalized = label.trim().toLowerCase();
  return SIZE_PRESETS.find(p => p.label === normalized) || null;
}

/**
 * Resolve initial size from a label string (e.g. from env var or CLI).
 * Falls back to the default (medium) if the label is invalid.
 *
 * @param {string} [label] - Preset name
 * @returns {{ label: string, width: number, height: number, index: number }}
 */
function resolveSizePreset(label) {
  const preset = findSizePreset(label);
  if (preset) {
    const index = SIZE_PRESETS.indexOf(preset);
    return { ...preset, index };
  }
  return { ...SIZE_PRESETS[DEFAULT_SIZE_INDEX], index: DEFAULT_SIZE_INDEX };
}

/**
 * Flat array of valid size label strings (lowercase).
 * Mirrors VALID_ALIGNMENTS in get-position.cjs for consistent validation patterns.
 */
const VALID_SIZES = Object.freeze(SIZE_PRESETS.map(p => p.label));

/**
 * Check whether a string is a recognized size preset label (case-insensitive).
 * @param {*} value
 * @returns {boolean}
 */
function isValidSize(value) {
  if (typeof value !== 'string') return false;
  return VALID_SIZES.includes(value.trim().toLowerCase());
}

/**
 * Compute the next size preset index when cycling through sizes.
 * Wraps around to 0 after the last preset.
 *
 * @param {number} currentIndex - Current size preset index
 * @param {number} [count] - Number of presets (defaults to SIZE_PRESETS.length)
 * @returns {number} Next index (wraps around)
 */
function nextSizeIndex(currentIndex, count) {
  const n = typeof count === 'number' && count > 0 ? count : SIZE_PRESETS.length;
  if (typeof currentIndex !== 'number' || currentIndex < 0 || !Number.isInteger(currentIndex)) return 0;
  return (currentIndex + 1) % n;
}

module.exports = { SIZE_PRESETS, DEFAULT_SIZE_INDEX, findSizePreset, resolveSizePreset, VALID_SIZES, isValidSize, nextSizeIndex };
