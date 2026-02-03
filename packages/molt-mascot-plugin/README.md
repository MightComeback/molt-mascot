# @molt/mascot-plugin

Clawdbot plugin for Molt Mascot (pixel mascot).

## Requirements

This plugin is optional.

- If you run the **Molt Mascot** desktop app (Electron), it can call this plugin’s Gateway methods to read a simplified “agent state” payload.
- If you *don’t* run the desktop app, installing the plugin is harmless but not very useful.

## Installation

From a published package:

```bash
clawdbot plugins install @molt/mascot-plugin
```

From this monorepo (local dev):

```bash
# from the monorepo root
clawdbot plugins install ./packages/molt-mascot-plugin
```

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `idleDelayMs` | number | `800` | Milliseconds to wait before reverting to idle state |
| `errorHoldMs` | number | `5000` | Milliseconds to hold the error state before clearing |
| `alignment` | string | `bottom-right` | Screen alignment (`top-left`, `top-right`, `bottom-left`, `bottom-right`, `top-center`, `bottom-center`, `center-left`, `center-right`, `center`) |
| `clickThrough` | boolean | `false` | Enable click-through mode (ghost mode) so the mascot doesn't intercept mouse clicks |
| `hideText` | boolean | `false` | Hide the text status pill (pixel-only mode) |
| `padding` | number | `24` | Padding from screen edges (pixels) |
| `opacity` | number | `1` | Window opacity (0.0 - 1.0) |

Notes:
- **Plugin id:** `@molt/mascot-plugin`
- **Methods:** `@molt/mascot-plugin.state`, `@molt/mascot-plugin.reset`
- **Gateway method aliases:** the plugin also responds to `molt-mascot`, `molt-mascot-plugin`, `moltMascot`, and `moltMascotPlugin` for `.state` / `.reset` (useful if you have older configs/docs).

## Shortcuts (Electron App)

If you are running the `molt-mascot` Electron app:

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+Shift+M` | Toggle click-through mode (ghost mode) |
| `Cmd/Ctrl+Shift+H` | Toggle hide text |
| `Cmd/Ctrl+Shift+R` | Reset state |
| `Cmd/Ctrl+Option+Q` | Quit app |

