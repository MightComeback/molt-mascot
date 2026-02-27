/**
 * Formatting & display utilities.
 *
 * Extracted from the barrel index to keep the module focused and testable.
 * All functions are pure (no side-effects, no imports beyond stdlib).
 */
/**
 * Clamp a number within an inclusive range.
 * Returns `min` for non-finite inputs.
 */
declare function clamp(value: number, min: number, max: number): number;
/**
 * Compute a success-rate percentage from total calls and error count.
 * Returns null if totalCalls is 0 (avoids division by zero).
 */
declare function successRate(totalCalls: number, errorCount: number): number | null;
/**
 * Format a percentage value as a compact string with a "%" suffix.
 * Returns "–" for null/undefined/non-finite inputs.
 */
declare function formatPercent(value: number | null | undefined): string;
/**
 * Truncate a string to a given character limit (unicode-safe).
 * Collapses whitespace and tries to break at word boundaries.
 */
declare function truncate(str: string, limit?: number): string;
/**
 * Format a large count into a compact human-readable string.
 * e.g. 0 → "0", 999 → "999", 1000 → "1.0K", 1500 → "1.5K", 1000000 → "1.0M"
 */
declare function formatCount(n: number): string;
/**
 * Format a byte count into a compact human-readable string with appropriate unit.
 * Uses binary units (1 KB = 1024 bytes).
 */
declare function formatBytes(bytes: number): string;
/**
 * Format a duration in seconds into a compact human-readable string.
 * e.g. 45 → "45s", 90 → "1m 30s", 3661 → "1h 1m", 90000 → "1d 1h"
 */
declare function formatDuration(seconds: number): string;
/**
 * Format the elapsed time since a past timestamp as a human-readable duration.
 */
declare function formatElapsed(since: number, now: number): string;
/**
 * Format a past timestamp as a human-readable relative time string.
 * e.g. "just now", "5m ago", "2h ago"
 */
declare function formatRelativeTime(since: number, now?: number): string;
/**
 * Format an epoch-ms timestamp as an ISO-8601 string.
 * Returns '–' if the input is invalid.
 */
declare function formatTimestamp(ts: number): string;
/**
 * Format an epoch-ms timestamp as a compact local time string.
 * "HH:MM:SS" for today, "Mon DD, HH:MM" otherwise.
 */
declare function formatTimestampLocal(ts: number, now?: number): string;
/**
 * Format a timestamp with both relative age and absolute time.
 */
declare function formatTimestampWithAge(ts: number, now?: number, style?: "ago" | "since"): string;
/**
 * Capitalize the first character of a string.
 */
declare function capitalize(str: string): string;
/**
 * Simple English pluralization: append "s" (or a custom suffix) when count ≠ 1.
 */
declare function pluralize(count: number, singular: string, plural?: string): string;
/**
 * Format a boolean as a human-readable toggle label.
 * Defaults to "on"/"off" — more readable than raw "true"/"false" in
 * diagnostic output, debug info, and status displays.
 *
 * @param value - Boolean to format
 * @param onLabel - Label for true (default: "on")
 * @param offLabel - Label for false (default: "off")
 * @returns Human-readable toggle string
 */
declare function formatBoolToggle(value: boolean, onLabel?: string, offLabel?: string): string;
/**
 * Format a per-second rate as a compact human-readable string.
 * Combines a value formatter with a "/s" suffix.
 *
 * @param perSecond - The rate value (events, bytes, etc. per second)
 * @param unit - Optional unit label inserted before "/s" (e.g. "B" → "1.5 KB/s")
 * @returns Formatted rate string, e.g. "1.2K/s", "3.5 MB/s", "0/s"
 */
declare function formatRate(perSecond: number, unit?: string): string;
/**
 * Parse a human-readable duration string into total seconds.
 * Inverse of {@link formatDuration}.
 *
 * Accepted formats:
 * - Combined units: "1h30m", "2m15s", "1w2d3h", "1d 12h 30m 5s"
 * - Single units: "30s", "5m", "2h", "3d", "1w"
 * - Plain number: "120" (treated as seconds)
 * - Whitespace between groups is allowed: "1h 30m" === "1h30m"
 *
 * Unit multipliers: w=week(604800s), d=day(86400s), h=hour(3600s), m=minute(60s), s=second(1s).
 *
 * Returns `null` for empty, malformed, or negative-result inputs.
 *
 * @param input - Duration string to parse
 * @returns Total seconds, or null if unparseable
 */
declare function parseDuration(input: string): number | null;

