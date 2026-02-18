/**
 * Tray icon sprite rendering — extracted from electron-main.cjs for testability.
 *
 * Renders a 16×16 pixel-art lobster at arbitrary integer scales,
 * producing an RGBA buffer suitable for Electron's nativeImage.createFromBuffer().
 */

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

/**
 * Render the tray sprite at the given integer scale.
 * @param {number} scale - Integer multiplier (1 = 16px, 2 = 32px, etc.)
 * @returns {Buffer} Raw RGBA pixel buffer (size × size × 4 bytes)
 */
function renderTraySprite(scale) {
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
  return buf;
}

module.exports = { renderTraySprite, TRAY_SPRITE, TRAY_COLORS };
