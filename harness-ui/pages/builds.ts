import { layout } from "../components/layout.ts";
import { escapeHtml, formatDuration, relativeTime } from "../lib/format.ts";

const BUILD_API = process.env.BUILD_SERVICE_URL ?? "http://build-service:3339";

export async function renderBuilds(projectId?: string): Promise<string> {
  let builds: any[] = [];
  try {
    const r = await fetch(`${BUILD_API}/api/builds`, { signal: AbortSignal.timeout(10000) });
    if (r.ok) builds = await r.json();
  } catch {
    /* intentionally silent — page renders empty state */
  }

  const rows = builds
    .map((b: any) => {
      const icon = b.status === "success" ? "✅" : b.status === "partial" ? "⚠️" : "❌";
      const hash = (b.commit_hash ?? "").slice(0, 8);
      const dur = formatDuration(b.duration_ms ?? 0);
      const time = b.ts ? relativeTime(b.ts) : "—";
      const svcOk = b.services_ok ?? 0;
      const svcTotal = b.services_total ?? 0;
      const trigger = b.trigger ?? "—";
      const detailUrl = projectId
        ? `/projects/${projectId}/builds/${encodeURIComponent(b._id)}`
        : `/builds/${encodeURIComponent(b._id)}`;

      let svcDetail = "";
      if (b.service_results) {
        try {
          const services = JSON.parse(b.service_results);
          svcDetail = services
            .map(
              (s: any) =>
                `<span class="badge ${s.status === "success" ? "badge-ok" : "badge-fail"}">${escapeHtml(s.name)}</span>`,
            )
            .join(" ");
        } catch {
          /* intentionally silent — malformed JSON */
        }
      }

      return `<tr>
      <td>${icon}</td>
      <td><a href="${detailUrl}"><code>${hash}</code></a></td>
      <td>${escapeHtml(trigger)}</td>
      <td>${svcOk}/${svcTotal}</td>
      <td class="svc-badges">${svcDetail}</td>
      <td>${dur}</td>
      <td>${time}</td>
    </tr>`;
    })
    .join("\n");

  const triggerBtn = `<form method="POST" action="${projectId ? `/projects/${projectId}/builds/trigger` : `/builds/trigger`}" style="display:inline">
    <button type="submit" class="btn btn-primary">🔨 Trigger Build</button>
  </form>`;

  const body = `<main class="container">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h1>Builds</h1>
      ${triggerBtn}
    </div>
    ${
      builds.length === 0
        ? `<p class="empty-msg">No builds recorded yet. Push code or trigger a build manually.</p>`
        : `<table class="data-table">
        <thead><tr>
          <th></th><th>Commit</th><th>Trigger</th><th>Services</th><th>Details</th><th>Duration</th><th>When</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`
    }
  </main>`;

  return layout(body, {
    title: "Builds",
    activePath: projectId ? `/projects/${projectId}/builds` : "/builds",
    projectId,
    activeSection: "builds",
  });
}

export async function renderBuildDetail(buildId: string, projectId?: string): Promise<string> {
  let build: any = null;
  try {
    const r = await fetch(`${BUILD_API}/api/builds/${encodeURIComponent(buildId)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) build = await r.json();
  } catch {
    /* intentionally silent — page renders not-found */
  }

  if (!build) {
    return layout(
      `<main class="container"><h1>Build Not Found</h1><p>No build with ID <code>${escapeHtml(buildId)}</code></p></main>`,
      {
        title: "Build Not Found",
        projectId,
        activeSection: "builds",
      },
    );
  }

  const icon = build.status === "success" ? "✅" : build.status === "partial" ? "⚠️" : "❌";

  let servicesHtml = "";
  if (build.service_results) {
    try {
      const services = JSON.parse(build.service_results);
      const svcRows = services
        .map((s: any) => {
          const sIcon = s.status === "success" ? "✅" : "❌";
          const tags = (s.tags ?? []).map((t: string) => `<code>${escapeHtml(t)}</code>`).join(", ");
          return `<tr>
          <td>${sIcon}</td>
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.image ?? "—")}</td>
          <td>${tags || "—"}</td>
          <td>${formatDuration(s.durationMs ?? 0)}</td>
          <td>${s.error ? `<pre class="error-output">${escapeHtml(s.error.slice(-500))}</pre>` : "—"}</td>
        </tr>`;
        })
        .join("\n");

      servicesHtml = `<h2>Services</h2>
        <table class="data-table">
        <thead><tr><th></th><th>Service</th><th>Image</th><th>Tags</th><th>Duration</th><th>Error</th></tr></thead>
        <tbody>${svcRows}</tbody>
        </table>`;
    } catch {
      /* intentionally silent — malformed JSON */
    }
  }

  const backUrl = projectId ? `/projects/${projectId}/builds` : `/builds`;

  const body = `<main class="container">
    <div style="display:flex;align-items:center;gap:0.5rem">
      <a href="${backUrl}">← Builds</a>
    </div>
    <h1>${icon} Build: <code>${(build.commit_hash ?? "").slice(0, 8)}</code></h1>
    <table class="detail-table">
      <tr><th>ID</th><td><code>${escapeHtml(build._id)}</code></td></tr>
      <tr><th>Repo</th><td>${escapeHtml(build.repo ?? "—")}</td></tr>
      <tr><th>Commit</th><td><code>${escapeHtml(build.commit_hash ?? "—")}</code></td></tr>
      <tr><th>Status</th><td>${icon} ${escapeHtml(build.status)}</td></tr>
      <tr><th>Trigger</th><td>${escapeHtml(build.trigger ?? "—")}</td></tr>
      <tr><th>Services</th><td>${build.services_ok ?? 0}/${build.services_total ?? 0} succeeded</td></tr>
      <tr><th>Duration</th><td>${formatDuration(build.duration_ms ?? 0)}</td></tr>
      <tr><th>Time</th><td>${build.ts ? relativeTime(build.ts) : "—"}</td></tr>
    </table>
    ${servicesHtml}
  </main>`;

  return layout(body, {
    title: `Build ${(build.commit_hash ?? "").slice(0, 8)}`,
    projectId,
    activeSection: "builds",
  });
}
