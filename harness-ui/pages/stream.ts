// ─── Live Event Stream Page ────────────────────────────────────
// Ported from xtdb-event-logger-ui/pages/index.ts
// Client-side: stream.js handles SSE + card rendering.

import { layout } from "../components/layout.ts";
import { fetchStats, fetchSessionList } from "../lib/api.ts";
import { escapeHtml, CATEGORY_COLORS } from "../lib/format.ts";

const CATEGORIES = ["session", "compaction", "agent", "message", "tool", "input", "model", "resource"];

export async function renderStream(): Promise<string> {
  const [stats, sessions] = await Promise.all([
    fetchStats().catch(() => null),
    fetchSessionList().catch(() => null),
  ]);

  const total = stats?.total ?? 0;
  const byCategory = stats?.byCategory ?? {};

  const catPills = CATEGORIES.map((c) => {
    const color = CATEGORY_COLORS[c] ?? "#999";
    const count = byCategory[c] ?? 0;
    return `<button class="cat-pill active" data-category="${c}" style="--cat-color:${color}">
      <span class="cat-dot" style="background:${color}"></span>${c}
      <span class="cat-count" id="stat-${c}">${count}</span>
    </button>`;
  }).join("\n");

  const sessionOpts = (sessions ?? []).map((s: any) => {
    const id = s.sessionId ?? s;
    const label = String(id).split("/").pop() ?? id;
    return `<option value="${escapeHtml(String(id))}">${escapeHtml(String(label))}</option>`;
  }).join("\n");

  const statsBar = CATEGORIES.map((c) => {
    const color = CATEGORY_COLORS[c] ?? "#999";
    return `<span class="stat-item" style="--cat-color:${color}">
      <span class="cat-dot" style="background:${color}"></span>
      ${c}: <b id="stat-bar-${c}">${byCategory[c] ?? 0}</b>
    </span>`;
  }).join("");

  const content = `
    <div class="page-header">
      <h1>📊 Live Event Stream</h1>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="total-badge" id="stat-total">Total: ${total}</span>
        <span class="conn-status" id="conn-status" title="SSE connection">●</span>
        <button class="btn" id="btn-pause">⏸ Pause</button>
      </div>
    </div>
    <div class="filter-bar">
      <input type="text" id="search" placeholder="🔍 Filter event name..." autocomplete="off">
      <select id="session-picker">
        <option value="">All sessions</option>
        ${sessionOpts}
      </select>
    </div>
    <div class="cat-bar">${catPills}</div>
    <div class="stats-bar" id="stats-bar">${statsBar}</div>
    <main id="stream"></main>
  `;

  return layout(content, {
    title: "Live Stream",
    activePath: "/stream",
    extraHead: `<script>window.EVENT_API = "http://localhost:3333";</script><script src="/static/stream.js" defer></script>`,
  });
}
