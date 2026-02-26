import { describe, expect, it } from "bun:test";
import {
  drawSprite,
  drawLobster,
  createBlinkState,
  computeShadowParams,
  _spriteCache,
  OVERLAY_TIMING,
  EYE_LEFT_COL,
  EYE_RIGHT_COL,
  EYE_ROW,
  EYE_SIZE,
  BOB_PERIOD_MS,
  BOB_AMPLITUDE_PX,
  SHADOW_CENTER_Y_RATIO,
  SHADOW_BASE_ALPHA,
  SHADOW_MIN_ALPHA,
  SHADOW_RX_FACTOR,
  SHADOW_RY_FACTOR,
  SHADOW_BOB_RX_FACTOR,
  SHADOW_BOB_RY_FACTOR,
  SHADOW_BOB_ALPHA_FACTOR,
  OVERLAY_Y_OFFSET_PX,
  BLINK_DURATION_MS,
  BLINK_MIN_INTERVAL_MS,
  BLINK_MAX_INTERVAL_MS,
  VALID_OVERLAY_MODES,
  isValidOverlayMode,
} from "../src/draw.js";

// Minimal canvas context mock that records draw calls
function mockCtx() {
  const calls = [];
  return {
    calls,
    fillStyle: "",
    clearRect(...args) {
      calls.push({ fn: "clearRect", args });
    },
    fillRect(...args) {
      calls.push({ fn: "fillRect", args, fillStyle: this.fillStyle });
    },
    drawImage(...args) {
      calls.push({ fn: "drawImage", args });
    },
    beginPath() {
      calls.push({ fn: "beginPath" });
    },
    ellipse(...args) {
      calls.push({ fn: "ellipse", args });
    },
    fill() {
      calls.push({ fn: "fill" });
    },
  };
}

describe("drawSprite", () => {
  it("draws filled rectangles for palette characters", () => {
    const ctx = mockCtx();
    // Simple 2x2 sprite with known palette chars
    const sprite = [
      ["r", "."],
      [".", "w"],
    ];
    drawSprite(ctx, sprite, { x: 0, y: 0, scale: 2 });

    const fills = ctx.calls.filter((c) => c.fn === "fillRect");
    // 'r' and 'w' should produce fillRects; '.' is transparent (no color)
    expect(fills.length).toBe(2);
    // First fill at (0,0) for 'r'
    expect(fills[0].args).toEqual([0, 0, 2, 2]);
    // Second fill at (2,2) for 'w' (col=1*2, row=1*2)
    expect(fills[1].args).toEqual([2, 2, 2, 2]);
  });

  it("respects x/y offset and scale", () => {
    const ctx = mockCtx();
    const sprite = [["r"]];
    drawSprite(ctx, sprite, { x: 10, y: 20, scale: 4 });

    const fills = ctx.calls.filter((c) => c.fn === "fillRect");
    expect(fills.length).toBe(1);
    expect(fills[0].args).toEqual([10, 20, 4, 4]);
  });

  it("skips characters not in palette", () => {
    const ctx = mockCtx();
    const sprite = [[".", " ", "?"]]; // none of these have palette entries
    drawSprite(ctx, sprite, { x: 0, y: 0, scale: 1 });

    const fills = ctx.calls.filter((c) => c.fn === "fillRect");
    expect(fills.length).toBe(0);
  });

  it("uses default scale of 3", () => {
    const ctx = mockCtx();
    const sprite = [["r"]];
    drawSprite(ctx, sprite);

    const fills = ctx.calls.filter((c) => c.fn === "fillRect");
    expect(fills[0].args).toEqual([0, 0, 3, 3]);
  });
});

