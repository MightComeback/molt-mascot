/**
 * Tray icon sprite rendering — extracted from electron-main.cjs for testability.
 *
 * Renders a 16×16 pixel-art lobster at arbitrary integer scales,
 * producing an RGBA buffer suitable for Electron's nativeImage.createFromBuffer().
 */

const { formatDuration } = require('@molt/mascot-plugin');

// 16×16 pixel-art lobster matching the mascot sprite style.
// Legend: . = transparent, k = outline #4a0f14, r = body #e0433a,
//         h = highlight #ff8b7f, w = eye white #f8f7ff, b = pupil #101014
const TRAY_SPRITE = [
  '......kkkk......',
  '.....krrrrk.....',
  '....krhhhhrkk...',
  '....krhwrhwrrk..',
  '....krhbrhbrrk..',
  '.....krhhrrkk...',
  '......krrrkk....',
  '....kkrrkrrkk...',
  '...krrk...krrk..',
  '..krrk.....krrk.',
  '..krk.......krk.',
  '..krrk.....krrk.',
  '...krrk...krrk..',
  '....kkrrkrrkk...',
  '......krrrkk....',
  '.......kkk......',
];

const TRAY_COLORS = {
  '.': [0, 0, 0, 0],
  k: [0x4a, 0x0f, 0x14, 0xff],
  r: [0xe0, 0x43, 0x3a, 0xff],
  h: [0xff, 0x8b, 0x7f, 0xff],
  w: [0xf8, 0xf7, 0xff, 0xff],
  b: [0x10, 0x10, 0x14, 0xff],
};

// Status dot colors for each mascot mode.
// The dot is a 3×3 pixel indicator in the bottom-right corner of the tray icon,
// giving at-a-glance status feedback (common macOS menu bar pattern).
const STATUS_DOT_COLORS = {
  idle:         [0x8e, 0x8e, 0x93, 0xff], // gray
  thinking:     [0x0a, 0x84, 0xff, 0xff], // blue
  tool:         [0x34, 0xc7, 0x59, 0xff], // green
  error:        [0xff, 0x3b, 0x30, 0xff], // red
  connecting:   [0xff, 0xd6, 0x0a, 0xff], // yellow
  connected:    [0x34, 0xc7, 0x59, 0xff], // green
  disconnected: [0xff, 0x3b, 0x30, 0xff], // red
  sleeping:     [0x58, 0x56, 0xd6, 0xff], // indigo
};

/**
 * Render the tray sprite at the given integer scale.
 * @param {number} scale - Integer multiplier (1 = 16px, 2 = 32px, etc.)
 * @param {{ mode?: string }} [opts] - Optional mode for status dot overlay
 * @returns {Buffer} Raw RGBA pixel buffer (size × size × 4 bytes)
 */
function renderTraySprite(scale, opts) {
  if (!Number.isInteger(scale) || scale < 1) {
    throw new RangeError(`scale must be a positive integer, got ${scale}`);
  }
  const size = 16 * scale;
  const buf = Buffer.alloc(size * size * 4);
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      const ch = TRAY_SPRITE[row][col] || '.';
      const [r, g, b, a] = TRAY_COLORS[ch] || TRAY_COLORS['.'];
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const off = ((row * scale + dy) * size + (col * scale + dx)) * 4;
          buf[off] = r;
          buf[off + 1] = g;
          buf[off + 2] = b;
          buf[off + 3] = a;
        }
      }
    }
  }

  // Draw a status dot in the bottom-right corner (3×3 sprite pixels)
  // with a 1px dark outline ring for contrast against any background.
  const mode = opts?.mode;
  const dotColor = mode ? STATUS_DOT_COLORS[mode] : null;
  if (dotColor) {
    // Dot position: bottom-right 3×3 at sprite coords (13,13)–(15,15)
    const dotStartRow = 13;
    const dotStartCol = 13;
    const dotSize = 3;
    const outlineColor = [0x00, 0x00, 0x00, 0xcc]; // semi-transparent black

    // Helper to paint a scaled sprite pixel
    const paintPixel = (spriteRow, spriteCol, color) => {
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const off = ((spriteRow * scale + dy) * size + (spriteCol * scale + dx)) * 4;
          buf[off] = color[0];
          buf[off + 1] = color[1];
          buf[off + 2] = color[2];
          buf[off + 3] = color[3];
        }
      }
    };

    // 1) Outline ring: the 4 corner pixels of the 3×3 area (not drawn as dot)
    //    plus the row/col just outside the dot area (forming a dark halo).
    //    We paint corners of the 3×3 as outline to complete the ring.
    for (let dr = 0; dr < dotSize; dr++) {
      for (let dc = 0; dc < dotSize; dc++) {
        if ((dr === 0 || dr === dotSize - 1) && (dc === 0 || dc === dotSize - 1)) {
          paintPixel(dotStartRow + dr, dotStartCol + dc, outlineColor);
        }
      }
    }
    // Outer ring: 1px border around the 3×3 area (only pixels within bounds)
    for (let dr = -1; dr <= dotSize; dr++) {
      for (let dc = -1; dc <= dotSize; dc++) {
        if (dr >= 0 && dr < dotSize && dc >= 0 && dc < dotSize) continue; // inside
        const sr = dotStartRow + dr;
        const sc = dotStartCol + dc;
        if (sr < 0 || sr >= 16 || sc < 0 || sc >= 16) continue; // out of bounds
        paintPixel(sr, sc, outlineColor);
      }
    }

    // 2) Dot fill: the + shape (skip corners for rounded look)
    for (let dr = 0; dr < dotSize; dr++) {
      for (let dc = 0; dc < dotSize; dc++) {
        if ((dr === 0 || dr === dotSize - 1) && (dc === 0 || dc === dotSize - 1)) continue;
        paintPixel(dotStartRow + dr, dotStartCol + dc, dotColor);
      }
    }
  }

  return buf;
}

