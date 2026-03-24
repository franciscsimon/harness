# Deferred Tasks — Phased Implementation Plan

**Generated:** 2026-03-24
**Source:** All `- [ ]` items from PROGRESS.md not completed during the initial implementation sweep (Phases 1–8).
**Context:** Core modules, libraries, CLI tools, and services for Phases 1–8 are built and pushed (35 commits). These remaining items require live infrastructure, UI work, pi SDK integration, or operational deployment.

**Note:** ~35 items appear unchecked in PROGRESS.md but are actually complete — the checkbox text doesn't exactly match what was built (e.g. "Migrate all 20 files" is done via `connectXtdb()` consolidation). Those are marked with ⚡ below.

---

## Phase A: Infisical Secrets Infrastructure (35 items)

**Requires:** Docker deployment, Infisical server running
**Why deferred:** Infisical is a full server deployment (PostgreSQL + Redis + Infisical container). We completed the code-side work (env vars replacing hardcoded secrets, `.env.example`) but the infrastructure deployment needs a running Docker environment.

### A.1 Deploy Infisical to Docker Compose

- [ ] Add `infisical-db` service (PostgreSQL 16 Alpine)
- [ ] Add `infisical-redis` service (Redis 7 Alpine)
- [ ] Add `infisical` service (Infisical server image)
- [ ] Generate `ENCRYPTION_KEY`, `AUTH_SECRET`, `SITE_URL`
- [ ] Add `infisical-data`, `infisical-redis-data` Docker volumes
- [ ] Add Infisical to Caddy reverse proxy at `/infisical`
- [ ] Add healthcheck for Infisical service

### A.2 CLI Injection (Phase A of 1.6)

- [ ] Install `infisical` CLI in each service's Dockerfile
- [ ] Modify Docker Compose `command` to use `infisical run --` wrapper
- [ ] Each service gets `INFISICAL_CLIENT_ID` / `INFISICAL_CLIENT_SECRET` env vars
- [ ] Create `scripts/infisical-bootstrap.sh` — seed project, environments, folders, machine identities

### A.3 Machine Identities & CI Integration

- [ ] Create Machine Identities for each service group
- [ ] `ci-runner/runner.ts` — inject Infisical CLI before pipeline steps
- [ ] Store CI Infisical credentials as Docker secrets

### A.4 Local Development Workflow

- [ ] Developers install Infisical CLI locally
- [ ] `infisical login` → `infisical run --env=dev -- npm run dev`
- [ ] Add Taskfile target `dev:secrets`
- [ ] Document workflow in QUICKSTART.md

### A.5 Secret Rotation

- [ ] Configure rotation for XTDB password (90 days)
- [ ] Configure rotation for Garage S3 keys (90 days)
- [ ] Configure rotation for Keycloak admin password (90 days)
- [ ] Document Garage RPC secret manual rotation runbook
- [ ] Document Infisical credential backup procedure

### A.6 `secrets-manager/` Extension

- [ ] `secrets-manager/validate.ts` — pre-commit secret scanner
- [ ] `secrets-manager/inject.ts` — SDK fallback wrapper
- [ ] `secrets-manager/audit.ts` — secret access event logger
- [ ] `secrets-manager/health.ts` — Infisical connectivity checker
- [ ] `secrets-manager/rotate.ts` — rotation helper

### A.7 Migration Finalization

- [ ] Verify all services start with Infisical-injected secrets
- [ ] Rotate all credentials (old ones were in version control)
- [ ] Verify `.gitleaks-baseline.json` shows zero remaining secrets

---

## Phase B: Config Templating & Entrypoints (8 items)

**Requires:** Docker Compose access
**Why deferred:** XTDB YAML and Garage TOML configs don't support env var expansion natively — need `envsubst` entrypoint wrappers.

- [ ] Create `scripts/xtdb-entrypoint.sh` — runs `envsubst` on YAML before starting XTDB
- [ ] Template `xtdb-primary.yaml` with `${GARAGE_ACCESS_KEY}`, `${GARAGE_SECRET_KEY}`
- [ ] Template `xtdb-replica.yaml` with same substitutions
- [ ] Update docker-compose.yml entrypoints for xtdb-primary/replica
- [ ] Rename `garage.toml` → `garage.toml.tmpl`
- [ ] Replace hardcoded `admin_token` and `rpc_secret` with env var placeholders
- [ ] Add `envsubst` entrypoint wrapper for garage container
- [ ] Remove all remaining hardcoded credential values from version-controlled files

---

## Phase C: XTDB Storage & Persistence (20 items)

**Requires:** Running XTDB cluster
**Why deferred:** We built in-memory buffers and modules but didn't wire XTDB INSERT statements for all data types.

### C.1 Monitoring Data

