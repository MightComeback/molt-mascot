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
bun run --cwd packages/molt-mascot-plugin build
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

Example (`clawdbot.config.json`):

```jsonc
{
  "plugins": {
    "entries": {
      "@molt/mascot-plugin": {
        "config": {
          "alignment": "bottom-right",
          "padding": 24,
          "opacity": 1,
          "clickThrough": false,
          "hideText": false,
          "idleDelayMs": 800,
          "errorHoldMs": 5000
        }
      }
    }
  }
}
```

Notes:
- **Plugin id:** `@molt/mascot-plugin` (runtime id is derived from `package.json` `name`)
- **Methods:** `@molt/mascot-plugin.state`, `@molt/mascot-plugin.reset`
- **Gateway method aliases:** the plugin also responds to `molt-mascot`, `molt-mascot-plugin`, `moltMascot`, and `moltMascotPlugin` for `.state` / `.reset` (useful if you have older configs/docs).
- **Config key aliases:** the plugin will also read configuration under those same alias keys (helpful if you previously configured it under a short name).

## State payload

`<id>.state` returns a minimal, UI-friendly snapshot for the Electron app to render.

Example response:

```jsonc
{
  "ok": true,
  "state": {
    "mode": "tool", // idle | thinking | tool | error
    "since": 1700000000000,
    "currentTool": "exec",
    "alignment": "bottom-right",
    "clickThrough": false,
    "hideText": false,
    "padding": 24,
    "opacity": 1,
    "lastError": { "message": "File not found", "ts": 1700000000123 }
  }
}
```

Notes:
- `lastError` is only present while `mode === "error"`.
- `currentTool` is derived from the most-recent active tool call across running sessions.

## Development

From the monorepo root:

```bash
bun install
bun run --cwd packages/molt-mascot-plugin test
bun run --cwd packages/molt-mascot-plugin build
```

## Shortcuts (Electron App)

If you are running the `molt-mascot` Electron app:

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+Shift+M` | Toggle click-through mode (ghost mode) |
| `Cmd/Ctrl+Shift+H` | Toggle hide text |
| `Cmd/Ctrl+Shift+R` | Reset state |
| `Cmd/Ctrl+Option+Q` | Quit app |

## Utility Functions

The plugin exports several utility functions that can be used independently of the full plugin registration:

### `coerceNumber(v, fallback)`

Converts a value to a number, with validation and fallback.

```typescript
import { coerceNumber } from '@molt/mascot-plugin';

coerceNumber('800', 800);        // 800
coerceNumber(123, 0);            // 123
coerceNumber('not-a-number', 0); // 0
coerceNumber(null, 0);           // 0
```

### `coerceBoolean(v, fallback)`

Converts a value to a boolean, handling multiple input types.

```typescript
import { coerceBoolean } from '@molt/mascot-plugin';

coerceBoolean('true', false);      // true
coerceBoolean(1, false);           // true
coerceBoolean('0', true);          // false
coerceBoolean(null, false);        // false
coerceBoolean(undefined, false);   // false
```

### `truncate(str, limit?)`

Truncates a string to a maximum length, with smart word boundary detection.

```typescript
import { truncate } from '@molt/mascot-plugin';

truncate('This is a very long message', 20); // "This is a ver…"
truncate('Short', 20);                        // "Short"
```

### `cleanErrorString(s)`

Removes common error prefixes, ANSI escape codes, and stack traces for cleaner error display.

```typescript
import { cleanErrorString } from '@molt/mascot-plugin';

cleanErrorString('Error: Command failed: File not found'); // "File not found"
cleanErrorString('\x1B[31mError: timeout\x1B[0m');        // "timeout"
```

### `summarizeToolResultMessage(msg)`

Extracts a short, human-readable summary from tool result messages.

```typescript
import { summarizeToolResultMessage } from '@molt/mascot-plugin';

summarizeToolResultMessage('Success: File saved');
// "Success: File saved"

summarizeToolResultMessage({ exitCode: 1, stderr: 'Permission denied' });
// "Permission denied"
```

**Note:** All exported utilities are ESM/CommonJS compatible and use TypeScript types. They are available in both the bundled distributions (`dist/index.js` / `dist/index.mjs`) and the TypeScript source (`src/index.ts`).

