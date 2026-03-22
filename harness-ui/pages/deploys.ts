// ─── Deployment History Page ───────────────────────────────────
// Shows deployment history from deploy-history.json and XTDB

import { layout } from "../components/layout.ts";
import { escapeHtml, relativeTime, formatDuration } from "../lib/format.ts";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

interface Deploy {
  timestamp: string;
  commitHash: string;
  commitFull?: string;
  commitMessage?: string;
  status: string;
  services: { name: string; success: boolean; phase: string; durationMs: number; error?: string }[];
  durationMs: number;
}

export async function renderDeploys(projectId?: string): Promise<string> {
  let deploys: Deploy[] = [];
  try {
    const historyPath = join(__dirname, "..", "data", "deploy-history.json");
    if (existsSync(historyPath)) {
      const data = JSON.parse(readFileSync(historyPath, "utf-8"));
      deploys = data.deploys ?? [];
    }
  } catch { /* empty */ }

  const rows = deploys.map((d) => {
    const statusColor = d.status === "success" ? "#238636" : d.status === "rollback" ? "#d29922" : "#da3633";
    const statusEmoji = d.status === "success" ? "✅" : d.status === "rollback" ? "⏪" : "⚠️";
    const svcSummary = d.services?.map(s => 
      `<span style="color:${s.success ? "#238636" : "#da3633"}">${s.name}</span>`
    ).join(", ") ?? "";
    const time = d.timestamp ? relativeTime(new Date(d.timestamp).getTime()) : "—";

    return `
      <tr>
        <td>${time}</td>
        <td><code>${escapeHtml(d.commitHash ?? "—")}</code></td>
        <td>${escapeHtml(d.commitMessage?.slice(0, 60) ?? "—")}</td>
        <td style="color:${statusColor};font-weight:600">${statusEmoji} ${d.status}</td>
        <td>${svcSummary}</td>
        <td>${formatDuration(d.durationMs)}</td>
      </tr>
    `;
  }).join("\n");

  const content = `
    <main>
      <div class="page-header">
        <h1>🚀 Deployments</h1>
        <div>
          <button class="btn" onclick="triggerDeploy()">Deploy All</button>
          <button class="btn" onclick="triggerRollback()" style="margin-left:0.5rem">⏪ Rollback</button>
        </div>
      </div>

      ${deploys.length === 0 ? '<p class="empty-msg">No deployments yet. Run <code>npx jiti scripts/deploy.ts</code> to deploy.</p>' : `
      <div class="card" style="overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr><th>Time</th><th>Commit</th><th>Message</th><th>Status</th><th>Services</th><th>Duration</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      `}

      <div id="deploy-status" style="display:none;margin-top:1rem;padding:1rem;border-radius:6px;border:1px solid #30363d;background:#161b22"></div>
    </main>

    <script>
    async function triggerDeploy() {
      const status = document.getElementById("deploy-status");
      status.style.display = "block";
      status.innerHTML = "⏳ Deploying all services...";
      try {
        const r = await fetch("/api/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trigger: "ui" })
        });
        const d = await r.json();
        if (d.success) {
          status.innerHTML = "✅ Deploy complete — " + d.services.filter(s => s.ok).length + "/" + d.services.length + " services deployed";
          setTimeout(() => location.reload(), 2000);
        } else {
          status.innerHTML = "⚠️ Partial deploy — " + d.services.filter(s => !s.ok).map(s => s.name + ": " + (s.error || "failed")).join(", ");
        }
      } catch(e) {
        status.innerHTML = "❌ Deploy failed: " + e.message;
      }
    }

    async function triggerRollback() {
      if (!confirm("Roll back to previous successful deploy?")) return;
      const status = document.getElementById("deploy-status");
      status.style.display = "block";
      status.innerHTML = "⏪ Rolling back...";
      try {
        const r = await fetch("/api/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trigger: "ui-rollback", rollback: true })
        });
        const d = await r.json();
        status.innerHTML = d.success ? "✅ Rollback complete" : "⚠️ Rollback partial: " + JSON.stringify(d.services);
        setTimeout(() => location.reload(), 2000);
      } catch(e) {
        status.innerHTML = "❌ Rollback failed: " + e.message;
      }
    }
    </script>
  `;

  return layout(content, {
    title: "Deployments",
    activePath: projectId ? `/projects/${projectId}/deploys` : "/deploys",
    projectId,
    activeSection: "deploys",
  });
}
