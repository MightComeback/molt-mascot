# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- `formatCountWithLabel` helper in plugin for compact "N item(s)" display
- `formatRate` utility for compact per-second rate display (e.g. "1.2K/s")
- `formatBoolToggle` utility for human-readable boolean display ("on"/"off")
- `parseDuration` utility — inverse of `formatDuration` for human-readable duration parsing
- `formatConnectionReliability` helper for DRY reliability display in diagnostics
- `formatPingSummary` helper with p95/p99 percentiles for ws-dump output
- `formatLatencyWithQuality` helper to DRY up repeated latency+emoji pattern
- `formatLatencyTrendArrow` helper to DRY up repeated rising/falling ternaries
- `formatReconnectCount` helper to DRY up repeated ↻N reconnect formatting
- `coerceMode` for case-insensitive mode string coercion (parity with `coerceSize`, `coerceAlignment`)
- `coercePositive` helper for strictly positive number coercion (rejects zero)
- `isValidMode` validator on plugin (parity with `isValidAlignment`, `isValidSize`)
- `isValidAlignment` and `isValidSize` validators on plugin
- `isValidOpacity` and `isValidPadding` numeric range validators on plugin
- `isValidCloseCode` validator for WebSocket close code range checking
- `isValidWsReadyState` validator for WebSocket readyState validation
- `isValidOverlayMode` validator for overlay mode strings
- `isValidStatusDotMode` validator for tray status dot modes
- `isValidConnectionQuality` validator for connection quality labels
- `isValidPrefKey` validator for O(1) preference key validation
- `isContentTool` validator for content-type tool detection
- `OVERLAY_KEYS` constant and `isValidOverlay` validator on sprites module
- `VALID_OVERLAY_MODES` constant on draw module
- `VALID_WS_READY_STATES` constant on utils module
- `VALID_STATUS_DOT_MODES` constant on tray-icon module
- `VALID_CONNECTION_QUALITIES` constant on format-latency module
- `CLOSE_REASON_MAX_LEN` constant for formatCloseDetail truncation limit
- `maskSensitiveUrl` utility — redacts token/key/secret query params and userinfo credentials
- `pluralize` utility for correct singular/plural noun inflection
- `formatPercent` utility for compact percentage display
- `Alignment` type alias replacing verbose `NonNullable<PluginConfig["alignment"]>`
- `diffPrefs` and `formatPrefsDiff` for preference change tracking
- `allowedModes` frozen array on plugin (parity with `allowedSizes`, `allowedAlignments`)
- `gatewayToken` in `PREF_SCHEMA` for validated token persistence
- `percentile(p)` method on latency tracker for arbitrary percentile queries
- FPS trend in debug info diagnostics when degrading
- Plugin uptime in `formatModeUpdate` diagnostic output
- `lastResetAt` in `formatModeUpdate` diagnostic output
- Buffer fullness indicator in `toString()` for latency tracker and fps counter
- Connection success rate in canvas tooltip when below 100%
- Connection success rate as standalone tray line when below 100%
- Database/ORM CLI error prefixes (psql, mysql, sqlite3, mongosh, redis-cli, prisma, drizzle, knex, sequelize, typeorm)
- Test runner error prefixes (vitest, jest, mocha, pytest, rspec, ava, tap)
- Unix coreutils/network CLI error prefixes (ssh, scp, rsync, tar, grep, mkdir, rm, cp, chmod, find)
- Node.js version/package manager error prefixes (corepack, volta, fnm, proto)
- `actions.` and `computer.` prefix stripping in `sanitizeToolName` (MCP + Anthropic computer use)
- `Precondition failed` and `Assertion failed` to error prefix stripping (Swift/Rust runtime assertions)

