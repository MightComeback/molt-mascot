// Import shared utilities at the top so they're available for URL normalization
// and protocol method probing below (single source of truth, no drift).
import { PLUGIN_STATE_METHODS, PLUGIN_RESET_METHODS, isMissingMethodResponse, normalizeWsUrl } from "../apps/molt-mascot/src/utils.js";

type GatewayCfg = {
  url: string;
  token?: string;
};

const argv = process.argv.slice(2);
const args = new Set(argv);

if (args.has("--version") || args.has("-V")) {
  const pkg = require("../apps/molt-mascot/package.json");
  console.log(`ws-dump ${pkg.version || "0.0.0"}`);
  process.exit(0);
}

if (args.has("--help") || args.has("-h")) {
  console.log(`Usage: bun tools/ws-dump.ts [options]

Connect to an OpenClaw Gateway WebSocket and print all frames as JSON.

Options:
  --once, --exit          Exit after receiving hello-ok
  --state                 Print plugin state and exit (shortcut for quick checks)
  --watch                 Continuously poll plugin state; print only on change
  --reset                 Reset plugin state and exit (clears error/tool/counters)
  --timeout-ms=<ms>       Timeout for --once/--state/--reset mode (default: 5000)
  --poll-ms=<ms>          Poll interval for --watch mode (default: 1000)
  --min-protocol=<n>      Minimum protocol version (default: 3)
  --max-protocol=<n>      Maximum protocol version (default: 3)
  --filter=<type>         Only print events matching this type/event name
                          (e.g. --filter=agent, --filter=tool). Repeatable.
  --compact               Print JSON on a single line instead of pretty-printed
  -q, --quiet             Suppress stderr diagnostics (for scripting)
  -V, --version           Show version and exit
  -h, --help              Show this help

Environment:
  GATEWAY_URL             WebSocket URL (default: ws://127.0.0.1:18789)
  GATEWAY_TOKEN           Authentication token
  OPENCLAW_GATEWAY_URL    Alias for GATEWAY_URL
  OPENCLAW_GATEWAY_TOKEN  Alias for GATEWAY_TOKEN`);
  process.exit(0);
}

const once = args.has("--once") || args.has("--exit") || args.has("--exit-after-hello");
const stateMode = args.has("--state");
const watchMode = args.has("--watch");
const resetMode = args.has("--reset");
const quiet = args.has("--quiet") || args.has("-q");

const getArg = (name: string): string | undefined => {
  const i = argv.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (i === -1) return undefined;
  const a = argv[i];
  if (a.includes("=")) return a.split("=").slice(1).join("=");
  return argv[i + 1];
};

// Compatibility: protocol version can change across Gateway builds.
// Default to v3 (current), but allow overriding for older gateways.
const minProtocol = Number(getArg("--min-protocol") ?? process.env.GATEWAY_MIN_PROTOCOL ?? 3);
const maxProtocol = Number(getArg("--max-protocol") ?? process.env.GATEWAY_MAX_PROTOCOL ?? 3);
const onceTimeoutMs = Number(getArg("--timeout-ms") ?? process.env.GATEWAY_ONCE_TIMEOUT_MS ?? 5000);

if (!Number.isFinite(minProtocol) || !Number.isFinite(maxProtocol)) {
  console.error("Invalid --min-protocol/--max-protocol (must be numbers)");
  process.exit(2);
}

if (!Number.isFinite(onceTimeoutMs) || onceTimeoutMs <= 0) {
  console.error("Invalid --timeout-ms (must be a positive number)");
  process.exit(2);
}

if (minProtocol > maxProtocol) {
  console.error("Invalid protocol range: --min-protocol cannot be greater than --max-protocol");
  process.exit(2);
}

// --filter: only print frames matching these event/type names (empty = print all)
const filters: string[] = argv
  .filter((a) => a.startsWith("--filter="))
  .map((a) => a.split("=").slice(1).join("=").toLowerCase())
  .filter(Boolean);

const compact = args.has("--compact");

/** Log to stderr unless --quiet is active. */
const info = (...a: unknown[]) => { if (!quiet) console.error(...a); };

