# Contributing to Molt Mascot

## Architecture

```
molt-mascot/
├── apps/molt-mascot/          # Electron desktop app
│   ├── src/
│   │   ├── electron-main.cjs  # Main process: window, tray, shortcuts, prefs
│   │   ├── preload.cjs        # Context bridge (IPC ↔ renderer)
│   │   ├── renderer.js        # UI: canvas animation, gateway WS, state machine
│   │   ├── index.html         # Single-page shell with CSS
│   │   ├── draw.js            # Sprite drawing + cache + blink state
│   │   ├── sprites.js         # Pixel art data (32×32 grids)
│   │   ├── context-menu.js    # Right-click menu (a11y, keyboard nav)
│   │   ├── gateway-client.js  # Extracted WS client class (reconnect, stale detection, plugin polling)
│   │   ├── plugin-sync.js     # Change-detection for plugin state → IPC dispatch
│   │   ├── debug-info.js      # Multi-line diagnostic string builder
│   │   ├── utils.js           # Shared utilities (re-exports from plugin)
│   │   ├── tray-icon.cjs      # Pixel-art tray icon renderer with status dot
│   │   ├── get-position.cjs   # Window positioning (alignment × padding)
│   │   └── is-truthy-env.cjs  # Boolean env var parser
│   └── test/                  # Bun test files (mirrors src/)
│
├── packages/molt-mascot-plugin/  # OpenClaw Gateway plugin
│   ├── src/index.ts              # State machine, event handlers, Gateway methods
│   └── test/utils.test.ts        # Plugin tests
│
└── tools/ws-dump.ts           # CLI WebSocket debug tool
```

## Key Design Decisions

- **Plugin is optional.** The Electron app works standalone by mapping native Gateway `agent` events. The plugin adds accuracy (nested tools, error details, server-side timers) and config sync.
- **Shared utilities.** `truncate`, `cleanErrorString`, `formatDuration` live in the plugin package. The renderer re-exports them via `utils.js` to avoid drift.
- **Pure functions for testability.** Drawing, positioning, tooltip building, debug info — all extracted as pure functions with test coverage.
- **Sprite cache.** Pre-renders sprites to OffscreenCanvas to avoid per-pixel `fillRect` on every frame. Cache invalidates on scale change.

## Dev Setup

```bash
# Install dependencies (bun only, no npm)
bun install

# Run tests
bun test

# Run the Electron app
bun run --cwd apps/molt-mascot dev

# Build the plugin
bun run --cwd packages/molt-mascot-plugin build

# Capture screenshots for all states
bun run --cwd apps/molt-mascot capture
```

## Adding a New Overlay

1. Add the sprite frames to `apps/molt-mascot/src/sprites.js` in the `overlay` export.
2. Each frame is a 32×32 array of palette character strings. Use `.` for transparent pixels.
3. Add the rendering branch in `drawLobster()` in `apps/molt-mascot/src/draw.js`.
4. Add sprite validation tests in `apps/molt-mascot/test/sprites.test.js`.
5. Add a draw test in `apps/molt-mascot/test/draw.test.js`.

## Adding a New Palette Color

1. Add the character → CSS color mapping to `palette` in `sprites.js`.
2. All existing sprites remain valid (the validator checks `ch in palette`).

## Testing

Tests use `bun:test`. Every `src/` module has a corresponding `test/` file. Run:

```bash
bun test                          # all tests
bun test apps/molt-mascot         # app tests only
bun test packages/molt-mascot-plugin  # plugin tests only
```

## Commit Convention

- Signed commits (`git commit -S`) required.
- Prefix: `feat(scope):`, `fix(scope):`, `docs:`, `test:`, `refactor:`.
- Keep commits atomic — one logical change per commit.
