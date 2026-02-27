/**
 * Formatting & display utilities.
 *
 * Extracted from the barrel index to keep the module focused and testable.
 * All functions are pure (no side-effects, no imports beyond stdlib).
 */

/**
 * Clamp a number within an inclusive range.
 * Returns `min` for non-finite inputs.
 */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(value, max));
}

/**
 * Compute a success-rate percentage from total calls and error count.
 * Returns null if totalCalls is 0 (avoids division by zero).
 */
export function successRate(
  totalCalls: number,
  errorCount: number,
): number | null {
  if (!totalCalls || totalCalls <= 0) return null;
  const errors = Math.max(0, Math.min(errorCount || 0, totalCalls));
  return Math.round(((totalCalls - errors) / totalCalls) * 100);
}

/**
 * Format a percentage value as a compact string with a "%" suffix.
 * Returns "–" for null/undefined/non-finite inputs.
 */
export function formatPercent(value: number | null | undefined): string {
  if (value == null || typeof value !== "number" || !Number.isFinite(value))
    return "–";
  return `${Math.round(value)}%`;
}

/**
 * Truncate a string to a given character limit (unicode-safe).
 * Collapses whitespace and tries to break at word boundaries.
 */
export function truncate(str: string, limit = 140): string {
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

  return cut + "…";
}

/**
 * Format a large count into a compact human-readable string.
 * e.g. 0 → "0", 999 → "999", 1000 → "1.0K", 1500 → "1.5K", 1000000 → "1.0M"
 */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  const rounded = Math.round(n);
  if (rounded < 1000) return `${rounded}`;
  const units = ["K", "M", "B", "T"];
  let value = n;
  for (const unit of units) {
    value /= 1000;
    if (value < 1000 || unit === "T") {
      return `${value.toFixed(1)}${unit}`;
    }
  }
  return `${value.toFixed(1)}T`;
}

/**
 * Format a byte count into a compact human-readable string with appropriate unit.
 * Uses binary units (1 KB = 1024 bytes).
 */
