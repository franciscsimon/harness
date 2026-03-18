export function renderChat(): string {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>💬 pi Chat</title>
<link rel="stylesheet" href="/static/style.css">
<link rel="stylesheet" href="/static/chat.css">
</head><body>
<header>
  <div class="header-top">
    <h1>💬 pi Chat</h1>
    <div class="chat-controls">
      <span class="chat-status" id="status">● Connecting</span>
      <label class="chat-cwd-label" title="Project directory for this chat session">
        📁 <input id="cwd-input" class="chat-cwd-input" type="text" placeholder="/path/to/project" spellcheck="false">
      </label>
      <select id="model-select" title="Model"><option>Loading...</option></select>
      <select id="thinking-select" title="Thinking">
        <option value="off">off</option>
        <option value="low">low</option>
        <option value="medium" selected>medium</option>
        <option value="high">high</option>
      </select>
      <button class="btn btn-sm" id="btn-new">+ New</button>
    </div>
  </div>
</header>
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

    <!-- Context Window — always visible -->
    <section class="sb-section sb-section-pinned">
      <h3 class="sb-heading">Context Window</h3>
      <div class="chat-context-usage" id="context-usage">
        <div class="chat-context-bar"><div class="chat-context-fill" id="context-fill"></div></div>
        <span class="chat-context-label" id="context-label">—</span>
      </div>
    </section>

    <!-- Session — accordion, collapsed -->
    <details class="sb-accordion">
      <summary class="sb-accordion-head">Session</summary>
      <div class="sb-accordion-body">
        <div class="sb-row" id="sb-session-id"></div>
        <div class="sb-row" id="sb-session-name"></div>
        <div class="sb-row" id="sb-model"></div>
        <div class="sb-row" id="sb-thinking"></div>
      </div>
    </details>

    <!-- Stats — accordion, collapsed -->
    <details class="sb-accordion">
      <summary class="sb-accordion-head">Stats</summary>
      <div class="sb-accordion-body">
        <div class="sb-row" id="sb-turns">Turns: —</div>
        <div class="sb-row" id="sb-tokens">Tokens: —</div>
        <div class="sb-row" id="sb-cost">Cost: —</div>
      </div>
    </details>

    <!-- Settings — accordion, collapsed -->
    <details class="sb-accordion">
      <summary class="sb-accordion-head">Settings</summary>
      <div class="sb-accordion-body">
        <label class="sb-toggle"><input type="checkbox" id="chk-auto-compact" checked> Auto-compact</label>
        <label class="sb-toggle"><input type="checkbox" id="chk-auto-retry" checked> Auto-retry</label>
      </div>
    </details>

    <!-- Actions — accordion, collapsed -->
    <details class="sb-accordion">
      <summary class="sb-accordion-head">Actions</summary>
      <div class="sb-accordion-body">
        <button class="sb-btn" id="btn-export">📄 Export HTML</button>
        <button class="sb-btn" id="btn-copy-last">📋 Copy last reply</button>
        <button class="sb-btn" id="btn-reload">🔄 Reload extensions</button>
        <button class="sb-btn" id="btn-compact">📦 Compact</button>
      </div>
    </details>

    <!-- Decisions — accordion, collapsed -->
    <details class="sb-accordion">
      <summary class="sb-accordion-head">Decisions <span class="sb-badge" id="sb-decisions-count">0</span></summary>
      <div class="sb-accordion-body">
        <div id="sb-decisions" class="sb-scroll-list">
          <div class="sb-empty">No decisions yet</div>
        </div>
      </div>
    </details>

    <!-- Artifacts — accordion, collapsed -->
    <details class="sb-accordion">
      <summary class="sb-accordion-head">Artifacts <span class="sb-badge" id="sb-artifacts-count">0</span></summary>
      <div class="sb-accordion-body">
        <div id="sb-artifacts" class="sb-scroll-list">
          <div class="sb-empty">No artifacts yet</div>
        </div>
      </div>
    </details>

    <!-- Dashboard — accordion, collapsed -->
    <details class="sb-accordion">
      <summary class="sb-accordion-head">Dashboard</summary>
      <div class="sb-accordion-body">
        <a href="http://localhost:3333/" class="sb-link" target="_blank">📊 Events</a>
        <a href="http://localhost:3333/sessions" class="sb-link" id="sb-dashboard-link" target="_blank">📂 Sessions</a>
        <a href="http://localhost:3333/artifacts" class="sb-link" target="_blank">📦 Artifacts</a>
      </div>
    </details>

  </aside>
</div>
<script src="/static/chat.js"></script>
</body></html>`;
}
