import { html } from "hono/html";

function badge(value: string, prefix = "") {
  const cls = `badge badge-${(value || "").toLowerCase().replace(/\s+/g, "-")}`;
  return html`<span class="${cls}">${prefix}${value || "unknown"}</span>`;
}

function formatTs(ts: string | number | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

function tableSection(title: string, headers: string[], rows: any[][]) {
  if (!rows.length) {
    return html`
      <div class="section">
        <h2>${title}</h2>
        <p style="color:#8b949e;margin:0.5rem 0">No ${title.toLowerCase()} found.</p>
      </div>`;
  }
  return html`
    <div class="section">
      <h2>${title}</h2>
      <table>
        <thead><tr>${headers.map((h) => html`<th>${h}</th>`)}</tr></thead>
        <tbody>${rows.map((cells) => html`<tr>${cells.map((cell) => html`<td>${cell}</td>`)}</tr>`)}</tbody>
      </table>
    </div>`;
}

export function projectPage(
  project: any,
  requirements: any[],
  releases: any[],
  deployments: any[],
  testRuns: any[],
  incidents: any[],
) {
  const tags = (project.tags || []).map((t: string) => html`<span class="tag">${t}</span>`);

  return html`
    <div style="margin-bottom:1rem">
      <a href="/dashboard" style="color:#58a6ff;text-decoration:none">← Back to Portfolio</a>
    </div>

    <h1>${project.name || project._id}</h1>
    <div style="margin:0.5rem 0">
      ${badge(project.lifecycle_phase)}
      ${tags}
    </div>
    ${project.description ? html`<p style="color:#8b949e;margin:0.5rem 0">${project.description}</p>` : ""}

    ${tableSection(
      "Requirements",
      ["ID", "Title", "Status", "Priority"],
      requirements.map((r) => [r._id, r.title || "—", badge(r.status), r.priority || "—"]),
    )}

    ${tableSection(
      "Releases",
      ["ID", "Version", "Status", "Released"],
      releases.map((r) => [r._id, r.version || "—", badge(r.status), formatTs(r.released_at)]),
    )}

    ${tableSection(
      "Deployments",
      ["ID", "Environment", "Status", "Deployed"],
      deployments.map((d) => [d._id, d.environment || "—", badge(d.status), formatTs(d.deployed_at)]),
    )}

    ${tableSection(
      "Test Runs",
      ["ID", "Suite", "Status", "Passed", "Failed", "Run At"],
      testRuns.map((t) => [
        t._id,
        t.suite || "—",
        badge(t.status),
        t.passed ?? "—",
        t.failed ?? "—",
        formatTs(t.run_at),
      ]),
    )}

    ${tableSection(
      "Incidents",
      ["ID", "Title", "Severity", "Status", "Opened"],
      incidents.map((i) => [
        i._id,
        i.title || "—",
        i.severity || "—",
        badge(i.status),
        formatTs(i.opened_at || i.created_at),
      ]),
    )}
  `;
}
