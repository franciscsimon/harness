// ─── State ───────────────────────────────────────────────────────
let ws = null;
let state = "disconnected";
let currentBubble = null;
let rawText = "";
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
const $cwdInput = document.getElementById("cwd-input");

// Sidebar elements
const $contextUsage = document.getElementById("context-usage");
const $contextLabel = document.getElementById("context-label");
const $contextFill = document.getElementById("context-fill");
const $sbSessionId = document.getElementById("sb-session-id");
const $sbSessionName = document.getElementById("sb-session-name");
const $sbModel = document.getElementById("sb-model");
const $sbThinking = document.getElementById("sb-thinking");
const $sbDashLink = document.getElementById("sb-dashboard-link");
const $sbTurns = document.getElementById("sb-turns");
const $sbTokens = document.getElementById("sb-tokens");
const $sbCost = document.getElementById("sb-cost");
const $chkAutoCompact = document.getElementById("chk-auto-compact");
const $chkAutoRetry = document.getElementById("chk-auto-retry");

// ─── WebSocket ──────────────────────────────────────────────────
function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.onopen = () => {
    reconnectDelay = 1000;
    const urlSession = new URLSearchParams(location.search).get("session");
    const stored = sessionStorage.getItem("pi-chat-sessionFile");
    const sessionFile = urlSession || stored || undefined;
    if (urlSession) { sessionStorage.setItem("pi-chat-sessionFile", urlSession); history.replaceState(null, "", "/"); }
    wsSend({ type: "init", sessionFile });
  };
  ws.onclose = () => { setState("disconnected"); setTimeout(connect, reconnectDelay); reconnectDelay = Math.min(reconnectDelay * 2, 30000); };
  ws.onerror = () => {};
  ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
}

function wsSend(msg) { if (ws?.readyState === 1) ws.send(JSON.stringify(msg)); }

// ─── Message Handling ───────────────────────────────────────────
function handleMessage(msg) {
  switch (msg.type) {
    case "status": setState(msg.state); break;
    case "session_info": updateSessionInfo(msg); break;
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
    case "cwd": $cwdInput.value = msg.cwd; break;
    case "session_list": break; // future: session picker
    case "ui:notify": showNotify(msg.message, msg.level); break;
    case "ui:status": showExtStatus(msg.key, msg.text); break;
    case "compact_done": showSystemMsg(`📦 Compacted: ${msg.summary}`); break;
    case "context_usage": updateContextUsage(msg); break;
    // P2: Stats
    case "session_stats": updateStats(msg); break;
    // P3: Auto-compaction/retry
    case "auto_compact_start": showSystemMsg(`⚙️ Auto-compacting (${msg.reason})…`); break;
    case "auto_compact_end":
      if (msg.error) showError(`Auto-compact error: ${msg.error}`);
      else if (msg.aborted) showSystemMsg("⚙️ Auto-compact aborted");
      else showSystemMsg(`⚙️ Auto-compacted${msg.summary ? ": " + msg.summary : ""}`);
      break;
    case "auto_retry_start":
      showSystemMsg(`🔄 Retrying (${msg.attempt}/${msg.maxAttempts}) in ${(msg.delayMs / 1000).toFixed(0)}s — ${msg.error}`);
      break;
    case "auto_retry_end":
      if (msg.success) showSystemMsg(`🔄 Retry succeeded (attempt ${msg.attempt})`);
      else showError(`🔄 Retry failed: ${msg.error ?? "max attempts reached"}`);
      break;
    // P3: Settings
    case "settings_update":
      $chkAutoCompact.checked = msg.autoCompact;
      $chkAutoRetry.checked = msg.autoRetry;
      break;
    // P4: Branching
    case "fork_points": break; // future: fork picker UI
    case "forked": showSystemMsg(`🌿 Forked → ${msg.sessionFile}`); break;
    // P6: Export/copy
    case "exported_html": showSystemMsg(`📄 Exported: ${msg.path}`); break;
    case "copied_text":
      if (msg.text) { navigator.clipboard?.writeText(msg.text); showSystemMsg("📋 Copied to clipboard"); }
      else showSystemMsg("📋 No assistant reply to copy");
      break;
  }
}

// ─── Session Info (sidebar) ─────────────────────────────────────
function updateSessionInfo(msg) {
  $sbSessionId.innerHTML = `<span class="sb-row-label">ID:</span> ${esc(msg.sessionId.split("/").pop())}`;
  $sbModel.innerHTML = `<span class="sb-row-label">Model:</span> ${esc(msg.model)}`;
  $sbThinking.innerHTML = `<span class="sb-row-label">Thinking:</span> ${esc(msg.thinkingLevel)}`;
  $sbSessionName.innerHTML = msg.sessionName
    ? `<span class="sb-row-label">Name:</span> ${esc(msg.sessionName)}`
    : "";
  if (msg.sessionFile) {
    sessionStorage.setItem("pi-chat-sessionFile", msg.sessionFile);
    $sbDashLink.href = `http://localhost:3333/sessions#${encodeURIComponent(msg.sessionFile)}`;
  }
}

// ─── Stats (sidebar) ────────────────────────────────────────────
function updateStats(msg) {
  $sbTurns.innerHTML = `<span class="sb-row-label">Turns:</span> ${msg.userMessages} user · ${msg.assistantMessages} asst · ${msg.toolCalls} tools`;
  $sbTokens.innerHTML = `<span class="sb-row-label">Tokens:</span> ${formatTokens(msg.tokens.total)} (in:${formatTokens(msg.tokens.input)} out:${formatTokens(msg.tokens.output)})`;
  $sbCost.innerHTML = `<span class="sb-row-label">Cost:</span> $${msg.cost.toFixed(4)}`;
}

