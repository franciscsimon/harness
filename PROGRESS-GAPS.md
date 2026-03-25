# Implementation Gaps — Wiring, UI, Operations

**Generated:** 2026-03-24
**Context:** Phases A–M scaffolding is committed (modules, schemas, API routes, test files). This file tracks the remaining wiring, HTML/UI, and operational work needed to make everything functional.

**Estimated:** ~130 items remaining across 6 categories.

---

## 1. Not Wired — Code Exists, Zero Callers (~25 items)

Functions/modules that exist but are never invoked from service code.

### 1.1 Knowledge Graph Enrichment
- [ ] Wire `enrichFromEvent()` into `xtdb-event-logger-ui/lib/db.ts` after event INSERT
- [ ] Wire `enrichFromEvent()` into `ci-runner/runner.ts` after CI run completes
- [ ] Wire `enrichFromEvent()` into `build-service/server.ts` after artifact build
- [ ] Wire `enrichFromEvent()` into `review-gate/index.ts` after review completes
- [ ] Wire `enrichFromEvent()` into `ticket-manager/index.ts` after ticket creation
- [ ] Wire `enrichFromEvent()` into `health-prober/index.ts` on error capture

### 1.2 Review & Quality Recorders
- [ ] Call `recordReviewReport()` from `review-gate/index.ts` after checks complete
- [ ] Call `shouldBlockDeploy()` from `build-service/server.ts` deploy endpoint
- [ ] Call `flushGroupsToXtdb()` on a timer in services that use error-groups (e.g. health-prober, ci-runner)

### 1.3 Knowledge Graph Startup
- [ ] Call `ensureGraphIndexes()` from `knowledge-graph/index.ts` on startup
- [ ] Call `refreshMaterializedEdges()` on a periodic timer in knowledge-graph

### 1.4 Agent Lifecycle Hooks
- [ ] Wire `beforeAgentStart()` into pi agent session startup (requires pi SDK integration)
- [ ] Wire `onAgentError()` into pi agent error handler (requires pi SDK integration)

### 1.5 Config Templating Activation
- [ ] Uncomment `entrypoint` line in docker-compose.yml for garage service
- [ ] Switch xtdb-primary from `command: ["-f", "xtdb-primary.yaml"]` to `entrypoint: ["/bin/sh", "/xtdb-entrypoint.sh"]`
- [ ] Switch xtdb-replica similarly
- [ ] Test that envsubst works correctly in both entrypoint scripts
- [ ] Remove hardcoded credentials from `xtdb-primary.yaml` and `xtdb-replica.yaml` (keep `.tmpl` only)

### 1.6 pi Extension Registration
- [ ] Add pi extension manifest to `knowledge-graph/package.json` (`"pi"` field)
- [ ] Add pi extension manifest to `ticket-manager/package.json` (`"pi"` field)
- [ ] Register tools from `knowledge-graph/hooks.ts` via pi SDK `registerTool()`
- [ ] Register tools from `ticket-manager/hooks.ts` via pi SDK `registerTool()`

### 1.7 Error Capture Enforcement
- [ ] Add `captureError()` calls to catch blocks in `harness-ui/server.ts`
- [ ] Add `captureError()` calls to catch blocks in `xtdb-ops-api/server.ts`
- [ ] Add `captureError()` calls to catch blocks in `ci-runner/runner.ts`
- [ ] Add `captureError()` calls to catch blocks in `build-service/server.ts`
- [ ] Add `captureError()` calls to catch blocks in `docker-event-collector/server.ts`

---

## 2. Schema Only — Table Defined, No INSERT Logic (~10 items)

Seed schema defines these tables but no service writes to them.

- [ ] `container_metrics` — add INSERT in `docker-event-collector/stats-poller.ts` after polling
- [ ] `slow_queries` — add INSERT in `lib/query-timer.ts` when duration > threshold
- [ ] `api_metrics` — add INSERT (sampled) in `lib/api-metrics.ts` record function
- [ ] `dependency_audits` — add INSERT in `security:audit` Taskfile target or a new `scripts/audit-to-xtdb.ts`
- [ ] `image_scans` — add INSERT in `build-service/image-scanner.ts` after scan completes
- [ ] `log_leak_detections` — add INSERT in `log-scanner/index.ts` when leak detected
- [ ] `rate_limit_events` — add INSERT in `lib/rate-limiter.ts` when request blocked
- [ ] `service_health_checks` — health-prober writes to `errors` table; redirect to `service_health_checks`
- [ ] `review_reports` — `recorder.ts` has INSERT logic but needs to be called (see §1.2)
- [ ] Add `jsonld` column to existing tables: `file_metrics`, `artifact_reads`, `lifecycle_events`
- [ ] Link ADRs (decisions table) to review_reports via `graph_edges`

---

## 3. API Only — Routes Exist, No HTML Pages (~20 items)

JSON API endpoints work but no HTML templates render them in the browser.

### 3.1 Monitoring Dashboards
- [ ] `/monitoring/health` — HTML page showing service health grid (calls `/api/health`)
- [ ] `/monitoring/errors` — HTML page showing error groups table (calls `/api/quality/errors`)
- [ ] `/monitoring/metrics` — HTML page with API latency/throughput charts

### 3.2 Security Pages
- [ ] `/security/scans` — HTML page showing Trivy scan results
- [ ] `/security/leaks` — HTML page showing log leak detections
- [ ] `/security/audit` — HTML page showing npm audit results

### 3.3 Quality Pages
- [ ] `/quality/complexity` — HTML page with complexity trend line charts (Chart.js or similar)
- [ ] `/quality/reviews` — HTML page showing review report history

