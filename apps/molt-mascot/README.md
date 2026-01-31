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
    - `MOLT_MASCOT_CLICKTHROUGH`: Set to `1` or `true` to enable click-through on launch.
    - `gatewayUrl`: Pre-seed the gateway URL.
    - `gatewayToken`: Pre-seed the gateway auth token.

## Screenshots

To generate asset screenshots (for READMEs or docs):

```bash
bun run screenshots
```

Screenshots are saved to `assets/screenshots`.
