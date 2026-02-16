/**
 * Pure function to compute window position for a given display, size, alignment, and padding.
 * Extracted from electron-main.cjs for testability.
 */
function getPosition(display, width, height, alignOverride, paddingOverride) {
  const basePadding = 24;
  const padding = (Number.isFinite(paddingOverride) && paddingOverride >= 0) ? paddingOverride : basePadding;

  const rawAlign = (typeof alignOverride === 'string' && alignOverride.trim())
    ? alignOverride
    : 'bottom-right';
  const align = rawAlign.toLowerCase();
  const { x, y, width: dw, height: dh } = display.workArea;

  switch (align) {
    case 'bottom-left':
      return { x: x + padding, y: y + dh - height - padding };
    case 'top-right':
      return { x: x + dw - width - padding, y: y + padding };
    case 'top-left':
      return { x: x + padding, y: y + padding };
    case 'center':
      return { x: x + (dw - width) / 2, y: y + (dh - height) / 2 };
    case 'center-left':
      return { x: x + padding, y: y + (dh - height) / 2 };
    case 'center-right':
      return { x: x + dw - width - padding, y: y + (dh - height) / 2 };
    case 'top-center':
      return { x: x + (dw - width) / 2, y: y + padding };
    case 'bottom-center':
      return { x: x + (dw - width) / 2, y: y + dh - height - padding };
    case 'bottom-right':
    default:
      return { x: x + dw - width - padding, y: y + dh - height - padding };
  }
}

module.exports = { getPosition };
