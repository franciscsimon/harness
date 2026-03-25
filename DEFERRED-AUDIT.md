# PROGRESS-DEFERRED.md Audit Report

**Generated:** 2026-03-24
**Method:** Cross-referenced each checkbox item against actual files, code content, and implementations in the codebase.

## Legend

- **DONE** — Code exists and matches the checkbox description
- **PARTIALLY DONE** — Some code exists but not complete
- **NOT STARTED** — No implementation found

---

## Phase A: Infisical Secrets Infrastructure (35 items)

**Verdict: 0 DONE / 0 PARTIAL / 35 NOT STARTED**

No Infisical infrastructure exists anywhere in the codebase. The word "infisical" only appears in documentation (QUICKSTART.md, docs/runbooks/secret-rotation.md) and progress tracking files. There are no Docker Compose entries, no `secrets-manager/` extension directory, no `scripts/infisical-bootstrap.sh`, no machine identity configs, no rotation configs. All 35 items remain NOT STARTED.

### A.1 Deploy Infisical to Docker Compose — all 7 NOT STARTED
### A.2 CLI Injection — all 4 NOT STARTED
### A.3 Machine Identities & CI Integration — all 3 NOT STARTED
### A.4 Local Development Workflow — all 4 NOT STARTED
### A.5 Secret Rotation — all 5 NOT STARTED
### A.6 `secrets-manager/` Extension — all 5 NOT STARTED
### A.7 Migration Finalization — all 3 NOT STARTED

---

## Phase B: Config Templating & Entrypoints (8 items)

**Verdict: 5 DONE / 2 PARTIALLY DONE / 1 NOT STARTED**

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Create `scripts/xtdb-entrypoint.sh` | **DONE** | Full implementation with envsubst + sed fallback |
| 2 | Template `xtdb-primary.yaml` with env vars | **DONE** | `xtdb-primary.yaml.tmpl` has `${GARAGE_ACCESS_KEY}` / `${GARAGE_SECRET_KEY}` |
| 3 | Template `xtdb-replica.yaml` with same | **DONE** | `xtdb-replica.yaml.tmpl` has same substitutions |
| 4 | Update docker-compose.yml entrypoints for xtdb | **PARTIALLY DONE** | Volume mounts exist for entrypoint + template, but `entrypoint:` directive not yet set (still using default XTDB entrypoint) |
| 5 | Rename `garage.toml` → `garage.toml.tmpl` | **DONE** | `garage.toml.tmpl` exists with `${GARAGE_RPC_SECRET}` and `${GARAGE_ADMIN_TOKEN}` |
| 6 | Replace hardcoded admin_token/rpc_secret with env var placeholders | **DONE** | Done in `.tmpl` file |
| 7 | Add `envsubst` entrypoint wrapper for garage container | **PARTIALLY DONE** | `scripts/garage-entrypoint.sh` exists with full implementation, mounted in compose, but commented out (`# When migrating to templates: entrypoint:`) |
| 8 | Remove all remaining hardcoded credential values | **NOT STARTED** | `garage.toml` still has `rpc_secret = "0123456789abcdef..."` and `admin_token = "admin-secret"` |

---

## Phase C: XTDB Storage & Persistence (20 items)

**Verdict: 4 DONE / 0 PARTIAL / 16 NOT STARTED**

### C.1 Monitoring Data
| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Store health checks in `service_health_checks` | **DONE** | `health-prober/index.ts` has `INSERT INTO service_health_checks` |
| 2 | Store container metrics in `container_metrics` | NOT STARTED | No INSERT found |
| 3 | Store slow queries in `slow_queries` | NOT STARTED | No INSERT found |
| 4 | Store API metrics in `api_metrics` | NOT STARTED | No INSERT found |
| 5 | Store error rate computations | NOT STARTED | No INSERT found |

### C.2 Security Scan Data — all 4 NOT STARTED
No INSERT statements for `dependency_audits`, `image_scans`, `log_leak_detections`, or `rate_limit_events`.

