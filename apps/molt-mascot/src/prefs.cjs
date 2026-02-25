/**
 * User preference persistence for Molt Mascot.
 * Extracted from electron-main.cjs for testability and reuse.
 *
 * Saves runtime preferences (alignment, size, ghost mode, hide-text, etc.)
 * to a JSON file so they survive app restarts without requiring env vars.
 */

const fs = require("fs");
const path = require("path");
const { isValidAlignment } = require("./get-position.cjs");
const { isValidSize } = require("./size-presets.cjs");
const { isValidOpacity } = require("./opacity-presets.cjs");

/**
 * Create a preferences manager.
 *
 * @param {string} filePath - Absolute path to the preferences JSON file
 * @param {{ debounceMs?: number }} [opts]
 * @returns {{ load: () => object, save: (patch: object) => void, flush: () => void, filePath: string }}
 */
function createPrefsManager(filePath, opts = {}) {
  const debounceMs = opts.debounceMs ?? 500;

  // Debounced persistence state.
  // Rapid actions (e.g. cycling alignment 5× quickly) batch into a single disk write.
  let _pending = null;
  let _timer = null;

  /**
   * Load preferences from disk.
   * Returns an empty object if the file doesn't exist or is invalid JSON.
   *
   * @returns {object}
   */
  function load() {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      return {};
    }
  }

  /**
   * Immediately flush any pending preferences to disk.
   * Called internally by the debounce timer and exposed for shutdown cleanup.
   */
  function flush() {
    if (_timer) {
      clearTimeout(_timer);
      _timer = null;
    }
    if (!_pending) return;
    const merged = _pending;
    _pending = null;
    try {
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      // Atomic write: write to a temp file then rename, so a crash mid-write
      // doesn't corrupt the preferences file.
      const tmp = path.join(dir, `.preferences.${process.pid}.tmp`);
      fs.writeFileSync(tmp, JSON.stringify(merged, null, 2));
      try {
        fs.renameSync(tmp, filePath);
      } catch {
        // On Windows, renameSync can fail with EPERM/EACCES when overwriting.
        // Fall back to copy + unlink which is less atomic but more portable.
        fs.copyFileSync(tmp, filePath);
        try {
          fs.unlinkSync(tmp);
        } catch {}
      }
    } catch {
      // Best-effort; don't crash if disk is full or permissions are wrong.
    }
  }

  /**
   * Save a preferences patch (merged with current prefs).
   * Debounced: batches rapid calls into a single disk write.
   *
   * @param {object} patch - Key-value pairs to merge into preferences
   */
  function save(patch) {
    try {
      const current = _pending || load();
      _pending = { ...current, ...patch };
      if (_timer) clearTimeout(_timer);
      _timer = setTimeout(flush, debounceMs);
    } catch {
      // Best-effort
    }
  }

  /**
   * Delete one or more preference keys (revert to env-var / built-in defaults).
   * Debounced like save() — batches with any pending writes.
   *
   * @param {...string} keys - Preference key(s) to remove
   */
  function remove(...keys) {
    if (!keys.length) return;
    try {
      const current = _pending || load();
      _pending = { ...current };
      for (const key of keys) delete _pending[key];
      if (_timer) clearTimeout(_timer);
      _timer = setTimeout(flush, debounceMs);
    } catch {
      // Best-effort
    }
  }

  /**
   * Clear all preferences: cancel pending writes and delete the file.
   * Used by --reset-prefs to ensure a clean slate without race conditions
   * from any in-flight debounced writes.
   *
   * @returns {boolean} true if a file was deleted, false if it didn't exist
   */
  function clear() {
    // Cancel any pending debounced write so it doesn't recreate the file.
    if (_timer) {
      clearTimeout(_timer);
      _timer = null;
    }
    _pending = null;
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (err) {
      if (err.code === "ENOENT") return false;
      throw err;
    }
  }

  /**
   * Check whether a preference key has been explicitly set.
   * Considers both pending (unsaved) and persisted values.
   *
   * @param {string} key - Preference key to check
   * @returns {boolean} true if the key exists with a non-undefined value
   */
  function has(key) {
    if (_pending) return key in _pending && _pending[key] !== undefined;
    const current = load();
    return key in current && current[key] !== undefined;
  }

  /**
   * Get a single preference value by key.
   * Considers pending (unsaved) writes first, then falls back to persisted values.
   * Returns the provided default (or undefined) if the key is not set.
   *
   * @param {string} key - Preference key to retrieve
   * @param {*} [defaultValue] - Value to return if the key is not set
   * @returns {*} The preference value, or defaultValue if not found
   */
  function get(key, defaultValue) {
    const current = _pending || load();
    if (key in current && current[key] !== undefined) return current[key];
    return defaultValue;
  }

  /**
   * Return all preference keys currently set (pending + persisted).
   * Useful for diagnostics (e.g. --list-prefs) and iteration.
   *
   * @returns {string[]} Array of preference key names
   */
  function keys() {
    const current = _pending || load();
    return Object.keys(current).filter((k) => current[k] !== undefined);
  }

  /**
   * Set a single preference key-value pair.
   * Convenience wrapper around save() for single-key updates.
   * Debounced like save() — batches with any pending writes.
   *
   * @param {string} key - Preference key to set
   * @param {*} value - Value to store
   */
  function set(key, value) {
    save({ [key]: value });
  }

  /**
   * Return a shallow copy of all current preferences (pending + persisted).
   * Unlike load(), includes any unsaved pending writes.
   * Returns a plain object safe to mutate without affecting internal state.
   *
   * @returns {object} Shallow copy of all preference key-value pairs
   */
  function getAll() {
    const current = _pending || load();
    const result = {};
    for (const k of Object.keys(current)) {
      if (current[k] !== undefined) result[k] = current[k];
    }
    return result;
  }

  /**
   * Return the number of preference keys currently set (pending + persisted).
   * Convenience for diagnostics (e.g. "12 saved preferences" in --status output).
   *
   * @returns {number}
   */
  function size() {
    return keys().length;
  }

  /**
   * Load preferences from disk and sanitize through validatePrefs().
   * Strips unknown keys and coerces invalid values, returning only clean data.
   * Use this instead of load() when you want guaranteed-valid preferences
   * (e.g. at app startup where hand-edited or corrupted files could cause issues).
   *
   * @returns {{ clean: object, dropped: Array<{ key: string, reason: string }> }}
   */
  function loadValidated() {
    const raw = load();
    return validatePrefs(raw);
  }

  /**
   * Return a diagnostic snapshot of the preferences manager state.
   * Mirrors getSnapshot() on fps-counter, latency-tracker, plugin-sync,
   * blink-state, and sprite-cache for API consistency across modules.
   *
   * Omits actual preference values to avoid leaking sensitive config in
   * JSON.stringify() output; use getAll() when values are needed.
   *
   * @returns {{ filePath: string, size: number, keys: string[], hasPending: boolean }}
   */
  function getSnapshot() {
    return {
      filePath,
      size: size(),
      keys: keys(),
      hasPending: _pending !== null,
    };
  }

  /**
   * JSON.stringify() support — delegates to getSnapshot() so
   * `JSON.stringify(prefsManager)` produces a useful diagnostic object
   * without leaking preference values (consistent with other module toJSON()).
   *
   * @returns {{ filePath: string, size: number, keys: string[], hasPending: boolean }}
   */
  function toJSON() {
    return getSnapshot();
  }

  /**
   * Save a preferences patch after validating it through PREF_SCHEMA.
   * Invalid or unknown keys are silently dropped (not persisted).
   * Returns the validation result so callers can log warnings if needed.
   *
   * Use this instead of save() when the input is untrusted (e.g. user-facing
   * forms, plugin config sync, or IPC from the renderer process).
   *
   * @param {object} patch - Key-value pairs to validate and merge into preferences
   * @returns {{ applied: object, dropped: Array<{ key: string, reason: string }> }}
   */
  function saveValidated(patch) {
    const { clean, dropped } = validatePrefs(patch);
    if (Object.keys(clean).length > 0) {
      save(clean);
    }
    return { applied: clean, dropped };
  }

  /**
   * Human-readable one-line summary for quick diagnostic logging.
   * Example: "PrefsManager<3 keys, no pending>"
   * Mirrors BlinkState.toString(), LatencyTracker.toString(), SpriteCache.toString(),
   * and PluginSync.toString() for consistent diagnostic output across modules.
   *
   * @returns {string}
   */
  function toString() {
    const n = size();
    const pendingStr = _pending !== null ? "pending" : "no pending";
    return `PrefsManager<${n} key${n !== 1 ? "s" : ""}, ${pendingStr}>`;
  }

  return {
    load,
    loadValidated,
    save,
    saveValidated,
    set,
    remove,
    flush,
    clear,
    has,
    get,
    getAll,
    keys,
    size,
    getSnapshot,
    toJSON,
    toString,
    filePath,
  };
}

