# Web Chat Architecture

## Decision: Extend existing Hono server on port 3333

**Why:** Already has XTDB queries, styles, nav. Adding WebSocket + chat page avoids a second server, second port, duplicated DB code.

## Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│  Browser (SPA page served by Hono)                      │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Chat Panel   │  │ Tool Panel   │  │ Status Bar    │  │
│  │ (messages)   │  │ (tool calls) │  │ (notify/status│  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
│         └────────┬────────┘                   │         │
│                  │ WebSocket                   │         │
└──────────────────┼────────────────────────────┘         │
                   │                                       
┌──────────────────┼──────────────────────────────────────┐
│  Hono Server (port 3333)                                │
│  ┌───────────────┴───────────────┐                      │
│  │  WebSocket Handler            │                      │
│  │  - receives: prompt, steer,   │                      │
│  │    followUp, compact, abort,  │                      │
│  │    newSession, switchSession  │                      │
│  │  - sends: all session events  │                      │
│  │    + ui.notify + ui.setStatus │                      │
│  └───────────────┬───────────────┘                      │
│                  │                                       │
│  ┌───────────────┴───────────────┐                      │
│  │  SDK Session Manager          │                      │
│  │  createAgentSession({         │                      │
│  │    resourceLoader: Default,   │  ← extensions load   │
│  │    sessionManager,            │                      │
│  │    extensionFactories: [      │                      │
│  │      uiBridge(ws)             │  ← bridges ctx.ui    │
│  │    ]                          │                      │
│  │  })                           │                      │
│  └───────────────┬───────────────┘                      │
│                  │                                       │
│  ┌───────────────┴───────────────┐                      │
│  │  Existing pages (/, /projects,│                      │
│  │  /decisions, /artifacts, etc) │                      │
│  └───────────────────────────────┘                      │
└──────────────────────────────────────────────────────────┘
                   │
            ┌──────┴──────┐
            │  XTDB:5433  │
            └─────────────┘
```

## Data Flow: Prompt → Response → Render

```
1. Browser sends WebSocket message:  { type: "prompt", text: "fix the bug" }
2. Server calls:                     session.prompt(text)
3. SDK fires extension hooks:        before_agent_start → history-retrieval injects context
4. SDK streams events via subscribe: message_update, tool_execution_start/end, etc.
5. Server forwards each event:       ws.send(JSON.stringify(event))
6. uiBridge extension intercepts:    ctx.ui.notify() → ws.send({ type: "notify", ... })
7. Browser renders incrementally:    text deltas → chat, tool events → tool panel
```

## Bridging ctx.ui to WebSocket

Register an inline extension via `extensionFactories` that intercepts the UI context:

```typescript
const uiBridge = (ws: WebSocket): ExtensionFactory => (pi) => {
  // Intercept all events and forward ui calls
  pi.on("session_start", async (_event, ctx) => {
    // Monkey-patch ctx.ui methods to forward over WebSocket
    const origNotify = ctx.ui.notify.bind(ctx.ui);
    ctx.ui.notify = (msg, level) => {
      ws.send(JSON.stringify({ type: "ui:notify", message: msg, level }));
      return origNotify(msg, level);
    };

    const origSetStatus = ctx.ui.setStatus.bind(ctx.ui);
    ctx.ui.setStatus = (key, text) => {
      ws.send(JSON.stringify({ type: "ui:status", key, text }));
      return origSetStatus(key, text);
    };
  });
};
```

**Alternative (cleaner):** Use the `eventBus` from `DefaultResourceLoader` to emit events that the WebSocket handler listens to, instead of monkey-patching.

## WebSocket Protocol

### Client → Server
| Message | Fields |
|---------|--------|
| `prompt` | `text`, `images?` |
| `steer` | `text` |
| `followUp` | `text` |
| `compact` | — |
| `abort` | — |
| `newSession` | — |
| `switchSession` | `sessionPath` |
| `setModel` | `provider`, `modelId` |
| `setThinking` | `level` |

### Server → Client
| Message | Fields |
|---------|--------|
| `event` | Full `AgentSessionEvent` object |
| `ui:notify` | `message`, `level` |
| `ui:status` | `key`, `text` |
| `session:info` | `sessionId`, `model`, `thinkingLevel` |
| `error` | `message` |

## Tasklist (ordered, with dependencies)

### Phase A: Server foundation
1. **Add WebSocket support to Hono server** — `hono/ws` adapter, `/ws` endpoint
2. **Create SDK session factory** — `createWebSession()` using `DefaultResourceLoader` + `extensionFactories`
3. **Wire WebSocket ↔ session.subscribe()** — forward all events to client

### Phase B: UI bridge
4. **Implement uiBridge extension factory** — intercepts ctx.ui.notify/setStatus, forwards over WS
5. **Handle commands** — detect `/command` in prompt text, call `session.prompt()` (SDK expands them)

### Phase C: Browser client
6. **Chat page HTML** — `/chat` route serving SPA shell with nav links
7. **WebSocket client JS** — connect, send prompts, receive events
8. **Message renderer** — render text deltas, thinking blocks, tool calls inline
9. **Tool panel** — show active tool executions with status
10. **Status bar** — render ui:notify toasts and ui:setStatus footer

### Phase D: Session management
11. **Session controls** — new session, switch session, list sessions
12. **Model controls** — model selector, thinking level toggle

### Phase E: Polish
13. **Markdown rendering** — render assistant markdown in browser (code blocks, links)
14. **Auto-reconnect** — WebSocket reconnect on disconnect
15. **Mobile responsive** — match existing style.css patterns