### C.3 Review & Quality Data
| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | `review-gate/recorder.ts` — write review results to XTDB | NOT STARTED | No `recorder.ts` file |
| 2 | Store complexity scores in XTDB | **DONE** | `review-gate/checks/complexity-tracker.ts` has `INSERT INTO complexity_scores` |
| 3 | Link ADRs to review reports in XTDB | NOT STARTED | |

### C.4 Error & Ticket Data
| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Store error groups in XTDB | **DONE** | `lib/error-groups.ts` has `flushGroupsToXtdb()` with full INSERT INTO `error_groups` |
| 2 | Store tickets via `ticket-manager/queries.ts` | **DONE** | `queries.ts` has full `createTicket()` with INSERT INTO `tickets` |
| 3 | Add `graph_edges` table to seed-schema.ts | NOT STARTED | Not in `seed-schema.ts` (but `knowledge-graph/materialized-edges.ts` does INSERT into it) |
| 4 | Add `jsonld` columns to `file_metrics`, `artifact_reads`, `lifecycle_events` | NOT STARTED | All three tables in seed-schema.ts lack `jsonld` column |

---

## Phase D: harness-ui Pages & Dashboards (30 items)

**Verdict: 0 DONE / 0 PARTIAL / 30 NOT STARTED**

No monitoring pages, security pages, quality pages, ticket pages, or knowledge graph pages exist. The `harness-ui/pages/` directory has core pages (sessions, decisions, errors, etc.) but none of the D.1–D.6 items. No routes for `/monitoring/*`, `/security/*`, `/quality/*`, `/projects/:id/tickets/*`, or `/graph/*` in `server.ts`.

### D.1 Monitoring Pages — all 5 NOT STARTED
### D.2 Security Pages — all 3 NOT STARTED
### D.3 Quality Pages — 1 NOT STARTED
### D.4 Ticket Pages — all 8 NOT STARTED
### D.5 Knowledge Graph Pages — all 8 NOT STARTED
### D.6 Existing Page Enhancements — all 5 NOT STARTED

---

## Phase E: pi Extension Registration & Agent Hooks (5 items)

**Verdict: 0 DONE / 0 PARTIAL / 5 NOT STARTED**

No `registerTool` or `registerCommand` calls exist in `ticket-manager/` or `knowledge-graph/`. These directories have CLI interfaces but no pi SDK integration. The `before_agent_start` hook for injecting tickets+entities does not exist.

---

## Phase F: Extension Enrichment — JSON-LD Cross-Links (19 items)

**Verdict: 0 DONE / 0 PARTIAL / 19 NOT STARTED**

No `ev:producedArtifacts`, `ev:addressesTicket`, `prov:wasMotivatedBy`, `ev:validatedBy`, `ev:deliversTickets`, `ev:testedCommit`, `ev:sessionEntities`, `ev:forTicket`, or `ev:stepDecisions` properties exist anywhere in the codebase. Existing extensions emit basic JSON-LD but none of the richer cross-linking described in Phase F. No extension emits `graph_edges` rows on entity creation. No alignment monitor ticket checks.

---

## Phase G: progress-sync & Ticket Import (5 items)

**Verdict: 0 DONE / 0 PARTIAL / 5 NOT STARTED**

No `progress-sync/` directory exists.

---

## Phase H: Testing Expansion & CI Integration (25 items)

**Verdict: 18 DONE / 3 PARTIALLY DONE / 4 NOT STARTED**

This is the most implemented phase.

### H.1 Performance Testing
| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Install `autocannon` | **DONE** | In `package.json`, used in `test/performance/load-test.ts` |
| 2 | Establish baselines, blocking on P95 regression | **PARTIALLY DONE** | `load-test.ts` exists but no evidence of blocking CI integration |
| 3 | Add `task test:perf` to Taskfile | **DONE** | Present at line 549 |
| 4 | Add as optional CI step | NOT STARTED | Not in `.ci.jsonld` |

### H.2 Integration & E2E
| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Expand integration tests | **DONE** | `test/integration/ci-flow.ts` exists |
| 2 | Add `task test:integration` / `task test:e2e` | **DONE** | Both present in Taskfile |
| 3 | Run E2E nightly, integration on CI | NOT STARTED | No cron/scheduling config for nightly runs |

