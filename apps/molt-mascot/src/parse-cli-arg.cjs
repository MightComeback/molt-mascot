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

module.exports = { parseCliArg };