declare const id: string;
declare const version: string;
type Mode = "idle" | "thinking" | "tool" | "error";
type Size = "tiny" | "small" | "medium" | "large" | "xlarge";
type PluginConfig = {
    idleDelayMs?: number;
    errorHoldMs?: number;
    alignment?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top-center" | "bottom-center" | "center-left" | "center-right" | "center";
    clickThrough?: boolean;
    hideText?: boolean;
    reducedMotion?: boolean;
    padding?: number;
    opacity?: number;
    size?: Size;
};
type State = {
    mode: Mode;
    since: number;
    lastError?: {
        message: string;
        ts: number;
    };
    alignment?: PluginConfig["alignment"];
    clickThrough?: boolean;
    hideText?: boolean;
    reducedMotion?: boolean;
    padding?: number;
    opacity?: number;
    size?: Size;
    currentTool?: string;
    version?: string;
    /** Cumulative count of tool invocations since plugin start. */
    toolCalls?: number;
    /** Cumulative count of tool errors since plugin start. */
    toolErrors?: number;
    /** Epoch ms when the plugin was registered (for uptime calculation). */
    startedAt?: number;
    /** Cumulative count of agent sessions started since plugin start. */
    agentSessions?: number;
    /** Number of currently active agent sessions (helps diagnose stuck thinking state). */
    activeAgents?: number;
    /** Number of currently in-flight tool calls across all sessions (helps diagnose stuck tool state). */
    activeTools?: number;
    /** Epoch ms of the last manual reset (undefined if never reset). */
    lastResetAt?: number;
};
interface PluginApi {
    id?: string;
    pluginConfig?: PluginConfig;
    config?: {
        plugins?: {
            entries?: Record<string, {
                config?: any;
            }>;
        };
    };
    logger?: {
        info?: (msg: string) => void;
        warn?: (msg: string) => void;
        error?: (msg: string) => void;
    };
    registerGatewayMethod?: (method: string, handler: any) => void;
    registerService?: (service: {
        id: string;
        start?: () => void;
        stop?: () => void;
    }) => void;
    on?: (event: string, handler: (data: any) => void) => void | (() => void);
    off?: (event: string, handler: (data: any) => void) => void;
}
declare function coerceNumber(v: unknown, fallback: number): number;
declare function coerceBoolean(v: unknown, fallback: boolean): boolean;
/**
 * Canonical list of valid plugin modes.
 * Frozen array derived from the Mode type — single source of truth for runtime validation.
 * Parity with allowedAlignments, allowedSizes, etc.
 */
declare const allowedModes: readonly Mode[];
/**
 * Check whether a value is a recognized plugin mode (case-sensitive).
 * O(1) via Set lookup. Parity with isValidWsReadyState, isValidCloseCode (app),
 * and coerceSize, coerceAlignment (plugin).
 *
 * @param value - Value to check
 * @returns true if the value is a valid Mode string
 */
declare function isValidMode(value: unknown): value is Mode;
/**
 * Coerce a value to a valid Mode string.
 * Accepts strings (case-insensitive) and returns the canonical lowercase mode.
 * Returns fallback for invalid/non-string values.
 * Parity with coerceSize, coerceAlignment, coerceOpacity, coercePadding.
 *
 * @param v - Value to coerce
 * @param fallback - Default mode if coercion fails
 * @returns Valid Mode string
 */
declare function coerceMode(v: unknown, fallback: Mode): Mode;
declare const allowedAlignments: readonly NonNullable<PluginConfig["alignment"]>[];
/**
 * Check whether a value is a recognized alignment string (case-sensitive).
 * O(1) via Set lookup. Parity with isValidMode, isValidSize, etc.
 *
 * @param value - Value to check
 * @returns true if the value is a valid alignment string
 */
declare function isValidAlignment(value: unknown): value is NonNullable<PluginConfig["alignment"]>;
declare const allowedSizes: readonly Size[];
/**
 * Check whether a value is a recognized size string (case-sensitive).
 * O(1) via Set lookup. Parity with isValidMode, isValidAlignment, etc.
 *
 * @param value - Value to check
 * @returns true if the value is a valid Size string
 */
declare function isValidSize(value: unknown): value is Size;
declare function coerceSize(v: unknown, fallback: Size): Size;
declare function coerceAlignment(v: unknown, fallback: NonNullable<PluginConfig["alignment"]>): NonNullable<PluginConfig["alignment"]>;
/**
 * Coerce a value to a valid opacity (0–1).
 * Accepts numbers and numeric strings. Returns fallback for invalid/out-of-range values.
 */
declare function coerceOpacity(v: unknown, fallback: number): number;
/**
 * Check whether a value is a valid opacity (finite number in [0, 1]).
 * Parity with isValidMode, isValidAlignment, isValidSize for
 * consistent PluginConfig field validation.
 *
 * @param value - Value to check
 * @returns true if the value is a finite number between 0 and 1 inclusive
 */
