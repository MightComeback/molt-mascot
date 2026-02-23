import { describe, expect, it } from 'bun:test';
import { createPluginSync } from '../src/plugin-sync.js';

describe('createPluginSync', () => {
  it('fires callbacks on first sync with valid state', () => {
    const calls = {};
    const sync = createPluginSync({
      onClickThrough: (v) => { calls.clickThrough = v; },
      onAlignment: (v) => { calls.alignment = v; },
      onOpacity: (v) => { calls.opacity = v; },
      onPadding: (v) => { calls.padding = v; },
      onSize: (v) => { calls.size = v; },
      onHideText: (v) => { calls.hideText = v; },
      onVersion: (v) => { calls.version = v; },
      onToolCalls: (v) => { calls.toolCalls = v; },
      onToolErrors: (v) => { calls.toolErrors = v; },
      onStartedAt: (v) => { calls.startedAt = v; },
      onAgentSessions: (v) => { calls.agentSessions = v; },
      onActiveAgents: (v) => { calls.activeAgents = v; },
      onActiveTools: (v) => { calls.activeTools = v; },
      onCurrentTool: (v) => { calls.currentTool = v; },
      onLastResetAt: (v) => { calls.lastResetAt = v; },
    });

    const changed = sync.sync({
      clickThrough: true,
      alignment: 'top-left',
      opacity: 0.8,
      padding: 16,
      size: 'large',
      hideText: false,
      version: '1.0.0',
      toolCalls: 5,
      toolErrors: 1,
      startedAt: 1700000000000,
      agentSessions: 10,
      activeAgents: 2,
      activeTools: 3,
      currentTool: 'web_fetch',
      lastResetAt: 1700000050000,
    });

    expect(calls.clickThrough).toBe(true);
    expect(calls.alignment).toBe('top-left');
    expect(calls.opacity).toBe(0.8);
    expect(calls.padding).toBe(16);
    expect(calls.size).toBe('large');
    expect(calls.hideText).toBe(false);
    expect(calls.version).toBe('1.0.0');
    expect(calls.toolCalls).toBe(5);
    expect(calls.toolErrors).toBe(1);
    expect(calls.startedAt).toBe(1700000000000);
    expect(calls.agentSessions).toBe(10);
    expect(calls.activeAgents).toBe(2);
    expect(calls.activeTools).toBe(3);
    expect(calls.currentTool).toBe('web_fetch');
    expect(calls.lastResetAt).toBe(1700000050000);
    expect(changed).toEqual([
      'clickThrough', 'alignment', 'opacity', 'padding', 'size', 'hideText',
      'version', 'toolCalls', 'toolErrors', 'startedAt',
      'agentSessions', 'activeAgents', 'activeTools', 'currentTool', 'lastResetAt',
    ]);
  });

  it('does not fire callbacks when values are unchanged', () => {
    let callCount = 0;
    const sync = createPluginSync({
      onOpacity: () => { callCount++; },
    });

    sync.sync({ opacity: 0.5 });
    expect(callCount).toBe(1);

    const changed = sync.sync({ opacity: 0.5 });
    expect(callCount).toBe(1);
    expect(changed).toEqual([]);
  });

  it('fires callback when value changes', () => {
    const values = [];
    const sync = createPluginSync({
      onAlignment: (v) => values.push(v),
    });

    sync.sync({ alignment: 'top-left' });
    sync.sync({ alignment: 'bottom-right' });
    expect(values).toEqual(['top-left', 'bottom-right']);
  });

  it('skips properties with wrong type', () => {
    let called = false;
    const sync = createPluginSync({
      onOpacity: () => { called = true; },
    });

    sync.sync({ opacity: 'not a number' });
    expect(called).toBe(false);
  });

  it('skips empty strings for non-allowEmpty properties', () => {
    let called = false;
    const sync = createPluginSync({
      onAlignment: () => { called = true; },
    });

    sync.sync({ alignment: '' });
    expect(called).toBe(false);
  });

  it('allows empty string for currentTool (allowEmpty)', () => {
    const values = [];
    const sync = createPluginSync({
      onCurrentTool: (v) => values.push(v),
    });

    sync.sync({ currentTool: 'exec' });
    sync.sync({ currentTool: '' });
    expect(values).toEqual(['exec', '']);
  });

  it('validates opacity range (0-1)', () => {
    let called = false;
    const sync = createPluginSync({
      onOpacity: () => { called = true; },
    });

    sync.sync({ opacity: 1.5 });
    expect(called).toBe(false);

    sync.sync({ opacity: -0.1 });
    expect(called).toBe(false);

    sync.sync({ opacity: 0.5 });
    expect(called).toBe(true);
  });

  it('validates padding is non-negative', () => {
    let called = false;
    const sync = createPluginSync({
      onPadding: () => { called = true; },
    });

    sync.sync({ padding: -10 });
    expect(called).toBe(false);

    sync.sync({ padding: 24 });
    expect(called).toBe(true);
  });

  it('validates toolCalls is a non-negative integer', () => {
    const values = [];
    const sync = createPluginSync({
      onToolCalls: (v) => values.push(v),
    });

    sync.sync({ toolCalls: 3.5 });
    sync.sync({ toolCalls: -1 });
    sync.sync({ toolCalls: 10 });
    expect(values).toEqual([10]);
  });

  it('rejects NaN and Infinity for numeric properties', () => {
    let called = false;
    const sync = createPluginSync({
      onOpacity: () => { called = true; },
    });

    sync.sync({ opacity: NaN });
    expect(called).toBe(false);

    sync.sync({ opacity: Infinity });
    expect(called).toBe(false);
  });

  it('reset clears cached values so next sync re-fires all', () => {
    let callCount = 0;
    const sync = createPluginSync({
      onOpacity: () => { callCount++; },
    });

    sync.sync({ opacity: 0.5 });
    expect(callCount).toBe(1);

    sync.reset();

    sync.sync({ opacity: 0.5 });
    expect(callCount).toBe(2);
  });

  it('last() returns a copy of cached values', () => {
    const sync = createPluginSync({});

    sync.sync({ opacity: 0.7, alignment: 'center' });
    const cached = sync.last();
    expect(cached.opacity).toBe(0.7);
    expect(cached.alignment).toBe('center');

    // Mutating the returned object should not affect internal state
    cached.opacity = 0.1;
    expect(sync.last().opacity).toBe(0.7);
  });

  it('returns empty changed list for null/undefined state', () => {
    const sync = createPluginSync({});
    expect(sync.sync(null)).toEqual([]);
    expect(sync.sync(undefined)).toEqual([]);
  });

  it('handles missing callbacks gracefully', () => {
    const sync = createPluginSync({});
    // Should not throw even with no callbacks registered
    const changed = sync.sync({ opacity: 0.5, alignment: 'top-left' });
    expect(changed).toEqual(['alignment', 'opacity']);
  });

  it('clears currentTool when absent from state (clearOnMissing)', () => {
    const calls = [];
    const sync = createPluginSync({
      onCurrentTool: (v) => { calls.push(v); },
    });

    // Set a tool
    sync.sync({ currentTool: 'exec' });
    expect(calls).toEqual(['exec']);

    // State omits currentTool entirely (plugin does `delete state.currentTool`)
    sync.sync({ alignment: 'top-left' });
    expect(calls).toEqual(['exec', '']);

    // Subsequent sync without currentTool should not fire again (already cleared)
    sync.sync({ alignment: 'top-left' });
    expect(calls).toEqual(['exec', '']);

    // Re-setting should fire again
    sync.sync({ currentTool: 'read' });
    expect(calls).toEqual(['exec', '', 'read']);
  });

  it('does not clear non-clearOnMissing properties when absent', () => {
    let called = false;
    const sync = createPluginSync({
      onAlignment: () => { called = true; },
    });

    sync.sync({ alignment: 'top-left' });
    expect(called).toBe(true);
    called = false;

    // alignment is absent but does NOT have clearOnMissing — should not fire
    sync.sync({ opacity: 0.5 });
    expect(called).toBe(false);
  });

  it('validates startedAt is positive', () => {
    let called = false;
    const sync = createPluginSync({
      onStartedAt: () => { called = true; },
    });

    sync.sync({ startedAt: 0 });
    expect(called).toBe(false);

    sync.sync({ startedAt: -1 });
    expect(called).toBe(false);

    sync.sync({ startedAt: 1700000000000 });
    expect(called).toBe(true);
  });
});
