import { describe, it, expect } from 'bun:test';
import {
  buildPillLabel,
  PILL_MAX_ERROR_LEN,
  PILL_MAX_DISCONNECT_LEN,
  PILL_MAX_TOOL_LONG_LEN,
  PILL_MAX_TOOL_SHORT_LEN,
} from '../src/pill-label.js';

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

  it('shows Connected ✓ for first connection', () => {
    const result = build({ mode: 'connected' });
    expect(result.label).toBe('Connected ✓');
    expect(result.cssClass).toBe('pill--connected');
  });

  it('shows Connected ✓ when sessionConnectCount is 1 (first connect)', () => {
    const result = build({ mode: 'connected', sessionConnectCount: 1 });
    expect(result.label).toBe('Connected ✓');
  });

  it('shows Reconnected ✓ when sessionConnectCount > 1', () => {
    const result = build({ mode: 'connected', sessionConnectCount: 2 });
    expect(result.label).toBe('Reconnected ✓');
  });

  it('shows Reconnected ✓ for high reconnect counts', () => {
    const result = build({ mode: 'connected', sessionConnectCount: 15 });
    expect(result.label).toBe('Reconnected ✓');
  });

  it('shows connecting with duration after 2 seconds', () => {
    const result = build({
      mode: 'connecting',
      modeSince: NOW - 5_000, // 5 seconds
    });
    expect(result.label).toContain('Connecting…');
    expect(result.label).toContain('5s');
  });

  it('shows Connecting… (with ellipsis) for first 2 seconds', () => {
    const result = build({
      mode: 'connecting',
      modeSince: NOW - 1_000, // 1 second
    });
    expect(result.label).toBe('Connecting…');
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

  it('shows agent count in thinking mode when multiple agents are active', () => {
    const result = build({
      mode: 'thinking',
      modeSince: NOW - 5_000,
      activeAgents: 3,
    });
    expect(result.label).toContain('Thinking');
    expect(result.label).toContain('5s');
    expect(result.label).toContain('3');
  });

  it('shows agent count in thinking mode early (<=2s) when multiple agents', () => {
    const result = build({
      mode: 'thinking',
      modeSince: NOW - 1_000,
      activeAgents: 3,
    });
    expect(result.label).toBe('Thinking · 3');
  });

  it('does not show agent count in thinking mode early when only 1 agent', () => {
    const result = build({
      mode: 'thinking',
      modeSince: NOW - 1_000,
      activeAgents: 1,
    });
    expect(result.label).toBe('Thinking');
  });

  it('does not show agent count in thinking mode when only 1 agent', () => {
    const result = build({
      mode: 'thinking',
      modeSince: NOW - 5_000,
      activeAgents: 1,
    });
    expect(result.label).toBe('Thinking 5s');
  });

  it('does not show agent count in thinking mode when 0 agents', () => {
    const result = build({
      mode: 'thinking',
      modeSince: NOW - 5_000,
      activeAgents: 0,
    });
    expect(result.label).toBe('Thinking 5s');
  });

  it('uses assertive aria-live only for error mode', () => {
    expect(build({ mode: 'error' }).ariaLive).toBe('assertive');
    expect(build({ mode: 'idle' }).ariaLive).toBe('polite');
    expect(build({ mode: 'thinking' }).ariaLive).toBe('polite');
    expect(build({ mode: 'tool' }).ariaLive).toBe('polite');
    expect(build({ mode: 'connected' }).ariaLive).toBe('polite');
  });

  it('shows active tools count in tool mode when >1', () => {
    const result = build({
      mode: 'tool',
      modeSince: NOW - 5_000,
      currentTool: 'web_search',
      activeTools: 3,
    });
    expect(result.label).toContain('· 3');
    expect(result.label).toContain('web_search');
  });

  it('does not show active tools count when 1', () => {
    const result = build({
      mode: 'tool',
      modeSince: NOW - 5_000,
      currentTool: 'web_search',
      activeTools: 1,
    });
    expect(result.label).not.toContain('·');
  });

  it('does not show active tools count when 0', () => {
    const result = build({
      mode: 'tool',
      modeSince: NOW - 1_000,
      currentTool: 'exec',
      activeTools: 0,
    });
    expect(result.label).toBe('exec');
    expect(result.label).not.toContain('·');
  });

  it('shows duration in tool mode without tool name', () => {
    const result = build({
      mode: 'tool',
      modeSince: NOW - 5_000,
      currentTool: '',
    });
    expect(result.label).toBe('Tool 5s');
  });

  it('shows tool count in tool mode without tool name', () => {
    const result = build({
      mode: 'tool',
      modeSince: NOW - 1_000,
      currentTool: '',
      activeTools: 3,
    });
    expect(result.label).toBe('Tool · 3');
  });

  it('shows reconnect attempt in connecting mode after 2s', () => {
    const result = build({
      mode: 'connecting',
      modeSince: NOW - 5_000,
      reconnectAttempt: 3,
    });
    expect(result.label).toBe('Connecting… 5s #3');
  });

  it('omits reconnect attempt #1 in connecting mode (first attempt is not a retry)', () => {
    const result = build({
      mode: 'connecting',
      modeSince: NOW - 5_000,
      reconnectAttempt: 1,
    });
    expect(result.label).toBe('Connecting… 5s');
  });

  it('shows reconnect attempt in disconnected mode', () => {
    const result = build({
      mode: 'disconnected',
      modeSince: NOW - 10_000,
      reconnectAttempt: 2,
    });
    expect(result.label).toBe('Disconnected 10s #2');
  });

  it('shows reconnect attempt with close detail in disconnected mode', () => {
    const result = build({
      mode: 'disconnected',
      modeSince: NOW - 3_000,
      lastCloseDetail: 'abnormal closure',
      reconnectAttempt: 4,
    });
    expect(result.label).toContain('#4');
    expect(result.label).toContain('abnormal closure');
  });

  it('defaults now to Date.now() when not provided', () => {
    const result = buildPillLabel({
      mode: 'idle',
      modeSince: Date.now(),
      sleepThresholdS: 120,
    });
    expect(result.label).toBe('Idle');
  });

  // --- healthStatus indicator ---

  it('appends ⚠️ when healthStatus is degraded', () => {
    const result = build({ mode: 'idle', healthStatus: 'degraded' });
    expect(result.label).toContain('⚠️');
  });

  it('appends 🔴 when healthStatus is unhealthy (non-disconnected mode)', () => {
    const result = build({ mode: 'thinking', modeSince: NOW, healthStatus: 'unhealthy' });
    expect(result.label).toContain('🔴');
  });

  it('omits health indicator when healthy', () => {
    const result = build({ healthStatus: 'healthy' });
    expect(result.label).not.toContain('⚠️');
    expect(result.label).not.toContain('🔴');
  });

  it('omits unhealthy indicator when mode is disconnected (redundant)', () => {
    const result = build({ mode: 'disconnected', modeSince: NOW, healthStatus: 'unhealthy' });
    expect(result.label).not.toContain('🔴');
  });

  it('omits degraded indicator when mode is error (avoid clutter)', () => {
    const result = build({
      mode: 'error',
      modeSince: NOW,
      lastErrorMessage: 'timeout',
      healthStatus: 'degraded',
    });
    expect(result.label).not.toContain('⚠️');
  });

  it('shows both health indicator and ghost emoji when both active', () => {
    const result = build({ healthStatus: 'degraded', isClickThrough: true });
    expect(result.label).toContain('⚠️');
    expect(result.label).toContain('👻');
    // Health indicator should come before ghost emoji
    const healthIdx = result.label.indexOf('⚠️');
    const ghostIdx = result.label.indexOf('👻');
    expect(healthIdx).toBeLessThan(ghostIdx);
  });

  // --- latencyTrend indicator ---

  it('appends ↑ when latencyTrend is rising', () => {
    const result = build({ mode: 'idle', latencyTrend: 'rising' });
    expect(result.label).toContain('↑');
  });

  it('appends ↓ when latencyTrend is falling', () => {
    const result = build({ mode: 'idle', latencyTrend: 'falling' });
    expect(result.label).toContain('↓');
  });

  it('omits trend arrow when latencyTrend is stable', () => {
    const result = build({ mode: 'idle', latencyTrend: 'stable' });
    expect(result.label).not.toContain('↑');
    expect(result.label).not.toContain('↓');
  });

  it('omits trend arrow when latencyTrend is null', () => {
    const result = build({ mode: 'idle', latencyTrend: null });
    expect(result.label).not.toContain('↑');
    expect(result.label).not.toContain('↓');
  });

  it('omits trend arrow in disconnected mode', () => {
    const result = build({ mode: 'disconnected', modeSince: NOW, latencyTrend: 'rising' });
    expect(result.label).not.toContain('↑');
  });

  it('omits trend arrow in error mode', () => {
    const result = build({ mode: 'error', modeSince: NOW, lastErrorMessage: 'fail', latencyTrend: 'rising' });
    expect(result.label).not.toContain('↑');
  });

  it('shows trend arrow before ghost emoji', () => {
    const result = build({ latencyTrend: 'rising', isClickThrough: true });
    const arrowIdx = result.label.indexOf('↑');
    const ghostIdx = result.label.indexOf('👻');
    expect(arrowIdx).toBeLessThan(ghostIdx);
  });
});

