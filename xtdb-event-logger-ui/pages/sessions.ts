import type { SessionSummary } from "../lib/db.ts";
import { CATEGORY_COLORS, relativeTime } from "../lib/format.ts";

// ─── All Categories ────────────────────────────────────────────────

const CATEGORIES = ["session", "compaction", "agent", "message", "tool", "input", "model", "resource"];

// ─── Session List Page ─────────────────────────────────────────────

export function renderSessions(sessions: SessionSummary[]): string {
  const cards = sessions.map((s) => {
    const name = s.sessionId.split("/").pop() ?? s.sessionId;
    const duration = formatDuration(s.lastTs - s.firstTs);
    const catBadges = CATEGORIES
      .filter((c) => s.byCategory[c])
      .map((c) => {
        const color = CATEGORY_COLORS[c] ?? "#999";
        return `<span class="ses-cat-badge" style="--cat-color:${color}">
          <span class="cat-dot" style="background:${color}"></span>${c}: ${s.byCategory[c]}
        </span>`;
      }).join("");

    return `<a class="ses-card" href="/sessions/${encodeURIComponent(s.sessionId)}">
      <div class="ses-card-top">
        <span class="ses-card-name">${esc(name)}</span>
        <span class="ses-card-count">${s.eventCount} events</span>
      </div>
      <div class="ses-card-meta">
        <span>Started: ${relativeTime(String(s.firstTs))}</span>
        <span>Duration: ${duration}</span>
      </div>
      <div class="ses-card-cats">${catBadges}</div>
      <div class="ses-card-last">
        Last: <code>${esc(s.lastEventName)}</code> #${s.lastSeq}
        <span class="ses-card-ago">${relativeTime(String(s.lastTs))}</span>
      </div>
    </a>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sessions — XTDB Event Stream</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <header>
    <div class="header-top">
      <h1>
        <a href="/" class="back-link">← Stream</a>
        <span class="header-sep">·</span>
        📂 Sessions
      </h1>
      <span class="total-badge">${sessions.length} session${sessions.length !== 1 ? "s" : ""}</span>
    </div>
  </header>

  <main class="ses-list">
    ${sessions.length === 0 ? '<p class="empty-msg">No sessions found.</p>' : cards}
  </main>
</body>
</html>`;
}

// ─── Helpers ───────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  if (ms < 1000) return "<1s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
