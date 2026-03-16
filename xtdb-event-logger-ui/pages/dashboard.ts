import type { DashboardSession, ToolUsageStat } from "../lib/db.ts";
import { computeHealthScore, healthColor, healthLabel } from "../lib/health.ts";
import { relativeTime } from "../lib/format.ts";

export function renderDashboard(
  sessions: DashboardSession[],
  tools: ToolUsageStat[],
): string {
  const totalEvents = sessions.reduce((s, r) => s + r.eventCount, 0);
  const avgEvents = sessions.length > 0 ? Math.round(totalEvents / sessions.length) : 0;
  const totalErrors = sessions.reduce((s, r) => s + r.errorRate * r.eventCount, 0);
  const overallErrorRate = totalEvents > 0 ? (totalErrors / totalEvents * 100).toFixed(1) : "0";
  const avgDuration = sessions.length > 0
    ? Math.round(sessions.reduce((s, r) => s + r.durationMs, 0) / sessions.length)
    : 0;

  // Rank sessions by health
  const ranked = sessions.map((s) => {
    const score = computeHealthScore(s);
    const color = healthColor(score);
    const label = healthLabel(score);
    return { ...s, score, color, label };
  }).sort((a, b) => a.score - b.score); // worst first

  const statCards = `
    <div class="dash-stat-card"><div class="dash-stat-label">Sessions</div><div class="dash-stat-value">${sessions.length}</div></div>
    <div class="dash-stat-card"><div class="dash-stat-label">Total Events</div><div class="dash-stat-value">${totalEvents}</div></div>
    <div class="dash-stat-card"><div class="dash-stat-label">Avg Events/Session</div><div class="dash-stat-value">${avgEvents}</div></div>
    <div class="dash-stat-card"><div class="dash-stat-label">Error Rate</div><div class="dash-stat-value">${overallErrorRate}%</div></div>
    <div class="dash-stat-card"><div class="dash-stat-label">Avg Duration</div><div class="dash-stat-value">${formatDuration(avgDuration)}</div></div>
  `;

  const sessionRows = ranked.map((s) => {
    const name = s.sessionId.split("/").pop() ?? s.sessionId;
    return `<a class="dash-session-row" href="/sessions/${encodeURIComponent(s.sessionId)}">
      <span class="health-score" style="color:${colorHex(s.color)}">${s.score}</span>
      <span class="health-badge health-badge-${s.color}">${s.label}</span>
      <span class="dash-session-name" title="${esc(s.sessionId)}">${esc(name)}</span>
      <span class="dash-session-meta">
        <span>${s.eventCount} events</span>
        <span>${s.turnCount} turns</span>
        <span>${Math.round(s.maxPayloadBytes / 1024)}KB ctx</span>
        <span>${(s.errorRate * 100).toFixed(0)}% err</span>
        <span>${relativeTime(String(s.lastTs))}</span>
      </span>
    </a>`;
  }).join("\n");

  const maxToolCount = Math.max(...tools.map((t) => t.count), 1);
  const toolBars = tools.map((t) => {
    const pct = (t.count / maxToolCount) * 100;
    return `<div class="tool-bar">
      <span class="tool-bar-name">${esc(t.tool)}</span>
      <div class="tool-bar-fill" style="width:${pct}%"></div>
      <span class="tool-bar-count">${t.count}</span>
      ${t.errors > 0 ? `<span class="tool-bar-error">${t.errors} err (${(t.errorRate * 100).toFixed(0)}%)</span>` : ""}
    </div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dashboard — XTDB Event Stream</title>
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
        📊 Dashboard
      </h1>
    </div>
  </header>

  <main class="dash-page">
    <div class="dash-stats">${statCards}</div>

    <div class="dash-section">
      <h2>Sessions by Health</h2>
      ${sessionRows || '<p class="empty-msg">No sessions.</p>'}
    </div>

    <div class="dash-section">
      <h2>Tool Usage</h2>
      <div class="tool-bars">${toolBars || '<p class="empty-msg">No tool data.</p>'}</div>
    </div>
  </main>
</body>
</html>`;
}

function formatDuration(ms: number): string {
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

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
