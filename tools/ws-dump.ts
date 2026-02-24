// Import shared utilities at the top so they're available for URL normalization
// and protocol method probing below (single source of truth, no drift).
import { PLUGIN_STATE_METHODS, PLUGIN_RESET_METHODS, isMissingMethodResponse, normalizeWsUrl, computeHealthStatus, computeHealthReasons, formatLatency, formatDuration, MODE_EMOJI, connectionQuality, connectionQualityEmoji, formatActiveSummary } from "../apps/molt-mascot/src/utils.js";

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
  --ping                  Measure plugin state round-trip latency and exit
  --ping-count=<n>        Number of pings to send (default: 5)
  --health                Quick health check: connect, probe plugin, print status and exit
                          Exit code: 0=healthy, 1=degraded/unhealthy, 2=connection failed
  --count=<n>             Exit after printing N state changes (--watch mode)
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
const pingMode = args.has("--ping");
const healthMode = args.has("--health");
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

/**
 * Format a plugin state object as a human-readable one-liner for --watch --compact.
 * Example: "🤔 thinking · tool=web_search · 42ms 🟢 · 3 calls · ↑ 5m 12s"
 */
function formatWatchSummary(state: Record<string, any>): string {
  const parts: string[] = [];
  const mode = state.mode || "unknown";
  const emoji = (MODE_EMOJI as Record<string, string>)[mode] || "";
  parts.push(`${emoji} ${mode}`.trim());

  if (mode === "tool" && state.currentTool) parts.push(`tool=${state.currentTool}`);
  if (mode === "error" && state.lastError?.message) parts.push(state.lastError.message.slice(0, 40));

  if (typeof state.latencyMs === "number" && state.latencyMs >= 0) {
    const q = connectionQuality(state.latencyMs);
    parts.push(`${formatLatency(state.latencyMs)} ${connectionQualityEmoji(q)}`.trim());
  }

  if (state.activeAgents > 0 || state.activeTools > 0) {
    parts.push(formatActiveSummary(state.activeAgents || 0, state.activeTools || 0));
  }

  if (state.toolCalls > 0) {
    let s = `${state.toolCalls} call${state.toolCalls > 1 ? "s" : ""}`;
    if (state.toolErrors > 0) s += ` (${state.toolErrors} err)`;
    parts.push(s);
  }

  if (state.startedAt > 0) {
    const uptimeSec = Math.round((Date.now() - state.startedAt) / 1000);
    if (uptimeSec > 0) parts.push(`↑ ${formatDuration(uptimeSec)}`);
  }

  // Surface health status when degraded or unhealthy (matches pill-label and tray-tooltip behavior).
  if (typeof state.latencyMs === "number") {
    const health = computeHealthStatus({ isConnected: true, latencyMs: state.latencyMs });
    if (health === "degraded") parts.push("⚠️ degraded");
    else if (health === "unhealthy") parts.push("🔴 unhealthy");
  }

  return parts.join(" · ");
}


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
let watchChangeCount = 0;
const watchMaxChanges = Number(getArg("--count") || 0); // 0 = unlimited
let watchInterval: ReturnType<typeof setInterval> | null = null;
const watchPollMs = Number(getArg("--poll-ms") ?? 1000);
/** Track the last watch poll send time so we can measure round-trip latency. */
let watchPollSentAt = 0;
const pingCount = Math.max(1, Number(getArg("--ping-count") ?? 5));
let pingsSent = 0;
let pingResults: number[] = [];
let pingSentAt = 0;

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
      if (healthMode) {
        // Probe plugin state for health assessment
        stateReqId = nextId("h");
        pingSentAt = performance.now();
        ws.send(JSON.stringify({
          type: "req", id: stateReqId,
          method: PLUGIN_STATE_METHODS[stateMethodIndex],
          params: {},
        }));
      } else if (pingMode) {
        // Send first ping
        stateReqId = nextId("ping");
        pingSentAt = performance.now();
        pingsSent = 1;
        ws.send(JSON.stringify({
          type: "req", id: stateReqId,
          method: PLUGIN_STATE_METHODS[stateMethodIndex],
          params: {},
        }));
      } else if (resetMode) {
        resetReqId = nextId("r");
        ws.send(JSON.stringify({
          type: "req", id: resetReqId,
          method: PLUGIN_RESET_METHODS[resetMethodIndex],
          params: {},
        }));
      } else if (watchMode) {
        // Start polling plugin state; print only when it changes.
        stateReqId = nextId("s");
        watchPollSentAt = performance.now();
        ws.send(JSON.stringify({
          type: "req", id: stateReqId,
          method: PLUGIN_STATE_METHODS[stateMethodIndex],
          params: {},
        }));
        watchInterval = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          stateReqId = nextId("s");
          watchPollSentAt = performance.now();
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

    // --health mode: quick health check
    if (healthMode && msg.type === "res" && msg.id === stateReqId) {
      if (msg.ok && msg.payload?.ok && msg.payload?.state) {
        const rtt = Math.round((performance.now() - pingSentAt) * 100) / 100;
        const state = msg.payload.state;
        const status = computeHealthStatus({ isConnected: true, latencyMs: rtt });
        const reasons = computeHealthReasons({ isConnected: true, latencyMs: rtt });
        const uptimeMs = typeof state.startedAt === 'number' && state.startedAt > 0
          ? Date.now() - state.startedAt
          : null;
        const result = {
          status,
          latencyMs: rtt,
          mode: state.mode,
          plugin: true,
          version: state.version || null,
          ...(uptimeMs !== null ? { pluginUptimeMs: uptimeMs } : {}),
          toolCalls: state.toolCalls ?? 0,
          toolErrors: state.toolErrors ?? 0,
          activeAgents: state.activeAgents ?? 0,
          activeTools: state.activeTools ?? 0,
          ...(state.lastError ? { lastError: state.lastError.message } : {}),
          ...(reasons.length > 0 ? { reasons } : {}),
        };
        console.log(compact ? JSON.stringify(result) : JSON.stringify(result, null, 2));
        try { ws.close(); } catch {}
        process.exitCode = status === "healthy" ? 0 : 1;
        return;
      }
      if (isMissingMethod(msg) && stateMethodIndex < PLUGIN_STATE_METHODS.length - 1) {
        stateMethodIndex++;
        stateReqId = nextId("h");
        pingSentAt = performance.now();
        ws.send(JSON.stringify({
          type: "req", id: stateReqId,
          method: PLUGIN_STATE_METHODS[stateMethodIndex],
          params: {},
        }));
        return;
      }
      // No plugin — still report health based on connection alone.
      // Use the probe RTT so high-latency connections still surface as degraded.
      const rtt = Math.round((performance.now() - pingSentAt) * 100) / 100;
      const status = computeHealthStatus({ isConnected: true, latencyMs: rtt });
      const reasons = computeHealthReasons({ isConnected: true, latencyMs: rtt });
      const result = {
        status,
        latencyMs: rtt,
        plugin: false,
        ...(reasons.length > 0 ? { reasons } : {}),
      };
      console.log(compact ? JSON.stringify(result) : JSON.stringify(result, null, 2));
      try { ws.close(); } catch {}
      process.exitCode = status === "healthy" ? 0 : 1;
      return;
    }

    // --ping mode: measure round-trip latency
    if (pingMode && msg.type === "res" && msg.id === stateReqId) {
      if (msg.ok && msg.payload?.ok && msg.payload?.state) {
        const rtt = Math.round((performance.now() - pingSentAt) * 100) / 100;
        pingResults.push(rtt);
        info(`ping ${pingsSent}/${pingCount}: ${rtt}ms`);

        if (pingsSent < pingCount) {
          // Send next ping after a short delay to avoid burst
          setTimeout(() => {
            stateReqId = nextId("ping");
            pingSentAt = performance.now();
            pingsSent++;
            ws.send(JSON.stringify({
              type: "req", id: stateReqId,
              method: PLUGIN_STATE_METHODS[stateMethodIndex],
              params: {},
            }));
          }, 200);
          return;
        }

        // All pings done — print summary
        const sorted = pingResults.slice().sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const avg = Math.round((sorted.reduce((s, v) => s + v, 0) / sorted.length) * 100) / 100;
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0
          ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100
          : sorted[mid];
        // Jitter: mean absolute deviation from the average — same definition as
        // the latency-tracker module uses, giving a consistent metric across
        // the desktop app's rolling stats and the CLI's one-shot ping summary.
        const jitter = sorted.length > 1
          ? Math.round((sorted.reduce((s, v) => s + Math.abs(v - avg), 0) / sorted.length) * 100) / 100
          : 0;

        console.log(compact
          ? JSON.stringify({ count: pingCount, min, max, avg, median, jitter })
          : `\n--- ping statistics ---\n${pingCount} pings: min=${min}ms avg=${avg}ms median=${median}ms max=${max}ms jitter=${jitter}ms`
        );
        try { ws.close(); } catch {}
        return;
      }
      // Method fallback (same as --state mode)
      if (isMissingMethod(msg) && stateMethodIndex < PLUGIN_STATE_METHODS.length - 1) {
        stateMethodIndex++;
        stateReqId = nextId("ping");
        pingSentAt = performance.now();
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
          watchChangeCount++;
          const ts = new Date().toISOString().slice(11, 23);
          // Measure round-trip latency of the poll and inject into state
          // so the compact summary can show connection quality at a glance.
          const rtt = watchPollSentAt > 0
            ? Math.round((performance.now() - watchPollSentAt) * 100) / 100
            : undefined;
          const stateWithLatency = rtt !== undefined
            ? { ...msg.payload.state, latencyMs: rtt }
            : msg.payload.state;
          const line = compact
            ? formatWatchSummary(stateWithLatency)
            : JSON.stringify(msg.payload.state, null, 2);
          console.log(compact ? `[${ts}] ${line}` : `--- ${ts} ---\n${line}`);
          // Exit after N state changes if --count was specified
          if (watchMaxChanges > 0 && watchChangeCount >= watchMaxChanges) {
            info(`ws-dump: reached ${watchMaxChanges} change(s), exiting`);
            if (watchInterval) clearInterval(watchInterval);
            try { ws.close(); } catch {}
            return;
          }
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
if (once || stateMode || resetMode || pingMode || healthMode) {
  const effectiveTimeout = pingMode ? Math.max(onceTimeoutMs, pingCount * 1000) : onceTimeoutMs;
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
    if (healthMode) {
      console.error("Timed out waiting for health check response");
      process.exit(2);
    }
    if (pingMode) {
      console.error(`Timed out after ${pingsSent}/${pingCount} pings`);
      process.exit(2);
    }
  }, effectiveTimeout).unref?.();
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
