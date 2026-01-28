# MIG-15 — Lobster desktop mascot (MVP)

A tiny always-on-top desktop widget that connects to a local Clawdbot Gateway (`ws://127.0.0.1:18789`) and shows a pixel-art lobster state:

- `idle`
- `thinking`
- `tool`
- `error`

This repo contains:
- `packages/mig15-lobster-plugin` — Clawdbot plugin that exposes a simplified state via `mig15.state`
- `apps/mig15-mascot` — Electron app (transparent, frameless) that connects to the Gateway WS and renders the mascot

## Stack choice (why Electron for the first run)

**Electron** is the fastest path to a reliable cross-platform desktop window with transparency + always-on-top + drag/move.

We can switch to **Tauri** later for size/perf, but it needs Rust tooling installed (not present on this machine right now). For an MVP that proves protocol + UX, Electron is the pragmatic choice.

## Prereqs

- Bun (already used in this repo)
- A running Clawdbot Gateway on `127.0.0.1:18789`

Start the Gateway (example):

```bash
clawdbot gateway start
# or for local run:
clawdbot gateway --port 18789
```

If your Gateway requires a token:
- set `gateway.auth.mode=token` and `gateway.auth.token` in config (or run `clawdbot gateway --token ...`)

## Install

From repo root:

```bash
bun install
```

## Run (debug WS dump)

```bash
GATEWAY_URL=ws://127.0.0.1:18789 bun run ws:dump
# optional (if your Gateway requires a token):
GATEWAY_TOKEN=... bun run ws:dump

# deterministic one-shot (prints hello-ok then exits):
GATEWAY_TOKEN=... bun run ws:dump --once
```

If you see `NOT_PAIRED` / `device identity required`, your Gateway is configured to require client identity pairing/auth.
For this MVP, the recommended path is enabling **token auth** (`gateway.auth.mode=token`) and using `GATEWAY_TOKEN`.

## Run (desktop mascot)

```bash
cd apps/mig15-mascot
bun run dev
```

On first launch it shows a small setup panel:
- Gateway URL (default `ws://127.0.0.1:18789`)
- Token (optional)

It reconnects automatically if the Gateway restarts.

## Enable the plugin (optional, for `mig15.state`)

The mascot also maps raw `event: "agent"` frames → state without needing the plugin.

If you want the plugin method anyway:

1) Add the plugin path to your Clawdbot config (`plugins.load.paths`):

```json5
{
  plugins: {
    load: {
      paths: [
        "/Users/might/clawd/repos/mig-15/packages/mig15-lobster-plugin"
      ]
    },
    entries: {
      "mig15-lobster": { enabled: true, config: { idleDelayMs: 800, errorHoldMs: 5000 } }
    }
  }
}
```

2) Restart the Gateway.

Then you can call over WS:
- `mig15.state` → `{ ok: true, state: { mode, since, lastError? } }`

## Notes / next steps

- Replace placeholder lobster drawing with real pixel sprite sheets + animations.
- Improve mapping by decoding tool events more precisely (tool start/end) and by using plugin hooks only.
- Add a “pin to corner / lock position” toggle + a tray/menubar entry.
