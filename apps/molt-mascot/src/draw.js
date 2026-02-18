/**
 * Drawing/rendering logic for the Molt Mascot pixel lobster.
 * Extracted from renderer.js for testability and separation of concerns.
 *
 * All functions are pure (given a canvas context + parameters) so they can be
 * unit-tested without a real DOM/canvas.
 */

import { palette, lobsterIdle, overlay } from './sprites.js';

// Eye geometry extracted from the sprite grid (row/col/size in sprite pixels).
export const EYE_LEFT_COL = 14;
export const EYE_RIGHT_COL = 18;
export const EYE_ROW = 8;
export const EYE_SIZE = 2; // 2×2 sprite pixels per eye

/**
 * Draw a pixel-art sprite onto a 2D canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string[][]} sprite - 2D array of palette keys
 * @param {{ x?: number, y?: number, scale?: number }} [opts]
 */
export function drawSprite(ctx, sprite, { x = 0, y = 0, scale = 3 } = {}) {
  // Try the pre-rendered cache first (avoids per-pixel fillRect on every frame).
  const cached = _spriteCache.get(sprite, scale);
  if (cached) {
    ctx.drawImage(cached, x, y);
    return;
  }
  for (let py = 0; py < sprite.length; py += 1) {
    const row = sprite[py];
    for (let px = 0; px < row.length; px += 1) {
      const ch = row[px];
      const color = palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + px * scale, y + py * scale, scale, scale);
    }
  }
}

/**
 * Off-screen sprite cache. Pre-renders sprites at a given scale onto
 * OffscreenCanvas (or regular canvas fallback) so the hot path in
 * drawLobster() is a single drawImage() call instead of hundreds of
 * fillRect() calls per sprite per frame.
 *
 * Cache is keyed by (sprite reference, scale) and lazily populated on
 * first access. Invalidated when scale changes (rare — only on window resize).
 */
export const _spriteCache = (() => {
  /** @type {Map<string, { canvas: OffscreenCanvas|HTMLCanvasElement, scale: number }>} */
  const cache = new Map();
  let lastScale = -1;

  // Stable identity key for a sprite array. We use a WeakMap to assign
  // incrementing IDs so we never stringify the full sprite data.
  const idMap = new WeakMap();
  let nextSpriteId = 0;
  function spriteKey(sprite) {
    let id = idMap.get(sprite);
    if (id === undefined) { id = nextSpriteId++; idMap.set(sprite, id); }
    return id;
  }

  /**
   * Get a pre-rendered canvas for the given sprite at the given scale.
   * Returns null if OffscreenCanvas/Canvas is unavailable (e.g. in tests).
   */
  function get(sprite, scale) {
    // Scale changed — flush the whole cache (happens on window resize).
    if (scale !== lastScale) {
      cache.clear();
      lastScale = scale;
    }
    const key = spriteKey(sprite);
    const entry = cache.get(key);
    if (entry) return entry;

    // Pre-render
    const w = sprite[0].length * scale;
    const h = sprite.length * scale;
    let offscreen;
    try {
      // Prefer OffscreenCanvas (no DOM attachment needed, better perf).
      offscreen = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(w, h)
        : document.createElement('canvas');
      if (!(offscreen instanceof OffscreenCanvas)) {
        offscreen.width = w;
        offscreen.height = h;
      }
    } catch {
      return null; // Test environment without canvas support
    }
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return null;

    for (let py = 0; py < sprite.length; py += 1) {
      const row = sprite[py];
      for (let px = 0; px < row.length; px += 1) {
        const color = palette[row[px]];
        if (!color) continue;
        offCtx.fillStyle = color;
        offCtx.fillRect(px * scale, py * scale, scale, scale);
      }
    }
    cache.set(key, offscreen);
    return offscreen;
  }

  /** Flush the cache (useful for tests). */
  function clear() { cache.clear(); lastScale = -1; }

  /** Number of cached entries. */
  function size() { return cache.size; }

  return { get, clear, size };
})();

/**
 * Blink state manager.
 * The lobster blinks every 3-6 seconds for ~150ms.
 * Returns a stateful object with an `isBlinking(t)` method.
 *
 * @param {{ reducedMotion?: boolean, initialBlinkAt?: number }} [opts]
 */