### Changed
- Plugin: use Set lookups in `coerceMode`/`coerceSize`/`coerceAlignment` instead of `Array.includes` (perf)
- Plugin: deduplicate formatting utils — `index.ts` re-exports from `format.ts` (single source of truth)
- Re-export `formatRate`, `parseDuration`, `formatPercent` from plugin for renderer parity
- Use `pluralize()` from plugin instead of inline ternaries in tray-icon and utils
- Use canonical `isValidOpacity()` instead of inline checks in electron-main
- Use canonical `isValidPadding()` instead of inline checks in prefs and plugin-sync
- Use `parseEnvNumber()` instead of inline `Number(env)` in electron-main
- Use `isActivateKey` helper instead of inline Enter/Space check in context-menu
- Extract `isPrintableKey`, nav/home/end/tab key helpers from context-menu inline checks
- Extract `isEscapeKey` helper to DRY up inline Escape checks
- Extract `coercePositive` helper from renderer inline `_coercePositive`
- Extract `uptimeSuffix` helper to deduplicate idle/sleeping uptime logic in pill-label
- Extract inline env coercion into reusable helpers in renderer
- Extract `SLEEP_INTERVAL` and `SLEEP_INTERVAL_REDUCED` constants for sleeping frame rates
- Extract `CONNECTED_IDLE_DELAY_MS`, `TRANSIENT_FEEDBACK_MS`, `DEFAULT_WS_URL`, `RESIZE_DEBOUNCE_MS`, `TOOL_BOUNCE_DELAY_MS` constants from renderer inline magic numbers
- Extract `PLUGIN_STATE_THROTTLE_MS` constant from gateway-client inline magic 150
- Use `PILL_MAX_ERROR_LEN` instead of inline magic 48 in renderer
- Use `formatReconnectCount()` in tooltip instead of rebuilding reconnect string
- Extract `computeShadowParams` as pure testable function from draw module
- Memory pressure thresholds extracted as named constants
- Consolidate reduced-motion CSS rules with `:is()` selector
- Style Save button as primary action with blue accent in setup form

### Fixed
- `opts.now` added to `formatModeUpdate` for deterministic testability
- Unused variables removed from `parseDuration` (lint warnings)
- Unused imports removed from debug-info (connectionQuality, connectionQualityEmoji, resolveQualitySource)
- Eye blink coordinates corrected to match actual sprite eye pixels
- Context menu `transform-origin` set based on clamped position for correct animation direction
- Missing `gatewayToken` added to shell completion pref lists
- Missing `copyStatus` bridge exposed in preload for renderer parity
- `nodeIntegration: false` explicitly set in BrowserWindow webPreferences

### Hardened
- Freeze `WS_CLOSE_CODE_LABELS` to match codebase immutability convention
- Freeze `TRAY_SPRITE`, `TRAY_COLORS`, and `STATUS_DOT_COLORS` constants
- Freeze exported `allowedModes`, `allowedAlignments`, `allowedSizes` arrays on plugin
- Clamp `getReconnectDelayMs` inputs (`baseMs`, `maxMs`, `jitterFraction`, `attempt`) to sane ranges
- Clamp latency tracker `maxSamples` to `[2, ∞)` to prevent modulo-zero NaN
- Clamp FPS counter `bufferSize` to `[2, ∞)` and `windowMs` to `[1, ∞)`
- Clamp shadow ellipse radii to prevent negative values in draw module
- Clamp shadow alpha to `[MIN_ALPHA, 1]` to prevent >1 opacity on extreme negative bob
- Cap `isValidPadding` at `MAX_PADDING` (1000px) to reject absurd values
- CSP: extract inline styles to renderer.css, upgrade `style-src` to `'self'`
- CSP: add explicit `script-src`, `img-src`, `object-src`, `frame-src`, `base-uri`, `form-action`, `font-src`, `media-src`, `worker-src` directives

### Developer Experience
- `commit-msg` git hook for conventional commit validation
- `pre-commit` hook for staged format check
- `clean` script and auto-install git hooks on `postinstall`
- `keyboard-utils.js` and `renderer.css` added to architecture tree in CONTRIBUTING.md
- List all 12 accepted commit types and document breaking change syntax in CONTRIBUTING.md

