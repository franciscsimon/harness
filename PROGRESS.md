# History-Aware Harness — Implementation Progress

**Created:** 2026-03-17 | **Updated:** 2026-03-19

---

## Phases 1-5: Core History System ✅ COMPLETE

All 14 items delivered: bug fixes, delegation lineage, sunk-cost detection, session postmortems, artifact tracking, enriched decisions, pre-task history retrieval, retry prevention, artifacts UI.

---

## Phase 6: Project Lifecycle Management

**Spec:** `docs/PROJECT_LIFECYCLE_V2.md` (v2.1, 1390 lines, 17 sections)
**Design docs:** `docs/PROJECT_LIFECYCLE_PROPOSAL.md`, `docs/LIFECYCLE_REVIEW_CONSOLIDATED.md`

### Phase 6.0: Foundation ✅ COMPLETE
- [x] `lib/jsonld/context.ts` — shared namespaces, context, helpers
- [x] `lib/jsonld/ids.ts` — ID generation functions
- [x] `lib/db.ts` — shared XTDB connection factory
- [x] Migrate existing extensions to shared libs (5 of 8 done — see §Remaining below)
- [x] `docs/CONVENTIONS.md`

### Phase 6.1: Project Lifecycle Core ✅ COMPLETE
- [x] Extend `project-registry` with `lifecycle_phase`, `config_json`
- [x] `project-lifecycle` extension: `/project status`, `/project phase`, `/project config`
- [x] `project_dependencies` table + `/project deps` command
- [x] `project_tags` table + `/project tag` command
- [x] Backfill migration task (`scripts/backfill-lifecycle-phase.ts` — ran on 1 project)
- [x] `lifecycle_events` table + notification helper

### Phase 6.2: Workflow Persistence ✅ COMPLETE
- [x] XTDB connection in `workflow-engine`
- [x] `workflow_runs` + `workflow_step_runs` tables
- [x] Persist workflow start/step/complete to XTDB
- [x] 7 workflow templates deployed to `~/.pi/agent/workflows/`
  - feature, bugfix, refactor, release, onboarding, incident-response, decommission

### Phase 6.3: Requirements & Test Evidence ✅ COMPLETE
- [x] `requirements-tracker` extension
- [x] `requirements` + `requirement_links` tables
- [x] `test_runs` table (via CI webhook)
- [x] Commands: `/req add`, `/req list`, `/req status`, `/req link`, `/req coverage`, `/req import`
- [x] Auto-link: decisions → requirements matching

### Phase 6.4: Releases & Deployments ✅ COMPLETE
- [x] `deployment-tracker` extension
- [x] `environments`, `releases`, `deployments` tables
- [x] Commands: `/env add`, `/env list`, `/release create`, `/release changelog`, `/deploy`, `/deploy history`
- [x] CI webhook endpoint: `POST /api/ci/events` (CDEvents-inspired)
- [x] Webhook HMAC verification (optional for dev)
- [x] Auto-changelog from decisions + artifacts since last release

### Phase 6.5: Operations & Incidents ✅ MOSTLY COMPLETE
- [x] `backup_records` persistence in ops API
- [x] Backup scheduler with cron + retention
- [x] Backup verification (restore to temp, sanity query, destroy)
- [x] `incidents` table + ops API CRUD (`POST/GET/PATCH /api/incidents`)
- [ ] ~~API key auth middleware~~ → **DEFERRED** for Keycloak OIDC

### Phase 6.6: Portfolio Dashboard & Decommissioning — PARTIAL
- [ ] Portfolio page in dashboard UI ← **UNBLOCKED** (Hono JSX + htmx exists now)
- [x] Lifecycle SSE stream (`GET /api/lifecycle/stream`)
- [ ] Per-project detail pages (requirements, releases, deployments, tests, incidents, workflows)
- [x] `/project decommission` command + `decommission_records` table
- [x] Decommission workflow template
- [x] Retention task: `task xtdb:retain`

### Dashboard UI ✅ COMPLETE (infrastructure)
- [x] Hono JSX + htmx framework on `:3335`
- [x] Keycloak OIDC auth integration
- [x] Project lifecycle sections on project detail page

---

## Remaining Work

### Must Do — Gaps & Missing Pieces

| # | Task | Effort | Status |
|---|------|--------|--------|
| ~~R1~~ | ~~Shared lib migrations~~ | ~~S~~ | ✅ Done — all 3 files now import from shared lib |
| ~~R2~~ | ~~Portfolio dashboard page~~ | ~~M~~ | ✅ Already existed — `/dashboard` route with project cards, stats, SSE |
| ~~R3~~ | ~~Per-project detail pages~~ | ~~L~~ | ✅ Already existed — `/dashboard/project/:id` with requirements, releases, deployments, tests, incidents |
| R4 | API auth for mutation endpoints | M | **DEFERRED** — internal-only for now, will revisit with Keycloak |

### Should Do — Quality & Reliability

| # | Task | Effort | Status |
|---|------|--------|--------|
| ~~Q1~~ | ~~Tests for new extensions~~ | ~~L~~ | ✅ Done — `test/lifecycle.ts` covers: shared libs, extensions, workflows, CI webhook, incidents CRUD, scheduler, dashboard UI, table existence, project schema |
| Q2 | Integration test: CI webhook → XTDB → lifecycle_events → SSE | M | End-to-end pipeline untested |
| Q3 | Data validation / migration verification | S | Verify all XTDB tables created, JSON-LD well-formed, provenance graph links resolve |
| Q4 | Monitoring for lifecycle subsystems | M | No health checks for scheduler, webhook delivery failures, backup success rate |

### Could Do — Future Enhancements

| # | Task | Effort | Status |
|---|------|--------|--------|
| F1 | Cross-project intelligence | L | "Which patterns work?", "Which decisions recur?" — from original gap analysis |
| F2 | Vocabulary migration to PROV-O/Schema.org | M | Spec §3 defines 20+ predicate remappings, not yet applied to existing code |
| F3 | Full provenance export as `prov:Bundle` | M | Spec mentions this but no implementation |

---

## Effort Key
- **S** = Small (< 1 hour, single file)
- **M** = Medium (1-3 hours, multiple files)
- **L** = Large (3+ hours, cross-cutting)

## Key Files
- Spec: `docs/PROJECT_LIFECYCLE_V2.md`
- Conventions: `docs/CONVENTIONS.md`
- Shared libs: `lib/jsonld/context.ts`, `lib/jsonld/ids.ts`, `lib/db.ts`
- Extensions: `project-lifecycle/`, `requirements-tracker/`, `deployment-tracker/`
- Ops API: `xtdb-ops-api/lib/` (ci-webhook, backup, scheduler, verify-backup, incidents)
- Workflows: `~/.pi/agent/workflows/*.jsonld` (7 templates)