describe("createBlinkState", () => {
  it("does not blink before nextBlinkAt", () => {
    const blink = createBlinkState({ initialBlinkAt: 5000 });
    expect(blink.isBlinking(0)).toBe(false);
    expect(blink.isBlinking(4999)).toBe(false);
  });

  it("blinks at nextBlinkAt for 150ms", () => {
    const blink = createBlinkState({ initialBlinkAt: 5000 });
    expect(blink.isBlinking(5000)).toBe(true);
    expect(blink.isBlinking(5100)).toBe(true);
    expect(blink.isBlinking(5149)).toBe(true);
  });

  it("stops blinking after 150ms and schedules next blink", () => {
    const blink = createBlinkState({ initialBlinkAt: 5000 });
    // Trigger the blink window
    blink.isBlinking(5000);
    // After 150ms, blink ends and next is scheduled 3-6s later
    expect(blink.isBlinking(5150)).toBe(false);
    const next = blink.nextBlinkAt;
    expect(next).toBeGreaterThanOrEqual(5150 + 3000);
    expect(next).toBeLessThanOrEqual(5150 + 6000);
  });

  it("never blinks when reducedMotion is true", () => {
    const blink = createBlinkState({ initialBlinkAt: 0, reducedMotion: true });
    expect(blink.isBlinking(0)).toBe(false);
    expect(blink.isBlinking(100)).toBe(false);
    expect(blink.isBlinking(5000)).toBe(false);
  });

  it("tracks blinkCount across multiple blinks", () => {
    const blink = createBlinkState({ initialBlinkAt: 1000 });
    expect(blink.blinkCount).toBe(0);
    // Trigger first blink then end it
    blink.isBlinking(1000);
    blink.isBlinking(1000 + BLINK_DURATION_MS); // ends first blink
    expect(blink.blinkCount).toBe(1);
    // Trigger second blink
    const next = blink.nextBlinkAt;
    blink.isBlinking(next);
    blink.isBlinking(next + BLINK_DURATION_MS); // ends second blink
    expect(blink.blinkCount).toBe(2);
  });

  it("getSnapshot returns diagnostic object", () => {
    const blink = createBlinkState({ initialBlinkAt: 2000 });
    const snap = blink.getSnapshot();
    expect(snap).toEqual({
      blinkCount: 0,
      nextBlinkAt: 2000,
      reducedMotion: false,
    });
  });

  it("getSnapshot reflects reducedMotion", () => {
    const blink = createBlinkState({ initialBlinkAt: 0, reducedMotion: true });
    expect(blink.getSnapshot().reducedMotion).toBe(true);
  });

  it("toJSON delegates to getSnapshot for JSON.stringify support", () => {
    const blink = createBlinkState({ initialBlinkAt: 5000 });
    const snap = blink.getSnapshot();
    const json = blink.toJSON();
    expect(json).toEqual(snap);
    // Verify JSON.stringify produces the same output
    expect(JSON.stringify(blink)).toBe(JSON.stringify(snap));
  });

  it("toString returns human-readable summary", () => {
    const blink = createBlinkState({ initialBlinkAt: 5000 });
    // oxlint-disable-next-line number-arg-out-of-range -- custom toString(now), not Number.prototype.toString
    const str = blink.toString(3000);
    expect(str).toContain("BlinkState<");
    expect(str).toContain("0 blinks");
    expect(str).toContain("next in");
    // After triggering a blink
    blink.isBlinking(5000);
    blink.isBlinking(5000 + BLINK_DURATION_MS);
    // oxlint-disable-next-line number-arg-out-of-range -- custom toString(now), not Number.prototype.toString
    const str2 = blink.toString(6000);
    expect(str2).toContain("1 blink,"); // singular
  });

  it("toString shows paused when reducedMotion is active", () => {
    const blink = createBlinkState({ reducedMotion: true });
    expect(blink.toString()).toBe("BlinkState<paused>");
  });

  it("reset() clears blinkCount and schedules next blink in the future", () => {
    const blink = createBlinkState({ initialBlinkAt: 1000 });
    // Trigger a blink and end it to increment blinkCount
    blink.isBlinking(1000);
    blink.isBlinking(1000 + BLINK_DURATION_MS);
    expect(blink.blinkCount).toBe(1);

    // Reset at t=5000
    blink.reset(5000);
    expect(blink.blinkCount).toBe(0);
    expect(blink.nextBlinkAt).toBeGreaterThanOrEqual(
      5000 + BLINK_MIN_INTERVAL_MS,
    );
    expect(blink.nextBlinkAt).toBeLessThanOrEqual(5000 + BLINK_MAX_INTERVAL_MS);
  });

  it("reset() without argument uses Date.now()", () => {
    const blink = createBlinkState({ initialBlinkAt: 1000 });
    blink.isBlinking(1000);
    blink.isBlinking(1000 + BLINK_DURATION_MS);

    const before = Date.now();
    blink.reset();
    const after = Date.now();

    expect(blink.blinkCount).toBe(0);
    expect(blink.nextBlinkAt).toBeGreaterThanOrEqual(
      before + BLINK_MIN_INTERVAL_MS,
    );
    expect(blink.nextBlinkAt).toBeLessThanOrEqual(
      after + BLINK_MAX_INTERVAL_MS,
    );
  });

  it("reset() prevents immediate blink after mode transition", () => {
    const blink = createBlinkState({ initialBlinkAt: 1000 });
    // Reset at t=2000 — should NOT blink at t=2000
    blink.reset(2000);
    expect(blink.isBlinking(2000)).toBe(false);
    expect(blink.isBlinking(2100)).toBe(false);
    // Should blink only after the scheduled time
    expect(blink.isBlinking(blink.nextBlinkAt)).toBe(true);
  });
});