/**
 * Known preference keys with their expected types and optional validation.
 * Used by validatePrefs() to sanitize loaded preferences — hand-edited or
 * corrupted JSON doesn't cascade into unexpected app behavior.
 *
 * Adding a new pref? Add an entry here and it's automatically validated.
 */
const PREF_SCHEMA = {
  alignment: {
    type: "string",
    default: "bottom-right",
    validate: (v) => isValidAlignment(v),
    description:
      "Window alignment position (e.g. bottom-right, top-left, center)",
  },
  sizeIndex: {
    type: "number",
    default: null,
    validate: (v) => Number.isInteger(v) && v >= 0,
    description: 'Numeric index into SIZE_PRESETS (legacy; prefer "size")',
  },
  size: {
    type: "string",
    default: "medium",
    validate: (v) => isValidSize(v),
    description:
      "Window size preset label (tiny, small, medium, large, xlarge)",
  },
  opacityIndex: {
    type: "number",
    default: null,
    validate: (v) => Number.isInteger(v) && v >= 0,
    description:
      'Numeric index into OPACITY_PRESETS (legacy; prefer "opacity")',
  },
  padding: {
    type: "number",
    default: 24,
    validate: (v) => Number.isFinite(v) && v >= 0,
    description: "Edge padding in pixels when snapped to an alignment",
  },
  opacity: {
    type: "number",
    default: 1.0,
    validate: isValidOpacity,
    description: "Window opacity (0.0 = transparent, 1.0 = opaque)",
  },
  clickThrough: {
    type: "boolean",
    default: false,
    description: "Ghost mode — clicks pass through the mascot window",
  },
  hideText: {
    type: "boolean",
    default: false,
    description: "Hide the HUD pill text overlay",
  },
  gatewayUrl: {
    type: "string",
    default: "",
    validate: (v) => v === "" || /^wss?:\/\/.+/.test(v),
    description: "Gateway WebSocket URL (ws:// or wss://)",
  },
  gatewayToken: {
    type: "string",
    default: "",
    description: "Gateway auth token (persisted for reconnect across restarts)",
  },
  draggedPosition: {
    type: "object",
    default: null,
    validate: (v) =>
      v !== null &&
      typeof v.x === "number" &&
      typeof v.y === "number" &&
      Number.isFinite(v.x) &&
      Number.isFinite(v.y),
    description: "Last user-dragged window position {x, y}",
  },
  sleepThresholdS: {
    type: "number",
    default: 120,
    validate: (v) => Number.isFinite(v) && v >= 0,
    description: "Seconds of idle before entering sleeping state",
  },
  idleDelayMs: {
    type: "number",
    default: 800,
    validate: (v) => Number.isFinite(v) && v >= 0 && Number.isInteger(v),
    description:
      "Delay in ms before transitioning to idle after activity stops",
  },
  errorHoldMs: {
    type: "number",
    default: 5000,
    validate: (v) => Number.isFinite(v) && v >= 0 && Number.isInteger(v),
    description: "Duration in ms to hold the error state before clearing",
  },
  reducedMotion: {
    type: "boolean",
    default: false,
    description:
      "Disable all animations (bobbing, blinking, overlays, pill pulse) for accessibility",
  },
  pollIntervalMs: {
    type: "number",
    default: 1000,
    validate: (v) => Number.isFinite(v) && Number.isInteger(v) && v >= 100,
    description: "Plugin state poll interval in ms (min 100)",
  },
  reconnectBaseMs: {
    type: "number",
    default: 1500,
    validate: (v) => Number.isFinite(v) && Number.isInteger(v) && v >= 0,
    description: "Base delay in ms before reconnecting after disconnect",
  },
  reconnectMaxMs: {
    type: "number",
    default: 30000,
    validate: (v) => Number.isFinite(v) && Number.isInteger(v) && v >= 0,
    description: "Maximum reconnect delay in ms (exponential backoff cap)",
  },
  staleConnectionMs: {
    type: "number",
    default: 15000,
    validate: (v) => Number.isFinite(v) && Number.isInteger(v) && v >= 0,
    description:
      "Time in ms before a silent WebSocket is considered stale and recycled",
  },
  staleCheckIntervalMs: {
    type: "number",
    default: 5000,
    validate: (v) => Number.isFinite(v) && Number.isInteger(v) && v >= 0,
    description: "Interval in ms between stale-connection health checks",
  },
};

