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
 * Internal Set for O(1) size validation lookups.
 */
const _VALID_SIZES_SET = new Set(VALID_SIZES);

/**
 * Check whether a string is a recognized size preset label (case-insensitive).
 * @param {*} value
 * @returns {boolean}
 */
function isValidSize(value) {
  if (typeof value !== 'string') return false;
  return _VALID_SIZES_SET.has(value.trim().toLowerCase());
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

/**
 * Compute the previous size preset index when cycling through sizes in reverse.
 * Wraps around to the last preset when going below 0.
 * Useful for bidirectional size cycling (e.g., "shrink" shortcut or scroll-wheel down).
 *
 * @param {number} currentIndex - Current size preset index
 * @param {number} [count] - Number of presets (defaults to SIZE_PRESETS.length)
 * @returns {number} Previous index (wraps around)
 */
function prevSizeIndex(currentIndex, count) {
  const n = typeof count === 'number' && count > 0 ? count : SIZE_PRESETS.length;
  if (typeof currentIndex !== 'number' || currentIndex < 0 || !Number.isInteger(currentIndex)) return n - 1;
  return (currentIndex - 1 + n) % n;
}

/**
 * Format a size preset as a compact display string: "label (W×H)".
 * Used in --status output, tray tooltip, and debug info for consistent sizing display.
 *
 * @param {string} label - Size label (e.g. 'medium')
 * @param {number} width - Window width in pixels
 * @param {number} height - Window height in pixels
 * @returns {string} Formatted string (e.g. "medium (240×200)")
 */
function formatSizeLabel(label, width, height) {
  if (!label) return `${width}×${height}`;
  return `${label} (${width}×${height})`;
}

/**
 * Find the index of a size preset by label (case-insensitive).
 * Returns -1 if not found. Mirrors findAlignmentIndex / findOpacityIndex
 * for API consistency across cycling modules.
 *
 * @param {string} label - Size label to find (e.g. 'small', 'Large')
 * @returns {number} Index in SIZE_PRESETS, or -1 if not found
 */
function findSizeIndex(label) {
  if (typeof label !== 'string') return -1;
  const normalized = label.trim().toLowerCase();
  return SIZE_PRESETS.findIndex(p => p.label === normalized);
}

/**
 * Format a size label with its pixel dimensions resolved from presets.
 * Convenience wrapper: looks up the preset by label and formats as "label W×H".
 * Falls back to the raw label (or 'medium') if no preset matches.
 *
 * Used by context-menu-items and tray-icon for compact size display
 * without requiring callers to manually resolve the preset first.
 *
 * @param {string} label - Size preset label (e.g. 'medium', 'large')
 * @returns {string} Formatted string (e.g. "medium 240×200")
 */
function formatSizeWithDims(label) {
  const preset = findSizePreset(label);
  if (preset) return `${preset.label} ${preset.width}×${preset.height}`;
  return label || 'medium';
}

module.exports = { SIZE_PRESETS, DEFAULT_SIZE_INDEX, findSizePreset, findSizeIndex, resolveSizePreset, VALID_SIZES, isValidSize, nextSizeIndex, prevSizeIndex, formatSizeLabel, formatSizeWithDims };