describe("blink timing constants", () => {
  it("BLINK_DURATION_MS is 150", () => {
    expect(BLINK_DURATION_MS).toBe(150);
  });

  it("BLINK_MIN_INTERVAL_MS < BLINK_MAX_INTERVAL_MS", () => {
    expect(BLINK_MIN_INTERVAL_MS).toBeLessThan(BLINK_MAX_INTERVAL_MS);
  });

  it("next blink interval uses exported constants", () => {
    const blink = createBlinkState({ initialBlinkAt: 1000 });
    blink.isBlinking(1000);
    blink.isBlinking(1000 + BLINK_DURATION_MS);
    const next = blink.nextBlinkAt;
    const elapsed = 1000 + BLINK_DURATION_MS;
    expect(next).toBeGreaterThanOrEqual(elapsed + BLINK_MIN_INTERVAL_MS);
    expect(next).toBeLessThanOrEqual(elapsed + BLINK_MAX_INTERVAL_MS);
  });
});

describe("drawLobster", () => {
  it("clears the canvas and draws shadow + sprite", () => {
    const ctx = mockCtx();
    drawLobster(ctx, {
      mode: "idle",
      t: 0,
      scale: 3,
      spriteSize: 32,
      reducedMotion: true,
      blinking: false,
      canvas: { width: 96, height: 96 },
    });

    // Should start with clearRect
    expect(ctx.calls[0].fn).toBe("clearRect");
    expect(ctx.calls[0].args).toEqual([0, 0, 96, 96]);

    // Should draw shadow (beginPath + ellipse + fill)
    const beginPaths = ctx.calls.filter((c) => c.fn === "beginPath");
    expect(beginPaths.length).toBe(1);
    const ellipses = ctx.calls.filter((c) => c.fn === "ellipse");
    expect(ellipses.length).toBe(1);

    // Should draw many fillRects for the sprite
    const fills = ctx.calls.filter((c) => c.fn === "fillRect");
    expect(fills.length).toBeGreaterThan(10);
  });

  it("draws blink rectangles when blinking=true", () => {
    const ctx = mockCtx();
    drawLobster(ctx, {
      mode: "idle",
      t: 0,
      scale: 3,
      spriteSize: 32,
      reducedMotion: true, // no bob for deterministic check
      blinking: true,
      canvas: { width: 96, height: 96 },
    });

    // Blink draws 2 red rectangles at the eye positions
    const fills = ctx.calls.filter((c) => c.fn === "fillRect");
    const eyeFills = fills.filter(
      (c) =>
        (c.args[0] === EYE_LEFT_COL * 3 || c.args[0] === EYE_RIGHT_COL * 3) &&
        c.args[1] === EYE_ROW * 3 &&
        c.args[2] === EYE_SIZE * 3 &&
        c.args[3] === EYE_SIZE * 3,
    );
    expect(eyeFills.length).toBe(2);
  });

  it("blink rectangles follow bob offset correctly", () => {
    // Use a time value that produces a non-zero bob (sin(t/260)*2).
    // At t=408 → sin(408/260)≈sin(1.569)≈1.0 → bob≈2 → bobY=2
    const ctx = mockCtx();
    drawLobster(ctx, {
      mode: "idle",
      t: 408,
      scale: 3,
      spriteSize: 32,
      reducedMotion: false,
      blinking: true,
      canvas: { width: 96, height: 96 },
    });

    const bob = Math.sin(408 / 260) * 2;
    const bobY = Math.round(bob);
    // bobY should be non-zero for this test to be meaningful
    expect(bobY).not.toBe(0);

    const fills = ctx.calls.filter((c) => c.fn === "fillRect");
    // Blink should be at EYE_ROW * scale + bobY (canvas pixels), not (EYE_ROW + bobY) * scale
    const expectedY = EYE_ROW * 3 + bobY;
    const eyeFills = fills.filter(
      (c) =>
        (c.args[0] === EYE_LEFT_COL * 3 || c.args[0] === EYE_RIGHT_COL * 3) &&
        c.args[1] === expectedY &&
        c.args[2] === EYE_SIZE * 3 &&
        c.args[3] === EYE_SIZE * 3,
    );
    expect(eyeFills.length).toBe(2);
  });

  it("does not draw blink rectangles when blinking=false", () => {
    const ctx = mockCtx();
    drawLobster(ctx, {
      mode: "idle",
      t: 0,
      scale: 3,
      spriteSize: 32,
      reducedMotion: true,
      blinking: false,
      canvas: { width: 96, height: 96 },
    });

    const fills = ctx.calls.filter((c) => c.fn === "fillRect");
    // Should not have eye-sized fills at exact eye positions with red color
    const eyeFills = fills.filter(
      (c) =>
        (c.args[0] === EYE_LEFT_COL * 3 || c.args[0] === EYE_RIGHT_COL * 3) &&
        c.args[1] === EYE_ROW * 3 &&
        c.args[2] === EYE_SIZE * 3 &&
        c.args[3] === EYE_SIZE * 3,
    );
    expect(eyeFills.length).toBe(0);
  });

  it("draws more fills for overlay modes than plain idle", () => {
    const idleCtx = mockCtx();
    drawLobster(idleCtx, {
      mode: "idle",
      t: 0,
      scale: 3,
      spriteSize: 32,
      reducedMotion: true,
      blinking: false,
      canvas: { width: 96, height: 96 },
    });

    const thinkCtx = mockCtx();
    drawLobster(thinkCtx, {
      mode: "thinking",
      t: 0,
      scale: 3,
      spriteSize: 32,
      reducedMotion: true,
      blinking: false,
      canvas: { width: 96, height: 96 },
    });

    const idleFills = idleCtx.calls.filter((c) => c.fn === "fillRect").length;
    const thinkFills = thinkCtx.calls.filter((c) => c.fn === "fillRect").length;
    // Thinking overlay adds extra pixels
    expect(thinkFills).toBeGreaterThan(idleFills);
  });

  it("draws overlay for connecting, connected, and disconnected modes", () => {
    const baseCtx = mockCtx();
    drawLobster(baseCtx, {
      mode: "idle",
      t: 0,
      scale: 3,
      spriteSize: 32,
      reducedMotion: true,
      blinking: false,
      canvas: { width: 96, height: 96 },
    });
    const baseFills = baseCtx.calls.filter((c) => c.fn === "fillRect").length;

    for (const mode of ["connecting", "connected", "disconnected"]) {
      const ctx = mockCtx();
      drawLobster(ctx, {
        mode,
        t: 0,
        scale: 3,
        spriteSize: 32,
        reducedMotion: true,
        blinking: false,
        canvas: { width: 96, height: 96 },
      });
      const fills = ctx.calls.filter((c) => c.fn === "fillRect").length;
      expect(fills).toBeGreaterThan(baseFills);
    }
  });

  it("draws sleep overlay when idle exceeds sleep threshold", () => {
    const noSleepCtx = mockCtx();
    drawLobster(noSleepCtx, {
      mode: "idle",
      t: 0,
      scale: 3,
      spriteSize: 32,
      reducedMotion: true,
      blinking: false,
      idleDurationMs: 1000,
      sleepThresholdMs: 120000,
      canvas: { width: 96, height: 96 },
    });

    const sleepCtx = mockCtx();
    drawLobster(sleepCtx, {
      mode: "idle",
      t: 0,
      scale: 3,
      spriteSize: 32,
      reducedMotion: true,
      blinking: false,
      idleDurationMs: 200000,
      sleepThresholdMs: 120000,
      canvas: { width: 96, height: 96 },
    });

    const noSleepFills = noSleepCtx.calls.filter(
      (c) => c.fn === "fillRect",
    ).length;
    const sleepFills = sleepCtx.calls.filter((c) => c.fn === "fillRect").length;
    // Sleep overlay should add extra pixels
    expect(sleepFills).toBeGreaterThan(noSleepFills);
  });
});

