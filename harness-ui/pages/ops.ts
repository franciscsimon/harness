// ─── Ops Page ──────────────────────────────────────────────────
// Ported from xtdb-event-logger-ui/pages/ops.ts
// The original is client-side JS that polls the ops API.
// This version renders server-side from the same API endpoints.

import { layout } from "../components/layout.ts";
import { fetchHealth, fetchBackups, fetchScheduler, fetchReplication, fetchIncidents } from "../lib/api.ts";
import { relativeTime, escapeHtml } from "../lib/format.ts";

function statusDot(status: string): string {
  const color = status === "healthy" ? "#22c55e" : status === "degraded" ? "#eab308" : "#ef4444";
  return `<span class="ops-status-dot" style="background:${color}"></span>`;
}

export async function renderOps(): Promise<string> {
  const [health, backups, scheduler, replication, incidents] = await Promise.all([
    fetchHealth(),
    fetchBackups(),
    fetchScheduler(),
    fetchReplication(),
    fetchIncidents(),
  ]);

  const content = `
    <div class="page-header">
      <h1>🔧 Operations</h1>
    </div>

    ${renderHealthSection(health)}
    ${renderReplicationSection(replication)}
    ${renderSchedulerSection(scheduler)}
    ${renderBackupsSection(backups)}
    ${renderIncidentsSection(incidents)}

    ${!health ? '<div class="ops-api-banner ops-api-down"><p>Ops API unavailable at <code>localhost:3335</code> — start with: <code>task ops:api</code></p></div>' : ""}
  `;

  return layout(content, { title: "Operations", activePath: "/ops" });
}

function renderHealthSection(health: any): string {
  if (!health) return "";

  const components: any[] = health.components ?? [];
  const cards = components.map((c: any) => {
    const details = c.details ?? {};
    let detailHtml = "";

    if (c.name === "redpanda") {
      detailHtml = details.healthy ? "Cluster healthy" : "Cluster unhealthy";
    } else if (c.name === "primary" || c.name === "replica") {
      const parts: string[] = [];
      if (details.healthz != null) parts.push(`healthz: ${details.healthz ? "✅" : "❌"}`);
      if (details.pgwire != null) parts.push(`pgwire: ${details.pgwire ? "✅" : "❌"}`);
      if (details.port) parts.push(`port: ${details.port}`);
      detailHtml = parts.join(" · ");
    }

    return `<div class="ops-health-card">
      <div class="ops-hc-name">${statusDot(c.status)} ${escapeHtml(c.name)}</div>
      <div class="ops-hc-status ops-hc-status-${c.status}">${escapeHtml(c.status)}</div>
      ${detailHtml ? `<div class="ops-hc-details">${detailHtml}</div>` : ""}
      <div class="ops-hc-checked">${c.checkedAt ? relativeTime(String(new Date(c.checkedAt).getTime())) : ""}</div>
    </div>`;
  }).join("\n");

  return `
    <div class="ops-section">
      <div class="ops-section-header">
        <h2>Cluster Health</h2>
        <span class="health-badge health-badge-${health.overall === "healthy" ? "green" : "red"}">${escapeHtml(health.overall)}</span>
      </div>
      <div class="ops-health-cards">${cards}</div>
    </div>
  `;
}

function renderReplicationSection(repl: any): string {
  if (!repl) return `
    <div class="ops-section">
      <h2>Replication</h2>
      <p class="empty-msg">Replication data unavailable (auth may be required — set AUTH_ENABLED=false)</p>
    </div>`;

  return `
    <div class="ops-section">
      <h2>Replication</h2>
      <div class="ops-replication">
        <div class="ops-repl-stat"><span class="ops-repl-label">Primary events</span><span class="ops-repl-value">${repl.primary ?? "—"}</span></div>
        <div class="ops-repl-stat"><span class="ops-repl-label">Replica events</span><span class="ops-repl-value">${repl.replica ?? "—"}</span></div>
        <div class="ops-repl-stat"><span class="ops-repl-label">Lag</span><span class="ops-repl-value">${repl.lag ?? "—"}</span></div>
        <div class="ops-repl-stat"><span class="ops-repl-label">Synced</span><span class="ops-repl-value">${repl.synced ? "✅" : "⚠️"}</span></div>
      </div>
    </div>
  `;
}

function renderSchedulerSection(sched: any): string {
  if (!sched) return `
    <div class="ops-section">
      <h2>Backup Scheduler</h2>
      <p class="empty-msg">Scheduler data unavailable (auth may be required — set AUTH_ENABLED=false)</p>
    </div>`;

  return `
    <div class="ops-section">
      <h2>Backup Scheduler</h2>
      <div class="ops-replication">
        <div class="ops-repl-stat"><span class="ops-repl-label">Status</span><span class="ops-repl-value">${sched.running ? "🟢 Running" : "⏸ Stopped"}</span></div>
        <div class="ops-repl-stat"><span class="ops-repl-label">Interval</span><span class="ops-repl-value">${sched.intervalHours ?? "—"}h</span></div>
        <div class="ops-repl-stat"><span class="ops-repl-label">Last Run</span><span class="ops-repl-value">${sched.lastRun ? relativeTime(String(new Date(sched.lastRun).getTime())) : "Never"}</span></div>
      </div>
    </div>
  `;
}

function renderBackupsSection(backups: any[] | null): string {
  if (!backups) return `
    <div class="ops-section">
      <h2>Backup History</h2>
      <p class="empty-msg">Backup data unavailable (auth may be required — set AUTH_ENABLED=false)</p>
    </div>`;

  if (backups.length === 0) return `
    <div class="ops-section">
      <h2>Backup History</h2>
      <p class="empty-msg">No backups recorded.</p>
    </div>`;

  const rows = backups.map((b: any) => {
    const size = b.sizeHuman ?? (b.sizeBytes ? (Number(b.sizeBytes) / (1024 * 1024)).toFixed(1) + " MB" : "—");
    return `<tr>
      <td><code>${escapeHtml(b.filename ?? b._id ?? "—")}</code></td>
      <td>${size}</td>
      <td>${b.modifiedAt ? relativeTime(String(new Date(b.modifiedAt).getTime())) : "—"}</td>
      <td>${escapeHtml(b.type ?? "—")}</td>
    </tr>`;
  }).join("\n");

  return `
    <div class="ops-section">
      <h2>Backup History</h2>
      <table class="error-patterns-table">
        <thead><tr><th>File</th><th>Size</th><th>Created</th><th>Type</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderIncidentsSection(incidents: any[] | null): string {
  if (!incidents) return "";
  const open = incidents.filter((i: any) => i.status === "open");
  if (open.length === 0) return "";

  const rows = open.map((i: any) => {
    const sevColor = i.severity === "critical" ? "#ef4444" : i.severity === "warning" ? "#eab308" : "#6b7280";
    return `<div class="dec-card">
      <div class="dec-card-top">
        <span class="dec-outcome-badge" style="--outcome-color:${sevColor}">${escapeHtml(i.severity ?? "unknown")}</span>
        <span class="dec-date">${escapeHtml(i.status ?? "open")}</span>
        <span class="dec-ago">${i.started_ts ? relativeTime(i.started_ts) : "—"}</span>
      </div>
      <div class="dec-what">${escapeHtml(i.title ?? "Untitled")}</div>
    </div>`;
  }).join("\n");

  return `
    <div class="ops-section">
      <h2>Open Incidents <span class="total-badge">${open.length}</span></h2>
      <div class="dec-list">${rows}</div>
    </div>
  `;
}
