/**
 * Plugin state synchronization logic.
 *
 * Extracts the repetitive property-comparison-and-dispatch pattern from
 * renderer.js into a pure, testable module. Each property is only applied
 * when the server value differs from the last-seen value (change detection).
 *
 * @module plugin-sync
 */

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
  let last = {
    clickThrough: null,
    alignment: null,
    opacity: null,
    padding: null,
    size: null,
    hideText: null,
    version: null,
    toolCalls: null,
    toolErrors: null,
    startedAt: null,
  };

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

    if (typeof state.clickThrough === 'boolean' && state.clickThrough !== last.clickThrough) {
      last.clickThrough = state.clickThrough;
      callbacks.onClickThrough?.(state.clickThrough);
      changed.push('clickThrough');
    }

    if (typeof state.alignment === 'string' && state.alignment && state.alignment !== last.alignment) {
      last.alignment = state.alignment;
      callbacks.onAlignment?.(state.alignment);
      changed.push('alignment');
    }

    if (typeof state.opacity === 'number' && state.opacity !== last.opacity) {
      last.opacity = state.opacity;
      callbacks.onOpacity?.(state.opacity);
      changed.push('opacity');
    }

    if (typeof state.padding === 'number' && state.padding !== last.padding) {
      last.padding = state.padding;
      callbacks.onPadding?.(state.padding);
      changed.push('padding');
    }

    if (typeof state.size === 'string' && state.size && state.size !== last.size) {
      last.size = state.size;
      callbacks.onSize?.(state.size);
      changed.push('size');
    }

    if (typeof state.hideText === 'boolean' && state.hideText !== last.hideText) {
      last.hideText = state.hideText;
      callbacks.onHideText?.(state.hideText);
      changed.push('hideText');
    }

    if (typeof state.version === 'string' && state.version && state.version !== last.version) {
      last.version = state.version;
      callbacks.onVersion?.(state.version);
      changed.push('version');
    }

    if (typeof state.toolCalls === 'number' && state.toolCalls !== last.toolCalls) {
      last.toolCalls = state.toolCalls;
      callbacks.onToolCalls?.(state.toolCalls);
      changed.push('toolCalls');
    }

    if (typeof state.toolErrors === 'number' && state.toolErrors !== last.toolErrors) {
      last.toolErrors = state.toolErrors;
      callbacks.onToolErrors?.(state.toolErrors);
      changed.push('toolErrors');
    }

    if (typeof state.startedAt === 'number' && state.startedAt !== last.startedAt) {
      last.startedAt = state.startedAt;
      callbacks.onStartedAt?.(state.startedAt);
      changed.push('startedAt');
    }

    return changed;
  }

  /**
   * Reset all cached values (e.g. on disconnect).
   * Next sync will treat every property as changed.
   */
  function reset() {
    last = {
      clickThrough: null,
      alignment: null,
      opacity: null,
      padding: null,
      size: null,
      hideText: null,
      version: null,
      toolCalls: null,
      toolErrors: null,
      startedAt: null,
    };
  }

  /** Get current cached values (for testing/debugging). */
  function getLast() {
    return { ...last };
  }

  return { sync, reset, last: getLast };
}
