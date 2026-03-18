// ─── State ───────────────────────────────────────────────────────
let ws = null;
let state = "disconnected"; // disconnected | idle | streaming | initializing
let currentBubble = null;   // active assistant message div
let rawText = "";            // accumulated text for current message
let autoScroll = true;
let reconnectDelay = 1000;

const $messages = document.getElementById("messages");
const $input = document.getElementById("input");
const $send = document.getElementById("btn-send");
const $abort = document.getElementById("btn-abort");
const $status = document.getElementById("status");
const $model = document.getElementById("model-select");
const $thinking = document.getElementById("thinking-select");
const $newBtn = document.getElementById("btn-new");
const $sessionId = document.getElementById("session-id");
const $cwdInput = document.getElementById("cwd-input");

// ─── WebSocket ──────────────────────────────────────────────────
function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.onopen = () => { reconnectDelay = 1000; };
  ws.onclose = () => { setState("disconnected"); setTimeout(connect, reconnectDelay); reconnectDelay = Math.min(reconnectDelay * 2, 30000); };
  ws.onerror = () => {};
  ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
}

function wsSend(msg) { if (ws?.readyState === 1) ws.send(JSON.stringify(msg)); }

// ─── Message Handling ───────────────────────────────────────────
function handleMessage(msg) {
  switch (msg.type) {
    case "status": setState(msg.state); break;
    case "session_info":
      $sessionId.textContent = `Session: ${msg.sessionId.split("/").pop()}  ·  Model: ${msg.model}  ·  Thinking: ${msg.thinkingLevel}`;
      break;
    case "text_delta": appendText(msg.text); break;
    case "thinking_delta": appendThinking(msg.text); break;
    case "tool_start": startTool(msg); break;
    case "tool_update": updateTool(msg); break;
    case "tool_end": endTool(msg); break;
    case "message_start":
      if (msg.role === "assistant") startAssistantBubble();
      break;
    case "message_end": finalizeBubble(); break;
    case "agent_end": setState("idle"); break;
    case "history": renderHistory(msg.messages); break;
    case "error": showError(msg.message); break;
    case "cwd":
      $cwdInput.value = msg.cwd;
      break;
    case "session_list": break; // future use
  }
}

// ─── State Management ───────────────────────────────────────────
function setState(s) {
  state = s;
  const colors = { disconnected: "#ef4444", idle: "#22c55e", streaming: "#f97316", initializing: "#eab308" };
  $status.innerHTML = `<span style="color:${colors[s] ?? "#999"}">●</span> ${s}`;
  $input.disabled = s !== "idle";
  $send.disabled = s !== "idle";
  $abort.style.display = s === "streaming" ? "" : "none";
  $send.style.display = s === "streaming" ? "none" : "";
  if (s === "idle") $input.focus();
}

// ─── Bubble Management ──────────────────────────────────────────
function startAssistantBubble() {
  rawText = "";
  currentBubble = el("div", "chat-msg chat-msg-assistant");
  currentBubble._textArea = el("div", "chat-bubble-text");
  currentBubble._thinkArea = null;
  currentBubble._tools = [];
  currentBubble.appendChild(currentBubble._textArea);
  $messages.appendChild(currentBubble);
  scrollDown();
}

function appendText(text) {
  if (!currentBubble) startAssistantBubble();
  rawText += text;
  currentBubble._textArea.innerHTML = renderMd(rawText);
  scrollDown();
}

function appendThinking(text) {
  if (!currentBubble) startAssistantBubble();
  if (!currentBubble._thinkArea) {
    const details = el("details", "chat-thinking");
    details.innerHTML = `<summary>💭 Thinking...</summary><div class="chat-thinking-body"></div>`;
    currentBubble.insertBefore(details, currentBubble._textArea);
    currentBubble._thinkArea = details.querySelector(".chat-thinking-body");
    currentBubble._thinkRaw = "";
  }
  currentBubble._thinkRaw += text;
  currentBubble._thinkArea.textContent = currentBubble._thinkRaw;
  scrollDown();
}

function startTool(msg) {
  if (!currentBubble) startAssistantBubble();
  const details = el("details", "chat-tool");
  const inputStr = typeof msg.input === "string" ? msg.input : JSON.stringify(msg.input, null, 2);
  const truncInput = inputStr.length > 200 ? inputStr.slice(0, 200) + "…" : inputStr;
  details.innerHTML = `<summary><span class="chat-tool-icon">🔧</span> ${esc(msg.toolName)} <span class="chat-tool-status">⏳</span></summary>
    <div class="chat-tool-input"><strong>Input:</strong><pre>${esc(truncInput)}</pre></div>
    <div class="chat-tool-output"><strong>Output:</strong><pre class="chat-tool-output-pre"></pre></div>`;
  details.dataset.toolCallId = msg.toolCallId;
  currentBubble.appendChild(details);
  currentBubble._tools.push(details);
  scrollDown();
}

function updateTool(msg) {
  const tool = findTool(msg.toolCallId);
  if (!tool) return;
  const pre = tool.querySelector(".chat-tool-output-pre");
  if (pre) pre.textContent += msg.output;
  scrollDown();
}