### Documentation
- Add `--completions` flag to CLI reference in README
- Add missing connection timing CLI flags to CLI reference
- Add claw accent color to TRAY_SPRITE legend comment
- Add missing entries for recent commits in changelog (multiple consolidation passes)

## [0.2.1] - 2026-02-25

### Added
- Connection success rate in context menu status line — shown when below 100% for reliability diagnostics (parity with tray tooltip and debug info)
- Multi-character type-ahead keyboard navigation in context menu — typing "fo" jumps to "Force Reconnect" past other items (matches native OS menu behavior with 500ms reset timeout)
- Windows High Contrast Mode support for pill, context menu, and setup form — ensures visibility when OS forces high-contrast colors
- `commit-msg` git hook — validates conventional commit format (`type(scope): message`) before allowing commits; accepts merge/revert commits; auto-installed via `bun run setup:hooks`
- `--version --json` CLI flag combination — outputs structured version info (app, plugin, Electron, Chrome, Node, platform, arch) as JSON for scripting and CI pipelines
- Fish shell completions (`tools/completions.fish`) — tab-complete all CLI flags with value suggestions for `--align`, `--size`, and directory completion for `--capture-dir`
- Shell completions for Bash and Zsh (`tools/completions.bash`, `tools/completions.zsh`) — tab-complete all CLI flags with value suggestions for `--align`, `--size`, and directory completion for `--capture-dir`
- `--get-pref key` CLI flag — query a single preference value with source indicator (saved vs default); supports `--json` for scripting
- `--set-pref key=value` CLI flag — set individual preferences from the command line with schema validation (e.g. `molt-mascot --set-pref alignment=top-left`)
- `--unset-pref key` CLI flag — remove a single preference to revert it to the default (e.g. `molt-mascot --unset-pref opacity`)
- `reducedMotion` plugin config key — sync reduced-motion preference from Gateway config (parity with `clickThrough`, `hideText`, and other UX toggles)
- `--help-prefs --json` CLI flag — prints preference schema as machine-readable JSON for tooling, autocomplete engines, and CI config validation
- `--help-prefs` CLI flag — prints all available preference keys with types and descriptions (surfaces existing `PREF_SCHEMA` metadata for discoverability)
- "Reduced Motion" toggle in context menu — accessibility setting no longer requires env var or manual preference editing
- `Cmd/Ctrl+Shift+N` keyboard shortcut for toggling reduced motion (parity with ghost mode and hide text shortcuts)
- Directional arrow indicators in alignment display across tray tooltip, context menu, and debug info (e.g. "↘ bottom-right", "↖ top-left")
- `allTimeMin` / `allTimeMax` on latency tracker — extremes that survive ring-buffer eviction for "best/worst ever" diagnostics
- `allTimeLatency` getter on `GatewayClient` — surfaces all-time latency extremes in debug info (shown only when they differ from rolling stats)
- `VALID_PREF_KEYS` frozen array exported from prefs module for tooling and introspection
- `description` metadata on `PREF_SCHEMA` entries and `formatPrefSchema()` helper for human-readable preference documentation
- Sprite cache diagnostics (entries + hit rate) in debug info
- `SYNC_PROPS` and `SYNC_PROP_NAMES` exports on plugin-sync for introspection
- `connectionUptimePct` in parse-mode-update IPC payload and pill tooltip (surfaces flappy connections)
- Latency stats `median`/`p95` in parse-mode-update diagnostic one-liner
- Configurable plugin state poll interval via `MOLT_MASCOT_POLL_INTERVAL_MS` env var (default: 1000ms) — tune polling frequency for low-power setups or high-refresh diagnostics
- `ws-dump --health` output now includes an ISO-8601 `timestamp` field for log correlation and automated monitoring pipelines
- Configurable connection timing via env vars: `MOLT_MASCOT_RECONNECT_BASE_MS`, `MOLT_MASCOT_RECONNECT_MAX_MS`, `MOLT_MASCOT_STALE_CONNECTION_MS`, `MOLT_MASCOT_STALE_CHECK_INTERVAL_MS` — tune reconnect backoff and stale connection detection for unreliable networks
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

