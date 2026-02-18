import { describe, it, expect } from 'bun:test';
import { renderTraySprite, TRAY_SPRITE, TRAY_COLORS, STATUS_DOT_COLORS } from '../src/tray-icon.cjs';

describe('tray-icon', () => {
  describe('TRAY_SPRITE', () => {
    it('is a 16-row sprite', () => {
      expect(TRAY_SPRITE).toHaveLength(16);
    });

    it('each row is 16 characters', () => {
      for (const row of TRAY_SPRITE) {
        expect(row).toHaveLength(16);
      }
    });

    it('uses only known palette characters', () => {
      const knownChars = new Set(Object.keys(TRAY_COLORS));
      for (const row of TRAY_SPRITE) {
        for (const ch of row) {
          expect(knownChars.has(ch)).toBe(true);
        }
      }
    });

    it('contains at least one non-transparent pixel', () => {
      const hasColor = TRAY_SPRITE.some(row => [...row].some(ch => ch !== '.'));
      expect(hasColor).toBe(true);
    });
  });

  describe('TRAY_COLORS', () => {
    it('all entries are [r, g, b, a] arrays with values 0-255', () => {
      for (const [_key, rgba] of Object.entries(TRAY_COLORS)) {
        expect(rgba).toHaveLength(4);
        for (const v of rgba) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(255);
          expect(Number.isInteger(v)).toBe(true);
        }
      }
    });

    it('transparent pixel has alpha 0', () => {
      expect(TRAY_COLORS['.'][3]).toBe(0);
    });

    it('non-transparent pixels have alpha 255', () => {
      for (const [key, rgba] of Object.entries(TRAY_COLORS)) {
        if (key !== '.') expect(rgba[3]).toBe(255);
      }
    });
  });

  describe('renderTraySprite', () => {
    it('returns a buffer of correct size at scale 1', () => {
      const buf = renderTraySprite(1);
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf.length).toBe(16 * 16 * 4);
    });

    it('returns a buffer of correct size at scale 2', () => {
      const buf = renderTraySprite(2);
      expect(buf.length).toBe(32 * 32 * 4);
    });

    it('returns a buffer of correct size at scale 3', () => {
      const buf = renderTraySprite(3);
      expect(buf.length).toBe(48 * 48 * 4);
    });

    it('top-left pixel is transparent (matches sprite)', () => {
      const buf = renderTraySprite(1);
      // First pixel should be '.' which is [0,0,0,0]
      expect(buf[0]).toBe(0);
      expect(buf[1]).toBe(0);
      expect(buf[2]).toBe(0);
      expect(buf[3]).toBe(0);
    });

    it('contains non-zero alpha pixels (sprite is not all-transparent)', () => {
      const buf = renderTraySprite(1);
      let hasOpaque = false;
      for (let i = 3; i < buf.length; i += 4) {
        if (buf[i] > 0) { hasOpaque = true; break; }
      }
      expect(hasOpaque).toBe(true);
    });

    it('scale 2 replicates pixels correctly', () => {
      const buf1 = renderTraySprite(1);
      const buf2 = renderTraySprite(2);
      // Check a known opaque pixel from the sprite
      // Row 1, col 5 should be 'k' (outline)
      const row = 1, col = 5;
      const off1 = (row * 16 + col) * 4;
      const r1 = buf1[off1], g1 = buf1[off1+1], b1 = buf1[off1+2], a1 = buf1[off1+3];
      // At scale 2, this pixel is replicated to a 2x2 block
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const off2 = ((row * 2 + dy) * 32 + (col * 2 + dx)) * 4;
          expect(buf2[off2]).toBe(r1);
          expect(buf2[off2+1]).toBe(g1);
          expect(buf2[off2+2]).toBe(b1);
          expect(buf2[off2+3]).toBe(a1);
        }
      }
    });

    it('throws on invalid scale', () => {
      expect(() => renderTraySprite(0)).toThrow(RangeError);
      expect(() => renderTraySprite(-1)).toThrow(RangeError);
      expect(() => renderTraySprite(1.5)).toThrow(RangeError);
    });

    it('without mode option produces same output as no opts', () => {
      const a = renderTraySprite(1);
      const b = renderTraySprite(1, {});
      expect(a).toEqual(b);
    });

    it('with mode draws a status dot that differs from no-mode output', () => {
      const plain = renderTraySprite(1);
      const withDot = renderTraySprite(1, { mode: 'thinking' });
      expect(plain.length).toBe(withDot.length);
      // The buffers should differ in the bottom-right region where the dot is drawn
      let differs = false;
      for (let i = 0; i < plain.length; i++) {
        if (plain[i] !== withDot[i]) { differs = true; break; }
      }
      expect(differs).toBe(true);
    });

    it('status dot pixels use the correct color for each mode', () => {
      // Check the center pixel of the 3×3 dot (row 14, col 14) at scale 1
      const dotRow = 14, dotCol = 14;
      const off = (dotRow * 16 + dotCol) * 4;
      for (const [mode, expected] of Object.entries(STATUS_DOT_COLORS)) {
        const buf = renderTraySprite(1, { mode });
        expect(buf[off]).toBe(expected[0]);
        expect(buf[off + 1]).toBe(expected[1]);
        expect(buf[off + 2]).toBe(expected[2]);
        expect(buf[off + 3]).toBe(expected[3]);
      }
    });

    it('status dot has dark outline on corner pixels', () => {
      // Corner pixels of the 3×3 dot (e.g. row 13, col 13) should be the outline color
      const buf = renderTraySprite(1, { mode: 'thinking' });
      const corners = [[13, 13], [13, 15], [15, 13], [15, 15]];
      for (const [r, c] of corners) {
        const off = (r * 16 + c) * 4;
        // Outline is semi-transparent black [0,0,0,0xcc]
        expect(buf[off]).toBe(0);
        expect(buf[off + 1]).toBe(0);
        expect(buf[off + 2]).toBe(0);
        expect(buf[off + 3]).toBe(0xcc);
      }
    });

    it('status dot has outer ring outline pixels', () => {
      // Pixel just above the dot center (row 12, col 14) should be outline
      const buf = renderTraySprite(1, { mode: 'idle' });
      const off = (12 * 16 + 14) * 4;
      expect(buf[off]).toBe(0);
      expect(buf[off + 1]).toBe(0);
      expect(buf[off + 2]).toBe(0);
      expect(buf[off + 3]).toBe(0xcc);
    });

    it('unknown mode produces no dot (same as plain)', () => {
      const plain = renderTraySprite(1);
      const unknown = renderTraySprite(1, { mode: 'nonexistent' });
      expect(plain).toEqual(unknown);
    });
  });

  describe('STATUS_DOT_COLORS', () => {
    it('all entries are [r, g, b, a] arrays with values 0-255', () => {
      for (const [_key, rgba] of Object.entries(STATUS_DOT_COLORS)) {
        expect(rgba).toHaveLength(4);
        for (const v of rgba) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(255);
          expect(Number.isInteger(v)).toBe(true);
        }
      }
    });

    it('covers all expected modes', () => {
      const modes = ['idle', 'thinking', 'tool', 'error', 'connecting', 'connected', 'disconnected', 'sleeping'];
      for (const mode of modes) {
        expect(STATUS_DOT_COLORS[mode]).toBeDefined();
      }
    });
  });
});
