import { layout } from "../components/layout.ts";
import { relativeTime, formatDuration, escapeHtml } from "../lib/format.ts";

const EVENT_API = process.env.EVENT_API_URL ?? "http://localhost:3333";

export async function renderCIRunDetail(id: string, projectId?: string): Promise<string> {
  let run: any = null;
  try {
    const r = await fetch(`${EVENT_API}/api/ci-runs/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(10000) });
    if (r.ok) run = await r.json();
  } catch {}

  if (!run) {
    return layout(`<main class="container"><h1>CI Run Not Found</h1><p>No run with ID <code>${escapeHtml(id)}</code></p><a href="${projectId ? `/projects/${projectId}/ci` : `/ci`}">← Back to CI Runs</a></main>`, { title: "CI Run Not Found", activePath: projectId ? `/projects/${projectId}/ci` : "/ci", projectId, activeSection: "ci" });
  }

  const statusEmoji = run.status === "passed" ? "✅" : "❌";
  const statusColor = run.status === "passed" ? "#238636" : "#da3633";
  const hash = (run.commit_hash ?? "").slice(0, 8);
  const dur = formatDuration(run.duration_ms ?? 0);
  const time = run.ts ? relativeTime(run.ts) : "—";
  const passed = run.steps_passed ?? 0;
  const failed = run.steps_failed ?? 0;

  // Parse step results
  let steps: any[] = [];
  if (run.step_results) {
    try { steps = JSON.parse(run.step_results); } catch {}
  }

  const stepsHtml = steps.length > 0 ? steps.map((s: any) => {
    const sEmoji = s.status === "passed" ? "✅" : s.status === "failed" ? "❌" : "⏭️";
    const sColor = s.status === "passed" ? "#238636" : s.status === "failed" ? "#da3633" : "#8b949e";
    const output = s.output ? escapeHtml(s.output) : "";
    return `
      <div style="margin:0.75rem 0;padding:1rem;background:#0d1117;border:1px solid #30363d;border-radius:6px;border-left:3px solid ${sColor}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>${sEmoji} ${escapeHtml(s.name)}</strong>
          <span style="color:#8b949e">exit ${s.exitCode} · ${formatDuration(s.durationMs ?? 0)}</span>
        </div>
        ${output ? `<pre style="margin:0.75rem 0 0;padding:0.75rem;background:#161b22;border-radius:4px;overflow-x:auto;font-size:0.8rem;max-height:500px;overflow-y:auto;color:#c9d1d9;white-space:pre-wrap;word-break:break-all">${output}</pre>` : ""}
      </div>`;
  }).join("") : `<p class="empty-msg">No step details recorded</p>`;

  const content = `
    <main class="container">
      <p><a href="${projectId ? `/projects/${projectId}/ci` : `/ci`}">← Back to CI Runs</a></p>
      <h1>${statusEmoji} CI Run: ${escapeHtml(run.repo ?? "unknown")}@${hash}</h1>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin:1.5rem 0">
        <div class="card" style="padding:1rem">
          <div style="color:#8b949e;font-size:0.85rem">Status</div>
          <div style="font-size:1.2rem;color:${statusColor}">${run.status?.toUpperCase()}</div>
        </div>
        <div class="card" style="padding:1rem">
          <div style="color:#8b949e;font-size:0.85rem">Duration</div>
          <div style="font-size:1.2rem">${dur}</div>
        </div>
        <div class="card" style="padding:1rem">
          <div style="color:#8b949e;font-size:0.85rem">Steps</div>
          <div style="font-size:1.2rem"><span style="color:#238636">${passed} passed</span> · <span style="color:${failed > 0 ? '#da3633' : '#8b949e'}">${failed} failed</span></div>
        </div>
        <div class="card" style="padding:1rem">
          <div style="color:#8b949e;font-size:0.85rem">Time</div>
          <div style="font-size:1.2rem">${time}</div>
        </div>
      </div>

      <table class="data-table" style="margin:1.5rem 0">
        <tbody>
          <tr><td style="color:#8b949e;width:120px">Repository</td><td>${escapeHtml(run.repo ?? "—")}</td></tr>
          <tr><td style="color:#8b949e">Ref</td><td><code>${escapeHtml(run.ref ?? "—")}</code></td></tr>
          <tr><td style="color:#8b949e">Commit</td><td><code>${escapeHtml(run.commit_hash ?? "—")}</code></td></tr>
          <tr><td style="color:#8b949e">Message</td><td>${escapeHtml(run.commit_message ?? "—")}</td></tr>
          <tr><td style="color:#8b949e">Pusher</td><td>${escapeHtml(run.pusher ?? "—")}</td></tr>
          <tr><td style="color:#8b949e">ID</td><td><code>${escapeHtml(run._id ?? "—")}</code></td></tr>
        </tbody>
      </table>

      <h2>Steps</h2>
      ${stepsHtml}
    </main>`;

  return layout(content, { title: `CI: ${run.repo}@${hash}`, activePath: projectId ? `/projects/${projectId}/ci` : "/ci", projectId, activeSection: "ci" });
}
