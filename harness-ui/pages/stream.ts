// ─── Live Event Stream Page (Hybrid: live + paginated history) ──
import { layout } from "../components/layout.ts";
import { fetchSessionList, fetchStats } from "../lib/api.ts";
import { CATEGORY_COLORS, escapeHtml } from "../lib/format.ts";

const CATEGORIES = ["session", "compaction", "agent", "message", "tool", "input", "model", "resource"];

export async function renderStream(projectId?: string): Promise<string> {
  const [stats, sessions] = await Promise.all([
    fetchStats(projectId).catch(() => null),
    fetchSessionList(projectId).catch(() => null),
  ]);

  const total = stats?.total ?? 0;
  const byCategory = stats?.byCategory ?? {};

  const catPills = CATEGORIES.map((c) => {
    const color = CATEGORY_COLORS[c] ?? "#999";
    const count = byCategory[c] ?? 0;
    return `<button class="cat-pill active" data-category="${c}" style="--cat-color:${color}">
      <span class="cat-dot" style="background:${color}"></span>${c}
      <span class="cat-count">${count}</span>
    </button>`;
  }).join("\n");

  const sessionOpts = (sessions ?? [])
    .map((s: any) => {
      const id = s.sessionId ?? s;
      const label = String(id).split("/").pop() ?? id;
      return `<option value="${escapeHtml(String(id))}">${escapeHtml(String(label))}</option>`;
    })
    .join("\n");

  const content = `
    <div class="page-header">
      <h1>📊 Event Stream</h1>
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

    <div style="margin:1.5rem 0">
      <h2 style="margin-bottom:0.5rem">🔴 Live <span id="live-counter" style="color:#8b949e;font-size:0.85rem">0</span></h2>
      <p style="color:#8b949e;font-size:0.85rem;margin-bottom:0.75rem">New events appear here in real-time</p>
      <div id="live-stream"></div>
    </div>

    <hr style="border-color:#30363d;margin:1.5rem 0">

    <div>
      <h2 style="margin-bottom:0.5rem">📋 History</h2>
      <p style="color:#8b949e;font-size:0.85rem;margin-bottom:0.75rem">Recent events loaded in pages of 50</p>
      <div id="history-list"></div>
      <div style="text-align:center;margin:1rem 0">
        <button class="btn" id="btn-load-more">Load More</button>
      </div>
    </div>
  `;

  return layout(content, {
    title: "Event Stream",
    activePath: projectId ? `/projects/${projectId}/stream` : "/stream",
    extraHead: `<script src="/static/stream.js" defer></script>`,
    projectId,
    activeSection: "stream",
  });
}
