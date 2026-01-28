type GatewayCfg = {
  url: string;
  token?: string;
};

const cfg: GatewayCfg = {
  url: process.env.GATEWAY_URL || "ws://127.0.0.1:18789",
  token: process.env.GATEWAY_TOKEN,
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
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: "cli",
          displayName: "MIG-15 ws-dump",
          version: "0.0.1",
          platform: `node ${process.version}`,
          mode: "cli",
          instanceId: `mig15-dump-${Math.random().toString(16).slice(2)}`,
        },
        auth: cfg.token ? { token: cfg.token } : undefined,
      },
    }),
  );
});

ws.addEventListener("message", (ev) => {
  const raw = String(ev.data);
  try {
    const msg = JSON.parse(raw);
    console.log(JSON.stringify(msg, null, 2));

    if (msg.type === "res" && msg.payload?.type === "hello-ok") {
      ws.send(JSON.stringify({ type: "req", id: nextId("h"), method: "health" }));
    }
  } catch {
    console.log(raw);
  }
});

ws.addEventListener("close", () => {
  process.exit(0);
});
