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
declare const allowedAlignments: NonNullable<PluginConfig["alignment"]>[];
declare const allowedSizes: Size[];
declare function coerceSize(v: unknown, fallback: Size): Size;
declare function coerceAlignment(v: unknown, fallback: NonNullable<PluginConfig["alignment"]>): NonNullable<PluginConfig["alignment"]>;
/**
 * Coerce a value to a valid opacity (0–1).
 * Accepts numbers and numeric strings. Returns fallback for invalid/out-of-range values.
 */
declare function coerceOpacity(v: unknown, fallback: number): number;
/**
 * Coerce a value to a valid padding (>= 0).
 * Accepts numbers and numeric strings. Returns fallback for invalid/negative values.
 */
declare function coercePadding(v: unknown, fallback: number): number;
/**
 * Clamp a number to a [min, max] range.
 * Returns min if value is below min, max if above max, otherwise value.
 * Non-finite inputs (NaN, ±Infinity) return min as a safe fallback.
 *
 * Centralizes the repeated `Math.max(min, Math.min(value, max))` pattern
 * used across opacity clamping, padding bounds, position clamping, etc.
 *
 * @param value - The number to clamp
 * @param min - Lower bound (inclusive)
 * @param max - Upper bound (inclusive)
 * @returns Clamped value
 */
declare function clamp(value: number, min: number, max: number): number;
/**
 * Compute a success-rate percentage from total calls and error count.
 * Returns null if totalCalls is 0 (avoids division by zero).
 *
 * @param totalCalls - Total number of calls
 * @param errorCount - Number of errors
 * @returns Integer percentage (0-100), or null if no calls
 */
declare function successRate(totalCalls: number, errorCount: number): number | null;
declare function truncate(str: string, limit?: number): string;
/**
 * Format a large count into a compact human-readable string.
 * e.g. 0 → "0", 999 → "999", 1000 → "1.0K", 1500 → "1.5K", 1000000 → "1.0M"
 * Uses decimal (SI) units. Values below 1000 are returned as plain integers.
 * Useful for tool call/error counts in tooltips when the mascot runs for extended periods.
 */
declare function formatCount(n: number): string;
/**
 * Format a byte count into a compact human-readable string with appropriate unit.
 * e.g. 0 → "0 B", 1023 → "1023 B", 1536 → "1.5 KB", 1048576 → "1.0 MB"
 * Uses binary units (1 KB = 1024 bytes) consistent with OS conventions.
 */
declare function formatBytes(bytes: number): string;
/**
 * Format a duration in seconds into a compact human-readable string.
 * e.g. 45 → "45s", 90 → "1m 30s", 3661 → "1h 1m", 90000 → "1d 1h"
 * Exported so the Electron renderer can reuse the same implementation (single source of truth).
 */
declare function formatDuration(seconds: number): string;
/**
 * Format the elapsed time since a past timestamp as a human-readable duration.
 * Centralizes the repeated `formatDuration(Math.max(0, Math.round((now - ts) / 1000)))` pattern
 * used across tooltip builders, debug info, and tray icon code.
 *
 * @param since - Past timestamp in milliseconds (epoch)
 * @param now - Current timestamp in milliseconds (epoch)
 * @returns Formatted duration string (e.g. "5m 30s")
 */
declare function formatElapsed(since: number, now: number): string;
/**
 * Format a past timestamp as a human-readable relative time string.
 * Consolidates the repeated `formatElapsed(ts, now) + " ago"` pattern
 * and adds a "just now" threshold for sub-second durations.
 *
 * @param since - Past timestamp in milliseconds (epoch)
 * @param now - Current timestamp in milliseconds (epoch), defaults to Date.now()
 * @returns Relative time string (e.g. "just now", "5m ago", "2h ago")
 */
declare function formatRelativeTime(since: number, now?: number): string;
/**
 * Format an epoch-ms timestamp as an ISO-8601 string.
 * Centralizes the repeated `new Date(ts).toISOString()` pattern used across
 * debug-info, tray tooltip, and diagnostics — with input validation so callers
 * don't need to guard against invalid/missing timestamps.
 *
 * @param ts - Epoch milliseconds
 * @returns ISO-8601 string, or '–' if the input is invalid
 */
declare function formatTimestamp(ts: number): string;
/**
 * Format an epoch-ms timestamp as a compact local time string.
 * Produces "HH:MM:SS" when the timestamp is today, or "Mon DD, HH:MM" otherwise.
 * Uses the system locale/timezone so debug output is immediately readable
 * without mental UTC conversion.
 *
 * Falls back to ISO-8601 if Intl is unavailable (e.g. stripped runtimes).
 *
 * @param ts - Epoch milliseconds
 * @param now - Current timestamp for "today" detection (defaults to Date.now())
 * @returns Compact local time string, or '–' if the input is invalid
 */
declare function formatTimestampLocal(ts: number, now?: number): string;
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
 * Tools that return raw content (like 'read') can contain "error:" in the text
 * without actually failing. For these tools we disable text-sniffing for errors
 * and rely on explicit failure signals (status/exitCode/success/isError).
 *
 * Exported so consumers can check membership or extend the list.
 */
declare const CONTENT_TOOLS: ReadonlySet<string>;
/**
 * Initialize the molt-mascot plugin.
 * Sets up the state machine, event listeners for tool/agent lifecycle,
 * and exposes the .state and .reset methods to the Gateway.
 */
declare function register(api: PluginApi): void;

export { CONTENT_TOOLS, ERROR_PREFIXES, ERROR_PREFIX_REGEX, type Mode, type PluginApi, type PluginConfig, type Size, type State, allowedAlignments, allowedSizes, clamp, cleanErrorString, coerceAlignment, coerceBoolean, coerceNumber, coerceOpacity, coercePadding, coerceSize, register as default, formatBytes, formatCount, formatDuration, formatElapsed, formatRelativeTime, formatTimestamp, formatTimestampLocal, id, successRate, summarizeToolResultMessage, truncate, version };
