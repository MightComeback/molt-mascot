/**
 * Shared utility functions for Molt Mascot renderer.
 * Extracted for testability and reuse.
 */

export function coerceDelayMs(v, fallback) {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function truncate(str, limit = 140) {
  // Collapse whitespace/newlines to single spaces for cleaner pill display
  const s = String(str).trim().replace(/\s+/g, ' ');
  const chars = [...s];
  if (limit <= 0) return "";
  if (chars.length <= limit) return s;
  // If limit is too small to fit ellipsis, just truncate hard
  if (limit <= 1) return chars.slice(0, limit).join("");

  // Basic truncate (leave room for 1 char ellipsis)
  let cut = chars.slice(0, limit - 1).join("");
  // Try to cut at space if reasonably close (last 20 chars) to avoid chopping words
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > -1 && cut.length - lastSpace < 20) {
    cut = cut.slice(0, lastSpace);
  }

  return cut + "…";
}

/**
 * Common error prefixes to strip for cleaner display.
 * Organized by category for maintainability (mirrors the plugin's ERROR_PREFIXES).
 */
const ERROR_PREFIXES = [
  // Generic patterns
  "[a-zA-Z0-9_]*Error", "Tool failed", "Command failed", "Exception",
  "Warning", "Alert", "Fatal", "panic", "uncaughtException", "Uncaught",
  // Log-level prefixes
  "info", "debug", "trace", "warn",
  // JavaScript/TypeScript built-in errors
  "TypeError", "ReferenceError", "SyntaxError", "EvalError", "RangeError",
  "URIError", "AggregateError",
  // Runtime/System errors
  "TimeoutError", "SystemError", "AssertionError", "AbortError", "CancellationError",
  // Environment/Tool prefixes
  "node:", "fs:", "process:", "internal:", "commonjs:", "bun:",
  "sh:", "bash:", "zsh:",
  // CLI tools
  "git:", "curl:", "wget:", "npm:", "pnpm:", "yarn:",
  "hakky:", "hakky-tools:", "clawd:", "clawdbot:", "openclaw:",
  // Protocol/API prefixes
  "rpc:", "grpc:", "deno:",
  // Infrastructure tools
  "docker:", "kubectl:", "terraform:", "ansible:",
  "make:", "cmake:", "gradle:", "mvn:",
  // Media/Processing tools
  "ffmpeg:", "python:", "python3:", "go:", "rustc:", "cargo:",
  // Browser automation
  "browser:", "playwright:", "chrome:", "firefox:", "safari:",
  // OpenClaw specific
  "cron:", "nodes:",
  // Domain-specific errors
  "GitError", "GraphQLError", "ProtocolError", "IPCError", "RuntimeError",
  "BrowserError", "CanvasError", "ExecError", "SpawnError", "ShellError",
  "NetworkError", "BroadcastError", "PermissionError", "SecurityError",
  "AuthError", "ForbiddenError", "EvaluationError", "GatewayError",
  "FetchError", "ClawdError", "OpenClawError", "AgentSkillError",
  "PluginError", "RpcError", "MoltError", "MoltMascotError",
  // AI Provider errors
  "AnthropicError", "OpenAIError", "OllamaError", "DeepSeekError",
  "GoogleGenerativeAIError", "GaxiosError", "AxiosError", "ProviderError",
  // Service errors
  "PerplexityError", "SonarError", "BraveError", "BunError",
  "RateLimitError", "ValidationError", "ZodError",
  // Integration errors
  "LinearError", "GitHubError", "TelegramError", "DiscordError",
  "SlackError", "SignalError", "WhatsAppError", "BlueBubblesError",
  "BirdError", "ClawdHubError", "GeminiError", "GogError", "NotionError",
  "PeekabooError", "SummarizeError", "VideoFramesError",
  "SkillCreatorError", "CodingAgentError", "WeatherError", "McpError",
  // Network/IO errors
  "WebSocketError", "SocketError", "CronError", "ConnectionError",
  "RequestError", "ResponseError",
  // Database errors
  "DatabaseError", "SqlError", "PrismaError", "MongoError", "RedisError",
  // Python-style errors
  "ValueError", "KeyError", "IndexError", "AttributeError",
  "NameError", "ImportError", "ModuleNotFoundError",
];

/** Build the error prefix regex once for performance. */
const ERROR_PREFIX_REGEX = new RegExp(
  `^(?:${ERROR_PREFIXES.join("|")})(\\s*:\\s*|\\s+)`,
  "i"
);

export function cleanErrorString(s) {
  // Performance guard: truncate huge outputs before regex processing
  if (String(s).length > 4096) s = String(s).slice(0, 4096);

  // Strip ANSI escape codes (colors, cursor moves, etc)
  /* eslint-disable no-control-regex */
  let str = String(s)
    // CSI sequences: ESC [ parameters intermediates final-byte
    // (final byte is in the range @-~; not just letters)
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    // OSC sequences: ESC ] ... BEL  OR  ESC ] ... ESC \\
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "")
    .trim();
  /* eslint-enable no-control-regex */
  let prev = "";
  while (str !== prev) {
    prev = str;
    str = str.replace(ERROR_PREFIX_REGEX, "").trim();
  }
  const lines = str.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  
  // UX Improvement: If we have multiple lines, scan for the most relevant error line.
  // This extracts "Error: Failed" from logs that might start with "info: starting..."
  if (lines.length > 1) {
    // If first line is a generic exit code, always look deeper
    if (/^Command (exited|failed) with (exit )?code \d+(?:\b|:)/i.test(lines[0])) {
      return cleanErrorString(lines[1]);
    }
    
    // Check if any line (other than the first) looks like a strong error signal.
    // Prefer concrete failure lines over generic traceback headers.
    const concreteErrorLine = lines.find(
      (l) => /^(error|fatal|panic|exception|failed|denied|rejected|[a-zA-Z]+Error\b)/i.test(l)
    );
    if (concreteErrorLine && concreteErrorLine !== lines[0]) {
      return cleanErrorString(concreteErrorLine);
    }

    // Python tracebacks often put the useful error on the final line.
    const tracebackLine = lines.find((l) => /^traceback\b/i.test(l));
    if (tracebackLine && lines[lines.length - 1] !== tracebackLine) {
      return cleanErrorString(lines[lines.length - 1]);
    }
  }

  return lines[0] || str;
}

export function isMissingMethodResponse(msg) {
  const ok = msg?.ok;
  const payloadOk = msg?.payload?.ok;
  const err = msg?.payload?.error || msg?.error || null;
  const code = (err?.code || err?.name || '').toString().toLowerCase();
  const message = (err?.message || err || '').toString().toLowerCase();

  if (ok === true && payloadOk === true) return false;

  if (code.includes('method') && code.includes('not') && code.includes('found')) return true;
  if (message.includes('method not found')) return true;
  if (message.includes('unknown method')) return true;
  if (message.includes('unknown rpc method')) return true;

  return false;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH > 0 ? `${d}d ${remH}h` : `${d}d`;
}

// Re-export from shared CJS module so both electron-main and renderer use the same impl.
// Bun/esbuild handle CJS → ESM interop transparently.
export { isTruthyEnv } from './is-truthy-env.cjs';