it("freezes overlay animation on frame 0 when reducedMotion is true", () => {
  // With reducedMotion=false, different t values should produce different overlay frames
  // (for modes with multi-frame overlays like 'thinking').
  // With reducedMotion=true, the overlay should always show frame 0 regardless of t.
  const thinkingTiming = OVERLAY_TIMING.thinking;
  // Pick two t values that map to different frame indices when animated
  const t0 = 0;
  const t1 = thinkingTiming.frameDurationMs; // should be frame 1 when animated

  // reducedMotion=true: both times should produce identical output
  const ctx1 = mockCtx();
  drawLobster(ctx1, {
    mode: "thinking",
    t: t0,
    scale: 3,
    spriteSize: 32,
    reducedMotion: true,
    blinking: false,
    canvas: { width: 96, height: 96 },
  });
  const ctx2 = mockCtx();
  drawLobster(ctx2, {
    mode: "thinking",
    t: t1,
    scale: 3,
    spriteSize: 32,
    reducedMotion: true,
    blinking: false,
    canvas: { width: 96, height: 96 },
  });
  const fills1 = ctx1.calls.filter((c) => c.fn === "fillRect");
  const fills2 = ctx2.calls.filter((c) => c.fn === "fillRect");
  // Same frame 0 → identical fill calls
  expect(fills1.length).toBe(fills2.length);
  for (let i = 0; i < fills1.length; i++) {
    expect(fills1[i].args).toEqual(fills2[i].args);
    expect(fills1[i].fillStyle).toBe(fills2[i].fillStyle);
  }
});

