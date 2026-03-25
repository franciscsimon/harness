# Implementation Gaps — Wiring, UI, Operations

**Generated:** 2026-03-24
**Context:** Phases A–M scaffolding is committed (modules, schemas, API routes, test files). This file tracks the remaining wiring, HTML/UI, and operational work needed to make everything functional.

**Estimated:** ~130 items remaining across 6 categories.

---

## 1. Not Wired — Code Exists, Zero Callers (~25 items)

Functions/modules that exist but are never invoked from service code.

### 1.1 Knowledge Graph Enrichment
- [x] Wire `enrichFromEvent()` into `xtdb-event-logger-ui/lib/db.ts` after event INSERT
- [x] Wire `enrichFromEvent()` into `ci-runner/runner.ts` after CI run completes
- [x] Wire `enrichFromEvent()` into `build-service/server.ts` after artifact build
- [x] Wire `enrichFromEvent()` into `review-gate/index.ts` after review completes
- [x] Wire `enrichFromEvent()` into `ticket-manager/index.ts` after ticket creation
- [x] Wire `enrichFromEvent()` into `health-prober/index.ts` on error capture

### 1.2 Review & Quality Recorders
- [x] Call `recordReviewReport()` from `review-gate/index.ts` after checks complete
- [x] Call `shouldBlockDeploy()` from `build-service/server.ts` deploy endpoint
- [x] Call `flushGroupsToXtdb()` on a timer in services that use error-groups (e.g. health-prober, ci-runner)

### 1.3 Knowledge Graph Startup
- [x] Call `ensureGraphIndexes()` from `knowledge-graph/index.ts` on startup
- [x] Call `refreshMaterializedEdges()` on a periodic timer in knowledge-graph

### 1.4 Agent Lifecycle Hooks
- [x] Wire `beforeAgentStart()` into pi agent session startup (requires pi SDK integration)
- [x] Wire `onAgentError()` into pi agent error handler (requires pi SDK integration)

### 1.5 Config Templating Activation
- [x] Uncomment `entrypoint` line in docker-compose.yml for garage service
- [x] Switch xtdb-primary from `command: ["-f", "xtdb-primary.yaml"]` to `entrypoint: ["/bin/sh", "/xtdb-entrypoint.sh"]`
- [x] Switch xtdb-replica similarly
- [x] Test that envsubst works correctly in both entrypoint scripts
- [x] Remove hardcoded credentials from `xtdb-primary.yaml` and `xtdb-replica.yaml` (keep `.tmpl` only)

### 1.6 pi Extension Registration
- [x] Add pi extension manifest to `knowledge-graph/package.json` (`"pi"` field)
- [x] Add pi extension manifest to `ticket-manager/package.json` (`"pi"` field)
- [x] Register tools from `knowledge-graph/hooks.ts` via pi SDK `registerTool()`
- [x] Register tools from `ticket-manager/hooks.ts` via pi SDK `registerTool()`

### 1.7 Error Capture Enforcement
- [x] Add `captureError()` calls to catch blocks in `harness-ui/server.ts`
- [x] Add `captureError()` calls to catch blocks in `xtdb-ops-api/server.ts`
- [x] Add `captureError()` calls to catch blocks in `ci-runner/runner.ts`
- [x] Add `captureError()` calls to catch blocks in `build-service/server.ts`
- [x] Add `captureError()` calls to catch blocks in `docker-event-collector/server.ts`

---

## 2. Schema Only — Table Defined, No INSERT Logic (~10 items)

Seed schema defines these tables but no service writes to them.

