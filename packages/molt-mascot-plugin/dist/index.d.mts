declare const id: string;
declare const version: string;
type Mode = "idle" | "thinking" | "tool" | "error";
type Size = "small" | "medium" | "large" | "xlarge";
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

export { CONTENT_TOOLS, ERROR_PREFIXES, ERROR_PREFIX_REGEX, type Mode, type PluginApi, type PluginConfig, type Size, type State, allowedAlignments, allowedSizes, cleanErrorString, coerceAlignment, coerceBoolean, coerceNumber, coerceSize, register as default, formatBytes, formatDuration, id, successRate, summarizeToolResultMessage, truncate, version };
