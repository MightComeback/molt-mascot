/**
 * Parse a CLI flag value from an argv array.
 * Supports both `--flag=value` and `--flag value` syntax.
 *
 * Extracted from electron-main.cjs for testability.
 *
 * @param {string} flag - The flag to search for (e.g. '--gateway')
 * @param {string[]} [argv] - Argument array (defaults to process.argv)
 * @returns {string|null} The flag value, or null if not found
 */
function parseCliArg(flag, argv) {
  const args = argv || process.argv;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    // Support --flag=value syntax (standard CLI convention)
    if (arg.startsWith(flag + '=')) return arg.slice(flag.length + 1);
    // Support --flag value syntax (positional)
    if (arg === flag && i + 1 < args.length) return args[i + 1];
  }
  return null;
}

/**
 * Check whether a boolean flag is present in an argv array.
 * Matches exact flag names (e.g. '--debug', '--no-tray').
 *
 * Extracted from the repeated `process.argv.includes('--flag')` pattern
 * in electron-main.cjs for testability and consistency.
 *
 * @param {string} flag - The flag to search for (e.g. '--debug')
 * @param {string[]} [argv] - Argument array (defaults to process.argv)
 * @returns {boolean} Whether the flag is present
 */
function hasBoolFlag(flag, argv) {
  const args = argv || process.argv;
  return args.includes(flag);
}

/**
 * Parse a numeric CLI flag value with validation and fallback.
 * Combines parseCliArg + Number coercion + finite/range checks into a single call,
 * eliminating the repeated `const v = Number(parseCliArg(...)); Number.isFinite(v) ? v : default`
 * pattern used for --sleep-threshold, --idle-delay, --error-hold, --ping-count, etc.
 *
 * @param {string} flag - The flag to search for (e.g. '--ping-count')
 * @param {number} fallback - Value to return if flag is absent or invalid
 * @param {{ argv?: string[], min?: number, max?: number, integer?: boolean }} [opts]
 * @returns {number} Parsed numeric value, or fallback if absent/invalid/out-of-range
 */
function parseNumericArg(flag, fallback, opts) {
  const raw = parseCliArg(flag, opts?.argv);
  if (raw === null || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (opts?.integer && !Number.isInteger(n)) return fallback;
  if (typeof opts?.min === 'number' && n < opts.min) return fallback;
  if (typeof opts?.max === 'number' && n > opts.max) return fallback;
  return n;
}

/**
 * Parse a string CLI flag value with optional validation and fallback.
 * Combines parseCliArg + trimming + allowed-values check into a single call,
 * eliminating the repeated `const v = parseCliArg(...); isValid(v) ? v : default`
 * pattern used for --alignment, --size, etc.
 *
 * @param {string} flag - The flag to search for (e.g. '--alignment')
 * @param {string} fallback - Value to return if flag is absent or invalid
 * @param {{ argv?: string[], allowed?: string[]|Set<string>, caseSensitive?: boolean, minLength?: number, maxLength?: number }} [opts]
 *   - allowed: whitelist of valid values (Array or Set); if provided, value must be a member
 *   - caseSensitive: whether allowed-values comparison is case-sensitive (default false)
 *   - minLength: minimum string length after trimming (default 1, i.e. non-empty)
 *   - maxLength: maximum string length after trimming
 * @returns {string} Parsed string value, or fallback if absent/invalid
 */
function parseStringArg(flag, fallback, opts) {
  const raw = parseCliArg(flag, opts?.argv);
  if (raw === null) return fallback;
  const trimmed = raw.trim();
  const minLen = typeof opts?.minLength === 'number' ? opts.minLength : 1;
  if (trimmed.length < minLen) return fallback;
  if (typeof opts?.maxLength === 'number' && trimmed.length > opts.maxLength) return fallback;
  if (opts?.allowed) {
    const caseSensitive = opts.caseSensitive === true;
    const needle = caseSensitive ? trimmed : trimmed.toLowerCase();
    if (opts.allowed instanceof Set) {
      // For Sets, we need to iterate if case-insensitive
      if (caseSensitive) {
        if (!opts.allowed.has(needle)) return fallback;
      } else {
        let found = false;
        for (const v of opts.allowed) {
          if ((typeof v === 'string' ? v.toLowerCase() : v) === needle) { found = true; break; }
        }
        if (!found) return fallback;
      }
    } else if (Array.isArray(opts.allowed)) {
      const match = caseSensitive
        ? opts.allowed.includes(needle)
        : opts.allowed.some(v => typeof v === 'string' && v.toLowerCase() === needle);
      if (!match) return fallback;
    }
  }
  return trimmed;
}

module.exports = { parseCliArg, hasBoolFlag, parseNumericArg, parseStringArg };
