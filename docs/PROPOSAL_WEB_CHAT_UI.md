# PROPOSAL: Web Chat UI for pi Harness

## Goal

Replace terminal-based pi usage with a browser chat interface. Users send prompts, see streaming markdown responses, observe tool executions, and manage sessions — all through a web page.

---

## Context: What Exists Today

### xtdb-event-logger-ui (port 3333)

| Metric | Value |
|--------|-------|
| Total lines | ~5,200 across 25 files |
| Server | `server.ts` — 299 lines, Hono + @hono/node-server |
| Pages | 12 server-rendered HTML pages (index, sessions, session-detail, dashboard, decisions, artifacts, artifact-versions, artifact-content, projects, flow, knowledge, event-detail) |
| Client JS | `stream.js` (241 lines, SSE client), `session.js` (230 lines, timeline grouping) |
| CSS | `style.css` — 1,322 lines, dark theme, CSS custom properties |
| Libs | `db.ts` (881 lines, postgres queries), `format.ts` (206 lines), `markdown.ts` (57 lines), `diff.ts` (47 lines), `health.ts` (44 lines) |
| Dependencies | hono, @hono/node-server, postgres — 3 total |
| Pattern | Server-rendered HTML, vanilla JS for interactivity, SSE for live data |
| Nature | **Read-only observability** — displays events, never sends prompts |

### Pi SDK (`@mariozechner/pi-coding-agent` v0.59.0)

Provides `createAgentSession()` which returns a fully-loaded session with all harness extensions, skills, tools, and agents. The session exposes:

- **`session.subscribe(callback)`** — event stream (message_update, tool_execution_*, turn_*, agent_*)
- **`session.prompt(text)`** — send user message
- **`session.steer(text)`** — interrupt during streaming
- **`session.abort()`** — cancel generation
- **`session.newSession()` / `session.switchSession(path)`** — session management
- **`session.setModel(model)` / `session.setThinkingLevel(level)`** — model control
- **`session.messages`** — full conversation history
- **`session.isStreaming`** — current state

### Agent Spawner Pattern

The existing `agent-spawner` shells out via `spawn("pi", [...args])` — it does NOT use `createAgentSession()` programmatically. The chat server would be the **first in-process SDK consumer** in the harness.

---

## Approach Evaluation

### Approach 1: Add `/chat` route to existing xtdb-event-logger-ui

**How it works:** New `/chat` page in the existing Hono app. Backend creates `AgentSession` via SDK, bridges events over WebSocket to browser. Chat JS file handles rendering.

| Criterion | Assessment |
|-----------|------------|
| Implementation complexity | **Medium** (~600 lines new). Add WebSocket upgrade to server.ts, new `pages/chat.ts`, new `static/chat.js` (~400 lines), CSS additions (~100 lines) |
| UX quality | **Good.** Reuses existing dark theme and nav. Chat is one click from any page. |
| Integration | **Tight.** Same process, same nav. Can link directly from chat to session events in the event stream. |
| Maintenance | **Risky.** server.ts grows from 299 → ~450 lines. Mixes read-only observability with interactive write operations. A crash in the SDK session crashes the monitoring UI. |
| Streaming | Works — WebSocket from the same Hono server |
| Concurrent users | **Problem.** Single AgentSession per server? Or a Map of sessions per WebSocket connection? Either way, the observability server is now managing long-lived stateful connections. |
| Abort/errors | SDK errors could bubble up and break the event polling SSE stream |

**Verdict:** Tempting for the shared nav, but violates separation of concerns. The event-logger-ui is a stateless read-only dashboard. Adding a stateful interactive agent session changes its failure domain.

---

### Approach 2: Standalone chat server (new directory)

**How it works:** New `web-chat/` directory alongside `xtdb-event-logger-ui`. Hono server on port 3334. Backend manages SDK sessions, WebSocket for bidirectional streaming. Dedicated chat UI.

