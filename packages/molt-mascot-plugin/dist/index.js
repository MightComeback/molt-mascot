"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  CONTENT_TOOLS: () => CONTENT_TOOLS,
  ERROR_PREFIXES: () => ERROR_PREFIXES,
  ERROR_PREFIX_REGEX: () => ERROR_PREFIX_REGEX,
  allowedAlignments: () => allowedAlignments,
  allowedModes: () => allowedModes,
  allowedSizes: () => allowedSizes,
  capitalize: () => capitalize,
  clamp: () => clamp,
  cleanErrorString: () => cleanErrorString,
  coerceAlignment: () => coerceAlignment,
  coerceBoolean: () => coerceBoolean,
  coerceMode: () => coerceMode,
  coerceNumber: () => coerceNumber,
  coerceOpacity: () => coerceOpacity,
  coercePadding: () => coercePadding,
  coerceSize: () => coerceSize,
  default: () => register,
  formatBoolToggle: () => formatBoolToggle,
  formatBytes: () => formatBytes,
  formatCount: () => formatCount,
  formatCountWithLabel: () => formatCountWithLabel,
  formatDuration: () => formatDuration,
  formatElapsed: () => formatElapsed,
  formatPercent: () => formatPercent,
  formatRate: () => formatRate,
  formatRelativeTime: () => formatRelativeTime,
  formatTimestamp: () => formatTimestamp,
  formatTimestampLocal: () => formatTimestampLocal,
  formatTimestampWithAge: () => formatTimestampWithAge,
  id: () => id,
  isContentTool: () => isContentTool,
  isValidAlignment: () => isValidAlignment,
  isValidMode: () => isValidMode,
  isValidOpacity: () => isValidOpacity,
  isValidPadding: () => isValidPadding,
  isValidSize: () => isValidSize,
  maskSensitiveUrl: () => maskSensitiveUrl,
  parseDuration: () => parseDuration,
  pluralize: () => pluralize,
  sanitizeToolName: () => sanitizeToolName,
  successRate: () => successRate,
  summarizeToolResultMessage: () => summarizeToolResultMessage,
  truncate: () => truncate,
  version: () => version
});
module.exports = __toCommonJS(index_exports);

// package.json
var package_default = {
  name: "@molt/mascot-plugin",
  version: "0.2.1",
  description: "OpenClaw plugin for Molt Mascot (pixel mascot)",
  publishConfig: {
    access: "public"
  },
  author: "Ivan Kuznetsov <kuznetsovivan496@gmail.com>",
  license: "MIT",
  homepage: "https://github.com/MightComeback/molt-mascot/tree/main/packages/molt-mascot-plugin#readme",
  repository: {
    type: "git",
    url: "https://github.com/MightComeback/molt-mascot.git",
    directory: "packages/molt-mascot-plugin"
  },
  bugs: {
    url: "https://github.com/MightComeback/molt-mascot/issues"
  },
  main: "dist/index.js",
  module: "dist/index.mjs",
  types: "dist/index.d.ts",
  exports: {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.mjs",
      require: "./dist/index.js"
    },
    "./package.json": "./package.json"
  },
  scripts: {
    build: "node tools/sync-plugin-manifest.mjs && tsup src/index.ts --format cjs,esm --dts",
    dev: "node tools/sync-plugin-manifest.mjs && tsup src/index.ts --watch",
    test: "bun test",
    typecheck: "tsc --noEmit",
    lint: "oxlint .",
    prepack: `node -e "try{require('fs').chmodSync('clawdbot.plugin.json',0o644)}catch(e){}" && bun run build`
  },
  engines: {
    bun: ">=1.1.0",
    node: ">=20.0.0"
  },
  keywords: [
    "clawdbot",
    "openclaw",
    "plugin",
    "mascot",
    "pixel-art",
    "ai",
    "agent"
  ],
  files: [
    "dist",
    "clawdbot.plugin.json",
    "README.md",
    "LICENSE"
  ],
  devDependencies: {
    tsup: "^8.0.0",
    typescript: "^5.0.0"
  }
};