export function formatBytes(bytes: number): string {
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

/**
 * Format a duration in seconds into a compact human-readable string.
 * e.g. 45 → "45s", 90 → "1m 30s", 3661 → "1h 1m", 90000 → "1d 1h"
 */
export function formatDuration(seconds: number): string {
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

/**
 * Format the elapsed time since a past timestamp as a human-readable duration.
 */
export function formatElapsed(since: number, now: number): string {
  if (
    typeof since !== "number" ||
    typeof now !== "number" ||
    !Number.isFinite(since) ||
    !Number.isFinite(now)
  ) {
    return "0s";
  }
  return formatDuration(Math.max(0, Math.round((now - since) / 1000)));
}

/**
 * Format a past timestamp as a human-readable relative time string.
 * e.g. "just now", "5m ago", "2h ago"
 */
export function formatRelativeTime(since: number, now?: number): string {
  const n = now ?? Date.now();
  if (
    typeof since !== "number" ||
    typeof n !== "number" ||
    !Number.isFinite(since) ||
    !Number.isFinite(n)
  ) {
    return "just now";
  }
  const diffMs = Math.max(0, n - since);
  if (diffMs < 1000) return "just now";
  return `${formatDuration(Math.round(diffMs / 1000))} ago`;
}

/**
 * Format an epoch-ms timestamp as an ISO-8601 string.
 * Returns '–' if the input is invalid.
 */
export function formatTimestamp(ts: number): string {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "–";
  return new Date(ts).toISOString();
}

/**
 * Format an epoch-ms timestamp as a compact local time string.
 * "HH:MM:SS" for today, "Mon DD, HH:MM" otherwise.
 */
export function formatTimestampLocal(ts: number, now?: number): string {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "–";
  const date = new Date(ts);
  const ref = new Date(now ?? Date.now());

  const sameDay =
    date.getFullYear() === ref.getFullYear() &&
    date.getMonth() === ref.getMonth() &&
    date.getDate() === ref.getDate();

  if (sameDay) {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
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
    "Dec",
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

/**
 * Format a timestamp with both relative age and absolute time.
 */
export function formatTimestampWithAge(
  ts: number,
  now?: number,
  style: "ago" | "since" = "ago",
): string {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "–";
  const n = now ?? Date.now();
  const iso = formatTimestamp(ts);
  if (style === "since") {
    return `${formatElapsed(ts, n)} (since ${iso})`;
  }
  return `${formatRelativeTime(ts, n)} (at ${iso})`;
}

/**
 * Capitalize the first character of a string.
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Simple English pluralization: append "s" (or a custom suffix) when count ≠ 1.
 */
export function pluralize(
  count: number,
  singular: string,
  plural?: string,
): string {
  return count === 1 ? singular : (plural ?? singular + "s");
}

/**
 * Format a boolean as a human-readable toggle label.
 * Defaults to "on"/"off" — more readable than raw "true"/"false" in
 * diagnostic output, debug info, and status displays.
 *
 * @param value - Boolean to format
 * @param onLabel - Label for true (default: "on")
 * @param offLabel - Label for false (default: "off")
 * @returns Human-readable toggle string
 */
export function formatBoolToggle(
  value: boolean,
  onLabel = "on",
  offLabel = "off",
): string {
  return value ? onLabel : offLabel;
}

/**
 * Format a per-second rate as a compact human-readable string.
 * Combines a value formatter with a "/s" suffix.
 *
 * @param perSecond - The rate value (events, bytes, etc. per second)
 * @param unit - Optional unit label inserted before "/s" (e.g. "B" → "1.5 KB/s")
 * @returns Formatted rate string, e.g. "1.2K/s", "3.5 MB/s", "0/s"
 */
export function formatRate(perSecond: number, unit?: string): string {
  if (!Number.isFinite(perSecond) || perSecond < 0)
    return unit ? `0 ${unit}/s` : "0/s";

  // When a unit is provided (typically bytes), use SI/decimal scaling (1K = 1000).
  // Note: this differs from formatBytes() which uses binary (1 KB = 1024 B).
  // Network rates conventionally use SI units (1 KB/s = 1000 B/s).
  if (unit) {
    const UNITS = ["K", "M", "G", "T"];
    if (perSecond < 1000) {
      const rounded = Math.round(perSecond);
      return `${rounded} ${unit}/s`;
    }
    let value = perSecond;
    for (const u of UNITS) {
      value /= 1000;
      if (value < 1000 || u === "T") {
        return `${value.toFixed(1)} ${u}${unit}/s`;
      }
    }
    return `${value.toFixed(1)} T${unit}/s`;
  }

  // No unit: use formatCount-style scaling with "/s" suffix
  return `${formatCount(perSecond)}/s`;
}

/**
 * Format a count with a pluralized label in one call.
 * Combines {@link formatCount} and {@link pluralize} — a pattern that appears
 * frequently in tooltip, context menu, and debug info formatting.
 *
 * @example
 * formatCountWithLabel(1, "session")   // → "1 session"
 * formatCountWithLabel(5, "session")   // → "5 sessions"
 * formatCountWithLabel(1500, "call")   // → "1.5K calls"
 * formatCountWithLabel(0, "error")     // → "0 errors"
 * formatCountWithLabel(1, "entry", "entries") // → "1 entry"
 * formatCountWithLabel(3, "entry", "entries") // → "3 entries"
 */
export function formatCountWithLabel(
  count: number,
  singular: string,
  plural?: string,
): string {
  return `${formatCount(count)} ${pluralize(count, singular, plural)}`;
}

/**
 * Human-readable platform labels for Node.js `process.platform` values.
 * Maps raw identifiers (e.g. "darwin") to user-friendly names (e.g. "macOS").
 */
const PLATFORM_LABELS: Record<string, string> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
  freebsd: "FreeBSD",
  openbsd: "OpenBSD",
  sunos: "SunOS",
  aix: "AIX",
  android: "Android",
};

/**
 * Human-readable architecture labels for Node.js `process.arch` values.
 * Uppercases common identifiers for display consistency.
 */
const ARCH_LABELS: Record<string, string> = {
  arm64: "ARM64",
  x64: "x64",
  ia32: "x86",
  arm: "ARM",
  ppc64: "PPC64",
  s390x: "s390x",
  mips: "MIPS",
  mipsel: "MIPSel",
  riscv64: "RISC-V",
};

/**
 * Format a platform + architecture pair into a human-readable label.
 * Converts raw Node.js identifiers (e.g. "darwin", "arm64") into
 * user-friendly names (e.g. "macOS ARM64").
 *
 * Falls back to the raw value when no label is defined.
 *
 * @example
 * formatPlatform("darwin", "arm64") // → "macOS ARM64"
 * formatPlatform("win32", "x64")    // → "Windows x64"
 * formatPlatform("linux")           // → "Linux"
 * formatPlatform("", "arm64")       // → "ARM64"
 */
export function formatPlatform(platform?: string, arch?: string): string {
  const p = platform?.trim() || "";
  const a = arch?.trim() || "";
  const pLabel = (p && PLATFORM_LABELS[p]) || p;
  const aLabel = (a && ARCH_LABELS[a]) || a;
  return [pLabel, aLabel].filter(Boolean).join(" ") || "unknown";
}

/**
 * Format a millisecond value as a compact human-readable latency string.
 * Optimized for displaying WebSocket round-trip times, tool execution latency, etc.
 *
 * - < 1000ms → "Nms" (e.g. "12ms", "150ms")
 * - ≥ 1000ms and < 60s → "N.Ns" (e.g. "1.5s", "30.0s")
 * - ≥ 60s → delegates to {@link formatDuration} for "1m 30s" style
 *
 * Returns "0ms" for non-finite / negative inputs.
 *
 * @param ms - Latency in milliseconds
 * @returns Compact latency string
 */
export function formatLatencyMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return formatDuration(Math.round(seconds));
}

/**
 * Parse a human-readable duration string into total seconds.
 * Inverse of {@link formatDuration}.
 *
 * Accepted formats:
 * - Combined units: "1h30m", "2m15s", "1w2d3h", "1d 12h 30m 5s"
 * - Single units: "30s", "5m", "2h", "3d", "1w"
 * - Plain number: "120" (treated as seconds)
 * - Whitespace between groups is allowed: "1h 30m" === "1h30m"
 *
 * Unit multipliers: w=week(604800s), d=day(86400s), h=hour(3600s), m=minute(60s), s=second(1s).
 *
 * Returns `null` for empty, malformed, or negative-result inputs.
 *
 * @param input - Duration string to parse
 * @returns Total seconds, or null if unparseable
 */
export function parseDuration(input: string): number | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Plain number → treat as seconds
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }

  const UNITS: Record<string, number> = {
    w: 604800,
    d: 86400,
    h: 3600,
    m: 60,
    s: 1,
  };

  let total = 0;
  let matched = false;

  // Validate that the entire string is consumed by valid groups + whitespace
  const normalized = trimmed.replace(/\s+/g, "");
  let match: RegExpExecArray | null;
  const groupPattern = /(\d+(?:\.\d+)?)([wdhms])/gi;

  let reconstructed = "";
  const seenUnits = new Set<string>();
  while ((match = groupPattern.exec(normalized)) !== null) {
    reconstructed += match[0];
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (!Number.isFinite(value) || value < 0) return null;
    // Reject duplicate units (e.g. "1h2h", "1m1m") — ambiguous and likely a typo.
    if (seenUnits.has(unit)) return null;
    seenUnits.add(unit);
    total += value * UNITS[unit];
    matched = true;
  }

  // Reject if there are leftover characters (e.g. "1h foo", "1x")
  if (!matched || reconstructed.toLowerCase() !== normalized.toLowerCase())
    return null;

  return Number.isFinite(total) && total >= 0 ? Math.round(total) : null;
}
