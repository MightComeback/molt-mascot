# Molt Mascot Plugin

This plugin exposes the internal state of the Clawdbot agent (idle, thinking, tool use, error) via a WebSocket RPC endpoint. It is designed to drive the Molt Mascot desktop app.

## Configuration

Add this to your `config.yaml`:

```yaml
plugins:
  entries:
    molt-mascot:
      enabled: true
      path: "/path/to/molt-mascot-plugin"
      config:
        idleDelayMs: 800   # Time before switching to idle animation
        errorHoldMs: 5000  # How long to show error state
```

## RPC API

The plugin registers a method `molt-mascot.state` which returns:

```json
{
  "ok": true,
  "state": {
    "mode": "idle" | "thinking" | "tool" | "error",
    "since": 1700000000000,
    "lastError": { "message": "...", "ts": ... }
  }
}
```

## Development

Build:
```bash
bun build index.ts --outfile dist/index.js
```
