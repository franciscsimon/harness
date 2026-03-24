# PROGRESS.md Reality Check

**Date:** 2026-03-24  
**Compared:** `PROGRESS.md` vs the current repository state  
**Method:** inspected repo structure, config files, CI, hooks, schema seed file, service entrypoints, tests, and planned directories/modules named in `PROGRESS.md`.

---

## Executive Summary

`PROGRESS.md` is mostly a **roadmap / design document**, not a reflection of implemented work after Phase 0.

### High-level verdict
- **Phase 0:** matches reality. The audit/prevention-plan deliverables exist.
- **Phase 1:** the major gaps described are still real, but **"NOT STARTED" is slightly too absolute** because some foundations already exist.
- **Phases 2, 4, 7, 8:** mostly aspirational at the repo level. The named new modules/directories are not present.
- **Phases 3, 5, 6:** partially different from the document because the repo already has meaningful groundwork in monitoring, testing, and error capture.

### Biggest factual mismatch
The largest concrete mismatch is the **XTDB table count**:
- `PROGRESS.md` still reasons from a **27-table baseline**.
- The current repo already defines **30 tables** in `scripts/seed-schema.ts`.
- The 3 extra existing tables missing from the Phase 7/8 count sections are:
  - `ci_runs`
  - `builds`
  - `docker_events`

That means:
- Phase 7 would grow the schema from **30 → 33**, not 27 → 30.
- Phase 8 would grow the schema from **33 → 34**, not 30 → 31.

---

## 1. What Matches `PROGRESS.md`

## Phase 0 — Completed deliverables are present
The following files exist exactly as the document says:
- `harness-comprehensive-quality-report.md`
- `harness-code-quality-report.md`
- `harness-code-quality-report-v2.md`
- `harness-duplication-report.md`
- `AUDIT_REPORT.md`
- `harness-quality-prevention-plan.md`

## Phase 1 — The core hardening gaps are real
The repo still confirms the main Phase 1 problems:

### 1.1 Pre-commit is still non-blocking
Evidence: `.githooks/pre-commit`
- The hook still ends with `exit 0`
- The header comment still says it "WARNS but does NOT block commits"

### 1.2 Biome rules are still warnings
Evidence: `biome.json`
These rules are still `"warn"`, not `"error"`:
- `noExplicitAny`
- `noEmptyBlockStatements`
- `noConsole`
- `noFloatingPromises`
- `noMisusedPromises`
- `noAccumulatingSpread`

### 1.3 CI is still too small
Evidence: `.ci.jsonld`
- Only one step exists: `test`
- It only runs `test/pure-functions.ts`
- No lint step
- No typecheck step
- No contract/integration test step

### 1.4 Structured logging is not adopted
Evidence:
- No `lib/logger.ts`
- No `pino` dependency found in repo packages
- A code-only scan still finds about **440 `console.*` calls** across repo JS/TS files

### 1.5 Input validation is still missing
Evidence:
- No `valibot`
- No `zod`
- No validation middleware/schema layer found around Hono routes

### 1.6 Infisical/secrets management is not implemented
Evidence:
- No `infisical`, `infisical-db`, or `infisical-redis` services in `docker-compose.yml`
- No Infisical route in `caddy/Caddyfile`
- `lib/db.ts` still hardcodes `password: "xtdb"`

### Hardcoded XTDB password inventory still checks out
A code-only scan confirms the Phase 1.6 inventory is still accurate for this category:
- **20 files**
- **23 occurrences** of `password: "xtdb"`

---

## 2. Where Repo Reality Differs from `PROGRESS.md`

These are the most important places where the repo is either **ahead of**, **different from**, or **inconsistently described by** `PROGRESS.md`.

| Topic | `PROGRESS.md` says | Repo reality | Assessment |
|---|---|---|---|
| Phase 1 overall | `Foundation Hardening (NOT STARTED)` | Some scaffolding already exists (`hooks:install`, `check:ci`, `lib/errors.ts`, existing UI pages, existing tests) | **Partially understated** |
| 1.4 structured logging scope | "Migrate the 5 services" but lists `event-api, ops-api, harness-ui, ci-runner, docker-event-collector, build-service` | That list contains **6** items, not 5 | **Internal inconsistency in doc** |
| 1.5 input validation scope | "all Hono route handlers across the 5 API services" | The repo has **7 Hono server entrypoints**: `harness-ui/server.ts`, `web-chat/server.ts`, `xtdb-event-logger-ui/server.ts`, `build-service/server.ts`, `docker-event-collector/server.ts`, `xtdb-ops-api/server.ts`, `ci-runner/server.ts` | **Scope understated** |
| CI capability | Phase 1.3 frames lint/typecheck as absent work | `.ci.jsonld` is minimal, but `ci-runner/pipeline.ts` already knows how to auto-detect `npx biome ci .` and `npx tsc --noEmit` when no explicit CI file overrides it | **Groundwork already exists** |
| Monitoring UI | Later phases propose adding monitoring surfaces | `harness-ui` already has `pages/ops.ts`, `pages/docker-events.ts`, `pages/errors.ts`, `pages/ci-runs.ts`, `pages/builds.ts`, `pages/deploys.ts`, `pages/graph.ts` | **Not greenfield** |
| Testing | Extended testing is described as future work | The repo already has **17 TypeScript test files**, including contract, integration, lifecycle, security, smoke, WS, and handler tests | **Testing exists but is underused in CI** |
| Error monitoring | Phase 6 reads like a future capability | `lib/errors.ts` exists now, the `errors` table exists now, and `harness-ui/pages/errors.ts` exists now | **Phase 6 already has a base layer** |
| Graph foundation | Phase 8 introduces a knowledge-graph layer | The repo already has `scripts/parse-call-graph.ts`, `data/call-graph.jsonld`, and a `/graph` UI page | **Phase 8 has pre-existing groundwork** |
| Table counts | 27 → 30 with tickets, then 30 → 31 with `graph_edges` | Current baseline is already **30** without tickets/graph_edges | **Major factual mismatch** |
| Existing work-tracking tables | Phase 7 context highlights `test_runs`, `releases`, `deployments` for CI/work results | Actual schema already also includes `ci_runs` and `builds` | **Context incomplete** |

