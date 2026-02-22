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

module.exports = { parseCliArg, hasBoolFlag, parseNumericArg };