/**
 * Validate and sanitize a preferences object.
 * Drops keys that are unknown, have the wrong type, or fail domain validation.
 * Returns a clean object safe to use without additional checks.
 *
 * Does NOT mutate the input.
 *
 * @param {object} raw - Preferences object (e.g. from load())
 * @returns {{ clean: object, dropped: Array<{ key: string, reason: string }> }} Sanitized prefs + list of dropped keys with reasons
 */
function validatePrefs(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { clean: {}, dropped: [] };
  }
  const clean = {};
  const dropped = [];
  for (const [key, value] of Object.entries(raw)) {
    const schema = PREF_SCHEMA[key];
    if (!schema) {
      dropped.push({ key, reason: "unknown key" });
      continue;
    }
    if (typeof value !== schema.type) {
      dropped.push({
        key,
        reason: `expected ${schema.type}, got ${typeof value}`,
      });
      continue;
    }
    if (schema.type === "number" && !Number.isFinite(value)) {
      dropped.push({ key, reason: `non-finite number: ${value}` });
      continue;
    }
    if (schema.validate && !schema.validate(value)) {
      dropped.push({
        key,
        reason: `failed validation: ${JSON.stringify(value)}`,
      });
      continue;
    }
    clean[key] = value;
  }
  return { clean, dropped };
}

