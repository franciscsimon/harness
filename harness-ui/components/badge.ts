// ─── Badge Component ───────────────────────────────────────────

import { escapeHtml, STATUS_COLORS } from "../lib/format.ts";

/**
 * Render a colored status badge.
 * Looks up color by status name (case-insensitive).
 * Falls back to neutral gray for unknown statuses.
 */
export function badge(status: string): string {
  const key = status.toLowerCase();
  const colors = STATUS_COLORS[key] ?? { bg: "#484f58", fg: "#c9d1d9" };
  return `<span class="badge" style="background:${colors.bg};color:${colors.fg}">${escapeHtml(status)}</span>`;
}

/**
 * Render a health indicator dot (green/red).
 */
export function healthDot(ok: boolean, label?: string): string {
  const color = ok ? "#238636" : "#da3633";
  const text = label ?? (ok ? "healthy" : "down");
  return `<span class="health-dot" style="color:${color}">● ${escapeHtml(text)}</span>`;
}