| Criterion | Assessment |
|-----------|------------|
| Implementation complexity | **Medium** (~900 lines total across ~8 files). Server, WebSocket handler, session manager, chat page, chat JS, CSS. |
| UX quality | **Good.** Dedicated interface optimized for chat. Can link to event-logger-ui for deep inspection. |
| Integration | **Clean.** Links to `:3333/sessions/:id` for event details. Events still flow through XTDB event-logger as normal. |
| Maintenance | **Low.** Independent process. Can restart without affecting monitoring. CSS can symlink or copy from event-logger-ui. |
| Streaming | WebSocket in a dedicated server — no contention with SSE polling |
| Concurrent users | **Clean.** Each WebSocket connection gets its own AgentSession. Server holds a Map<connectionId, AgentSession>. |
| Abort/errors | Isolated — SDK crash only affects the chat connection, not the monitoring dashboard |

**Verdict:** Best separation of concerns. Matches existing harness pattern (xtdb-event-logger and xtdb-event-logger-ui are already separate processes). Chat is fundamentally different from monitoring — different state model, different failure modes.

---

### Approach 3: Embedded panel/drawer on every page

**How it works:** Collapsible chat panel at the bottom or side of every page in xtdb-event-logger-ui. Floating button to toggle. Always-available.

| Criterion | Assessment |
|-----------|------------|
| Implementation complexity | **High** (~1,200 lines). Every page renderer needs panel injection. Panel state management across page navigations. WebSocket reconnection on each page load or SPA-ification of the whole app. |
| UX quality | **Mixed.** Convenient to have chat everywhere, but panel competes for screen space with event data. Chat history lost on page navigation unless we SPA-ify. |
| Integration | **Highest.** Can reference artifacts/events directly from chat context. |
| Maintenance | **Highest.** Every new page must include the panel. Panel CSS must not conflict with page CSS. Layout bugs multiply. |
| Streaming | Same WebSocket concerns as Approach 1, plus reconnection on navigation |
| Concurrent users | Same problems as Approach 1 |
| Abort/errors | Same problems as Approach 1, plus panel can break page layout |

**Verdict:** The most complex option for the least gain. Would require SPA-ifying the whole app to maintain WebSocket connections across page navigations. The existing server-rendered architecture fights this at every step.

---

### Approach 4: Full SPA with framework (React/Svelte/etc)

**How it works:** Modern SPA with build tooling. Component model for chat bubbles, tool calls, markdown rendering.

| Criterion | Assessment |
|-----------|------------|
| Implementation complexity | **High** (~800 lines of components + build config + 50+ npm deps). Vite, React/Svelte, markdown library, syntax highlighter. |
| UX quality | **Highest potential.** Component model makes complex UI (nested tool calls, collapsible thinking) easier to build and maintain. |
| Integration | Same as Approach 2 — separate server, links to event-logger-ui |
| Maintenance | **High.** Build tooling, framework updates, large dependency tree. Doesn't match the vanilla JS pattern of the existing UI. |
| Streaming | Same as Approach 2 — WebSocket |
| Concurrent users | Same as Approach 2 — clean |
| Abort/errors | Same as Approach 2 — isolated |

**Verdict:** Over-engineered for the current need. The chat UI is a single page with a message list and input area — a framework buys little over vanilla JS. Introduces a build step and 50+ transitive dependencies for marginal benefit. Could be revisited later if the UI grows complex enough to justify it.

---

## Recommendation: Approach 2 — Standalone Chat Server

### Why

1. **Separation of concerns.** Monitoring (read-only, stateless) stays independent from chat (interactive, stateful). A crash in one doesn't kill the other.
2. **Matches harness convention.** The xtdb-event-logger (data ingestion) and xtdb-event-logger-ui (display) are already separate processes on separate ports. Chat follows the same pattern.
3. **First in-process SDK consumer.** The `createAgentSession()` call is heavyweight — loads all extensions, connects to XTDB, initializes tools. Isolating this in its own process keeps the monitoring UI lightweight.
4. **Concurrent users.** Each WebSocket maps to one `AgentSession`. Multiple browser tabs = multiple independent sessions. No shared state complications.
5. **Same tech stack.** Hono + vanilla JS + same CSS. No new patterns to learn.
6. **Cross-linking.** Chat server at `:3334` links to event-logger-ui at `:3333` for deep event inspection. The nav bars can reference each other.

### CSS Sharing

