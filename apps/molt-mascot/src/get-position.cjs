/**
 * Canonical set of valid alignment values.
 * Delegated to the plugin package (single source of truth) so the Electron
 * main process, renderer, and plugin never drift.
 */
const { allowedAlignments } = require("@molt/mascot-plugin");
const VALID_ALIGNMENTS = Object.freeze([...allowedAlignments]);

/**
 * Internal Set for O(1) alignment validation lookups.
 * Alignments are already lowercase in the canonical list.
 */
const _VALID_ALIGNMENTS_SET = new Set(VALID_ALIGNMENTS);

/**
 * Check whether a string is a recognized alignment value (case-insensitive).
 * @param {string} value
 * @returns {boolean}
 */
function isValidAlignment(value) {
  if (typeof value !== "string") return false;
  return _VALID_ALIGNMENTS_SET.has(value.trim().toLowerCase());
}

/**
 * Pure function to compute window position for a given display, size, alignment, and padding.
 * Extracted from electron-main.cjs for testability.
 */
function getPosition(display, width, height, alignOverride, paddingOverride) {
  const basePadding = 24;
  const padding =
    Number.isFinite(paddingOverride) && paddingOverride >= 0
      ? paddingOverride
      : basePadding;

  const rawAlign =
    typeof alignOverride === "string" && alignOverride.trim()
      ? alignOverride
      : "bottom-right";
  const align = rawAlign.toLowerCase();
  const { x, y, width: dw, height: dh } = display.workArea;

  // Round to integers — fractional pixel positions cause blurry rendering
  // on non-Retina displays and trigger Electron console warnings.
  let px, py;
  switch (align) {
    case "bottom-left":
      px = x + padding;
      py = y + dh - height - padding;
      break;
    case "top-right":
      px = x + dw - width - padding;
      py = y + padding;
      break;
    case "top-left":
      px = x + padding;
      py = y + padding;
      break;
    case "center":
      px = x + (dw - width) / 2;
      py = y + (dh - height) / 2;
      break;
    case "center-left":
      px = x + padding;
      py = y + (dh - height) / 2;
      break;
    case "center-right":
      px = x + dw - width - padding;
      py = y + (dh - height) / 2;
      break;
    case "top-center":
      px = x + (dw - width) / 2;
      py = y + padding;
      break;
    case "bottom-center":
      px = x + (dw - width) / 2;
      py = y + dh - height - padding;
      break;
    case "bottom-right":
    default:
      px = x + dw - width - padding;
      py = y + dh - height - padding;
      break;
  }
  // Clamp to work area so the window never ends up off-screen
  // (e.g. when padding is larger than the display or window exceeds display size).
  px = Math.max(x, Math.min(px, x + dw - width));
  py = Math.max(y, Math.min(py, y + dh - height));

  return { x: Math.round(px), y: Math.round(py) };
}

/**
 * Clamp a window position to the nearest visible work area so it's never
 * stranded on a phantom display after monitor removal or resolution change.
 *
 * @param {{ x: number, y: number }} pos - Current window position
 * @param {{ width: number, height: number }} size - Window dimensions
 * @param {{ x: number, y: number, width: number, height: number }} workArea - Display work area
 * @returns {{ x: number, y: number, changed: boolean }} Clamped position + whether it moved
 */
function clampToWorkArea(pos, size, workArea) {
  const { x: ax, y: ay, width: aw, height: ah } = workArea;
  const cx = Math.max(ax, Math.min(pos.x, ax + aw - size.width));
  const cy = Math.max(ay, Math.min(pos.y, ay + ah - size.height));
  return {
    x: Math.round(cx),
    y: Math.round(cy),
    changed:
      Math.round(cx) !== Math.round(pos.x) ||
      Math.round(cy) !== Math.round(pos.y),
  };
}

/**
 * Maximum allowed padding value in pixels.
 * Prevents absurd values (e.g. 100000px from corrupted prefs or env vars)
 * from pushing the mascot offscreen or causing layout issues.
 * 1000px is generous for any reasonable display size.
 */
