/**
 * Ordered lists of environment variable names for gateway configuration.
 * Single source of truth — consumed by preload.cjs, status-cli.cjs, and
 * electron-main.cjs to avoid the same fallback chains drifting apart.
 *
 * Order matters: earlier entries take priority (first non-empty wins).
 *
 * @module env-keys
 */

/** Env vars checked (in order) for the gateway WebSocket URL. */
const GATEWAY_URL_KEYS = Object.freeze([
  'MOLT_MASCOT_GATEWAY_URL',
  'GATEWAY_URL',
  'OPENCLAW_GATEWAY_URL',
  'CLAWDBOT_GATEWAY_URL',
  'gatewayUrl',
]);

/** Env vars checked (in order) for the gateway auth token. */
const GATEWAY_TOKEN_KEYS = Object.freeze([
  'MOLT_MASCOT_GATEWAY_TOKEN',
  'GATEWAY_TOKEN',
  'OPENCLAW_GATEWAY_TOKEN',
  'CLAWDBOT_GATEWAY_TOKEN',
  'gatewayToken',
]);

/**
 * Resolve the first non-empty value from an ordered list of env var keys.
 *
 * @param {string[]} keys - Ordered env var names (first non-empty wins)
 * @param {object} env - Environment object (e.g. process.env)
 * @param {string} [fallback=''] - Value when no key matches
 * @returns {string}
 */
function resolveEnv(keys, env, fallback) {
  if (fallback === undefined) fallback = '';
  for (const key of keys) {
    const val = env[key];
    if (val !== undefined && val !== '') return val;
  }
  return fallback;
}

/** Canonical GitHub repository URL (single source of truth for about panel, tray menu, context menu). */
const REPO_URL = 'https://github.com/MightComeback/molt-mascot';

/**
 * Like resolveEnv, but also returns the key that matched.
 * Useful for diagnostics (e.g. "gateway URL came from GATEWAY_URL, not MOLT_MASCOT_GATEWAY_URL").
 *
 * @param {string[]} keys - Ordered env var names (first non-empty wins)
 * @param {object} env - Environment object (e.g. process.env)
 * @returns {{ key: string, value: string } | null} Matched key+value, or null if none matched
 */
function resolveEnvWithSource(keys, env) {
  for (const key of keys) {
    const val = env[key];
    if (val !== undefined && val !== '') return { key, value: val };
  }
  return null;
}

/**
 * Parse a numeric value from an environment variable with validation and fallback.
 * Eliminates the repeated `const v = Number(env.X); Number.isFinite(v) && v >= 0 ? v : default`
 * pattern used ~11 times in status-cli.cjs and electron-main.cjs.
 *
 * @param {object} env - Environment object (e.g. process.env)
 * @param {string|string[]} keys - Env var name(s) to check (first non-empty wins when array)
 * @param {number} fallback - Value to return if key is absent or invalid
 * @param {{ min?: number, max?: number, integer?: boolean }} [opts]
 * @returns {number} Parsed value, or fallback if absent/invalid/out-of-range
 */
function parseEnvNumber(env, keys, fallback, opts) {
  const keyList = Array.isArray(keys) ? keys : [keys];
  const raw = resolveEnv(keyList, env, '');
  if (raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (opts?.integer && !Number.isInteger(n)) return fallback;
  if (typeof opts?.min === 'number' && n < opts.min) return fallback;
  if (typeof opts?.max === 'number' && n > opts.max) return fallback;
  return n;
}

/**
 * Parse a boolean value from environment variables with multi-key fallback.
 * Mirrors parseEnvNumber for booleans — checks keys in order, returns the first
 * non-empty truthy/falsy result, or the fallback if none match.
 *
 * Eliminates the repeated `isTruthyEnv(env.X || env.Y) || prefs.z || false`
 * pattern used ~6 times in status-cli.cjs and electron-main.cjs.
 *
 * Truthy: "true", "1", "yes", "on" (case-insensitive)
 * Falsy:  "false", "0", "no", "off" (case-insensitive)
 * Absent/empty/unrecognized: returns fallback
 *
 * @param {object} env - Environment object (e.g. process.env)
 * @param {string|string[]} keys - Env var name(s) to check (first non-empty wins when array)
 * @param {boolean} fallback - Value to return if all keys are absent or unrecognized
 * @returns {boolean}
 */
function parseEnvBoolean(env, keys, fallback) {
  const keyList = Array.isArray(keys) ? keys : [keys];
  const raw = resolveEnv(keyList, env, '');
  if (raw === '') return fallback;
  const lower = raw.trim().toLowerCase();
  if (lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on') return true;
  if (lower === 'false' || lower === '0' || lower === 'no' || lower === 'off') return false;
  return fallback;
}

module.exports = { GATEWAY_URL_KEYS, GATEWAY_TOKEN_KEYS, resolveEnv, resolveEnvWithSource, parseEnvNumber, parseEnvBoolean, REPO_URL };