- [ ] Store health check results in XTDB `service_health_checks` table
- [ ] Store container metrics in XTDB `container_metrics` table
- [ ] Store slow queries (>500ms) in XTDB `slow_queries` table
- [ ] Store API metrics (sampled) in XTDB `api_metrics` table
- [ ] Store error rate computations in health-prober

### C.2 Security Scan Data

- [ ] Store npm audit results in XTDB `dependency_audits` table
- [ ] Store Trivy image scan results in XTDB `image_scans` table
- [ ] Store log leak detections in XTDB `log_leak_detections` table
- [ ] Store rate limit events in XTDB `rate_limit_events` table

### C.3 Review & Quality Data

- [ ] `review-gate/recorder.ts` — write review results to XTDB `review_reports` as JSON-LD
- [ ] Store complexity scores in XTDB `complexity_scores` (tracker exists, needs XTDB table)
- [ ] Link ADRs to review reports in XTDB

### C.4 Error & Ticket Data

- [ ] Store error groups in XTDB `error_groups` table (currently in-memory)
- [ ] Store generated tickets in XTDB via `ticket-manager/queries.ts`
- [ ] Add `graph_edges` table to `scripts/seed-schema.ts`
- [ ] Add `jsonld` columns to tables missing them: `file_metrics`, `artifact_reads`, `lifecycle_events`

---

## Phase D: harness-ui Pages & Dashboards (30 items)

**Requires:** Running services, browser testing
**Why deferred:** Server-rendered HTML pages need live data and the existing harness-ui page component pattern.

### D.1 Monitoring Pages

- [ ] `/monitoring/health` — service status, response time sparklines, uptime %
- [ ] `/monitoring/resources` — memory/CPU usage per container over time
- [ ] `/monitoring/queries` — top 10 slowest queries, P50/P95/P99 by endpoint
- [ ] `/monitoring/api` — response time distribution, error rate, request volume
- [ ] `/monitoring/errors` — error trends by component and severity

### D.2 Security Pages

- [ ] `/security/dependencies` — vulnerability count by severity, dependency age
- [ ] `/security/containers` — Trivy scan results per image
- [ ] `/security/rate-limits` — rate limit event history

### D.3 Quality Pages

- [ ] `/quality/complexity` — complexity trends over time (line chart per module)

### D.4 Ticket Pages (Phase 7.6)

- [ ] `/projects/:id/tickets` — Kanban board
- [ ] `/projects/:id/tickets/:ticketId` — Ticket detail with activity log
- [ ] `/projects/:id/tickets/list` — Sortable/filterable table view
- [ ] `/projects/:id/tickets/burndown` — Burndown chart
- [ ] `/projects/:id/tickets/velocity` — Velocity chart
- [ ] `harness-ui/static/tickets.js` — client-side drag-and-drop
- [ ] Add ticket routes to `harness-ui/server.ts`
- [ ] Add Tickets to navigation

### D.5 Knowledge Graph Pages (Phase 8)

- [ ] `/graph/entity/:id` — Entity Explorer with neighbor graph
- [ ] `/graph/explore` — Interactive D3.js graph explorer
- [ ] `/graph/timeline` — Unified chronological activity view
- [ ] `/graph/impact/:id` — Impact analysis tree
- [ ] `/graph/provenance/:id` — Provenance chain tree
- [ ] `/graph/search` — Cross-entity search results
- [ ] Add Knowledge Graph to navigation
- [ ] Add knowledge graph API endpoints to `xtdb-ops-api`

### D.6 Existing Page Enhancements

- [ ] Home page — ticket summary widget, knowledge graph stats
- [ ] Session detail — tickets touched, entity graph tab
- [ ] Decisions — linked entity badges
- [ ] Errors — auto-generated ticket links
- [ ] CI Runs — linked tickets, review details

---

## Phase E: pi Extension Registration & Agent Hooks (5 items)

**Requires:** pi SDK, running agent
**Why deferred:** Requires `pi.registerTool()` / `pi.registerCommand()` / `before_agent_start` hook APIs.

- [ ] Register `manage_ticket` tool in `ticket-manager/index.ts`
- [ ] Register `/ticket` command in `ticket-manager/index.ts`
- [ ] Register `query_graph` tool in `knowledge-graph/index.ts`
- [ ] Register `/graph` command in `knowledge-graph/index.ts`
- [ ] `before_agent_start` hook: inject open tickets + related entities for context

---

## Phase F: Extension Enrichment — JSON-LD Cross-Links (19 items)

**Requires:** Running extensions + XTDB
**Why deferred:** Modifying active pi extensions to emit richer JSON-LD provenance data.

### F.1 Decision ↔ Artifact Links

- [ ] `decision-log/rdf.ts` — query recent artifacts, add `ev:producedArtifacts`
- [ ] `decision-log/rdf.ts` — match open tickets, add `ev:addressesTicket`
- [ ] `artifact-tracker/index.ts` — add `prov:wasMotivatedBy` → decision

