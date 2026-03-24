// ─── Projects Page ─────────────────────────────────────────────
// Uses /api/projects from event-logger-ui for real project data.
// Falls back to deriving from decisions/artifacts if API unavailable.

import { layout } from "../components/layout.ts";
import {
  fetchArtifacts,
  fetchDecisions,
  fetchIncidents,
  fetchProjectDetail,
  fetchProjects,
  fetchTestRuns,
} from "../lib/api.ts";
import { escapeHtml, formatDate, relativeTime } from "../lib/format.ts";

export async function renderProjects(): Promise<string> {
  const projects = await fetchProjects();

  let cards = "";
  let count = 0;

  if (projects && projects.length > 0) {
    count = projects.length;
    cards = projects
      .map((p: any) => {
        const name = p.name || p.canonical_id?.split("/").pop() || p._id;
        const phase = p.lifecycle_phase || "active";
        const phaseColor =
          phase === "active"
            ? "#22c55e"
            : phase === "maintenance"
              ? "#eab308"
              : phase === "deprecated"
                ? "#f97316"
                : "#6b7280";
        return `<a class="proj-card" href="/projects/${encodeURIComponent(p._id)}">
        <div class="proj-card-top">
          <span class="proj-card-name">${escapeHtml(name)}</span>
          <span class="proj-type-badge" style="--type-color:${phaseColor}">${escapeHtml(phase)}</span>
          <span class="ses-card-count">${p.session_count ?? "—"} sessions</span>
        </div>
        <div class="proj-card-meta"><code class="proj-canonical">${escapeHtml(p.canonical_id || p._id)}</code></div>
        <div class="proj-card-meta">
          ${p.git_remote_url ? `<span>🔗 ${escapeHtml(p.git_remote_url)}</span>` : ""}
          <span>Last seen: ${relativeTime(p.last_seen_ts)}</span>
        </div>
      </a>`;
      })
      .join("\n");
  } else {
    // Fallback: derive from decisions
    const decisions = await fetchDecisions(500);
    const projectMap = new Map<string, { decisions: number; lastTs: number }>();
    for (const d of decisions ?? []) {
      if (!d.project_id) continue;
      const p = projectMap.get(d.project_id) ?? { decisions: 0, lastTs: 0 };
      p.decisions++;
      if (Number(d.ts) > p.lastTs) p.lastTs = Number(d.ts);
      projectMap.set(d.project_id, p);
    }
    count = projectMap.size;
    cards = [...projectMap.entries()]
      .sort((a, b) => b[1].lastTs - a[1].lastTs)
      .map(([id, data]) => {
        const name = id.split("/").pop() ?? id;
        return `<a class="proj-card" href="/projects/${encodeURIComponent(id)}">
        <div class="proj-card-top">
          <span class="proj-card-name">${escapeHtml(name)}</span>
          <span class="ses-card-count">${data.decisions} decisions</span>
        </div>
        <div class="proj-card-meta"><code class="proj-canonical">${escapeHtml(id)}</code></div>
        <div class="proj-card-meta"><span>Last: ${relativeTime(String(data.lastTs))}</span></div>
      </a>`;
      })
      .join("\n");
  }

  const content = `
    <div class="page-header">
      <h1>📁 Projects</h1>
      <span class="total-badge">${count} project${count !== 1 ? "s" : ""}</span>
    </div>
    <main class="ses-list">
      ${count === 0 ? '<p class="empty-msg">No projects found.</p>' : cards}
    </main>
  `;
  return layout(content, { title: "Projects", activePath: "/projects" });
}

// ─── Project Detail ────────────────────────────────────────────

