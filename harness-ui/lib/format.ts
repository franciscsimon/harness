// ─── Formatting Helpers ─────────────────────────────────────────
// Adapted from xtdb-event-logger-ui/lib/format.ts

// ─── Category Colors ───────────────────────────────────────────

export const CATEGORY_COLORS: Record<string, string> = {
  session: "#3b82f6",
  compaction: "#8b5cf6",
  agent: "#22c55e",
  message: "#06b6d4",
  tool: "#f97316",
  input: "#eab308",
  model: "#ec4899",
  resource: "#6b7280",
};

// ─── Relative Time ─────────────────────────────────────────────

export function relativeTime(tsStr: string | number): string {
  const ts = Number(tsStr);
  if (!ts || isNaN(ts)) return "—";
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  if (diff < 1000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ─── Format Date ───────────────────────────────────────────────

export function formatDate(tsStr: string | number): string {
  const ts = Number(tsStr);
  if (!ts || isNaN(ts)) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Number Formatting ─────────────────────────────────────────

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

// ─── Truncate ──────────────────────────────────────────────────

export function truncate(s: string, max = 80): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

// ─── Health Status Color ───────────────────────────────────────

export function healthColor(ok: boolean): string {
  return ok ? "#238636" : "#da3633";
}

// ─── Status Badge Colors ───────────────────────────────────────

export const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  active: { bg: "#238636", fg: "#fff" },
  healthy: { bg: "#238636", fg: "#fff" },
  ok: { bg: "#238636", fg: "#fff" },
  running: { bg: "#238636", fg: "#fff" },
  succeeded: { bg: "#238636", fg: "#fff" },
  resolved: { bg: "#238636", fg: "#fff" },
  open: { bg: "#da3633", fg: "#fff" },
  failed: { bg: "#da3633", fg: "#fff" },
  error: { bg: "#da3633", fg: "#fff" },
  degraded: { bg: "#d29922", fg: "#000" },
  maintenance: { bg: "#d29922", fg: "#000" },
  warning: { bg: "#d29922", fg: "#000" },
  planning: { bg: "#1f6feb", fg: "#fff" },
  deprecated: { bg: "#da3633", fg: "#fff" },
  decommissioned: { bg: "#484f58", fg: "#c9d1d9" },
  unknown: { bg: "#484f58", fg: "#c9d1d9" },
};

export function formatDuration(ms: number | string | null): string {
  if (ms == null) return "—";
  const n = typeof ms === "string" ? parseInt(ms, 10) : ms;
  if (isNaN(n) || n <= 0) return "—";
  if (n < 1000) return `${n}ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(1)}s`;
  if (n < 3600_000) return `${Math.floor(n / 60_000)}m ${Math.floor((n % 60_000) / 1000)}s`;
  const h = Math.floor(n / 3600_000);
  const m = Math.floor((n % 3600_000) / 60_000);
  return `${h}h ${m}m`;
}

export function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
