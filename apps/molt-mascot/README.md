# Molt Mascot

A tiny always-on-top desktop mascot (pixel lobster) that reflects your local Clawdbot Gateway state.

## Features

- **State Reflection**: Changes appearance based on Gateway state (Idle, Thinking, Tool Use, Error).
- **Always-on-top**: Floats over other windows by default.
- **Click-through**: Toggle interactivity with `Cmd+Shift+M` (or `Ctrl+Shift+M`) to let clicks pass through to windows behind.

## Setup & Running

From the monorepo root:

```bash
# Install dependencies
bun install

# Run the mascot
bun run mascot
```

## Configuration

The mascot connects to a Clawdbot Gateway WebSocket.

- **Default URL**: `ws://127.0.0.1:18789`
- **Environment Variables**:
    - `MOLT_MASCOT_ALIGN`: Positioning (e.g. `bottom-right` (default), `bottom-left`, `top-right`, `top-left`).
    - `MOLT_MASCOT_WIDTH`: Window width (default `240`).
    - `MOLT_MASCOT_HEIGHT`: Window height (default `200`).
    - `MOLT_MASCOT_CLICKTHROUGH`: Set to `1` or `true` to enable click-through on launch.
    - `MOLT_MASCOT_HIDE_TEXT`: Set to `1` or `true` to hide the status text on launch.
    - `gatewayUrl`: Pre-seed the gateway URL.
    - `gatewayToken`: Pre-seed the gateway auth token.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+Shift+M` / `Ctrl+Shift+M` | Toggle **Click-through** (interactivity) |
| `Cmd+Shift+H` / `Ctrl+Shift+H` | Toggle **Text Visibility** (show/hide status text) |
| `Cmd+Shift+R` / `Ctrl+Shift+R` | **Reset** internal state (clears errors/timers) |
| `Cmd+Shift+Q` / `Ctrl+Shift+Q` | **Quit** the mascot |

## Screenshots

To generate asset screenshots (for READMEs or docs):

```bash
bun run screenshots
```

Screenshots are saved to `assets/screenshots`.
