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
