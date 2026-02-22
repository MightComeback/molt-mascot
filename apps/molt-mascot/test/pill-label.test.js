import { describe, it, expect } from 'bun:test';
import { buildPillLabel } from '../src/pill-label.js';

const NOW = 1700000000000;
const SLEEP_THRESHOLD = 120; // seconds

function build(overrides = {}) {
  return buildPillLabel({
    mode: 'idle',
    modeSince: NOW,
    sleepThresholdS: SLEEP_THRESHOLD,
    now: NOW,
    ...overrides,
  });
}

describe('buildPillLabel', () => {
  it('returns capitalized mode for basic idle', () => {
    const result = build();
    expect(result.label).toBe('Idle');
    expect(result.cssClass).toBe('pill--idle');
    expect(result.effectiveMode).toBe('idle');
    expect(result.ariaLive).toBe('polite');
  });

  it('shows uptime when idle and connected for 60+ seconds', () => {
    const result = build({
      connectedSince: NOW - 120_000, // 2 minutes
    });
    expect(result.label).toBe('Idle · ↑2m');
  });

  it('does not show uptime when connected less than 60 seconds', () => {
    const result = build({
      connectedSince: NOW - 30_000, // 30 seconds
    });
    expect(result.label).toBe('Idle');
  });

  it('shows sleeping with duration after threshold', () => {
    const result = build({
      modeSince: NOW - 200_000, // 200 seconds > 120 threshold
    });
    expect(result.label).toContain('Sleeping');
    expect(result.label).toContain('3m');
    expect(result.cssClass).toBe('pill--sleeping');
    expect(result.effectiveMode).toBe('sleeping');
  });

  it('sleeping shows gateway uptime when connected', () => {
    const result = build({
      modeSince: NOW - 200_000,
      connectedSince: NOW - 300_000, // 5 minutes
    });
    expect(result.label).toContain('Sleeping');
    expect(result.label).toContain('↑5m');
  });

  it('sleeping does not show uptime when connected less than 60s', () => {
    const result = build({
      modeSince: NOW - 200_000,
      connectedSince: NOW - 30_000,
    });
    expect(result.label).not.toContain('↑');
  });

  it('shows Connected ✓ for connected mode', () => {
    const result = build({ mode: 'connected' });
    expect(result.label).toBe('Connected ✓');
    expect(result.cssClass).toBe('pill--connected');
  });

  it('shows connecting with duration after 2 seconds', () => {
    const result = build({
      mode: 'connecting',
      modeSince: NOW - 5_000, // 5 seconds
    });
    expect(result.label).toContain('Connecting…');
    expect(result.label).toContain('5s');
  });

  it('shows plain Connecting for first 2 seconds', () => {
    const result = build({
      mode: 'connecting',
      modeSince: NOW - 1_000, // 1 second
    });
    expect(result.label).toBe('Connecting');
  });

  it('shows disconnected with close detail when available', () => {
    const result = build({
      mode: 'disconnected',
      lastCloseDetail: 'abnormal closure (1006)',
    });
    expect(result.label).toContain('Disconnected:');
    expect(result.label).toContain('abnormal closure');
  });

  it('shows disconnected with duration when no close detail', () => {
    const result = build({
      mode: 'disconnected',
      modeSince: NOW - 10_000,
    });
    expect(result.label).toContain('Disconnected');
    expect(result.label).toContain('10s');
  });

  it('shows thinking with duration after 2 seconds', () => {
    const result = build({
      mode: 'thinking',
      modeSince: NOW - 5_000,
    });
    expect(result.label).toContain('Thinking');
    expect(result.label).toContain('5s');
  });

  it('shows plain Thinking for first 2 seconds', () => {
    const result = build({
      mode: 'thinking',
      modeSince: NOW - 1_000,
    });
    expect(result.label).toBe('Thinking');
  });

  it('shows tool name when in tool mode', () => {
    const result = build({
      mode: 'tool',
      currentTool: 'web_search',
      modeSince: NOW - 1_000,
    });
    expect(result.label).toBe('web_search');
    expect(result.cssClass).toBe('pill--tool');
  });

  it('shows tool name with duration after 2 seconds', () => {
    const result = build({
      mode: 'tool',
      currentTool: 'web_search',
      modeSince: NOW - 5_000,
    });
    expect(result.label).toContain('web_search');
    expect(result.label).toContain('5s');
  });

  it('truncates long tool names', () => {
    const result = build({
      mode: 'tool',
      currentTool: 'a_very_long_tool_name_that_exceeds_limits',
      modeSince: NOW - 1_000,
    });
    expect(result.label.length).toBeLessThanOrEqual(25); // 24 + possible ellipsis
  });

  it('shows error message when in error mode', () => {
    const result = build({
      mode: 'error',
      lastErrorMessage: 'connection refused',
    });
    expect(result.label).toBe('connection refused');
    expect(result.cssClass).toBe('pill--error');
    expect(result.ariaLive).toBe('assertive');
  });

  it('truncates long error messages', () => {
    const longError = 'a'.repeat(100);
    const result = build({
      mode: 'error',
      lastErrorMessage: longError,
    });
    expect(result.label.length).toBeLessThanOrEqual(49); // 48 + ellipsis
  });

  it('falls back to capitalized mode when no error message', () => {
    const result = build({
      mode: 'error',
      lastErrorMessage: '',
    });
    expect(result.label).toBe('Error');
  });

  it('appends ghost emoji when click-through is active', () => {
    const result = build({ isClickThrough: true });
    expect(result.label).toContain('👻');
  });

  it('ghost emoji works with all modes', () => {
    for (const mode of ['idle', 'thinking', 'error', 'connected', 'disconnected']) {
      const result = build({ mode, isClickThrough: true });
      expect(result.label).toContain('👻');
    }
  });

  it('uses assertive aria-live only for error mode', () => {
    expect(build({ mode: 'error' }).ariaLive).toBe('assertive');
    expect(build({ mode: 'idle' }).ariaLive).toBe('polite');
    expect(build({ mode: 'thinking' }).ariaLive).toBe('polite');
    expect(build({ mode: 'tool' }).ariaLive).toBe('polite');
    expect(build({ mode: 'connected' }).ariaLive).toBe('polite');
  });

  it('defaults now to Date.now() when not provided', () => {
    const result = buildPillLabel({
      mode: 'idle',
      modeSince: Date.now(),
      sleepThresholdS: 120,
    });
    expect(result.label).toBe('Idle');
  });
});
