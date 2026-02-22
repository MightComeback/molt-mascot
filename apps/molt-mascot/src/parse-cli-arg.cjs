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

module.exports = { parseCliArg, hasBoolFlag };
