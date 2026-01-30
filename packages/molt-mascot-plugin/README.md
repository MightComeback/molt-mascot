# @molt/molt-mascot-plugin

Clawdbot plugin for the Molt Mascot desktop app. It tracks agent lifecycle events (thinking, tool usage, errors) and exposes a state API for the mascot to reflect.

## State API

Method: `molt-mascot.state`

Returns:
```json
{
  "ok": true,
  "state": {
    "mode": "idle" | "thinking" | "tool" | "error",
    "since": 1700000000000,
    "lastError": {
      "message": "...",
      "ts": 1234567890
    }
  }
}
```