- [x] `container_metrics` — add INSERT in `docker-event-collector/stats-poller.ts` after polling
- [x] `slow_queries` — add INSERT in `lib/query-timer.ts` when duration > threshold
- [x] `api_metrics` — add INSERT (sampled) in `lib/api-metrics.ts` record function
- [x] `dependency_audits` — add INSERT in `security:audit` Taskfile target or a new `scripts/audit-to-xtdb.ts`
- [x] `image_scans` — add INSERT in `build-service/image-scanner.ts` after scan completes
- [x] `log_leak_detections` — add INSERT in `log-scanner/index.ts` when leak detected
- [x] `rate_limit_events` — add INSERT in `lib/rate-limiter.ts` when request blocked
- [x] `service_health_checks` — health-prober writes to `errors` table; redirect to `service_health_checks`
- [x] `review_reports` — `recorder.ts` has INSERT logic but needs to be called (see §1.2)
- [x] Add `jsonld` column to existing tables: `file_metrics`, `artifact_reads`, `lifecycle_events`
- [x] Link ADRs (decisions table) to review_reports via `graph_edges`

---

## 3. API Only — Routes Exist, No HTML Pages (~20 items)

JSON API endpoints work but no HTML templates render them in the browser.

### 3.1 Monitoring Dashboards
- [x] `/monitoring/health` — HTML page showing service health grid (calls `/api/health`)
- [x] `/monitoring/errors` — HTML page showing error groups table (calls `/api/quality/errors`)
- [x] `/monitoring/metrics` — HTML page with API latency/throughput charts

### 3.2 Security Pages
- [x] `/security/scans` — HTML page showing Trivy scan results
- [x] `/security/leaks` — HTML page showing log leak detections
- [x] `/security/audit` — HTML page showing npm audit results

### 3.3 Quality Pages
- [x] `/quality/complexity` — HTML page with complexity trend line charts (Chart.js or similar)
- [x] `/quality/reviews` — HTML page showing review report history

### 3.4 Ticket Pages
- [x] `/tickets` — HTML page that loads `tickets.js` Kanban board
- [x] `/tickets/:id` — HTML ticket detail page with activity log
- [x] `/tickets/list` — HTML sortable/filterable table view
- [x] `/tickets/burndown` — HTML burndown chart (requires metrics API, see §5)
- [x] `/tickets/velocity` — HTML velocity chart (requires metrics API, see §5)

### 3.5 Knowledge Graph Pages
- [x] `/graph/explore` — HTML page with D3.js force-directed graph visualization
- [x] `/graph/entity/:id` — HTML entity explorer showing neighbors + properties
- [x] `/graph/timeline` — HTML chronological activity timeline
- [x] `/graph/impact/:id` — HTML impact analysis tree/sunburst

### 3.6 Navigation
- [x] Add Tickets link to main nav in `harness-ui/static/` HTML
- [x] Add Graph link to main nav
- [x] Add Quality link to main nav
- [x] Add Security link to main nav

---

## 4. Phase A: Infisical Operations (~25 items)

Docker-compose services exist. Everything else is missing.

### 4.1 Service Integration
- [x] Add Infisical healthcheck in docker-compose.yml
- [x] Add Infisical to Caddy reverse proxy at `/infisical`
- [x] Install `infisical` CLI in each service Dockerfile (or use init container)
- [x] Modify docker-compose `command` for each service: `infisical run --env=prod --`
- [x] Add `INFISICAL_CLIENT_ID` / `INFISICAL_CLIENT_SECRET` env vars per service

### 4.2 Machine Identities & CI
- [x] Create Machine Identity for harness-services group
- [x] Create Machine Identity for ci-runner
- [x] Create Machine Identity for monitoring services
- [x] Inject Infisical CLI into `ci-runner/runner.ts` pipeline step execution
- [x] Store CI Infisical credentials as Docker secrets

### 4.3 Local Development
- [x] Add `dev:secrets` Taskfile target: `infisical run --env=dev -- task dev`
- [x] Document `infisical login` workflow in QUICKSTART.md (expand existing section)
- [x] Test that `.env` fallback still works when Infisical is unavailable

### 4.4 Secret Rotation
- [x] Configure 90-day rotation for `XTDB_PASSWORD`
- [x] Configure 90-day rotation for `GARAGE_ACCESS_KEY` / `GARAGE_SECRET_KEY`
- [x] Configure 90-day rotation for `KEYCLOAK_ADMIN_PASSWORD`
- [x] Alert on rotation failure (email or SSE)
- [x] Test rotation procedure end-to-end

