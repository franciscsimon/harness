// ─── Ops Page ──────────────────────────────────────────────────
// Ported from xtdb-event-logger-ui/pages/ops.ts
// This is a CLIENT-SIDE page — ops.js does all the rendering and
// API polling. We just provide the HTML skeleton with the correct
// DOM element IDs that ops.js expects, wrapped in harness-ui layout.

import { layout } from "../components/layout.ts";
import { checkAllContainers } from "../lib/api.ts";

export async function renderOps(): Promise<string> {
  // Fetch container status server-side
  const containers = await checkAllContainers().catch(() => []);
  const up = containers.filter((c) => c.ok).length;

  const containerRows = containers.map((c) => `
    <tr>
      <td><span class="backend-dot" style="background:${c.ok ? "#238636" : "#da3633"};display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px"></span>${c.name}</td>
      <td><code>:${c.port}</code></td>
      <td>${c.role}</td>
      <td style="color:${c.ok ? "#238636" : "#da3633"};font-weight:600">${c.ok ? "Up" : "Down"}</td>
    </tr>
  `).join("\n");

  const content = `
    <main class="ops-page">

      <div class="ops-section">
        <div class="ops-section-header">
          <h2>🐳 Docker Containers</h2>
          <span class="ops-refresh-badge">${up}/${containers.length} up</span>
        </div>
        <div class="card" style="overflow-x:auto">
          <table class="data-table">
            <thead><tr><th>Service</th><th>Port</th><th>Role</th><th>Status</th></tr></thead>
            <tbody>${containerRows}</tbody>
          </table>
        </div>
      </div>

      <div class="ops-api-banner ops-api-checking" id="api-banner">
        Connecting to Ops API at <code>localhost:3335</code>...
        <span class="ops-api-hint">Start it with: <code>task ops:api</code></span>
      </div>

      <div class="ops-section">
        <div class="ops-section-header">
          <h2>Cluster Health</h2>
          <span class="ops-refresh-badge" id="health-refresh">auto-refresh 5s</span>
        </div>
        <div class="ops-health-cards" id="health-cards">
          <div class="ops-health-card" id="hc-redpanda">
            <div class="ops-hc-name">Redpanda</div>
            <div class="ops-hc-port">:19092</div>
            <div class="ops-hc-status" id="hc-redpanda-status">...</div>
            <div class="ops-hc-details" id="hc-redpanda-details"></div>
          </div>
          <div class="ops-health-card" id="hc-primary">
            <div class="ops-hc-name">XTDB Primary</div>
            <div class="ops-hc-port">:5433 / :8083</div>
            <div class="ops-hc-status" id="hc-primary-status">...</div>
            <div class="ops-hc-details" id="hc-primary-details"></div>
          </div>
          <div class="ops-health-card" id="hc-replica">
            <div class="ops-hc-name">XTDB Replica</div>
            <div class="ops-hc-port">:5434 / :8084</div>
            <div class="ops-hc-status" id="hc-replica-status">...</div>
            <div class="ops-hc-details" id="hc-replica-details"></div>
          </div>
        </div>
      </div>

      <div class="ops-section">
        <h2>Replication</h2>
        <div class="ops-replication" id="replication-panel">
          <div class="ops-repl-stat"><span class="ops-repl-label">Primary events</span><span class="ops-repl-value" id="repl-primary">--</span></div>
          <div class="ops-repl-stat"><span class="ops-repl-label">Replica events</span><span class="ops-repl-value" id="repl-replica">--</span></div>
          <div class="ops-repl-stat"><span class="ops-repl-label">Lag</span><span class="ops-repl-value" id="repl-lag">--</span></div>
          <div class="ops-repl-stat"><span class="ops-repl-label">Synced</span><span class="ops-repl-value" id="repl-synced">--</span></div>
        </div>
      </div>

      <div class="ops-section">
        <h2>Replica Management</h2>
        <div class="ops-replica-controls">
          <span class="ops-replica-status-badge" id="replica-badge">--</span>
          <button class="btn" id="btn-replica-stop">Stop Replica</button>
          <button class="btn" id="btn-replica-start">Start Replica</button>
        </div>
      </div>

      <div class="ops-section">
        <h2>Backup</h2>
        <div class="ops-backup-actions">
          <button class="btn" id="btn-backup-snapshot">Snapshot Backup</button>
          <button class="btn" id="btn-backup-csv">CSV Backup (no downtime)</button>
        </div>
        <div class="ops-backup-progress" id="backup-progress" style="display:none">
          <div class="ops-progress-header">
            <span id="backup-status-text">Running...</span>
            <span class="ops-progress-spinner" id="backup-spinner"></span>
          </div>
          <div class="ops-progress-log" id="backup-log"></div>
        </div>
      </div>

      <div class="ops-section">
        <h2>Backup History</h2>
        <div class="ops-backup-list" id="backup-list"><p class="empty-msg">Loading...</p></div>
      </div>

      <div class="ops-section">
        <h2>Restore</h2>
        <div class="ops-restore">
          <select id="restore-select"><option value="">Select a backup to restore from...</option></select>
          <button class="btn btn-danger" id="btn-restore">Restore</button>
        </div>
      </div>

      <div class="ops-section">
        <h2>Kafka Topics</h2>
        <div id="topics-list" class="ops-topics"><p class="empty-msg">Loading...</p></div>
      </div>

      <div class="ops-section">
        <div class="ops-section-header">
          <h2>🐙 Git Repository Backup</h2>
        </div>
        <div class="ops-backup-actions" style="margin-bottom:1rem">
          <button class="btn" id="btn-git-backup" onclick="gitBackup()">📦 Backup All Repos</button>
        </div>
        <div id="git-backup-status" style="display:none;margin-bottom:1rem"></div>
        <div id="git-backup-list"><p class="empty-msg">Loading backups...</p></div>
      </div>

    </main>
  `;

  return layout(content, {
    title: "Operations",
    activePath: "/ops",
    extraHead: `<script src="/static/modal.js" defer></script><script src="/static/ops.js" defer></script>
<script>
async function gitBackup() {
  const btn = document.getElementById("btn-git-backup");
  const status = document.getElementById("git-backup-status");
  btn.disabled = true;
  btn.textContent = "⏳ Backing up...";
  status.style.display = "block";
  status.innerHTML = '<div class="card" style="padding:0.5rem">Creating backup of all Soft Serve repos...</div>';
  try {
    const r = await fetch("/api/git/backup", { method: "POST" });
    const d = await r.json();
    if (d.success) {
      status.innerHTML = '<div class="card" style="padding:0.5rem;color:#238636">✅ Backup created: ' + d.filename + ' (' + (d.sizeBytes/1024).toFixed(0) + ' KB)</div>';
      loadGitBackups();
    } else {
      status.innerHTML = '<div class="card" style="padding:0.5rem;color:#da3633">❌ ' + (d.error || 'Unknown error') + '</div>';
    }
  } catch(e) {
    status.innerHTML = '<div class="card" style="padding:0.5rem;color:#da3633">❌ ' + e.message + '</div>';
  }
  btn.disabled = false;
  btn.textContent = "📦 Backup All Repos";
}

async function gitRestore(filename) {
  if (!confirm("Restore repos from " + filename + "? This will overwrite current repos and restart Soft Serve.")) return;
  try {
    const r = await fetch("/api/git/restore", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({filename}) });
    const d = await r.json();
    alert(d.success ? "✅ Restored from " + filename + ". Soft Serve restarted." : "❌ " + d.error);
  } catch(e) { alert("❌ " + e.message); }
}

async function loadGitBackups() {
  try {
    const r = await fetch("/api/git/backups");
    const backups = await r.json();
    const el = document.getElementById("git-backup-list");
    if (!backups.length) { el.innerHTML = '<p class="empty-msg">No backups yet</p>'; return; }
    el.innerHTML = '<table class="data-table"><thead><tr><th>Filename</th><th>Size</th><th>Created</th><th>Action</th></tr></thead><tbody>' +
      backups.map(b => '<tr><td>' + b.filename + '</td><td>' + (b.sizeBytes/1024).toFixed(0) + ' KB</td><td>' + new Date(b.created).toLocaleString() + '</td><td><button class="btn" onclick="gitRestore(\\'' + b.filename + '\\')">Restore</button></td></tr>').join('') +
      '</tbody></table>';
  } catch { document.getElementById("git-backup-list").innerHTML = '<p class="empty-msg">Failed to load backups</p>'; }
}
document.addEventListener("DOMContentLoaded", loadGitBackups);
</script>`,
  });
}
