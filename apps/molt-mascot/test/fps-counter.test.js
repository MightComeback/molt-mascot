import { describe, it, expect } from 'bun:test';
import { createFpsCounter } from '../src/fps-counter.js';

describe('fps-counter', () => {
  it('starts at 0 fps', () => {
    const c = createFpsCounter();
    expect(c.fps()).toBe(0);
  });

  it('counts frames within 1s window', () => {
    const c = createFpsCounter();
    // Simulate 60 frames over 1 second (16.67ms apart)
    for (let i = 0; i < 60; i++) {
      c.update(i * 16.67);
    }
    expect(c.fps()).toBe(60);
  });

  it('drops old frames outside the window', () => {
    const c = createFpsCounter();
    // 10 frames at t=0..9
    for (let i = 0; i < 10; i++) c.update(i * 100);
    expect(c.fps()).toBe(10);
    // Jump to t=2000 — only this frame should be in window
    c.update(2000);
    expect(c.fps()).toBe(1);
  });

  it('respects custom windowMs', () => {
    const c = createFpsCounter({ windowMs: 500 });
    // 10 frames at 100ms apart: t=0,100,200,...,900
    for (let i = 0; i < 10; i++) c.update(i * 100);
    // At t=900, window is [400, 900] → frames at 500,600,700,800,900 = 5
    // Actually window is (900-500, 900] = frames at 500..900 = 5
    expect(c.fps()).toBe(6); // 400,500,600,700,800,900 — 900-400=500 = boundary
  });

  it('handles buffer wrapping correctly', () => {
    const c = createFpsCounter({ bufferSize: 4 });
    c.update(0);
    c.update(100);
    c.update(200);
    c.update(300);
    c.update(400); // wraps around, overwrites slot 0
    c.update(500);
    // Window: [500-1000, 500] = all 4 stored frames are within 1s
    expect(c.fps()).toBeGreaterThanOrEqual(4);
  });

  it('reset clears all state', () => {
    const c = createFpsCounter();
    c.update(0);
    c.update(16);
    c.update(32);
    expect(c.fps()).toBe(3);
    c.reset();
    expect(c.fps()).toBe(0);
    // After reset, fresh start
    c.update(1000);
    expect(c.fps()).toBe(1);
  });

  it('single frame yields fps of 1', () => {
    const c = createFpsCounter();
    c.update(5000);
    expect(c.fps()).toBe(1);
  });

  it('all frames at same timestamp counts them all', () => {
    const c = createFpsCounter({ bufferSize: 10 });
    for (let i = 0; i < 5; i++) c.update(1000);
    expect(c.fps()).toBe(5);
  });

  it('frameCount starts at 0', () => {
    const c = createFpsCounter();
    expect(c.frameCount()).toBe(0);
  });

  it('frameCount tracks total frames across updates', () => {
    const c = createFpsCounter();
    c.update(0);
    c.update(100);
    c.update(200);
    expect(c.frameCount()).toBe(3);
    // Even after frames fall outside the FPS window, total count keeps growing
    c.update(5000);
    expect(c.frameCount()).toBe(4);
    expect(c.fps()).toBe(1); // only the last frame is in the window
  });

  it('frameCount resets to 0 on reset()', () => {
    const c = createFpsCounter();
    c.update(0);
    c.update(16);
    expect(c.frameCount()).toBe(2);
    c.reset();
    expect(c.frameCount()).toBe(0);
    c.update(1000);
    expect(c.frameCount()).toBe(1);
  });

  it('getSnapshot returns all metrics in one call', () => {
    const c = createFpsCounter();
    // Before any frames
    const snap0 = c.getSnapshot();
    expect(snap0.fps).toBe(0);
    expect(snap0.frameCount).toBe(0);
    expect(snap0.avgFrameTimeMs).toBeNull();

    // Simulate 10 frames over 1s window (100ms apart)
    for (let i = 0; i < 10; i++) c.update(i * 100);
    const snap1 = c.getSnapshot();
    expect(snap1.fps).toBe(10);
    expect(snap1.frameCount).toBe(10);
    expect(snap1.avgFrameTimeMs).toBe(100);
  });

  it('getSnapshot avgFrameTimeMs uses custom windowMs', () => {
    const c = createFpsCounter({ windowMs: 2000 });
    // 20 frames in 2s window = 10 fps equivalent, avg frame time = 2000/20 = 100ms
    for (let i = 0; i < 20; i++) c.update(i * 100);
    const snap = c.getSnapshot();
    expect(snap.fps).toBe(20);
    expect(snap.avgFrameTimeMs).toBe(100);
  });

  it('getSnapshot resets with reset()', () => {
    const c = createFpsCounter();
    c.update(0);
    c.update(16);
    c.reset();
    const snap = c.getSnapshot();
    expect(snap.fps).toBe(0);
    expect(snap.frameCount).toBe(0);
    expect(snap.avgFrameTimeMs).toBeNull();
  });
});
