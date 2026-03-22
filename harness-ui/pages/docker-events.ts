// ─── Docker Events Page ───────────────────────────────────────
// Shows Docker container lifecycle events from XTDB.

import { layout } from "../components/layout.ts";
import { escapeHtml, relativeTime, formatDuration } from "../lib/format.ts";

const EVENT_API = process.env.EVENT_API_URL ?? "http://localhost:3333";
const COLLECTOR_URL = process.env.COLLECTOR_URL ?? "http://docker-event-collector:3338";

interface DockerEvent {
  _id: string;
  event_type: string;
  action: string;
  container_name: string;
  service_name: string;
  compose_project: string;
  image: string;
  exit_code: number | null;
  severity: string;
  ts: number;
}

interface Summary {
  total: number;
  bySeverity: Record<string, number>;
  topServices: { name: string; count: number }[];
  recentCritical: DockerEvent[];
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#da3633",
  error: "#da3633",
  warning: "#d29922",
  info: "#8b949e",
};

const SEVERITY_EMOJI: Record<string, string> = {
  critical: "🔴",
  error: "🔴",
  warning: "🟡",
  info: "⚪",
};

export async function renderDockerEvents(projectId?: string): Promise<string> {
  let events: DockerEvent[] = [];
  let summary: Summary = { total: 0, bySeverity: {}, topServices: [], recentCritical: [] };
  let collectorHealth: any = null;

  try {
    const [evRes, sumRes, healthRes] = await Promise.all([
      fetch(`${EVENT_API}/api/docker-events?limit=100`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${EVENT_API}/api/docker-events/summary`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${COLLECTOR_URL}/api/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null),
    ]);
    if (evRes.ok) events = await evRes.json();
    if (sumRes.ok) summary = await sumRes.json();
    if (healthRes?.ok) collectorHealth = await healthRes.json();
  } catch { /* best effort */ }

  // Summary cards
  const summaryCards = `
    <div class="summary-cards">
      <div class="summary-card">
        <div class="summary-value">${summary.total}</div>
        <div class="summary-label">Total Events</div>
      </div>
      <div class="summary-card" style="border-color:#da3633">
        <div class="summary-value" style="color:#da3633">${(summary.bySeverity.critical ?? 0) + (summary.bySeverity.error ?? 0)}</div>
        <div class="summary-label">Errors</div>
      </div>
      <div class="summary-card" style="border-color:#d29922">
        <div class="summary-value" style="color:#d29922">${summary.bySeverity.warning ?? 0}</div>
        <div class="summary-label">Warnings</div>
      </div>
      <div class="summary-card" style="border-color:#238636">
        <div class="summary-value" style="color:#238636">${collectorHealth ? "✅" : "❌"}</div>
        <div class="summary-label">Collector</div>
      </div>
    </div>
  `;

  // Filter buttons
  const filterBar = `
    <div style="margin:1rem 0;display:flex;gap:0.5rem;flex-wrap:wrap">
      <a href="?" class="btn ${!projectId ? "active" : ""}">All</a>
      <a href="?severity=error" class="btn">🔴 Errors</a>
      <a href="?severity=warning" class="btn">🟡 Warnings</a>
      <a href="?action=die" class="btn">💀 Dies</a>
      <a href="?action=oom" class="btn">💥 OOM</a>
      <a href="?action=health_status" class="btn">❤️ Health</a>
    </div>
  `;

  // Event table — exclude exec noise for the default view
  const displayEvents = events.filter(e => !e.action.startsWith("exec_"));
  const rows = displayEvents.map(e => {
    const color = SEVERITY_COLORS[e.severity] ?? "#8b949e";
    const emoji = SEVERITY_EMOJI[e.severity] ?? "⚪";
    const time = e.ts ? relativeTime(Number(e.ts)) : "—";
    const exitStr = e.exit_code != null && e.exit_code !== 0 ? ` (exit ${e.exit_code})` : "";
    return `<tr>
      <td>${time}</td>
      <td style="color:${color};font-weight:600">${emoji} ${e.severity}</td>
      <td><code>${escapeHtml(e.action)}${exitStr}</code></td>
      <td><strong>${escapeHtml(e.container_name || "—")}</strong></td>
      <td>${escapeHtml(e.service_name || "—")}</td>
      <td>${escapeHtml(e.compose_project || "—")}</td>
    </tr>`;
  }).join("\n");

  // Top services
  const svcList = summary.topServices.map(s =>
    `<span class="badge">${escapeHtml(s.name)}: ${s.count}</span>`
  ).join(" ");

  const content = `
    <main>
      <div class="page-header">
        <h1>🐳 Docker Events</h1>
        <div>
          ${collectorHealth ? `<span style="color:#8b949e;font-size:0.85rem">📊 ${collectorHealth.collector?.totalReceived ?? 0} received, ${collectorHealth.writer?.totalWritten ?? 0} written</span>` : ""}
        </div>
      </div>

      ${summaryCards}
      ${filterBar}

      ${summary.topServices.length > 0 ? `<div style="margin-bottom:1rem"><strong>Top services:</strong> ${svcList}</div>` : ""}

      ${summary.recentCritical.length > 0 ? `
        <div class="card" style="border-color:#da3633;margin-bottom:1rem">
          <h3 style="color:#da3633;margin-top:0">⚠️ Recent Critical/Error Events</h3>
          ${summary.recentCritical.map(e => `
            <div style="padding:0.25rem 0;border-bottom:1px solid #21262d">
              ${SEVERITY_EMOJI[e.severity] ?? "⚪"} <code>${escapeHtml(e.action)}</code>
              — <strong>${escapeHtml(e.container_name)}</strong>
              ${e.exit_code ? ` (exit ${e.exit_code})` : ""}
              <span style="color:#8b949e;margin-left:0.5rem">${relativeTime(Number(e.ts))}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}

      ${displayEvents.length === 0 ? '<p class="empty-msg">No Docker events yet (excluding exec events). The collector may still be starting.</p>' : `
      <div class="card" style="overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr><th>Time</th><th>Severity</th><th>Action</th><th>Container</th><th>Service</th><th>Project</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      `}

      <details style="margin-top:1rem">
        <summary style="cursor:pointer;color:#8b949e">Show all events (including exec health checks)</summary>
        <div class="card" style="overflow-x:auto;margin-top:0.5rem">
          <table class="data-table">
            <thead>
              <tr><th>Time</th><th>Severity</th><th>Action</th><th>Container</th><th>Service</th></tr>
            </thead>
            <tbody>
              ${events.slice(0, 50).map(e => `<tr>
                <td>${e.ts ? relativeTime(Number(e.ts)) : "—"}</td>
                <td style="color:${SEVERITY_COLORS[e.severity] ?? "#8b949e"}">${e.severity}</td>
                <td><code>${escapeHtml(e.action.slice(0, 60))}</code></td>
                <td>${escapeHtml(e.container_name || "—")}</td>
                <td>${escapeHtml(e.service_name || "—")}</td>
              </tr>`).join("\n")}
            </tbody>
          </table>
        </div>
      </details>
    </main>
  `;

  return layout(content, {
    title: "Docker Events",
    activePath: projectId ? `/projects/${projectId}/docker-events` : "/docker-events",
    projectId,
    activeSection: "docker-events",
  });
}