describe("_spriteCache", () => {
  it("returns null in test environment (no OffscreenCanvas/DOM)", () => {
    _spriteCache.clear();
    const sprite = ["rk", "kr"];
    const result = _spriteCache.get(sprite, 3);
    // In a test env without OffscreenCanvas or document.createElement('canvas'),
    // the cache gracefully returns null and drawSprite falls back to fillRect.
    // If OffscreenCanvas IS available (e.g. newer Bun), it returns a canvas object.
    expect(result === null || typeof result === "object").toBe(true);
  });

  it("clear() resets the cache", () => {
    _spriteCache.clear();
    expect(_spriteCache.size()).toBe(0);
  });

  it("returns the same object for the same sprite+scale", () => {
    _spriteCache.clear();
    const sprite = ["rk", "kr"];
    const a = _spriteCache.get(sprite, 3);
    const b = _spriteCache.get(sprite, 3);
    expect(a).toBe(b);
  });

  it("invalidates cache when scale changes", () => {
    _spriteCache.clear();
    const sprite = ["rk"];
    _spriteCache.get(sprite, 3);
    const sizeBefore = _spriteCache.size();
    _spriteCache.get(sprite, 5); // different scale flushes cache
    const sizeAfter = _spriteCache.size();
    // In test env without canvas support, both are 0 (null returns aren't cached).
    // With canvas support, sizeBefore=1 and sizeAfter=1 (old flushed, new added).
    // Key invariant: cache never grows beyond 1 entry for a single sprite after scale change.
    expect(sizeAfter).toBeLessThanOrEqual(1);
    expect(sizeAfter).toBeLessThanOrEqual(sizeBefore + 1);
  });

  it("warmAll() pre-renders all known sprites at given scale", () => {
    _spriteCache.clear();
    const warmed = _spriteCache.warmAll(3);
    // 2 idle + 2×7 overlay modes = 16 total sprite frames
    // In test env without canvas, warmed=0 and size=0 (graceful degradation).
    // With canvas support, warmed=16 and size=16.
    expect(warmed === 0 || warmed === 16).toBe(true);
    expect(_spriteCache.size()).toBe(warmed);
  });

  it("warmAll() is idempotent (second call returns same count)", () => {
    _spriteCache.clear();
    const first = _spriteCache.warmAll(3);
    const sizeBefore = _spriteCache.size();
    const second = _spriteCache.warmAll(3);
    expect(second).toBe(first);
    expect(_spriteCache.size()).toBe(sizeBefore);
  });

  it("getSnapshot() returns diagnostic state", () => {
    _spriteCache.clear();
    const snap = _spriteCache.getSnapshot();
    expect(typeof snap.size).toBe("number");
    expect(typeof snap.scale).toBe("number");
    expect(typeof snap.spriteIds).toBe("number");
    expect(snap.size).toBe(0);
    expect(snap.scale).toBe(-1); // cleared state
  });

  it("getSnapshot() reflects cache state after warmAll", () => {
    _spriteCache.clear();
    _spriteCache.warmAll(3);
    const snap = _spriteCache.getSnapshot();
    expect(snap.scale).toBe(3);
    expect(snap.size).toBe(_spriteCache.size());
    expect(snap.spriteIds).toBeGreaterThan(0);
  });

  it("toJSON() returns same result as getSnapshot()", () => {
    _spriteCache.clear();
    _spriteCache.warmAll(3);
    expect(_spriteCache.toJSON()).toEqual(_spriteCache.getSnapshot());
  });

  it("JSON.stringify() produces a useful diagnostic object", () => {
    _spriteCache.clear();
    const json = JSON.stringify(_spriteCache);
    const parsed = JSON.parse(json);
    expect(typeof parsed.size).toBe("number");
    expect(typeof parsed.scale).toBe("number");
    expect(typeof parsed.spriteIds).toBe("number");
  });

  it("toString() returns human-readable summary", () => {
    _spriteCache.clear();
    expect(_spriteCache.toString()).toBe("SpriteCache<0 entries, scale=-1>");
    _spriteCache.warmAll(4);
    const str = _spriteCache.toString();
    expect(str).toMatch(/^SpriteCache<\d+ entr(y|ies), scale=4/);
    expect(str).toContain("entries");
  });

  it("toString() uses correct plural/singular grammar", () => {
    _spriteCache.clear();
    // In test env without OffscreenCanvas, cache stays empty — verify plural "entries"
    expect(_spriteCache.toString()).toContain("entries");
    // The singular "entry" path is exercised when size() === 1 (requires canvas env)
  });

  it("hitRate() returns null when no lookups have occurred", () => {
    _spriteCache.clear();
    expect(_spriteCache.hitRate()).toBeNull();
  });

  it("hitRate() tracks cache misses on first access", () => {
    _spriteCache.clear();
    const sprite = [
      ["r", "."],
      [".", "w"],
    ];
    _spriteCache.get(sprite, 3); // miss (or null in test env)
    const rate = _spriteCache.hitRate();
    // In test env without OffscreenCanvas, get() returns null without recording a miss,
    // so hitRate may still be null. In a real env it would be 0%.
    if (rate !== null) {
      expect(rate).toBeLessThanOrEqual(100);
      expect(rate).toBeGreaterThanOrEqual(0);
    }
  });

  it("getSnapshot() includes hit/miss stats", () => {
    _spriteCache.clear();
    const snap = _spriteCache.getSnapshot();
    expect(typeof snap.hits).toBe("number");
    expect(typeof snap.misses).toBe("number");
    expect(snap.hits).toBe(0);
    expect(snap.misses).toBe(0);
    // hitRate is null when no lookups
    expect(snap.hitRate).toBeNull();
  });

  it("clear() resets hit/miss counters", () => {
    _spriteCache.clear();
    _spriteCache.warmAll(3); // triggers gets which may record misses
    _spriteCache.clear();
    const snap = _spriteCache.getSnapshot();
    expect(snap.hits).toBe(0);
    expect(snap.misses).toBe(0);
  });

  it("toString() includes hit rate when lookups have occurred", () => {
    _spriteCache.clear();
    _spriteCache.warmAll(3);
    // After warmAll, if any sprites were cached, a second warmAll should hit cache
    _spriteCache.warmAll(3);
    const str = _spriteCache.toString();
    // If there were any lookups, the string should contain "% hit"
    if (_spriteCache.hitRate() !== null) {
      expect(str).toContain("% hit");
    }
  });
});

