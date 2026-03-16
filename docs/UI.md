# UI.md — Event Stream Visualizer

> Status: **PLAN**
> Web UI to visualize pi.dev events stored in XTDB

---

## Goal

A lightweight local web UI that shows all captured pi.dev events as a live stream.
Run it locally alongside the extension — open a browser, see events flow in real time.

---

## Design Principles

| Principle | How |
|-----------|-----|
| **Zero build step** | No bundler, no compile. Single `node server.ts` to start. |
| **Tiny deps** | Hono (14KB router) + postgres (already installed). No React, no Vite. |
| **Server-rendered + SSE** | HTML served from server. Events pushed via Server-Sent Events. No SPA framework. |
| **Vanilla JS on client** | `<script>` tag, no imports, no bundling. DOM manipulation only. |
| **Self-contained** | One directory: `xtdb-event-logger-ui/`. Runs independently of the extension. |
| **XTDB direct** | Queries XTDB via same postgres wire protocol. No intermediate API layer. |

---

## Features

### V1 — Event Stream (MVP)

1. **Live event stream** — newest events at top, auto-scroll, SSE push
2. **Category color coding** — each of the 8 categories gets a distinct color
3. **Event cards** — one card per event showing:
   - Timestamp (relative: "2s ago", "1m ago")
   - Event name + category badge
   - Key fields (tool_name, message_role, model_id, etc. — only non-null)
   - Sequence number
4. **Click to expand** — full event detail:
   - All populated columns
   - JSON-LD document (syntax highlighted)
   - Raw JSON view
5. **Filter bar** — filter by:
   - Category (8 toggles)
   - Event name (dropdown / search)
   - Session ID (dropdown)
6. **Session picker** — switch between sessions in the DB
7. **Event count dashboard** — top bar showing counts per category
8. **Pause/resume** — pause the live stream to inspect events

### V2 — Analytics (future)

- Timeline chart (events over time)
- Tool call duration (execution_start → execution_end)
- Turn duration (turn_start → turn_end)
- Token usage per compaction
- Model switch history
- Bitemporal diff view (XTDB time-travel)

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| HTTP server | **Hono** + `@hono/node-server` | 14KB, fast, middleware, SSE built-in |
| Database | **postgres** (npm) | Already a dependency, same driver as extension |
| HTML | **Server-rendered templates** | String template literals in TS, no engine needed |
| CSS | **Inline `<style>`** | Single-file, no build. Modern CSS variables for theming. |
| JS (client) | **Vanilla `<script>`** | EventSource for SSE, DOM for rendering, zero deps |
| Live updates | **Server-Sent Events** | Poll XTDB every 500ms, push new events. Simpler than WebSocket. |

### Why not React/Next/Svelte?

This is a dev tool — it shows a list of cards with filters. The entire client-side
logic is ~200 lines of vanilla JS. A framework would add 100KB+ of deps and a
build step for zero benefit.

---

## File Layout

```
xtdb-event-logger-ui/
├── package.json
├── server.ts                  # Hono server — routes, SSE, XTDB queries
├── pages/
│   ├── index.ts               # Main stream page (HTML template)
│   └── event-detail.ts        # Single event detail page (HTML template)
├── static/
│   ├── style.css              # All styles (category colors, cards, layout)
│   └── stream.js              # Client JS (SSE listener, DOM rendering, filters)
└── lib/
    ├── db.ts                  # XTDB connection + query helpers
    └── format.ts              # Format event data for display (relative time, field picking)
```

**7 source files.** No build step.

---

## Architecture

```
Browser                           Server (Hono)                    XTDB
  │                                  │                               │
  │  GET /                           │                               │
  │ ─────────────────────────────► │ pages/index.ts                 │
  │ ◄───────────────── HTML ─────── │                               │
  │                                  │                               │
  │  GET /static/style.css           │                               │
  │  GET /static/stream.js           │                               │
  │ ◄──────────── static files ───── │                               │
  │                                  │                               │
  │  GET /api/events/stream (SSE)    │                               │
  │ ─────────────────────────────► │                               │
  │                                  │  Poll every 500ms:            │
  │                                  │  SELECT * FROM events         │
  │                                  │  WHERE seq > last_seen_seq    │
  │                                  │  ORDER BY seq                 │
  │                                  │ ─────────────────────────► │
  │                                  │ ◄───────────── rows ──────── │
  │ ◄─────────── SSE: event data ─── │                               │
  │                                  │                               │
  │  GET /api/events/:id             │                               │
  │ ─────────────────────────────► │  SELECT * FROM events         │
  │                                  │  WHERE _id = :id              │
  │                                  │ ─────────────────────────► │
  │ ◄──────────── JSON ──────────── │ ◄───────────── row ────────── │
```

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Main stream page (HTML) |
| `GET` | `/event/:id` | Event detail page (HTML) |
| `GET` | `/api/events/stream` | SSE endpoint — pushes new events as they arrive |
| `GET` | `/api/events` | JSON list of events (with query params for filtering) |
| `GET` | `/api/events/:id` | JSON single event (full row + JSON-LD) |
| `GET` | `/api/sessions` | JSON list of distinct session IDs |
| `GET` | `/api/stats` | JSON category counts + total |
| `GET` | `/static/*` | Static CSS + JS files |

### Query Parameters for `/api/events`

| Param | Type | Description |
|-------|------|-------------|
| `category` | string | Filter by category (comma-separated) |
| `event_name` | string | Filter by event name |
| `session_id` | string | Filter by session |
| `after_seq` | number | Events with seq > this value |
| `limit` | number | Max rows (default 100) |