export async function renderProjectDetail(projectId: string): Promise<string> {
  const detail = await fetchProjectDetail(projectId);
  const name = projectId.split("/").pop() ?? projectId;

  if (!detail?.project) {
    // Fallback: show decisions/artifacts for this project
    const [decisions, artifacts] = await Promise.all([fetchDecisions(500), fetchArtifacts()]);
    const projDec = (decisions ?? []).filter((d: any) => d.project_id === projectId);
    const projArt = (artifacts ?? []).filter((a: any) => a.project_id === projectId);

    const content = `
      <div class="page-header"><h1>📁 ${escapeHtml(name)}</h1></div>
      <section class="proj-info"><table class="proj-info-table">
        <tr><td class="proj-label">ID</td><td><code>${escapeHtml(projectId)}</code></td></tr>
        <tr><td class="proj-label">Decisions</td><td>${projDec.length}</td></tr>
        <tr><td class="proj-label">Artifacts</td><td>${projArt.length}</td></tr>
      </table></section>
      <p class="empty-msg">Full project data unavailable. Showing derived data from decisions/artifacts.</p>
    `;
    return layout(content, { title: name, activePath: "/projects", projectId, activeSection: "overview" });
  }

  // Fetch additional data in parallel
  const [decisions, testRuns, incidents] = await Promise.all([
    fetchDecisions(500),
    fetchTestRuns(projectId),
    fetchIncidents(),
  ]);

  const p = detail.project;
  const sessions = detail.sessions ?? [];
  const dependencies = detail.dependencies ?? [];
  const tags = detail.tags ?? [];
  const decommissions = detail.decommissions ?? [];
  const lifecycleEvents = detail.lifecycleEvents ?? [];
  const projDecisions = (decisions ?? []).filter((d: any) => d.project_id === projectId);
  const projTestRuns = testRuns ?? [];
  const projIncidents = (incidents ?? []).filter((i: any) => i.project_id === projectId);

  // Project info table
  const infoRows = [
    ["ID", `<code>${escapeHtml(p._id)}</code>`],
    ["Canonical ID", `<code>${escapeHtml(p.canonical_id || "—")}</code>`],
    ["Name", escapeHtml(p.name || "—")],
    ["Type", escapeHtml(p.identity_type || "—")],
    [
      "Git Remote",
      p.git_remote_url
        ? `<a href="${escapeHtml(p.git_remote_url)}" target="_blank">${escapeHtml(p.git_remote_url)}</a>`
        : "—",
    ],
    ["Git Root", `<code>${escapeHtml(p.git_root_path || "—")}</code>`],
    ["First Seen", formatDate(p.first_seen_ts)],
    ["Last Seen", `${formatDate(p.last_seen_ts)} (${relativeTime(p.last_seen_ts)})`],
    ["Sessions", String(p.session_count ?? sessions.length)],
    ["Phase", escapeHtml(p.lifecycle_phase || "active")],
  ]
    .map(([k, v]) => `<tr><td class="proj-label">${k}</td><td>${v}</td></tr>`)
    .join("\n");

  // Sessions section
  const sessionRows = sessions
    .map((s: any) => {
      const sName = (s.session_id || "").split("/").pop() || s._id;
      return `<tr>
      <td><a href="/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(s.session_id || s._id)}">${escapeHtml(sName)}</a></td>
      <td><code>${escapeHtml(s.cwd || "—")}</code></td>
      <td>${relativeTime(s.ts)}</td>
    </tr>`;
    })
    .join("\n");

  // Tags
  const tagBadges = tags
    .map((t: any) => `<span class="proj-type-badge" style="--type-color:#3b82f6">${escapeHtml(t.tag)}</span>`)
    .join(" ");

  // Dependencies
  const depRows = dependencies
    .map(
      (d: any) =>
        `<tr><td><code>${escapeHtml(d.name)}</code></td><td>${escapeHtml(d.version || "—")}</td><td>${escapeHtml(d.dep_type || "—")}</td></tr>`,
    )
    .join("\n");

  // Lifecycle events
  const lcRows = lifecycleEvents
    .map(
      (e: any) =>
        `<tr><td>${escapeHtml(e.event_type || e._id)}</td><td>${escapeHtml(e.summary || "—")}</td><td>${relativeTime(e.ts)}</td></tr>`,
    )
    .join("\n");

  // Decommissions
  const decomRows = decommissions
    .map(
      (d: any) =>
        `<tr><td>${escapeHtml(d.reason || "—")}</td><td>${escapeHtml(d.decommissioned_by || "—")}</td><td>${relativeTime(d.ts)}</td></tr>`,
    )
    .join("\n");

  const content = `
    <div class="page-header"><h1>📁 ${escapeHtml(p.name || name)}</h1></div>

    <section class="proj-info"><table class="proj-info-table">${infoRows}</table></section>

    ${
      sessions.length > 0
        ? `<section class="proj-sessions-section">
      <h2>📂 Sessions <span class="total-badge">${sessions.length}</span></h2>
      <table class="proj-info-table"><thead><tr><th>Session</th><th>CWD</th><th>When</th></tr></thead><tbody>${sessionRows}</tbody></table>
    </section>`
        : ""
    }

    ${tags.length > 0 ? `<section class="proj-sessions-section"><h2>🏷️ Tags</h2><div style="padding:0.5rem 0">${tagBadges}</div></section>` : ""}

    ${
      dependencies.length > 0
        ? `<section class="proj-sessions-section">
      <h2>📦 Dependencies <span class="total-badge">${dependencies.length}</span></h2>
      <table class="proj-info-table"><thead><tr><th>Name</th><th>Version</th><th>Type</th></tr></thead><tbody>${depRows}</tbody></table>
    </section>`
        : ""
    }

    ${
      lifecycleEvents.length > 0
        ? `<section class="proj-sessions-section">
      <h2>📅 Lifecycle Events <span class="total-badge">${lifecycleEvents.length}</span></h2>
      <table class="proj-info-table"><thead><tr><th>Event</th><th>Summary</th><th>When</th></tr></thead><tbody>${lcRows}</tbody></table>
    </section>`
        : ""
    }

    ${
      decommissions.length > 0
        ? `<section class="proj-sessions-section">
      <h2>🗑️ Decommissions <span class="total-badge">${decommissions.length}</span></h2>
      <table class="proj-info-table"><thead><tr><th>Reason</th><th>By</th><th>When</th></tr></thead><tbody>${decomRows}</tbody></table>
    </section>`
        : ""
    }

    ${
      projDecisions.length > 0
        ? `<section class="proj-sessions-section">
      <h2>📋 Decisions <span class="total-badge">${projDecisions.length}</span></h2>
      <table class="proj-info-table"><thead><tr><th>Task</th><th>What</th><th>Outcome</th><th>When</th></tr></thead><tbody>
      ${projDecisions
        .slice(0, 20)
        .map(
          (d: any) =>
            `<tr><td>${escapeHtml(d.task ?? "—")}</td><td>${escapeHtml((d.what ?? "—").slice(0, 80))}</td><td>${d.outcome === "success" ? "✅" : d.outcome === "failure" ? "❌" : "⏸️"} ${escapeHtml(d.outcome ?? "—")}</td><td>${relativeTime(d.ts)}</td></tr>`,
        )
        .join("\n")}
      </tbody></table>
    </section>`
        : ""
    }

    ${
      projTestRuns.length > 0
        ? `<section class="proj-sessions-section">
      <h2>🧪 Test Runs <span class="total-badge">${projTestRuns.length}</span></h2>
      <table class="proj-info-table"><thead><tr><th>Suite</th><th>Status</th><th>Passed</th><th>Failed</th><th>Duration</th><th>When</th></tr></thead><tbody>
      ${projTestRuns
        .slice(0, 20)
        .map(
          (t: any) =>
            `<tr><td>${escapeHtml(t.suite_name ?? "—")}</td><td>${t.status === "passed" ? "✅" : "❌"} ${escapeHtml(t.status ?? "—")}</td><td>${t.passed ?? 0}</td><td>${t.failed ?? 0}</td><td>${t.duration_ms ? `${t.duration_ms}ms` : "—"}</td><td>${relativeTime(t.ts)}</td></tr>`,
        )
        .join("\n")}
      </tbody></table>
    </section>`
        : ""
    }

    ${
      projIncidents.length > 0
        ? `<section class="proj-sessions-section">
      <h2>🚨 Incidents <span class="total-badge">${projIncidents.length}</span></h2>
      <table class="proj-info-table"><thead><tr><th>Title</th><th>Severity</th><th>Status</th><th>When</th></tr></thead><tbody>
      ${projIncidents.map((i: any) => `<tr><td>${escapeHtml(i.title ?? "—")}</td><td>${escapeHtml(i.severity ?? "—")}</td><td>${escapeHtml(i.status ?? "—")}</td><td>${relativeTime(i.ts ?? i.started_ts)}</td></tr>`).join("\n")}
      </tbody></table>
    </section>`
        : ""
    }

    ${
      p.jsonld
        ? `<section class="proj-sessions-section">
      <h2>JSON-LD</h2>
      <details class="err-details"><summary>View JSON-LD</summary><pre class="err-stack">${escapeHtml(typeof p.jsonld === "string" ? p.jsonld : JSON.stringify(p.jsonld, null, 2))}</pre></details>
    </section>`
        : ""
    }
  `;

  return layout(content, { title: p.name || name, activePath: "/projects", projectId, activeSection: "overview" });
}
