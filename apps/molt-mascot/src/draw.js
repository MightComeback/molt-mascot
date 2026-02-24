/**
 * Drawing/rendering logic for the Molt Mascot pixel lobster.
 * Extracted from renderer.js for testability and separation of concerns.
 *
 * All functions are pure (given a canvas context + parameters) so they can be
 * unit-tested without a real DOM/canvas.
 */

import { palette, lobsterIdle, overlay } from './sprites.js';
import { isSleepingMode } from './utils.js';

// Eye geometry extracted from the sprite grid (row/col/size in sprite pixels).
export const EYE_LEFT_COL = 14;
export const EYE_RIGHT_COL = 18;
export const EYE_ROW = 8;
export const EYE_SIZE = 2; // 2×2 sprite pixels per eye

// Animation timing constants.
// BOB_PERIOD_MS controls the sinusoidal vertical bob cycle; also used to alternate
// the two idle sprite frames (open/closed claws) at the same cadence.
// BOB_AMPLITUDE_PX is the peak vertical displacement in canvas pixels.
export const BOB_PERIOD_MS = 260;
export const BOB_AMPLITUDE_PX = 2;

// Shadow geometry constants (relative to sprite grid).
// SHADOW_CENTER_Y_RATIO positions the shadow ellipse vertically as a fraction of sprite height.
// SHADOW_BASE_ALPHA is the resting opacity; bob displaces it slightly for depth.
export const SHADOW_CENTER_Y_RATIO = 0.81;
export const SHADOW_BASE_ALPHA = 0.35;
export const SHADOW_MIN_ALPHA = 0.15;
// Scale factors for the shadow ellipse radii (multiplied by sprite scale).
// Derived from the original (26/3)*s and (10/3)*s formulas.
export const SHADOW_RX_FACTOR = 26 / 3;
export const SHADOW_RY_FACTOR = 10 / 3;
// How much the bob affects shadow size and opacity (depth cue).
export const SHADOW_BOB_RX_FACTOR = 0.4;
export const SHADOW_BOB_RY_FACTOR = 0.2;
export const SHADOW_BOB_ALPHA_FACTOR = 0.02;

// Overlay vertical offset in canvas pixels (negative = above sprite).
// Shifts mode overlays (thinking, tool, error, etc.) slightly upward
// so they appear to float above the lobster's head rather than overlapping it.
export const OVERLAY_Y_OFFSET_PX = -2;

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
  /** @type {Map<number, OffscreenCanvas|HTMLCanvasElement>} */
  const cache = new Map();
  let lastScale = -1;
  let _hits = 0;
  let _misses = 0;

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
    if (entry) { _hits++; return entry; }

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
    _misses++;
    return offscreen;
  }

  /** Flush the cache (useful for tests). */
  function clear() { cache.clear(); lastScale = -1; _hits = 0; _misses = 0; }

  /** Number of cached entries. */
  function size() { return cache.size; }

  /**
   * Pre-render all known sprites (idle frames + every overlay frame) at the
   * given scale so the first drawLobster() call hits warm cache instead of
   * doing per-pixel fillRect. Call once during app init after canvas is ready.
   *
   * @param {number} scale - Pixel scale factor
   * @returns {number} Number of sprites warmed (0 if canvas unavailable)
   */
  function warmAll(scale) {
    let count = 0;
    // Derive sprite list dynamically from lobsterIdle + all overlay entries
    // so new overlays are automatically warmed without manual enumeration.
    const allSprites = [
      ...lobsterIdle,
      ...Object.values(overlay).flat(),
    ];
    for (const sprite of allSprites) {
      if (get(sprite, scale) !== null) count++;
    }
    return count;
  }

  /**
   * Return a diagnostic snapshot of the sprite cache state.
   * Mirrors getSnapshot() on fps-counter, latency-tracker, blink-state,
   * and plugin-sync for API consistency across tracker/cache modules.
   *
   * @returns {{ size: number, scale: number, spriteIds: number }}
   */
  /**
   * Cache hit rate as an integer percentage (0-100), or null if no lookups yet.
   * Useful for verifying that warmAll() is effective and the hot render path
   * isn't falling back to per-pixel fillRect.
   *
   * @returns {number|null}
   */
  function hitRate() {
    const total = _hits + _misses;
    if (total === 0) return null;
    return Math.round((_hits / total) * 100);
  }

  function getSnapshot() {
    return {
      size: cache.size,
      scale: lastScale,
      spriteIds: nextSpriteId,
      hits: _hits,
      misses: _misses,
      hitRate: hitRate(),
    };
  }

  /**
   * JSON.stringify() support — delegates to getSnapshot() so
   * `JSON.stringify(_spriteCache)` produces a useful diagnostic object
   * (consistent with fpsCounter.toJSON(), latencyTracker.toJSON(), etc.).
   *
   * @returns {{ size: number, scale: number, spriteIds: number }}
   */
  function toJSON() {
    return getSnapshot();
  }

  /**
   * Human-readable one-line summary for quick diagnostic logging.
   * Example: "SpriteCache<12 entries, scale=4>"
   * Mirrors BlinkState.toString(), LatencyTracker.toString(), and
   * PluginSync.toString() for consistent diagnostic output across modules.
   *
   * @returns {string}
   */
  function toString() {
    const rate = hitRate();
    const rateSuffix = rate !== null ? `, ${rate}% hit` : '';
    return `SpriteCache<${cache.size} entr${cache.size === 1 ? 'y' : 'ies'}, scale=${lastScale}${rateSuffix}>`;
  }

  return { get, clear, size, warmAll, hitRate, getSnapshot, toJSON, toString };
})();

