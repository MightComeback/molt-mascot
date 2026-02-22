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
│   │   ├── context-menu-items.js # Menu item descriptors (pure function, no DOM)
│   │   ├── pill-label.js      # HUD pill label/class computation (pure function)
│   │   ├── gateway-client.js  # Extracted WS client class (reconnect, stale detection, plugin polling)
│   │   ├── plugin-sync.js     # Change-detection for plugin state → IPC dispatch
│   │   ├── latency-tracker.js # Rolling latency stats (ring buffer, percentiles, jitter)
│   │   ├── debug-info.js      # Multi-line diagnostic string builder
│   │   ├── opacity-presets.cjs # Opacity preset cycling logic
│   │   ├── utils.js           # Shared utilities (re-exports from plugin)
│   │   ├── tray-icon.cjs      # Pixel-art tray icon renderer with status dot
│   │   ├── get-position.cjs   # Window positioning (alignment × padding)
│   │   ├── format-latency.cjs # Shared latency formatter (CJS for tray + ESM re-export)
│   │   ├── is-truthy-env.cjs  # Boolean env var parser
│   │   ├── mode-emoji.cjs    # Mode → emoji map (shared tray + renderer)
│   │   ├── size-presets.cjs   # Size preset definitions (dimensions, labels)
│   │   ├── fps-counter.js     # Rolling FPS counter (ring buffer)
│   │   ├── parse-cli-arg.cjs  # CLI argument parser (--flag value)
│   │   ├── prefs.cjs          # User preference persistence (debounced, atomic writes)
│   │   └── status-cli.cjs    # --status CLI output (resolved config, formatting)
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
3. Add an entry to the `OVERLAY_TIMING` map in `apps/molt-mascot/src/draw.js` — no branching logic needed, just `{ sprites, frameDurationMs }`.
4. Add sprite validation tests in `apps/molt-mascot/test/sprites.test.js`.
5. Add a draw test in `apps/molt-mascot/test/draw.test.js`.

## Adding a New Palette Color

1. Add the character → CSS color mapping to `palette` in `sprites.js`.
2. All existing sprites remain valid (the validator checks `ch in palette`).

## Adding a New Synced Property (Plugin → Electron)

Plugin state properties (clickThrough, opacity, size, etc.) sync from the Gateway plugin to the Electron app via a declarative change-detection system. To add a new synced property:

1. **Plugin (`packages/molt-mascot-plugin/src/index.ts`)**: Add the field to the `State` type and (optionally) `PluginConfig`. Initialize it in the `state` object inside `register()`.
2. **Plugin sync (`apps/molt-mascot/src/plugin-sync.js`)**: Add an entry to `SYNC_PROPS` — `[stateKey, expectedType, callbackName]`. Add a validator to `VALIDATORS` if the value has domain constraints (e.g. `>= 0`, `0-1`).
3. **Renderer (`apps/molt-mascot/src/renderer.js`)**: Add a callback in the `createPluginSync({...})` call to handle the new property (update local state, call IPC, etc.).
4. **Tests**: Add sync tests in `apps/molt-mascot/test/plugin-sync.test.js` (change detection, validation, reset behavior).

The system is designed so adding a new synced property is a one-liner in `SYNC_PROPS` + a callback — no duplicated if-blocks needed.

## Adding a New CLI Flag

1. **Parse the flag** in `apps/molt-mascot/src/electron-main.cjs`:
   - Use `parseCliArg('--flag-name')` for flags with values, or `process.argv.includes('--flag')` for booleans.
   - Validate the value and write to the corresponding `process.env.MOLT_MASCOT_*` var (so preload picks it up).
   - Emit a warning to stderr for invalid values so users know their input was ignored.
2. **Add to `--help` output** in `electron-main.cjs` (both the Options and Environment Variables sections).
3. **Expose via preload** if the renderer needs it: add to the `env` object in `preload.cjs`.
4. **Document** in `README.md` (CLI flags table + env vars section).
5. **Test**: add a test in `apps/molt-mascot/test/parse-cli-arg.test.js` if it uses `parseCliArg`.

## Adding a New Mode

1. **Sprite**: Add overlay frames to `sprites.js` → `overlay.<mode>`.
2. **Drawing**: Add timing entry to `OVERLAY_TIMING` in `draw.js`.
3. **Emoji**: Add entry to `MODE_EMOJI` in `mode-emoji.cjs`.
4. **Tray**: Add status dot color to `STATUS_DOT_COLORS` in `tray-icon.cjs`.
5. **Pill CSS**: Add `.pill--<mode>` class in `index.html` with appropriate color/animation.
6. **Reduced motion**: Add `animation: none` override in the `@media (prefers-reduced-motion)` block.
7. **Tests**: Sprite validation, draw tests, mode-emoji coverage, tray tooltip tests.

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
