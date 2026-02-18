import { describe, it, expect, mock } from 'bun:test';
import { createPluginSync } from '../src/plugin-sync.js';

describe('createPluginSync', () => {
  it('fires callbacks on first sync', () => {
    const onClickThrough = mock(() => {});
    const onAlignment = mock(() => {});
    const ps = createPluginSync({ onClickThrough, onAlignment });

    const changed = ps.sync({ clickThrough: true, alignment: 'top-left' });

    expect(onClickThrough).toHaveBeenCalledWith(true);
    expect(onAlignment).toHaveBeenCalledWith('top-left');
    expect(changed).toContain('clickThrough');
    expect(changed).toContain('alignment');
  });

  it('does not fire callback when value is unchanged', () => {
    const onOpacity = mock(() => {});
    const ps = createPluginSync({ onOpacity });

    ps.sync({ opacity: 0.8 });
    expect(onOpacity).toHaveBeenCalledTimes(1);

    ps.sync({ opacity: 0.8 });
    expect(onOpacity).toHaveBeenCalledTimes(1); // not called again
  });

  it('fires callback when value changes', () => {
    const onOpacity = mock(() => {});
    const ps = createPluginSync({ onOpacity });

    ps.sync({ opacity: 0.8 });
    ps.sync({ opacity: 0.6 });
    expect(onOpacity).toHaveBeenCalledTimes(2);
    expect(onOpacity).toHaveBeenLastCalledWith(0.6);
  });

  it('ignores properties with wrong types', () => {
    const onClickThrough = mock(() => {});
    const onAlignment = mock(() => {});
    const ps = createPluginSync({ onClickThrough, onAlignment });

    ps.sync({ clickThrough: 'yes', alignment: 42 });
    expect(onClickThrough).not.toHaveBeenCalled();
    expect(onAlignment).not.toHaveBeenCalled();
  });

  it('ignores empty string for alignment and size', () => {
    const onAlignment = mock(() => {});
    const onSize = mock(() => {});
    const ps = createPluginSync({ onAlignment, onSize });

    const changed = ps.sync({ alignment: '', size: '' });
    expect(onAlignment).not.toHaveBeenCalled();
    expect(onSize).not.toHaveBeenCalled();
    expect(changed).toEqual([]);
  });

  it('syncs all numeric properties', () => {
    const onPadding = mock(() => {});
    const onToolCalls = mock(() => {});
    const onToolErrors = mock(() => {});
    const onStartedAt = mock(() => {});
    const ps = createPluginSync({ onPadding, onToolCalls, onToolErrors, onStartedAt });

    ps.sync({ padding: 16, toolCalls: 5, toolErrors: 2, startedAt: 1000 });
    expect(onPadding).toHaveBeenCalledWith(16);
    expect(onToolCalls).toHaveBeenCalledWith(5);
    expect(onToolErrors).toHaveBeenCalledWith(2);
    expect(onStartedAt).toHaveBeenCalledWith(1000);
  });

  it('syncs hideText boolean', () => {
    const onHideText = mock(() => {});
    const ps = createPluginSync({ onHideText });

    ps.sync({ hideText: true });
    expect(onHideText).toHaveBeenCalledWith(true);

    ps.sync({ hideText: false });
    expect(onHideText).toHaveBeenCalledWith(false);
  });

  it('syncs version string', () => {
    const onVersion = mock(() => {});
    const ps = createPluginSync({ onVersion });

    ps.sync({ version: '1.2.3' });
    expect(onVersion).toHaveBeenCalledWith('1.2.3');
  });

  it('reset causes next sync to re-fire all callbacks', () => {
    const onOpacity = mock(() => {});
    const ps = createPluginSync({ onOpacity });

    ps.sync({ opacity: 0.8 });
    expect(onOpacity).toHaveBeenCalledTimes(1);

    ps.reset();

    ps.sync({ opacity: 0.8 });
    expect(onOpacity).toHaveBeenCalledTimes(2);
  });

  it('last() returns current cached values', () => {
    const ps = createPluginSync({});

    ps.sync({ opacity: 0.5, alignment: 'center' });
    const cached = ps.last();
    expect(cached.opacity).toBe(0.5);
    expect(cached.alignment).toBe('center');
    expect(cached.clickThrough).toBeNull();
  });

  it('handles null/undefined state gracefully', () => {
    const onOpacity = mock(() => {});
    const ps = createPluginSync({ onOpacity });

    expect(ps.sync(null)).toEqual([]);
    expect(ps.sync(undefined)).toEqual([]);
    expect(onOpacity).not.toHaveBeenCalled();
  });

  it('works without callbacks (no-op)', () => {
    const ps = createPluginSync();
    const changed = ps.sync({ clickThrough: true, opacity: 0.5 });
    expect(changed).toContain('clickThrough');
    expect(changed).toContain('opacity');
  });

  it('returns only changed properties', () => {
    const ps = createPluginSync({});

    ps.sync({ opacity: 0.5, alignment: 'center' });
    const changed = ps.sync({ opacity: 0.5, alignment: 'top-left', padding: 10 });
    expect(changed).toEqual(['alignment', 'padding']);
  });
});
