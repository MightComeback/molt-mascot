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

import { isValidAlignment, isValidSize } from "@molt/mascot-plugin";
import { isValidOpacity } from "./opacity-presets.cjs";

/**
 * Optional per-property validation.
 * Return true if the value is acceptable, false to skip the update.
 * Numeric properties have domain constraints; string properties like
 * alignment and size are validated against canonical allowed values
 * to prevent invalid state from propagating to the renderer.
 */
const VALIDATORS = {
  alignment: isValidAlignment,
  size: isValidSize,
  opacity: isValidOpacity,
  padding: (v) => v >= 0,
  toolCalls: (v) => v >= 0 && Number.isInteger(v),
  toolErrors: (v) => v >= 0 && Number.isInteger(v),
  startedAt: (v) => v > 0,
  agentSessions: (v) => v >= 0 && Number.isInteger(v),
  activeAgents: (v) => v >= 0 && Number.isInteger(v),
  activeTools: (v) => v >= 0 && Number.isInteger(v),
  lastResetAt: (v) => v > 0,
};

/**
 * Property descriptors: [stateKey, expectedType, callbackName, opts?].
 * Order matches the original sync order for deterministic changed[] output.
 * Exported for introspection (diagnostics, documentation, tooling).
 */
export const SYNC_PROPS = [
  ["clickThrough", "boolean", "onClickThrough"],
  ["alignment", "string", "onAlignment"],
  ["opacity", "number", "onOpacity"],
  ["padding", "number", "onPadding"],
  ["size", "string", "onSize"],
  ["hideText", "boolean", "onHideText"],
  ["reducedMotion", "boolean", "onReducedMotion"],
  ["version", "string", "onVersion"],
  ["toolCalls", "number", "onToolCalls"],
  ["toolErrors", "number", "onToolErrors"],
  ["startedAt", "number", "onStartedAt"],
  ["agentSessions", "number", "onAgentSessions"],
  ["activeAgents", "number", "onActiveAgents"],
  ["activeTools", "number", "onActiveTools"],
  [
    "currentTool",
    "string",
    "onCurrentTool",
    { allowEmpty: true, clearOnMissing: true },
  ],
  ["lastResetAt", "number", "onLastResetAt"],
];

/**
 * Flat list of tracked property names (derived from SYNC_PROPS).
 * Useful for documentation, tooling, and diagnostics without parsing the full descriptor tuples.
 */
export const SYNC_PROP_NAMES = Object.freeze(SYNC_PROPS.map(([key]) => key));

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
 * @param {function} [callbacks.onReducedMotion] - Called with (boolean) when reducedMotion changes.
 * @param {function} [callbacks.onVersion]      - Called with (string) when version changes.
 * @param {function} [callbacks.onToolCalls]    - Called with (number) when toolCalls changes.
 * @param {function} [callbacks.onToolErrors]   - Called with (number) when toolErrors changes.
 * @param {function} [callbacks.onStartedAt]    - Called with (number) when startedAt changes.
 * @param {function} [callbacks.onAgentSessions] - Called with (number) when agentSessions changes (cumulative count).
 * @param {function} [callbacks.onActiveAgents]  - Called with (number) when activeAgents changes (currently active agent sessions).
 * @param {function} [callbacks.onActiveTools]   - Called with (number) when activeTools changes (currently in-flight tool calls).
 * @param {function} [callbacks.onCurrentTool]  - Called with (string) when currentTool changes ('' when cleared).
 * @param {function} [callbacks.onLastResetAt]  - Called with (number) when lastResetAt changes (epoch ms of last manual reset).
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

    for (const entry of SYNC_PROPS) {
      const [key, expectedType, cbName, opts] = entry;
      const val = state[key];

      // When a property is absent from the state and clearOnMissing is set,
      // treat it as an explicit clear (e.g. plugin deletes currentTool when idle).
      // Without this, a stale value lingers in the cache until a new value arrives.
      if (val === undefined && opts?.clearOnMissing) {
        if (last[key] !== null && last[key] !== undefined) {
          last[key] = null;
          callbacks[cbName]?.("");
          changed.push(key);
        }
        continue;
      }

      if (typeof val !== expectedType) continue;
      // String properties must be non-empty to count as a valid update,
      // unless allowEmpty is set (e.g. currentTool clears to '' when idle).
      if (expectedType === "string" && !val && !opts?.allowEmpty) continue;
      // NaN/Infinity guard: only finite numbers are valid state values.
      if (expectedType === "number" && !Number.isFinite(val)) continue;
      // Domain-specific validation (e.g. opacity 0-1, padding >= 0).
      const validate = VALIDATORS[key];
      if (validate && !validate(val)) continue;
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

  /**
   * Return the number of tracked properties that have a non-null cached value.
   * Useful for diagnostics: 0 means no plugin state has been received yet.
   *
   * @returns {number}
   */
  function activeCount() {
    let n = 0;
    for (const [key] of SYNC_PROPS) {
      if (last[key] !== null && last[key] !== undefined) n++;
    }
    return n;
  }

  /**
   * Return a diagnostic snapshot of the sync state.
   * Mirrors getSnapshot() on fps-counter and latency-tracker for API consistency
   * across tracker modules.
   *
   * @returns {{ trackedProps: number, activeProps: number, values: object }}
   */
  function getSnapshot() {
    return {
      trackedProps: SYNC_PROPS.length,
      activeProps: activeCount(),
      values: getLast(),
    };
  }

  /**
   * JSON.stringify() support — delegates to getSnapshot() so
   * `JSON.stringify(pluginSync)` produces a useful diagnostic object
   * without manual plucking (consistent with fpsCounter.toJSON(),
   * latencyTracker.toJSON(), and blinkState.toJSON()).
   *
   * @returns {{ trackedProps: number, activeProps: number, values: object }}
   */
  function toJSON() {
    return getSnapshot();
  }

  /**
   * Human-readable one-line summary for quick diagnostic logging.
   * Example: "PluginSync<8/15 props, clickThrough=true, alignment=bottom-right>"
   * Returns "PluginSync<empty>" when no plugin state has been received yet.
   *
   * Mirrors LatencyTracker.toString(), FpsCounter.toString(), BlinkState.toString(),
   * and GatewayClient.toString() for consistent diagnostic output across modules.
   *
   * @returns {string}
   */
  function toString() {
    const active = activeCount();
    if (active === 0) return "PluginSync<empty>";
    const parts = [`${active}/${SYNC_PROPS.length} props`];
    // Include a few key values for at-a-glance diagnostics
    const current = getLast();
    if (current.version !== null) parts.push(`v${current.version}`);
    if (current.clickThrough !== null)
      parts.push(`ghost=${current.clickThrough}`);
    if (current.alignment !== null) parts.push(current.alignment);
    if (current.currentTool !== null && current.currentTool !== "")
      parts.push(`tool=${current.currentTool}`);
    return `PluginSync<${parts.join(", ")}>`;
  }

  return {
    sync,
    reset,
    last: getLast,
    activeCount,
    getSnapshot,
    toJSON,
    toString,
  };
}
