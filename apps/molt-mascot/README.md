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

## Plugin Requirement

To feed data to this mascot, you must install the **@molt/mascot-plugin** in your Clawdbot Gateway.

## Controls

The mascot listens for global shortcuts when active:

- **Cmd/Ctrl + Shift + M**: Toggle **click-through** mode (ignore mouse events).
- **Cmd/Ctrl + Shift + H**: Toggle **hide text** (show only the pixel avatar).
- **Cmd/Ctrl + Shift + R**: Force **reset** mascot state (if stuck).
- **Cmd/Ctrl + Option + Q**: **Quit** the mascot.