declare function isValidOpacity(value: unknown): value is number;
/**
 * Coerce a value to a valid padding (>= 0).
 * Accepts numbers and numeric strings. Returns fallback for invalid/negative values.
 */
declare function coercePadding(v: unknown, fallback: number): number;
/**
 * Check whether a value is a valid padding (finite non-negative number).
 * Parity with isValidOpacity, isValidMode, isValidAlignment, isValidSize
 * for consistent PluginConfig field validation.
 *
 * @param value - Value to check
 * @returns true if the value is a finite non-negative number
 */
declare function isValidPadding(value: unknown): value is number;
/**
 * Mask sensitive query parameters and userinfo credentials in a URL string for safe display.
 * Replaces values of known sensitive params (token, key, secret, etc.)
 * with "***" while preserving the URL structure for debugging.
 * Also masks userinfo credentials (e.g. `ws://user:pass@host` → `ws://***:***@host`).
 *
 * Non-URL strings and URLs without sensitive parts are returned as-is.
 * Malformed URLs are returned unchanged (best-effort, no throws).
 *
 * @example
 * maskSensitiveUrl("ws://host?token=abc123&mode=v2")
 * // → "ws://host?token=***&mode=v2"
 *
 * maskSensitiveUrl("ws://admin:s3cret@host/path")
 * // → "ws://***:***@host/path"
 *
 * @param url - The URL string to mask
 * @returns URL with sensitive parameter values and userinfo replaced by "***"
 */
declare function maskSensitiveUrl(url: string): string;
/**
 * Common error prefixes to strip for cleaner display.
 * Organized by category for maintainability.
 * Exported so the Electron renderer can reuse the same list (single source of truth).
 */
declare const ERROR_PREFIXES: string[];
/** Build the error prefix regex once for performance. */
declare const ERROR_PREFIX_REGEX: RegExp;
/**
 * Remove common error prefixes to save space on the pixel display.
 * e.g. "Error: Tool failed: File not found" -> "File not found"
 */
declare function cleanErrorString(s: string): string;
/**
 * Extract a short, human-readable summary from a tool result.
 * Strategies:
 * 1. Simple strings are used directly.
 * 2. Block content (Anthropic style) is joined.
 * 3. Error fields are prioritized (stderr, error object).
 *
 * @param msg - The raw result object or string from the tool.
 * @returns A truncated string suitable for the pixel display (max 140 chars).
 */
declare function summarizeToolResultMessage(msg: any): string;
/**
 * Strip common tool-name prefixes added by LLM function-calling wrappers.
 * e.g. "default_api:exec" → "exec", "functions.read" → "read",
 * "multi_tool_use.parallel" → "parallel".
 *
 * Centralizes the repeated 3-replace chain used in onToolStart, recalcCurrentTool,
 * and onToolEnd to avoid drift and make the stripping logic testable.
 */
declare function sanitizeToolName(raw: string): string;
/**
 * Tools that return raw content (like 'read') can contain "error:" in the text
 * without actually failing. For these tools we disable text-sniffing for errors
 * and rely on explicit failure signals (status/exitCode/success/isError).
 *
 * Exported so consumers can check membership or extend the list.
 */
declare const CONTENT_TOOLS: ReadonlySet<string>;
/**
 * Check whether a tool name is a recognized content tool (raw-output tools
 * where text-sniffing for errors should be suppressed).
 * O(1) via Set lookup. Parity with isValidMode, isValidHealth,
 * isValidWsReadyState, isValidMemoryPressureLevel, etc.
 *
 * Also accepts sanitized names (after prefix stripping) since the register()
 * function calls sanitizeToolName() before checking membership.
 *
 * @param value - Value to check
 * @returns true if the value is a recognized content tool name
 */
declare function isContentTool(value: unknown): value is string;
/**
 * Initialize the molt-mascot plugin.
 * Sets up the state machine, event listeners for tool/agent lifecycle,
 * and exposes the .state and .reset methods to the Gateway.
 */
declare function register(api: PluginApi): void;

export { CONTENT_TOOLS, ERROR_PREFIXES, ERROR_PREFIX_REGEX, type Mode, type PluginApi, type PluginConfig, type Size, type State, allowedAlignments, allowedModes, allowedSizes, capitalize, clamp, cleanErrorString, coerceAlignment, coerceBoolean, coerceMode, coerceNumber, coerceOpacity, coercePadding, coerceSize, register as default, formatBoolToggle, formatBytes, formatCount, formatDuration, formatElapsed, formatPercent, formatRate, formatRelativeTime, formatTimestamp, formatTimestampLocal, formatTimestampWithAge, id, isContentTool, isValidAlignment, isValidMode, isValidOpacity, isValidPadding, isValidSize, maskSensitiveUrl, parseDuration, pluralize, sanitizeToolName, successRate, summarizeToolResultMessage, truncate, version };
