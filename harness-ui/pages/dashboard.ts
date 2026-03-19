// ─── Dashboard Page ────────────────────────────────────────────
// Ported from xtdb-event-logger-ui/pages/dashboard.ts
// Changes: data via API fetch, layout() wrapper.

import { layout } from "../components/layout.ts";
import { fetchDashboard } from "../lib/api.ts";
import { computeHealthScore, healthColor, healthLabel } from "../lib/health.ts";
import { relativeTime, escapeHtml } from "../lib/format.ts";

export async function renderDashboard(): Promise<string> {
  const data = await fetchDashboard();
  if (!data) {
    return layout('<p class="empty-msg">Dashboard unavailable — cannot reach event logger API.</p>',
      { title: "Dashboard", activePath: "/dashboard" });
  }

  // The API pre-computes some stats, but we re-derive what we need
  const sessions: any[] = data.sessions ?? [];
  const tools: any[] = data.toolUsage ?? [];
  const errors: any[] = data.errorPatterns ?? [];

  const totalEvents = data.totalEvents ?? sessions.reduce((s: number, r: any) => s + (r.eventCount ?? 0), 0);
  const avgEvents = data.avgEventsPerSession ?? (sessions.length > 0 ? Math.round(totalEvents / sessions.length) : 0);
  const overallErrorRate = data.overallErrorRate != null
    ? (data.overallErrorRate * 100).toFixed(1)
    : "0";
  const avgDuration = sessions.length > 0
    ? Math.round(sessions.reduce((s: number, r: any) => s + (r.durationMs ?? 0), 0) / sessions.length)
    : 0;

  // Rank sessions by health
  const ranked = sessions.map((s: any) => {
    const score = s.healthScore ?? computeHealthScore({
      errorRate: s.errorRate ?? 0,
      turnCount: s.turnCount ?? 0,
      maxPayloadBytes: s.maxPayloadBytes ?? 0,
      durationMs: s.durationMs ?? 0,
    });
    const color = s.healthColor ?? healthColor(score);
    const label = healthLabel(score);
    return { ...s, score, color, label };
  }).sort((a: any, b: any) => a.score - b.score); // worst first

  const statCards = `
    <div class="dash-stat-card"><div class="dash-stat-label">Sessions</div><div class="dash-stat-value">${sessions.length}</div></div>
    <div class="dash-stat-card"><div class="dash-stat-label">Total Events</div><div class="dash-stat-value">${totalEvents}</div></div>
    <div class="dash-stat-card"><div class="dash-stat-label">Avg Events/Session</div><div class="dash-stat-value">${avgEvents}</div></div>
    <div class="dash-stat-card"><div class="dash-stat-label">Error Rate</div><div class="dash-stat-value">${overallErrorRate}%</div></div>
    <div class="dash-stat-card"><div class="dash-stat-label">Avg Duration</div><div class="dash-stat-value">${fmtDuration(avgDuration)}</div></div>
  `;

  const sessionRows = ranked.map((s: any) => {
    const name = s.sessionId.split("/").pop() ?? s.sessionId;
    return `<a class="dash-session-row" href="/sessions/${encodeURIComponent(s.sessionId)}">
      <span class="health-score" style="color:${colorHex(s.color)}">${s.score}</span>
      <span class="health-badge health-badge-${s.color}">${s.label}</span>
      <span class="dash-session-name" title="${escapeHtml(s.sessionId)}">${escapeHtml(name)}</span>
      <span class="dash-session-meta">
        <span>${s.eventCount ?? 0} events</span>
        <span>${s.turnCount ?? 0} turns</span>
        <span>${Math.round((s.maxPayloadBytes ?? 0) / 1024)}KB ctx</span>
        <span>${((s.errorRate ?? 0) * 100).toFixed(0)}% err</span>
        <span>${relativeTime(String(s.lastTs))}</span>
      </span>
    </a>`;
  }).join("\n");

  // Tool usage bars — API returns {tool, count, errors, errorRate}
  const maxToolCount = Math.max(...tools.map((t: any) => t.count ?? 0), 1);
  const toolBars = tools.map((t: any) => {
    const name = t.tool ?? "unknown";
    const count = t.count ?? 0;
    const errCount = t.errors ?? 0;
    const errRate = count > 0 ? errCount / count : 0;
    const pct = (count / maxToolCount) * 100;
    return `<div class="tool-bar">
      <span class="tool-bar-name">${escapeHtml(name)}</span>
      <div class="tool-bar-fill" style="width:${pct}%"></div>
      <span class="tool-bar-count">${count}</span>
      ${errCount > 0 ? `<span class="tool-bar-error">${errCount} err (${(errRate * 100).toFixed(0)}%)</span>` : ""}
    </div>`;
  }).join("\n");

  const content = `
    <div class="page-header">
      <h1>📊 Dashboard</h1>
    </div>

    <div class="dash-stats">${statCards}</div>

    <div class="dash-section">
      <h2>Sessions by Health</h2>
      ${sessionRows || '<p class="empty-msg">No sessions.</p>'}
    </div>

    <div class="dash-section">
      <h2>Tool Usage</h2>
      <div class="tool-bars">${toolBars || '<p class="empty-msg">No tool data.</p>'}</div>
    </div>

    <div class="dash-section">
      <h2>Error Patterns</h2>
      ${errors.length > 0
        ? `<table class="error-patterns-table">
          <thead><tr><th>Tool</th><th>Errors</th><th>Sessions</th></tr></thead>
          <tbody>${errors.map((e: any) => `<tr>
            <td><code>${escapeHtml(e.tool ?? "")}</code></td>
            <td class="error-count">${e.count ?? 0}</td>
            <td>${e.sessionCount ?? e.session_count ?? 0} session${(e.sessionCount ?? e.session_count ?? 0) !== 1 ? "s" : ""}</td>
          </tr>`).join("")}</tbody>
        </table>`
        : '<p class="empty-msg">No errors recorded.</p>'}
    </div>
  `;

  return layout(content, { title: "Dashboard", activePath: "/dashboard" });
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m`;
}

function colorHex(c: string): string {
  if (c === "green") return "#22c55e";
  if (c === "yellow") return "#eab308";
  return "#ef4444";
}