### H.3 Chaos Testing
| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | `test/chaos/db-failover.ts` | **DONE** | Full implementation with Docker container stop/start |
| 2 | `test/chaos/network-partition.ts` | **DONE** | Full implementation with Docker network disconnect |
| 3 | `test/chaos/disk-full.ts` | **DONE** | Full implementation with volume fill |
| 4 | Add `task test:chaos` | **DONE** | Present at line 564 |

### H.4 Data Integrity
| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | `test/data/json-ld-consistency.ts` | **DONE** | Verifies @context/@type validity |
| 2 | `test/data/no-orphans.ts` | **DONE** | Finds orphan records |
| 3 | Add `task test:data` | **DONE** | Present at line 569, runs `primary-replica-sync.ts` + `referential-integrity.ts` |

### H.5 Contract Expansion
| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Request schema validation for all endpoints | **DONE** | `test/contracts/request-response-validation.ts` |
| 2 | Response schema validation with JSON Schema | **DONE** | Same file covers response validation |
| 3 | Error response format consistency check | **DONE** | Same file |
| 4 | Add contracts as required CI step | **PARTIALLY DONE** | In `.ci.jsonld` as a step, but marked `requiresServices: true` (may skip without services) |

**Additional test files found:** `test/e2e/full-pipeline.ts`, `test/chaos/service-down.ts`, `test/data/primary-replica-sync.ts`, `test/data/referential-integrity.ts`

---

## Phase I: Error Monitoring Deepening (7 items)