---

## SSE Protocol

The `/api/events/stream` endpoint:

1. On connect: send last 50 events as initial batch
2. Then poll XTDB every 500ms for new events (seq > last sent)
3. Push each new event as an SSE message:

```
event: event
data: {"id":"uuid","eventName":"tool_call","category":"tool","seq":42,"ts":1773677453241,"toolName":"bash","toolCallId":"call-001","payload":"{\"command\":\"ls\"}"}

event: stats
data: {"total":156,"byCategory":{"session":12,"agent":30,"tool":45,...}}
```

Client-side `EventSource` receives these and prepends cards to the stream.

---

## Event Card Design

```
┌──────────────────────────────────────────────────────┐
│ ● tool_call                          [tool] #42  2s ago │
│   tool: bash  callId: call-001                         │
│   payload: {"command":"ls -la"}                        │
└──────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────┐
│ ● model_select                      [model] #15  1m ago │
│   anthropic/claude-sonnet-4-20250514 ← anthropic/haiku  │
│   source: cycle                                        │
└──────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────┐
│ ● message_update                  [message] #38  5s ago │
│   delta: text_delta  len: 847                          │
│   (sampled)                                            │
└──────────────────────────────────────────────────────┘
```

### Category Colors

| Category | Color | Hex |
|----------|-------|-----|
| session | Blue | `#3b82f6` |
| compaction | Purple | `#8b5cf6` |
| agent | Green | `#22c55e` |
| message | Cyan | `#06b6d4` |
| tool | Orange | `#f97316` |
| input | Yellow | `#eab308` |
| model | Pink | `#ec4899` |
| resource | Gray | `#6b7280` |

---

## Expanded Event Detail

Clicking a card expands it in-place (or navigates to `/event/:id`) showing:

```
┌──────────────────────────────────────────────────────────────┐
│ tool_call #42                                    [tool] 2s ago │
├──────────────────────────────────────────────────────────────┤
│ Core                                                          │
│   id:            17e9efa7-b5bb-4da2-836b-2345ae4bcc09        │
│   session:       /Users/opunix/.pi/agent/sessions/abc.jsonl  │
│   cwd:           /Users/opunix/harness                       │
│   schema_version: 1                                           │
│   environment:   pi.dev                                       │
├──────────────────────────────────────────────────────────────┤
│ Fields                                                        │
│   tool_name:     bash                                         │
│   tool_call_id:  call-001                                    │
│   payload:       {"command":"ls -la"}                        │
├──────────────────────────────────────────────────────────────┤
│ JSON-LD                                          [copy] [raw] │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ {                                                       │   │
│ │   "@context": {                                         │   │
│ │     "ev": "https://pi.dev/events/",                     │   │
│ │     ...                                                 │   │
│ │   },                                                    │   │
│ │   "@graph": [ ... ]                                     │   │
│ │ }                                                       │   │
│ └────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## Filter Bar

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 Search event name...   Session: [All ▾]   ⏸ Pause       │
│                                                              │
│ [●session] [●compaction] [●agent] [●message]                │
│ [●tool]    [●input]      [●model] [●resource]               │
└─────────────────────────────────────────────────────────────┘
```

- Category toggles are colored pills — click to include/exclude
- All ON by default
- Session dropdown populated from `/api/sessions`
- Search box does substring match on event_name
- Pause button stops SSE consumption (events still captured, shown on resume)

---

## Stats Bar

```
┌─────────────────────────────────────────────────────────────┐
│ Total: 156  │ session:12 │ agent:30 │ tool:45 │ message:38 │
│             │ input:8    │ model:3  │ compact:2 │ resource:1│
└─────────────────────────────────────────────────────────────┘
```

Updated live via SSE `stats` events.

---

## Implementation Tasklist

### Phase A: Server Foundation
- [ ] A1. `package.json` — hono, @hono/node-server, postgres deps
- [ ] A2. `lib/db.ts` — XTDB connection, query helpers (getEvents, getEvent, getSessions, getStats)
- [ ] A3. `lib/format.ts` — pick display fields per event type, relative time formatter
- [ ] A4. `server.ts` — Hono app, static serving, route wiring, SSE endpoint

### Phase B: HTML Pages
- [ ] B1. `pages/index.ts` — main page template (stream layout, filter bar, stats bar)
- [ ] B2. `pages/event-detail.ts` — single event detail page template

### Phase C: Client JavaScript
- [ ] C1. `static/stream.js` — SSE listener, card rendering, filter state, expand/collapse
- [ ] C2. `static/style.css` — full styling (cards, colors, layout, responsive, JSON-LD highlight)

### Phase D: Test & Polish
- [ ] D1. Start server, verify stream page loads with existing XTDB data
- [ ] D2. Run extension in pi, verify live events appear in browser
- [ ] D3. Test filters (category toggles, session picker, search)
- [ ] D4. Test event detail expansion + JSON-LD display
- [ ] D5. Test pause/resume
- [ ] D6. Git commit

---

## How to Run

```bash
cd xtdb-event-logger-ui
npm install
npx jiti server.ts
# → http://localhost:3333
```

Requires XTDB running on `localhost:5433` (same as the extension).

---

## Config

Reuses the same env vars as the extension:

| Env Var | Default | Description |
|---------|---------|-------------|
| `XTDB_EVENT_HOST` | `localhost` | XTDB host |
| `XTDB_EVENT_PORT` | `5433` | XTDB port |
| `UI_PORT` | `3333` | Web UI port |
| `UI_POLL_MS` | `500` | SSE poll interval (ms) |