describe("OVERLAY_TIMING", () => {
  it("has entries for all overlay modes", () => {
    const expected = [
      "thinking",
      "tool",
      "error",
      "sleep",
      "connecting",
      "connected",
      "disconnected",
    ];
    for (const mode of expected) {
      expect(OVERLAY_TIMING[mode]).toBeDefined();
      expect(Array.isArray(OVERLAY_TIMING[mode].sprites)).toBe(true);
      expect(OVERLAY_TIMING[mode].sprites.length).toBeGreaterThan(0);
      expect(typeof OVERLAY_TIMING[mode].frameDurationMs).toBe("number");
    }
  });

  it("all overlays have positive frameDurationMs (animated)", () => {
    for (const mode of [
      "thinking",
      "tool",
      "error",
      "sleep",
      "connecting",
      "connected",
      "disconnected",
    ]) {
      expect(OVERLAY_TIMING[mode].frameDurationMs).toBeGreaterThan(0);
    }
  });
});

describe("VALID_OVERLAY_MODES", () => {
  it("matches OVERLAY_TIMING keys", () => {
    const timingKeys = Object.keys(OVERLAY_TIMING).sort();
    const validModes = [...VALID_OVERLAY_MODES].sort();
    expect(validModes).toEqual(timingKeys);
  });

  it("is a frozen array", () => {
    expect(Object.isFrozen(VALID_OVERLAY_MODES)).toBe(true);
  });
});

describe("isValidOverlayMode", () => {
  it("accepts all valid overlay modes", () => {
    for (const mode of VALID_OVERLAY_MODES) {
      expect(isValidOverlayMode(mode)).toBe(true);
    }
  });

  it("rejects non-overlay modes", () => {
    expect(isValidOverlayMode("idle")).toBe(false);
    expect(isValidOverlayMode("sleeping")).toBe(false);
    expect(isValidOverlayMode("")).toBe(false);
    expect(isValidOverlayMode("THINKING")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isValidOverlayMode(null)).toBe(false);
    expect(isValidOverlayMode(undefined)).toBe(false);
    expect(isValidOverlayMode(42)).toBe(false);
    expect(isValidOverlayMode(true)).toBe(false);
  });
});

describe("eye constants", () => {
  it("are reasonable values within a 32x32 grid", () => {
    expect(EYE_LEFT_COL).toBeGreaterThanOrEqual(0);
    expect(EYE_LEFT_COL).toBeLessThan(32);
    expect(EYE_RIGHT_COL).toBeGreaterThan(EYE_LEFT_COL);
    expect(EYE_RIGHT_COL).toBeLessThan(32);
    expect(EYE_ROW).toBeGreaterThanOrEqual(0);
    expect(EYE_ROW).toBeLessThan(32);
    expect(EYE_SIZE).toBeGreaterThan(0);
  });

  it("align with eye pixels (w/b) in the sprite data", async () => {
    // Dynamically import sprites to validate eye constants match actual sprite pixel data.
    // The blink effect paints over these pixels with body red, so they must be eye pixels
    // (white 'w' or pupil 'b'), not highlight 'h' or body 'r'.
    const { lobsterIdle } = await import("../src/sprites.js");
    const eyeChars = new Set(["w", "b"]);
    for (const frame of lobsterIdle) {
      for (let dy = 0; dy < EYE_SIZE; dy++) {
        for (let dx = 0; dx < EYE_SIZE; dx++) {
          const row = EYE_ROW + dy;
          const leftCol = EYE_LEFT_COL + dx;
          const rightCol = EYE_RIGHT_COL + dx;
          expect(eyeChars.has(frame[row][leftCol])).toBe(true);
          expect(eyeChars.has(frame[row][rightCol])).toBe(true);
        }
      }
    }
  });
});

