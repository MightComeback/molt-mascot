/**
 * Shared isTruthyEnv — works in both CJS (electron-main) and ESM (utils.js re-exports it).
 * Handles strings, booleans, numbers, and null/undefined.
 */
function isTruthyEnv(v) {
  if (typeof v !== "string") {
    if (typeof v === "number") return Number.isFinite(v) && v > 0;
    if (typeof v === "boolean") return v;
    return false;
  }
  const s = v.trim().toLowerCase();
  return (
    s === "1" ||
    s === "true" ||
    s === "t" ||
    s === "yes" ||
    s === "y" ||
    s === "on"
  );
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
  if (typeof v !== "string") {
    if (typeof v === "number") return v === 0;
    if (typeof v === "boolean") return !v;
    return false;
  }
  const s = v.trim().toLowerCase();
  return (
    s === "0" ||
    s === "false" ||
    s === "f" ||
    s === "no" ||
    s === "n" ||
    s === "off"
  );
}

/**
 * Parse an environment variable as a three-state boolean.
 * Returns true if explicitly truthy, false if explicitly falsy,
 * or undefined if not set / not a recognized boolean value.
 *
 * Combines isTruthyEnv + isFalsyEnv into a single call for the common
 * three-state pattern: "env overrides saved pref when explicitly set".
 *
 * Example usage (replaces verbose inline pattern):
 *   // Before: envVal ? isTruthyEnv(envVal) : (savedPrefs.clickThrough ?? false)
 *   // After:  parseBooleanEnv(envVal) ?? savedPrefs.clickThrough ?? false
 *
 * @param {*} v - Environment variable value
 * @returns {boolean|undefined} true/false if explicitly set, undefined if absent/ambiguous
 */
function parseBooleanEnv(v) {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return undefined;
    if (v > 0) return true;
    if (v === 0) return false;
    return undefined;
  }
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  if (s === "") return undefined;
  if (
    s === "1" ||
    s === "true" ||
    s === "t" ||
    s === "yes" ||
    s === "y" ||
    s === "on"
  )
    return true;
  if (
    s === "0" ||
    s === "false" ||
    s === "f" ||
    s === "no" ||
    s === "n" ||
    s === "off"
  )
    return false;
  return undefined;
}

module.exports = { isTruthyEnv, isFalsyEnv, parseBooleanEnv };
