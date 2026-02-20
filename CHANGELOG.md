# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
