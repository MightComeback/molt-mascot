import { describe, it, expect } from 'bun:test';
import { resolveStatusConfig, formatStatusText, formatProtocolRange } from '../src/status-cli.cjs';
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
    expect(status.config.startHidden).toBe(false);
    expect(status.config.disableGpu).toBe(false);
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

  it('--start-hidden flag sets startHidden', () => {
    const status = resolveStatusConfig(makeParams({ argv: ['--start-hidden'] }));
    expect(status.config.startHidden).toBe(true);
  });

  it('MOLT_MASCOT_START_HIDDEN env sets startHidden', () => {
    const status = resolveStatusConfig(makeParams({ env: { MOLT_MASCOT_START_HIDDEN: '1' } }));
    expect(status.config.startHidden).toBe(true);
  });

  it('--debug flag sets debug', () => {
    const status = resolveStatusConfig(makeParams({ argv: ['--debug'] }));
    expect(status.config.debug).toBe(true);
  });

  it('MOLT_MASCOT_DEBUG env sets debug', () => {
    const status = resolveStatusConfig(makeParams({ env: { MOLT_MASCOT_DEBUG: '1' } }));
    expect(status.config.debug).toBe(true);
  });

  it('debug defaults to false', () => {
    const status = resolveStatusConfig(makeParams());
    expect(status.config.debug).toBe(false);
  });

  it('--disable-gpu flag sets disableGpu', () => {
    const status = resolveStatusConfig(makeParams({ argv: ['--disable-gpu'] }));
    expect(status.config.disableGpu).toBe(true);
  });

  it('MOLT_MASCOT_DISABLE_GPU env sets disableGpu', () => {
    const status = resolveStatusConfig(makeParams({ env: { MOLT_MASCOT_DISABLE_GPU: 'true' } }));
    expect(status.config.disableGpu).toBe(true);
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
    expect(status.bun).toBeNull();
  });

  it('includes bun version when provided', () => {
    const status = resolveStatusConfig(makeParams({
      versions: { electron: '30.0.0', node: '20.0.0', chrome: '120.0.0', bun: '1.2.0' },
    }));
    expect(status.bun).toBe('1.2.0');
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

  it('OPENCLAW_GATEWAY_URL fallback works', () => {
    const status = resolveStatusConfig(makeParams({ env: { OPENCLAW_GATEWAY_URL: 'ws://openclaw:555' } }));
    expect(status.config.gatewayUrl).toBe('ws://openclaw:555');
  });

  it('OPENCLAW_GATEWAY_TOKEN fallback sets gatewayToken', () => {
    const status = resolveStatusConfig(makeParams({ env: { OPENCLAW_GATEWAY_TOKEN: 'tok' } }));
    expect(status.config.gatewayToken).toBe(true);
  });

  it('MOLT_MASCOT_GATEWAY_URL takes priority over OPENCLAW_GATEWAY_URL', () => {
    const status = resolveStatusConfig(makeParams({
      env: { MOLT_MASCOT_GATEWAY_URL: 'ws://molt:111', OPENCLAW_GATEWAY_URL: 'ws://openclaw:222' },
    }));
    expect(status.config.gatewayUrl).toBe('ws://molt:111');
  });

  it('noTray defaults to false', () => {
    const status = resolveStatusConfig(makeParams());
    expect(status.config.noTray).toBe(false);
  });

  it('MOLT_MASCOT_NO_TRAY env sets noTray', () => {
    const status = resolveStatusConfig(makeParams({ env: { MOLT_MASCOT_NO_TRAY: '1' } }));
    expect(status.config.noTray).toBe(true);
  });

  it('noShortcuts defaults to false', () => {
    const status = resolveStatusConfig(makeParams());
    expect(status.config.noShortcuts).toBe(false);
  });

  it('MOLT_MASCOT_NO_SHORTCUTS env sets noShortcuts', () => {
    const status = resolveStatusConfig(makeParams({ env: { MOLT_MASCOT_NO_SHORTCUTS: '1' } }));
    expect(status.config.noShortcuts).toBe(true);
  });

  it('envOverrides is empty when no env vars are set', () => {
    const status = resolveStatusConfig(makeParams());
    expect(status.envOverrides).toEqual([]);
  });

  it('envOverrides lists active env vars with their affected config', () => {
    const status = resolveStatusConfig(makeParams({
      env: { MOLT_MASCOT_ALIGN: 'top-left', MOLT_MASCOT_DEBUG: '1' },
    }));
    expect(status.envOverrides).toContainEqual({ key: 'MOLT_MASCOT_ALIGN', affects: 'alignment' });
    expect(status.envOverrides).toContainEqual({ key: 'MOLT_MASCOT_DEBUG', affects: 'debug' });
  });

  it('envOverrides includes MOLT_MASCOT_CAPTURE_DIR when set', () => {
    const status = resolveStatusConfig(makeParams({
      env: { MOLT_MASCOT_CAPTURE_DIR: '/tmp/screenshots' },
    }));
    expect(status.envOverrides).toContainEqual({ key: 'MOLT_MASCOT_CAPTURE_DIR', affects: 'captureDir' });
  });

  it('captureDir defaults to null', () => {
    const status = resolveStatusConfig(makeParams());
    expect(status.config.captureDir).toBeNull();
  });

  it('captureDir is resolved from MOLT_MASCOT_CAPTURE_DIR', () => {
    const status = resolveStatusConfig(makeParams({ env: { MOLT_MASCOT_CAPTURE_DIR: '/tmp/caps' } }));
    expect(status.config.captureDir).toBe('/tmp/caps');
  });

  it('envOverrides ignores empty string env vars', () => {
    const status = resolveStatusConfig(makeParams({
      env: { MOLT_MASCOT_ALIGN: '', MOLT_MASCOT_SIZE: 'large' },
    }));
    const keys = status.envOverrides.map(o => o.key);
    expect(keys).not.toContain('MOLT_MASCOT_ALIGN');
    expect(keys).toContain('MOLT_MASCOT_SIZE');
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
    expect(text).toContain('Start hidden:   false');
    expect(text).toContain('Debug:          false');
    expect(text).toContain('Disable GPU:    false');
    expect(text).toContain('Runtime:');
    expect(text).toContain('PID:       12345');
    expect(text).toContain('Platform:  darwin arm64');
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

  it('shows active env overrides section when env vars are set', () => {
    const status = resolveStatusConfig(makeParams({
      env: {
        MOLT_MASCOT_ALIGN: 'top-left',
        MOLT_MASCOT_OPACITY: '0.5',
        MOLT_MASCOT_GATEWAY_URL: 'ws://test:123',
      },
    }));
    const text = formatStatusText(status);
    expect(text).toContain('Active env overrides:');
    expect(text).toContain('MOLT_MASCOT_ALIGN → alignment');
    expect(text).toContain('MOLT_MASCOT_OPACITY → opacity');
    expect(text).toContain('MOLT_MASCOT_GATEWAY_URL → gatewayUrl');
  });

  it('recognizes legacy MOLT_MASCOT_HIDETEXT alias', () => {
    const status = resolveStatusConfig(makeParams({
      env: { MOLT_MASCOT_HIDETEXT: '1' },
    }));
    expect(status.config.hideText).toBe(true);
    const text = formatStatusText(status);
    expect(text).toContain('MOLT_MASCOT_HIDETEXT → hideText');
  });

  it('shows bun version when available', () => {
    const status = resolveStatusConfig(makeParams({
      versions: { electron: '30.0.0', node: '20.0.0', chrome: '120.0.0', bun: '1.2.0' },
    }));
    const text = formatStatusText(status);
    expect(text).toContain('Bun:       1.2.0');
  });

  it('omits bun line when not available', () => {
    const status = resolveStatusConfig(makeParams());
    const text = formatStatusText(status);
    expect(text).not.toContain('Bun:');
  });

  it('omits env overrides section when no env vars are set', () => {
    const status = resolveStatusConfig(makeParams());
    const text = formatStatusText(status);
    expect(text).not.toContain('Active env overrides:');
  });

  it('shows uptime when provided', () => {
    const status = resolveStatusConfig(makeParams({ uptimeSeconds: 3661 }));
    expect(status.uptime).toBe(3661);
    const text = formatStatusText(status);
    expect(text).toContain('Uptime:    1h 1m');
  });

  it('omits uptime line when not provided', () => {
    const status = resolveStatusConfig(makeParams());
    expect(status.uptime).toBeNull();
    const text = formatStatusText(status);
    expect(text).not.toContain('Uptime:');
  });

  it('shows capture dir when set', () => {
    const status = resolveStatusConfig(makeParams({ env: { MOLT_MASCOT_CAPTURE_DIR: '/tmp/caps' } }));
    const text = formatStatusText(status);
    expect(text).toContain('Capture dir:    /tmp/caps');
  });

  it('omits capture dir when not set', () => {
    const status = resolveStatusConfig(makeParams());
    const text = formatStatusText(status);
    expect(text).not.toContain('Capture dir');
  });

  it('shows protocol as compact range', () => {
    const status = resolveStatusConfig(makeParams());
    const text = formatStatusText(status);
    expect(text).toContain('Protocol:       v2–v3');
    expect(text).not.toContain('Min protocol');
    expect(text).not.toContain('Max protocol');
  });

  it('shows single protocol version when min equals max', () => {
    const status = resolveStatusConfig(makeParams({ env: { MOLT_MASCOT_MIN_PROTOCOL: '3', MOLT_MASCOT_MAX_PROTOCOL: '3' } }));
    const text = formatStatusText(status);
    expect(text).toContain('Protocol:       v3');
  });
});

describe('formatProtocolRange', () => {
  it('shows single version when min === max', () => {
    expect(formatProtocolRange(2, 2)).toBe('v2');
  });

  it('shows range when min !== max', () => {
    expect(formatProtocolRange(2, 3)).toBe('v2–v3');
  });

  it('handles wide ranges', () => {
    expect(formatProtocolRange(1, 5)).toBe('v1–v5');
  });
});