function endTool(msg) {
  const tool = findTool(msg.toolCallId);
  if (!tool) return;
  const statusEl = tool.querySelector(".chat-tool-status");
  if (statusEl) { statusEl.textContent = msg.isError ? "✗" : "✓"; statusEl.className = msg.isError ? "chat-tool-status tool-error" : "chat-tool-status tool-ok"; }
}

function findTool(id) {
  if (!currentBubble) return null;
  return currentBubble._tools.find(t => t.dataset.toolCallId === id) ?? null;
}

function finalizeBubble() { currentBubble = null; rawText = ""; }

function addUserBubble(text) {
  const div = el("div", "chat-msg chat-msg-user");
  div.innerHTML = `<div class="chat-bubble-text">${esc(text)}</div>`;
  $messages.appendChild(div);
  scrollDown();
}

function showError(message) {
  const div = el("div", "chat-error");
  div.textContent = message;
  $messages.appendChild(div);
  scrollDown();
}

// ─── History ────────────────────────────────────────────────────
function renderHistory(messages) {
  $messages.innerHTML = "";
  for (const m of messages) {
    if (m.role === "user") { addUserBubble(m.text); continue; }
    const bubble = el("div", "chat-msg chat-msg-assistant");
    const textArea = el("div", "chat-bubble-text");
    textArea.innerHTML = renderMd(m.text || "");
    bubble.appendChild(textArea);
    if (m.toolCalls) {
      for (const tc of m.toolCalls) {
        const details = el("details", "chat-tool");
        details.innerHTML = `<summary><span class="chat-tool-icon">🔧</span> ${esc(tc.name)} <span class="chat-tool-status ${tc.isError ? "tool-error" : "tool-ok"}">${tc.isError ? "✗" : "✓"}</span></summary>
          <div class="chat-tool-input"><strong>Input:</strong><pre>${esc(tc.input)}</pre></div>
          ${tc.output ? `<div class="chat-tool-output"><strong>Output:</strong><pre>${esc(tc.output)}</pre></div>` : ""}`;
        bubble.appendChild(details);
      }
    }
    $messages.appendChild(bubble);
  }
  scrollDown();
}

// ─── Input ──────────────────────────────────────────────────────
$input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPrompt(); }
});
$send.addEventListener("click", sendPrompt);
$abort.addEventListener("click", () => wsSend({ type: "abort" }));
$newBtn.addEventListener("click", () => { wsSend({ type: "new_session" }); $messages.innerHTML = ""; });
$thinking.addEventListener("change", () => wsSend({ type: "set_thinking", level: $thinking.value }));
$cwdInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const cwd = $cwdInput.value.trim();
    if (cwd) {
      wsSend({ type: "set_cwd", cwd });
      $messages.innerHTML = "";
    }
    $cwdInput.blur();
  }
});
$input.addEventListener("input", autoResize);

function sendPrompt() {
  const text = $input.value.trim();
  if (!text || state !== "idle") return;
  addUserBubble(text);
  wsSend({ type: "prompt", text });
  $input.value = "";
  autoResize();
}

function autoResize() {
  $input.style.height = "auto";
  $input.style.height = Math.min($input.scrollHeight, 200) + "px";
}

// ─── Scroll ─────────────────────────────────────────────────────
$messages.addEventListener("scroll", () => {
  const atBottom = $messages.scrollHeight - $messages.scrollTop - $messages.clientHeight < 60;
  autoScroll = atBottom;
});

function scrollDown() {
  if (autoScroll) $messages.scrollTop = $messages.scrollHeight;
}

// ─── Markdown ───────────────────────────────────────────────────
function renderMd(src) {
  const lines = src.split("\n");
  const out = [];
  let inCode = false, codeLang = "";
  for (const raw of lines) {
    if (raw.startsWith("```")) {
      if (inCode) { out.push("</code></pre>"); inCode = false; }
      else { codeLang = raw.slice(3).trim(); out.push(`<pre class="chat-code"><code${codeLang ? ` class="lang-${esc(codeLang)}"` : ""}>`); inCode = true; }
      continue;
    }
    if (inCode) { out.push(esc(raw)); continue; }
    const t = raw.trimStart();
    if (t.startsWith("#### ")) { out.push(`<h4>${inline(t.slice(5))}</h4>`); continue; }
    if (t.startsWith("### ")) { out.push(`<h3>${inline(t.slice(4))}</h3>`); continue; }
    if (t.startsWith("## ")) { out.push(`<h2>${inline(t.slice(3))}</h2>`); continue; }
    if (t.startsWith("# ")) { out.push(`<h1>${inline(t.slice(2))}</h1>`); continue; }
    if (t.startsWith("- ") || t.startsWith("* ")) { out.push(`<li>${inline(t.slice(2))}</li>`); continue; }
    if (/^\d+\.\s/.test(t)) { out.push(`<li>${inline(t.replace(/^\d+\.\s/, ""))}</li>`); continue; }
    if (t === "") { out.push("<br>"); continue; }
    out.push(`<p>${inline(t)}</p>`);
  }
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}

function inline(s) {
  let h = esc(s);
  h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  return h;
}

// ─── Helpers ────────────────────────────────────────────────────
function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

// ─── Init ───────────────────────────────────────────────────────
connect();