Symlink `static/style.css → ../xtdb-event-logger-ui/static/style.css` for the base theme. Chat-specific CSS in a separate `static/chat.css` file. This ensures the dark theme and common components (buttons, badges, cards) stay in sync.

---

## Implementation Design

### Directory Structure

```
web-chat/
├── package.json            # hono, @hono/node-server, @mariozechner/pi-coding-agent
├── server.ts               # Hono app, routes, WebSocket upgrade
├── lib/
│   ├── session-pool.ts     # Map<connectionId, AgentSession>, create/destroy lifecycle
│   └── ws-protocol.ts      # WebSocket message types, serialization
├── pages/
│   └── chat.ts             # Server-rendered chat page HTML shell
├── static/
│   ├── style.css           # Symlink → ../xtdb-event-logger-ui/static/style.css
│   ├── chat.css            # Chat-specific styles
│   └── chat.js             # Client-side chat logic
```

### Dependencies

```json
{
  "dependencies": {
    "hono": "^4.0.0",
    "@hono/node-server": "^1.0.0",
    "@mariozechner/pi-coding-agent": "^0.59.0"
  }
}
```

Three dependencies. No build step. Same pattern as xtdb-event-logger-ui.

### WebSocket Protocol

All messages are JSON with a `type` field. Client → Server:

```typescript
// Client sends
type ClientMessage =
  | { type: "prompt"; text: string }
  | { type: "steer"; text: string }         // interrupt during streaming
  | { type: "abort" }
  | { type: "new_session" }
  | { type: "switch_session"; path: string }
  | { type: "list_sessions" }
  | { type: "set_model"; model: string }
  | { type: "set_thinking"; level: string }
  | { type: "cycle_model" }
  | { type: "compact" }
```

Server → Client:

```typescript
// Server sends
type ServerMessage =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "tool_start"; toolName: string; toolCallId: string; input: string }
  | { type: "tool_update"; toolCallId: string; output: string }
  | { type: "tool_end"; toolCallId: string; result: string; isError: boolean }
  | { type: "turn_start" }
  | { type: "turn_end" }
  | { type: "agent_start" }
  | { type: "agent_end" }
  | { type: "message_start"; role: string }
  | { type: "message_end" }
  | { type: "streaming_state"; isStreaming: boolean }
  | { type: "session_info"; sessionId: string; model: string; thinkingLevel: string }
  | { type: "session_list"; sessions: Array<{ id: string; name: string }> }
  | { type: "error"; message: string }
  | { type: "history"; messages: Array<{ role: string; content: string }> }
```

### Server (`server.ts`)

```
Routes:
  GET  /              → chat page HTML
  GET  /static/:file  → static files (style.css, chat.css, chat.js)
  GET  /ws            → WebSocket upgrade

WebSocket lifecycle:
  on open:
    1. Create AgentSession via createAgentSession({ cwd: process.cwd(), ... })
    2. Store in sessionPool Map<wsId, AgentSession>
    3. Subscribe to session events → translate to ServerMessage → ws.send()
    4. Send session_info (current model, session id)
    5. Send history (existing messages if reconnecting to same session)

  on message:
    Parse ClientMessage, dispatch:
    - prompt  → session.prompt(text)
    - steer   → session.steer(text)
    - abort   → session.abort()
    - new_session → session.newSession(), send session_info
    - switch_session → session.switchSession(path), send history + session_info
    - list_sessions → SessionManager.list(cwd), send session_list
    - set_model → session.setModel(model), send session_info
    - set_thinking → session.setThinkingLevel(level), send session_info
    - cycle_model → session.cycleModel(), send session_info
    - compact → session.compact()

  on close:
    Remove from sessionPool
    (Session persists in SessionManager on disk — can be resumed)

  on error:
    Send { type: "error", message } to client before closing
```

### Session Pool (`lib/session-pool.ts`)

```
Map<string, { session: AgentSession; createdAt: number; lastActivity: number }>

- create(wsId, cwd): creates AgentSession, stores in map
- get(wsId): returns session or null
- destroy(wsId): cleans up session, removes from map
- Idle timeout: destroy sessions with no activity for 30 minutes
- Max sessions: cap at 5 concurrent to prevent resource exhaustion

Key design decision: one AgentSession per WebSocket connection.
NOT one shared session — each browser tab is independent.
```

