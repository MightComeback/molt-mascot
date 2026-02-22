import { describe, it, expect } from 'bun:test';
import { resolveStatusConfig, formatStatusText } from '../src/status-cli.cjs';
import * as sizePresets from '../src/size-presets.cjs';
import { isTruthyEnv } from '../src/is-truthy-env.cjs';
import { hasBoolFlag } from '../src/parse-cli-arg.cjs';

const OPACITY_CYCLE = [1.0, 0.8, 0.6, 0.4, 0.2];

function makeParams(overrides = {}) {
  return {
    appVersion: '0.2.0',
    prefs: {},
    env: {},
    argv: [],
    pid: 12345,
    platform: 'darwin',
    arch: 'arm64',
    versions: { electron: '30.0.0', node: '20.0.0', chrome: '120.0.0' },
    prefsPath: null,
    sizePresets,
    opacityCycle: OPACITY_CYCLE,
    isTruthyEnv,
    hasBoolFlag,
    ...overrides,
  };
}

describe('resolveStatusConfig', () => {
  it('returns defaults with empty env and prefs', () => {
    const status = resolveStatusConfig(makeParams());
    expect(status.config.alignment).toBe('bottom-right');
    expect(status.config.size).toBe('medium');
    expect(status.config.opacity).toBe(1.0);
    expect(status.config.padding).toBe(24);
    expect(status.config.clickThrough).toBe(false);
    expect(status.config.hideText).toBe(false);
    expect(status.config.reducedMotion).toBe(false);
    expect(status.config.minProtocol).toBe(2);
    expect(status.config.maxProtocol).toBe(3);
    expect(status.timing.sleepThresholdS).toBe(120);
    expect(status.timing.idleDelayMs).toBe(800);
    expect(status.timing.errorHoldMs).toBe(5000);
    expect(status.config.gatewayUrl).toBeNull();
    expect(status.config.gatewayToken).toBe(false);
    expect(status.preferences).toBeNull();
  });

  it('env vars override defaults', () => {
    const status = resolveStatusConfig(makeParams({
      env: {
        MOLT_MASCOT_ALIGN: 'top-left',
        MOLT_MASCOT_SIZE: 'large',
        MOLT_MASCOT_OPACITY: '0.5',
        MOLT_MASCOT_PADDING: '10',
        MOLT_MASCOT_GATEWAY_URL: 'ws://localhost:1234',
        MOLT_MASCOT_GATEWAY_TOKEN: 'secret',
        MOLT_MASCOT_CLICK_THROUGH: '1',
        MOLT_MASCOT_HIDE_TEXT: 'true',
        MOLT_MASCOT_REDUCED_MOTION: 'yes',
        MOLT_MASCOT_SLEEP_THRESHOLD_S: '60',
        MOLT_MASCOT_IDLE_DELAY_MS: '500',
        MOLT_MASCOT_ERROR_HOLD_MS: '3000',
        MOLT_MASCOT_MIN_PROTOCOL: '1',
        MOLT_MASCOT_MAX_PROTOCOL: '5',
      },
    }));
    expect(status.config.alignment).toBe('top-left');
    expect(status.config.size).toBe('large');
    expect(status.config.opacity).toBe(0.5);
    expect(status.config.padding).toBe(10);
    expect(status.config.gatewayUrl).toBe('ws://localhost:1234');
    expect(status.config.gatewayToken).toBe(true);
    expect(status.config.clickThrough).toBe(true);
    expect(status.config.hideText).toBe(true);
    expect(status.config.reducedMotion).toBe(true);
    expect(status.timing.sleepThresholdS).toBe(60);
    expect(status.timing.idleDelayMs).toBe(500);
    expect(status.timing.errorHoldMs).toBe(3000);
    expect(status.config.minProtocol).toBe(1);
    expect(status.config.maxProtocol).toBe(5);
  });

  it('saved prefs override defaults but not env', () => {
    const status = resolveStatusConfig(makeParams({
      prefs: { alignment: 'center', sizeIndex: 3, opacityIndex: 2, padding: 50, clickThrough: true },
      prefsPath: '/tmp/prefs.json',
    }));
    expect(status.config.alignment).toBe('center');
    expect(status.config.size).toBe('large');
    expect(status.config.opacity).toBe(OPACITY_CYCLE[2]);
    expect(status.config.padding).toBe(50);
    expect(status.config.clickThrough).toBe(true);
    expect(status.preferences).toEqual({ alignment: 'center', sizeIndex: 3, opacityIndex: 2, padding: 50, clickThrough: true });
  });

  it('env beats prefs for alignment', () => {
    const status = resolveStatusConfig(makeParams({
      env: { MOLT_MASCOT_ALIGN: 'top-right' },
      prefs: { alignment: 'center' },
    }));
    expect(status.config.alignment).toBe('top-right');
  });

  it('custom width/height env overrides size preset dimensions', () => {
    const status = resolveStatusConfig(makeParams({
      env: { MOLT_MASCOT_WIDTH: '300', MOLT_MASCOT_HEIGHT: '250' },
    }));
    expect(status.config.width).toBe(300);
    expect(status.config.height).toBe(250);
  });

  it('--no-tray flag sets noTray', () => {
    const status = resolveStatusConfig(makeParams({ argv: ['--no-tray'] }));
    expect(status.config.noTray).toBe(true);
  });

  it('--no-shortcuts flag sets noShortcuts', () => {
    const status = resolveStatusConfig(makeParams({ argv: ['--no-shortcuts'] }));
    expect(status.config.noShortcuts).toBe(true);
  });

  it('includes runtime info', () => {
    const status = resolveStatusConfig(makeParams());
    expect(status.version).toBe('0.2.0');
    expect(status.pid).toBe(12345);
    expect(status.platform).toBe('darwin');
    expect(status.arch).toBe('arm64');
    expect(status.electron).toBe('30.0.0');
    expect(status.node).toBe('20.0.0');
    expect(status.chrome).toBe('120.0.0');
  });

  it('GATEWAY_URL fallback works', () => {
    const status = resolveStatusConfig(makeParams({ env: { GATEWAY_URL: 'ws://fallback:999' } }));
    expect(status.config.gatewayUrl).toBe('ws://fallback:999');
  });

  it('CLAWDBOT_GATEWAY_URL fallback works', () => {
    const status = resolveStatusConfig(makeParams({ env: { CLAWDBOT_GATEWAY_URL: 'ws://clawd:456' } }));
    expect(status.config.gatewayUrl).toBe('ws://clawd:456');
  });

  it('gatewayUrl (camelCase) fallback works', () => {
    const status = resolveStatusConfig(makeParams({ env: { gatewayUrl: 'ws://camel:789' } }));
    expect(status.config.gatewayUrl).toBe('ws://camel:789');
  });

  it('CLAWDBOT_GATEWAY_TOKEN fallback sets gatewayToken', () => {
    const status = resolveStatusConfig(makeParams({ env: { CLAWDBOT_GATEWAY_TOKEN: 'tok' } }));
    expect(status.config.gatewayToken).toBe(true);
  });

  it('gatewayToken (camelCase) fallback sets gatewayToken', () => {
    const status = resolveStatusConfig(makeParams({ env: { gatewayToken: 'tok' } }));
    expect(status.config.gatewayToken).toBe(true);
  });
});