const MAX_PADDING = 1000;

/**
 * Check whether a value is a valid padding (finite non-negative number, capped at MAX_PADDING).
 * @param {*} value
 * @returns {boolean}
 */
function isValidPadding(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_PADDING
  );
}

/**
 * Compute the next alignment index when cycling forward through alignments.
 * Wraps around to 0 after the last alignment. Mirrors nextSizeIndex / nextOpacityIndex.
 *
 * @param {number} currentIndex - Current alignment index
 * @param {number} [count] - Number of alignments (defaults to VALID_ALIGNMENTS.length)
 * @returns {number} Next index (wraps around)
 */
function nextAlignmentIndex(currentIndex, count) {
  const n =
    typeof count === "number" && count > 0 ? count : VALID_ALIGNMENTS.length;
  if (
    typeof currentIndex !== "number" ||
    currentIndex < 0 ||
    !Number.isInteger(currentIndex)
  )
    return 0;
  return (currentIndex + 1) % n;
}

/**
 * Compute the previous alignment index when cycling backward through alignments.
 * Wraps around to the last alignment when going below 0. Mirrors prevSizeIndex / prevOpacityIndex.
 *
 * @param {number} currentIndex - Current alignment index
 * @param {number} [count] - Number of alignments (defaults to VALID_ALIGNMENTS.length)
 * @returns {number} Previous index (wraps around)
 */
function prevAlignmentIndex(currentIndex, count) {
  const n =
    typeof count === "number" && count > 0 ? count : VALID_ALIGNMENTS.length;
  if (
    typeof currentIndex !== "number" ||
    currentIndex < 0 ||
    !Number.isInteger(currentIndex)
  )
    return n - 1;
  return (currentIndex - 1 + n) % n;
}

/**
 * Find the index of an alignment label in VALID_ALIGNMENTS (case-insensitive).
 * Returns -1 if not found. Mirrors findSizePreset / findOpacityIndex pattern.
 *
 * @param {string} alignment - Alignment label to find
 * @returns {number} Index in VALID_ALIGNMENTS, or -1 if not found
 */
function findAlignmentIndex(alignment) {
  if (typeof alignment !== "string") return -1;
  const normalized = alignment.trim().toLowerCase();
  return VALID_ALIGNMENTS.indexOf(normalized);
}

/**
 * Directional arrow emoji for each alignment.
 * Provides at-a-glance visual feedback in tray tooltip, context menu,
 * and debug info without parsing the alignment string.
 */
const ALIGNMENT_ARROWS = Object.freeze({
  "top-left": "↖",
  "top-center": "↑",
  "top-right": "↗",
  "center-left": "←",
  center: "·",
  "center-right": "→",
  "bottom-left": "↙",
  "bottom-center": "↓",
  "bottom-right": "↘",
});

/**
 * Get the directional arrow emoji for an alignment value.
 * Returns '·' for unrecognized values.
 *
 * @param {string} alignment - Alignment label (case-insensitive)
 * @returns {string} Arrow emoji
 */
function alignmentArrow(alignment) {
  if (typeof alignment !== "string") return "·";
  return ALIGNMENT_ARROWS[alignment.trim().toLowerCase()] || "·";
}

/**
 * Format an alignment label with its directional arrow for display.
 * e.g. "bottom-right" → "↘ bottom-right"
 *
 * @param {string} alignment - Alignment label
 * @returns {string} Formatted string with arrow prefix
 */
function formatAlignment(alignment) {
  const label =
    typeof alignment === "string" && alignment.trim()
      ? alignment.trim().toLowerCase()
      : "bottom-right";
  return `${alignmentArrow(label)} ${label}`;
}

module.exports = {
  getPosition,
  clampToWorkArea,
  VALID_ALIGNMENTS,
  isValidAlignment,
  MAX_PADDING,
  isValidPadding,
  nextAlignmentIndex,
  prevAlignmentIndex,
  findAlignmentIndex,
  ALIGNMENT_ARROWS,
  alignmentArrow,
  formatAlignment,
};
