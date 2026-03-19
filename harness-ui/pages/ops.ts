// ─── Ops Page ──────────────────────────────────────────────────
// Ported from xtdb-event-logger-ui/pages/ops.ts
// This is a CLIENT-SIDE page — ops.js does all the rendering and
// API polling. We just provide the HTML skeleton with the correct
// DOM element IDs that ops.js expects, wrapped in harness-ui layout.

import { layout } from "../components/layout.ts";

export async function renderOps(): Promise<string> {
  const content = `
    <main class="ops-page">

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

    </main>
  `;

  return layout(content, {
    title: "Operations",
    activePath: "/ops",
    extraHead: `<script src="/static/modal.js" defer></script><script src="/static/ops.js" defer></script>`,
  });
}
