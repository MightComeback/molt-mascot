# @molt/molt-mascot-plugin

> Clawdbot plugin for [Molt Mascot](https://github.com/MightComeback/molt-mascot).

This plugin exposes the Clawdbot agent's state (`idle`, `thinking`, `tool`, `error`) via the Gateway, allowing the Molt Mascot desktop app to reflect what the agent is doing in real-time.

## Installation

```bash
clawdhub install @molt/molt-mascot-plugin
```

## Configuration

In your `clawdbot.config.json` or `.env`:

- `idleDelayMs` (default: 800): Time to wait before switching back to idle.
- `errorHoldMs` (default: 5000): Duration to display error states.

## Usage

The plugin automatically registers `molt-mascot.state` on the Gateway. No manual setup required beyond installation.