// src/format.ts
function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(value, max));
}
function successRate(totalCalls, errorCount) {
  if (!totalCalls || totalCalls <= 0) return null;
  const errors = Math.max(0, Math.min(errorCount || 0, totalCalls));
  return Math.round((totalCalls - errors) / totalCalls * 100);
}
function formatPercent(value) {
  if (value == null || typeof value !== "number" || !Number.isFinite(value))
    return "\u2013";
  return `${Math.round(value)}%`;
}
function truncate(str, limit = 140) {
  if (limit <= 0) return "";
  const s = str.trim().replace(/\s+/g, " ");
  const chars = [...s];
  if (chars.length <= limit) return s;
  if (limit <= 1) return chars.slice(0, limit).join("");
  let cut = chars.slice(0, limit - 1).join("");
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > -1 && cut.length - lastSpace < 20) {
    cut = cut.slice(0, lastSpace);
  }
  return cut + "\u2026";
}
function formatCount(n) {
  if (!Number.isFinite(n) || n < 0) return "0";
  const rounded = Math.round(n);
  if (rounded < 1e3) return `${rounded}`;
  const units = ["K", "M", "B", "T"];
  let value = n;
  for (const unit of units) {
    value /= 1e3;
    if (value < 1e3 || unit === "T") {
      return `${value.toFixed(1)}${unit}`;
    }
  }
  return `${value.toFixed(1)}T`;
}
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  for (const unit of units) {
    value /= 1024;
    if (value < 1024 || unit === "TB") {
      return `${value.toFixed(1)} ${unit}`;
    }
  }
  return `${value.toFixed(1)} TB`;
}
function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "0s";
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
  if (d < 7) return remH > 0 ? `${d}d ${remH}h` : `${d}d`;
  const w = Math.floor(d / 7);
  const remD = d % 7;
  return remD > 0 ? `${w}w ${remD}d` : `${w}w`;
}
function formatElapsed(since, now) {
  if (typeof since !== "number" || typeof now !== "number" || !Number.isFinite(since) || !Number.isFinite(now)) {
    return "0s";
  }
  return formatDuration(Math.max(0, Math.round((now - since) / 1e3)));
}
function formatRelativeTime(since, now) {
  const n = now ?? Date.now();
  if (typeof since !== "number" || typeof n !== "number" || !Number.isFinite(since) || !Number.isFinite(n)) {
    return "just now";
  }
  const diffMs = Math.max(0, n - since);
  if (diffMs < 1e3) return "just now";
  return `${formatDuration(Math.round(diffMs / 1e3))} ago`;
}
function formatTimestamp(ts) {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "\u2013";
  return new Date(ts).toISOString();
}
function formatTimestampLocal(ts, now) {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "\u2013";
  const date = new Date(ts);
  const ref = new Date(now ?? Date.now());
  const sameDay = date.getFullYear() === ref.getFullYear() && date.getMonth() === ref.getMonth() && date.getDate() === ref.getDate();
  if (sameDay) {
    const h2 = String(date.getHours()).padStart(2, "0");
    const m2 = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");
    return `${h2}:${m2}:${s}`;
  }
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];
  const mon = MONTHS[date.getMonth()];
  const day = date.getDate();
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  if (date.getFullYear() !== ref.getFullYear()) {
    return `${mon} ${day} ${date.getFullYear()}, ${h}:${m}`;
  }
  return `${mon} ${day}, ${h}:${m}`;
}
function formatTimestampWithAge(ts, now, style = "ago") {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "\u2013";
  const n = now ?? Date.now();
  const iso = formatTimestamp(ts);
  if (style === "since") {
    return `${formatElapsed(ts, n)} (since ${iso})`;
  }
  return `${formatRelativeTime(ts, n)} (at ${iso})`;
}
function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural ?? singular + "s";
}
function formatBoolToggle(value, onLabel = "on", offLabel = "off") {
  return value ? onLabel : offLabel;
}
function formatRate(perSecond, unit) {
  if (!Number.isFinite(perSecond) || perSecond < 0)
    return unit ? `0 ${unit}/s` : "0/s";
  if (unit) {
    const UNITS = ["K", "M", "G", "T"];
    if (perSecond < 1e3) {
      const rounded = Math.round(perSecond);
      return `${rounded} ${unit}/s`;
    }
    let value = perSecond;
    for (const u of UNITS) {
      value /= 1e3;
      if (value < 1e3 || u === "T") {
        return `${value.toFixed(1)} ${u}${unit}/s`;
      }
    }
    return `${value.toFixed(1)} T${unit}/s`;
  }
  return `${formatCount(perSecond)}/s`;
}
function formatCountWithLabel(count, singular, plural) {
  return `${formatCount(count)} ${pluralize(count, singular, plural)}`;
}
function parseDuration(input) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }
  const UNITS = {
    w: 604800,
    d: 86400,
    h: 3600,
    m: 60,
    s: 1
  };
  let total = 0;
  let matched = false;
  const normalized = trimmed.replace(/\s+/g, "");
  let match;
  const groupPattern = /(\d+(?:\.\d+)?)([wdhms])/gi;
  let reconstructed = "";
  const seenUnits = /* @__PURE__ */ new Set();
  while ((match = groupPattern.exec(normalized)) !== null) {
    reconstructed += match[0];
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (!Number.isFinite(value) || value < 0) return null;
    if (seenUnits.has(unit)) return null;
    seenUnits.add(unit);
    total += value * UNITS[unit];
    matched = true;
  }
  if (!matched || reconstructed.toLowerCase() !== normalized.toLowerCase())
    return null;
  return Number.isFinite(total) && total >= 0 ? Math.round(total) : null;
}

