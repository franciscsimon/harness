# SESSION_GROUPING.md — Group Events by Session

> Status: **DONE** (commit `cb3936c`)
> Add session-grouped views to the event stream UI

---

## Problem

The current UI shows a flat stream of all events across all sessions.
When multiple sessions exist, you can't see the lifecycle of a single session
as a coherent unit — which events belong together, what happened in order,
where agent runs start/end, which tool calls belong to which turn.

---

## Data Shape (from XTDB exploration)

Every event row has a `session_id` column (a file path like `/Users/.../.pi/agent/sessions/abc.jsonl`).
Events within a session have monotonically increasing `seq` numbers.

A real session timeline looks like:

```
#0  session_directory       [session]
#1  session_start           [session]       ← session opens
#2  input                   [input]         ← user types prompt
#3  before_agent_start      [agent]         ┐
#4  agent_start             [agent]         │ agent run
#5  turn_start              [agent]         │ ┐
#6  context                 [tool]          │ │ turn 0
#7  before_provider_request [tool]          │ │
#8  message_start           [message]       │ │
#9  message_update          [message]       │ │ (sampled)
#10 tool_execution_start    [tool]          │ │ ┐
#11 tool_call               [tool]          │ │ │ tool exec
#12 tool_result             [tool]          │ │ │
#13 tool_execution_end      [tool]          │ │ ┘
#14 message_end             [message]       │ │
#15 turn_end                [agent]         │ ┘
#16 agent_end               [agent]         ┘
#17 session_shutdown        [session]       ← session closes
```

### Natural groupings within a session

| Group | Start event | End event | Contains |
|-------|-------------|-----------|----------|
| **Session** | `session_start` | `session_shutdown` | Everything |
| **Agent Run** | `before_agent_start` / `agent_start` | `agent_end` | Turns, messages, tool calls |
| **Turn** | `turn_start` | `turn_end` | Context, provider req, messages, tool execs |
| **Tool Execution** | `tool_execution_start` | `tool_execution_end` | `tool_call`, `tool_result` |
| **Message** | `message_start` | `message_end` | `message_update` samples |

These nest: Session → Agent Run → Turn → Tool Execution / Message.

### Linking keys

| Level | Linking field | Example |
|-------|---------------|---------|
| Session | `session_id` | `/Users/.../.pi/agent/sessions/abc.jsonl` |
| Turn | `turn_index` | `0`, `1`, `2` (resets per agent run) |
| Tool Execution | `tool_call_id` | `call-abc-123` |

---

## Design

### Two new views (added to existing UI)

#### 1. Session List Page (`/sessions`)

A list of all sessions with summary cards:

```
┌──────────────────────────────────────────────────────────────┐
│ 📂 Sessions                                                   │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐  │
│ │ abc.jsonl                                    35 events  │  │
│ │ Started: 2m ago  Duration: 1m 42s                       │  │
│ │ [session:9] [agent:5] [tool:7] [message:3] [input:2]  │  │
│ │ Last: agent_end #35                             2m ago  │  │
│ └─────────────────────────────────────────────────────────┘  │
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐  │
│ │ def.jsonl                                    12 events  │  │
│ │ Started: 1h ago  Duration: 5m 10s                       │  │
│ │ [session:3] [agent:2] [tool:4] [message:2] [input:1]  │  │
│ │ Last: session_shutdown #12                      1h ago  │  │
│ └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

#### 2. Session Detail Page (`/sessions/:id`)

All events for one session, displayed as a **nested timeline** with
collapsible groups:

```
┌──────────────────────────────────────────────────────────────┐
│ ← Sessions    abc.jsonl                        35 events    │
│ Started: 2m ago   Duration: 1m 42s   cwd: /Users/opunix/h  │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ #0  ● session_directory [session]                     3m ago │
│ #1  ● session_start     [session]                     3m ago │
│                                                               │
│ ▼ Agent Run #1                                     (14 events)│
│ │ #2  ● input           [input]   "list files here"   3m ago │
│ │ #3  ● before_agent_start [agent]                    3m ago │
│ │ #4  ● agent_start     [agent]                       3m ago │
│ │                                                             │
│ │ ▼ Turn 0                                        (9 events) │
│ │ │ #5  ● turn_start    [agent]                       3m ago │
│ │ │ #6  ● context       [tool]    msgs: 5             3m ago │
│ │ │ #7  ● before_provider_request [tool]              3m ago │
│ │ │ #8  ● message_start [message] role=assistant      3m ago │
│ │ │ #9  ● message_update [message] delta=text 847b    3m ago │
│ │ │                                                           │
│ │ │ ▼ Tool: bash (call-abc-123)                  (4 events)  │
│ │ │ │ #10 ● tool_execution_start [tool]               2m ago │
│ │ │ │ #11 ● tool_call   [tool]   {"command":"ls"}     2m ago │
│ │ │ │ #12 ● tool_result [tool]   isError=false        2m ago │
│ │ │ │ #13 ● tool_execution_end [tool]                 2m ago │
│ │ │                                                           │
│ │ │ #14 ● message_end   [message] role=assistant      2m ago │
│ │ │ #15 ● turn_end      [agent]   tools: 1            2m ago │
│ │                                                             │
│ │ #16 ● agent_end       [agent]   msgs: 8             2m ago │
│                                                               │
│ #17 ● session_shutdown  [session]                     2m ago │
└──────────────────────────────────────────────────────────────┘
```

### Key interactions

- **Click session card** → navigates to `/sessions/:id`
- **Click group header** (Agent Run / Turn / Tool) → collapse/expand
- **Click any event** → expand inline detail (same as stream view)
- **All groups expanded by default** — user collapses what they don't need
- **Navigation header** links back to session list and main stream

### How grouping works (client-side)

The server returns a flat ordered list of events for a session.
The client JS builds the nested tree by scanning for boundary events:

```
for each event in order:
  if event is agent_start:     push new AgentRun group
  if event is agent_end:       close AgentRun group
  if event is turn_start:      push new Turn group inside current AgentRun
  if event is turn_end:        close Turn group
  if event is tool_execution_start:  push new ToolExec group inside current Turn
  if event is tool_execution_end:    close ToolExec group
  else:                        append to innermost open group