const rawGatewayUrl = process.env.GATEWAY_URL || process.env.OPENCLAW_GATEWAY_URL || process.env.CLAWDBOT_GATEWAY_URL || "ws://127.0.0.1:18789";
// Use the shared normalizeWsUrl (handles http→ws, https→wss, bare host:port, etc.)
// instead of duplicating the logic inline, avoiding drift with the renderer/gateway-client.
const normalizedGatewayUrl = normalizeWsUrl(rawGatewayUrl);

const cfg: GatewayCfg = {
  url: normalizedGatewayUrl,
  token: process.env.GATEWAY_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN || process.env.CLAWDBOT_GATEWAY_TOKEN,
};

let reqId = 0;
const nextId = (p: string) => `${p}${++reqId}`;

// Read version from root package.json so the handshake reflects the actual build.
const APP_VERSION: string = (() => {
  try {
    const pkg = require("../apps/molt-mascot/package.json");
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

const ws = new WebSocket(cfg.url);

ws.addEventListener("open", () => {
  const id = nextId("c");
  ws.send(
    JSON.stringify({
      type: "req",
      id,
      method: "connect",
      params: {
        minProtocol,
        maxProtocol,
        client: {
          id: "cli",
          displayName: "molt-mascot ws-dump",
          version: APP_VERSION,
          platform: `${process.release?.name ?? "bun"} ${process.version}`,
          mode: "cli",
          instanceId: `moltMascot-dump-${Math.random().toString(16).slice(2)}`,
        },
        role: "operator",
        scopes: ["operator.read"],
        auth: cfg.token ? { token: cfg.token } : undefined,
      },
    }),
  );
});

ws.addEventListener("error", (ev) => {
  const detail = (ev as any)?.message || "connection failed";
  info(`ws-dump: ${detail} (${cfg.url})`);
});

let gotHello = false;
let stateReqId: string | null = null;
let resetReqId: string | null = null;

let stateMethodIndex = 0;
let resetMethodIndex = 0;
let lastWatchJson = "";
let watchInterval: ReturnType<typeof setInterval> | null = null;
const watchPollMs = Number(getArg("--poll-ms") ?? 1000);

const isMissingMethod = isMissingMethodResponse;

ws.addEventListener("message", (ev) => {
  const raw = String(ev.data);
  try {
    const msg = JSON.parse(raw);

    // Centralised hello-ok handler — runs regardless of filters so --once/--state
    // always work, but only prints the frame when it passes the filter gate.
    const isHelloOk = msg.type === "res" && msg.payload?.type === "hello-ok";
    if (isHelloOk && !gotHello) {
      gotHello = true;
      const proto = msg.payload?.protocol ?? msg.payload?.protocolVersion;
      const gwVer = msg.payload?.gateway?.version ?? msg.payload?.version;
      const parts: string[] = ["ws-dump: connected"];
      if (proto != null) parts.push(`protocol=${proto}`);
      if (gwVer) parts.push(`gateway=${gwVer}`);
      info(parts.join(" "));
      if (resetMode) {
        resetReqId = nextId("r");
        ws.send(JSON.stringify({
          type: "req", id: resetReqId,
          method: PLUGIN_RESET_METHODS[resetMethodIndex],
          params: {},
        }));
      } else if (watchMode) {
        // Start polling plugin state; print only when it changes.
        stateReqId = nextId("s");
        ws.send(JSON.stringify({
          type: "req", id: stateReqId,
          method: PLUGIN_STATE_METHODS[stateMethodIndex],
          params: {},
        }));
        watchInterval = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          stateReqId = nextId("s");
          ws.send(JSON.stringify({
            type: "req", id: stateReqId,
            method: PLUGIN_STATE_METHODS[stateMethodIndex],
            params: {},
          }));
        }, watchPollMs);
      } else if (stateMode) {
        stateReqId = nextId("s");
        ws.send(JSON.stringify({
          type: "req", id: stateReqId,
          method: PLUGIN_STATE_METHODS[stateMethodIndex],
          params: {},
        }));
      } else if (once) {
        try { ws.close(); } catch {}
      } else {
        ws.send(JSON.stringify({ type: "req", id: nextId("h"), method: "health" }));
      }
    }

    // Apply filter: match against msg.type, msg.event, or msg.payload?.phase
    if (filters.length > 0) {
      const candidates = [msg.type, msg.event, msg.payload?.phase].map((v) =>
        typeof v === "string" ? v.toLowerCase() : ""
      );
      if (!filters.some((f) => candidates.includes(f))) return;
    }

    // In --once mode, print the hello-ok payload so the user can inspect
    // gateway version, protocol, and capabilities before exiting.
    // In --state mode, skip it (the user wants plugin state, not the handshake).
    if (isHelloOk && stateMode) {
      // skip printing — user wants plugin state, not handshake
    } else {
      console.log(compact ? JSON.stringify(msg) : JSON.stringify(msg, null, 2));
    }

    // --reset mode: handle plugin reset response
    if (resetMode && msg.type === "res" && msg.id === resetReqId) {
      if (msg.ok && msg.payload?.ok && msg.payload?.state) {
        info("ws-dump: plugin state reset");
        console.log(compact ? JSON.stringify(msg.payload.state) : JSON.stringify(msg.payload.state, null, 2));
        try { ws.close(); } catch {}
        return;
      }
      if (isMissingMethod(msg) && resetMethodIndex < PLUGIN_RESET_METHODS.length - 1) {
        resetMethodIndex++;
        resetReqId = nextId("r");
        ws.send(JSON.stringify({
          type: "req", id: resetReqId,
          method: PLUGIN_RESET_METHODS[resetMethodIndex],
          params: {},
        }));
        return;
      }
      console.error("ws-dump: plugin not available (no reset method found)");
      process.exit(1);
    }

    // --watch mode: print plugin state only when it changes
    if (watchMode && msg.type === "res" && msg.id === stateReqId) {
      if (msg.ok && msg.payload?.ok && msg.payload?.state) {
        const json = JSON.stringify(msg.payload.state);
        if (json !== lastWatchJson) {
          lastWatchJson = json;
          const ts = new Date().toISOString().slice(11, 23);
          const line = compact ? json : JSON.stringify(msg.payload.state, null, 2);
          console.log(compact ? `[${ts}] ${line}` : `--- ${ts} ---\n${line}`);
        }
        return;
      }
      if (isMissingMethod(msg) && stateMethodIndex < PLUGIN_STATE_METHODS.length - 1) {
        stateMethodIndex++;
        stateReqId = nextId("s");
        ws.send(JSON.stringify({
          type: "req", id: stateReqId,
          method: PLUGIN_STATE_METHODS[stateMethodIndex],
          params: {},
        }));
        return;
      }
      console.error("ws-dump: plugin not available (no state method found)");
      process.exit(1);
    }

    // --state mode: handle plugin state response
    if (stateMode && msg.type === "res" && msg.id === stateReqId) {
      if (msg.ok && msg.payload?.ok && msg.payload?.state) {
        console.log(compact ? JSON.stringify(msg.payload.state) : JSON.stringify(msg.payload.state, null, 2));
        try { ws.close(); } catch {}
        return;
      }
      if (isMissingMethod(msg) && stateMethodIndex < PLUGIN_STATE_METHODS.length - 1) {
        stateMethodIndex++;
        stateReqId = nextId("s");
        ws.send(JSON.stringify({
          type: "req", id: stateReqId,
          method: PLUGIN_STATE_METHODS[stateMethodIndex],
          params: {},
        }));
        return;
      }
      console.error("ws-dump: plugin not available (no state method found)");
      process.exit(1);
    }
  } catch {
    console.log(raw);
  }
});

// Safety: in --once/--state mode, don't hang forever if the server never replies.
// (--watch mode runs indefinitely, so no timeout for it.)
if (once || stateMode || resetMode) {
  setTimeout(() => {
    if (!gotHello) {
      console.error(`Timed out waiting for hello-ok after ${onceTimeoutMs}ms`);
      process.exit(2);
    }
    if (stateMode) {
      console.error("Timed out waiting for plugin state response");
      process.exit(2);
    }
    if (resetMode) {
      console.error("Timed out waiting for plugin reset response");
      process.exit(2);
    }
  }, onceTimeoutMs).unref?.();
}

ws.addEventListener("close", () => {
  if (watchInterval) clearInterval(watchInterval);
  process.exit(0);
});

// Graceful shutdown on SIGINT/SIGTERM: close the WebSocket cleanly so the
// gateway sees a normal close frame instead of a TCP reset.
function gracefulShutdown() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.close(); } catch {}
  } else {
    process.exit(0);
  }
}
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
