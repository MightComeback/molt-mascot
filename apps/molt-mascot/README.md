# Molt Mascot (App)

A tiny, always-on-top desktop mascot (pixel lobster) that reflects your local Clawdbot Gateway state.

## Setup

1. **Get your Gateway Token:**
   Run the following command to see your gateway connection details:
   ```bash
   clawdbot gateway status
   ```
   Look for the `token` in the output.

2. **Install Dependencies:**
   ```bash
   bun install
   ```

## Usage

Start the app:

```bash
bun start
# or
bun dev
```

The mascot will appear in the bottom-right corner of your primary display.

## Controls

- **Toggle Click-Through:** `Cmd+Shift+M` (or `Ctrl+Shift+M`)
  - When enabled, clicks pass through the mascot to the window below.
  - When disabled, you can drag the mascot to move it.

## Capture

Generate screenshots for assets:

```bash
bun run capture
```

Output location: `../../assets/screenshots/`
