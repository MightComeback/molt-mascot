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
    str = str.replace(/^([a-zA-Z0-9_]*Error|Tool failed|Command failed|Exception|Warning|Alert|Fatal|panic|info|debug|trace|warn|TypeError|ReferenceError|SyntaxError|EvalError|RangeError|URIError|AggregateError|TimeoutError|SystemError|AssertionError|AbortError|CancellationError|node:|fs:|process:|internal:|commonjs:|bun:|sh:|bash:|zsh:|git:|curl:|wget:|npm:|pnpm:|yarn:|hakky:|hakky-tools:|clawd:|clawdbot:|rpc:|grpc:|deno:|docker:|kubectl:|terraform:|ansible:|make:|cmake:|gradle:|mvn:|ffmpeg:|python:|python3:|go:|rustc:|cargo:|browser:|playwright:|chrome:|firefox:|safari:|cron:|nodes:|uncaughtException|Uncaught|GitError|GraphQLError|ProtocolError|IPCError|RuntimeError|BrowserError|CanvasError|ExecError|SpawnError|ShellError|NetworkError|BroadcastError|PermissionError|SecurityError|AuthError|ForbiddenError|EvaluationError|GatewayError|FetchError|ClawdError|AgentSkillError|PluginError|RpcError|MoltError|MoltMascotError|AnthropicError|OpenAIError|OllamaError|DeepSeekError|GoogleGenerativeAIError|GaxiosError|AxiosError|ProviderError|PerplexityError|SonarError|BraveError|BunError|RateLimitError|ValidationError|ZodError|LinearError|GitHubError|TelegramError|DiscordError|SlackError|SignalError|WhatsAppError|BlueBubblesError|BirdError|ClawdHubError|GeminiError|GogError|NotionError|PeekabooError|SummarizeError|VideoFramesError|SkillCreatorError|CodingAgentError|WeatherError|McpError|WebSocketError|SocketError|CronError|ConnectionError|RequestError|ResponseError|DatabaseError|SqlError|PrismaError|MongoError|RedisError|ValueError|KeyError|IndexError|AttributeError|NameError|ImportError|ModuleNotFoundError)(\s*:\s*|\s+)/i, "").trim();
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
    // We look for common error prefixes (case-insensitive).
    const errorLine = lines.find(l => /^(error|fatal|panic|exception|traceback|failed|denied|rejected)/i.test(l));
    if (errorLine && errorLine !== lines[0]) {
      return cleanErrorString(errorLine);
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
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
}

export function isTruthyEnv(v) {
  if (typeof v !== 'string') {
    if (typeof v === 'number') return Number.isFinite(v) && v > 0;
    if (typeof v === 'boolean') return v;
    return false;
  }
  const s = v.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 't' || s === 'yes' || s === 'y' || s === 'on';
}
