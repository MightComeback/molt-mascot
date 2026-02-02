# @molt/mascot-plugin

Clawdbot plugin for Molt Mascot (pixel lobster).

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `idleDelayMs` | number | `800` | Milliseconds to wait before reverting to idle state |
| `errorHoldMs` | number | `5000` | Milliseconds to hold the error state before clearing |
| `alignment` | string | `bottom-right` | Screen alignment (`top-left`, `top-right`, `bottom-left`, `bottom-right`, `top-center`, `bottom-center`, `center-left`, `center-right`, `center`) |
| `clickThrough` | boolean | `false` | Enable click-through mode (ghost mode) so the mascot doesn't intercept mouse clicks |

## Shortcuts (Electron App)

If you are running the `molt-mascot` Electron app:

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+Shift+M` | Toggle click-through mode (ghost mode) |
| `Cmd/Ctrl+Shift+H` | Toggle hide text |
| `Cmd/Ctrl+Shift+R` | Reset state |
| `Cmd/Ctrl+Option+Q` | Quit app |