### F.2 Deployment ↔ Test/Ticket Links

- [ ] `deployment-tracker/index.ts` — add `ev:validatedBy` → test run
- [ ] `deployment-tracker/index.ts` — add `ev:deliversTickets` array

### F.3 Incident Full JSON-LD

- [ ] `xtdb-ops-api/lib/incidents.ts` — `@type: ["schema:Event", "prov:Activity"]`
- [ ] Auto-link incidents to recent errors
- [ ] Auto-link incidents to recent deployments

### F.4 CI & Test Links

- [ ] `xtdb-ops-api/lib/ci-webhook.ts` — parse commit message for `tkt:` refs
- [ ] `xtdb-ops-api/lib/ci-webhook.ts` — add `ev:testedCommit`

### F.5 Session & Workflow Links

- [ ] `session-postmortem/index.ts` — add `ev:sessionEntities` array
- [ ] `workflow-engine/index.ts` — add `ev:forTicket` link
- [ ] `workflow-engine/index.ts` — add `ev:stepDecisions`

### F.6 Incremental Edge Emission

- [ ] Each extension emits `graph_edges` rows on entity creation
- [ ] Alignment monitor checks agent actions against assigned tickets

---

## Phase G: progress-sync & Ticket Import (5 items)

**Requires:** XTDB with ticket tables populated
**Why deferred:** Needs the ticket system to have data before sync makes sense.

- [ ] Create `progress-sync/` module — markdown parser + checkbox updater
- [ ] Implement ticket-to-checklist matching (fuzzy title match)
- [ ] Implement `/ticket import PROGRESS.md`
- [ ] Map phase headers to labels, sections to parent tickets
- [ ] Wire into ticket status change hooks

---

## Phase H: Testing Expansion & CI Integration (25 items)

**Requires:** Running services for integration tests
**Why deferred:** Test frameworks are scaffolded but many specific test cases and CI wiring need live services.

### H.1 Performance Testing

- [ ] Install `autocannon` for proper load testing
- [ ] Establish baselines, make blocking when P95 regresses >20%
- [ ] Add `task test:perf` to Taskfile
- [ ] Add as optional CI step

### H.2 Integration & E2E

- [ ] Expand integration tests: event ingestion flow, Docker event flow, WebSocket chat
- [ ] Add `task test:integration` / `task test:e2e` to Taskfile
- [ ] Run E2E nightly, integration on every CI run

### H.3 Chaos Testing

- [ ] `test/chaos/db-failover.ts` — stop primary, verify replica fallback
- [ ] `test/chaos/network-partition.ts` — docker network disconnect
- [ ] `test/chaos/disk-full.ts` — volume fill test
- [ ] Add `task test:chaos` — WARNING: destructive

### H.4 Data Integrity

- [ ] `test/data/json-ld-consistency.ts` — verify @context/@type validity
- [ ] `test/data/no-orphans.ts` — find orphan records
- [ ] Add `task test:data` — runs against live XTDB

### H.5 Contract Expansion

- [ ] Request schema validation for all endpoints
- [ ] Response schema validation with JSON Schema
- [ ] Error response format consistency check
- [ ] Add contracts as required CI step

---

## Phase I: Error Monitoring Deepening (7 items)

**Requires:** Running services
**Why deferred:** Extends existing `lib/errors.ts` with features that need runtime testing.

- [ ] **Enforce adoption** — quality-hooks check that flags `catch` blocks without `captureError()`
- [ ] Add request context to `CaptureErrorOptions`: endpoint, method, requestId
- [ ] Add error fingerprinting (stable hash for dedup) to `lib/errors.ts`
- [ ] Add `first_seen`, `last_seen`, `occurrence_count` tracking per fingerprint in XTDB
- [ ] quality-hooks check that flags Hono routes without schema validation
- [ ] Alert when error rate exceeds thresholds (>10/5min warning, >50/5min critical)
- [ ] Post-deploy regression detection: compare 30min before/after error rates

---

## Phase J: CI/CD Pipeline Hardening (10 items)

**Requires:** CI runner, Docker
**Why deferred:** CI pipeline changes need testing with actual CI runs.

- [ ] Expand `test` step to run all test files, not just `pure-functions.ts`
- [ ] Add contract test suite as CI step (requires running services)
- [ ] `gitleaks protect --staged` in pre-commit hook
- [ ] Make gitleaks CI step blocking
- [ ] Create scheduled Taskfile task `security:audit` (weekly npm audit)
- [ ] Add `review-gate` as CI post-step in `ci-runner/runner.ts`
- [ ] Extend `ci-runner/pipeline.ts` `resolveSteps()` to include review-gate
- [ ] Block deployment if Trivy finds critical vulnerabilities
- [ ] SSE alerts for health check failures
- [ ] Configure log aggregation (Docker json-file driver + aggregator service)

