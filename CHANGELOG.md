# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- `ws-dump --watch --compact` now prints a human-readable summary line per state change (mode, latency, quality, active agents/tools, uptime) instead of raw JSON — much easier for at-a-glance monitoring

### Added
- Tray icon sprite capture in `--capture-dir` mode (generates `tray/tray-{mode}.png` for all modes + base sprite at 2× scale for docs/CI assets)
- Reconnect attempt number shown in pill label during connecting/disconnected modes
- `p99` latency in rolling stats and tray tooltip for extreme tail detection
- `healthStatus` ("healthy"/"degraded"/"unhealthy") surfaced in tray tooltip
- `computeHealthStatus` pure function in utils.js (no GatewayClient dependency needed)
- `isRecoverableCloseCode` utility for smarter reconnect behavior (stop retrying on fatal close codes)
- Sprite cache `warmAll()` method for pre-rendering all sprites on init/resize (eliminates first-frame jitter)
- `SECURITY.md` with vulnerability reporting policy and security design overview
- Missing modules added to CONTRIBUTING.md architecture tree (pill-label, context-menu-items, latency-tracker, opacity-presets)
- `staleSinceMs` getter on `GatewayClient` — returns milliseconds since the last WebSocket message (or null if disconnected), enabling proactive staleness warnings before the auto-reconnect timer fires
- `toJSON()` method on `GatewayClient` — `JSON.stringify(client)` now returns a clean diagnostic snapshot (delegates to `getStatus()`)
- `--ping` and `--ping-count=<n>` modes in `ws-dump` for CLI latency measurement (min/avg/median/max summary)
- `status-cli.cjs` added to architecture tree in CONTRIBUTING.md
- `--start-hidden` CLI flag for tray-only launch (toggle visibility with shortcut)
- `lastResetAt` timestamp in plugin state for reset diagnostics (shown in pill tooltip, tray tooltip, and debug info)
- `--status` CLI flag for resolved config diagnostics (alignment, size, opacity, timing, etc.)
- `--status --json` for machine-readable config output (scripting, CI checks)
- Saved preferences and PID in `--status` output
- Resolved window dimensions in `--status` output
- Node and Chrome versions in `--status` output
- `connectionSuccessRate` computed property in `GatewayClient` and debug info
- Connection quality emoji (🟢🟡🟠🔴) in debug info latency line
- Padding shown in `--status` config summary
- Timing config section in `--status` output (sleepThreshold, idleDelay, errorHold)
- `--click-through` and `--hide-text` boolean CLI flags
- `--reduced-motion` CLI flag for animation-free mode
- `--no-shortcuts` flag to disable global keyboard shortcut registration
- `--sleep-threshold`, `--idle-delay`, `--error-hold` timing CLI flags
- `--disable-gpu` flag and `MOLT_MASCOT_DISABLE_GPU` env var
- `MOLT_MASCOT_NO_TRAY` env var for tray-less mode parity
- `tiny` size preset added to plugin `Size` type and `allowedSizes`
- `formatCount` utility for compact large number display in tooltips (e.g. "1.5K")
- `formatElapsed` utility hoisted to shared plugin package (single source of truth)
- `p95` latency in rolling stats for tail latency detection
- Median latency in tray tooltip and pill tooltip for robust connection quality insight
- Connection quality label (excellent/good/fair/poor) in pill tooltip and tray tooltip
- Colored circle emojis for connection quality in tray tooltip
- Connection uptime shown in idle pill after 1 minute
- Active agents/tools count in context menu status line
- `instanceId` exposed in `GatewayClient.getStatus()` and debug info
- `firstConnectedAt` tracking for connection reliability analysis
- `sessionAttemptCount` tracking for connection reliability metrics
- Connection uptime percentage in debug info for flaky connection diagnosis
- Last message gap shown in tray tooltip when ≥5s (stale connection diagnosis)
- `lastMessageAt` exposed in `GatewayClient` getter and debug info
- Plugin uptime shown in tray tooltip
- Target URL shown in canvas tooltip when disconnected
- Plugin version shown in tray tooltip for diagnostics parity
- Plugin reset method shown alongside state method in debug info
- `npx`, `pnpx`, `bunx` error prefix stripping
- `ruby`, `php`, `perl`, `elixir`, `mix`, `bundle`, `gem` error prefix stripping
- `swift`, `dotnet` error prefix stripping
- Python ecosystem error prefix stripping (`pip3`, `uv`, `uvx`, `poetry`, `pdm`, `rye`, `hatch`, `conda`, `mamba`, `pixi`)
- `deno`, `rpc`, `grpc` error prefix stripping
- Keyboard focus styles and tabindex on canvas element (a11y)
- Keyboard navigation for canvas element (Enter/Space opens context menu)
- Focus restoration to trigger element when context menu is dismissed (WAI-ARIA)
- `user-select: none` on context menu to prevent text selection during mouse drags
- Effective mode exposed as `data-mode` attribute on `<body>` for CSS/automation targeting
- `currentTool` added to declarative plugin-sync props with `allowEmpty` support
- `isValidOpacity`, `isValidPadding` helpers in `get-position` module
- `VALID_SIZES` array and `isValidSize` helper in `size-presets` module
- `isValidAlignment` helper exported from `get-position` module
- `BigInt` support in `summarizeToolResultMessage` (prevents `JSON.stringify` throws)
- `parseCliArg` extracted into shared CJS module with tests
- `MODE_EMOJI` extracted into shared CJS module (deduplicated renderer + tray-icon)
- `FPS counter` extracted into testable `fps-counter.js` module
- `GatewayClient` unit and integration tests
- Comprehensive `plugin-sync` unit tests

