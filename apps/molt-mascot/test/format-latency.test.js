import { describe, it, expect } from 'bun:test';
import { formatLatency } from '../src/format-latency.cjs';

describe('formatLatency (canonical source)', () => {
  it('sub-millisecond returns "< 1ms"', () => {
    expect(formatLatency(0)).toBe('< 1ms');
    expect(formatLatency(0.1)).toBe('< 1ms');
    expect(formatLatency(0.999)).toBe('< 1ms');
  });

  it('millisecond range returns rounded "Xms"', () => {
    expect(formatLatency(1)).toBe('1ms');
    expect(formatLatency(42)).toBe('42ms');
    expect(formatLatency(999)).toBe('999ms');
  });

  it('fractional milliseconds are rounded', () => {
    expect(formatLatency(1.4)).toBe('1ms');
    expect(formatLatency(1.6)).toBe('2ms');
    expect(formatLatency(3.7)).toBe('4ms');
    expect(formatLatency(0.4)).toBe('< 1ms');
  });

  it('seconds range returns "X.Ys"', () => {
    expect(formatLatency(1000)).toBe('1.0s');
    expect(formatLatency(1200)).toBe('1.2s');
    expect(formatLatency(5432)).toBe('5.4s');
    expect(formatLatency(10000)).toBe('10.0s');
  });

  it('boundary at 1000ms uses seconds format', () => {
    expect(formatLatency(999)).toBe('999ms');
    expect(formatLatency(1000)).toBe('1.0s');
  });

  it('negative values return dash', () => {
    expect(formatLatency(-1)).toBe('–');
    expect(formatLatency(-100)).toBe('–');
  });

  it('NaN and Infinity return dash', () => {
    expect(formatLatency(NaN)).toBe('–');
    expect(formatLatency(Infinity)).toBe('–');
    expect(formatLatency(-Infinity)).toBe('–');
  });

  it('non-number types return dash', () => {
    expect(formatLatency(null)).toBe('–');
    expect(formatLatency(undefined)).toBe('–');
    expect(formatLatency('42')).toBe('–');
    expect(formatLatency(true)).toBe('–');
    expect(formatLatency({})).toBe('–');
  });
});
