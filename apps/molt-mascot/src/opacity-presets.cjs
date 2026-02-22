/**
 * Opacity presets for the Molt Mascot window.
 * Mirrors the size-presets.cjs pattern for consistency.
 *
 * Extracted from electron-main.cjs so opacity cycling logic is testable,
 * reusable, and doesn't drift between components (electron-main, status-cli, etc.).
 */

/** Ordered opacity presets cycled by the keyboard shortcut / context menu. */
const OPACITY_PRESETS = Object.freeze([1.0, 0.8, 0.6, 0.4, 0.2]);

/** Default opacity preset index (fully opaque). */
const DEFAULT_OPACITY_INDEX = 0;

/**
 * Compute the next opacity preset index when cycling forward.
 * Wraps around to 0 after the last preset.
 *
 * @param {number} currentIndex - Current opacity preset index
 * @param {number} [count] - Number of presets (defaults to OPACITY_PRESETS.length)
 * @returns {number} Next index (wraps around)
 */
function nextOpacityIndex(currentIndex, count) {
  const n = typeof count === 'number' && count > 0 ? count : OPACITY_PRESETS.length;
  if (typeof currentIndex !== 'number' || currentIndex < 0 || !Number.isInteger(currentIndex)) return 0;
  return (currentIndex + 1) % n;
}

/**
 * Compute the previous opacity preset index when cycling backward.
 * Wraps around to the last preset when going below 0.
 *
 * @param {number} currentIndex - Current opacity preset index
 * @param {number} [count] - Number of presets (defaults to OPACITY_PRESETS.length)
 * @returns {number} Previous index (wraps around)
 */
function prevOpacityIndex(currentIndex, count) {
  const n = typeof count === 'number' && count > 0 ? count : OPACITY_PRESETS.length;
  if (typeof currentIndex !== 'number' || currentIndex < 0 || !Number.isInteger(currentIndex)) return n - 1;
  return (currentIndex - 1 + n) % n;
}

/**
 * Resolve the initial opacity index from a numeric opacity value.
 * Finds the closest matching preset, or returns DEFAULT_OPACITY_INDEX if no match.
 *
 * @param {number} opacity - Opacity value (0.0–1.0)
 * @returns {number} Matching preset index, or DEFAULT_OPACITY_INDEX
 */
function findOpacityIndex(opacity) {
  if (typeof opacity !== 'number' || !Number.isFinite(opacity)) return DEFAULT_OPACITY_INDEX;
  const idx = OPACITY_PRESETS.indexOf(opacity);
  if (idx >= 0) return idx;
  // Find closest preset (handles floating point rounding, e.g. 0.8000000001)
  let bestIdx = DEFAULT_OPACITY_INDEX;
  let bestDist = Infinity;
  for (let i = 0; i < OPACITY_PRESETS.length; i++) {
    const dist = Math.abs(OPACITY_PRESETS[i] - opacity);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  // Only snap to a preset if within 0.05 tolerance (avoid surprising snaps)
  return bestDist <= 0.05 ? bestIdx : DEFAULT_OPACITY_INDEX;
}

/**
 * Format an opacity value as a percentage string for display.
 *
 * @param {number} opacity - Opacity value (0.0–1.0)
 * @returns {string} Formatted percentage (e.g. "80%")
 */
function formatOpacity(opacity) {
  if (typeof opacity !== 'number' || !Number.isFinite(opacity)) return '100%';
  return `${Math.round(opacity * 100)}%`;
}

module.exports = {
  OPACITY_PRESETS,
  DEFAULT_OPACITY_INDEX,
  nextOpacityIndex,
  prevOpacityIndex,
  findOpacityIndex,
  formatOpacity,
};