### Fixed
- Pill label now shows duration and tool count in tool mode even without a tool name
- Six unused imports removed from renderer.js (successRate, MODE_EMOJI, formatDuration, formatElapsed, formatCount, formatLatency)
- Auto-reconnect stopped on fatal WebSocket close codes (auth failed, forbidden, protocol errors)
- Preload prioritizes app-specific env vars (`MOLT_MASCOT_*`) over generic (`GATEWAY_*`) for protocol negotiation
- `parseModeUpdate` validates mode against canonical VALID_MODES Set
- `connectionQualityEmoji` returns grey circle (⚪) for unknown quality instead of empty string
- Uppercase `WS://` and `WSS://` schemes normalized to lowercase in `normalizeWsUrl`
- Duplicate object keys removed from renderer state snapshot (`firstConnectedAt`, `sessionAttemptCount`)
- `connectionSuccessRate` passed to debug info builder
- `instanceId` passed to `buildDebugInfo` for diagnostics
- `pluginStartedAt` wired from renderer to tray tooltip
- `latencyStats` wired from renderer to tray tooltip
- Dead `gwClient` reference removed from tooltip `targetUrl`
- Pill color preserved during transient feedback (opacity scroll, etc.)
- Leftover `console.log` removed from reset IPC handler
- CLI `--align`, `--size`, `--opacity`, `--padding` validated with warnings on invalid values
- Blinking suppressed when `reducedMotion` is active
- FPS counter reset on visibility resume to avoid stale readings
- Rate-limit guards cleared in `refreshPluginState` to prevent silent drops
- Explicit type check for `connectedSince` instead of truthy coercion in tooltip
- Duplicate `pollingPaused` field removed from `GatewayClient.getStatus()`
- Timer leak prevention with `afterEach` cleanup in gateway-client tests
- Sprite cache JSDoc type annotation corrected
- `coerceSize` and `coerceAlignment` made case-insensitive with whitespace trimming
- `--min-protocol` and `--max-protocol` CLI flags validated

### Changed
- `isValidMode`, `isValidAlignment`, `isValidSize` use Set for O(1) lookups instead of Array.includes()
- `status-cli` uses `isValidSize()` for O(1) Set lookup instead of linear scan
- Renderer delegates `currentHealthStatus()` computation to shared `computeHealthStatus()` function (DRY)
- Latency stats delegated from `GatewayClient` to shared `latency-tracker` module
- `GatewayClient.toString()` includes close detail and reconnect count when disconnected
- Sprite cache warmed on init and resize to eliminate first-frame fillRect overhead
- Bob animation magic numbers extracted into named constants (`BOB_PERIOD_MS`, `BOB_AMPLITUDE_PX`)
- Shadow geometry magic numbers extracted into named constants (`SHADOW_*`)
- `coerceOpacity` and `coercePadding` extracted as standalone utilities
- `VALID_ALIGNMENTS` delegated to plugin package (single source of truth)
- Gateway client handshake failure cleanup deduplicated via `_cleanup()`
- `currentTool` sync delegated to `plugin-sync` `onCurrentTool` callback
- Size presets extracted into shared `size-presets.cjs` module
- CLI `--size` validated early with other appearance flags
- `isValidOpacity`/`isValidPadding` used in electron-main for consistent validation
- Unused `'s'` (shadow) palette entry removed from sprites
- Latency stats cached between accesses for performance (both gateway-client and renderer)