### Chat Page (`pages/chat.ts`)

Server-rendered HTML shell. All interactivity in chat.js.

```
Layout:
┌────────────────────────────────────────────────┐
│  Header: "💬 pi Chat" · [Session: abc123 ▾]   │
│  Nav: 📊 Events · 📂 Sessions · 📋 Decisions  │
│  Model: [claude-sonnet ▾]  Think: [medium ▾]   │
├────────────────────────────────────────────────┤
│                                                │
│  Message area (scrollable)                     │
│                                                │
│  ┌─ user ──────────────────────────────────┐   │
│  │ Build a REST API for managing todos     │   │
│  └─────────────────────────────────────────┘   │
│                                                │
│  ┌─ assistant ─────────────────────────────┐   │
│  │ I'll create a todo API with...          │   │
│  │                                         │   │
│  │ ┌─ 🔧 Tool: Read [▾] ────────────────┐ │   │
│  │ │ path: src/app.ts                    │ │   │
│  │ │ ─── output ───                      │ │   │
│  │ │ import { Hono } from "hono";        │ │   │
│  │ └────────────────────────────────────┘ │   │
│  │                                         │   │
│  │ ┌─ 💭 Thinking [▾] ──────────────────┐ │   │
│  │ │ Let me analyze the file structure   │ │   │
│  │ └────────────────────────────────────┘ │   │
│  │                                         │   │
│  │ Here's the implementation:              │   │
│  │ ```typescript                           │   │
│  │ const app = new Hono();                 │   │
│  │ ```                                     │   │
│  └─────────────────────────────────────────┘   │
│                                                │
├────────────────────────────────────────────────┤
│  [● Connected] [⏹ Abort]                      │
│  ┌────────────────────────────────────┐ [Send] │
│  │ Type a message... (Shift+Enter    │         │
│  │ for newline)                       │         │
│  └────────────────────────────────────┘         │
└────────────────────────────────────────────────┘
```

### Chat Client (`static/chat.js`)

Vanilla JS, same pattern as stream.js and session.js. Key responsibilities:

**WebSocket connection management:**
- Connect to `ws://host:3334/ws`
- Auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s)
- Connection status indicator (● green = connected, ● red = disconnected, ● yellow = reconnecting)

**Message rendering:**
- User messages: simple div with the text
- Assistant messages: streaming markdown, built incrementally from `text_delta` events
- Markdown rendering: extend existing `lib/markdown.ts` logic client-side (headings, bold, italic, code blocks, inline code, links, lists)
- Code blocks: `<pre><code>` with language class for basic syntax highlighting via CSS
- Thinking blocks: collapsible `<details>` element, dimmed styling, built from `thinking_delta` events
- Tool calls: collapsible `<details>` with tool name as summary, input + output inside, color-coded (orange for tools, matching event-logger-ui convention)
- Auto-scroll: scroll to bottom on new content, UNLESS user has scrolled up (detect with scroll position check)

**Input handling:**
- `<textarea>` with auto-resize
- Enter → send (calls `ws.send({ type: "prompt", text })`)
- Shift+Enter → newline
- Disabled during streaming (re-enabled on `turn_end` or `agent_end`)
- Abort button visible only during streaming → sends `{ type: "abort" }`

**Session/model controls:**
- Session dropdown: populated from `session_list` response, triggers `switch_session`
- "New Session" button → sends `new_session`
- Model dropdown: populated with known models, triggers `set_model`
- Thinking level dropdown: low/medium/high, triggers `set_thinking`

**State machine:**
```
idle → [user sends prompt] → streaming
streaming → [agent_end / turn_end] → idle
streaming → [user clicks abort] → aborting → idle
idle → [session switch] → loading → idle
disconnected → [reconnect] → idle (with history reload)
```

### Chat-Specific CSS (`static/chat.css`)

Extends the existing dark theme. Key new classes:

