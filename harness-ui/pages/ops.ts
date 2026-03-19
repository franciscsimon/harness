// ─── Ops Page ──────────────────────────────────────────────────
// Infrastructure status dashboard: health, backups, scheduler, replication.

import { layout } from "../components/layout.ts";
import { renderTable, type TableColumn } from "../components/table.ts";
import { badge, healthDot } from "../components/badge.ts";
import { fetchHealth, fetchBackups, fetchSchedulerStatus, fetchReplication } from "../lib/api.ts";
import { relativeTime, escapeHtml, formatDate } from "../lib/format.ts";

export async function renderOps(): Promise<string> {
  const [health, backups, scheduler, replication] = await Promise.all([
    fetchHealth().catch(() => null),
    fetchBackups().catch(() => null),
    fetchSchedulerStatus().catch(() => null),
    fetchReplication().catch(() => null),
  ]);

  const allDown = !health && !backups && !scheduler && !replication;

  const content = `
    <div class="page-header">
      <h1>🔧 Operations</h1>
      <p>Infrastructure status dashboard</p>
    </div>

    ${allDown ? '<div class="card"><div class="empty-state">Ops API unavailable — cannot fetch infrastructure data</div></div>' : ""}

    ${renderHealthSection(health)}
    ${renderReplicationSection(replication)}
    ${renderSchedulerSection(scheduler)}
    ${renderBackupsSection(backups)}
  `;

  return layout(content, { title: "Operations", activePath: "/ops" });
}

function renderHealthSection(health: any): string {
  if (!health) return "";

  return `
    <div class="section">
      <div class="section-header">
        <h2>System Health</h2>
        <span>${badge(health.overall ?? "unknown")}</span>
      </div>
      <div class="card">
        <table class="data-table">
          <thead><tr><th>Component</th><th>Status</th><th>Detail</th></tr></thead>
          <tbody>
            <tr>
              <td>XTDB Primary</td>
              <td>${healthDot(health.primary?.ok ?? false)}</td>
              <td>${health.primary?.latencyMs != null ? health.primary.latencyMs + "ms" : "—"}</td>
            </tr>
            <tr>
              <td>XTDB Replica</td>
              <td>${healthDot(health.replica?.ok ?? false)}</td>
              <td>${health.replica?.latencyMs != null ? health.replica.latencyMs + "ms" : "—"}</td>
            </tr>
            <tr>
              <td>Redpanda</td>
              <td>${healthDot(health.redpanda?.ok ?? false)}</td>
              <td>${health.redpanda?.topics != null ? health.redpanda.topics + " topics" : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderReplicationSection(repl: any): string {
  if (!repl) return "";

  const lag = repl.lagMs ?? repl.lag;
  const status = repl.status ?? (repl.ok ? "healthy" : "degraded");

  return `
    <div class="section">
      <div class="section-header">
        <h2>Replication</h2>
        <span>${badge(status)}</span>
      </div>
      <div class="card" style="padding:1rem">
        <div class="grid grid-3">
          <div>
            <div style="font-size:0.8rem;color:var(--text-dim)">Status</div>
            <div style="font-weight:600">${badge(status)}</div>
          </div>
          <div>
            <div style="font-size:0.8rem;color:var(--text-dim)">Lag</div>
            <div style="font-weight:600">${lag != null ? lag + "ms" : "—"}</div>
          </div>
          <div>
            <div style="font-size:0.8rem;color:var(--text-dim)">Last Check</div>
            <div style="font-weight:600">${repl.lastCheck ? relativeTime(repl.lastCheck) : "—"}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSchedulerSection(scheduler: any): string {
  if (!scheduler) return "";

  const status = scheduler.status ?? scheduler.state ?? "unknown";
  const nextRun = scheduler.nextRun ?? scheduler.next_run;
  const interval = scheduler.interval ?? scheduler.intervalMs;

  return `
    <div class="section">
      <div class="section-header">
        <h2>Backup Scheduler</h2>
        <span>${badge(status)}</span>
      </div>
      <div class="card" style="padding:1rem">
        <div class="grid grid-3">
          <div>
            <div style="font-size:0.8rem;color:var(--text-dim)">Status</div>
            <div style="font-weight:600">${badge(status)}</div>
          </div>
          <div>
            <div style="font-size:0.8rem;color:var(--text-dim)">Next Run</div>
            <div style="font-weight:600">${nextRun ? relativeTime(nextRun) : "—"}</div>
          </div>
          <div>
            <div style="font-size:0.8rem;color:var(--text-dim)">Interval</div>
            <div style="font-weight:600">${interval ? Math.round(interval / 60_000) + " min" : "—"}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderBackupsSection(backups: any[] | null): string {
  if (!backups) return "";

  const columns: TableColumn[] = [
    { key: "xt/id", label: "ID", render: (v, row) => {
      const id = v ?? row.id ?? row._id ?? "—";
      return `<span style="font-family:var(--mono);font-size:0.8rem">${escapeHtml(String(id).slice(-16))}</span>`;
    }},
    { key: "status", label: "Status", render: (v) => badge(String(v ?? "unknown")) },
    { key: "type", label: "Type", render: (v) => escapeHtml(String(v ?? "—")) },
    { key: "created_at", label: "Created", render: (v, row) => {
      const ts = v ?? row.timestamp ?? row.createdAt;
      return relativeTime(ts);
    }},
    { key: "size_bytes", label: "Size", render: (v) => {
      if (!v) return "—";
      const mb = Number(v) / (1024 * 1024);
      return mb >= 1 ? mb.toFixed(1) + " MB" : (Number(v) / 1024).toFixed(0) + " KB";
    }},
  ];

  return `
    <div class="section">
      <div class="section-header"><h2>Recent Backups</h2></div>
      ${renderTable(columns, backups, { emptyMessage: "No backups recorded" })}
    </div>
  `;
}
