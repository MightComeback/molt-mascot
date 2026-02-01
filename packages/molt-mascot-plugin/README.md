# @molt/mascot-plugin

> Clawdbot plugin for [Molt Mascot](https://github.com/MightComeback/molt-mascot).

This plugin exposes the Clawdbot agent's state (`idle`, `thinking`, `tool`, `error`) via the Gateway, allowing the Molt Mascot desktop app to reflect what the agent is doing in real-time.

## Installation

```bash
clawdhub install @molt/mascot-plugin
```

## Configuration

In your `clawdbot.config.json` or `.env`:

- `idleDelayMs` (default: 800): Time to wait before switching back to idle.
- `errorHoldMs` (default: 5000): Duration to display error states.

## Usage

The plugin automatically registers `molt-mascot-plugin.state` (and aliases) on the Gateway. No manual setup required beyond installation.

## Gateway API

This plugin registers the following Gateway method:

### `@molt/mascot-plugin.state`

Returns the current agent state, which monitors the `agent:start`, `agent:end`, `tool:call`, and `tool:result` events.

**Request:** `{} (empty)`

**Response:**

```json
{
  "ok": true,
  "state": {
    "mode": "idle",
    "since": 1706655600000,
    "lastError": {
      "message": "Tool error description",
      "ts": 1706655600000
    }
  }
}
```

- `mode`: One of `"idle"`, `"thinking"`, `"tool"`, or `"error"`.
- `since`: Timestamp (ms) when the current mode started.
- `lastError`: Optional object present when the agent encounters a failure or tool error.

_Note: The legacy aliases `molt-mascot-plugin.state`, `molt-mascot.state`, and `moltMascot.state` are also supported for backward compatibility._
