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

module.exports = { GATEWAY_URL_KEYS, GATEWAY_TOKEN_KEYS, resolveEnv, REPO_URL };
