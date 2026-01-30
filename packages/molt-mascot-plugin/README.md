# molt-mascot-plugin

A Clawdbot plugin that exposes `molt-mascot` state via RPC.

## Features

- Exposes `molt-mascot.state` -> `{ ok: true, state: { mode, since, lastError? } }`
- Configurable idle delay and error hold time.

## Configuration

Add to your `agent.config.json` plugins section:

```json
"plugins": {
  "@molt/molt-mascot-plugin": {
    "enabled": true,
    "path": "./packages/molt-mascot-plugin",
    "config": {
      "idleDelayMs": 800,
      "errorHoldMs": 5000
    }
  }
}
```

## API

### `molt-mascot.state`

Returns the current mascot state.

```ts
type Response = {
  ok: boolean;
  state: {
    mode: "idle" | "thinking" | "tool" | "error";
    since: number;
    lastError?: { message: string; ts: number };
  };
};
```

### Legacy Compatibility

For backward compatibility with older clients, this plugin also registers the following RPC methods:

- `molt-mascot.state`
- `moltMascot.state`