```

Ungrouped events (session_directory, session_start, model_select, etc.)
appear at the session level, outside any agent run.

---

## Changes to Existing Code

### New server routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sessions` | Session list page (HTML) |
| `GET` | `/sessions/:id` | Session detail page with nested timeline (HTML) |
| `GET` | `/api/sessions/list` | JSON: sessions with stats (count, first/last ts, categories) |
| `GET` | `/api/sessions/:id/events` | JSON: all events for one session, ordered by seq |

### New files

| File | Purpose |
|------|---------|
| `pages/sessions.ts` | Session list page template |
| `pages/session-detail.ts` | Session detail page template (timeline layout) |
| `static/session.js` | Client JS for nested grouping + collapse/expand |
| `lib/db.ts` | Add `getSessionList()` and `getSessionEvents()` queries |

### Modified files

| File | Change |
|------|--------|
| `server.ts` | Add 4 new routes |
| `pages/index.ts` | Add "Sessions" nav link in header |
| `static/style.css` | Add styles for session cards, nested timeline, group headers |

---

## Implementation Tasklist

### Phase A: Server + Data
- [x] A1. `lib/db.ts` — add `getSessionList()`: returns sessions with event count, first/last ts, category breakdown
- [x] A2. `lib/db.ts` — add `getSessionEvents(sessionId)`: returns all events for one session, ordered by seq ASC
- [x] A3. `server.ts` — add routes: `GET /sessions`, `GET /sessions/:id`, `GET /api/sessions/list`, `GET /api/sessions/:id/events`

### Phase B: Session List Page
- [x] B1. `pages/sessions.ts` — session list template: card per session with name, count, duration, category badges, last event
- [x] B2. `static/style.css` — session list styles (session cards, category mini-badges)

### Phase C: Session Detail Page
- [x] C1. `pages/session-detail.ts` — session timeline template: flat event list as HTML, with `data-` attributes for grouping
- [x] C2. `static/session.js` — client-side nested grouping: scan events, create collapsible Agent Run / Turn / Tool Exec groups
- [x] C3. `static/style.css` — nested timeline styles (indent levels, group headers, collapse/expand, connector lines)

### Phase D: Navigation
- [x] D1. `pages/index.ts` — add "Sessions" link in header nav
- [x] D2. `pages/event-detail.ts` — add "Session" link to navigate to that event's session view
- [ ] D3. `static/stream.js` — make session_id in cards clickable → `/sessions/:id` (deferred — requires card template change)

### Phase E: Test
- [x] E1. Verify `/sessions` shows all sessions with correct stats
- [x] E2. Verify `/sessions/:id` shows all events in correct order
- [x] E3. Verify client-side grouping creates correct nesting (Agent Run → Turn → Tool) — data attrs verified, JS logic verified
- [x] E4. Verify collapse/expand works — Expand All / Collapse All buttons wired
- [x] E5. Verify navigation between views (stream ↔ sessions ↔ session detail ↔ event detail) — all links verified
- [x] E6. Git commit `cb3936c`