```css
/* Message bubbles */
.chat-msg          — flex column container
.chat-msg-user     — right-aligned, subtle blue-tinted bg
.chat-msg-assistant — left-aligned, card bg (--bg-card)
.chat-msg-role     — small role label above bubble

/* Streaming cursor */
.chat-cursor       — blinking block cursor appended during streaming

/* Tool calls (collapsible) */
.chat-tool         — details element, orange left-border (matching --tool color #f97316)
.chat-tool summary — tool name + status icon
.chat-tool-input   — pre block, dimmed
.chat-tool-output  — pre block, normal

/* Thinking blocks */
.chat-thinking     — details element, purple left-border (#8b5cf6)
.chat-thinking summary — "Thinking..." label

/* Code blocks */
.chat-code         — pre with bg-input, rounded, horizontal scroll
.chat-code-lang    — language badge top-right corner

/* Input area */
.chat-input-wrap   — sticky bottom bar
.chat-input        — textarea, auto-resize, monospace
.chat-send-btn     — primary action button
.chat-abort-btn    — red, only visible during streaming

/* Controls bar */
.chat-controls     — flex row, session/model dropdowns
.chat-status       — connection indicator dot + label

/* Scrollable message area */
.chat-messages     — flex-grow, overflow-y auto, padding
```

---

## How It Handles Key Scenarios

### Streaming Text

1. `message_start { role: "assistant" }` → create new message bubble div
2. `text_delta { text }` → append text to bubble, re-render markdown incrementally
3. Incremental markdown: accumulate raw text in a buffer, re-parse on each delta. This is simple and correct — the markdown renderer is fast enough at <50KB. No need for incremental parsing.
4. `message_end` → remove streaming cursor, finalize markdown

### Tool Execution Display

1. `tool_start { toolName, input }` → create collapsible `<details>` inside current assistant bubble, show tool name + truncated input
2. `tool_update { output }` → append to output area inside the tool details (streaming tool output)
3. `tool_end { result, isError }` → finalize output, add ✓/✗ icon to summary, color red if error
4. Tool details start **collapsed by default** to keep the chat readable. User clicks to expand.

### Thinking Display

1. `thinking_delta { text }` → accumulate in a `<details class="chat-thinking">` block
2. Thinking blocks are **collapsed by default** with "💭 Thinking..." as the summary
3. Dimmed/muted styling to de-emphasize vs. main response text

### Error States

- SDK errors during `prompt()` → catch, send `{ type: "error", message }`, client shows red error banner above input
- WebSocket disconnect → show "Disconnected" status, disable input, auto-reconnect
- Tool errors → `tool_end` with `isError: true` shows red border + ✗ icon on the tool block
- Session creation failure → error message on initial connect, retry button

### Abort

- User clicks ⏹ Abort → client sends `{ type: "abort" }`
- Server calls `session.abort()` → SDK stops generation
- Partial text remains visible. "[Aborted]" label appended to the message.
- Input re-enabled immediately.

### Model Switching

- Dropdown sends `{ type: "set_model", model }` or `{ type: "set_thinking", level }`
- Server calls SDK method, sends back `session_info` with confirmed new model
- Client updates dropdown to reflect actual model (in case of fallback)
- Can switch mid-conversation — next prompt uses new model

### Session History

- On connect, server sends `{ type: "history", messages }` with full conversation
- Client renders all past messages (user + assistant) from history
- On `switch_session`, server sends new history, client clears and re-renders
- On `new_session`, client clears all messages

### Concurrent Users

- Each WebSocket = one `AgentSession` instance
- Two browser tabs = two independent sessions (different session IDs)
- Session pool has a max of 5 concurrent connections to prevent resource exhaustion (each AgentSession loads all extensions)
- Idle sessions cleaned up after 30 minutes with no WebSocket activity

---

## Implementation Steps

### Phase 1: Backend Core (~250 lines, 3 files)

| Step | File | What |
|------|------|------|
| 1 | `package.json` | Create with 3 dependencies (hono, @hono/node-server, @mariozechner/pi-coding-agent) |
| 2 | `lib/ws-protocol.ts` | Define ClientMessage and ServerMessage types, serialization helpers |
| 3 | `lib/session-pool.ts` | Session pool: create/get/destroy, idle timeout, max connections |
| 4 | `server.ts` | Hono app: static files, chat page route, WebSocket upgrade, event bridge (subscribe → translate → ws.send), message dispatch |