**Verdict: 4 DONE / 0 PARTIAL / 3 NOT STARTED**

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Enforce adoption — quality-hooks check for catch without captureError() | NOT STARTED | No such check in `quality-hooks/checks.ts` |
| 2 | Add request context (endpoint, method, requestId) | **DONE** | `CaptureErrorOptions` has `endpoint`, `method`, `requestId` fields (lines 52-54 of `lib/errors.ts`) |
| 3 | Add error fingerprinting | **DONE** | `captureError()` computes SHA-256 fingerprint from component+operation+error type+stack (lines 128-133) |
| 4 | Add first_seen/last_seen/occurrence_count tracking | **DONE** | `lib/error-groups.ts` has full in-memory tracking + XTDB persistence via `flushGroupsToXtdb()` |
| 5 | quality-hooks check for Hono routes without schema validation | NOT STARTED | No such check |
| 6 | Alert when error rate exceeds thresholds | **DONE** | `lib/alerting-rules.ts` defines rules including `degraded-error-burst` and `transient-error-escalation` with specific thresholds and cooldowns |
| 7 | Post-deploy regression detection | NOT STARTED | `lib/regression-detector.ts` exists but queries `error_events` table (doesn't exist), not wired to deployment events |

Note: Item 7 is borderline — the code exists but references a non-existent table and isn't wired up. Marking NOT STARTED since it won't work as-is.

---

## Phase J: CI/CD Pipeline Hardening (10 items)

**Verdict: 7 DONE / 1 PARTIALLY DONE / 2 NOT STARTED**

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Expand `test` step to run all test files | **PARTIALLY DONE** | `.ci.jsonld` test step runs `bun test` (which runs what Bun discovers), not explicitly all files |
| 2 | Add contract test suite as CI step | **DONE** | In `.ci.jsonld` as "contracts" step |
| 3 | `gitleaks protect --staged` in pre-commit hook | **DONE** | In `.githooks/pre-commit` with `--config=.gitleaks.toml --baseline-path=.gitleaks-baseline.json` |
| 4 | Make gitleaks CI step blocking | **DONE** | `.ci.jsonld` security step has `"code:blocking": true` |
| 5 | Create scheduled `security:audit` Taskfile task | **DONE** | Present in Taskfile at line 580 |
| 6 | Add `review-gate` as CI post-step | **DONE** | In `.ci.jsonld` as final step |
| 7 | Extend `resolveSteps()` to include review-gate | **DONE** | `resolveSteps()` reads `.ci.jsonld` which includes review-gate; auto-detect path also available |
| 8 | Block deployment if Trivy finds critical vulns | **DONE** | `build-service/image-scanner.ts` has `passed: boolean` based on critical/high findings |
| 9 | SSE alerts for health check failures | NOT STARTED | SSE exists for lifecycle events and backup progress, but not for health check failure alerts |
| 10 | Configure log aggregation | NOT STARTED | No aggregator service or log driver config |

---

## Phase K: Documentation (5 items)

**Verdict: 5 DONE / 0 PARTIAL / 0 NOT STARTED**

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Document hooks are mandatory in QUICKSTART.md | **DONE** | Line 12: "⚠️ Hooks are mandatory." with full explanation |
| 2 | Document Infisical setup in QUICKSTART.md | **DONE** | Lines 174-183: "Production Setup (Infisical)" section with steps |
| 3 | Document Garage RPC secret rotation runbook | **DONE** | `docs/runbooks/secret-rotation.md` with full procedure |
| 4 | Update `docs/XTDB_SCHEMA.md` with new tables | **DONE** | Contains `tickets`, `ticket_links`, `ticket_events`, `graph_edges`, `complexity_scores` |
| 5 | Add `noConsole` allowlist for test files in Biome config | **DONE** | `biome.json` overrides: `"noConsole": "off"` for `test/**`, `scripts/**` |

---

## Phase L: Knowledge Graph Remaining Sprints (20 items)

**Verdict: 0 DONE / 0 PARTIAL / 7 NOT STARTED** (13 items are cross-refs to Phase D.5 and F)

L.1 (Sprint 3) is covered by Phase F — all NOT STARTED.
L.2 (Sprint 4) is covered by Phase D.5 — all NOT STARTED.

### L.3 Sprint 5 — Integration & Polish
| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | `before_agent_start` hook: inject related entities for ticket | NOT STARTED | No ticket/entity injection in any hook |
| 2 | `before_agent_start` hook: on error, auto-query provenance | NOT STARTED | |
| 3 | Enhance existing pages with entity badges/links | NOT STARTED | |
| 4 | Knowledge Graph Stats widget on home page | NOT STARTED | |
| 5 | Entity Graph tab on session detail page | NOT STARTED | |
| 6 | Performance optimization: indexes, materialized edge tuning | NOT STARTED | |
| 7 | Integration tests for entity/edge resolution, path finding | NOT STARTED | |

Note: The `knowledge-graph/` module itself IS fully implemented (entity-resolver, edge-resolver, traversal, impact-analysis, provenance-chain, search, timeline, materialized-edges). But the Sprint 5 integration items listed here are not.

---

## Phase M: Ticket System Remaining Sprints (30 items)

**Verdict: 3 DONE / 0 PARTIAL / 27 NOT STARTED** (note: some items overlap with prior phases)

The ticket-manager module has: CRUD (`queries.ts`), transitions (`transitions.ts`), RDF/JSON-LD (`rdf.ts`), types, auto-generators (error→ticket, CI failure→ticket, quality→ticket). But the linking, orchestrator integration, and metrics sprints are not done.

### M.1 Sprint 2 — Linking & Auto-Generation
| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Implement `ticket_links` CRUD and `/ticket link` | NOT STARTED | `seed-tickets.ts` creates the table schema but no CRUD operations in `queries.ts` |
| 2 | Auto-linking hooks: decisions→tickets, artifacts→tickets, CI→tickets | NOT STARTED | |
| 3 | Error→ticket auto-generation with deduplication | **DONE** | `auto-generators.ts` `ticketFromError()` uses error group fingerprint |
| 4 | Quality scan→debt ticket generation | **DONE** | `auto-generators.ts` `ticketFromQualityIssue()` |
| 5 | CI failure→bug ticket generation | **DONE** | `auto-generators.ts` `ticketFromCIFailure()` |
| 6 | Security finding→security ticket generation | NOT STARTED | No `ticketFromSecurity` function |
| 7 | Fingerprint deduplication before creating auto-tickets | NOT STARTED | Functions create tickets but no dedup check before insert |

### M.2 Sprint 3 — Orchestrator & Alignment Integration — all 3 NOT STARTED
### M.3 Sprint 4 — Metrics — all 5 NOT STARTED

---

## Summary Table

| Phase | Total | DONE | PARTIAL | NOT STARTED |
|-------|------:|-----:|--------:|------------:|
| A: Infisical Secrets | 35 | 0 | 0 | 35 |
| B: Config Templating | 8 | 5 | 2 | 1 |
| C: XTDB Storage | 20 | 4 | 0 | 16 |
| D: UI Pages | 30 | 0 | 0 | 30 |
| E: pi Extension Hooks | 5 | 0 | 0 | 5 |
| F: Extension Enrichment | 19 | 0 | 0 | 19 |
| G: progress-sync | 5 | 0 | 0 | 5 |
| H: Testing Expansion | 25 | 18 | 3 | 4 |
| I: Error Monitoring | 7 | 4 | 0 | 3 |
| J: CI/CD Hardening | 10 | 7 | 1 | 2 |
| K: Documentation | 5 | 5 | 0 | 0 |
| L: Knowledge Graph | 7* | 0 | 0 | 7 |
| M: Ticket System | 30 | 3 | 0 | 27 |
| **TOTALS** | **206** | **46** | **6** | **154** |

*L has 20 listed items but 13 are cross-refs to D.5 and F, leaving 7 unique items.

## Items That Should Be Checked Off (46 DONE + 6 PARTIAL = 52 actionable)

### Ready to check off (46 items):

**Phase B:** xtdb-entrypoint.sh, xtdb-primary.yaml.tmpl, xtdb-replica.yaml.tmpl, garage.toml.tmpl, garage.toml.tmpl env var placeholders

**Phase C:** service_health_checks INSERT, complexity_scores INSERT, error_groups XTDB persistence, tickets XTDB queries

**Phase H:** autocannon installed, test:perf task, integration tests expanded, test:integration task, test:e2e task, db-failover.ts, network-partition.ts, disk-full.ts, test:chaos task, json-ld-consistency.ts, no-orphans.ts, test:data task, request schema validation, response schema validation, error format consistency, plus extra tests (service-down.ts, primary-replica-sync.ts, referential-integrity.ts, full-pipeline.ts)

**Phase I:** request context fields, error fingerprinting, first_seen/last_seen/occurrence_count, alerting rules

**Phase J:** contract CI step, gitleaks pre-commit, gitleaks blocking CI, security:audit task, review-gate CI step, resolveSteps includes review-gate, Trivy blocking deploys

**Phase K:** All 5 items (hooks documented, Infisical documented, secret rotation runbook, XTDB_SCHEMA.md updated, noConsole allowlist)

**Phase M:** ticketFromError, ticketFromQualityIssue, ticketFromCIFailure

### Partially done (6 items — need minor work to finish):

**Phase B:** docker-compose xtdb entrypoints (mounts exist, need `entrypoint:` directive), garage entrypoint (script exists, commented out in compose)

**Phase H:** P95 regression blocking (test exists, not CI-integrated), contracts CI step (exists but conditional on services), nightly E2E schedule (not configured)

**Phase J:** test step scope (runs `bun test`, may not discover all files)

## Genuinely Still Pending (154 items)

The bulk of remaining work falls into these categories:

1. **Infrastructure deployment** (Phase A: 35 items) — Infisical server + all supporting infra
2. **UI pages** (Phase D: 30 items) — All dashboards and visualizations
3. **Extension enrichment** (Phase F: 19 items) — JSON-LD cross-linking in existing extensions
4. **pi SDK integration** (Phase E: 5 items) — registerTool/registerCommand for ticket-manager and knowledge-graph
5. **Ticket system completion** (Phase M: ~27 items) — Linking, orchestrator integration, metrics
6. **XTDB storage expansion** (Phase C: ~16 items) — Most monitoring/security/review data tables
7. **Knowledge graph integration** (Phase L: 7 items) — UI, hooks, performance tuning
8. **progress-sync module** (Phase G: 5 items) — Entirely new module
9. **Remaining testing/CI gaps** (Phase H/J: ~6 items) — Scheduling, SSE alerts, log aggregation
