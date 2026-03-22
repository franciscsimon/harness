# Project-Scoped UI Restructuring

## Decision
Everything belongs to a project. The main nav has only: **Home**, **Projects**, **Chat**.
All other pages (sessions, stream, dashboard, decisions, artifacts, errors, CI, git, graph, ops) become project sub-pages.

## Architecture

### Top-level routes (main nav)
```
/              → Home (project list with summary cards)
/projects      → Projects list (same as home, or redirect to /)
/projects/:id  → Project overview (summary, recent activity)
/chat          → Chat (global, not project-scoped)
```

### Project sub-pages (project sub-nav)
```
/projects/:id/overview    → Project overview (default when clicking project)
/projects/:id/sessions    → Sessions for this project
/projects/:id/stream      → Live event stream for this project
/projects/:id/dashboard   → Dashboard for this project
/projects/:id/decisions   → Decisions for this project
/projects/:id/artifacts   → Artifacts for this project
/projects/:id/errors      → Errors for this project
/projects/:id/ci          → CI runs for this project
/projects/:id/git         → Git repos for this project
/projects/:id/graph       → Code graph for this project
/projects/:id/ops         → Operations for this project
```

### Detail pages (nested under project)
```
/projects/:id/sessions/:sid           → Session detail
/projects/:id/sessions/:sid/flow      → Session flow
/projects/:id/sessions/:sid/knowledge → Session knowledge
/projects/:id/ci/:runId               → CI run detail
/projects/:id/events/:eid             → Event detail
```

## Navigation
- **Main nav** (top bar): Home | Projects | Chat
- **Project sub-nav** (sidebar or tabs, shown when inside a project): Overview | Sessions | Stream | Dashboard | Decisions | Artifacts | Errors | CI | Git | Graph | Ops

## Implementation Phases

### Phase 1: Route restructuring ✅
- [x] 1.1 Create `projectLayout()` component with project sub-nav
- [x] 1.2 Update `nav.ts` — main nav has only Home, Projects, Chat
- [x] 1.3 Add project catch-all route in server.ts: `/projects/:projectId/:section`
- [x] 1.4 Route dispatcher: extract projectId + section, call existing page renderers with projectId param
- [x] 1.5 Update all page render functions to accept `projectId` parameter
- [x] 1.6 Remove old flat routes, add project sub-nav CSS, URL helpers

### Phase 2: API project scoping (~1.5h)
- [ ] 2.1 Add `?project_id=X` filter to all event-logger API endpoints
- [ ] 2.2 Add project_id filter to getCIRuns, getDecisions, getArtifacts, getErrors
- [ ] 2.3 Update harness-ui API calls to pass project_id from URL
- [ ] 2.4 Ensure session_projects table links sessions → projects correctly

### Phase 3: Home page as project list ✅
- [x] 3.1 Rewrite home page: list all projects with summary cards
- [x] 3.2 Each card shows: name, lifecycle phase, session count, last activity
- [x] 3.3 Click project card → /projects/:id/overview

### Phase 4: Cleanup (~30m)
- [ ] 4.1 Remove old flat nav items
- [ ] 4.2 Remove old flat routes (redirects → project routes)
- [ ] 4.3 Update internal links (session detail toolbar, etc.)
- [ ] 4.4 Update contract tests for new route structure

## Files to modify
- `harness-ui/components/nav.ts` — main nav (3 items only)
- `harness-ui/components/layout.ts` — support project sub-nav
- `harness-ui/server.ts` — route restructuring
- `harness-ui/pages/*.ts` — all pages accept projectId
- `harness-ui/lib/api.ts` — API calls pass project_id
- `xtdb-event-logger-ui/lib/db.ts` — add project_id filters to queries
- `xtdb-event-logger-ui/server.ts` — API accepts project_id param

## Key constraint
- Project ID in URL is the project `name` (e.g., "harness"), not the XTDB `_id`
- Need to resolve name → _id for API queries (or query by name directly)

## Status
- Phase 1 ✅ Route restructuring (nav, layout, server.ts, page signatures, CSS)
- Phase 2 ⬜ API project scoping (filter queries by project_id)
- Phase 3 ✅ Home page as project list
- Phase 4 ⬜ Cleanup (remaining internal links, contract tests)