/**
 * Canonical list of valid preference key names, derived from PREF_SCHEMA.
 * Useful for external tooling (tab-completion, docs generation, CLI --help),
 * diagnostics, and fuzzy-match validation without inspecting the schema object.
 *
 * Mirrors VALID_ALIGNMENTS, VALID_SIZES, VALID_HEALTH_STATUSES pattern.
 */
const VALID_PREF_KEYS = Object.freeze(Object.keys(PREF_SCHEMA));

/** @private O(1) lookup set for isValidPrefKey(). */
const _validPrefKeysSet = new Set(VALID_PREF_KEYS);

/**
 * Check whether a string is a recognized preference key (case-sensitive).
 * O(1) via Set lookup. Parity with isValidMode, isValidHealth,
 * isValidAlignment, isValidSize, isValidOverlay, isValidWsReadyState,
 * isValidMemoryPressureLevel, isValidStatusDotMode, etc.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isValidPrefKey(value) {
  return typeof value === "string" && _validPrefKeysSet.has(value);
}

/**
 * Format all known preference keys with their types and descriptions.
 * Useful for CLI --help-prefs output, auto-generated documentation,
 * and interactive preference editors.
 *
 * @returns {string} Multi-line formatted preference reference
 */
function formatPrefSchema() {
  const lines = [];
  for (const key of VALID_PREF_KEYS) {
    const entry = PREF_SCHEMA[key];
    const desc = entry.description || "(no description)";
    const defaultStr =
      entry.default !== null && entry.default !== undefined
        ? ` [default: ${JSON.stringify(entry.default)}]`
        : "";
    lines.push(`  ${key} (${entry.type}) — ${desc}${defaultStr}`);
  }
  return lines.join("\n");
}

/**
 * Export PREF_SCHEMA as a JSON-serializable object (strips validate functions).
 * Useful for `--help-prefs --json`, external tooling, autocomplete engines,
 * and CI config validation.
 *
 * @returns {object} Map of key → { type, description }
 */