// ─── State Management ───────────────────────────────────────────
function setState(s) {
  state = s;
  const colors = { disconnected: "#ef4444", idle: "#22c55e", streaming: "#f97316", initializing: "#eab308", compacting: "#a855f7" };
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
    details.innerHTML = `<summary>💭 Thinking…</summary><div class="chat-thinking-body"></div>`;
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

function showNotify(message, level) {
  const colors = { info: "#3b82f6", warn: "#f97316", error: "#ef4444", success: "#22c55e" };
  const color = colors[level] ?? colors.info;
  const toast = el("div", "chat-toast");
  toast.style.borderLeftColor = color;
  toast.textContent = message;
  $messages.appendChild(toast);
  scrollDown();
  setTimeout(() => { toast.style.opacity = "0.4"; }, 8000);
}

function showExtStatus(key, text) {
  let bar = document.getElementById("ext-status-bar");
  if (!bar) {
    bar = el("div", "chat-ext-status");
    bar.id = "ext-status-bar";
    document.querySelector(".chat-input-wrap").prepend(bar);
  }
  if (!text) { bar.querySelectorAll(`[data-key="${key}"]`).forEach(e => e.remove()); return; }
  let span = bar.querySelector(`[data-key="${key}"]`);
  if (!span) { span = el("span", "chat-ext-status-item"); span.dataset.key = key; bar.appendChild(span); }
  span.textContent = text;
}

function showSystemMsg(text) {
  const div = el("div", "chat-system-msg");
  div.textContent = text;
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

// ─── Context Usage ──────────────────────────────────────────────
function updateContextUsage(msg) {
  const { tokens, contextWindow, percent } = msg;
  if (contextWindow <= 0) { $contextUsage.style.display = "none"; return; }
  $contextUsage.style.display = "flex";
  const pct = percent != null ? percent : 0;
  const used = tokens != null ? formatTokens(tokens) : "?";
  const max = formatTokens(contextWindow);
  const remaining = Math.max(0, 100 - pct);
  $contextLabel.innerHTML = `${used} / ${max} · <strong>${remaining.toFixed(0)}% remaining</strong>`;
  $contextFill.style.width = pct + "%";
  $contextFill.className = "chat-context-fill" + (pct >= 80 ? " ctx-danger" : pct >= 60 ? " ctx-warn" : "");
}

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "k";
  return String(n);
}

// ─── Input ──────────────────────────────────────────────────────
$input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPrompt(); }
});
$send.addEventListener("click", sendPrompt);
$abort.addEventListener("click", () => wsSend({ type: "abort" }));
$newBtn.addEventListener("click", () => { sessionStorage.removeItem("pi-chat-sessionFile"); wsSend({ type: "new_session" }); $messages.innerHTML = ""; });
$thinking.addEventListener("change", () => wsSend({ type: "set_thinking", level: $thinking.value }));
$cwdInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const cwd = $cwdInput.value.trim();
    if (cwd) { wsSend({ type: "set_cwd", cwd }); $messages.innerHTML = ""; }
    $cwdInput.blur();
  }
});
$input.addEventListener("input", autoResize);

// Sidebar buttons
document.getElementById("btn-export").addEventListener("click", () => wsSend({ type: "export_html" }));
document.getElementById("btn-copy-last").addEventListener("click", () => wsSend({ type: "copy_last" }));
document.getElementById("btn-reload").addEventListener("click", () => { wsSend({ type: "reload" }); showSystemMsg("🔄 Reloading extensions…"); });
document.getElementById("btn-compact").addEventListener("click", () => { wsSend({ type: "compact" }); showSystemMsg("📦 Compacting…"); });

// Sidebar toggles
$chkAutoCompact.addEventListener("change", () => wsSend({ type: "set_auto_compact", enabled: $chkAutoCompact.checked }));
$chkAutoRetry.addEventListener("change", () => wsSend({ type: "set_auto_retry", enabled: $chkAutoRetry.checked }));

function sendPrompt() {
  const text = $input.value.trim();
  if (!text || state !== "idle") return;

  // Built-in slash commands
  if (text === "/compact") { wsSend({ type: "compact" }); showSystemMsg("📦 Compacting…"); $input.value = ""; autoResize(); return; }
  if (text.startsWith("/followup ") || text.startsWith("/followUp ")) {
    const msg = text.slice(text.indexOf(" ") + 1);
    addUserBubble(`[followUp] ${msg}`);
    wsSend({ type: "followUp", text: msg });
    $input.value = ""; autoResize(); return;
  }
  if (text.startsWith("/name ")) {
    const name = text.slice(6).trim();
    wsSend({ type: "set_name", name });
    showSystemMsg(`📝 Session name: ${name}`);
    $input.value = ""; autoResize(); return;
  }
  if (text === "/export") { wsSend({ type: "export_html" }); $input.value = ""; autoResize(); return; }
  if (text === "/copy") { wsSend({ type: "copy_last" }); $input.value = ""; autoResize(); return; }
  if (text === "/reload") { wsSend({ type: "reload" }); showSystemMsg("🔄 Reloading…"); $input.value = ""; autoResize(); return; }
  if (text === "/stats") { wsSend({ type: "get_stats" }); $input.value = ""; autoResize(); return; }

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