### 3.4 Ticket Pages
- [ ] `/tickets` — HTML page that loads `tickets.js` Kanban board
- [ ] `/tickets/:id` — HTML ticket detail page with activity log
- [ ] `/tickets/list` — HTML sortable/filterable table view
- [ ] `/tickets/burndown` — HTML burndown chart (requires metrics API, see §5)
- [ ] `/tickets/velocity` — HTML velocity chart (requires metrics API, see §5)

### 3.5 Knowledge Graph Pages
- [ ] `/graph/explore` — HTML page with D3.js force-directed graph visualization
- [ ] `/graph/entity/:id` — HTML entity explorer showing neighbors + properties
- [ ] `/graph/timeline` — HTML chronological activity timeline
- [ ] `/graph/impact/:id` — HTML impact analysis tree/sunburst

### 3.6 Navigation
- [ ] Add Tickets link to main nav in `harness-ui/static/` HTML
- [ ] Add Graph link to main nav
- [ ] Add Quality link to main nav
- [ ] Add Security link to main nav

---

## 4. Phase A: Infisical Operations (~25 items)

Docker-compose services exist. Everything else is missing.

### 4.1 Service Integration
- [ ] Add Infisical healthcheck in docker-compose.yml
- [ ] Add Infisical to Caddy reverse proxy at `/infisical`
- [ ] Install `infisical` CLI in each service Dockerfile (or use init container)
- [ ] Modify docker-compose `command` for each service: `infisical run --env=prod --`
- [ ] Add `INFISICAL_CLIENT_ID` / `INFISICAL_CLIENT_SECRET` env vars per service

### 4.2 Machine Identities & CI
- [ ] Create Machine Identity for harness-services group
- [ ] Create Machine Identity for ci-runner
- [ ] Create Machine Identity for monitoring services
- [ ] Inject Infisical CLI into `ci-runner/runner.ts` pipeline step execution
- [ ] Store CI Infisical credentials as Docker secrets

### 4.3 Local Development
- [ ] Add `dev:secrets` Taskfile target: `infisical run --env=dev -- task dev`
- [ ] Document `infisical login` workflow in QUICKSTART.md (expand existing section)
- [ ] Test that `.env` fallback still works when Infisical is unavailable

### 4.4 Secret Rotation
- [ ] Configure 90-day rotation for `XTDB_PASSWORD`
- [ ] Configure 90-day rotation for `GARAGE_ACCESS_KEY` / `GARAGE_SECRET_KEY`
- [ ] Configure 90-day rotation for `KEYCLOAK_ADMIN_PASSWORD`
- [ ] Alert on rotation failure (email or SSE)
- [ ] Test rotation procedure end-to-end

### 4.5 Audit & Compliance
- [ ] Enable Infisical audit logging
- [ ] Create access policies per environment (dev/staging/prod)
- [ ] Document break-glass procedure for Infisical outage
- [ ] Backup `ENCRYPTION_KEY` / `AUTH_SECRET` procedure (see runbook)

---

## 5. Phase M: Ticket Metrics & Kanban (~15 items)

Ticket CRUD and transitions work. Missing: board management, metrics, charts.

### 5.1 Kanban Board API
- [ ] `/api/tickets/board/:projectId` — return tickets grouped by status with column order
- [ ] Drag reorder persistence (position field in tickets table)
- [ ] WIP limits per column (configurable per project)
- [ ] Board settings API (column order, WIP limits, swimlanes)

### 5.2 Auto-Generation Config
- [ ] Make auto-generation rules configurable per project (currently hardcoded thresholds)
- [ ] API to list/update auto-generation rules
- [ ] UI page for managing auto-generation rules

### 5.3 Metrics API + Charts
- [ ] `/api/tickets/metrics/throughput` — tickets completed per week
- [ ] `/api/tickets/metrics/cycle-time` — P50/P95 `in_progress` → `done`
- [ ] `/api/tickets/metrics/lead-time` — P50/P95 `created` → `done`
- [ ] `/api/tickets/metrics/wip` — current WIP count by project
- [ ] `/api/tickets/metrics/burndown` — burndown projection data
- [ ] Burndown chart page (requires HTML + Chart.js, see §3.4)
- [ ] Velocity chart page (requires HTML + Chart.js, see §3.4)

---

## 6. Smaller Gaps (~10 items)

### 6.1 Testing (Phase H)
- [ ] Integrate `autocannon` into `test/performance/load-test.ts` (currently uses raw fetch)
- [ ] Add P95 regression detection: block CI when P95 regresses >20%
- [ ] Expand `test/integration/ci-flow.ts` with Docker event flow and WebSocket chat tests
- [ ] Expand `test/e2e/full-pipeline.ts` with end-to-end session lifecycle

### 6.2 CI/CD (Phase J)
- [ ] Configure Docker json-file log driver with rotation in docker-compose.yml
- [ ] Add log aggregation service (Loki or similar) or Taskfile `logs:export` target

### 6.3 Progress Sync (Phase G)
- [ ] Make `scripts/progress-sync.ts` update PROGRESS-DEFERRED.md checkboxes (currently read-only)
- [ ] Add as Taskfile target: `task progress:sync`

### 6.4 Knowledge Graph Polish (Phase L)
- [ ] Add entity badges/links to existing session/project detail pages
- [ ] Add Knowledge Graph Stats widget to harness-ui home page
- [ ] Add Entity Graph tab to session detail page
- [ ] Tune materialized edge refresh interval (currently random 10% chance)

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
