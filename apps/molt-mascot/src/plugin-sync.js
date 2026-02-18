/**
 * Plugin state synchronization logic.
 *
 * Extracts the repetitive property-comparison-and-dispatch pattern from
 * renderer.js into a pure, testable module. Each property is only applied
 * when the server value differs from the last-seen value (change detection).
 *
 * Uses a declarative property map so adding new synced properties is a
 * one-liner instead of a duplicated if-block.
 *
 * @module plugin-sync
 */

/**
 * Property descriptors: [stateKey, expectedType, callbackName].
 * Order matches the original sync order for deterministic changed[] output.
 */
const SYNC_PROPS = [
  ['clickThrough', 'boolean', 'onClickThrough'],
  ['alignment',    'string',  'onAlignment'],
  ['opacity',      'number',  'onOpacity'],
  ['padding',      'number',  'onPadding'],
  ['size',         'string',  'onSize'],
  ['hideText',     'boolean', 'onHideText'],
  ['version',      'string',  'onVersion'],
  ['toolCalls',    'number',  'onToolCalls'],
  ['toolErrors',   'number',  'onToolErrors'],
  ['startedAt',    'number',  'onStartedAt'],
];

/** Build a fresh cache object with all tracked keys set to null. */
function emptyCache() {
  const obj = {};
  for (const [key] of SYNC_PROPS) obj[key] = null;
  return obj;
}

/**
 * Create a plugin state synchronizer.
 *
 * @param {object} callbacks - Functions to call when properties change.
 * @param {function} [callbacks.onClickThrough] - Called with (boolean) when clickThrough changes.
 * @param {function} [callbacks.onAlignment]    - Called with (string) when alignment changes.
 * @param {function} [callbacks.onOpacity]      - Called with (number) when opacity changes.
 * @param {function} [callbacks.onPadding]      - Called with (number) when padding changes.
 * @param {function} [callbacks.onSize]         - Called with (string) when size changes.
 * @param {function} [callbacks.onHideText]     - Called with (boolean) when hideText changes.
 * @param {function} [callbacks.onVersion]      - Called with (string) when version changes.
 * @param {function} [callbacks.onToolCalls]    - Called with (number) when toolCalls changes.
 * @param {function} [callbacks.onToolErrors]   - Called with (number) when toolErrors changes.
 * @param {function} [callbacks.onStartedAt]    - Called with (number) when startedAt changes.
 * @returns {{ sync: function, reset: function, last: function }}
 */
export function createPluginSync(callbacks = {}) {
  let last = emptyCache();

  /**
   * Sync plugin state from a response payload.
   * Only fires callbacks when the value actually changed.
   *
   * @param {object} state - The `msg.payload.state` object from the plugin.
   * @returns {string[]} List of property names that changed.
   */
  function sync(state) {
    if (!state) return [];
    const changed = [];

    for (const [key, expectedType, cbName] of SYNC_PROPS) {
      const val = state[key];
      if (typeof val !== expectedType) continue;
      // String properties must be non-empty to count as a valid update.
      if (expectedType === 'string' && !val) continue;
      if (val === last[key]) continue;
      last[key] = val;
      callbacks[cbName]?.(val);
      changed.push(key);
    }

    return changed;
  }

  /**
   * Reset all cached values (e.g. on disconnect).
   * Next sync will treat every property as changed.
   */
  function reset() {
    last = emptyCache();
  }

  /** Get current cached values (for testing/debugging). */
  function getLast() {
    return { ...last };
  }

  return { sync, reset, last: getLast };
}
