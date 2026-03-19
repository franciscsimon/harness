# UI Unification Proposal — v2

> Date: 2026-03-19 | Status: Proposal (revised)
> Change from v1: Keep all backends, create a 4th UI-only service

## Problem

3 separate UIs on 3 ports, each with its own styling, navigation, and layout:

| Port | Service | UI Pages | Backend APIs | Lines |
|------|---------|----------|-------------|-------|
| :3333 | xtdb-event-logger-ui | 15+ pages (sessions, events, dashboard, decisions, artifacts, projects, ops, flow, knowledge) | Session/event queries, SSE stream | ~5,200 |
| :3334 | web-chat | 1 page (chat) | WebSocket to pi agent | ~1,200 |
| :3335 | xtdb-ops-api | 3 pages (portfolio, project detail) | Backups, incidents, CI webhook, scheduler, health, lifecycle | ~2,000 |

**Pain points:** 3 URLs, 3 CSS files, no shared nav, no way to go from sessions → portfolio → chat without switching ports.

## Approach: New UI-only Frontend (:3336)

A 4th service that is **pure UI** — zero direct DB access, zero business logic. It calls the 3 backends via `fetch()` for all data. The 3 backends enable CORS so the frontend can reach them.

```
┌─────────────────────────────────────────────────────────┐
│                  :3336 — Unified UI                      │
│  Hono server-side rendering + htmx                      │
│  Static assets (CSS, JS)                                │
│  Shared layout, nav, theme                              │
│  All pages from :3333, :3334, :3335 merged here         │
│                                                          │
│  Only serves HTML — all data comes from backends via:    │
│  fetch(:3333/api/*), fetch(:3335/api/*), ws(:3334/ws)   │
└──────────┬──────────────┬──────────────┬────────────────┘
           │              │              │
     ┌─────┴─────┐  ┌────┴────┐  ┌─────┴──────┐
     │ :3333     │  │ :3334   │  │ :3335      │
     │ Event API │  │ Chat WS │  │ Ops API    │
     │ (CORS)    │  │ (CORS)  │  │ (CORS)     │
     └───────────┘  └─────────┘  └────────────┘
```

### What Each Backend Becomes

**:3333 (xtdb-event-logger-ui) → Event API**
- Strip all `app.get("/<page>")` HTML routes
- Keep all `app.get("/api/*")` JSON endpoints + SSE stream
- Add `cors({ origin: "*" })` (already present? verify)
- Becomes: headless API for sessions, events, decisions, artifacts, knowledge, dashboard stats

**:3334 (web-chat) → Chat WebSocket**
- Strip HTML page route (`GET /`)
- Keep WebSocket upgrade handler (`GET /ws`)
- Add CORS headers for WebSocket handshake
- Becomes: headless WebSocket relay to pi agent

**:3335 (xtdb-ops-api) → Ops API**
- Strip `/dashboard*` routes + views/ directory
- Keep all `/api/*` routes (already has CORS)
- Becomes: headless API for health, backups, incidents, CI webhook, lifecycle, scheduler

### What the Unified UI Serves

**:3336 (harness-ui) — new**

All rendering moves here. Server-side pages fetch from the backends, then return HTML.

```
/                      → Home/landing (overview stats from all 3 backends)
/sessions              → Session list           (← :3333/api/sessions)
/sessions/:id          → Session detail          (← :3333/api/sessions/:id/events)
/sessions/:id/flow     → Session flow viz        (← :3333/api/sessions/:id/events)
/sessions/:id/knowledge → Knowledge extraction   (← :3333/api/sessions/:id/knowledge)
/dashboard             → Session health dashboard (← :3333/api/dashboard)
/decisions             → Decision log browser     (← :3333/api/decisions)
/artifacts             → Artifact tracker         (← :3333/api/artifacts)
/artifacts/versions    → Artifact versions        (← :3333/api/artifacts)
/artifacts/content/:id → Artifact content viewer  (← :3333/api/artifacts)
/projects              → Portfolio + project list  (← :3335/api/portfolio + :3333/api/stats)
/projects/:id          → Unified project detail   (← :3335/api/projects/:id/* + :3333/api/*)
/chat                  → Chat interface           (← ws://:3334/ws)
/ops                   → Infrastructure status    (← :3335/api/health, /api/backups, /api/replication)
/ops/incidents         → Incidents                (← :3335/api/incidents)
/ops/scheduler         → Backup scheduler         (← :3335/api/scheduler/*)
/event/:id             → Event detail             (← :3333/api/events/:id)
```

