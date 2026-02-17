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

  // Round to integers — fractional pixel positions cause blurry rendering
  // on non-Retina displays and trigger Electron console warnings.
  let px, py;
  switch (align) {
    case 'bottom-left':
      px = x + padding; py = y + dh - height - padding; break;
    case 'top-right':
      px = x + dw - width - padding; py = y + padding; break;
    case 'top-left':
      px = x + padding; py = y + padding; break;
    case 'center':
      px = x + (dw - width) / 2; py = y + (dh - height) / 2; break;
    case 'center-left':
      px = x + padding; py = y + (dh - height) / 2; break;
    case 'center-right':
      px = x + dw - width - padding; py = y + (dh - height) / 2; break;
    case 'top-center':
      px = x + (dw - width) / 2; py = y + padding; break;
    case 'bottom-center':
      px = x + (dw - width) / 2; py = y + dh - height - padding; break;
    case 'bottom-right':
    default:
      px = x + dw - width - padding; py = y + dh - height - padding; break;
  }
  // Clamp to work area so the window never ends up off-screen
  // (e.g. when padding is larger than the display or window exceeds display size).
  px = Math.max(x, Math.min(px, x + dw - width));
  py = Math.max(y, Math.min(py, y + dh - height));

  return { x: Math.round(px), y: Math.round(py) };
}

module.exports = { getPosition };
