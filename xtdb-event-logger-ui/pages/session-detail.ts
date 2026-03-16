import type { EventRow } from "../lib/db.ts";
import { CATEGORY_COLORS, relativeTime, getDisplayFields } from "../lib/format.ts";

// ─── Session Detail Page ───────────────────────────────────────────
// Renders a flat list of event rows with data-attributes.
// Client-side session.js handles the nested grouping + collapse/expand.

export function renderSessionDetail(sessionId: string, events: EventRow[]): string {
  const name = sessionId.split("/").pop() ?? sessionId;
  const firstTs = events.length > 0 ? events[0].ts : "0";
  const lastTs = events.length > 0 ? events[events.length - 1].ts : "0";
  const durationMs = Number(lastTs) - Number(firstTs);
  const cwd = events.find((e) => e.cwd)?.cwd ?? "—";

  // Render each event as a timeline row
  const rows = events.map((ev) => {
    const color = CATEGORY_COLORS[ev.category] ?? "#999";
    const fields = getDisplayFields(ev);
    const fieldHtml = Object.entries(fields)
      .map(([k, v]) => `<span class="field-pair"><span class="field-k">${esc(k)}:</span> ${esc(v)}</span>`)
      .join(" ");

    return `<div class="tl-event"
      data-event-name="${esc(ev.event_name)}"
      data-category="${esc(ev.category)}"
      data-seq="${ev.seq}"
      data-id="${esc(ev._id)}"
      data-tool-name="${esc(ev.tool_name ?? "")}"
      data-tool-call-id="${esc(ev.tool_call_id ?? "")}"
      data-turn-index="${ev.turn_index ?? ""}"
      data-ts="${ev.ts}"
      style="--cat-color:${color}">
      <span class="tl-seq">#${ev.seq}</span>
      <span class="cat-dot" style="background:${color}"></span>
      <span class="tl-name">${esc(ev.event_name)}</span>
      <span class="cat-badge" style="background:${color}">${esc(ev.category)}</span>
      <span class="tl-fields">${fieldHtml}</span>
      <span class="tl-time">${relativeTime(ev.ts)}</span>
      <a class="tl-detail-link" href="/event/${encodeURIComponent(ev._id)}">detail →</a>
    </div>`;
  }).join("\n    ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)} — Session</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <header>
    <div class="header-top">
      <h1>
        <a href="/" class="back-link">← Stream</a>
        <span class="header-sep">·</span>
        <a href="/sessions" class="back-link">Sessions</a>
        <span class="header-sep">·</span>
        📂 ${esc(name)}
      </h1>
      <span class="total-badge">${events.length} events</span>
    </div>
    <div class="ses-detail-meta">
      <span>Started: ${relativeTime(firstTs)}</span>
      <span>Duration: ${formatDuration(durationMs)}</span>
      <span>cwd: <code>${esc(cwd)}</code></span>
    </div>
    <div class="ses-detail-actions">
      <button class="btn" id="btn-expand-all">Expand All</button>
      <button class="btn" id="btn-collapse-all">Collapse All</button>
    </div>
  </header>

  <main class="timeline" id="timeline">
    ${rows}
  </main>

  <script src="/static/session.js"></script>
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
