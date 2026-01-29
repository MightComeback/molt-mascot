# molt-mascot

A tiny always-on-top desktop mascot (pixel lobster) that reflects your local **Clawdbot** Gateway state: `idle` / `thinking` / `tool` / `error`.

## Screenshots

![idle](assets/screenshots/idle.png)
![thinking](assets/screenshots/thinking.png)
![tool](assets/screenshots/tool.png)
![error](assets/screenshots/error.png)

## Quickstart

```bash
bun install

# optional, if your gateway requires token auth:
export GATEWAY_URL=ws://127.0.0.1:18789
export GATEWAY_TOKEN=...

bun run mascot
```

## Dev tools

Dump raw Gateway frames:

```bash
GATEWAY_URL=ws://127.0.0.1:18789 GATEWAY_TOKEN=... bun run ws:dump --once
```

Regenerate screenshots:

```bash
bun run screenshots
```

## Plugin (optional)

There’s a small Clawdbot plugin included (`packages/molt-mascot-plugin`) that exposes a simplified RPC method.

Recommended (follows `pluginId.action`):
- `molt-mascot.state` → `{ ok: true, state: { mode, since, lastError? } }`

Back-compat alias:
- `moltMascot.state` → same payload

Config lives under:
- `plugins.entries.molt-mascot.config` (and `...enabled: true`)

(Loading plugins requires a Clawdbot config change + gateway restart; do it when you’re awake.)
