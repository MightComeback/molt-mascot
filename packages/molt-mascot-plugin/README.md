# @molt/mascot-plugin

The companion Clawdbot plugin for [molt-mascot](https://github.com/MightComeback/molt-mascot).

Exposes the internal agent state (`idle` / `thinking` / `tool` / `error`) to the desktop mascot via the Gateway.

## Installation

```bash
# via npm/clawdhub (future)
clawdbot install @molt/mascot-plugin

# or from local source in the monorepo
clawdbot install ./packages/molt-mascot-plugin
```

## Configuration

Add to your `clawdbot.config.ts` (or `.json`):

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

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `idleDelayMs` | number | `800` | Delay before reverting to idle state |
| `errorHoldMs` | number | `5000` | Duration to show error state |
| `alignment` | string | `bottom-right` | Screen position hint |
