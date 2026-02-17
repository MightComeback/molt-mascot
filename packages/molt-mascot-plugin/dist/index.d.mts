declare const id: string;
declare const version: string;
type Mode = "idle" | "thinking" | "tool" | "error";
type PluginConfig = {
    idleDelayMs?: number;
    errorHoldMs?: number;
    alignment?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top-center" | "bottom-center" | "center-left" | "center-right" | "center";
    clickThrough?: boolean;
    hideText?: boolean;
    padding?: number;
    opacity?: number;
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
    currentTool?: string;
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
declare function truncate(str: string, limit?: number): string;
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
 * Initialize the molt-mascot plugin.
 * Sets up the state machine, event listeners for tool/agent lifecycle,
 * and exposes the .state and .reset methods to the Gateway.
 */
declare function register(api: PluginApi): void;

export { ERROR_PREFIXES, ERROR_PREFIX_REGEX, type Mode, type PluginApi, type PluginConfig, type State, cleanErrorString, coerceBoolean, coerceNumber, register as default, id, summarizeToolResultMessage, truncate, version };