// Blink timing constants.
// BLINK_DURATION_MS is how long each blink lasts (eyelids closed).
// BLINK_MIN_INTERVAL_MS / BLINK_MAX_INTERVAL_MS define the random range
// between consecutive blinks (3-6 seconds, mimicking natural blink cadence).
export const BLINK_DURATION_MS = 150;
export const BLINK_MIN_INTERVAL_MS = 3000;
export const BLINK_MAX_INTERVAL_MS = 6000;

/**
 * Blink state manager.
 * The lobster blinks every 3-6 seconds for ~150ms.
 * Returns a stateful object with an `isBlinking(t)` method.
 *
 * @param {{ reducedMotion?: boolean, initialBlinkAt?: number }} [opts]
 */
export function createBlinkState(opts = {}) {
  let nextBlinkAt = opts.initialBlinkAt ?? (2000 + Math.random() * 4000);
  let blinkCount = 0;

  return {
    /** Whether the lobster should be blinking at time t (ms). */
    isBlinking(t) {
      if (opts.reducedMotion) return false;
      if (t >= nextBlinkAt) {
        if (t < nextBlinkAt + BLINK_DURATION_MS) return true;
        // Schedule next blink 3-6s from now
        blinkCount++;
        nextBlinkAt = t + BLINK_MIN_INTERVAL_MS + Math.random() * (BLINK_MAX_INTERVAL_MS - BLINK_MIN_INTERVAL_MS);
      }
      return false;
    },
    /** Current next-blink timestamp (for testing). */
    get nextBlinkAt() { return nextBlinkAt; },
    /** Total blinks completed since creation (for diagnostics). */
    get blinkCount() { return blinkCount; },
    /**
     * Diagnostic snapshot for API consistency with fps-counter,
     * latency-tracker, and plugin-sync tracker modules.
     *
     * @returns {{ blinkCount: number, nextBlinkAt: number, reducedMotion: boolean }}
     */
    getSnapshot() {
      return {
        blinkCount,
        nextBlinkAt,
        reducedMotion: !!opts.reducedMotion,
      };
    },
    /**
     * JSON.stringify() support — delegates to getSnapshot() so
     * `JSON.stringify(blinkState)` produces a useful diagnostic object
     * without manual plucking (consistent with fpsCounter.toJSON()
     * and latencyTracker.toJSON()).
     *
     * @returns {{ blinkCount: number, nextBlinkAt: number, reducedMotion: boolean }}
     */
    toJSON() {
      return this.getSnapshot();
    },
    /**
     * Human-readable one-line summary for quick diagnostic logging.
     * Example: "BlinkState<5 blinks, next in 2.3s>"
     * Returns "BlinkState<paused>" when reducedMotion is active.
     *
     * Mirrors LatencyTracker.toString() and GatewayClient.toString()
     * for consistent diagnostic output across tracker modules.
     *
     * @param {number} [now] - Current timestamp (defaults to Date.now())
     * @returns {string}
     */
    toString(now) {
      if (opts.reducedMotion) return 'BlinkState<paused>';
      const t = now ?? Date.now();
      const untilNext = Math.max(0, nextBlinkAt - t);
      const untilStr = untilNext < 1000 ? `${Math.round(untilNext)}ms` : `${(untilNext / 1000).toFixed(1)}s`;
      return `BlinkState<${blinkCount} blink${blinkCount !== 1 ? 's' : ''}, next in ${untilStr}>`;
    },
    /**
     * Reset blink state: clear the blink count and schedule the next blink
     * relative to the given timestamp. Useful when the mascot transitions
     * between modes (e.g. idle → thinking → idle) to avoid an immediate
     * blink right after a mode change — the delay gives the user a beat
     * to register the new state before the eyes close.
     *
     * @param {number} [now] - Current timestamp (defaults to Date.now())
     */
    reset(now) {
      const t = now ?? Date.now();
      blinkCount = 0;
      nextBlinkAt = t + BLINK_MIN_INTERVAL_MS + Math.random() * (BLINK_MAX_INTERVAL_MS - BLINK_MIN_INTERVAL_MS);
    },
  };
}

