export function renderChat(): string {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>💬 pi Chat</title>
<link rel="stylesheet" href="/static/style.css">
<link rel="stylesheet" href="/static/chat.css">
</head><body>
<header>
  <div class="header-top">
    <h1>💬 pi Chat
      <span class="header-sep">·</span>
      <a href="http://localhost:3333/" class="nav-link">📊 Events</a>
      <span class="header-sep">·</span>
      <a href="http://localhost:3333/sessions" class="nav-link">📂 Sessions</a>
      <span class="header-sep">·</span>
      <a href="http://localhost:3333/artifacts" class="nav-link">📦 Artifacts</a>
    </h1>
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
<main class="chat-messages" id="messages"></main>
<div class="chat-input-wrap">
  <div class="chat-input-row">
    <textarea id="input" class="chat-input" placeholder="Type a message... (Shift+Enter for newline)" rows="1"></textarea>
    <button class="btn chat-send-btn" id="btn-send">Send</button>
    <button class="btn chat-abort-btn" id="btn-abort" style="display:none">⏹ Stop</button>
  </div>
  <div class="chat-session-id" id="session-id"></div>
</div>
<script src="/static/chat.js"></script>
</body></html>`;
}
