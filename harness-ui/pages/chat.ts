// ─── Chat Page ─────────────────────────────────────────────────
// WebSocket chat client. Connects to the chat backend WS.
// Ported from web-chat/pages/chat.ts — adapted for harness-ui layout.

import { layout } from "../components/layout.ts";
import { CHAT_WS_URL } from "../lib/api.ts";

export async function renderChat(): Promise<string> {
  const wsUrl = CHAT_WS_URL;

  const chatCss = `
    <style>
      /* Chat layout — override container for full-height */
      .container.chat-container { max-width: 100%; padding: 0; flex: 1; display: flex; min-height: 0; }
      .chat-layout { display: flex; flex: 1; min-height: 0; }
      .chat-main { display: flex; flex-direction: column; flex: 1; min-width: 0; }
      .chat-messages { flex: 1; overflow-y: auto; padding: 16px 20px 32px; }
      .chat-input-wrap { flex-shrink: 0; padding: 8px 20px 12px; border-top: 1px solid var(--border); background: var(--bg); }
      .chat-input-row { display: flex; gap: 8px; align-items: flex-end; }
      .chat-input {
        flex: 1; resize: none; font-family: var(--mono); font-size: 13px;
        background: var(--bg-input); color: var(--text); border: 1px solid var(--border);
        border-radius: var(--radius); padding: 8px 12px; outline: none;
        line-height: 1.5; min-height: 38px; max-height: 200px;
      }
      .chat-input:focus { border-color: #3b82f6; }
      .chat-input:disabled { opacity: 0.5; }
      .chat-send-btn { background: #3b82f6; color: #fff; border: none; padding: 8px 16px; border-radius: var(--radius); cursor: pointer; font-weight: 600; white-space: nowrap; }
      .chat-send-btn:hover { background: #2563eb; }
      .chat-send-btn:disabled { opacity: 0.4; cursor: default; }
      .chat-abort-btn { background: #ef4444; color: #fff; border: none; padding: 8px 16px; border-radius: var(--radius); cursor: pointer; font-weight: 600; white-space: nowrap; }
      .chat-abort-btn:hover { background: #dc2626; }

      /* Sidebar */
      .chat-sidebar {
        width: 280px; flex-shrink: 0; border-left: 1px solid var(--border);
        background: var(--bg-card); overflow-y: auto; padding: 12px;
        display: flex; flex-direction: column; gap: 0;
      }
      .sb-section-pinned { padding: 10px 0; border-bottom: 1px solid var(--border); }
      .sb-section-pinned:first-child { padding-top: 0; }
      .sb-heading { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); margin: 0 0 8px; font-weight: 600; }
      .sb-input {
        width: 100%; font-family: var(--mono); font-size: 11px; box-sizing: border-box;
        background: var(--bg-input); color: var(--text); border: 1px solid var(--border);
        padding: 5px 8px; border-radius: var(--radius); outline: none; margin-bottom: 8px;
      }
      .sb-input:focus { border-color: #3b82f6; }
      .sb-row-controls { display: flex; gap: 6px; margin-bottom: 8px; }
      .sb-select {
        flex: 1; min-width: 0; font-size: 11px;
        background: var(--bg-input); color: var(--text); border: 1px solid var(--border);
        padding: 4px 6px; border-radius: var(--radius); outline: none;
      }
      .sb-btn {
        display: block; width: 100%; text-align: left; font-size: 11px;
        background: none; color: var(--text); border: 1px solid var(--border);
        border-radius: var(--radius); padding: 5px 8px; margin: 3px 0;
        cursor: pointer; font-family: inherit;
      }
      .sb-btn:hover { background: rgba(255,255,255,0.04); border-color: #3b82f6; }

      /* Context bar */
      .chat-context-usage { display: none; flex-direction: column; gap: 6px; font-size: 11px; color: var(--text-dim); font-family: var(--mono); }
      .chat-context-bar { width: 100%; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; }
      .chat-context-fill { height: 100%; background: #22c55e; border-radius: 3px; transition: width 0.3s, background 0.3s; }
      .chat-context-fill.ctx-warn { background: #eab308; }
      .chat-context-fill.ctx-danger { background: #ef4444; }
      .chat-context-label { min-width: 0; line-height: 1.4; }

      /* Messages */
      .chat-msg { margin-bottom: 12px; max-width: 85%; }
      .chat-msg-user { margin-left: auto; }
      .chat-msg-user .chat-bubble-text {
        background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3);
        border-radius: var(--radius); padding: 10px 14px; font-size: 13px; line-height: 1.6;
        white-space: pre-wrap; word-break: break-word;
      }
      .chat-msg-assistant .chat-bubble-text {
        background: var(--bg-card); border: 1px solid var(--border);
        border-radius: var(--radius); padding: 10px 14px; font-size: 13px; line-height: 1.6;
      }
      .chat-bubble-text code { font-family: var(--mono); background: var(--bg-input); padding: 1px 4px; border-radius: 3px; font-size: 12px; }
      .chat-code {
        background: #0d0f14; padding: 12px; border-radius: var(--radius);
        overflow-x: auto; font-family: var(--mono); font-size: 12px; line-height: 1.5; margin: 6px 0;
      }
      .chat-code code { background: none; padding: 0; }

      /* Tool calls */
      .chat-tool { margin: 8px 0; border: 1px solid var(--border); border-left: 3px solid #f97316; border-radius: var(--radius); overflow: hidden; }
      .chat-tool summary { padding: 6px 10px; cursor: pointer; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; background: rgba(249, 115, 22, 0.05); }
      .chat-tool-hint { color: var(--text-dim); font-size: 11px; font-family: var(--mono); margin-left: 6px; }
      .chat-tool-input, .chat-tool-output { padding: 6px 10px; border-top: 1px solid var(--border); }
      .chat-tool-input pre, .chat-tool-output pre { font-family: var(--mono); font-size: 11px; line-height: 1.4; margin: 0; white-space: pre-wrap; word-break: break-word; max-height: 400px; overflow-y: auto; }

      /* Thinking */
      .chat-thinking { margin: 8px 0; border: 1px solid var(--border); border-left: 3px solid #8b5cf6; border-radius: var(--radius); overflow: hidden; }
      .chat-thinking summary { padding: 6px 10px; cursor: pointer; font-size: 12px; color: var(--text-dim); background: rgba(139, 92, 246, 0.05); }
      .chat-thinking-body { padding: 8px 10px; font-family: var(--mono); font-size: 11px; line-height: 1.4; color: var(--text-dim); white-space: pre-wrap; max-height: 300px; overflow-y: auto; }

      /* Error */
      .chat-error { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius); padding: 8px 12px; margin: 8px 0; font-size: 12px; color: #fca5a5; }

      /* Status */
      .chat-status { font-size: 12px; white-space: nowrap; }
      .chat-system-msg { text-align: center; font-size: 11px; color: var(--text-dim); padding: 6px 0; margin: 4px 0; }

      /* Make body flex for full-height chat */
      body { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

      @media (max-width: 720px) { .chat-sidebar { display: none; } }
    </style>
  `;

  const chatHtml = `
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
      <aside class="chat-sidebar">
        <section class="sb-section-pinned">
          <h3 class="sb-heading">Project</h3>
          <input id="cwd-input" class="sb-input" type="text" placeholder="/path/to/project" spellcheck="false">
          <div class="sb-row-controls">
            <select id="model-select" class="sb-select" title="Model"><option>Loading…</option></select>
            <select id="thinking-select" class="sb-select" title="Thinking">
              <option value="off">off</option><option value="low">low</option>
              <option value="medium" selected>medium</option><option value="high">high</option>
            </select>
          </div>
          <button class="sb-btn" id="btn-new">+ New Session</button>
        </section>
        <section class="sb-section-pinned">
          <h3 class="sb-heading">Context Window</h3>
          <div class="chat-context-usage" id="context-usage">
            <div class="chat-context-bar"><div class="chat-context-fill" id="context-fill"></div></div>
            <span class="chat-context-label" id="context-label">—</span>
          </div>
        </section>
        <section class="sb-section-pinned">
          <h3 class="sb-heading">Status</h3>
          <span class="chat-status" id="status">● Connecting…</span>
        </section>
      </aside>
    </div>
  `;

  const chatJs = `
    <script>
    (function() {
      const WS_URL = "${wsUrl}";
      let ws = null;
      let state = "disconnected";
      let currentBubble = null;
      let rawText = "";
      let reconnectDelay = 1000;

      const $messages = document.getElementById("messages");
      const $input = document.getElementById("input");
      const $send = document.getElementById("btn-send");
      const $abort = document.getElementById("btn-abort");
      const $status = document.getElementById("status");
      const $model = document.getElementById("model-select");
      const $thinking = document.getElementById("thinking-select");
      const $newBtn = document.getElementById("btn-new");
      const $cwdInput = document.getElementById("cwd-input");
      const $contextUsage = document.getElementById("context-usage");
      const $contextLabel = document.getElementById("context-label");
      const $contextFill = document.getElementById("context-fill");

      function setStatus(text, color) {
        $status.innerHTML = '<span style="color:' + color + '">●</span> ' + text;
      }

      function connect() {
        ws = new WebSocket(WS_URL + "/ws");
        ws.onopen = () => {
          reconnectDelay = 1000;
          setStatus("Connected", "#238636");
          state = "idle";
          wsSend({ type: "init" });
          $input.disabled = false;
          $send.disabled = false;
        };
        ws.onclose = () => {
          state = "disconnected";
          setStatus("Disconnected", "#da3633");
          $input.disabled = true;
          $send.disabled = true;
          setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        };
        ws.onerror = () => ws.close();
        ws.onmessage = (e) => {
          try { handleMessage(JSON.parse(e.data)); } catch {}
        };
      }

      function wsSend(obj) {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
      }

      function escapeHtml(s) {
        return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
      }

      function addMessage(role, html) {
        const div = document.createElement("div");
        div.className = "chat-msg chat-msg-" + role;
        div.innerHTML = '<div class="chat-bubble-text">' + html + '</div>';
        $messages.appendChild(div);
        $messages.scrollTop = $messages.scrollHeight;
        return div;
      }

      function handleMessage(msg) {
        switch (msg.type) {
          case "session_ready":
            if (msg.models && $model) {
              $model.innerHTML = msg.models.map(function(m) {
                return '<option value="' + m + '"' + (m === msg.model ? ' selected' : '') + '>' + m + '</option>';
              }).join("");
            }
            if (msg.cwd && $cwdInput) $cwdInput.value = msg.cwd;
            break;
          case "assistant_start":
            state = "streaming";
            rawText = "";
            currentBubble = addMessage("assistant", "");
            $send.style.display = "none";
            $abort.style.display = "";
            break;
          case "text_delta":
            rawText += msg.text || "";
            if (currentBubble) {
              currentBubble.querySelector(".chat-bubble-text").innerHTML = formatMarkdown(rawText);
              $messages.scrollTop = $messages.scrollHeight;
            }
            break;
          case "assistant_done":
            state = "idle";
            $send.style.display = "";
            $abort.style.display = "none";
            currentBubble = null;
            break;
          case "tool_use":
            if (currentBubble) {
              const tool = document.createElement("details");
              tool.className = "chat-tool";
              tool.innerHTML = '<summary>🔧 ' + escapeHtml(msg.name || "tool") +
                (msg.hint ? ' <span class="chat-tool-hint">' + escapeHtml(msg.hint) + '</span>' : '') +
                '</summary>';
              if (msg.input) tool.innerHTML += '<div class="chat-tool-input"><strong>Input</strong><pre>' + escapeHtml(typeof msg.input === "string" ? msg.input : JSON.stringify(msg.input, null, 2)) + '</pre></div>';
              currentBubble.appendChild(tool);
            }
            break;
          case "tool_result":
            var tools = currentBubble ? currentBubble.querySelectorAll(".chat-tool") : [];
            if (tools.length > 0) {
              var lastTool = tools[tools.length - 1];
              lastTool.innerHTML += '<div class="chat-tool-output"><strong>Output</strong><pre>' + escapeHtml(typeof msg.output === "string" ? msg.output : JSON.stringify(msg.output, null, 2)).slice(0, 5000) + '</pre></div>';
            }
            break;
          case "thinking":
            if (currentBubble) {
              var think = document.createElement("details");
              think.className = "chat-thinking";
              think.innerHTML = '<summary>💭 Thinking</summary><div class="chat-thinking-body">' + escapeHtml(msg.text || "") + '</div>';
              currentBubble.appendChild(think);
            }
            break;
          case "context_update":
            if ($contextUsage) $contextUsage.style.display = "flex";
            if (msg.used != null && msg.total) {
              var pct = Math.round((msg.used / msg.total) * 100);
              if ($contextFill) {
                $contextFill.style.width = pct + "%";
                $contextFill.className = "chat-context-fill" + (pct > 80 ? " ctx-danger" : pct > 60 ? " ctx-warn" : "");
              }
              if ($contextLabel) $contextLabel.textContent = pct + "% (" + Math.round(msg.used/1000) + "K / " + Math.round(msg.total/1000) + "K)";
            }
            break;
          case "error":
            var errDiv = document.createElement("div");
            errDiv.className = "chat-error";
            errDiv.textContent = msg.error || msg.message || "Unknown error";
            $messages.appendChild(errDiv);
            state = "idle";
            $send.style.display = "";
            $abort.style.display = "none";
            break;
          case "system":
            var sysDiv = document.createElement("div");
            sysDiv.className = "chat-system-msg";
            sysDiv.textContent = msg.text || "";
            $messages.appendChild(sysDiv);
            break;
        }
      }

      function formatMarkdown(text) {
        // Minimal markdown: code blocks, inline code, bold, italic, links
        return text
          .replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, '<div class="chat-code"><code>$2</code></div>')
          .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
          .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
          .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
          .replace(/\\n/g, '<br>');
      }

      function sendMessage() {
        var text = $input.value.trim();
        if (!text || state !== "idle") return;
        addMessage("user", escapeHtml(text));
        var opts = {};
        if ($model.value) opts.model = $model.value;
        if ($thinking.value !== "off") opts.thinking = $thinking.value;
        if ($cwdInput.value) opts.cwd = $cwdInput.value;
        wsSend({ type: "message", text: text, options: opts });
        $input.value = "";
        $input.style.height = "auto";
      }

      // Event listeners
      $send.addEventListener("click", sendMessage);
      $abort.addEventListener("click", function() { wsSend({ type: "abort" }); });
      $input.addEventListener("keydown", function(e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      });
      $input.addEventListener("input", function() {
        this.style.height = "auto";
        this.style.height = Math.min(this.scrollHeight, 200) + "px";
      });
      $newBtn.addEventListener("click", function() {
        $messages.innerHTML = "";
        wsSend({ type: "init", createNew: true });
      });

      // Start connection
      connect();
    })();
    </script>
  `;

  // Use layout but with special container class for full-height chat
  const content = `</div><!-- close .container -->
    <div class="container chat-container">
    ${chatHtml}
    ${chatJs}
  `;

  return layout(content, { title: "Chat", activePath: "/chat", extraHead: chatCss });
}
