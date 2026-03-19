# Project Lifecycle Management — Progress & Remaining Work

> Last updated: 2026-03-19
> Spec: `docs/PROJECT_LIFECYCLE_V2.md`
> Commit: `9214b0f` — feat: Project Lifecycle Management system (Phase 6)

---

## ✅ Completed

- **Phase 0**: Shared libs (`lib/jsonld/context.ts`, `lib/jsonld/ids.ts`, `lib/db.ts`), 5 extensions migrated
- **Phase 1** (partial): `lifecycle_phase` + `config_json` on projects, `project-lifecycle` extension, `lifecycle_events` table, backfill script
- **Phase 2**: Workflow persistence — `workflow_runs` + `workflow_step_runs` tables in XTDB
- **Phase 3** (partial): `requirements-tracker` extension, `requirements` + `requirement_links` tables, `/req add|list|status|link`
- **Phase 4** (partial): `deployment-tracker` extension, `environments` + `releases` + `deployments` tables, CI webhook receiver (`POST /api/ci/events`)

---

## Remaining Work

### 1. Gaps from Earlier Phases

| # | Task | Phase | Effort | Notes |
|---|------|-------|--------|-------|
| G1 | `project_dependencies` table + `/project deps` command | 1 | S | Track npm/pip/etc deps per project, detect stale |
| G2 | `project_tags` table + `/project tag` command | 1 | S | Categorize projects (lang, team, domain) |
| G3 | `docs/CONVENTIONS.md` | 0 | S | Document ID format, JSON-LD patterns, DB conventions |
| G4 | `/req coverage` command | 3 | M | Show % of requirements that are implemented+verified |
| G5 | `/req import` command | 3 | M | Import requirements from markdown/github issues |
| G6 | Auto-link: decision → requirement matching | 3 | M | When a decision is logged, check if it satisfies an active requirement |
| G7 | Auto-changelog for releases | 4 | M | Aggregate decisions + artifacts since last release into changelog |
| G8 | Workflow templates (feature.jsonld, bugfix.jsonld + 5 more) | 2 | M | Need at least: feature, bugfix, refactor, release, onboarding, incident-response, decommission |
| G9 | Remaining shared lib migrations | 0 | S | `xtdb-event-logger/rdf/namespaces.ts`, `artifact-tracker/versioning.ts` still have local JSONLD_CONTEXT |

### 2. Phase 5: Operations & Incidents

| # | Task | Effort | Notes |
|---|------|--------|-------|
| O1 | Backup records persistence | S | Write `backup_records` row to XTDB when `task xtdb:backup` completes (archive path, size, table count, duration) |
| O2 | Backup scheduler | M | Cron-based (node-cron or Taskfile schedule), configurable interval, retention count |
| O3 | Backup verification | L | Restore to temp XTDB instance, run sanity queries (row counts match), destroy. Requires spinning up temp postgres container |
| O4 | `incidents` table + CRUD API | M | `POST/GET/PATCH /api/incidents` in ops API, fields: project_id, severity, title, description, status, started_ts, resolved_ts |
| O5 | API key auth middleware | S | Simple `X-API-Key` header check on ops API mutation endpoints (POST/PUT/DELETE), key from env var |

### 3. Phase 6: Portfolio Dashboard & Decommissioning

| # | Task | Effort | Notes |
|---|------|--------|-------|
| D1 | Portfolio page in dashboard UI | L | All projects at a glance — name, phase, last activity, health indicators. Route: `/projects` on :3333 |
| D2 | Lifecycle SSE stream | M | `GET /api/lifecycle/stream` — real-time event feed from `lifecycle_events` table, push to dashboard |
| D3 | Per-project detail pages | L | Routes: `/projects/:id/requirements`, `/releases`, `/deployments`, `/tests`, `/incidents`, `/workflows` |
| D4 | `decommission_records` table + `/project decommission` command | M | Record decommission decision, checklist (archive data, notify, remove CI, etc.) |
| D5 | Decommission workflow template | S | JSON-LD workflow: archive → notify → remove-ci → final-backup → mark-decommissioned |
| D6 | Retention task: `task xtdb:retain` | M | Delete records older than retention policy (per entity type, configurable) |
| D7 | Remaining workflow templates (5 more) | M | refactor, release, onboarding, incident-response, decommission |

---

## Effort Key
- **S** = Small (< 1 hour, single file/command)
- **M** = Medium (1-3 hours, multiple files)
- **L** = Large (3+ hours, cross-cutting, UI work)

## Dependency Notes
- D2 (SSE stream) is prerequisite for D1 (portfolio page) to be real-time
- O1 (backup records) should come before O2 (scheduler) and O3 (verification)
- G8 (workflow templates) is prerequisite for D5 (decommission workflow)
- ~~O5 (API key auth)~~ → **DEFERRED** — Keycloak integration coming, will handle auth properly

---

## Execution Order

### Round 1: Gaps (G1–G9)
1. G1 — `project_dependencies` table + `/project deps` command (S)
2. G2 — `project_tags` table + `/project tag` command (S)
3. G3 — `docs/CONVENTIONS.md` (S)
4. G9 — Remaining shared lib migrations (S)
5. G4 — `/req coverage` command (M)
6. G5 — `/req import` command (M)
7. G6 — Auto-link: decision → requirement matching (M)
8. G7 — Auto-changelog for releases (M)
9. G8 — Workflow templates × 7 (M)

### Round 2: Phase 5 — Operations & Incidents
10. O1 — Backup records persistence (S)
11. O2 — Backup scheduler (M)
12. O3 — Backup verification (L)
13. O4 — `incidents` table + CRUD API (M)

### Round 3: Phase 6 — Portfolio Dashboard & Decommissioning
14. D2 — Lifecycle SSE stream (M)
15. D1 — Portfolio page in dashboard UI (L)
16. D3 — Per-project detail pages (L)
17. D4 — `decommission_records` table + `/project decommission` (M)
18. D5 — Decommission workflow template (S)
19. D6 — Retention task: `task xtdb:retain` (M)
20. D7 — Remaining workflow templates (M)
