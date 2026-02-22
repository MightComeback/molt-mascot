# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.2.x   | ✅ Current release |
| < 0.2   | ❌ No patches      |

## Reporting a Vulnerability

If you discover a security vulnerability, **please do not open a public issue.**

Instead, report it privately:

1. **Email:** [kuznetsovivan496@gmail.com](mailto:kuznetsovivan496@gmail.com)
2. **Subject:** `[SECURITY] molt-mascot: <brief description>`

Include:
- Steps to reproduce
- Affected component (Electron main, renderer, plugin, preload)
- Impact assessment (data leak, RCE, privilege escalation, etc.)

You should receive an acknowledgment within **48 hours**. We aim to release a fix within **7 days** for critical issues.

## Scope

The following are in scope:

- **Electron security** — CSP bypasses, context isolation breaks, preload script leaks
- **WebSocket protocol** — auth token exposure, injection via crafted Gateway messages
- **Plugin execution** — arbitrary code execution via malicious plugin state payloads
- **IPC channel abuse** — renderer → main process privilege escalation
- **Dependency vulnerabilities** — in direct dependencies (Electron, electron-builder)

Out of scope:

- Vulnerabilities in the OpenClaw Gateway itself (report upstream)
- Social engineering or phishing
- Denial of service via local WebSocket flooding (requires local access)

## Security Design

- **Context isolation** is enforced (`contextIsolation: true`); the renderer has no direct access to Node.js APIs.
- **Content Security Policy** restricts scripts to `'self'` and connections to `ws:`/`wss:` only.
- **IPC whitelist** — only explicitly bridged methods are exposed via `contextBridge`.
- **URL validation** — `open-external` IPC only allows `https://` URLs to prevent shell injection.
- **No remote content** — the app loads only local HTML/JS; no third-party resources.
