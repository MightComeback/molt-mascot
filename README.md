# molt-mascot

A tiny always-on-top desktop mascot (pixel lobster) that reflects your local **Clawdbot** Gateway state: `idle` / `thinking` / `tool` / `error`.

## Screenshots

![idle](assets/screenshots/idle.png)
![thinking](assets/screenshots/thinking.png)
![tool](assets/screenshots/tool.png)
![error](assets/screenshots/error.png)

## Quickstart

```bash
bun install

# optional, if your gateway requires token auth:
export GATEWAY_URL=ws://127.0.0.1:18789
export GATEWAY_TOKEN=...

bun run mascot
```

### UX toggles

- **Click-through** (mascot never blocks clicks): set `MOLT_MASCOT_CLICKTHROUGH=1`
  - Toggle at runtime with **Cmd/Ctrl+Shift+M**
- **Alignment**: `MOLT_MASCOT_ALIGN` (default: `bottom-right`)
  - Values: `bottom-right`, `bottom-left`, `top-right`, `top-left`, `center`
- **Timing knobs** (no plugin required):
  - `MOLT_MASCOT_IDLE_DELAY_MS` (default: 800)
  - `MOLT_MASCOT_ERROR_HOLD_MS` (default: 5000)
- **Env seeding** (no UI typing): `GATEWAY_URL` / `GATEWAY_TOKEN` (also `CLAWDBOT_GATEWAY_URL` / `CLAWDBOT_GATEWAY_TOKEN`)

## Project Structure

- `apps/molt-mascot` (@molt/mascot): The Electron desktop app.
- `packages/molt-mascot-plugin` (@molt/mascot-plugin): The optional Clawdbot server plugin.
- `tools/`: Dev scripts (WS dump, etc).

## Dev tools

Dump raw Gateway frames:

```bash
GATEWAY_URL=ws://127.0.0.1:18789 GATEWAY_TOKEN=... bun run ws:dump --once
```

Regenerate screenshots:

```bash
bun run screenshots
```

## Plugin (optional)

There’s a small Clawdbot plugin included (`packages/molt-mascot-plugin`) that exposes a simplified RPC method.

Recommended (follows `pluginId.action`):
- `molt-mascot-plugin.state` → `{ ok: true, state: { mode, since, lastError? } }`

Back-compat alias:
- `molt-mascot.state` / `moltMascot.state` → same payload

Config lives under:
- `plugins.entries.molt-mascot-plugin.config` (and `...enabled: true`)

(Loading plugins requires a Clawdbot config change + gateway restart; do it when you’re awake.)

## Troubleshooting

- If the mascot stays in **offline**/**disconnected**, confirm `GATEWAY_URL` points at your local Gateway (and that the Gateway is running).
- If the mascot connects but never leaves **idle**, confirm you’re on a recent Clawdbot build and that your Gateway is emitting agent/tool lifecycle events.
- If you enabled the plugin but `molt-mascot-plugin.state` fails, verify the plugin id is consistent across `packages/molt-mascot-plugin/clawdbot.plugin.json` (`id`), the plugin entry in your Clawdbot config (`plugins.entries.<id>`), and the runtime export (`export const id = "molt-mascot-plugin"`).

## Install

```bash
bun install
```

## Develop

```bash
bun run dev
```
