# Web Chat Implementation Plan

## Step 1: WebSocket endpoint on Hono server
- **File:** `xtdb-event-logger-ui/server.ts`
- **What:** Add `app.get("/ws", upgradeWebSocket(...))` using Hono's WebSocket helper
- **Dep:** Hono's `@hono/node-ws` adapter
- **Test:** Connect with `wscat -c ws://localhost:3333/ws`, send `{"type":"ping"}`, get `{"type":"pong"}`

## Step 2: SDK session factory
- **File:** `xtdb-event-logger-ui/lib/agent-session.ts` (new)
- **What:** `createWebSession(ws)` function that calls `createAgentSession` with `DefaultResourceLoader`, returns session
- **Key:** Use `extensionFactories` to add uiBridge, pass `cwd` from client
- **Dep:** `@mariozechner/pi-coding-agent` as dependency of the UI server
- **Test:** Import and call `createWebSession()`, verify session object exists

## Step 3: Event forwarding
- **File:** `xtdb-event-logger-ui/lib/ws-handler.ts` (new)
- **What:** On WS connect → create session, `session.subscribe()` → forward events as JSON
- **Protocol:** Client sends `{type, ...data}`, server routes to `session.prompt/steer/abort/compact`
- **Test:** Send `{"type":"prompt","text":"say hello"}`, receive streaming text_delta events

## Step 4: uiBridge extension factory
- **File:** `xtdb-event-logger-ui/lib/ui-bridge.ts` (new)
- **What:** Extension factory that patches ctx.ui.notify/setStatus to send WS messages
- **Uses:** `createEventBus()` from pi SDK for clean event routing
- **Test:** Extension triggers notify → client receives `{"type":"ui:notify",...}`

## Step 5: Chat page (HTML shell)
- **File:** `xtdb-event-logger-ui/pages/chat.ts` (new)
- **Route:** `GET /chat` → serves HTML with embedded JS (no build step)
- **Layout:** Nav bar (matching existing pages), chat area, input box, status bar
- **Test:** Visit http://localhost:3333/chat, see empty chat UI

## Step 6: WebSocket client JS
- **File:** `xtdb-event-logger-ui/static/chat.js` (new)
- **What:** Connect to `ws://host/ws`, handle reconnect, parse incoming events
- **Send:** Prompt on Enter, /commands detected and sent as prompt type
- **Test:** Type message, see it sent over WS

## Step 7: Message renderer
- **File:** Part of `chat.js`
- **What:** Render text_delta incrementally, show thinking blocks (collapsible), tool calls
- **Markdown:** Use simple regex-based rendering (code blocks, bold, links) — no heavy dep
- **Test:** Prompt "list files", see streamed response with tool call visualization

## Step 8: Tool panel + status bar
- **File:** Part of `chat.js` + `chat.ts`
- **What:** Show tool_execution_start/end as inline cards, ui:notify as toasts, ui:status in footer
- **Test:** Prompt triggers bash tool → see tool card in chat

## Step 9: Session management
- **File:** `ws-handler.ts` + `chat.js`
- **What:** Handle newSession/switchSession messages, send session list on connect
- **Test:** Click "New Session" → new session created, chat cleared

## Step 10: Model controls
- **File:** `chat.js` + `ws-handler.ts`
- **What:** Dropdown for model selection, thinking level toggle
- **API:** `session.setModel()`, `session.setThinkingLevel()`
- **Test:** Change model → subsequent responses use new model

## Step 11: Styles + polish
- **File:** `xtdb-event-logger-ui/static/style.css` (extend)
- **What:** Chat-specific styles, code block highlighting, toast animations, mobile layout
- **Test:** Visual check on desktop + mobile viewport

## Dependencies to install
```bash
cd xtdb-event-logger-ui
npm install @mariozechner/pi-coding-agent @hono/node-ws
```

## Files created
- `lib/agent-session.ts` — SDK session factory
- `lib/ws-handler.ts` — WebSocket message routing
- `lib/ui-bridge.ts` — ctx.ui → WebSocket bridge
- `pages/chat.ts` — Chat page HTML
- `static/chat.js` — Browser-side WebSocket client + renderer

## Files modified
- `server.ts` — WebSocket upgrade, /chat route
- `static/style.css` — Chat styles
- `package.json` — New dependencies
