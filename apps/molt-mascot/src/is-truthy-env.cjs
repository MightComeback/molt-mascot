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

module.exports = { isTruthyEnv };
