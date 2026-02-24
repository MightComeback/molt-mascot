/**
 * User preference persistence for Molt Mascot.
 * Extracted from electron-main.cjs for testability and reuse.
 *
 * Saves runtime preferences (alignment, size, ghost mode, hide-text, etc.)
 * to a JSON file so they survive app restarts without requiring env vars.
 */

const fs = require('fs');
const path = require('path');
const { isValidAlignment } = require('./get-position.cjs');
const { isValidSize } = require('./size-presets.cjs');

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
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return {};
    }
  }

  /**
   * Immediately flush any pending preferences to disk.
   * Called internally by the debounce timer and exposed for shutdown cleanup.
   */
  function flush() {
    if (_timer) { clearTimeout(_timer); _timer = null; }
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
        try { fs.unlinkSync(tmp); } catch {}
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
    if (_timer) { clearTimeout(_timer); _timer = null; }
    _pending = null;
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') return false;
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
    const pendingStr = _pending !== null ? 'pending' : 'no pending';
    return `PrefsManager<${n} key${n !== 1 ? 's' : ''}, ${pendingStr}>`;
  }

  return { load, loadValidated, save, saveValidated, set, remove, flush, clear, has, get, getAll, keys, size, getSnapshot, toJSON, toString, filePath };
}

/**
 * Known preference keys with their expected types and optional validation.
 * Used by validatePrefs() to sanitize loaded preferences — hand-edited or
 * corrupted JSON doesn't cascade into unexpected app behavior.
 *
 * Adding a new pref? Add an entry here and it's automatically validated.
 */
const PREF_SCHEMA = {
  alignment:    { type: 'string', validate: (v) => isValidAlignment(v) },
  sizeIndex:    { type: 'number', validate: (v) => Number.isInteger(v) && v >= 0 },
  size:         { type: 'string', validate: (v) => isValidSize(v) },
  opacityIndex: { type: 'number', validate: (v) => Number.isInteger(v) && v >= 0 },
  padding:      { type: 'number', validate: (v) => Number.isFinite(v) && v >= 0 },
  opacity:      { type: 'number', validate: (v) => Number.isFinite(v) && v >= 0 && v <= 1 },
  clickThrough: { type: 'boolean' },
  hideText:     { type: 'boolean' },
  gatewayUrl:   { type: 'string', validate: (v) => v === '' || /^wss?:\/\/.+/.test(v) },
  draggedPosition: { type: 'object', validate: (v) => v !== null && typeof v.x === 'number' && typeof v.y === 'number' && Number.isFinite(v.x) && Number.isFinite(v.y) },
  sleepThresholdS: { type: 'number', validate: (v) => Number.isFinite(v) && v >= 0 },
  idleDelayMs:     { type: 'number', validate: (v) => Number.isFinite(v) && v >= 0 && Number.isInteger(v) },
  errorHoldMs:     { type: 'number', validate: (v) => Number.isFinite(v) && v >= 0 && Number.isInteger(v) },
  reducedMotion:   { type: 'boolean' },
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
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { clean: {}, dropped: [] };
  }
  const clean = {};
  const dropped = [];
  for (const [key, value] of Object.entries(raw)) {
    const schema = PREF_SCHEMA[key];
    if (!schema) {
      dropped.push({ key, reason: 'unknown key' });
      continue;
    }
    if (typeof value !== schema.type) {
      dropped.push({ key, reason: `expected ${schema.type}, got ${typeof value}` });
      continue;
    }
    if (schema.type === 'number' && !Number.isFinite(value)) {
      dropped.push({ key, reason: `non-finite number: ${value}` });
      continue;
    }
    if (schema.validate && !schema.validate(value)) {
      dropped.push({ key, reason: `failed validation: ${JSON.stringify(value)}` });
      continue;
    }
    clean[key] = value;
  }
  return { clean, dropped };
}

module.exports = { createPrefsManager, validatePrefs, PREF_SCHEMA };
