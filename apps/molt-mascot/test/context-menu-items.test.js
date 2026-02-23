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
    expect(result.statusLine).toContain('2A 3T');
  });

  it('includes latency in status line', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, latencyMs: 42 });
    expect(result.statusLine).toContain('42');
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

  it('omits copy-gateway-url item when disconnected', () => {
    const result = buildContextMenuItems({ ...BASE_STATE, connectedSince: null });
    const item = result.items.find((i) => i.id === 'copy-gateway-url');
    expect(item).toBeUndefined();
  });
});
