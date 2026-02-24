import { describe, it, expect } from 'bun:test';
import { buildContextMenuItems } from '../src/context-menu-items.js';

const BASE_STATE = {
  currentMode: 'idle',
  modeSince: Date.now() - 5000,
  currentTool: '',
  lastErrorMessage: '',
  isClickThrough: false,
  isTextHidden: false,
  alignment: 'bottom-right',
  sizeLabel: 'medium',
  opacity: 1,
  connectedSince: Date.now() - 60000,
  reconnectAttempt: 0,
  sessionConnectCount: 1,
  pluginToolCalls: 0,
  pluginToolErrors: 0,
  pluginActiveAgents: 0,
  pluginActiveTools: 0,
  latencyMs: null,
  sleepThresholdS: 120,
  appVersion: '1.0.0',
  isMac: true,
  now: Date.now(),
};

describe('buildContextMenuItems', () => {
  it('returns statusLine and items array', () => {
    const result = buildContextMenuItems(BASE_STATE);
    expect(result.statusLine).toBeTypeOf('string');
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBeGreaterThan(10);
  });

  it('first item is disabled status with the statusLine', () => {
    const result = buildContextMenuItems(BASE_STATE);
    expect(result.items[0].id).toBe('status');
    expect(result.items[0].disabled).toBe(true);
    expect(result.items[0].label).toBe(result.statusLine);
  });

  it('includes version in status line', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, appVersion: '2.3.4' });
    expect(result.statusLine).toContain('v2.3.4');
  });

  it('shows plugin version alongside app version when provided', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, appVersion: '2.3.4', pluginVersion: '1.5.0' });
    expect(result.statusLine).toContain('v2.3.4');
    expect(result.statusLine).toContain('p1.5.0');
  });

  it('omits plugin version when not provided', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, appVersion: '2.3.4' });
    expect(result.statusLine).toContain('v2.3.4');
    expect(result.statusLine).not.toContain('(p');
  });

  it('shows sleeping label when idle beyond threshold', () => {
    const now = Date.now();
    const result = buildContextMenuItems({
      ...BASE_STATE,
      currentMode: 'idle',
      modeSince: now - 200_000,
      sleepThresholdS: 120,
      now,
    });
    expect(result.statusLine).toContain('Sleeping');
  });

  it('shows tool name in status when in tool mode', () => {
    const result = buildContextMenuItems({
      ...BASE_STATE,
      currentMode: 'tool',
      currentTool: 'web_search',
    });
    expect(result.statusLine).toContain('web_search');
  });

  it('shows error message in status when in error mode', () => {
    const result = buildContextMenuItems({
      ...BASE_STATE,
      currentMode: 'error',
      lastErrorMessage: 'connection refused',
    });
    expect(result.statusLine).toContain('connection refused');
  });

  it('ghost mode item has checked=true when active', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, isClickThrough: true });
    const ghost = result.items.find((i) => i.id === 'ghost');
    expect(ghost.checked).toBe(true);
    expect(ghost.label).toBe('Ghost Mode');
  });

  it('ghost mode item has checked=false when inactive', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, isClickThrough: false });
    const ghost = result.items.find((i) => i.id === 'ghost');
    expect(ghost.checked).toBe(false);
    expect(ghost.label).toBe('Ghost Mode');
  });

  it('hide text item has checked=true when active', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, isTextHidden: true });
    const item = result.items.find((i) => i.id === 'hide-text');
    expect(item.checked).toBe(true);
    expect(item.label).toBe('Hide Text');
  });

  it('shows "Reconnect Now" when disconnected', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, connectedSince: null });
    const item = result.items.find((i) => i.id === 'reconnect');
    expect(item.label).toBe('Reconnect Now');
  });

  it('shows "Force Reconnect" when connected', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, connectedSince: Date.now() - 1000 });
    const item = result.items.find((i) => i.id === 'reconnect');
    expect(item.label).toBe('Force Reconnect');
  });

  it('uses Ctrl+Shift+ for hints on non-Mac', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, isMac: false });
    const ghost = result.items.find((i) => i.id === 'ghost');
    expect(ghost.hint).toBe('Ctrl+Shift+M');
  });

  it('uses ⌘⇧ for hints on Mac', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, isMac: true });
    const ghost = result.items.find((i) => i.id === 'ghost');
    expect(ghost.hint).toBe('⌘⇧M');
  });

  it('includes alignment label in cycle alignment item', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, alignment: 'top-left' });
    const item = result.items.find((i) => i.id === 'alignment');
    expect(item.label).toContain('top-left');
  });

  it('shows opacity percentage in item label', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, opacity: 0.7 });
    const item = result.items.find((i) => i.id === 'opacity');
    expect(item.label).toContain('70%');
  });

  it('includes retry count in status when disconnected', () => {
    const result = buildContextMenuItems({
      ...BASE_STATE,
      connectedSince: null,
      reconnectAttempt: 3,
    });
    expect(result.statusLine).toContain('retry #3');
  });

  it('includes tool call stats in status line', () => {
    const result = buildContextMenuItems({
      ...BASE_STATE,
      pluginToolCalls: 42,
      pluginToolErrors: 2,
    });
    expect(result.statusLine).toContain('42 calls');
    expect(result.statusLine).toContain('2 err');
  });

  it('includes active agents/tools in status line', () => {
    const result = buildContextMenuItems({
      ...BASE_STATE,
      pluginActiveAgents: 2,
      pluginActiveTools: 3,
    });
    expect(result.statusLine).toContain('2 agents, 3 tools');
  });

  it('includes latency in status line', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, latencyMs: 42 });
    expect(result.statusLine).toContain('42');
  });

  it('appends rising trend arrow to latency', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, latencyMs: 42, latencyTrend: 'rising' });
    expect(result.statusLine).toContain('↑');
  });

  it('appends falling trend arrow to latency', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, latencyMs: 42, latencyTrend: 'falling' });
    expect(result.statusLine).toContain('↓');
  });

  it('omits trend arrow when stable', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, latencyMs: 42, latencyTrend: 'stable' });
    // The status line contains "↑ 1m" (uptime arrow), so check that the latency part doesn't have a trend arrow.
    // Match "42ms" NOT followed by a trend arrow.
    expect(result.statusLine).toMatch(/42ms(?!\s*[↑↓])/);
  });

  it('omits trend arrow when latencyTrend is null', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, latencyMs: 42, latencyTrend: null });
    expect(result.statusLine).toMatch(/42ms(?!\s*[↑↓])/);
  });

  it('includes connection quality emoji when latencyStats provided', () => {
    const stats = { min: 10, max: 30, avg: 20, median: 20, p95: 28, p99: 30, jitter: 5, samples: 10 };
    const result = buildContextMenuItems({ ...BASE_STATE, latencyMs: 20, latencyStats: stats });
    // 20ms median → "excellent" → 🟢
    expect(result.statusLine).toContain('🟢');
  });

  it('shows quality emoji without latencyStats (uses raw latencyMs)', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, latencyMs: 20 });
    // 20ms → "excellent" → 🟢
    expect(result.statusLine).toContain('🟢');
  });

  it('shows orange quality emoji for fair latency', () => {
    const stats = { min: 200, max: 400, avg: 300, median: 300, p95: 380, p99: 400, jitter: 50, samples: 10 };
    const result = buildContextMenuItems({ ...BASE_STATE, latencyMs: 300, latencyStats: stats });
    // 300ms median → "fair" → 🟠
    expect(result.statusLine).toContain('🟠');
  });

  it('includes reconnect count in uptime when flappy', () => {
    const now = Date.now();
    const result = buildContextMenuItems({
      ...BASE_STATE,
      connectedSince: now - 60000,
      sessionConnectCount: 4,
      now,
    });
    expect(result.statusLine).toContain('↻3');
  });

  it('shows degraded health status in status line', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, healthStatus: 'degraded' });
    expect(result.statusLine).toContain('⚠️ degraded');
  });

  it('shows unhealthy health status in status line', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, healthStatus: 'unhealthy' });
    expect(result.statusLine).toContain('🔴 unhealthy');
  });

  it('omits health status when healthy', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, healthStatus: 'healthy' });
    expect(result.statusLine).not.toContain('healthy');
    expect(result.statusLine).not.toContain('degraded');
    expect(result.statusLine).not.toContain('unhealthy');
  });

  it('omits health status when null', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, healthStatus: null });
    expect(result.statusLine).not.toContain('degraded');
    expect(result.statusLine).not.toContain('unhealthy');
  });

  it('shows connection uptime percentage when below 100%', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, connectionUptimePct: 73 });
    expect(result.statusLine).toContain('📶 73%');
  });

  it('omits connection uptime percentage at 100%', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, connectionUptimePct: 100 });
    expect(result.statusLine).not.toContain('📶');
  });

  it('omits connection uptime percentage when null', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, connectionUptimePct: null });
    expect(result.statusLine).not.toContain('📶');
  });

  it('every non-separator item has an id', () => {
    const result = buildContextMenuItems(BASE_STATE);
    for (const item of result.items) {
      expect(item.id).toBeTypeOf('string');
      expect(item.id.length).toBeGreaterThan(0);
    }
  });

  it('has two separator items', () => {
    const result = buildContextMenuItems(BASE_STATE);
    const seps = result.items.filter((i) => i.separator);
    expect(seps.length).toBe(2);
  });

  it('includes copy-gateway-url item when connected', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, connectedSince: Date.now() - 60000 });
    const item = result.items.find((i) => i.id === 'copy-gateway-url');
    expect(item).toBeDefined();
    expect(item.label).toBe('Copy Gateway URL');
  });

  it('omits copy-gateway-url item when disconnected without targetUrl', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, connectedSince: null, targetUrl: undefined });
    const item = result.items.find((i) => i.id === 'copy-gateway-url');
    expect(item).toBeUndefined();
  });

  it('includes copy-gateway-url item when disconnected but targetUrl is set', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, connectedSince: null, targetUrl: 'ws://localhost:18789' });
    const item = result.items.find((i) => i.id === 'copy-gateway-url');
    expect(item).toBeDefined();
    expect(item.label).toBe('Copy Gateway URL');
  });

  it('includes reset-prefs item', () => {
    const result = buildContextMenuItems(BASE_STATE);
    const item = result.items.find((i) => i.id === 'reset-prefs');
    expect(item).toBeDefined();
    expect(item.label).toBe('Reset Preferences…');
  });

  it('size item shows pixel dimensions alongside label', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, sizeLabel: 'medium' });
    const item = result.items.find((i) => i.id === 'size');
    expect(item).toBeDefined();
    expect(item.label).toContain('240×200');
    expect(item.label).toContain('medium');
  });

  it('size item with unknown label falls back gracefully', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, sizeLabel: 'custom' });
    const item = result.items.find((i) => i.id === 'size');
    expect(item).toBeDefined();
    expect(item.label).toContain('custom');
  });

  it('size item shows correct dimensions for each preset', () => {
    const expected = [
      ['tiny', '120×100'],
      ['small', '160×140'],
      ['medium', '240×200'],
      ['large', '360×300'],
      ['xlarge', '480×400'],
    ];
    for (const [label, dims] of expected) {
      const result = buildContextMenuItems({ ...BASE_STATE, sizeLabel: label });
      const item = result.items.find((i) => i.id === 'size');
      expect(item.label).toContain(dims);
      expect(item.label).toContain(label);
    }
  });

  it('includes about, github, devtools, and quit items', () => {
    const result = buildContextMenuItems(BASE_STATE);
    const aboutItem = result.items.find((i) => i.id === 'about');
    expect(aboutItem).toBeDefined();
    expect(aboutItem.label).toBe('About Molt Mascot');

    const githubItem = result.items.find((i) => i.id === 'github');
    expect(githubItem).toBeDefined();
    expect(githubItem.label).toContain('GitHub');

    const devtoolsItem = result.items.find((i) => i.id === 'devtools');
    expect(devtoolsItem).toBeDefined();
    expect(devtoolsItem.label).toBe('DevTools');

    const quitItem = result.items.find((i) => i.id === 'quit');
    expect(quitItem).toBeDefined();
    expect(quitItem.label).toBe('Quit');
  });

  it('quit uses ⌘⌥Q on Mac and Ctrl+Alt+Q on non-Mac', () => {
    const macResult = buildContextMenuItems({ ...BASE_STATE, isMac: true });
    const macQuit = macResult.items.find((i) => i.id === 'quit');
    expect(macQuit.hint).toBe('⌘⌥Q');

    const winResult = buildContextMenuItems({ ...BASE_STATE, isMac: false });
    const winQuit = winResult.items.find((i) => i.id === 'quit');
    expect(winQuit.hint).toBe('Ctrl+Alt+Q');
  });

  it('status line omits version when appVersion is undefined', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, appVersion: undefined });
    expect(result.statusLine).not.toContain('v');
    expect(result.statusLine).not.toContain('undefined');
  });

  it('status line shows uptime arrow when connected', () => {
    const now = Date.now();
    const result = buildContextMenuItems({
      ...BASE_STATE,
      connectedSince: now - 3600000,
      now,
    });
    expect(result.statusLine).toContain('↑');
  });

  it('snap item has correct shortcut', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, isMac: true });
    const snap = result.items.find((i) => i.id === 'snap');
    expect(snap).toBeDefined();
    expect(snap.label).toBe('Snap to Position');
    expect(snap.hint).toBe('⌘⇧S');
  });

  it('snap item is disabled when no drag position', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, hasDragPosition: false });
    const snap = result.items.find((i) => i.id === 'snap');
    expect(snap.disabled).toBe(true);
  });

  it('snap item is enabled when drag position exists', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, hasDragPosition: true });
    const snap = result.items.find((i) => i.id === 'snap');
    expect(snap.disabled).toBe(false);
  });

  it('change-gateway item exists without a shortcut', () => {
    const result = buildContextMenuItems(BASE_STATE);
    const item = result.items.find((i) => i.id === 'change-gateway');
    expect(item).toBeDefined();
    expect(item.label).toBe('Change Gateway…');
    expect(item.hint).toBeUndefined();
  });

  it('shows process uptime in status line when >= 60s', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, processUptimeS: 3661 });
    expect(result.statusLine).toContain('🕐');
    expect(result.statusLine).toContain('1h');
  });

  it('omits process uptime when < 60s', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, processUptimeS: 30 });
    expect(result.statusLine).not.toContain('🕐');
  });

  it('shows process memory RSS in status line', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, processMemoryRssBytes: 52_428_800 });
    expect(result.statusLine).toContain('🧠');
    expect(result.statusLine).toContain('50');
  });

  it('omits process memory when not provided', () => {
    const result = buildContextMenuItems(BASE_STATE);
    expect(result.statusLine).not.toContain('🧠');
  });

  it('includes reduced-motion toggle item', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, reducedMotion: false });
    const item = result.items.find(i => i.id === 'reduced-motion');
    expect(item).toBeDefined();
    expect(item.label).toBe('Reduced Motion');
    expect(item.checked).toBe(false);
  });

  it('reduced-motion item reflects active state', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, reducedMotion: true });
    const item = result.items.find(i => i.id === 'reduced-motion');
    expect(item.checked).toBe(true);
  });
});