describe('ariaLabel', () => {
  it('returns MODE_DESCRIPTIONS entry for idle', () => {
    const result = build();
    expect(result.ariaLabel).toBe('Waiting for activity');
  });

  it('returns sleeping description when idle exceeds threshold', () => {
    const result = build({ modeSince: NOW - 200_000 });
    expect(result.ariaLabel).toBe('Idle for an extended period');
  });

  it('returns description for thinking mode', () => {
    const result = build({ mode: 'thinking', modeSince: NOW });
    expect(result.ariaLabel).toBe('Processing a response');
  });

  it('returns description for tool mode', () => {
    const result = build({ mode: 'tool', modeSince: NOW });
    expect(result.ariaLabel).toBe('Running a tool');
  });

  it('returns description for error mode', () => {
    const result = build({ mode: 'error', modeSince: NOW });
    expect(result.ariaLabel).toBe('An error occurred');
  });

  it('returns description for connecting mode', () => {
    const result = build({ mode: 'connecting', modeSince: NOW });
    expect(result.ariaLabel).toBe('Connecting to gateway');
  });

  it('returns description for disconnected mode', () => {
    const result = build({ mode: 'disconnected', modeSince: NOW });
    expect(result.ariaLabel).toBe('Disconnected from gateway');
  });

  it('returns description for connected mode', () => {
    const result = build({ mode: 'connected', modeSince: NOW });
    expect(result.ariaLabel).toBe('Successfully connected');
  });

  it('returns fallback for unknown mode', () => {
    const result = build({ mode: 'custom', modeSince: NOW });
    expect(result.ariaLabel).toBe('Mascot is custom');
  });
});

