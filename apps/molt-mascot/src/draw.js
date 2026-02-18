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

  // Overlays (simple icons) — attached to bob; modes are mutually exclusive
  const overlayOpts = { x: 0, y: bobY - 2, scale: s };
  if (mode === 'thinking') {
    drawSprite(ctx, overlay.thinking[Math.floor(t / 600) % 2], overlayOpts);
  } else if (mode === 'tool') {
    drawSprite(ctx, overlay.tool, overlayOpts);
  } else if (mode === 'error') {
    drawSprite(ctx, overlay.error, overlayOpts);
  } else if (mode === 'idle' && idleDurationMs > sleepThresholdMs) {
    drawSprite(ctx, overlay.sleep[Math.floor(t / 800) % 2], overlayOpts);
  } else if (mode === 'connecting') {
    drawSprite(ctx, overlay.connecting[Math.floor(t / 500) % 2], overlayOpts);
  } else if (mode === 'connected') {
    drawSprite(ctx, overlay.connected[Math.floor(t / 300) % 2], overlayOpts);
  } else if (mode === 'disconnected') {
    drawSprite(ctx, overlay.disconnected, overlayOpts);
  }
}
