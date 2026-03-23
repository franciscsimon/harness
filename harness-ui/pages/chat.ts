// ─── Chat Page ─────────────────────────────────────────────────
// Ported from web-chat/pages/chat.ts — the page is mostly client-side
// JS (chat.js) that connects via WebSocket to the chat backend.
// We set CHAT_WS_HOST so the WebSocket connects to :3334, not :3336.

import { renderNav } from "../components/nav.ts";
import { CHAT_WS_URL } from "../lib/api.ts";

export function renderChat(): string {
  // Extract host from ws://localhost/ws → localhost (through Caddy)
  const wsHost = CHAT_WS_URL.replace(/^wss?:\/\//, "").replace(/\/.*$/, "");

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>💬 Chat — Harness</title>
<link rel="stylesheet" href="/static/style.css">
<link rel="stylesheet" href="/static/chat.css">
<script>window.CHAT_WS_HOST = "${wsHost}";</script>
<style>
  body { display: flex; flex-direction: column; height: 100vh; margin: 0; overflow: hidden; }
  .nav { flex-shrink: 0; }
  .chat-container { flex: 1; min-height: 0; display: flex; flex-direction: column; }
</style>
</head><body>
${renderNav("/chat")}
<div class="chat-container">
<div class="chat-layout">
  <div class="chat-main">
    <main class="chat-messages" id="messages"></main>
    <div class="chat-input-wrap">
      <div class="chat-input-row">
        <textarea id="input" class="chat-input" placeholder="Type a message… (Shift+Enter for newline)" rows="1"></textarea>
        <button class="btn chat-send-btn" id="btn-send">Send</button>
        <button class="btn chat-abort-btn" id="btn-abort" style="display:none">⏹ Stop</button>
      </div>
    </div>
  </div>
  <aside class="chat-sidebar" id="sidebar">

    <!-- Connection status -->
    <section class="sb-section sb-section-pinned">
      <div id="status" style="font-size:0.85rem;font-weight:600">● disconnected</div>
    </section>

    <!-- Project & Model — always visible -->
    <section class="sb-section sb-section-pinned">
      <h3 class="sb-heading">Project</h3>
      <label class="sb-field-label" title="Working directory for this chat session">
        <input id="cwd-input" class="sb-input" type="text" placeholder="/path/to/project" spellcheck="false">
      </label>
      <div class="sb-row-controls">
        <select id="model-select" class="sb-select" title="Model"><option>Loading...</option></select>
        <select id="thinking-select" class="sb-select" title="Thinking">
          <option value="off">off</option>
          <option value="low">low</option>
          <option value="medium" selected>medium</option>
          <option value="high">high</option>
        </select>
      </div>
      <button class="sb-btn" id="btn-new">+ New Session</button>
    </section>

    <!-- Context Window — always visible -->
    <section class="sb-section sb-section-pinned">
      <h3 class="sb-heading">Context Window</h3>
      <div class="chat-context-usage" id="context-usage">
        <div class="chat-context-bar"><div class="chat-context-fill" id="context-fill"></div></div>
        <span class="chat-context-label" id="context-label">—</span>
      </div>
    </section>

    <!-- Workflow — accordion -->
    <details class="sb-accordion" id="sb-workflow-section">
      <summary class="sb-accordion-head">Workflow</summary>
      <div class="sb-accordion-body" id="sb-workflow-body">
        <div class="wf-inactive" id="wf-inactive">No active workflow</div>
        <div class="wf-active" id="wf-active" style="display:none">
          <div class="wf-header">
            <span class="wf-name" id="wf-name"></span>
            <button class="wf-abandon-btn" id="wf-abandon" title="Abandon workflow">✕</button>
          </div>
          <div class="wf-steps" id="wf-steps"></div>
          <div class="wf-progress" id="wf-progress"></div>
          <div class="wf-actions">
            <button class="sb-btn" id="wf-advance">▶ Advance</button>
            <button class="sb-btn" id="wf-skip">⏭ Skip</button>
          </div>
        </div>
        <button class="sb-btn" id="wf-pick">📋 Pick Workflow</button>
      </div>
    </details>

    <!-- Session — accordion -->
    <details class="sb-accordion">
      <summary class="sb-accordion-head">Session</summary>
      <div class="sb-accordion-body">
        <div class="sb-row" id="sb-session-id"></div>
        <div class="sb-row" id="sb-session-name"></div>
        <div class="sb-row" id="sb-model"></div>
        <div class="sb-row" id="sb-thinking"></div>
      </div>
    </details>

    <!-- Stats — accordion -->
    <details class="sb-accordion">
      <summary class="sb-accordion-head">Stats</summary>
      <div class="sb-accordion-body">
        <div class="sb-row" id="sb-turns">Turns: —</div>
        <div class="sb-row" id="sb-tokens">Tokens: —</div>
        <div class="sb-row" id="sb-cost">Cost: —</div>
      </div>
    </details>

    <!-- Settings — accordion -->
    <details class="sb-accordion">
      <summary class="sb-accordion-head">Settings</summary>
      <div class="sb-accordion-body">
        <label class="sb-toggle"><input type="checkbox" id="chk-auto-compact" checked> Auto-compact</label>
        <label class="sb-toggle"><input type="checkbox" id="chk-auto-retry" checked> Auto-retry</label>
      </div>
    </details>

    <!-- Actions — accordion -->
    <details class="sb-accordion">
      <summary class="sb-accordion-head">Actions</summary>
      <div class="sb-accordion-body">
        <button class="sb-btn" id="btn-export">📄 Export HTML</button>
        <button class="sb-btn" id="btn-copy-last">📋 Copy last reply</button>
        <button class="sb-btn" id="btn-reload">🔄 Reload extensions</button>
        <button class="sb-btn" id="btn-compact">📦 Compact</button>
      </div>
    </details>

    <!-- Decisions — accordion -->
    <details class="sb-accordion">
      <summary class="sb-accordion-head">Decisions <span class="sb-badge" id="sb-decisions-count">0</span></summary>
      <div class="sb-accordion-body">
        <div id="sb-decisions" class="sb-scroll-list">
          <div class="sb-empty">No decisions yet</div>
        </div>
      </div>
    </details>

    <!-- Artifacts — accordion -->
    <details class="sb-accordion">
      <summary class="sb-accordion-head">Artifacts <span class="sb-badge" id="sb-artifacts-count">0</span></summary>
      <div class="sb-accordion-body">
        <div id="sb-artifacts" class="sb-scroll-list">
          <div class="sb-empty">No artifacts yet</div>
        </div>
      </div>
    </details>

    <!-- Dashboard links — accordion -->
    <details class="sb-accordion">
      <summary class="sb-accordion-head">Dashboard</summary>
      <div class="sb-accordion-body">
        <a href="/dashboard" class="sb-link">📊 Dashboard</a>
        <a href="/sessions" class="sb-link">📂 Sessions</a>
        <a href="/artifacts" class="sb-link">📦 Artifacts</a>
      </div>
    </details>

  </aside>
</div>
</div>
<script src="/static/chat.js"></script>
</body></html>`;
}
