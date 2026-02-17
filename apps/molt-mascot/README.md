# Molt Mascot 🦞

A tiny, always-on-top desktop mascot (pixel lobster) that reflects your local OpenClaw Gateway state.

## Overview

Molt Mascot sits on your screen (usually bottom-right) and visually communicates what your OpenClaw agent is doing. It connects to the local Gateway over WebSocket; the companion plugin is optional but improves correctness and UX.

## States

- **Idle**: The lobster chills (or dances slightly).
- **Thinking**: Shows an animation when the agent is reasoning/planning.
- **Tool Use**: Turns into a tool icon (hammer/wrench) when executing commands.
- **Error**: Flashes red/alert icon when a task or tool fails.

## Development

This app is built with [Electron](https://www.electronjs.org/).

### Prerequisites

- [Bun](https://bun.sh)
- A running OpenClaw instance (for state updates)

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
| `MOLT_MASCOT_CLICKTHROUGH` (or `MOLT_MASCOT_CLICK_THROUGH`) | Start in click-through (ghost) mode (`1`/`true` to enable) | `0` |
| `MOLT_MASCOT_HIDE_TEXT` (or legacy `MOLT_MASCOT_HIDETEXT`) | Start with text hidden (pixel-only) (`1`/`true` to enable) | `0` |
| `MOLT_MASCOT_IDLE_DELAY_MS` | Milliseconds to wait after agent/tool end before reverting to `idle` | `800` |
| `MOLT_MASCOT_ERROR_HOLD_MS` | Milliseconds to hold `error` state before clearing | `5000` |

### Connection Configuration

To pre-configure the connection to the Gateway (skipping the setup screen):

| Variable | Description |
|---|---|
| `GATEWAY_URL` | WebSocket URL (e.g., `ws://127.0.0.1:18789`) |
| `GATEWAY_TOKEN` | Gateway authentication token |
| `GATEWAY_MIN_PROTOCOL` | Minimum Gateway WS protocol version to negotiate (optional; useful for older Gateways) |
| `GATEWAY_MAX_PROTOCOL` | Maximum Gateway WS protocol version to negotiate (optional; useful for newer Gateways) |

## System Tray

On macOS, the dock icon is hidden for a clean desktop-widget feel. A system tray icon (pixel lobster) provides access to all controls and shows the current state in its tooltip.

Left-click the tray icon to toggle mascot visibility.

## Controls

### Keyboard Shortcuts

The mascot registers global shortcuts when active:

| Shortcut | Action |
|---|---|
| ⌘/Ctrl + ⇧ + A | Cycle **alignment** position (bottom-right → bottom-left → top-right → …) |
| ⌘/Ctrl + ⇧ + M | Toggle **ghost mode** (click-through — mouse events pass through) |
| ⌘/Ctrl + ⇧ + H | Toggle **hide text** (show only the pixel avatar) |
| ⌘/Ctrl + ⇧ + V | Toggle **visibility** (hide/show the mascot window) |
| ⌘/Ctrl + ⇧ + S | **Snap to position** (reset manual drag, reposition to alignment corner) |
| ⌘/Ctrl + ⇧ + Z | **Cycle size** (small 160×140 → medium 240×200 → large 360×300) |
| ⌘/Ctrl + ⇧ + R | Force **reset** mascot state (if stuck in error/tool) |
| ⌘/Ctrl + ⇧ + D | Toggle detached **DevTools** (debug WS frames / UI state) |
| ⌘/Ctrl + ⌥ + Q | **Quit** the mascot |

### Context Menu

Right-click the status pill to access all actions: ghost mode, hide text, reset, alignment cycling, snap to position, size cycling, copy status, reconnect, change gateway, hide mascot, devtools, and quit.

### Pill Interactions

- **Double-click** the pill to copy the current status text to clipboard.
- **Enter/Space** on the focused pill opens the context menu (keyboard accessibility).

## Screenshot Capture

Set `MOLT_MASCOT_CAPTURE_DIR` to a directory path to capture deterministic screenshots of all modes (idle, thinking, tool, error) and exit. Useful for docs and CI.
