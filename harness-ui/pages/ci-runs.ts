import { layout } from "../components/layout.ts";
import { relativeTime, formatDuration } from "../lib/format.ts";

export async function renderCIRuns(projectId?: string): Promise<string> {
  let runs: any[] = [];
  try {
    const r = await fetch("http://localhost:3333/api/ci-runs");
    if (r.ok) runs = await r.json();
  } catch {}

  const rows = runs.map((run: any) => {
    const status = run.status === "passed" ? "✅" : "❌";
    const hash = (run.commit_hash ?? "").slice(0, 8);
    const msg = run.commit_message ?? "";
    const dur = formatDuration(run.duration_ms ?? 0);
    const time = run.ts ? relativeTime(run.ts) : "—";
    const passed = run.steps_passed ?? 0;
    const failed = run.steps_failed ?? 0;

    let details = "";
    if (run.step_results && run.status !== "passed") {
      try {
        const steps = JSON.parse(run.step_results);
        const failedSteps = steps.filter((s: any) => s.status === "failed");
        if (failedSteps.length > 0) {
          details = `<tr><td colspan="8" style="padding:0">
            <details style="padding:0.5rem 1rem;background:#1a1a1a">
              <summary style="cursor:pointer;color:#f85149">🔍 ${failedSteps.length} failed step(s)</summary>
              ${failedSteps.map((s: any) => `
                <div style="margin:0.5rem 0;padding:0.5rem;background:#0d1117;border:1px solid #30363d;border-radius:4px">
                  <strong>${s.name}</strong> — exit code ${s.exitCode} (${formatDuration(s.durationMs ?? 0)})
                  ${s.output ? `<pre style="margin:0.5rem 0 0;padding:0.5rem;background:#161b22;border-radius:4px;overflow-x:auto;font-size:0.8rem;max-height:300px;overflow-y:auto;color:#c9d1d9">${s.output.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>` : ""}
                </div>
              `).join("")}
            </details>
          </td></tr>`;
        }
      } catch {}
    }

    const rowId = encodeURIComponent(run._id ?? "");
    return `<tr style="cursor:pointer" onclick="location.href='${projectId ? `/projects/${projectId}/ci/${rowId}` : `/ci/${rowId}`}'">
      <td><span style="color:${run.status === "passed" ? "#238636" : "#da3633"}">${status}</span></td>
      <td>${run.repo ?? "—"}</td>
      <td><code>${hash}</code></td>
      <td>${msg}</td>
      <td>${run.pusher ?? "—"}</td>
      <td>${passed}/${passed + failed}</td>
      <td>${dur}</td>
      <td>${time}</td>
    </tr>`;
  }).join("");

  const content = `
    <main class="container">
      <h1>CI Runs</h1>
      ${runs.length === 0
        ? `<p class="empty-msg">No CI runs recorded yet. Push to Soft Serve to trigger a build.</p>`
        : `<table class="data-table">
            <thead><tr>
              <th>Status</th><th>Repo</th><th>Commit</th><th>Message</th>
              <th>Pusher</th><th>Steps</th><th>Duration</th><th>Time</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>`
      }
    </main>`;

  return layout(content, { title: "CI Runs", activePath: projectId ? `/projects/${projectId}/ci` : "/ci", projectId, activeSection: "ci" });
}