describe('connection quality emoji in pill', () => {
  it('shows quality emoji in idle with uptime', () => {
    const result = build({
      mode: 'idle',
      modeSince: NOW - 10_000,
      connectedSince: NOW - 120_000,
      latencyMs: 25,
    });
    // 25ms = excellent = 🟢
    expect(result.label).toContain('🟢');
    expect(result.label).toContain('↑');
  });

  it('shows quality emoji in idle without uptime when short connection', () => {
    const result = build({
      mode: 'idle',
      modeSince: NOW - 10_000,
      connectedSince: NOW - 30_000, // < 60s uptime
      latencyMs: 25,
    });
    expect(result.label).toContain('🟢');
    expect(result.label).toBe('Idle 🟢');
  });

  it('shows poor quality emoji for high latency', () => {
    const result = build({
      mode: 'idle',
      modeSince: NOW - 10_000,
      connectedSince: NOW - 120_000,
      latencyMs: 600,
    });
    expect(result.label).toContain('🔴');
  });

  it('uses median from latencyStats when available', () => {
    const result = build({
      mode: 'idle',
      modeSince: NOW - 10_000,
      connectedSince: NOW - 120_000,
      latencyMs: 600, // high instant
      latencyStats: { median: 30, samples: 10 }, // low median
    });
    // Should use median (30ms = excellent = 🟢) not instant (600ms)
    expect(result.label).toContain('🟢');
  });

  it('shows quality emoji in sleeping mode', () => {
    const result = build({
      mode: 'idle',
      modeSince: NOW - 200_000, // beyond sleep threshold
      connectedSince: NOW - 200_000,
      latencyMs: 150,
    });
    expect(result.label).toContain('Sleeping');
    // 150ms = fair = 🟠
    expect(result.label).toContain('🟠');
  });

  it('omits quality emoji when latencyMs is null', () => {
    const result = build({
      mode: 'idle',
      modeSince: NOW - 10_000,
      connectedSince: NOW - 120_000,
      latencyMs: null,
    });
    expect(result.label).not.toMatch(/[🟢🟡🟠🔴]/);
  });

  it('does not show quality emoji in non-idle modes', () => {
    const result = build({
      mode: 'thinking',
      modeSince: NOW - 5_000,
      latencyMs: 25,
    });
    // Quality emoji is only for idle/sleeping
    expect(result.label).not.toMatch(/[🟢🟡🟠🔴]/);
  });
});

describe('pill label length constants', () => {
  it('exports expected default values', () => {
    expect(PILL_MAX_ERROR_LEN).toBe(48);
    expect(PILL_MAX_DISCONNECT_LEN).toBe(40);
    expect(PILL_MAX_TOOL_LONG_LEN).toBe(32);
    expect(PILL_MAX_TOOL_SHORT_LEN).toBe(24);
  });

  it('all constants are positive integers', () => {
    for (const v of [PILL_MAX_ERROR_LEN, PILL_MAX_DISCONNECT_LEN, PILL_MAX_TOOL_LONG_LEN, PILL_MAX_TOOL_SHORT_LEN]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });
});
