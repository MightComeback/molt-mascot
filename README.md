# MightComeback/molt-mascot

A tiny always-on-top desktop mascot (pixel lobster) that reflects your local **Clawdbot** Gateway state: `idle` / `thinking` / `tool` / `error`.

## Screenshots

![idle](assets/screenshots/idle.png)
![thinking](assets/screenshots/thinking.png)
![tool](assets/screenshots/tool.png)
![error](assets/screenshots/error.png)

## Quickstart

### 1. Install Plugin (optional, recommended)

The mascot can run **without** the plugin by mapping native Gateway `agent` events to `idle/thinking/tool/error`.

Installing the companion plugin improves correctness (nested tools, error details, server-side timers) and lets you sync UX knobs like `clickThrough`/`alignment` from Gateway config.

```bash
# From npm (recommended for most users)
clawdbot plugins install @molt/mascot-plugin

# Or from the monorepo root (local dev)
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

- **Click-through** (mascot never blocks clicks): set `MOLT_MASCOT_CLICKTHROUGH=1` (or `MOLT_MASCOT_CLICK_THROUGH=1`)
  - Toggle at runtime with **Cmd/Ctrl+Shift+M**
- **Quit application**: **Cmd/Ctrl+Option+Q** (the dock icon is hidden on macOS)
- **Hide Text** (pixel-only mode): set `MOLT_MASCOT_HIDE_TEXT=1` to hide the status pill/HUD.
  - Toggle at runtime with **Cmd/Ctrl+Shift+H**
- **Reset State**: **Cmd/Ctrl+Shift+R** (force idle/clear error)
- **Alignment**: `MOLT_MASCOT_ALIGN` (default: `bottom-right`)
  - Values: `bottom-right`, `bottom-left`, `top-right`, `top-left`, `top-center`, `bottom-center`, `center-left`, `center-right`, `center`
  - Note: `center` ignores padding; all other alignments use `MOLT_MASCOT_PADDING`.
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
- `@molt/mascot-plugin.state` → `{ ok: true, state: { mode, since, lastError?, currentTool?, alignment, clickThrough, hideText, padding, opacity } }`
- `@molt/mascot-plugin.reset` → `{ ok: true, state }` (clears error + forces `idle`)

Back-compat aliases:
- `molt-mascot-plugin.state` / `molt-mascot.state` / `moltMascot.state` / `moltMascotPlugin.state` → same payload
- `molt-mascot-plugin.reset` / `molt-mascot.reset` / `moltMascot.reset` / `moltMascotPlugin.reset` → same payload

Config lives under `plugins.entries["@molt/mascot-plugin"].config`.

Back-compat: the plugin will also read config under alias keys like `plugins.entries["molt-mascot"].config` (same set as the method aliases), which helps when migrating older setups.

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
- If you enabled the plugin but `@molt/mascot-plugin.state` fails, verify the plugin id is consistent across `packages/molt-mascot-plugin/clawdbot.plugin.json` (`id`), the plugin entry in your Clawdbot config (`plugins.entries.<id>`), and the runtime export (derived from `package.json` `name`, i.e. `export const id = pkg.name`). (The plugin also supports method aliases like `molt-mascot.state` / `moltMascot.state` if you have older configs.)

## Develop

```bash
bun install

# Run the mascot app
bun run mascot

# Or run everything in watch mode (monorepo)
bun run dev

# Checks
bun run lint

# Auto-format
bun run format
```

## Linear workflow

This repo is tracked in Linear as **MIG-15**. Keep commits small and link them in the issue.

## Package manager notes

This repo uses **Bun** for running scripts (see `package.json` `packageManager` + `scripts`).

- You *can* install dependencies with `npm install`, but you’ll still need **Bun** to run the repo scripts unless you rewrite them.
- Recommended: `bun install`

## Build & install (monorepo)

```bash
bun install

# Build the Clawdbot plugin (output is in the package dist/)
bun run --cwd packages/molt-mascot-plugin build

# Install the plugin into your local Clawdbot
clawdbot plugins install ./packages/molt-mascot-plugin
```

Then run the app:

```bash
bun run mascot
```

(Or see **Quickstart** above for installing from npm.) 

## Repository

This repository contains both the **molt-mascot** desktop app and its companion **@molt/mascot-plugin** (tracked as **MIG-15** in Linear).

## Package

- npm package: https://www.npmjs.com/package/@molt/mascot-plugin 
