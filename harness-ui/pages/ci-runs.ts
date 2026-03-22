// ─── CI Runs Page ──────────────────────────────────────────────
import { layout } from "../components/layout.ts";
import { relativeTime, escapeHtml } from "../lib/format.ts";

async function fetchCIRuns(): Promise<any[]> {
  try {
    const resp = await fetch("http://localhost:3333/api/ci-runs");
    if (!resp.ok) return [];
    return await resp.json();
  } catch { return []; }
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export async function renderCIRuns(): Promise<string> {
  const runs = await fetchCIRuns();

  const rows = runs.map((r: any) => {
    const passed = r.status === "passed";
    const statusBadge = passed
      ? `<span style="color:#238636">✅ passed</span>`
      : `<span style="color:#da3633">❌ failed</span>`;
    const shortHash = r.commit_hash ? String(r.commit_hash).slice(0, 7) : "—";
    const message = r.commit_message ? escapeHtml(String(r.commit_message)).slice(0, 80) : "—";
    const stepsPassed = r.steps_passed ?? 0;
    const stepsFailed = r.steps_failed ?? 0;

    return `<tr>
      <td>${statusBadge}</td>
      <td>${escapeHtml(r.repo ?? "—")}</td>
      <td><code>${shortHash}</code></td>
      <td>${message}</td>
      <td>${escapeHtml(r.pusher ?? "—")}</td>
      <td><span style="color:#238636">${stepsPassed}</span> / <span style="color:#da3633">${stepsFailed}</span></td>
      <td>${formatDuration(r.duration_ms)}</td>
      <td>${relativeTime(r.ts)}</td>
    </tr>`;
  }).join("\n");

  const content = `
    <div class="page-header"><h1>🔄 CI Runs</h1><span class="total-badge">${runs.length} run${runs.length !== 1 ? "s" : ""}</span></div>
    <main>
      ${runs.length === 0
        ? '<p class="empty-msg">No CI runs recorded yet.</p>'
        : `<div style="overflow-x:auto">
          <table class="data-table">
            <thead><tr>
              <th>Status</th><th>Repo</th><th>Commit</th><th>Message</th><th>Pusher</th><th>Steps</th><th>Duration</th><th>Time</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`
      }
    </main>
  `;
  return layout(content, { title: "CI Runs", activePath: "/ci" });
}
