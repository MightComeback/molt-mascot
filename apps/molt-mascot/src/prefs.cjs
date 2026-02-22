/**
 * User preference persistence for Molt Mascot.
 * Extracted from electron-main.cjs for testability and reuse.
 *
 * Saves runtime preferences (alignment, size, ghost mode, hide-text, etc.)
 * to a JSON file so they survive app restarts without requiring env vars.
 */

const fs = require('fs');
const path = require('path');

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

  return { load, save, flush, filePath };
}

module.exports = { createPrefsManager };