/**
 * Overlay animation timing: maps mode → { sprites, frameDurationMs }.
 * Static overlays use a single-element array with frameDurationMs=0.
 * Exported for testing and external tooling.
 */
export const OVERLAY_TIMING = {
  thinking:     { sprites: overlay.thinking,     frameDurationMs: 600 },
  tool:         { sprites: overlay.tool,          frameDurationMs: 700 },
  error:        { sprites: overlay.error,         frameDurationMs: 600 },
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

  const frame = reducedMotion ? 0 : Math.floor(t / BOB_PERIOD_MS) % 2;
  const bob = reducedMotion ? 0 : Math.sin(t / BOB_PERIOD_MS) * BOB_AMPLITUDE_PX;

  // Subtle shadow (keeps it readable on transparent backgrounds)
  // Shadow reacts to bob: when lobster bobs up the shadow shrinks (farther from ground),
  // when it bobs down the shadow grows. Gives a subtle depth/grounding effect.
  const shadowCenterX = (spriteSize * s) / 2;
  const shadowCenterY = (spriteSize * s) * SHADOW_CENTER_Y_RATIO;
  const shadowScaleX = SHADOW_RX_FACTOR * s - bob * SHADOW_BOB_RX_FACTOR;
  const shadowScaleY = SHADOW_RY_FACTOR * s - bob * SHADOW_BOB_RY_FACTOR;
  const shadowAlpha = Math.max(SHADOW_MIN_ALPHA, SHADOW_BASE_ALPHA - bob * SHADOW_BOB_ALPHA_FACTOR);
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
    // bobY is in canvas pixels (not sprite pixels), so add it after scaling EYE_ROW.
    const eyeY = EYE_ROW * s + bobY;
    ctx.fillRect(EYE_LEFT_COL * s, eyeY, EYE_SIZE * s, EYE_SIZE * s);
    ctx.fillRect(EYE_RIGHT_COL * s, eyeY, EYE_SIZE * s, EYE_SIZE * s);
  }

  // Overlays (simple icons) — attached to bob; modes are mutually exclusive.
  // Resolved via the declarative OVERLAY_TIMING map for maintainability.
  const overlayOpts = { x: 0, y: bobY + OVERLAY_Y_OFFSET_PX, scale: s };
  const effectiveMode = isSleepingMode(mode, idleDurationMs, sleepThresholdMs) ? 'sleep' : mode;
  const timing = OVERLAY_TIMING[effectiveMode];
  if (timing) {
    const { sprites, frameDurationMs } = timing;
    // When reduced-motion is active, freeze overlays on the first frame
    // to respect the user's accessibility preference (parity with idle bob suppression).
    const frameIdx = (frameDurationMs > 0 && !reducedMotion)
      ? Math.floor(t / frameDurationMs) % sprites.length
      : 0;
    drawSprite(ctx, sprites[frameIdx], overlayOpts);
  }
}
