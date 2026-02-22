import { describe, it, expect } from 'bun:test';
import { renderTraySprite, buildTrayTooltip, TRAY_SPRITE, TRAY_COLORS, STATUS_DOT_COLORS } from '../src/tray-icon.cjs';
import { formatLatency } from '../src/format-latency.cjs';

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

  describe('buildTrayTooltip', () => {
    const base = {
      appVersion: '1.2.3',
      mode: 'idle',
      clickThrough: false,
      hideText: false,
      alignment: 'bottom-right',
      sizeLabel: 'medium',
      opacityPercent: 100,
    };

    it('shows version and defaults for idle mode', () => {
      const tip = buildTrayTooltip(base);
      expect(tip).toContain('Molt Mascot v1.2.3');
      expect(tip).toContain('📍 bottom-right');
      expect(tip).toContain('📐 medium');
      // Idle mode should not show mode emoji
      expect(tip).not.toContain('🧠');
      // Full opacity should not show opacity indicator
      expect(tip).not.toContain('🔅');
    });

    it('shows plugin version alongside app version when provided', () => {
      const tip = buildTrayTooltip({ ...base, pluginVersion: '0.5.2' });
      expect(tip).toContain('Molt Mascot v1.2.3 (plugin v0.5.2)');
    });

    it('omits plugin version when not provided', () => {
      const tip = buildTrayTooltip(base);
      expect(tip).toContain('Molt Mascot v1.2.3');
      expect(tip).not.toContain('plugin');
    });

    it('shows mode emoji for non-idle modes', () => {
      expect(buildTrayTooltip({ ...base, mode: 'thinking' })).toContain('🧠 thinking');
      expect(buildTrayTooltip({ ...base, mode: 'tool' })).toContain('🔧 tool');
      expect(buildTrayTooltip({ ...base, mode: 'tool', currentTool: 'web_search' })).toContain('🔧 web_search');
      expect(buildTrayTooltip({ ...base, mode: 'tool', currentTool: 'web_search' })).not.toContain('🔧 tool');
      expect(buildTrayTooltip({ ...base, mode: 'error' })).toContain('❌ error');
      expect(buildTrayTooltip({ ...base, mode: 'sleeping' })).toContain('💤 sleeping');
      expect(buildTrayTooltip({ ...base, mode: 'disconnected' })).toContain('⚡ disconnected');
    });

    it('shows ghost mode indicator', () => {
      const tip = buildTrayTooltip({ ...base, clickThrough: true });
      expect(tip).toContain('👻 Ghost');
    });

    it('shows text hidden indicator', () => {
      const tip = buildTrayTooltip({ ...base, hideText: true });
      expect(tip).toContain('🙈 Text hidden');
    });

    it('shows opacity when below 100%', () => {
      const tip = buildTrayTooltip({ ...base, opacityPercent: 60 });
      expect(tip).toContain('🔅 60%');
    });

    it('reflects custom alignment and size', () => {
      const tip = buildTrayTooltip({ ...base, alignment: 'top-left', sizeLabel: 'large' });
      expect(tip).toContain('📍 top-left');
      expect(tip).toContain('📐 large');
    });

    it('shows connection uptime when uptimeStr is provided', () => {
      const tip = buildTrayTooltip({ ...base, uptimeStr: '2h 15m' });
      expect(tip).toContain('↑ 2h 15m');
    });

    it('omits uptime when uptimeStr is undefined', () => {
      const tip = buildTrayTooltip(base);
      expect(tip).not.toContain('↑');
    });

    it('omits uptime when uptimeStr is empty string', () => {
      const tip = buildTrayTooltip({ ...base, uptimeStr: '' });
      expect(tip).not.toContain('↑');
    });

    it('includes latency when provided', () => {
      const tip = buildTrayTooltip({ ...base, latencyMs: 42 });
      expect(tip).toContain('⏱ 42ms');
      expect(tip).toContain('🟢');
    });

    it('includes median latency from stats when available', () => {
      const tip = buildTrayTooltip({ ...base, latencyMs: 42, latencyStats: { min: 30, max: 80, avg: 45, median: 38, samples: 10 } });
      expect(tip).toContain('⏱ 42ms (med 38ms)');
      // Quality is based on median when stats are available
      expect(tip).toContain('🟢');
    });

    it('includes connection quality emoji based on median latency', () => {
      const tip = buildTrayTooltip({ ...base, latencyMs: 200, latencyStats: { min: 100, max: 400, avg: 250, median: 180, samples: 10 } });
      expect(tip).toContain('🟠');
    });

    it('uses instant latency for quality when no median stats', () => {
      const tip = buildTrayTooltip({ ...base, latencyMs: 600 });
      expect(tip).toContain('🔴');
    });

    it('omits median when latencyStats has only 1 sample', () => {
      const tip = buildTrayTooltip({ ...base, latencyMs: 42, latencyStats: { min: 42, max: 42, avg: 42, median: 42, samples: 1 } });
      expect(tip).toContain('⏱ 42ms');
      expect(tip).not.toContain('(med');
    });

    it('omits median when latencyStats is null', () => {
      const tip = buildTrayTooltip({ ...base, latencyMs: 42, latencyStats: null });
      expect(tip).toContain('⏱ 42ms');
      expect(tip).not.toContain('(med');
    });

    it('omits median when latencyStats has no median field', () => {
      const tip = buildTrayTooltip({ ...base, latencyMs: 42, latencyStats: { min: 30, max: 80, avg: 45, samples: 5 } });
      expect(tip).toContain('⏱ 42ms');
      expect(tip).not.toContain('(med');
    });

    it('includes p95 alongside median when tail latency is notable (p95 > 2× median)', () => {
      const tip = buildTrayTooltip({ ...base, latencyMs: 42, latencyStats: { min: 30, max: 200, avg: 55, median: 38, p95: 180, samples: 20 } });
      expect(tip).toContain('med 38ms, p95 180ms');
    });

    it('omits p95 when tail latency is not notable (p95 <= 2× median)', () => {
      const tip = buildTrayTooltip({ ...base, latencyMs: 42, latencyStats: { min: 30, max: 80, avg: 45, median: 38, p95: 60, samples: 20 } });
      expect(tip).toContain('(med 38ms)');
      expect(tip).not.toContain('p95');
    });

    it('omits latency when null or undefined', () => {
      expect(buildTrayTooltip({ ...base, latencyMs: null })).not.toContain('⏱');
      expect(buildTrayTooltip({ ...base })).not.toContain('⏱');
    });

    it('omits latency when negative', () => {
      expect(buildTrayTooltip({ ...base, latencyMs: -1 })).not.toContain('⏱');
    });

    it('shows error detail in error mode when lastErrorMessage is provided', () => {
      const tip = buildTrayTooltip({ ...base, mode: 'error', lastErrorMessage: 'spawn ENOENT' });
      expect(tip).toContain('❌ spawn ENOENT');
      expect(tip).not.toContain('❌ error');
    });

    it('falls back to generic error label when lastErrorMessage is absent', () => {
      const tip = buildTrayTooltip({ ...base, mode: 'error' });
      expect(tip).toContain('❌ error');
    });

    it('joins all parts with " · "', () => {
      const tip = buildTrayTooltip({ ...base, clickThrough: true, hideText: true, opacityPercent: 40 });
      const parts = tip.split(' · ');
      expect(parts.length).toBeGreaterThanOrEqual(6);
    });

    it('shows mode duration for non-idle modes', () => {
      const tip = buildTrayTooltip({ ...base, mode: 'thinking', modeDurationSec: 90 });
      expect(tip).toContain('🧠 thinking (1m 30s)');
    });

    it('omits mode duration for idle mode', () => {
      const tip = buildTrayTooltip({ ...base, mode: 'idle', modeDurationSec: 60 });
      expect(tip).not.toContain('1m');
    });

    it('omits mode duration when zero or undefined', () => {
      expect(buildTrayTooltip({ ...base, mode: 'tool', modeDurationSec: 0 })).not.toContain('(0s)');
      expect(buildTrayTooltip({ ...base, mode: 'tool' })).not.toContain('(');
    });

    it('shows process uptime when processUptimeS is provided', () => {
      const tip = buildTrayTooltip({ ...base, processUptimeS: 3661 });
      expect(tip).toContain('🕐 1h 1m');
    });

    it('omits process uptime when not provided', () => {
      expect(buildTrayTooltip({ ...base })).not.toContain('🕐');
    });

    it('omits process uptime when negative', () => {
      expect(buildTrayTooltip({ ...base, processUptimeS: -1 })).not.toContain('🕐');
    });

    it('shows process memory RSS when processMemoryRssBytes is provided', () => {
      const tip = buildTrayTooltip({ ...base, processMemoryRssBytes: 52428800 }); // 50 MB
      expect(tip).toContain('🧠 50.0 MB');
    });

    it('omits process memory when not provided', () => {
      expect(buildTrayTooltip({ ...base })).not.toContain('🧠');
    });

    it('omits process memory when zero or negative', () => {
      expect(buildTrayTooltip({ ...base, processMemoryRssBytes: 0 })).not.toContain('🧠');
      expect(buildTrayTooltip({ ...base, processMemoryRssBytes: -1 })).not.toContain('🧠');
    });

    it('shows reconnect count when sessionConnectCount > 1', () => {
      const tip = buildTrayTooltip({ ...base, sessionConnectCount: 4 });
      expect(tip).toContain('↻3 reconnects');
    });

    it('uses singular "reconnect" when sessionConnectCount is 2', () => {
      const tip = buildTrayTooltip({ ...base, sessionConnectCount: 2 });
      expect(tip).toContain('↻1 reconnect');
      expect(tip).not.toContain('reconnects');
    });

    it('shows failed attempt count when sessionAttemptCount > sessionConnectCount', () => {
      const tip = buildTrayTooltip({ ...base, sessionConnectCount: 4, sessionAttemptCount: 7 });
      expect(tip).toContain('↻3 reconnects, 3 failed');
    });

    it('omits failed count when sessionAttemptCount equals sessionConnectCount', () => {
      const tip = buildTrayTooltip({ ...base, sessionConnectCount: 3, sessionAttemptCount: 3 });
      expect(tip).toContain('↻2 reconnects');
      expect(tip).not.toContain('failed');
    });

    it('omits reconnect count when sessionConnectCount is 0 or 1', () => {
      expect(buildTrayTooltip({ ...base, sessionConnectCount: 0 })).not.toContain('↻');
      expect(buildTrayTooltip({ ...base, sessionConnectCount: 1 })).not.toContain('↻');
      expect(buildTrayTooltip({ ...base })).not.toContain('↻');
    });

    it('shows tool call stats when toolCalls > 0', () => {
      const tip = buildTrayTooltip({ ...base, toolCalls: 42, toolErrors: 3 });
      expect(tip).toContain('🔨 42 calls, 3 err (93% ok)');
    });

    it('shows tool calls without errors when toolErrors is 0', () => {
      const tip = buildTrayTooltip({ ...base, toolCalls: 10, toolErrors: 0 });
      expect(tip).toContain('🔨 10 calls');
      expect(tip).not.toContain('err');
    });

    it('omits tool stats when toolCalls is 0 or not provided', () => {
      expect(buildTrayTooltip({ ...base, toolCalls: 0 })).not.toContain('🔨');
      expect(buildTrayTooltip({ ...base })).not.toContain('🔨');
    });

    it('shows active agents/tools when non-zero', () => {
      const tip = buildTrayTooltip({ ...base, activeAgents: 2, activeTools: 3 });
      expect(tip).toContain('2 agents, 3 tools');
    });

    it('uses singular form for 1 agent or 1 tool', () => {
      const tip = buildTrayTooltip({ ...base, activeAgents: 1, activeTools: 1 });
      expect(tip).toContain('1 agent,');
      expect(tip).toContain('1 tool');
      expect(tip).not.toContain('agents');
      expect(tip).not.toContain('tools');
    });

    it('omits active agents/tools when both are zero', () => {
      expect(buildTrayTooltip({ ...base, activeAgents: 0, activeTools: 0 })).not.toContain('agent');
      expect(buildTrayTooltip({ ...base })).not.toContain('agent');
    });

    it('shows plugin uptime when pluginStartedAt is provided', () => {
      const now = 1700000000000;
      const tip = buildTrayTooltip({ ...base, pluginStartedAt: now - 3661000, now });
      expect(tip).toContain('🔌 plugin up 1h 1m');
    });

    it('omits plugin uptime when pluginStartedAt is not provided', () => {
      expect(buildTrayTooltip({ ...base })).not.toContain('🔌');
    });

    it('omits plugin uptime when pluginStartedAt is 0 or negative', () => {
      expect(buildTrayTooltip({ ...base, pluginStartedAt: 0 })).not.toContain('🔌');
      expect(buildTrayTooltip({ ...base, pluginStartedAt: -1 })).not.toContain('🔌');
    });

    it('shows last reset time when lastResetAt is provided', () => {
      const now = 1700000000000;
      const tip = buildTrayTooltip({ ...base, lastResetAt: now - 300000, now });
      expect(tip).toContain('🔄 reset 5m');
    });

    it('omits last reset when lastResetAt is not provided or zero', () => {
      expect(buildTrayTooltip({ ...base })).not.toContain('🔄 reset');
      expect(buildTrayTooltip({ ...base, lastResetAt: 0 })).not.toContain('🔄 reset');
      expect(buildTrayTooltip({ ...base, lastResetAt: null })).not.toContain('🔄 reset');
    });

    it('shows last message gap when >= 5s and connected', () => {
      const now = Date.now();
      const tip = buildTrayTooltip({ ...base, uptimeStr: '10m', lastMessageAt: now - 8000, now });
      expect(tip).toContain('📩 last msg');
    });

    it('omits last message gap when < 5s', () => {
      const now = Date.now();
      const tip = buildTrayTooltip({ ...base, uptimeStr: '10m', lastMessageAt: now - 3000, now });
      expect(tip).not.toContain('📩');
    });

    it('omits last message gap when disconnected (no uptimeStr)', () => {
      const now = Date.now();
      const tip = buildTrayTooltip({ ...base, mode: 'disconnected', lastMessageAt: now - 10000, now });
      expect(tip).not.toContain('📩');
    });

    it('omits last message gap when lastMessageAt is null or 0', () => {
      expect(buildTrayTooltip({ ...base, uptimeStr: '5m', lastMessageAt: null })).not.toContain('📩');
      expect(buildTrayTooltip({ ...base, uptimeStr: '5m', lastMessageAt: 0 })).not.toContain('📩');
    });

    it('shows close detail when provided', () => {
      const tip = buildTrayTooltip({ ...base, lastCloseDetail: 'abnormal closure (1006)' });
      expect(tip).toContain('⚡ abnormal closure (1006)');
    });

    it('omits close detail when null or empty', () => {
      expect(buildTrayTooltip({ ...base, lastCloseDetail: null })).not.toContain('⚡');
      expect(buildTrayTooltip({ ...base, lastCloseDetail: '' })).not.toContain('⚡');
      expect(buildTrayTooltip({ ...base })).not.toContain('⚡');
    });

    it('shows reconnect attempt when disconnected (no uptimeStr)', () => {
      const tip = buildTrayTooltip({ ...base, mode: 'disconnected', reconnectAttempt: 3 });
      expect(tip).toContain('retry #3');
    });

    it('omits reconnect attempt when connected (uptimeStr present)', () => {
      const tip = buildTrayTooltip({ ...base, uptimeStr: '5m', reconnectAttempt: 2 });
      expect(tip).not.toContain('retry');
    });

    it('omits reconnect attempt when 0', () => {
      expect(buildTrayTooltip({ ...base, reconnectAttempt: 0 })).not.toContain('retry');
    });

    it('shows target URL when disconnected (no uptimeStr)', () => {
      const tip = buildTrayTooltip({ ...base, mode: 'disconnected', targetUrl: 'ws://127.0.0.1:18789' });
      expect(tip).toContain('→ ws://127.0.0.1:18789');
    });

    it('omits target URL when connected (uptimeStr present)', () => {
      const tip = buildTrayTooltip({ ...base, uptimeStr: '5m', targetUrl: 'ws://127.0.0.1:18789' });
      expect(tip).not.toContain('→');
    });

    it('omits target URL when empty or not provided', () => {
      expect(buildTrayTooltip({ ...base, targetUrl: '' })).not.toContain('→');
      expect(buildTrayTooltip({ ...base })).not.toContain('→');
    });

    it('shows degraded health status', () => {
      const tip = buildTrayTooltip({ ...base, healthStatus: 'degraded' });
      expect(tip).toContain('⚠️ degraded');
    });

    it('shows unhealthy health status', () => {
      const tip = buildTrayTooltip({ ...base, healthStatus: 'unhealthy' });
      expect(tip).toContain('🔴 unhealthy');
    });

    it('omits health status when healthy or not provided', () => {
      expect(buildTrayTooltip({ ...base, healthStatus: 'healthy' })).not.toContain('degraded');
      expect(buildTrayTooltip({ ...base, healthStatus: 'healthy' })).not.toContain('unhealthy');
      expect(buildTrayTooltip({ ...base })).not.toContain('degraded');
      expect(buildTrayTooltip({ ...base })).not.toContain('unhealthy');
    });
  });

  describe('formatLatency', () => {
    it('returns "< 1ms" for zero', () => {
      expect(formatLatency(0)).toBe('< 1ms');
    });

    it('formats sub-second values as Xms', () => {
      expect(formatLatency(42)).toBe('42ms');
      expect(formatLatency(999)).toBe('999ms');
    });

    it('rounds fractional milliseconds', () => {
      expect(formatLatency(3.7)).toBe('4ms');
    });

    it('formats 1000+ as X.Ys', () => {
      expect(formatLatency(1200)).toBe('1.2s');
      expect(formatLatency(1000)).toBe('1.0s');
    });

    it('returns dash for negative values', () => {
      expect(formatLatency(-1)).toBe('–');
    });

    it('returns dash for NaN and Infinity', () => {
      expect(formatLatency(NaN)).toBe('–');
      expect(formatLatency(Infinity)).toBe('–');
    });

    it('returns dash for non-number types', () => {
      expect(formatLatency(null)).toBe('–');
      expect(formatLatency(undefined)).toBe('–');
      expect(formatLatency('42')).toBe('–');
    });
  });
});