export function createBlinkState(opts = {}) {
  const BLINK_DURATION_MS = 150;
  let nextBlinkAt = opts.initialBlinkAt ?? (2000 + Math.random() * 4000);

  return {
    /** Whether the lobster should be blinking at time t (ms). */
    isBlinking(t) {
      if (opts.reducedMotion) return false;
      if (t >= nextBlinkAt) {
        if (t < nextBlinkAt + BLINK_DURATION_MS) return true;
        // Schedule next blink 3-6s from now
        nextBlinkAt = t + 3000 + Math.random() * 3000;
      }
      return false;
    },
    /** Current next-blink timestamp (for testing). */
    get nextBlinkAt() { return nextBlinkAt; },
  };
}

/**
 * Overlay animation timing: maps mode → { sprites, frameDurationMs }.
 * Static overlays use a single-element array with frameDurationMs=0.
 * Exported for testing and external tooling.
 */
export const OVERLAY_TIMING = {
  thinking:     { sprites: overlay.thinking,     frameDurationMs: 600 },
  tool:         { sprites: [overlay.tool],       frameDurationMs: 0   },
  error:        { sprites: [overlay.error],      frameDurationMs: 0   },
  sleep:        { sprites: overlay.sleep,        frameDurationMs: 800 },
  connecting:   { sprites: overlay.connecting,   frameDurationMs: 500 },
  connected:    { sprites: overlay.connected,    frameDurationMs: 300 },
  disconnected: { sprites: overlay.disconnected, frameDurationMs: 700 },
};

/**
 * Draw the full lobster scene: shadow, sprite, blink, and mode overlay.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} params
 * @param {string} params.mode - Current mode (idle/thinking/tool/error/connecting/connected/disconnected)
 * @param {number} params.t - Current animation time (ms)
 * @param {number} params.scale - Pixel scale factor
 * @param {number} params.spriteSize - Sprite grid size (typically 32)
 * @param {boolean} params.reducedMotion - Whether prefers-reduced-motion is active
 * @param {boolean} params.blinking - Whether the lobster is currently blinking
 * @param {number} [params.idleDurationMs=0] - How long in idle mode (for sleep overlay)
 * @param {number} [params.sleepThresholdMs=120000] - Threshold for sleep overlay
 * @param {{ width: number, height: number }} params.canvas - Canvas dimensions
 */
export function drawLobster(ctx, params) {
  const {
    mode,
    t,
    scale: s,
    spriteSize,
    reducedMotion,
    blinking,
    idleDurationMs = 0,
    sleepThresholdMs = 120000,
    canvas,
  } = params;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const frame = reducedMotion ? 0 : Math.floor(t / 260) % 2;
  const bob = reducedMotion ? 0 : Math.sin(t / 260) * 2;

  // Subtle shadow (keeps it readable on transparent backgrounds)
  // Shadow reacts to bob: when lobster bobs up the shadow shrinks (farther from ground),
  // when it bobs down the shadow grows. Gives a subtle depth/grounding effect.
  const shadowCenterX = (spriteSize * s) / 2;
  const shadowCenterY = (spriteSize * s) * 0.81;
  const shadowScaleX = (26 * s / 3) - bob * 0.4;
  const shadowScaleY = (10 * s / 3) - bob * 0.2;
  const shadowAlpha = Math.max(0.15, 0.35 - bob * 0.02);
  ctx.fillStyle = `rgba(0,0,0,${shadowAlpha.toFixed(2)})`;
  ctx.beginPath();
  ctx.ellipse(shadowCenterX, shadowCenterY, shadowScaleX, shadowScaleY, 0, 0, Math.PI * 2);
  ctx.fill();

  // Main sprite
  const bobY = Math.round(bob);
  drawSprite(ctx, lobsterIdle[frame], { x: 0, y: bobY, scale: s });

  // Blink: paint over the white+pupil eye pixels with the body red color
  if (blinking) {
    ctx.fillStyle = palette.r;
    ctx.fillRect(EYE_LEFT_COL * s, (EYE_ROW + bobY) * s, EYE_SIZE * s, EYE_SIZE * s);
    ctx.fillRect(EYE_RIGHT_COL * s, (EYE_ROW + bobY) * s, EYE_SIZE * s, EYE_SIZE * s);
  }

  // Overlays (simple icons) — attached to bob; modes are mutually exclusive.
  // Resolved via the declarative OVERLAY_TIMING map for maintainability.
  const overlayOpts = { x: 0, y: bobY - 2, scale: s };
  const effectiveMode = (mode === 'idle' && idleDurationMs > sleepThresholdMs) ? 'sleep' : mode;
  const timing = OVERLAY_TIMING[effectiveMode];
  if (timing) {
    const { sprites, frameDurationMs } = timing;
    const frameIdx = frameDurationMs > 0 ? Math.floor(t / frameDurationMs) % sprites.length : 0;
    drawSprite(ctx, sprites[frameIdx], overlayOpts);
  }
}
