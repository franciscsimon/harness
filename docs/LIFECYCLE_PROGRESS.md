# Project Lifecycle Management — Progress

> Last updated: 2026-03-20
> Spec: `docs/PROJECT_LIFECYCLE_V2.md`

---

## ✅ Phase 0: Foundation (COMPLETE)

- [x] `lib/jsonld/context.ts` — shared JSON-LD context, single source of truth
- [x] `lib/jsonld/ids.ts` — shared ID builders (`piId`, `piRef`, `xsdLong`)
- [x] `lib/db.ts` — shared XTDB connection factory
- [x] `docs/CONVENTIONS.md` — documented ID format, JSON-LD patterns, DB conventions
- [x] All 13 extensions migrated to shared `lib/jsonld/context.ts` (zero local copies remain)

## ✅ Phase 1: Project Lifecycle State (COMPLETE)

- [x] `lifecycle_phase` + `config_json` columns on `projects` table
- [x] `project-lifecycle` extension (435 lines)
- [x] `/project status` — show current project info + phase
- [x] `/project phase` — set lifecycle phase (planning/active/maintenance/deprecated/decommissioned)
- [x] `/project config` — get/set project config JSON
- [x] `/project deps` — add/remove/list project dependencies → `project_dependencies` table
- [x] `/project tag` — add/remove/list project tags → `project_tags` table
- [x] `/project decommission` — decommission with confirmation → `decommission_records` table
- [x] `lifecycle_events` table for recording phase transitions
- [x] Backfill script for existing projects

## ✅ Phase 2: Workflow Persistence (COMPLETE)

- [x] `workflow_runs` + `workflow_step_runs` tables in XTDB
- [x] `workflow-engine` extension persists runs to XTDB
- [x] 7 workflow templates deployed to `~/.pi/agent/workflows/`:
  - feature.jsonld, bugfix.jsonld, refactor.jsonld, release.jsonld
  - onboarding.jsonld, incident-response.jsonld, decommission.jsonld

## ✅ Phase 3: Requirements + Test Evidence (MOSTLY COMPLETE)

- [x] `requirements` + `requirement_links` tables
- [x] `requirements-tracker` extension (476 lines)
- [x] `/req add|list|status|link|coverage|import` — all 6 subcommands
- [x] Auto-link: decision → requirement matching in `decision-log`
- [x] `test_runs` table seeded in schema
- [ ] **MISSING: Test run recording** — no extension writes to `test_runs` table yet

## ✅ Phase 4: Releases + Deployments (COMPLETE)

- [x] `environments` + `releases` + `deployments` tables
- [x] `deployment-tracker` extension (495 lines)
- [x] `/env`, `/release create`, `/deploy` commands
- [x] CI webhook receiver (`POST /api/ci/events`) in ops API

## ✅ Phase 5: Operations & Incidents (COMPLETE)

- [x] `backup_records` table + persistence on backup completion
- [x] Backup scheduler (start/stop/status API, configurable interval)
- [x] Backup verification (restore to temp, sanity queries)
- [x] `incidents` table + CRUD API (`POST/GET /api/incidents`)
- [x] Retention task (`scripts/retain.ts` + `task xtdb:retain`)

## ✅ Phase 6: Portfolio Dashboard & Decommissioning (MOSTLY COMPLETE)

- [x] Portfolio page in harness-ui `/projects` — all projects, sessions, deps, tags, lifecycle events, decommissions, JSON-LD
- [x] Lifecycle SSE stream (`GET /api/lifecycle/stream`)
- [x] `decommission_records` table + `/project decommission` command
- [x] Decommission workflow template (`decommission.jsonld`)
- [x] Retention task (`task xtdb:retain`)
- [ ] **MISSING: Auto-changelog for releases** — `/release create` accepts manual changelog but doesn't auto-generate from decisions+artifacts
- [ ] **MISSING: Per-project sub-pages** — `/projects/:id/requirements`, `/releases`, `/deployments` as separate routes

---

## Remaining Items

All items completed on 2026-03-20:

| # | Item | Status | Implementation |
|---|------|--------|----------------|
| 1 | Test run recording | ✅ | `lib/test-recorder.ts` (shared), `scripts/test-and-record.ts` (harness tests), `quality-hooks` hook (agent tests), `/api/test-runs` endpoint |
| 2 | Auto-changelog for releases | ✅ | `generateChangelog()` in `deployment-tracker/index.ts` — auto-generates from decisions+artifacts when no manual changelog provided |
| 3 | Per-project data sections | ✅ | Added Decisions, Test Runs, Incidents sections to project detail page (Option A: all on one page) |

---

## Summary

- **All Phases 0–6: 100% complete**
- Project lifecycle system fully implemented