### 4.5 Audit & Compliance
- [x] Enable Infisical audit logging
- [x] Create access policies per environment (dev/staging/prod)
- [x] Document break-glass procedure for Infisical outage
- [x] Backup `ENCRYPTION_KEY` / `AUTH_SECRET` procedure (see runbook)

---

## 5. Phase M: Ticket Metrics & Kanban (~15 items)

Ticket CRUD and transitions work. Missing: board management, metrics, charts.

### 5.1 Kanban Board API
- [x] `/api/tickets/board/:projectId` — return tickets grouped by status with column order
- [x] Drag reorder persistence (position field in tickets table)
- [x] WIP limits per column (configurable per project)
- [x] Board settings API (column order, WIP limits, swimlanes)

### 5.2 Auto-Generation Config
- [x] Make auto-generation rules configurable per project (currently hardcoded thresholds)
- [x] API to list/update auto-generation rules
- [x] UI page for managing auto-generation rules

### 5.3 Metrics API + Charts
- [x] `/api/tickets/metrics/throughput` — tickets completed per week
- [x] `/api/tickets/metrics/cycle-time` — P50/P95 `in_progress` → `done`
- [x] `/api/tickets/metrics/lead-time` — P50/P95 `created` → `done`
- [x] `/api/tickets/metrics/wip` — current WIP count by project
- [x] `/api/tickets/metrics/burndown` — burndown projection data
- [x] Burndown chart page (requires HTML + Chart.js, see §3.4)
- [x] Velocity chart page (requires HTML + Chart.js, see §3.4)

---

## 6. Smaller Gaps (~10 items)

### 6.1 Testing (Phase H)
- [x] Integrate `autocannon` into `test/performance/load-test.ts` (currently uses raw fetch)
- [x] Add P95 regression detection: block CI when P95 regresses >20%
- [x] Expand `test/integration/ci-flow.ts` with Docker event flow and WebSocket chat tests
- [x] Expand `test/e2e/full-pipeline.ts` with end-to-end session lifecycle

### 6.2 CI/CD (Phase J)
- [x] Configure Docker json-file log driver with rotation in docker-compose.yml
- [x] Add log aggregation service (Loki or similar) or Taskfile `logs:export` target

### 6.3 Progress Sync (Phase G)
- [x] Make `scripts/progress-sync.ts` update PROGRESS-DEFERRED.md checkboxes (currently read-only)
- [x] Add as Taskfile target: `task progress:sync`

### 6.4 Knowledge Graph Polish (Phase L)
- [x] Add entity badges/links to existing session/project detail pages
- [x] Add Knowledge Graph Stats widget to harness-ui home page
- [x] Add Entity Graph tab to session detail page
- [x] Tune materialized edge refresh interval (currently random 10% chance)

---

## Summary

| Category | Items | Difficulty |
|----------|------:|------------|
| 1. Not Wired (add function calls) | ~25 | Easy — mechanical wiring |
| 2. Schema → INSERT logic | ~10 | Easy — copy pattern from existing INSERTs |
| 3. HTML/UI Pages | ~20 | Medium — need HTML templates + JS |
| 4. Infisical Operations | ~25 | Hard — needs running infra + Dockerfiles |
| 5. Ticket Metrics & Kanban | ~15 | Medium — new APIs + chart rendering |
| 6. Smaller Gaps | ~10 | Easy–Medium |
| **Total** | **~105** | |

## Recommended Execution Order

```
Category 1 (Not Wired)     — fastest ROI, makes existing code functional
Category 2 (INSERT logic)  — completes the data pipeline
Category 6 (Smaller Gaps)  — quick wins
Category 5 (Ticket Metrics)— new features, moderate effort
Category 3 (HTML/UI Pages) — visual payoff, needs HTML/CSS/JS work
Category 4 (Infisical Ops) — biggest effort, needs running Docker + Infisical
```