describe('formatStatusText', () => {
  it('produces a readable string with all sections', () => {
    const status = resolveStatusConfig(makeParams({
      env: { MOLT_MASCOT_GATEWAY_URL: 'ws://test:123' },
    }));
    const text = formatStatusText(status);
    expect(text).toContain('Molt Mascot v0.2.0');
    expect(text).toContain('ws://test:123');
    expect(text).toContain('bottom-right');
    expect(text).toContain('medium');
    expect(text).toContain('100%');
    expect(text).toContain('24px');
    expect(text).toContain('PID: 12345');
    expect(text).toContain('darwin arm64');
  });

  it('shows saved preferences when present', () => {
    const status = resolveStatusConfig(makeParams({
      prefs: { alignment: 'center' },
      prefsPath: '/tmp/p.json',
    }));
    const text = formatStatusText(status);
    expect(text).toContain('Saved preferences:');
    expect(text).toContain('alignment: "center"');
  });

  it('shows (none) for preferences file when null', () => {
    const status = resolveStatusConfig(makeParams());
    const text = formatStatusText(status);
    expect(text).toContain('Preferences file: (none)');
  });

  it('shows (not set) for gateway when null', () => {
    const status = resolveStatusConfig(makeParams());
    const text = formatStatusText(status);
    expect(text).toContain('Gateway URL:    (not set)');
    expect(text).toContain('Gateway token:  (not set)');
  });
});
