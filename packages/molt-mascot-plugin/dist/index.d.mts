declare const id = "@molt/mascot-plugin";
type Mode = "idle" | "thinking" | "tool" | "error";
type PluginConfig = {
    idleDelayMs?: number;
    errorHoldMs?: number;
};
type State = {
    mode: Mode;
    since: number;
    lastError?: {
        message: string;
        ts: number;
    };
};
/**
 * Initialize the molt-mascot plugin.
 * Sets up the state machine, event listeners for tool/agent lifecycle,
 * and exposes the .state and .reset methods to the Gateway.
 */
declare function register(api: any): void;

export { type Mode, type PluginConfig, type State, register as default, id };
