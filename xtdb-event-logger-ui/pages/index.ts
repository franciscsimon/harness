import type { EventRow } from "../lib/db.ts";
import type { StatsResult } from "../lib/db.ts";
import { CATEGORY_COLORS } from "../lib/format.ts";

// ─── All Categories ────────────────────────────────────────────────

const CATEGORIES = ["session", "compaction", "agent", "message", "tool", "input", "model", "resource"];

// ─── Main Page HTML ────────────────────────────────────────────────

export function renderIndex(sessions: string[], stats: StatsResult): string {
  const catPills = CATEGORIES.map((c) => {
    const color = CATEGORY_COLORS[c] ?? "#999";
    return `<button class="cat-pill active" data-category="${c}" style="--cat-color:${color}">
      <span class="cat-dot" style="background:${color}"></span>${c}
      <span class="cat-count" id="stat-${c}">${stats.byCategory[c] ?? 0}</span>
    </button>`;
  }).join("\n          ");

  const sessionOpts = sessions.map(
    (s) => `<option value="${esc(s)}">${esc(s.split("/").pop() ?? s)}</option>`
  ).join("\n            ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>XTDB Event Stream — pi.dev</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <header>
    <div class="header-top">
      <h1>📊 pi.dev Event Stream <span class="header-sep">·</span> <a href="/sessions" class="nav-link">📂 Sessions</a> <span class="header-sep">·</span> <a href="/dashboard" class="nav-link">📊 Dashboard</a></h1>
      <div class="header-actions">
        <span class="total-badge" id="stat-total">Total: ${stats.total}</span>
        <span class="conn-status" id="conn-status">●</span>
        <button class="btn" id="btn-pause">⏸ Pause</button>
        <button class="btn btn-danger" id="btn-wipe">🗑 Wipe DB</button>
      </div>
    </div>
    <div class="filter-bar">
      <input type="text" id="search" placeholder="🔍 Filter event name..." autocomplete="off">
      <select id="session-picker">
        <option value="">All sessions</option>
        ${sessionOpts}
      </select>
    </div>
    <div class="cat-bar">
      ${catPills}
    </div>
    <div class="stats-bar" id="stats-bar">
      ${CATEGORIES.map((c) => {
        const color = CATEGORY_COLORS[c] ?? "#999";
        return `<span class="stat-item" style="--cat-color:${color}">
          <span class="cat-dot" style="background:${color}"></span>
          ${c}: <b id="stat-bar-${c}">${stats.byCategory[c] ?? 0}</b>
        </span>`;
      }).join("")}
    </div>
  </header>

  <main id="stream">
    <!-- Event cards inserted here by stream.js -->
  </main>

  <script src="/static/stream.js"></script>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