function exportPrefSchemaJSON() {
  const result = {};
  for (const key of VALID_PREF_KEYS) {
    const entry = PREF_SCHEMA[key];
    result[key] = {
      type: entry.type,
      default: entry.default ?? null,
      description: entry.description || "",
    };
  }
  return result;
}

/**
 * Coerce a raw string value to the type expected by a PREF_SCHEMA entry.
 * Designed for CLI `--set-pref key=value` and similar string-input contexts
 * where values arrive as strings but the schema expects boolean/number/object.
 *
 * Returns `{ value }` on success, or `{ error: string }` on failure.
 *
 * @param {string} rawVal - The raw string value from the CLI or user input
 * @param {{ type: string }} schema - The PREF_SCHEMA entry for the target key
 * @returns {{ value: * } | { error: string }}
 */
function coerceFromString(rawVal, schema) {
  if (!schema || typeof schema.type !== "string") {
    return { error: "invalid schema entry" };
  }
  if (schema.type === "boolean") {
    const lower = rawVal.trim().toLowerCase();
    if (lower === "true" || lower === "1" || lower === "yes" || lower === "on")
      return { value: true };
    if (lower === "false" || lower === "0" || lower === "no" || lower === "off")
      return { value: false };
    return { error: `expects boolean (true/false), got "${rawVal}"` };
  }
  if (schema.type === "number") {
    const n = Number(rawVal);
    if (!Number.isFinite(n))
      return { error: `expects a number, got "${rawVal}"` };
    return { value: n };
  }
  if (schema.type === "string") {
    return { value: rawVal };
  }
  if (schema.type === "object") {
    try {
      return { value: JSON.parse(rawVal) };
    } catch {
      return { error: `expects JSON object, got "${rawVal}"` };
    }
  }
  // Unknown type — pass through as string
  return { value: rawVal };
}

/**
 * Diff two preference snapshots and return what changed.
 * Useful for diagnostics logging ("alignment: bottom-right → top-left"),
 * IPC change notifications, and undo/redo tracking.
 *
 * Only includes keys that actually differ (deep equality for objects).
 * Keys present in `after` but not `before` are reported as additions (prev: undefined).
 * Keys present in `before` but not `after` are reported as removals (next: undefined).
 *
 * @param {object} before - Previous preferences snapshot
 * @param {object} after - Current preferences snapshot
 * @returns {Array<{ key: string, prev: *, next: * }>} List of changed keys with before/after values
 */
function diffPrefs(before, after) {
  const b = before && typeof before === "object" ? before : {};
  const a = after && typeof after === "object" ? after : {};
  const allKeys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changes = [];
  for (const key of allKeys) {
    const prev = b[key];
    const next = a[key];
    // Deep-equal check for objects (e.g. draggedPosition {x, y})
    if (
      typeof prev === "object" &&
      typeof next === "object" &&
      prev !== null &&
      next !== null
    ) {
      if (JSON.stringify(prev) === JSON.stringify(next)) continue;
    } else if (prev === next) {
      continue;
    }
    changes.push({ key, prev, next });
  }
  return changes;
}

/**
 * Format a diffPrefs() result as a human-readable multi-line string.
 * Each line shows: "key: prev → next" (or "key: (added) next" / "key: prev (removed)").
 *
 * @param {Array<{ key: string, prev: *, next: * }>} changes - Output of diffPrefs()
 * @returns {string} Formatted diff string (empty string if no changes)
 */
function formatPrefsDiff(changes) {
  if (!changes || changes.length === 0) return "";
  return changes
    .map(({ key, prev, next }) => {
      const fmtVal = (v) => (v === undefined ? "(unset)" : JSON.stringify(v));
      return `  ${key}: ${fmtVal(prev)} → ${fmtVal(next)}`;
    })
    .join("\n");
}

module.exports = {
  createPrefsManager,
  validatePrefs,
  PREF_SCHEMA,
  VALID_PREF_KEYS,
  isValidPrefKey,
  formatPrefSchema,
  exportPrefSchemaJSON,
  coerceFromString,
  diffPrefs,
  formatPrefsDiff,
};