// src/index.ts
var id = package_default.name;
var version = package_default.version;
function coerceNumber(v, fallback) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
function coerceBoolean(v, fallback) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
    if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  }
  return fallback;
}
var allowedModes = Object.freeze([
  "idle",
  "thinking",
  "tool",
  "error"
]);
function isValidMode(value) {
  return typeof value === "string" && _validModesSet.has(value);
}
var _validModesSet = new Set(allowedModes);
function coerceMode(v, fallback) {
  if (typeof v === "string") {
    const lower = v.trim().toLowerCase();
    if (_validModesSet.has(lower)) return lower;
  }
  return fallback;
}
var allowedAlignments = Object.freeze([
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "top-center",
  "bottom-center",
  "center-left",
  "center-right",
  "center"
]);
var _validAlignmentsSet = new Set(allowedAlignments);
function isValidAlignment(value) {
  return typeof value === "string" && _validAlignmentsSet.has(value);
}
var allowedSizes = Object.freeze([
  "tiny",
  "small",
  "medium",
  "large",
  "xlarge"
]);
var _validSizesSet = new Set(allowedSizes);
function isValidSize(value) {
  return typeof value === "string" && _validSizesSet.has(value);
}
function coerceSize(v, fallback) {
  if (typeof v === "string") {
    const lower = v.trim().toLowerCase();
    if (_validSizesSet.has(lower)) return lower;
  }
  return fallback;
}
function coerceAlignment(v, fallback) {
  if (typeof v === "string") {
    const lower = v.trim().toLowerCase();
    if (_validAlignmentsSet.has(lower)) return lower;
  }
  return fallback;
}
function coerceOpacity(v, fallback) {
  const n = coerceNumber(v, NaN);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  return fallback;
}
function isValidOpacity(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
function coercePadding(v, fallback) {
  const n = coerceNumber(v, NaN);
  if (Number.isFinite(n) && n >= 0) return n;
  return fallback;
}
function isValidPadding(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
var SENSITIVE_PARAMS = /* @__PURE__ */ new Set([
  "token",
  "key",
  "apikey",
  "api_key",
  "secret",
  "password",
  "passwd",
  "auth",
  "authorization",
  "access_token",
  "bearer",
  "credential",
  "credentials"
]);
function maskSensitiveUrl(url) {
  if (!url) return url;
  try {
    let result = url;
    result = result.replace(
      /^(\w+:\/\/)([^@/?#]+)@/,
      (_match, scheme, _userinfo) => {
        if (_userinfo.includes(":")) {
          return `${scheme}***:***@`;
        }
        return `${scheme}***@`;
      }
    );
    if (result.includes("?")) {
      result = result.replace(
        /([?&])([^=&]+)=([^&]*)/g,
        (_match, prefix, name, _value) => {
          if (SENSITIVE_PARAMS.has(name.toLowerCase())) {
            return `${prefix}${name}=***`;
          }
          return _match;
        }
      );
    }
    return result;
  } catch {
    return url;
  }
}
var ERROR_PREFIXES = [
  // Generic catch-all: matches TypeError, ReferenceError, SyntaxError, CustomError, etc.
  // All specific *Error entries are redundant with this pattern and have been removed.
  "[a-zA-Z0-9_]*Error",
  // Java/JVM-style: java.lang.NullPointerException, kotlin.KotlinNullPointerException, etc.
  // Also handles .NET: System.InvalidOperationException, System.IO.FileNotFoundException, etc.
  "(?:[a-zA-Z_][a-zA-Z0-9_]*\\.)+[a-zA-Z_][a-zA-Z0-9_]*(?:Error|Exception|Fault)",
  // Generic non-Error prefixes
  "Tool failed",
  "Command failed",
  "Exception",
  "Warning",
  "Alert",
  "Fatal",
  "panic",
  "uncaughtException",
  "Uncaught",
  // Log-level prefixes (parity with renderer cleanErrorString)
  "info",
  "debug",
  "trace",
  "warn",
  // Python non-Error exceptions (not matched by *Error pattern)
  "StopIteration",
  "StopAsyncIteration",
  "KeyboardInterrupt",
  "SystemExit",
  "GeneratorExit",
  // Swift/Rust runtime assertions (not matched by *Error pattern)
  "Precondition failed",
  "Assertion failed",
  // Java/JVM "Caused by:" chained exception prefix
  "Caused by",
  // Environment/Tool colon-prefixes
  "node:",
  "fs:",
  "process:",
  "internal:",
  "commonjs:",
  "bun:",
  "sh:",
  "bash:",
  "zsh:",
  // CLI tools
  "git:",
  "curl:",
  "wget:",
  "npm:",
  "npx:",
  "pnpm:",
  "pnpx:",
  "yarn:",
  "bunx:",
  "hakky:",
  "hakky-tools:",
  "clawd:",
  "clawdbot:",
  "openclaw:",
  // Protocol/API prefixes
  "rpc:",
  "grpc:",
  "deno:",
  // Infrastructure tools
  "docker:",
  "podman:",
  "kubectl:",
  "helm:",
  "terraform:",
  "ansible:",
  "make:",
  "cmake:",
  "gradle:",
  "mvn:",
  // Media/Processing tools
  "ffmpeg:",
  "python:",
  "python3:",
  "ruby:",
  "php:",
  "perl:",
  "elixir:",
  "mix:",
  "bundle:",
  "gem:",
  "go:",
  "rustc:",
  "cargo:",
  // Compilers / type-checkers
  "tsc:",
  "swiftc:",
  "javac:",
  "gcc:",
  "g\\+\\+:",
  "clang:",
  "clang\\+\\+:",
  "zig:",
  "esbuild:",
  "vite:",
  "swift:",
  "swc:",
  "biome:",
  "oxlint:",
  "eslint:",
  "prettier:",
  "turbo:",
  "nx:",
  // Browser automation
  "browser:",
  "playwright:",
  "chrome:",
  "firefox:",
  "safari:",
  // .NET CLI
  "dotnet:",
  // Node.js version/package managers
  "corepack:",
  "volta:",
  "fnm:",
  "proto:",
  // Cloud CLIs
  "aws:",
  "gcloud:",
  "az:",
  "gsutil:",
  "pip:",
  "pip3:",
  "uv:",
  "uvx:",
  "poetry:",
  "pdm:",
  "rye:",
  "hatch:",
  "conda:",
  "mamba:",
  "pixi:",
  "wrangler:",
  "miniflare:",
  "workerd:",
  // Test runners
  "vitest:",
  "jest:",
  "mocha:",
  "pytest:",
  "rspec:",
  "ava:",
  "tap:",
  // Database / ORM CLIs
  "psql:",
  "mysql:",
  "sqlite3:",
  "mongosh:",
  "redis-cli:",
  "prisma:",
  "drizzle:",
  "knex:",
  "sequelize:",
  "typeorm:",
  // Unix coreutils / network CLIs
  "ssh:",
  "scp:",
  "rsync:",
  "tar:",
  "find:",
  "sed:",
  "awk:",
  "grep:",
  "chmod:",
  "chown:",
  "ln:",
  "cp:",
  "mv:",
  "mkdir:",
  "rm:",
  "cat:",
  "sort:",
  "head:",
  "tail:",
  // OpenClaw specific
  "cron:",
  "nodes:"
];
var ERROR_PREFIX_REGEX = new RegExp(
  `^(?:${ERROR_PREFIXES.join("|")})(\\s*:\\s*|\\s+)`,
  "i"
);
var ERRNO_REGEX = /^E[A-Z]{2,}(?:_[A-Z]+)*\s*:\s*/;
var NODE_ERR_CODE_REGEX = /^\[ERR_[A-Z_]+\]\s*:\s*/;
var GO_RUNTIME_REGEX = /^runtime(?:\/\w+)?:\s+/i;
var IN_PROMISE_REGEX = /^\(in promise\)\s*/i;
function cleanErrorString(s) {
  if (s.length > 4096) s = s.slice(0, 4096);
  if (s.trimStart().startsWith("{")) {
    try {
      const obj = JSON.parse(s);
      if (obj && typeof obj === "object") {
        const msg = obj.error?.message ?? (typeof obj.error === "string" ? obj.error : null) ?? obj.message ?? obj.detail ?? obj.reason;
        if (typeof msg === "string" && msg.trim()) return cleanErrorString(msg);
      }
    } catch {
    }
  }
  let str = s.replace(/(?:\x1B\[|\x9B)[0-?]*[ -/]*[@-~]/g, "").replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "").trim();
  str = str.replace(
    /^\[?\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\]?\s*[-:]?\s*/i,
    ""
  ).trim();
  str = str.replace(
    /^(?:file:\/\/)?(?:\/[\w./-]+|[A-Z]:\\[\w.\\-]+):\d+(?::\d+)?[:\s]+/,
    ""
  ).trim();
  str = str.replace(
    /\s+at\s+(?:[\w.<>[\]]+\s+)?\(?(?:\/[\w./-]+|[A-Z]:\\[\w.\\-]+|file:\/\/[\w./-]+):\d+(?::\d+)?\)?$/,
    ""
  ).trim();
  str = str.replace(
    /^thread\s+'[^']*'\s+panicked\s+at\s+'([^']+)'(?:,\s*\S+:\d+(?::\d+)?)?$/i,
    "$1"
  ).trim();
  str = str.replace(/^thread\s+'[^']*'\s+panicked\s+at\s+\S+:\d+(?::\d+)?:\s*/i, "").trim();
  str = str.replace(
    /^(Killed|Segmentation fault|Abort trap|Bus error|Illegal instruction|Floating point exception|Hangup|Alarm clock|Terminated|Broken pipe|User defined signal [12]):\s*\d+$/i,
    "$1"
  ).trim();
  str = str.replace(
    /^\[?(ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE|FATAL|PANIC|CRIT(?:ICAL)?)\]\s*:?\s*/i,
    ""
  ).trim();
  let prev = "";
  while (str !== prev) {
    prev = str;
    str = str.replace(ERROR_PREFIX_REGEX, "").trim();
    str = str.replace(ERRNO_REGEX, "").trim();
    str = str.replace(NODE_ERR_CODE_REGEX, "").trim();
    str = str.replace(GO_RUNTIME_REGEX, "").trim();
    str = str.replace(IN_PROMISE_REGEX, "").trim();
  }
  const lines = str.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    if (/^Command (exited|failed) with (exit )?code \d+(?:\b|:)/i.test(lines[0])) {
      return cleanErrorString(lines[1]);
    }
    const concreteErrorLine = lines.find(
      (l) => /^(error|fatal|panic|exception|failed|denied|rejected|[a-zA-Z]+Error\b)/i.test(
        l
      )
    );
    if (concreteErrorLine && concreteErrorLine !== lines[0]) {
      return cleanErrorString(concreteErrorLine);
    }
    const tracebackLine = lines.find((l) => /^traceback\b/i.test(l));
    if (tracebackLine && lines[lines.length - 1] !== tracebackLine) {
      return cleanErrorString(lines[lines.length - 1]);
    }
    if (/^goroutine\s+\d+\s+\[/i.test(lines[0])) {
      return cleanErrorString(lines.slice(1).join("\n"));
    }
  }
  return lines[0] || str;
}
function summarizeToolResultMessage(msg) {
  if (typeof msg === "string" && msg.trim())
    return truncate(cleanErrorString(msg));
  if (typeof msg === "number" && Number.isFinite(msg)) {
    return truncate(String(msg));
  }
  if (typeof msg === "boolean") {
    return truncate(String(msg));
  }
  if (msg === null) {
    return "null";
  }
  if (msg === void 0) {
    return "undefined";
  }
  if (typeof msg === "bigint") {
    return truncate(String(msg));
  }
  if (Array.isArray(msg)) {
    const texts = msg.map(
      (item) => typeof item === "string" ? item : typeof item?.text === "string" ? item.text : typeof item?.name === "string" ? item.name : typeof item?.title === "string" ? item.title : null
    ).filter(Boolean);
    if (texts.length > 0) return truncate(cleanErrorString(texts.join(", ")));
    if (msg.length === 0) return "empty";
  }
  const blocks = msg?.content;
  if (Array.isArray(blocks)) {
    const text = blocks.map((b) => typeof b?.text === "string" ? b.text : "").filter(Boolean).join("\n");
    if (text.trim()) return truncate(cleanErrorString(text));
    if (blocks.length > 0) {
      const types = [...new Set(blocks.map((b) => b?.type).filter(Boolean))];
      if (types.length > 0) return truncate(types.join(", "));
    }
  } else if (typeof blocks === "string" && blocks.trim()) {
    return truncate(cleanErrorString(blocks));
  }
  const candidates = [
    msg?.errorMessage,
    msg?.error_message,
    msg?.err,
    msg?.stderr,
    msg?.failure,
    msg?.details,
    // Handle string error or object error with message
    typeof msg?.error === "string" ? msg.error : msg?.error?.message,
    typeof msg?.error === "object" ? msg?.error?.text : void 0,
    msg?.detail,
    msg?.description,
    msg?.message,
    msg?.text,
    msg?.result,
    msg?.output,
    msg?.stdout,
    msg?.data?.text,
    typeof msg?.data === "string" ? msg.data : void 0,
    typeof msg?.data === "object" ? msg?.data?.message ?? msg?.data?.error : void 0
  ];
  let genericFallback = null;
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      const s = cleanErrorString(c);
      if (s.match(/^Command exited with code \d+$/)) {
        if (!genericFallback) genericFallback = s;
        continue;
      }
      return truncate(s);
    }
  }
  if (genericFallback) return truncate(genericFallback);
  if (msg && typeof msg === "object") {
    const toTry = [msg.error, msg.data, msg.result];
    for (const v of toTry) {
      if (!v || typeof v !== "object") continue;
      try {
        const json = JSON.stringify(
          v,
          (_k, val) => typeof val === "bigint" ? String(val) : val
        );
        if (typeof json === "string" && json !== "{}") {
          return truncate(cleanErrorString(json));
        }
      } catch {
      }
    }
  }
  if (typeof msg === "object" && typeof msg?.exitCode === "number") {
    return `exit code ${msg.exitCode}`;
  }
  return "tool error";
}
function sanitizeToolName(raw) {
  return raw.replace(/^default_api:/, "").replace(/^functions\./, "").replace(/^multi_tool_use\./, "").replace(/^actions\./, "").replace(/^computer\./, "");
}
var CONTENT_TOOLS = /* @__PURE__ */ new Set([
  "read",
  "write",
  "edit",
  "exec",
  "web_fetch",
  "web_search",
  "memory_get",
  "memory_search",
  "browser",
  "canvas",
  "sessions_history",
  "sessions_list",
  "agents_list",
  "session_status",
  "sessions_spawn",
  "sessions_send",
  "tts",
  "cron",
  "nodes",
  "process",
  "gateway",
  "message",
  "slack",
  "gog",
  "github",
  "notion",
  "gemini",
  "bird",
  "bluebubbles",
  "clawdhub",
  "peekaboo",
  "summarize",
  "video_frames",
  "video-frames",
  "weather",
  "skill_creator",
  "skill-creator",
  "coding_agent",
  "coding-agent",
  "image",
  // multi_tool_use.parallel becomes just "parallel" after prefix stripping
  "parallel",
  // Linear integration via hakky-tools
  "hakky-tools"
]);
function isContentTool(value) {
  return typeof value === "string" && CONTENT_TOOLS.has(value);
}
function register(api) {
  const pluginId = typeof api?.id === "string" ? api.id : id;
  let cfg = api?.pluginConfig;
  if (!cfg) {
    const entries = api?.config?.plugins?.entries;
    const keysToTry = [
      pluginId,
      id,
      "@molt/mascot-plugin",
      "molt-mascot",
      "moltMascot",
      "molt-mascot-plugin",
      "moltMascotPlugin"
    ];
    for (const key of keysToTry) {
      const c = entries?.[key]?.config;
      if (c) {
        cfg = c;
        break;
      }
    }
  }
  if (!cfg) cfg = {};
  const idleDelayMs = Math.max(0, coerceNumber(cfg.idleDelayMs, 800));
  const errorHoldMs = Math.max(0, coerceNumber(cfg.errorHoldMs, 5e3));
  const alignment = coerceAlignment(cfg.alignment, "bottom-right");
  const clickThrough = coerceBoolean(cfg.clickThrough, false);
  const hideText = coerceBoolean(cfg.hideText, false);
  const reducedMotion = coerceBoolean(cfg.reducedMotion, false);
  const padding = coercePadding(cfg.padding, 24);
  const opacity = coerceOpacity(cfg.opacity, 1);
  const size = coerceSize(cfg.size, "medium");
  const startedAt = Date.now();
  const state = {
    mode: "idle",
    since: startedAt,
    alignment,
    clickThrough,
    hideText,
    reducedMotion,
    padding,
    opacity,
    size,
    version,
    toolCalls: 0,
    toolErrors: 0,
    agentSessions: 0,
    startedAt
  };
  let idleTimer = null;
  let errorTimer = null;
  const activeAgents = /* @__PURE__ */ new Set();
  const agentToolStacks = /* @__PURE__ */ new Map();
  const agentLastToolTs = /* @__PURE__ */ new Map();
  const getToolDepth = () => {
    let inputs = 0;
    for (const stack of agentToolStacks.values()) inputs += stack.length;
    return inputs;
  };
  const getSessionKey = (event) => {
    const raw = event?.sessionKey ?? event?.sessionId ?? // Prefer *stable* identifiers so tool nesting works; per-request ids cause stack flicker.
    event?.agentSessionKey ?? event?.agentSessionId ?? event?.agentId ?? event?.agentKey;
    if (typeof raw === "string" && raw.trim()) return raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
    return "unknown";
  };
  const recalcCurrentTool = () => {
    let found;
    let bestTs = -1;
    for (const [sessionKey, stack] of agentToolStacks.entries()) {
      if (!stack || stack.length === 0) continue;
      const ts = agentLastToolTs.get(sessionKey) ?? 0;
      if (ts >= bestTs) {
        bestTs = ts;
        found = stack[stack.length - 1];
      }
    }
    if (found) {
      state.currentTool = sanitizeToolName(found);
    } else {
      delete state.currentTool;
    }
  };
  const clearIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };
  const clearErrorTimer = () => {
    if (errorTimer) clearTimeout(errorTimer);
    errorTimer = null;
  };
  const setMode = (mode, extra) => {
    const nextLastError = mode === "error" ? extra?.lastError ?? state.lastError : void 0;
    const modeUnchanged = state.mode === mode;
    const lastErrorUnchanged = (state.lastError?.message ?? "") === (nextLastError?.message ?? "") && (state.lastError?.ts ?? 0) === (nextLastError?.ts ?? 0);
    if (modeUnchanged && lastErrorUnchanged) return;
    if (state.mode === "error" && mode !== "error") {
      clearErrorTimer();
    }
    state.mode = mode;
    state.since = Date.now();
    if (nextLastError) state.lastError = nextLastError;
    else delete state.lastError;
    if (mode !== "tool") {
      delete state.currentTool;
    }
    api?.logger?.info?.(`${pluginId}: state mode=${mode}`);
  };
  const scheduleIdle = (delayMs = idleDelayMs) => {
    if (state.mode === "error") return;
    clearIdleTimer();
    idleTimer = setTimeout(() => setMode("idle"), Math.max(0, delayMs));
  };
  const resolveNativeMode = () => {
    if (getToolDepth() > 0) return "tool";
    return activeAgents.size > 0 ? "thinking" : "idle";
  };
  const syncModeFromCounters = () => {
    const target = resolveNativeMode();
    if (state.mode === "error" && target !== "tool") return;
    if (target === "idle") scheduleIdle();
    else setMode(target);
  };
  const enterError = (message) => {
    api?.logger?.warn?.(`${pluginId}: entering error mode: ${message}`);
    clearIdleTimer();
    clearErrorTimer();
    state.toolErrors = (state.toolErrors ?? 0) + 1;
    setMode("error", { lastError: { message, ts: Date.now() } });
    errorTimer = setTimeout(() => {
      if (state.mode === "error") {
        const target = resolveNativeMode();
        if (target === "idle") setMode("idle");
        else setMode(target);
      }
    }, errorHoldMs);
  };
  const registerAlias = (method, handler) => {
    api.registerGatewayMethod?.(`${pluginId}.${method}`, handler);
    const aliases = /* @__PURE__ */ new Set([
      "molt-mascot-plugin",
      "molt-mascot",
      "moltMascot",
      "moltMascotPlugin",
      "@molt/mascot-plugin"
    ]);
    aliases.delete(pluginId);
    for (const alias of aliases) {
      api.registerGatewayMethod?.(`${alias}.${method}`, handler);
    }
  };
  registerAlias("state", (_params, { respond }) => {
    state.activeAgents = activeAgents.size;
    state.activeTools = getToolDepth();
    respond(true, { ok: true, state });
  });
  const resetInternalState = () => {
    state.mode = "idle";
    state.since = Date.now();
    delete state.lastError;
    delete state.currentTool;
    state.toolCalls = 0;
    state.toolErrors = 0;
    state.agentSessions = 0;
    state.activeAgents = 0;
    state.activeTools = 0;
    agentToolStacks.clear();
    agentLastToolTs.clear();
    activeAgents.clear();
    clearIdleTimer();
    clearErrorTimer();
  };
  registerAlias("reset", (_params, { respond }) => {
    api?.logger?.info?.(`${pluginId}: manual reset triggered`);
    resetInternalState();
    state.lastResetAt = Date.now();
    respond(true, { ok: true, state });
  });
  const on = api?.on;
  const off = api?.off;
  if (typeof on !== "function") {
    api?.logger?.warn?.(
      `${pluginId} plugin: api.on() is unavailable; mascot state will not track agent/tool lifecycle`
    );
  } else {
    const onAgentStart = async (event) => {
      clearIdleTimer();
      clearErrorTimer();
      const sessionKey = getSessionKey(event);
      if (activeAgents.size > 10) {
        activeAgents.clear();
        agentToolStacks.clear();
        agentLastToolTs.clear();
        delete state.currentTool;
      }
      activeAgents.add(sessionKey);
      state.agentSessions = (state.agentSessions ?? 0) + 1;
      agentToolStacks.set(sessionKey, []);
      agentLastToolTs.set(sessionKey, 0);
      const mode = resolveNativeMode();
      setMode(mode);
    };
    const onToolStart = async (event) => {
      clearIdleTimer();
      clearErrorTimer();
      const key = getSessionKey(event);
      const stack = agentToolStacks.get(key) || [];
      const rawName = typeof event?.tool === "string" ? event.tool : typeof event?.toolName === "string" ? event.toolName : typeof event?.name === "string" ? event.name : "";
      const toolName = rawName || "tool";
      stack.push(toolName);
      agentToolStacks.set(key, stack);
      agentLastToolTs.set(key, Date.now());
      state.toolCalls = (state.toolCalls ?? 0) + 1;
      state.currentTool = sanitizeToolName(toolName);
      syncModeFromCounters();
    };
    const onToolEnd = async (event) => {
      clearIdleTimer();
      const key = getSessionKey(event);
      const stack = agentToolStacks.get(key) || [];
      if (stack.length > 0) stack.pop();
      agentToolStacks.set(key, stack);
      agentLastToolTs.set(key, Date.now());
      recalcCurrentTool();
      const infraError = event?.error;
      const msg = event?.result ?? event?.output ?? event?.data ?? event?.payload;
      const toolFromEvent = event?.tool ?? event?.toolName ?? event?.name;
      const rawToolName = typeof toolFromEvent === "string" ? toolFromEvent : "";
      const toolName = sanitizeToolName(rawToolName).slice(0, 20);
      if (infraError) {
        const detail = typeof infraError === "string" ? infraError : infraError.message || infraError.code || "unknown error";
        enterError(truncate(`${toolName}: ${detail}`));
        return;
      }
      const hasExitCode = typeof msg?.exitCode === "number";
      const isExitError = hasExitCode && msg.exitCode !== 0;
      const isContent = isContentTool(rawToolName);
      const textSniffing = !isContent && (typeof msg === "string" && /^\s*error:/i.test(msg) || typeof msg === "string" && /Command exited with code [1-9]\d*/.test(msg));
      const isExplicitError = msg?.isError === true || msg?.success === false || msg?.status === "error" || msg?.status === "failed" || typeof msg?.error === "string" && msg.error.trim().length > 0 || textSniffing;
      const isError = hasExitCode ? isExitError : isExplicitError;
      if (isError) {
        const detail = summarizeToolResultMessage(msg);
        const text = detail === "tool error" ? `${toolName} failed` : `${toolName}: ${detail}`;
        enterError(truncate(text));
      } else {
        syncModeFromCounters();
      }
    };
    const onAgentEnd = async (event) => {
      const sessionKey = getSessionKey(event);
      activeAgents.delete(sessionKey);
      agentToolStacks.delete(sessionKey);
      agentLastToolTs.delete(sessionKey);
      recalcCurrentTool();
      const err = event?.error;
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : typeof err === "object" && err ? err.message || err.text || err.detail || err.description || err.code || (typeof err.error === "string" ? err.error : "") || "" : "";
      if (String(msg).trim()) {
        const clean = cleanErrorString(msg);
        enterError(truncate(clean));
        return;
      }
      if (event?.phase === "error" || event?.success === false) {
        enterError("Task failed");
        return;
      }
      syncModeFromCounters();
    };
    const mergeEnvelope = (envelope, payload) => {
      if (payload == null) return envelope;
      if (typeof payload !== "object") {
        return { ...envelope, payload };
      }
      const merged = { ...envelope, ...payload };
      const missingId = (v) => v === void 0 || v === null || typeof v === "string" && v.trim().length === 0;
      if (missingId(merged.sessionKey) && !missingId(envelope?.sessionKey)) {
        merged.sessionKey = envelope.sessionKey;
      }
      if (missingId(merged.sessionId) && !missingId(envelope?.sessionId)) {
        merged.sessionId = envelope.sessionId;
      }
      if (missingId(merged.sessionKey) && !missingId(merged.sessionId)) {
        merged.sessionKey = merged.sessionId;
      }
      return merged;
    };
    const handleAgentEvent = (e) => {
      const payload = e && typeof e === "object" && "payload" in e ? e.payload : e;
      const p = mergeEnvelope(e, payload);
      if (p?.phase === "start") onAgentStart(p);
      else if (p?.phase === "end" || p?.phase === "result" || p?.phase === "error")
        onAgentEnd(p);
    };
    const handleToolEvent = (e) => {
      const payload = e && typeof e === "object" && "payload" in e ? e.payload : e;
      const p = mergeEnvelope(e, payload);
      if (p?.phase === "start" || p?.phase === "call" || p?.stream === "call")
        onToolStart(p);
      else if (p?.phase === "end" || p?.phase === "result" || p?.phase === "error" || p?.stream === "result" || p?.stream === "error")
        onToolEnd(p);
    };
    let unsubAgent;
    let unsubTool;
    const registerListeners = () => {
      if (typeof on === "function") {
        const maybeUnsubAgent = on("agent", handleAgentEvent);
        const maybeUnsubTool = on("tool", handleToolEvent);
        if (typeof maybeUnsubAgent === "function") unsubAgent = maybeUnsubAgent;
        if (typeof maybeUnsubTool === "function") unsubTool = maybeUnsubTool;
      }
    };
    const unregisterListeners = () => {
      if (typeof off === "function") {
        off("agent", handleAgentEvent);
        off("tool", handleToolEvent);
      }
      try {
        unsubAgent?.();
      } finally {
        unsubAgent = void 0;
      }
      try {
        unsubTool?.();
      } finally {
        unsubTool = void 0;
      }
    };
    registerListeners();
    api.registerService?.({
      // Keep service id aligned with the runtime plugin id (avoid config/entry mismatches).
      id: pluginId,
      start: () => api?.logger?.info?.(`${pluginId} plugin ready`),
      stop: () => {
        resetInternalState();
        unregisterListeners();
      }
    });
    return;
  }
  api.registerService?.({
    // Keep service id aligned with the runtime plugin id (avoid config/entry mismatches).
    id: pluginId,
    start: () => api?.logger?.info?.(`${pluginId} plugin ready (no events)`),
    stop: () => {
      resetInternalState();
    }
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CONTENT_TOOLS,
  ERROR_PREFIXES,
  ERROR_PREFIX_REGEX,
  allowedAlignments,
  allowedModes,
  allowedSizes,
  capitalize,
  clamp,
  cleanErrorString,
  coerceAlignment,
  coerceBoolean,
  coerceMode,
  coerceNumber,
  coerceOpacity,
  coercePadding,
  coerceSize,
  formatBoolToggle,
  formatBytes,
  formatCount,
  formatCountWithLabel,
  formatDuration,
  formatElapsed,
  formatPercent,
  formatRate,
  formatRelativeTime,
  formatTimestamp,
  formatTimestampLocal,
  formatTimestampWithAge,
  id,
  isContentTool,
  isValidAlignment,
  isValidMode,
  isValidOpacity,
  isValidPadding,
  isValidSize,
  maskSensitiveUrl,
  parseDuration,
  pluralize,
  sanitizeToolName,
  successRate,
  summarizeToolResultMessage,
  truncate,
  version
});