### Changed
- Plain `--version` output now includes plugin version, Electron version, and platform/arch (e.g. `molt-mascot 1.0.0 · plugin 1.0.0 · Electron 30.0.0 · darwin arm64`) — previously only showed `molt-mascot VERSION`; structured `--version --json` was already comprehensive
- Extracted `computeShadowParams` from `drawLobster` as a pure testable function for shadow ellipse geometry
- Explicitly set `nodeIntegration: false` in BrowserWindow webPreferences for defense-in-depth (was already the Electron default, now explicit for auditability)
- Hoisted `capitalize` utility to shared `@molt/mascot-plugin` package (single source of truth; previously duplicated in renderer utils)
- Renderer uses preloaded `processStartedAt` from preload bridge instead of recomputing from `process.uptime()` (eliminates drift between main/renderer clocks)
- Pill tooltip alignment now uses directional arrow indicators (parity with tray tooltip, context menu, and debug info — e.g. "↘ bottom-right")
- `ws-dump --state --compact` now prints a human-readable summary line (mode, latency, quality, active agents/tools, uptime) instead of single-line JSON — parity with `--watch --compact` for quick CLI checks
- `ws-dump --state` output now includes `quality` and `healthStatus` fields when latency is measured — parity with `--health` output for quick diagnostics without a separate health check
- `ws-dump --watch --compact` now prints a human-readable summary line per state change (mode, latency, quality, active agents/tools, uptime) instead of raw JSON — much easier for at-a-glance monitoring
- `ws-dump --watch --compact` summary now includes cumulative agent session count (e.g. "12 sessions") for activity insight parity with tray tooltip and debug info
- `ws-dump --watch --compact` now measures and includes round-trip poll latency in the summary line (connection quality at a glance without `--ping`)
- `size` preference persisted by label (e.g. `"small"`) alongside numeric `sizeIndex` — robust against preset reordering; label takes priority on load
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

### Fixed
- Exposed `copyStatus` IPC bridge in preload — `molt-mascot:copy-status` was handled in electron-main (global shortcut ⌘⇧P, tray menu) but unreachable from renderer context menu; now uses main-process clipboard API (parity with `copyDebugInfo`)
- Corrected eye blink coordinates to match actual sprite eye pixel positions
- Context menu `transform-origin` now based on clamped position for correct animation direction when opening near screen edges
- Biome formatter now excludes `dist/` directories — prevents formatting build artifacts and fixes utils formatting inconsistencies
- `--help` env vars section now documents fallback key chains for gateway URL and token (`GATEWAY_URL`, `OPENCLAW_GATEWAY_URL`, `CLAWDBOT_GATEWAY_URL` and their token equivalents) — previously only `MOLT_MASCOT_*` keys were shown, leaving users unaware of the legacy/shorthand alternatives
- Pill CSS animations (pulse, sleep breathing, connected pop, error shake) now freeze when reduced motion is enabled via the app toggle (`Cmd/Ctrl+Shift+N`), not just the OS `prefers-reduced-motion` setting — also suppresses context menu appear animation
- README now documents `MOLT_MASCOT_POLL_INTERVAL_MS` env var in the connection tuning section
- README now lists `size` as a supported plugin config key (was implemented but undocumented)
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

### Performance
- Added `will-change` CSS hints to animated pill states for GPU compositing

### Security
- Added explicit `img-src 'self'` CSP directive — previously fell back to `default-src 'self'` implicitly; now explicit for auditability (parity with `font-src`, `media-src`, `worker-src` directives)

### Documentation
- Added missing connection timing CLI flags to README (`--poll-interval`, `--reconnect-base`, `--reconnect-max`, `--stale-connection`, `--stale-check-interval`) — flags were implemented in `--help` and shell completions but absent from the README CLI reference

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