## Backend CORS Changes

Each backend needs one line:

```typescript
// Already in most — verify and add where missing
app.use("/*", cors({ origin: "*" }));
```

For WebSocket (:3334), the upgrade handler needs to accept cross-origin connections.

## API Gaps — What's Missing

Some :3333 pages render by querying XTDB directly in the page handler (not via an API endpoint). These need new API endpoints before the UI can move:

| Page | Current Data Source | Needed API |
|------|-------------------|------------|
| `/projects` | Direct SQL in page handler | `GET /api/projects` (list all with stats) |
| `/projects/:id` | Direct SQL in page handler | `GET /api/projects/:id` (detail + session counts) |
| `/ops` | Inline HTML with links | `GET /api/ops/status` (combined health view) |
| `/dashboard` | Already has `/api/dashboard` ✅ | — |
| `/sessions` | Already has `/api/sessions` ✅ | — |
| `/decisions` | Already has `/api/decisions` ✅ | — |
| `/artifacts` | Already has `/api/artifacts` ✅ | — |

**:3335 API gaps:**

| Page | Needed API |
|------|------------|
| Portfolio page | `GET /api/portfolio` (projects + stats + incident count) |
| Project detail lifecycle | `GET /api/projects/:id/requirements`, `/releases`, `/deployments`, `/tests`, `/incidents` |

## Unified Project Page

The key merge — `/projects/:id` — combines data from both backends:

```
┌─────────────────────────────────────────────────┐
│ Project: harness                    [active] ●   │
│ Tags: typescript, infrastructure                 │
├─────────────────────────────────────────────────┤
│ [Sessions] [Requirements] [Releases]             │
│ [Deployments] [Tests] [Incidents] [Decisions]    │
├─────────────────────────────────────────────────┤
│                                                   │
│  Tab content loaded via htmx from the correct     │
│  backend API                                      │
│                                                   │
└─────────────────────────────────────────────────┘
```

Each tab fetches from the right backend:
- Sessions → `:3333/api/sessions?project=:id`
- Requirements → `:3335/api/projects/:id/requirements`
- Releases → `:3335/api/projects/:id/releases`
- Decisions → `:3333/api/decisions?project=:id`
- etc.

htmx makes this trivial — each tab is a `hx-get` pointing at a different backend URL.

## Tech Stack for :3336

Same as existing: **Hono + server-side template strings + htmx + SSE**