/**
 * Format a latency value in milliseconds into a compact, human-readable string.
 * Mirrors the renderer-side formatLatency (which lives in ESM utils.js and can't
 * be imported from CJS). Kept in sync by shared test expectations.
 *
 * @param {number} ms - Latency in milliseconds
 * @returns {string}
 */
function formatLatency(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '–';
  if (ms === 0) return '< 1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Build the tray tooltip string from current mascot state.
 * Extracted as a pure function for testability (no Electron dependency).
 *
 * @param {object} params
 * @param {string} params.appVersion - App version string
 * @param {string} params.mode - Current renderer mode (idle/thinking/tool/error/connecting/connected/disconnected/sleeping)
 * @param {boolean} params.clickThrough - Ghost mode active
 * @param {boolean} params.hideText - Text hidden
 * @param {string} params.alignment - Current alignment label
 * @param {string} params.sizeLabel - Current size preset label
 * @param {number} params.opacityPercent - Current opacity as integer percentage (0-100)
 * @param {string} [params.uptimeStr] - Connection uptime string (e.g. "2h 15m") — shown when connected
 * @param {number|null} [params.latencyMs] - Plugin state poll round-trip latency in ms
 * @param {string} [params.currentTool] - Active tool name (shown in tooltip when mode is 'tool')
 * @param {string} [params.lastErrorMessage] - Error detail (shown in tooltip when mode is 'error')
 * @param {number} [params.modeDurationSec] - How long in current mode (seconds); shown for non-idle modes
 * @returns {string} Tooltip string with parts joined by " · "
 */
function buildTrayTooltip(params) {
  const { appVersion, mode, clickThrough, hideText, alignment, sizeLabel, opacityPercent, uptimeStr, latencyMs, currentTool, lastErrorMessage, modeDurationSec } = params;
  const parts = [`Molt Mascot v${appVersion}`];
  const modeEmoji = { thinking: '🧠', tool: '🔧', error: '❌', connecting: '🔄', disconnected: '⚡', connected: '✅', sleeping: '💤' };
  const modeLabel = mode || 'idle';
  if (modeLabel !== 'idle') {
    let modePart = `${modeEmoji[modeLabel] || '●'} ${modeLabel}`;
    if (modeLabel === 'tool' && currentTool) modePart = `${modeEmoji.tool} ${currentTool}`;
    if (modeLabel === 'error' && lastErrorMessage) modePart = `${modeEmoji.error} ${lastErrorMessage}`;
    if (typeof modeDurationSec === 'number' && modeDurationSec > 0) modePart += ` (${formatDuration(modeDurationSec)})`;
    parts.push(modePart);
  }
  if (clickThrough) parts.push('👻 Ghost');
  if (hideText) parts.push('🙈 Text hidden');
  parts.push(`📍 ${alignment || 'bottom-right'}`);
  parts.push(`📐 ${sizeLabel || 'medium'}`);
  if (typeof opacityPercent === 'number' && opacityPercent < 100) parts.push(`🔅 ${opacityPercent}%`);
  if (uptimeStr) parts.push(`↑ ${uptimeStr}`);
  if (typeof latencyMs === 'number' && Number.isFinite(latencyMs) && latencyMs >= 0) {
    parts.push(`⏱ ${formatLatency(latencyMs)}`);
  }
  return parts.join(' · ');
}

module.exports = { renderTraySprite, buildTrayTooltip, formatLatency, TRAY_SPRITE, TRAY_COLORS, STATUS_DOT_COLORS };
