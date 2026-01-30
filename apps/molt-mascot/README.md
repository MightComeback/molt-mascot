# Molt Mascot

> A tiny always-on-top desktop mascot (pixel lobster) that reflects your local Clawdbot Gateway state.

## Features

- **Always on top**: Floats over your windows.
- **State aware**: Reflects 'idle', 'thinking', 'tool', 'error' states from the local gateway.
- **Click-through**: Toggle click-through mode with `Cmd+Shift+M` or `Ctrl+Shift+M`.
- **Cross-platform**: Runs on macOS (widget-like), Windows, and Linux.

## Development

```bash
# Repo root
bun install

# Run dev mode
bun run mascot
```

## Shortcuts

- `Cmd+Shift+M` (macOS) / `Ctrl+Shift+M` (Win/Linux): Toggle "click-through" mode. When enabled, mouse clicks pass through the mascot to the window behind it.

## Environment Variables

You can pre-configure the mascot using these environment variables:

| Variable | Description |
|----------|-------------|
| `GATEWAY_URL` | Pre-fill the Gateway WebSocket URL (e.g. `ws://127.0.0.1:18789`). |
| `GATEWAY_TOKEN` | Pre-fill the authentication token if required. |
| `MOLT_MASCOT_CLICKTHROUGH`| Set to `1` or `true` to start in click-through mode. |
| `MOLT_MASCOT_IDLE_DELAY_MS` | Milliseconds to wait before returning to idle animation (default: 800). |
| `MOLT_MASCOT_ERROR_HOLD_MS` | Milliseconds to hold the error state before clearing (default: 5000). |

