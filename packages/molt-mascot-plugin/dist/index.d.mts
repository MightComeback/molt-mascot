declare const id = "@molt/mascot-plugin";
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
declare function coerceNumber(v: unknown, fallback: number): number;
declare function truncate(str: string, limit?: number): string;
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
declare function register(api: any): void;

export { type Mode, type PluginConfig, type State, cleanErrorString, coerceNumber, register as default, id, summarizeToolResultMessage, truncate, version };