describe("shadow constants", () => {
  it("SHADOW_CENTER_Y_RATIO is between 0 and 1", () => {
    expect(SHADOW_CENTER_Y_RATIO).toBeGreaterThan(0);
    expect(SHADOW_CENTER_Y_RATIO).toBeLessThanOrEqual(1);
  });

  it("SHADOW_BASE_ALPHA exceeds SHADOW_MIN_ALPHA", () => {
    expect(SHADOW_BASE_ALPHA).toBeGreaterThan(SHADOW_MIN_ALPHA);
    expect(SHADOW_MIN_ALPHA).toBeGreaterThan(0);
    expect(SHADOW_BASE_ALPHA).toBeLessThanOrEqual(1);
  });

  it("shadow radii factors are positive", () => {
    expect(SHADOW_RX_FACTOR).toBeGreaterThan(0);
    expect(SHADOW_RY_FACTOR).toBeGreaterThan(0);
    expect(SHADOW_RX_FACTOR).toBeGreaterThan(SHADOW_RY_FACTOR); // wider than tall
  });

  it("shadow bob factors are positive and small", () => {
    expect(SHADOW_BOB_RX_FACTOR).toBeGreaterThan(0);
    expect(SHADOW_BOB_RY_FACTOR).toBeGreaterThan(0);
    expect(SHADOW_BOB_ALPHA_FACTOR).toBeGreaterThan(0);
    // Bob factors should be small relative to the base values
    expect(SHADOW_BOB_RX_FACTOR).toBeLessThan(SHADOW_RX_FACTOR);
    expect(SHADOW_BOB_RY_FACTOR).toBeLessThan(SHADOW_RY_FACTOR);
  });

  it("drawLobster shadow ellipse uses the named constants correctly", () => {
    const ctx = mockCtx();
    // Use reducedMotion=true so bob=0 for deterministic shadow geometry
    drawLobster(ctx, {
      mode: "idle",
      t: 0,
      scale: 3,
      spriteSize: 32,
      reducedMotion: true,
      blinking: false,
      canvas: { width: 96, height: 96 },
    });

    const ellipses = ctx.calls.filter((c) => c.fn === "ellipse");
    expect(ellipses.length).toBe(1);
    const [cx, cy, rx, ry] = ellipses[0].args;
    // With bob=0 and scale=3, spriteSize=32:
    expect(cx).toBe((32 * 3) / 2); // centerX
    expect(cy).toBe(32 * 3 * SHADOW_CENTER_Y_RATIO); // centerY
    expect(rx).toBeCloseTo(SHADOW_RX_FACTOR * 3, 5); // no bob displacement
    expect(ry).toBeCloseTo(SHADOW_RY_FACTOR * 3, 5);
  });
});