### Phase 2: Frontend Core (~350 lines, 3 files)

| Step | File | What |
|------|------|------|
| 5 | `pages/chat.ts` | Server-rendered HTML shell with header, message area, input bar, script/CSS includes |
| 6 | `static/chat.js` | WebSocket client, message rendering, markdown parsing, input handling, auto-scroll, state machine |
| 7 | `static/chat.css` | Chat-specific styles (message bubbles, tool blocks, thinking blocks, input area, status indicators). Imports base theme via symlinked style.css |

### Phase 3: Interactive Features (~200 lines)

| Step | What |
|------|------|
| 8 | Tool call display: collapsible details with streaming output, error states |
| 9 | Thinking block display: collapsible, dimmed, streaming |
| 10 | Abort button: visible during streaming, sends abort, shows [Aborted] label |

### Phase 4: Session & Model Management (~100 lines)

| Step | What |
|------|------|
| 11 | Session controls: new/switch/list session via dropdown + button |
| 12 | Model controls: model selector dropdown, thinking level dropdown |
| 13 | History loading: render full message history on connect/switch |

### Phase 5: Polish

| Step | What |
|------|------|
| 14 | Connection status indicator + auto-reconnect with backoff |
| 15 | Cross-links: nav links to `:3333` event-logger-ui pages, add 💬 Chat link to event-logger-ui nav pointing to `:3334` |
| 16 | Error handling: SDK errors, WebSocket errors, session pool exhaustion |

**Total estimate: ~900 lines across 8 files. 16 implementation steps.**

---

## Risks

| Risk | Mitigation |
|------|------------|
| **`createAgentSession()` is heavyweight** — loads all extensions, connects to XTDB. Could be slow on first connection. | Lazy initialization: create session on first `prompt`, not on WebSocket connect. Show "Initializing..." state. |
| **Memory per session** — each AgentSession holds message history, extension state, XTDB connections. | Cap at 5 concurrent sessions. Idle timeout at 30 minutes. Monitor memory usage. |
| **Extension side effects** — extensions fire on events. A chat session triggers artifact-tracker, decision-log, event-logger, etc. | This is actually desirable — chat sessions should be fully observed. But verify that extension startup doesn't fail when running inside a Hono server process vs. the `pi` CLI. |
| **WebSocket dropped mid-stream** — user closes tab during tool execution. | Session pool cleanup destroys the AgentSession. The session state is persisted to disk by SessionManager, so it can be resumed later. |
| **SDK version coupling** — `@mariozechner/pi-coding-agent` API could change across versions. | Pin to `^0.59.0`. The session API is the public surface — less likely to break than internals. |
| **`createAgentSession` not designed for server use** — the SDK assumes single-user CLI context. Auth, cwd, and environment may not isolate cleanly across multiple sessions in one process. | Test with 2 concurrent sessions first. If isolation is a problem, fall back to spawning `pi --server` subprocesses (like agent-spawner does) and proxying via stdio. |
| **No Hono WebSocket built-in** — Hono's node-server adapter may not support `ws` natively. | Use the `hono/ws` helper or add `ws` npm package (~1 dependency). The @hono/node-server `createNodeWebSocket` adapter exists for this. |

---

## Verification

1. **Start server:** `cd web-chat && npx jiti server.ts` → listening on port 3334
2. **Open browser:** `http://localhost:3334` → chat page loads with dark theme
3. **Send prompt:** type "hello" → see streaming text response, text_delta rendering
4. **Tool execution:** send "read package.json" → see collapsible tool block with input/output
5. **Thinking:** send a complex question → see collapsed thinking block
6. **Abort:** send a long prompt, click ⏹ → generation stops, "[Aborted]" shown
7. **New session:** click "New Session" → messages clear, new session ID shown
8. **Model switch:** change model dropdown → session_info confirms new model
9. **Concurrent tabs:** open 2 tabs → each has independent session
10. **Reconnect:** kill and restart server → client reconnects, history reloads
11. **Cross-link:** click "📊 Events" → opens `:3333` event-logger-ui showing events from the chat session