---

## 3. Concrete Gaps Still Open

This section lists the biggest gaps that are still truly open relative to the roadmap.

## Phase 1 gaps still open
- `.githooks/pre-commit` still non-blocking
- `hooks:install` is **not** wired into `setup` or `setup:all`
- `QUICKSTART.md` does **not** document hooks as mandatory
- `biome.json` warning-level rules are not promoted
- `.ci.jsonld` is still a single-test pipeline
- No root `tsconfig.json`
- No `lib/logger.ts`
- No `pino`
- No route validation library (`valibot` / `zod`)
- No Infisical services or bootstrap files

## Phase 2 gaps still open
Missing planned modules/services:
- `review-gate/`
- complexity tracking from the roadmap
- ADR enforcement mechanism from the roadmap
- style enforcement beyond current baseline tooling

## Phase 3 gaps still open
Monitoring exists, but the specific planned pieces do not:
- No `health-prober/`
- No Docker resource polling (`docker stats`-style collection not found)
- No `lib/api-metrics.ts`
- No query timing wrapper in `lib/db.ts`

## Phase 4 gaps still open
- No `gitleaks` integration in pre-commit or CI
- No `trivy` integration in `build-service/`
- No `log-scanner/`
- No `lib/rate-limiter.ts`
- No automated dependency audit flow wired as described

## Phase 5 gaps still open
There is already a lot of testing, but these planned areas are still missing:
- No performance framework using `autocannon`
- No chaos testing harness
- No data-integrity test layer as described in roadmap
- No consumer-driven contract framework beyond the current contract scripts
- Existing tests are not broadly enforced in CI

## Phase 6 gaps still open
Existing error capture is only a base layer. Missing from roadmap:
- No `lib/error-groups.ts`
- No `lib/error-classifier.ts`
- No fingerprint-based grouping
- No occurrence counting / dedup model
- No ticket auto-generation from errors
- No quality-hooks enforcement for `captureError()` adoption

## Phase 7 gaps still open
Missing planned ticket/progress system pieces:
- No `ticket-manager/`
- No `progress-sync/`
- No `tickets`, `ticket_links`, or `ticket_events` tables in `scripts/seed-schema.ts`
- No native ticket UI pages in `harness-ui/`

## Phase 8 gaps still open
- No `knowledge-graph/`
- No `graph_edges` table
- No graph materialization/rebuild logic described in roadmap
- No graph traversal APIs/modules described in roadmap

---

## 4. Specific Corrections `PROGRESS.md` Should Make

If `PROGRESS.md` is updated to match the current repo more closely, these are the most important corrections.

### Correction 1 — Table counts are stale
Current baseline from `scripts/seed-schema.ts` is **30 tables**, not 27.

Current actual tables include the 27 older/core tables **plus**:
- `ci_runs`
- `builds`
- `docker_events`

### Correction 2 — Phase 7 table math should change
If ticketing is added to the current repo state:
- current: **30**
- plus `tickets`, `ticket_links`, `ticket_events`: **33**

### Correction 3 — Phase 8 table math should change
If `graph_edges` is added after tickets:
- current actual: **30**
- with Phase 7 ticket tables: **33**
- with `graph_edges`: **34**

### Correction 4 — Phase 1 is not purely "not started"
A more accurate label would be something like:
- **"not complete"**
- **"planned but partially scaffolded"**

Why:
- `Taskfile.yml` already has `hooks:install`
- `Taskfile.yml` already has `check:ci`
- `ci-runner/pipeline.ts` already supports auto-detected lint/typecheck
- `lib/errors.ts` already exists
- there is already meaningful UI for ops/errors/graph/CI/builds
- there is already a substantial test suite

### Correction 5 — Service counts/scope should be fixed
- Phase 1.4 says **5 services** but lists **6**
- Phase 1.5 says **5 API services**, but the repo currently has **7 Hono server entrypoints**

---

## 5. Practical Status Update, If Written Today

If the document were rewritten strictly from repo reality, the shortest accurate summary would be:

- **Phase 0:** complete and present
- **Phase 1:** major issues still open, but some prerequisites/foundations already exist
- **Phase 2:** mostly not implemented at the planned module level
- **Phase 3:** partially implemented foundations already exist in collector + UI, but key metrics layers are missing
- **Phase 4:** mostly not implemented
- **Phase 5:** significant test assets already exist, but the roadmap still needs CI wiring and the advanced suites
- **Phase 6:** partial base implementation already exists (`lib/errors.ts` + errors table + errors UI), but grouping/classification/ticketing are missing
- **Phase 7:** not implemented
- **Phase 8:** not implemented, though graph groundwork already exists

---

## Bottom Line

`PROGRESS.md` is directionally useful, but it currently mixes three different things:
1. **historical audit outputs** that are real,
2. **future roadmap items** that are mostly still unbuilt,
3. **current-state assumptions** that are now partly stale.

The repo today is best described as:
- **Phase 0 done**
- **Phase 1 not finished**
- **Phases 2-8 mostly planned**
- **with more existing scaffolding in testing, monitoring, error capture, and graph UI than the document currently gives credit for**.