describe("computeShadowParams", () => {
  it("returns correct geometry at zero bob", () => {
    const p = computeShadowParams(32, 3, 0);
    expect(p.cx).toBe((32 * 3) / 2);
    expect(p.cy).toBe(32 * 3 * SHADOW_CENTER_Y_RATIO);
    expect(p.rx).toBeCloseTo(SHADOW_RX_FACTOR * 3, 5);
    expect(p.ry).toBeCloseTo(SHADOW_RY_FACTOR * 3, 5);
    expect(p.alpha).toBeCloseTo(SHADOW_BASE_ALPHA, 5);
  });

  it("positive bob shrinks shadow and reduces alpha", () => {
    const rest = computeShadowParams(32, 3, 0);
    const up = computeShadowParams(32, 3, 2); // lobster bobs up
    expect(up.rx).toBeLessThan(rest.rx);
    expect(up.ry).toBeLessThan(rest.ry);
    expect(up.alpha).toBeLessThan(rest.alpha);
  });

  it("negative bob grows shadow and increases alpha", () => {
    const rest = computeShadowParams(32, 3, 0);
    const down = computeShadowParams(32, 3, -2); // lobster bobs down
    expect(down.rx).toBeGreaterThan(rest.rx);
    expect(down.ry).toBeGreaterThan(rest.ry);
    expect(down.alpha).toBeGreaterThan(rest.alpha);
  });

  it("alpha never drops below SHADOW_MIN_ALPHA", () => {
    // Extreme positive bob
    const p = computeShadowParams(32, 3, 1000);
    expect(p.alpha).toBeGreaterThanOrEqual(SHADOW_MIN_ALPHA);
  });

  it("alpha never exceeds 1 with extreme negative bob", () => {
    // Extreme negative bob (sprite bobs far down) pushes alpha above 1 without clamping
    const p = computeShadowParams(32, 3, -100);
    expect(p.alpha).toBeLessThanOrEqual(1);
    expect(p.alpha).toBeGreaterThanOrEqual(SHADOW_MIN_ALPHA);
  });

  it("radii never go negative with extreme bob values", () => {
    // Extreme positive bob that would push radii negative without clamping
    const p = computeShadowParams(32, 3, 1000);
    expect(p.rx).toBeGreaterThanOrEqual(0);
    expect(p.ry).toBeGreaterThanOrEqual(0);
    // Also test with a small scale where radii are more easily overwhelmed
    const p2 = computeShadowParams(32, 1, 500);
    expect(p2.rx).toBeGreaterThanOrEqual(0);
    expect(p2.ry).toBeGreaterThanOrEqual(0);
  });

  it("scales linearly with scale factor", () => {
    const s2 = computeShadowParams(32, 2, 0);
    const s4 = computeShadowParams(32, 4, 0);
    expect(s4.cx).toBe(s2.cx * 2);
    expect(s4.cy).toBe(s2.cy * 2);
    expect(s4.rx).toBeCloseTo(s2.rx * 2, 5);
    expect(s4.ry).toBeCloseTo(s2.ry * 2, 5);
  });

  it("agrees with drawLobster shadow ellipse args", () => {
    // Verify computeShadowParams produces the same values drawLobster passes to ctx.ellipse
    const ctx = mockCtx();
    drawLobster(ctx, {
      mode: "idle",
      t: 0,
      scale: 3,
      spriteSize: 32,
      reducedMotion: true,
      blinking: false,
      canvas: { width: 96, height: 96 },
    });
    const ellipse = ctx.calls.find((c) => c.fn === "ellipse");
    const p = computeShadowParams(32, 3, 0);
    expect(ellipse.args[0]).toBe(p.cx);
    expect(ellipse.args[1]).toBe(p.cy);
    expect(ellipse.args[2]).toBeCloseTo(p.rx, 5);
    expect(ellipse.args[3]).toBeCloseTo(p.ry, 5);
  });
});

describe("animation constants", () => {
  it("BOB_PERIOD_MS is a positive number", () => {
    expect(typeof BOB_PERIOD_MS).toBe("number");
    expect(BOB_PERIOD_MS).toBeGreaterThan(0);
    expect(Number.isFinite(BOB_PERIOD_MS)).toBe(true);
  });

  it("BOB_AMPLITUDE_PX is a positive number", () => {
    expect(typeof BOB_AMPLITUDE_PX).toBe("number");
    expect(BOB_AMPLITUDE_PX).toBeGreaterThan(0);
    expect(Number.isFinite(BOB_AMPLITUDE_PX)).toBe(true);
  });

  it("drawLobster bob uses BOB_PERIOD_MS and BOB_AMPLITUDE_PX consistently", () => {
    // At t=0, sin(0)=0 so bob=0. At t=BOB_PERIOD_MS*π/2, sin(π/2)=1 so bob=AMPLITUDE.
    // Verify the blink eye position shifts by the expected bob at peak.
    const peakT = (BOB_PERIOD_MS * Math.PI) / 2;
    const expectedBob = Math.round(
      Math.sin(peakT / BOB_PERIOD_MS) * BOB_AMPLITUDE_PX,
    );
    expect(expectedBob).toBe(Math.round(BOB_AMPLITUDE_PX)); // sin(π/2)=1

    const ctx = mockCtx();
    drawLobster(ctx, {
      mode: "idle",
      t: peakT,
      scale: 3,
      spriteSize: 32,
      reducedMotion: false,
      blinking: true,
      canvas: { width: 96, height: 96 },
    });

    const fills = ctx.calls.filter((c) => c.fn === "fillRect");
    const eyeY = EYE_ROW * 3 + expectedBob;
    const eyeFills = fills.filter(
      (c) =>
        (c.args[0] === EYE_LEFT_COL * 3 || c.args[0] === EYE_RIGHT_COL * 3) &&
        c.args[1] === eyeY &&
        c.args[2] === EYE_SIZE * 3 &&
        c.args[3] === EYE_SIZE * 3,
    );
    expect(eyeFills.length).toBe(2);
  });

  it("OVERLAY_Y_OFFSET_PX is a negative finite number (shifts overlays above sprite)", () => {
    expect(typeof OVERLAY_Y_OFFSET_PX).toBe("number");
    expect(Number.isFinite(OVERLAY_Y_OFFSET_PX)).toBe(true);
    expect(OVERLAY_Y_OFFSET_PX).toBeLessThan(0);
  });
});
