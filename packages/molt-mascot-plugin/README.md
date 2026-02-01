# @molt/mascot-plugin

A Clawdbot plugin that powers the **Molt Mascot** (pixel lobster) desktop widget.
It tracks agent state (thinking, tool use, errors) and exposes it via a local WebSocket server for the mascot app to consume.

## Configuration

Add to your `clawd.config.yaml` to customize behavior:

```yaml
plugins:
  entries:
    "@molt/mascot-plugin":
      enabled: true
      config:
        # Time (ms) to wait before returning to idle animation after activity
        idleDelayMs: 800
        
        # Time (ms) to display error states before auto-clearing
        errorHoldMs: 5000
        
        # Alignment hint (currently reserved for future use)
        alignment: "bottom-right"
```

## Features

- **State Sync**: Broadcasts `idle`, `thinking`, `tool`, and `error` states to the mascot.
- **Error Handling**: Captures tool failures and agent errors, sanitizing them for the small pixel display.
- **Auto-Recovery**: Automatically resets to idle if the agent is inactive.

## Development

This package is part of the `@molt/mascot` monorepo.

### Build
```bash
bun run build
```

### Lint
```bash
bun run lint
```
