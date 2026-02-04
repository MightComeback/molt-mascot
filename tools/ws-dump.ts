type GatewayCfg = {
  url: string;
  token?: string;
};

const argv = process.argv.slice(2);
const args = new Set(argv);
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

if (!Number.isFinite(minProtocol) || !Number.isFinite(maxProtocol)) {
  console.error("Invalid --min-protocol/--max-protocol (must be numbers)");
  process.exit(2);
}


const cfg: GatewayCfg = {
  url: process.env.GATEWAY_URL || process.env.CLAWDBOT_GATEWAY_URL || "ws://127.0.0.1:18789",
  token: process.env.GATEWAY_TOKEN || process.env.CLAWDBOT_GATEWAY_TOKEN,
};

let reqId = 0;
const nextId = (p: string) => `${p}${++reqId}`;

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
          version: "0.0.1",
          platform: `node ${process.version}`,
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

let gotHello = false;

ws.addEventListener("message", (ev) => {
  const raw = String(ev.data);
  try {
    const msg = JSON.parse(raw);
    console.log(JSON.stringify(msg, null, 2));

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
      console.error("Timed out waiting for hello-ok");
      process.exit(2);
    }
  }, 5000).unref?.();
}

ws.addEventListener("close", () => {
  process.exit(0);
});
