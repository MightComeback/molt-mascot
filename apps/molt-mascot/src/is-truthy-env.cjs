/**
 * Shared isTruthyEnv — works in both CJS (electron-main) and ESM (utils.js re-exports it).
 * Handles strings, booleans, numbers, and null/undefined.
 */
function isTruthyEnv(v) {
  if (typeof v !== 'string') {
    if (typeof v === 'number') return Number.isFinite(v) && v > 0;
    if (typeof v === 'boolean') return v;
    return false;
  }
  const s = v.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 't' || s === 'yes' || s === 'y' || s === 'on';
}

/**
 * Check whether a value is an explicitly falsy env var.
 * Distinguishes "explicitly disabled" (0, false, no, off) from "not set" (undefined, '').
 * Useful when a feature needs three states: enabled / disabled / default.
 *
 * @param {*} v - Environment variable value
 * @returns {boolean} true if the value is explicitly falsy
 */
function isFalsyEnv(v) {
  if (typeof v !== 'string') {
    if (typeof v === 'number') return v === 0;
    if (typeof v === 'boolean') return !v;
    return false;
  }
  const s = v.trim().toLowerCase();
  return s === '0' || s === 'false' || s === 'f' || s === 'no' || s === 'n' || s === 'off';
}

module.exports = { isTruthyEnv, isFalsyEnv };