---

## Phase K: Documentation (5 items)

**Requires:** Nothing — can do now
**Why deferred:** Low priority relative to code work.

- [ ] Document hooks are mandatory in QUICKSTART.md
- [ ] Document Infisical setup in QUICKSTART.md
- [ ] Document Garage RPC secret rotation runbook
- [ ] Update `docs/XTDB_SCHEMA.md` with new tables (tickets, graph_edges, complexity_scores, etc.)
- [ ] Add `noConsole` allowlist for test files in Biome config

---

## Phase L: Knowledge Graph Remaining Sprints (20 items)

**Requires:** XTDB, running extensions
**Why deferred:** Sprint 3-5 of Phase 8 need populated data and UI framework.

### L.1 Sprint 3 — Extension Enrichment

(Covered by Phase F above)

### L.2 Sprint 4 — UI Views

(Covered by Phase D.5 above)

### L.3 Sprint 5 — Integration & Polish

- [ ] `before_agent_start` hook: inject related entities when working on a ticket
- [ ] `before_agent_start` hook: on error, auto-query provenance chain
- [ ] Enhance existing pages with entity badges/links
- [ ] Add Knowledge Graph Stats widget to home page
- [ ] Add Entity Graph tab to session detail page
- [ ] Performance optimization: indexes, materialized edge refresh tuning
- [ ] Integration tests for entity resolution, edge resolution, path finding

---

## Phase M: Ticket System Remaining Sprints (30 items)

**Requires:** XTDB, pi SDK
**Why deferred:** Sprints 2-5 of Phase 7 need running agent and populated data.

### M.1 Sprint 2 — Linking & Auto-Generation

- [ ] Implement `ticket_links` CRUD and `/ticket link`
- [ ] Auto-linking hooks: decisions → tickets, artifacts → tickets, CI runs → tickets
- [ ] Error → ticket auto-generation with deduplication
- [ ] Quality scan → debt ticket generation
- [ ] CI failure → bug ticket generation
- [ ] Security finding → security ticket generation
- [ ] Fingerprint deduplication before creating auto-tickets

### M.2 Sprint 3 — Orchestrator & Alignment Integration

- [ ] `/orchestrate persist` promotes in-memory tasks to XTDB tickets
- [ ] Alignment monitor compares agent actions against assigned tickets
- [ ] Review gate checks: "does commit reference a ticket?"

### M.3 Sprint 4 — Metrics

- [ ] Throughput: tickets completed per week
- [ ] Cycle time: `in_progress` → `done` (P50/P95)
- [ ] Lead time: `created` → `done`
- [ ] WIP tracking
- [ ] Burndown projection

---

## Summary

| Phase | Items | Requires |
|-------|------:|----------|
| Phase A: Infisical Secrets Infrastructure | 35 | Docker, Infisical server |
| Phase B: Config Templating | 8 | Docker Compose |
| Phase C: XTDB Storage | 20 | Running XTDB |
| Phase D: UI Pages & Dashboards | 30 | Running services, browser |
| Phase E: pi Extension Hooks | 5 | pi SDK, agent |
| Phase F: Extension Enrichment | 19 | Running extensions + XTDB |
| Phase G: progress-sync | 5 | XTDB with tickets |
| Phase H: Testing Expansion | 25 | Running services |
| Phase I: Error Monitoring | 7 | Running services |
| Phase J: CI/CD Hardening | 10 | CI runner, Docker |
| Phase K: Documentation | 5 | None |
| Phase L: Knowledge Graph Sprints | 20 | XTDB, extensions |
| Phase M: Ticket System Sprints | 30 | XTDB, pi SDK |
| **Total** | **~220** | |

**Note:** ~35 items from PROGRESS.md are "checkbox stale" — the work was completed but the original checkbox text doesn't exactly match (e.g., DB consolidation, env var migration, biome hardening). Those should be marked `[x]` in PROGRESS.md.

## Recommended Execution Order

```
Phase K (Documentation)          ─── no dependencies, do anytime
Phase B (Config Templating)      ─── needs Docker Compose only
Phase J (CI/CD Hardening)        ─── needs CI runner
Phase I (Error Monitoring)       ─── needs running services
Phase H (Testing Expansion)      ─── needs running services
Phase C (XTDB Storage)           ─── needs XTDB cluster
Phase A (Infisical)              ─── big infrastructure deploy
Phase E (pi Extension Hooks)     ─── needs pi SDK + agent
Phase M (Ticket System Sprints)  ─── needs XTDB + pi SDK
Phase F (Extension Enrichment)   ─── needs running extensions
Phase G (progress-sync)          ─── needs ticket tables populated
Phase D (UI Pages)               ─── needs all backend services
Phase L (Knowledge Graph Sprints)─── needs everything running
```
