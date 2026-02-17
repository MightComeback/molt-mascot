type GatewayCfg = {
  url: string;
  token?: string;
};

const argv = process.argv.slice(2);
const args = new Set(argv);

if (args.has("--help") || args.has("-h")) {
  console.log(`Usage: bun tools/ws-dump.ts [options]

Connect to an OpenClaw Gateway WebSocket and print all frames as JSON.

Options:
  --once, --exit          Exit after receiving hello-ok
  --timeout-ms=<ms>       Timeout for --once mode (default: 5000)
  --min-protocol=<n>      Minimum protocol version (default: 3)
  --max-protocol=<n>      Maximum protocol version (default: 3)
  --filter=<type>         Only print events matching this type/event name
                          (e.g. --filter=agent, --filter=tool). Repeatable.
  --compact               Print JSON on a single line instead of pretty-printed
  -h, --help              Show this help

Environment:
  GATEWAY_URL             WebSocket URL (default: ws://127.0.0.1:18789)
  GATEWAY_TOKEN           Authentication token
  OPENCLAW_GATEWAY_URL    Alias for GATEWAY_URL
  OPENCLAW_GATEWAY_TOKEN  Alias for GATEWAY_TOKEN`);
  process.exit(0);
}

const once = args.has("--once") || args.has("--exit") || args.has("--exit-after-hello");

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

const rawGatewayUrl = process.env.GATEWAY_URL || process.env.OPENCLAW_GATEWAY_URL || process.env.CLAWDBOT_GATEWAY_URL || "ws://127.0.0.1:18789";
const normalizedGatewayUrl = rawGatewayUrl.startsWith("http://")
  ? rawGatewayUrl.replace("http://", "ws://")
  : rawGatewayUrl.startsWith("https://")
    ? rawGatewayUrl.replace("https://", "wss://")
    : rawGatewayUrl;

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
  console.error(`ws-dump: ${detail} (${cfg.url})`);
});

let gotHello = false;

ws.addEventListener("message", (ev) => {
  const raw = String(ev.data);
  try {
    const msg = JSON.parse(raw);

    // Apply filter: match against msg.type, msg.event, or msg.payload?.phase
    if (filters.length > 0) {
      const candidates = [msg.type, msg.event, msg.payload?.phase].map((v) =>
        typeof v === "string" ? v.toLowerCase() : ""
      );
      if (!filters.some((f) => candidates.includes(f))) {
        // Still check for hello-ok even when filtering (needed for --once)
        if (msg.type === "res" && msg.payload?.type === "hello-ok") {
          gotHello = true;
          if (once) {
            try { ws.close(); } catch {}
            return;
          }
          ws.send(JSON.stringify({ type: "req", id: nextId("h"), method: "health" }));
        }
        return;
      }
    }

    console.log(compact ? JSON.stringify(msg) : JSON.stringify(msg, null, 2));

    if (msg.type === "res" && msg.payload?.type === "hello-ok") {
      gotHello = true;
      if (once) {
        try { ws.close(); } catch {}
        return;
      }
      ws.send(JSON.stringify({ type: "req", id: nextId("h"), method: "health" }));
    }
  } catch {
    console.log(raw);
  }
});

// Safety: in --once mode, don’t hang forever if the server never replies.
if (once) {
  setTimeout(() => {
    if (!gotHello) {
      console.error(`Timed out waiting for hello-ok after ${onceTimeoutMs}ms`);
      process.exit(2);
    }
  }, onceTimeoutMs).unref?.();
}

ws.addEventListener("close", () => {
  process.exit(0);
});
