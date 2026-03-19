# History-Aware Harness — Implementation Progress

**Created:** 2026-03-17 | **Updated:** 2026-03-19

---

## Phases 1-5: Core History System ✅ COMPLETE

All 14 items delivered: bug fixes, delegation lineage, sunk-cost detection, session postmortems, artifact tracking, enriched decisions, pre-task history retrieval, retry prevention, artifacts UI.

---

## Phase 6: Project Lifecycle Management

**Spec:** `docs/PROJECT_LIFECYCLE_V2.md` (v2.1, 1390 lines, 17 sections)
**Design docs:** `docs/PROJECT_LIFECYCLE_PROPOSAL.md`, `docs/LIFECYCLE_REVIEW_CONSOLIDATED.md`

### Phase 6.0: Foundation
- [ ] `lib/jsonld/context.ts` — shared namespaces, context, helpers
- [ ] `lib/jsonld/ids.ts` — ID generation functions  
- [ ] `lib/db.ts` — shared XTDB connection factory
- [ ] Migrate existing extensions to shared libs
- [ ] `docs/CONVENTIONS.md`

### Phase 6.1: Project Lifecycle Core
- [ ] Extend `project-registry` with `lifecycle_phase`, `config_json`
- [ ] `project-lifecycle` extension: `/project status`, `/project config`
- [ ] `project_dependencies` + `project_tags` tables
- [ ] Backfill migration task
- [ ] `lifecycle_events` table + notification helper

### Phase 6.2: Workflow Persistence
- [ ] XTDB connection in `workflow-engine`
- [ ] `workflow_runs` + `workflow_step_runs` tables
- [ ] Persist workflow start/step/complete
- [ ] Workflow templates (`feature.jsonld`, `bugfix.jsonld`)

### Phase 6.3: Requirements & Test Evidence
- [ ] `requirements-tracker` extension
- [ ] `requirements` + `requirement_links` tables
- [ ] `test_runs` table
- [ ] Commands: `/req add`, `/req list`, `/req link`, `/req coverage`

### Phase 6.4: Releases & Deployments
- [ ] `deployment-tracker` extension
- [ ] `environments`, `releases`, `deployments` tables
- [ ] CI webhook endpoint: `POST /api/ci/events`
- [ ] Webhook HMAC verification
- [ ] Auto-changelog from decisions + artifacts

### Phase 6.5: Operations & Incidents
- [ ] `backup_records` persistence in ops API
- [ ] Backup scheduler + retention policy
- [ ] `incidents` table + ops API CRUD
- [ ] API key auth middleware

### Phase 6.6: Portfolio Dashboard & Decommissioning
- [ ] Portfolio page in dashboard
- [ ] Lifecycle SSE stream
- [ ] Per-project pages: requirements, releases, deployments, tests, incidents
- [ ] `decommission_records` table
- [ ] Retention task: `task xtdb:retain`