- No build step, no bundler, no React/Vue/Svelte
- Server-side rendering: pages fetch from backends, produce HTML
- htmx for dynamic tab loading, SSE for live events
- One consolidated CSS file (adopt :3335 dark theme — it's the cleanest)
- WebSocket proxy for chat (or direct client-side WS to :3334)

## Implementation Phases

### Phase 1: Scaffold + Shared Layout
- Create `harness-ui/` directory with Hono server on :3336
- Shared layout: nav bar, dark theme CSS, htmx + SSE scripts
- Home page with stats aggregated from all 3 backends
- **Nav:** Home | Dashboard | Sessions | Projects | Decisions | Artifacts | Chat | Ops

### Phase 2: Migrate Session Pages (from :3333)
- Port all session/event pages — they already have API endpoints
- `/sessions`, `/sessions/:id`, `/sessions/:id/flow`, `/sessions/:id/knowledge`
- `/dashboard` (session health)
- `/event/:id`
- SSE stream connection to `:3333/api/events/stream`

### Phase 3: Migrate Lifecycle + Ops Pages (from :3335)
- `/projects` — merged portfolio view
- `/projects/:id` — tabbed detail (sessions from :3333, lifecycle from :3335)
- `/ops` — health, backups, replication, topics
- `/ops/incidents` — incidents CRUD
- `/ops/scheduler` — backup scheduler
- Add missing API endpoints to :3335 where needed

### Phase 4: Migrate Chat (from :3334)
- `/chat` — WebSocket chat interface
- Client-side JS connects directly to `ws://localhost:3334/ws`
- Or proxy WebSocket through :3336 (more seamless)

### Phase 5: Migrate Remaining Pages
- `/decisions` — decision log browser
- `/artifacts`, `/artifacts/versions`, `/artifacts/content/:id`
- Add missing API endpoints to :3333 where needed

### Phase 6: Strip UI from Backends
- Remove HTML routes from :3333 (keep only `/api/*` + SSE)
- Remove `/dashboard*` routes + views/ from :3335
- Remove HTML route from :3334 (keep only `/ws`)
- All 3 become headless

## What NOT To Change

- Backend port numbers (:3333, :3334, :3335) stay the same
- Backend API contracts stay the same
- XTDB queries stay in their current backends
- Keycloak auth stays on :3335 API
- No new database connections from the UI server

## Effort Estimate

| Phase | Effort | Description |
|-------|--------|-------------|
| 1 | M (2-3h) | Scaffold, layout, nav, CSS, home page |
| 2 | L (4-6h) | Port 7 session/event pages + SSE |
| 3 | M (3-4h) | Port lifecycle + ops pages + new API endpoints |
| 4 | S (1-2h) | Port chat page + WebSocket |
| 5 | M (2-3h) | Port decisions + artifacts pages |
| 6 | S (1h) | Strip HTML from backends |
| **Total** | **~2-3 days** | |

## Directory Structure

```
harness-ui/
├── server.ts           # Hono app on :3336
├── package.json
├── lib/
│   ├── api.ts          # fetch() wrappers for all 3 backends
│   └── format.ts       # shared formatting (timestamps, badges, etc.)
├── pages/
│   ├── home.ts
│   ├── dashboard.ts
│   ├── sessions.ts
│   ├── session-detail.ts
│   ├── session-flow.ts
│   ├── session-knowledge.ts
│   ├── projects.ts
│   ├── project-detail.ts
│   ├── decisions.ts
│   ├── artifacts.ts
│   ├── chat.ts
│   ├── ops.ts
│   ├── ops-incidents.ts
│   └── event-detail.ts
├── components/
│   ├── layout.ts       # shared layout + nav
│   ├── nav.ts          # navigation bar
│   ├── table.ts        # reusable table component
│   └── badge.ts        # status badges
└── static/
    ├── style.css       # unified dark theme
    ├── htmx.min.js     # local copy (no CDN dependency)
    └── chat.js         # WebSocket client for chat
```

---

# Architectural Review — 2026-03-19

> Reviewer: Architect agent
> Scope: Full review of all 3 server.ts files, page renderers, views, static assets, and API surface

## 1. Architecture Diagram — Actual Data Flow

The proposal's diagram is correct at the box level but hides critical complexity in the arrows. Here's the real picture:

```
Browser (single tab)
│
├── HTML pages ─────────────────▶ :3336 (harness-ui)
│                                   │
│                                   ├── SSR fetch ──▶ :3333/api/*  (JSON)
│                                   ├── SSR fetch ──▶ :3335/api/*  (JSON)
│                                   └── serves HTML + static assets
│
├── SSE (EventSource) ─────────▶ :3333/api/events/stream  (direct)
├── SSE (EventSource) ─────────▶ :3335/api/lifecycle/stream (direct)
├── SSE (EventSource) ─────────▶ :3335/api/backup/status/:id (direct)
│
├── WebSocket ─────────────────▶ :3334/ws  (direct)
│
└── htmx fetch (client-side) ──▶ :3333/api/*  (CORS)
                               ──▶ :3335/api/*  (CORS)
```

**Key insight:** The browser talks to 4 origins. :3336 does SSR for initial page loads, but live data (SSE, WebSocket, htmx dynamic tabs) goes directly from browser to backends. This is the correct design — :3336 should NOT proxy streams.

## 2. Architecture Risks

### Risk 1: SSE Cannot Be Server-Proxied Efficiently
**Severity: HIGH**

Three SSE endpoints exist:
- `:3333/api/events/stream` — continuous event stream (poll-based, 500ms)
- `:3335/api/lifecycle/stream` — lifecycle events (poll-based, 2s)
- `:3335/api/backup/status/:jobId` — backup progress (poll-based, 500ms)

If :3336 proxies these, it holds open one HTTP connection per client per stream. With even 5 browser tabs, that's 15 connections on :3336, each with its own poll loop. The only viable approach: **browser connects to backend SSE endpoints directly via CORS**. This means `EventSource("http://localhost:3333/api/events/stream")` in client JS.

**Implication:** :3333 needs `Access-Control-Allow-Origin: *` on SSE routes (currently only on `/api/*` — verify SSE is under that prefix ✅ it is).

### Risk 2: The Ops Page (:3333) Already Fetches From :3335 Client-Side
**Severity: LOW — actually validates the approach**

The `:3333/ops` page is already a "frontend-only" page. It serves static HTML, then `ops.js` fetches from `http://localhost:3335/api/*` directly. This proves the cross-origin fetch pattern works. The entire ops page can move to :3336 almost unchanged — just update the HTML shell.

### Risk 3: Rendering Tech Mismatch
**Severity: MEDIUM**

The proposal says "same tech" but the 3 backends use different rendering:
- `:3333` — template string literals (`` `<div>${var}</div>` ``)
- `:3334` — template string literals
- `:3335` — Hono JSX (`` html`<div>${var}</div>` `` via `hono/html`) + `.tsx` files

For :3336, pick ONE approach. **Recommendation: template strings** (not JSX). Reasons:
1. 80% of the existing code uses template strings (~6400 lines vs ~300 lines JSX)
2. Template strings have zero import overhead
3. The :3335 JSX views are small (portfolio.tsx ~70 lines, project.tsx ~80 lines, layout.tsx ~60 lines) — trivial to convert
4. Template strings align with the "no build step" philosophy

### Risk 4: Auth Forwarding Not Addressed
**Severity: MEDIUM (currently deferred, but design must account for it)**

`:3335` has `authMiddleware()` applied globally. When :3336 does SSR fetches to `:3335/api/*`, it needs to forward auth credentials. When the browser makes direct htmx/SSE requests to `:3335`, the browser needs to include credentials.

**Design requirement:** :3336's `lib/api.ts` must accept and forward auth headers. htmx requests need `hx-headers` or `withCredentials`. Plan for this even though Keycloak is deferred.

### Risk 5: Backend Down = Partial Page Failure
**Severity: MEDIUM**

The home page aggregates from all 3 backends. If :3335 is down, the page shouldn't fail entirely. Every SSR fetch in :3336 needs `try/catch` with graceful degradation (show "Service unavailable" in that section, not a 500 for the whole page).

This is a new concern that didn't exist when each page talked to its own backend.

### Risk 6: Duplicate Data — Projects Exist in Both :3333 and :3335
**Severity: HIGH — core design challenge**

Both backends have project data:
- `:3333` — `projects` table with sessions, decisions, artifacts, lifecycle events, dependencies, tags, decommissions
- `:3335` — `projects` table with requirements, releases, deployments, test_runs, incidents (queries same XTDB `projects` table)

They're actually querying the **same XTDB database** on port 5433. The "two backends" illusion is just two Hono servers talking to the same Postgres. This means:
1. No data consistency risk (single source of truth)
2. The unified project page genuinely needs data from both servers (session/event data from :3333's queries, lifecycle/ops data from :3335's queries)
3. If we ever wanted to merge the queries, we could — but that violates the "backends stay separate" principle

## 3. Complete Missing API Inventory

### :3333 — Missing APIs (needed before UI migration)

| Needed Endpoint | Current Source | Used By Page | Complexity |
|----------------|---------------|-------------|-----------|
| `GET /api/projects` | `getProjects()` direct DB | `/projects` list | S — wrap existing query |
| `GET /api/projects/:id` | `getProject(id)` direct DB | `/projects/:id` detail | S — wrap existing query |
| `GET /api/projects/:id/sessions` | `getProjectSessions(id)` direct DB | `/projects/:id` sessions tab | S — wrap existing query |
| `GET /api/projects/:id/decisions` | `getProjectDecisions(id)` direct DB | `/projects/:id` decisions tab | S — already partially exists via `?project_id=` |
| `GET /api/projects/:id/lifecycle-events` | `getProjectLifecycleEvents(id)` direct DB | `/projects/:id` lifecycle section | S — wrap existing query |
| `GET /api/projects/:id/dependencies` | `getProjectDependencies(id)` direct DB | `/projects/:id` deps section | S — wrap existing query |
| `GET /api/projects/:id/tags` | `getProjectTags(id)` direct DB | `/projects/:id` tags section | S — wrap existing query |
| `GET /api/projects/:id/decommissions` | `getProjectDecommissions(id)` direct DB | `/projects/:id` decomm section | S — wrap existing query |
| `GET /api/sessions/:id/flow` | `getProjections(id)` direct DB | `/sessions/:id/flow` page | S — wrap existing query |

**Total: 9 new endpoints on :3333, all trivial wrappers around existing `lib/db.ts` functions.**

### :3335 — Missing APIs (needed before UI migration)

| Needed Endpoint | Current Source | Used By Page | Complexity |
|----------------|---------------|-------------|-----------|
| `GET /api/portfolio` | Direct DB in `/dashboard` handler | Portfolio page | S — extract existing SQL |
| `GET /api/projects/:id` | Direct DB in `/dashboard/project/:id` handler | Project detail | S — extract existing SQL |
| `GET /api/projects/:id/requirements` | Direct DB in project handler | Project requirements tab | S — extract existing SQL |
| `GET /api/projects/:id/releases` | Direct DB in project handler | Project releases tab | S — extract existing SQL |
| `GET /api/projects/:id/deployments` | Direct DB in project handler | Project deployments tab | S — extract existing SQL |
| `GET /api/projects/:id/test-runs` | Direct DB in project handler | Project tests tab | S — extract existing SQL |

**Total: 6 new endpoints on :3335, all extracting inline SQL from dashboard route handlers.**

Note: `:3335/api/incidents` already exists with `?project_id=` filter — no new endpoint needed.

### :3334 — No Missing APIs

WebSocket is the API. No changes needed. The browser will connect directly to `ws://localhost:3334/ws`.

### Grand Total: 15 new API endpoints before UI migration can begin

All 15 are trivial — wrapping existing DB functions or extracting inline SQL. Estimate: 1-2 hours total.

## 4. Component Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│ :3336 harness-ui                                                    │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ server.ts│  │ lib/     │  │ pages/   │  │ components/      │   │
│  │ routes   │  │ api.ts   │  │ 14 page  │  │ layout, nav,     │   │
│  │ only     │  │ format.ts│  │ renderers│  │ table, badge     │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘   │
│                                                                     │
│  OWNS: HTML rendering, CSS, navigation, page composition           │
│  OWNS: lib/api.ts — typed fetch wrappers for all 3 backends        │
│  DOES NOT OWN: data, queries, business logic, auth decisions        │
│                                                                     │
│  Boundary contract:                                                 │
│  - All data via fetch() to backend JSON APIs                        │
│  - SSE/WS connections made by browser JS, not server                │
│  - No postgres import, no DB connection, no XTDB                    │
│  - If api.ts fetch fails → graceful degradation, not 500            │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────────┐  ┌─────────────────┐  ┌────────────────────────────┐
│ :3333 Event API          │  │ :3334 Chat WS   │  │ :3335 Ops API              │
│                          │  │                 │  │                            │
│ OWNS:                    │  │ OWNS:           │  │ OWNS:                      │
│ - Event ingestion/query  │  │ - Pi agent      │  │ - Health checks            │
│ - Session aggregation    │  │   sessions      │  │ - Backup/restore           │
│ - Decision/artifact      │  │ - WS protocol   │  │ - Replication mgmt         │
│   queries                │  │ - Session pool   │  │ - CI webhook processing    │
│ - Project registry       │  │                 │  │ - Incidents CRUD           │
│   (session-centric)      │  │ SERVES:         │  │ - Scheduler                │
│ - Dashboard stats        │  │ - /ws (upgrade)  │  │ - Lifecycle queries        │
│ - SSE event stream       │  │                 │  │ - Portfolio/project queries │
│                          │  │ NO HTML (after   │  │                            │
│ SERVES:                  │  │ migration)      │  │ SERVES:                    │
│ - /api/* (JSON)          │  │                 │  │ - /api/* (JSON)            │
│ - /api/events/stream     │  └─────────────────┘  │ - /api/lifecycle/stream    │
│   (SSE)                  │                        │ - /api/backup/status (SSE) │
│                          │                        │                            │
│ NO HTML (after migration)│                        │ NO HTML (after migration)  │
└──────────────────────────┘                        └────────────────────────────┘
```

### Interface Contracts

| Interface | Protocol | Format | Auth |
|-----------|----------|--------|------|
| :3336 → :3333 | HTTP fetch (SSR) | JSON | None (internal) |
| :3336 → :3335 | HTTP fetch (SSR) | JSON | Forward Keycloak token |
| Browser → :3333 | EventSource (SSE) | JSON events | None (internal) |
| Browser → :3334 | WebSocket | JSON messages | None (internal) |
| Browser → :3335 | EventSource (SSE) | JSON events | Keycloak token |
| Browser → :3333 | htmx fetch (CORS) | JSON | None (internal) |
| Browser → :3335 | htmx fetch (CORS) | JSON | Keycloak token |

## 5. Static Asset Strategy

Current state — 3 separate static dirs with overlap:
- `:3333/static/` — style.css, stream.js, session.js, dashboard.js, ops.js, modal.js
- `:3334/static/` — chat.js, chat.css, **style.css (symlink to :3333's!)**
- `:3335` — no static files (CSS is inline in layout.tsx, htmx from CDN)

**Plan:**
1. `:3336/static/style.css` — merge :3333's style.css + :3335's inline CSS + :3334's chat.css into one file
2. `:3336/static/htmx.min.js` — local copy (removes CDN dependency from :3335)
3. `:3336/static/chat.js` — WebSocket client (from :3334, adapted)
4. `:3336/static/ops.js` — infrastructure page JS (from :3333, update API URLs)
5. `:3336/static/stream.js` — SSE client for event stream (from :3333)
6. Drop session.js, dashboard.js, modal.js — evaluate if they can be replaced with htmx

## 6. SSE/WebSocket Architecture Decision

**Decision: Browser-direct, not proxied.**

```
WRONG (proxy):                      RIGHT (direct):
Browser → :3336 → :3333 SSE        Browser → :3333 SSE  (CORS)
         ↑ holds connection                  ↑ no middleman
         ↑ doubles memory/sockets

Browser → :3336 → :3334 WS         Browser → :3334 WS   (CORS)
         ↑ proxy complexity                  ↑ no middleman
```

This means:
- :3336 serves HTML with `EventSource("http://localhost:3333/api/events/stream")` hardcoded (or env-configurable)
- Chat page has `new WebSocket("ws://localhost:3334/ws")` in client JS
- htmx `hx-get` attributes point directly to backend URLs: `hx-get="http://localhost:3335/api/incidents"`
- All 3 backends need CORS for browser-direct access

**CORS requirements:**
- `:3333` — already has `app.use("/api/*", cors())` ✅
- `:3334` — NO CORS currently ❌ (needs `cors()` middleware + WebSocket origin check)
- `:3335` — already has `app.use("/*", cors({ origin: "*" }))` ✅

## 7. What the Ops Page Teaches Us

The `:3333/ops` page is a **proof of concept** for the entire :3336 approach:
- It serves static HTML from :3333
- All data comes from :3335 via client-side `fetch("http://localhost:3335/api/*")`
- Health, replication, backups, topics — all fetched cross-origin
- It works today with CORS

This means Phase 3 (ops pages) is largely done — the `ops.js` and HTML just need to move from `:3333/pages/ops.ts` to `:3336/pages/ops.ts` with minimal changes.

## 8. Refined Implementation Plan

### Phase 0: API Endpoints (prerequisite — before any UI work)
**Estimate: 1-2 hours**

Add 15 missing API endpoints:
- 9 on `:3333` (all trivial wrappers around existing `lib/db.ts` functions):
  - `GET /api/projects` → `getProjects()`
  - `GET /api/projects/:id` → `getProject(id)` 
  - `GET /api/projects/:id/sessions` → `getProjectSessions(id)`
  - `GET /api/projects/:id/lifecycle-events` → `getProjectLifecycleEvents(id)`
  - `GET /api/projects/:id/dependencies` → `getProjectDependencies(id)`
  - `GET /api/projects/:id/tags` → `getProjectTags(id)`
  - `GET /api/projects/:id/decommissions` → `getProjectDecommissions(id)`
  - `GET /api/sessions/:id/projections` → `getProjections(id)` (for flow page)
  - Note: `/api/projects/:id/decisions` already exists via `GET /api/decisions?project_id=:id`
- 6 on `:3335` (extract inline SQL from dashboard handlers):
  - `GET /api/portfolio` → projects list + stats + incident count
  - `GET /api/projects/:id` → single project record
  - `GET /api/projects/:id/requirements` → requirements for project
  - `GET /api/projects/:id/releases` → releases for project
  - `GET /api/projects/:id/deployments` → deployments for project
  - `GET /api/projects/:id/test-runs` → test runs for project
- 0 on `:3334` (WebSocket is the API)

Add CORS to `:3334`:
- `app.use("/*", cors())` for HTTP routes
- WebSocket origin acceptance (already permissive by default in @hono/node-ws)

### Phase 1: Scaffold + Layout + Home
**Estimate: 2-3 hours**

- `harness-ui/` directory, `server.ts` on :3336
- `lib/api.ts` with typed fetch wrappers + timeout + error handling for all 3 backends
- `lib/format.ts` — consolidate formatting utils from :3333 and :3335
- `components/layout.ts` — shared HTML shell, nav, dark theme
- `static/style.css` — merged from all 3 sources
- Home page: overview cards aggregating stats from `:3333/api/stats` + `:3335/api/portfolio`
- Error boundary: if a backend is unreachable, show degraded section not 500

### Phase 2: Ops Pages (easiest win — already works cross-origin)
**Estimate: 1-2 hours**

- Port `/ops` page from :3333 almost verbatim (it already fetches from :3335)
- Port `ops.js` to `static/` with updated API base URL variable
- `/ops/incidents` — new page using `:3335/api/incidents`
- `/ops/scheduler` — new page using `:3335/api/scheduler/*`

### Phase 3: Session + Dashboard Pages
**Estimate: 4-5 hours**

- `/sessions` — fetch from `:3333/api/sessions/list`, render cards
- `/sessions/:id` — fetch from `:3333/api/sessions/:id/events`, render detail
- `/sessions/:id/flow` — fetch from `:3333/api/sessions/:id/projections`
- `/sessions/:id/knowledge` — fetch from `:3333/api/sessions/:id/knowledge`
- `/dashboard` — fetch from `:3333/api/dashboard`, render health grid
- `/event/:id` — fetch from `:3333/api/events/:id`
- SSE: browser connects to `:3333/api/events/stream` directly
- Port `stream.js` to static/

### Phase 4: Project Pages (the hard merge)
**Estimate: 3-4 hours**

- `/projects` — merge data from `:3333/api/projects` + `:3335/api/portfolio`
- `/projects/:id` — tabbed interface:
  - Overview tab: project info from `:3333/api/projects/:id`
  - Sessions tab: `hx-get="http://localhost:3333/api/projects/:id/sessions"`
  - Requirements tab: `hx-get="http://localhost:3335/api/projects/:id/requirements"`
  - Releases tab: `hx-get="http://localhost:3335/api/projects/:id/releases"`
  - Deployments tab: `hx-get="http://localhost:3335/api/projects/:id/deployments"`
  - Tests tab: `hx-get="http://localhost:3335/api/projects/:id/test-runs"`
  - Incidents tab: `hx-get="http://localhost:3335/api/incidents?project_id=:id"`
  - Decisions tab: `hx-get="http://localhost:3333/api/decisions?project_id=:id"`
  - Tags/deps/lifecycle: from `:3333/api/projects/:id/*`

**Design decision for htmx tabs:** Backend APIs return JSON, not HTML fragments. Options:
  - **(A)** :3336 has `/fragments/*` routes that fetch JSON from backends and return HTML — htmx hits :3336
  - **(B)** htmx hits backends directly, use `hx-swap-oob` + client-side template (more complex)
  - **(C)** Backends add `/api/html/*` routes that return HTML fragments

**Recommendation: Option A.** Keep rendering in :3336. htmx tabs hit `:3336/fragments/projects/:id/sessions` which fetches JSON from `:3333/api/projects/:id/sessions` and returns an HTML table. This keeps the "all rendering in :3336" principle clean.

### Phase 5: Decisions + Artifacts Pages
**Estimate: 2-3 hours**

- `/decisions` — fetch from `:3333/api/decisions`
- `/artifacts` — fetch from `:3333/api/artifacts` (may need enrichment endpoint for version summaries + read counts)
- `/artifacts/versions` — may need `GET /api/artifacts/versions?path=...` endpoint on :3333
- `/artifacts/content/:id` — may need `GET /api/artifacts/:id/content` endpoint on :3333

**Additional :3333 APIs for artifacts (if not already exposed):**
- `GET /api/artifacts/versions?path=` → `getArtifactVersionsByPath()`
- `GET /api/artifacts/reads?path=` → `getArtifactReadsByPath()`
- `GET /api/artifacts/version/:id` → `getArtifactVersion()`
- `GET /api/artifacts/version-summaries` → `getArtifactVersionSummaries()`
- `GET /api/artifacts/read-counts` → `getArtifactReadCounts()`

That's 5 more endpoints on :3333. **Updated total: 14 on :3333, 6 on :3335 = 20 endpoints.**

### Phase 6: Chat Page
**Estimate: 1-2 hours**

- `/chat` — serve HTML shell, client JS connects to `ws://localhost:3334/ws`
- Port `chat.js` and `chat.css` to :3336 static assets
- No server-side rendering needed — chat is entirely client-side after initial HTML

### Phase 7: Strip UI from Backends
**Estimate: 1-2 hours**

- `:3333` — remove all `app.get("/<page>")` HTML routes, remove `pages/` directory, remove `static/` JS/CSS
- `:3335` — remove `/dashboard*` routes, remove `views/` directory, remove `getDashboardDb()` 
- `:3334` — remove `app.get("/")` HTML route, remove `pages/chat.ts`, remove `static/`
- Keep all `/api/*` and SSE/WS routes

## 9. htmx Tab Rendering — Fragment Routes Pattern

The biggest design question: how do htmx tabs get HTML if backends only return JSON?

```
Browser                    :3336                         Backend
  │                          │                              │
  │ click "Sessions" tab     │                              │
  │─── hx-get="/frag/───────▶│                              │
  │    projects/X/sessions"  │── fetch :3333/api/──────────▶│
  │                          │   projects/X/sessions        │
  │                          │◀──── JSON ──────────────────│
  │                          │                              │
  │                          │ render HTML table            │
  │◀── HTML fragment ────────│                              │
  │                          │                              │
  │ swap into tab panel      │                              │
```

:3336 needs a `/frag/*` route namespace for these partial HTML responses:

```
/frag/projects/:id/sessions       → fetch :3333, render session table
/frag/projects/:id/requirements   → fetch :3335, render requirements table
/frag/projects/:id/releases       → fetch :3335, render releases table
/frag/projects/:id/deployments    → fetch :3335, render deployments table
/frag/projects/:id/test-runs      → fetch :3335, render test table
/frag/projects/:id/incidents      → fetch :3335, render incidents table
/frag/projects/:id/decisions      → fetch :3333, render decisions table
/frag/projects/:id/lifecycle      → fetch :3333, render lifecycle timeline
```

This adds ~8 fragment routes but keeps the architecture clean: all HTML generation in :3336, all data in backends.

## 10. Open Questions

1. **Environment configuration:** How does :3336 know backend URLs? Env vars (`EVENT_API=http://localhost:3333`, `CHAT_WS=ws://localhost:3334`, `OPS_API=http://localhost:3335`) with sensible defaults?

2. **The index page (event stream):** :3333's `/` is a real-time event stream viewer using SSE. This is the most complex page — it needs SSE connected AND renders events in real-time. Port last, not first.

3. **Wipe DB button:** Currently on the dashboard, calls `POST /api/wipe` on :3333. Dangerous mutation. Should it be in the unified UI at all? If yes, it belongs on an admin page, not the dashboard.

4. **Taskfile integration:** Need `task ui:dev` command for :3336. Should it start all 4 services? Or is there a `task dev` that starts all backends + UI?

5. **Project ID mismatch:** :3333 uses `_id` from XTDB (e.g., `git-remote:github.com/user/repo`). :3335 also uses `_id` but the dashboard route is `/dashboard/project/:id`. Verify both backends resolve the same project IDs identically.
