# molt-mascot

A tiny always-on-top desktop mascot (pixel lobster) that reflects your local **Clawdbot** Gateway state: `idle` / `thinking` / `tool` / `error`.

## Screenshots

![idle](assets/screenshots/idle.png)
![thinking](assets/screenshots/thinking.png)
![tool](assets/screenshots/tool.png)
![error](assets/screenshots/error.png)

## Quickstart

### 1. Install Plugin
The mascot requires the companion plugin to receive state updates from Clawdbot.

```bash
# From the monorepo root
clawdbot plugins install ./packages/molt-mascot-plugin
```

### 2. Run App

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
- **Quit application**: **Cmd/Ctrl+Option+Q** (the dock icon is hidden on macOS)
- **Hide Text** (pixel-only mode): set `MOLT_MASCOT_HIDE_TEXT=1` to hide the status pill/HUD.
  - Toggle at runtime with **Cmd/Ctrl+Shift+H**
- **Reset State**: **Cmd/Ctrl+Shift+R** (force idle/clear error)
- **Alignment**: `MOLT_MASCOT_ALIGN` (default: `bottom-right`)
  - Values: `bottom-right`, `bottom-left`, `top-right`, `top-left`, `top-center`, `bottom-center`, `center-left`, `center-right`, `center` (ignores padding)
  - Edge padding: `MOLT_MASCOT_PADDING` (default: `24`)
- **Opacity**: `MOLT_MASCOT_OPACITY` (default: `1.0`, range: `0.0`-`1.0`)
- **Window Size**: `MOLT_MASCOT_WIDTH` (default: 240) / `MOLT_MASCOT_HEIGHT` (default: 200)
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
- `@molt/mascot-plugin.state` → `{ ok: true, state: { mode, since, lastError? } }`

Back-compat alias:
- `molt-mascot-plugin.state` / `molt-mascot.state` / `moltMascot.state` → same payload

Config lives under `plugins.entries["@molt/mascot-plugin"].config`.

Supported keys:
- `alignment` (string): same values as `MOLT_MASCOT_ALIGN`
- `clickThrough` (boolean): enable click-through mode
- `hideText` (boolean): hide status text (pixel-only mode)
- `idleDelayMs` (number): idle timeout (default 800)
- `errorHoldMs` (number): error display duration (default 5000)
- `opacity` (number): window opacity (0.0 - 1.0)
- `padding` (number): screen edge padding

(Loading plugins requires a Clawdbot config change + gateway restart; do it when you’re awake.)

## Troubleshooting

- If the mascot stays in **offline**/**disconnected**, confirm `GATEWAY_URL` points at your local Gateway (and that the Gateway is running).
- If the mascot connects but never leaves **idle**, confirm you’re on a recent Clawdbot build and that your Gateway is emitting agent/tool lifecycle events.
- If you enabled the plugin but `molt-mascot-plugin.state` fails, verify the plugin id is consistent across `packages/molt-mascot-plugin/clawdbot.plugin.json` (`id`), the plugin entry in your Clawdbot config (`plugins.entries.<id>`), and the runtime export (`export const id = "@molt/mascot-plugin"`).


## Develop

```bash
bun run dev
```

## Installation

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

## Build

```bash
pnpm build
```
