# Molt Mascot 🦞

A tiny, always-on-top desktop mascot (pixel lobster) that reflects your local Clawdbot Gateway state.

## Overview

Molt Mascot sits on your screen (usually bottom-right) and visually communicates what your Clawdbot agent is doing. It uses a pixel-art style and connects via a local plugin.

## States

- **Idle**: The lobster chills (or dances slightly).
- **Thinking**: Shows an animation when the agent is reasoning/planning.
- **Tool Use**: Turns into a tool icon (hammer/wrench) when executing commands.
- **Error**: Flashes red/alert icon when a task or tool fails.

## Development

This app is built with [Electron](https://www.electronjs.org/).

### Prerequisites

- [Bun](https://bun.sh)
- A running Clawdbot instance (for state updates)

### Setup

```bash
# In the monorepo root
bun install
```

### Run Locally

```bash
# Run the electron app in dev mode
bun --filter @molt/mascot dev
```

### Build

```bash
# Build for production (macOS/Linux/Windows)
bun --filter @molt/mascot dist
```

## Plugin (optional, recommended)

The mascot can run **without** the plugin by mapping native Gateway `agent` events to `idle/thinking/tool/error`.

Installing the companion plugin (**@molt/mascot-plugin**) improves correctness (nested tools, error details, server-side timers) and lets you sync UX knobs like `clickThrough`/`alignment` from Gateway config.

## Environment Variables

When running the Electron app standalone, you can configure it via environment variables:

| Variable | Description | Default |
|---|---|---|
| `MOLT_MASCOT_ALIGN` | Screen position (`bottom-right`, `top-left`, etc.) | `bottom-right` |
| `MOLT_MASCOT_WIDTH` | Window width in pixels | `240` |
| `MOLT_MASCOT_HEIGHT` | Window height in pixels | `200` |
| `MOLT_MASCOT_PADDING` | Padding from screen edge in pixels | `24` |
| `MOLT_MASCOT_OPACITY` | Opacity (0.0 to 1.0) | `1.0` |
| `MOLT_MASCOT_CLICKTHROUGH` | Start in click-through (ghost) mode | `false` |
| `MOLT_MASCOT_HIDE_TEXT` | Start with text hidden (pixel-only) | `false` |

### Connection Configuration

To pre-configure the connection to the Gateway (skipping the setup screen):

| Variable | Description |
|---|---|
| `GATEWAY_URL` | WebSocket URL (e.g., `ws://127.0.0.1:18789`) |
| `GATEWAY_TOKEN` | Gateway authentication token |

## Controls

The mascot listens for global shortcuts when active:

- **Cmd/Ctrl + Shift + M**: Toggle **click-through** mode (ignore mouse events).
- **Cmd/Ctrl + Shift + H**: Toggle **hide text** (show only the pixel avatar).
- **Cmd/Ctrl + Shift + R**: Force **reset** mascot state (if stuck).
- **Cmd/Ctrl + Option + Q**: **Quit** the mascot.
