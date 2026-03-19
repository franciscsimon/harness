import { layout } from "../components/layout.ts";
import { renderTable, type TableColumn } from "../components/table.ts";
import { badge, healthDot } from "../components/badge.ts";
import { fetchHealth, fetchBackups, fetchScheduler, fetchReplication } from "../lib/api.ts";
import { relativeTime, escapeHtml } from "../lib/format.ts";

export async function renderOps(): Promise<string> {
  const [health, backups, scheduler, replication] = await Promise.all([
    fetchHealth(),
    fetchBackups(),
    fetchScheduler(),
    fetchReplication(),
  ]);

  const content = `
    <div class="page-header">
      <h1>Operations</h1>
      <p>Infrastructure status</p>
    </div>

    ${renderHealth(health)}
    ${renderRepl(replication)}
    ${renderSched(scheduler)}
    ${renderBackups(backups)}
  `;

  return layout(content, { title: "Operations", activePath: "/ops" });
}

function renderHealth(health: any): string {
  if (!health) return `<div class="empty-state">Ops API unavailable</div>`;

  const components: any[] = health.components ?? [];
  return `
    <h2>System Health — ${badge(health.overall ?? "unknown")}</h2>
    <table class="data-table">
      <thead><tr><th>Component</th><th>Status</th><th>Checked</th></tr></thead>
      <tbody>
        ${components.map((c: any) => `
          <tr>
            <td>${escapeHtml(c.name)}</td>
            <td>${healthDot(c.status === "healthy", c.status)}</td>
            <td>${c.checkedAt ? relativeTime(new Date(c.checkedAt).getTime()) : "—"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderRepl(repl: any): string {
  if (!repl) return "";
  return `
    <h2>Replication</h2>
    <div class="stats-row">
      <div class="stat-card"><div class="stat-value">${repl.primary ?? "—"}</div><div class="stat-label">Primary Rows</div></div>
      <div class="stat-card"><div class="stat-value">${repl.replica ?? "—"}</div><div class="stat-label">Replica Rows</div></div>
      <div class="stat-card"><div class="stat-value">${repl.lag ?? "—"}</div><div class="stat-label">Lag</div></div>
      <div class="stat-card"><div class="stat-value">${repl.synced ? "✅" : "⚠️"}</div><div class="stat-label">Synced</div></div>
    </div>
  `;
}

function renderSched(sched: any): string {
  if (!sched) return "";
  return `
    <h2>Backup Scheduler</h2>
    <div class="stats-row">
      <div class="stat-card"><div class="stat-value">${sched.running ? "Running" : "Stopped"}</div><div class="stat-label">Status</div></div>
      <div class="stat-card"><div class="stat-value">${sched.intervalHours ?? "—"}h</div><div class="stat-label">Interval</div></div>
      <div class="stat-card"><div class="stat-value">${sched.lastRun ? relativeTime(sched.lastRun) : "—"}</div><div class="stat-label">Last Run</div></div>
    </div>
  `;
}

function renderBackups(backups: any[] | null): string {
  if (!backups || backups.length === 0) return `<h2>Backups</h2><div class="empty-state">No backups found</div>`;

  const cols: TableColumn[] = [
    { key: "filename", label: "File", render: (v) => `<code>${escapeHtml(String(v ?? "—"))}</code>` },
    { key: "size", label: "Size", render: (v) => {
      if (!v) return "—";
      const mb = Number(v) / (1024 * 1024);
      return mb >= 1 ? mb.toFixed(1) + " MB" : (Number(v) / 1024).toFixed(0) + " KB";
    }},
    { key: "created", label: "Created", render: (v) => v ? relativeTime(new Date(v).getTime()) : "—" },
  ];

  return `<h2>Backups</h2>${renderTable(cols, backups, { emptyMessage: "No backups" })}`;
}