## [0.2.0] - 2026-02-20

### Added
- `MOLT_MASCOT_REDUCED_MOTION` env var to force reduced motion without changing OS preferences (useful for CI, headless, embedded deployments)
- Scroll-to-dismiss for context menu (scrolling outside the menu closes it, matching macOS native behavior)
- `tiny` size preset (120×100) for minimal screen footprint
- `--min-protocol` and `--max-protocol` CLI flags for Gateway protocol version negotiation
- Active agents/tools count in pill tooltip and debug info
- Context menu fade-in animation with `prefers-reduced-motion` support
- `MOLT_MASCOT_SIZE` env var for size preset (parity with `MOLT_MASCOT_ALIGN`)
- `pluginResetMethod` in `GatewayClient.getStatus()` snapshot
- `--list-prefs` and `--no-tray` CLI flags
- Platform-aware modifier keys in `--help` output (`Option` on macOS, `Alt` on others)
- Multi-line WebSocket close reason collapsing in `formatCloseDetail`
- `--reset-prefs` flag to clear saved preferences
- `--align`, `--size`, `--opacity`, `--padding` CLI flags for appearance customization
- Mode emoji in context menu status line
- Transient "Reset ✓" feedback in pill on state reset
- `--debug` flag to auto-open DevTools on launch
- `workerd` error prefix stripping
- `GatewayClient.getStatus()` for debug snapshots
- Target URL in tray tooltip when disconnected
- CPU arch in debug info Platform line
- `--gateway` and `--token` CLI flags
- Transient feedback on ghost mode double-click toggle
- Success rate percentage in tray tooltip tool stats
- `--help` flag with env vars, shortcuts, and mouse interactions reference
- `activeAgents` and `activeTools` in plugin state response
- Close reason and reconnect attempt in tray tooltip
- Sleeping status dot and tooltip when idle exceeds sleep threshold
- Tool call stats in tray tooltip via `mode-update` IPC
- `--version` / `-v` flag
- Reconnect count in tray tooltip for flappy connection diagnostics
- Animated error overlay (pulsing exclamation mark)
- RPM build target for Fedora/RHEL
- `lastDisconnectedAt` in renderer state snapshot
- Process uptime in tray tooltip
- `podman`, `helm`, `wrangler`, `miniflare` error prefix stripping
- Animated tool overlay (2-frame gear rotation)
- Middle-click on pill to toggle hide-text mode
- Middle-click on lobster to force reconnect
- `formatLatency` shared CJS module (single source of truth for tray + renderer)
- Plugin state polling pause/resume for window visibility
- Stale connection detection and auto-reconnect
- Declarative plugin sync system (`plugin-sync.js`)
- Extracted `GatewayClient` class with reconnect backoff, plugin method probing
- Extracted `debug-info.js`, `context-menu.js`, `draw.js`, `sprites.js`
- Sprite caching via `OffscreenCanvas` for performance
- Size presets: small, medium, large, xlarge
- Configurable alignment (9 positions), padding, opacity
- Ghost mode (click-through) with double-click toggle
- Pixel-art tray icon with status dot (idle/thinking/tool/error)
- Keyboard shortcuts for all toggles
- Context menu with a11y (keyboard nav, ARIA roles, type-ahead)
- Blink animation with `prefers-reduced-motion` support

### Fixed
- `formatCloseDetail` now collapses multi-line close reasons
- Tool mode frame rate increased to 66ms for smoother 2-frame animation
- Socket closed on connect-frame send failure to trigger immediate reconnect
- Immediate plugin state refresh after reset (eliminates 1s UI stale window)
- `pill--connecting` class used for reconnect transient feedback

### Changed
- IPC `mode-update` replaced positional args with named object
- Tray menu rebuilds debounced to reduce redundant `Menu.buildFromTemplate` calls
- Regex constants hoisted out of `cleanErrorString` loop for performance
