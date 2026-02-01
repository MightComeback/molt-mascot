# @molt/mascot-plugin

A Clawdbot plugin that connects your Clawdbot Gateway to the **Molt Mascot** desktop application (pixel lobster).

## Overview

This plugin broadcasts the internal state of your Clawdbot agent (idle, thinking, tool usage, errors) to the local Molt Mascot app via the Gateway's WebSocket or local API. It includes a robust state machine to handle rapid tool/agent transitions without flickering.

## Configuration

Add this to your Clawdbot `config.json` (or `clawdbot.config.json`):

```json
{
  "plugins": {
    "entries": {
      "@molt/mascot-plugin": {
        "enabled": true,
        "config": {
          "idleDelayMs": 800,
          "errorHoldMs": 5000,
          "alignment": "bottom-right"
        }
      }
    }
  }
}
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `idleDelayMs` | number | `800` | Minimum time to wait before reverting to "idle" state (prevents flickering). |
| `errorHoldMs` | number | `5000` | How long to display error messages before clearing them. |
| `alignment` | string | `bottom-right` | Screen alignment for the mascot window. (Supported by the Mascot app). |

## Development

- `bun install`: Install dependencies
- `bun run build`: Build the plugin
- `bun run dev`: Watch mode
