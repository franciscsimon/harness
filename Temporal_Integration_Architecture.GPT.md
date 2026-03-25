# Temporal Integration Architecture — Reality Check & Gap Report

**Date:** 2026-03-24  
**Reviewed file:** `Temporal_Integration_Architecture.md`  
**Method:** compared the proposal against the current repository structure, package layout, Docker Compose, Caddy config, extension code, CI hook flow, schema seed file, and existing observability/monitoring code.

---

## Executive Summary

`Temporal_Integration_Architecture.md` is a **much better architecture proposal than the original “replace the extensions” idea**. The core correction is sound:

- pi extensions **must stay in-process**
- Temporal should be treated as **durable orchestration infrastructure**, not as a replacement for pi hooks
- `before_agent_start`, `appendEntry`, tool registration, and TUI/UI behavior correctly remain inside pi

However, there are two major classes of gaps:

1. **Implementation gap:** none of the Temporal/OTEL infrastructure described in the document exists in the repo yet.
2. **Architecture gap:** the document leaves several operational details unspecified, especially around dependency placement, schema migration, fallback reconciliation, security of Temporal payloads, hot-path query behavior, and deployment fit with the current harness stack.

The document is therefore best read as a **forward-looking design**, not a description of the current system.

---

## What the Document Gets Right

These parts are directionally correct and match the current architecture constraints:

- **Extensions are in-process hooks, not replaceable services.** This matches the actual extension model used by `orchestrator/`, `agent-spawner/`, and `workflow-engine/`.
- **`appendEntry` still matters.** The current extensions restore state from session entries, so the proposal is right to keep a pi-native state reference even when durable orchestration moves elsewhere.
- **System prompt injection must stay local.** `before_agent_start` is currently the right place for orchestrator/workflow prompt injection.
- **`delegate` remains a pi tool.** The proposal correctly keeps the tool boundary in pi and moves only the durable execution behind it.
- **`ci-runner` is the easiest migration candidate.** It is already a standalone process, so it is the cleanest place to introduce Temporal first.

---

## Repo Reality Check

## 1. Temporal is not implemented anywhere yet

The repo currently contains **no Temporal runtime integration**:

- no `temporal-worker/` directory
- no `temporal`, `temporal-db`, or `temporal-ui` services in `docker-compose.yml`
- no `@temporalio/client`
- no `@temporalio/worker`
- no `@temporalio/workflow`
- no Temporal references in:
  - `orchestrator/index.ts`
  - `agent-spawner/index.ts`
  - `workflow-engine/index.ts`
  - `ci-runner/`

**Assessment:** the document is purely architectural at this point; none of the Temporal migration steps have been started in code.

---

## 2. OTEL / Grafana / Tempo / Prometheus are also not implemented

The observability stack proposed in the document does not exist in the repo:

- no `observability/` directory
- no OTEL collector config files
- no Tempo config
- no Prometheus config
- no Grafana provisioning files
- no `@opentelemetry/*` dependencies found in repo package manifests

**Assessment:** the OTEL section is design-only, not current reality.

---

## 3. The current extensions are still local-state implementations

Current code status:

- `orchestrator/index.ts` still stores tasks in memory and restores only session-local state.
- `agent-spawner/index.ts` still runs direct subprocess delegation via `spawn("pi", ...)`.
- `workflow-engine/index.ts` still uses local workflow state plus `appendEntry` restoration.
- `ci-runner/runner.ts` still uses the file queue / polling loop model.

**Assessment:** the proposed “thin Temporal client” model has not replaced any of the current logic yet.

---

## 4. The CI hook flow in the document does not match the current deployment shape

The document proposes replacing the Soft Serve post-receive hook with a TypeScript client that starts a Temporal workflow directly.

Current repo reality:
- `ci-runner/hooks/post-receive` is a **bash script**
- it uses `wget` to POST to `harness-ui/api/ci/enqueue`
- the current pipeline trigger flow is still **hook → HTTP enqueue → queue file → runner polling loop**

**Gap:** the proposal does not explain how the Soft Serve hook environment would run Node/TypeScript or ship `@temporalio/client`. In the current repo, the hook contract is shell-based, not Node-based.

---

## 5. The Docker Compose section is not merge-ready with the actual stack

The document says to replace the Compose section with Temporal + OTEL infrastructure.

Current repo already has a larger stack than the document reflects, including:
- `health-prober`
- `infisical-db`
- `infisical-redis`
- `infisical`
- `soft-serve`
- `zot`
- `qlever`
- existing app services and XTDB infra

Additional fit issues:
- the proposal uses `networks: harness`, but the current `docker-compose.yml` does **not** define that network
- the proposal exposes many new host ports (`7233`, `8233`, `4317`, `4318`, `8888`, `8889`, `3200`, `9090`, `3001`) without explaining how that fits the current reverse-proxy / local-access pattern
- `caddy/Caddyfile` currently only routes `/ws` to chat and everything else to `harness-ui`

**Gap:** the Compose section is a conceptual snippet, not something that can be dropped into the current repo without a full merge and routing plan.

---

## 6. The document understates the current observability baseline

The doc says:
> “The harness currently has one observability layer (XTDB events).”

That is no longer true in the current repo.

Existing observability/monitoring infrastructure already present:
- `lib/logger.ts` — structured logging via Pino
- `lib/request-logger.ts`
- `lib/api-metrics.ts`
- `lib/rate-limiter.ts`
- `lib/query-timer.ts`
- `lib/error-groups.ts`
- `health-prober/index.ts`
- `harness-ui/server.ts` monitoring/security/quality/ticket/graph routes

Current schema seed (`scripts/seed-schema.ts`) already includes monitoring/quality tables such as:
- `service_health_checks`
- `container_metrics`
- `slow_queries`
- `api_metrics`
- `error_groups`
- `review_reports`
- `complexity_scores`
- `graph_edges`

The current seed file defines **42 tables** total.

**Assessment:** the document’s baseline description is stale. Temporal + OTEL would be an addition to an already-expanded observability stack, not the first observability system after XTDB events.

---

## 7. Dependency placement is underspecified for this repo’s package layout

The document says things like:
- “Add `@temporalio/client` to harness package.json”
- “Add `@opentelemetry/api` to harness package.json”

But this repo is not a single-package app. It has many package boundaries, including:
- `orchestrator/package.json`
- `agent-spawner/package.json`
- `workflow-engine/package.json`
- `ci-runner/package.json`
- `harness-ui/package.json`
- many other extension/service packages

**Gap:** the dependency plan is too coarse. It needs to specify **which package** gets which dependency, or whether the repo is expected to consolidate dependency resolution another way.

---

## 8. The document proposes XTDB correlation fields but not the schema migration

The doc proposes storing things like `temporal_workflow_id` to bridge Temporal and XTDB.

Current reality:
- `scripts/seed-schema.ts` does **not** define `temporal_workflow_id`
- current tables such as `delegations`, `workflow_runs`, `workflow_step_runs`, and `ci_runs` do not include Temporal correlation columns

**Gap:** the document describes the desired correlation model, but not the actual schema migration plan required to support it.

---

## Architecture Gaps Inside the Document

These are important design gaps even if implementation has not started yet.

## 1. No shared Temporal client / connection lifecycle strategy

The document shows separate Temporal client setup inside:
- `orchestrator`
- `agent-spawner`
- `workflow-engine`

Because all of these run inside the same pi process, the design should specify:
- whether they share a singleton connection
- how reconnection/backoff works
- whether connection failures should trip a circuit breaker
- how many gRPC connections the pi process is allowed to open

**Gap:** connection management is shown per-extension, but not designed as a shared in-process resource.

---

## 2. `before_agent_start` is a hot path, but timeout/fail-open behavior is not defined

The proposal has extensions query Temporal during `before_agent_start`.

That hook is latency-sensitive. If Temporal is slow or unavailable, agent startup could block.

Missing details:
- max query timeout
- cached state fallback behavior
- fail-open vs fail-closed behavior
- what happens if `workflowId` exists in `appendEntry` but the workflow no longer exists in Temporal

**Gap:** the architecture is correct conceptually, but the operational behavior of the synchronous query path is unspecified.

---

## 3. Progress streaming back into tool UI is hand-waved

In the `delegate` design, the document says the tool will “poll for completion with progress updates back to pi”, but the actual mechanism is not defined.

Missing details:
- how heartbeats become `onUpdate(...)` events
- polling interval and backoff
- when partial output is shown
- what UX appears if a workflow retries and restarts the child session

**Gap:** the doc defines durable execution, but not the user-visible progress model inside pi.

---

## 4. Child-process correlation is still incomplete

The OTEL ↔ XTDB section proposes storing `temporal_workflow_id`, which is good, but it still does not fully define how the spawned child `pi --mode json` process learns that identity.

Missing details:
- pass `workflowId` into the child process environment or args
- pass OTEL trace context into the child process
- make child XTDB emissions correlation-aware

Without that, only the worker knows the Temporal workflow ID; the child pi session’s own events remain weakly linked.

**Gap:** correlation is described at the database layer, but not fully propagated into the child runtime.

---

## 5. Local fallback reconciliation is not defined

The document correctly proposes dual-mode behavior:
- Temporal mode when available
- local mode when not available

But it does not answer the hardest operational case:

**What happens if a workflow is already running in Temporal, then the Temporal server goes away, and the extension falls back locally?**

Missing details:
- whether local execution is allowed for already-Temporal-owned work
- whether the local session becomes read-only
- whether local changes are reconciled back later
- whether fallback is only allowed for new work, not in-flight work

**Gap:** the fallback idea is good, but the reconciliation model is missing.

---

## 6. Worker concurrency and backpressure are not specified

The Temporal worker is proposed as the thing that:
- spawns `pi --mode json`
- executes Docker CI steps
- writes to XTDB

That is a heavy mix of workloads.

Missing details:
- max concurrent activities
- separate worker processes per task queue vs one combined worker
- per-queue isolation (`agent-execution` vs `ci-pipeline` vs `xtdb-persistence`)
- resource guardrails so CI does not starve agent delegation or vice versa

**Gap:** the task queues are named, but the actual concurrency/backpressure plan is absent.

---

## 7. Temporal payload security is not addressed

Temporal stores workflow/activity inputs and outputs in its persistence layer and surfaces them in the UI/API.

This architecture passes sensitive material such as:
- user tasks
- code-related prompts
- agent outputs
- possibly environment/context details

Missing details:
- payload encryption / codec / data converter
- redaction policy for prompts and outputs
- whether Temporal UI access is authenticated and scoped

**Gap:** this is a major production concern and should be in the architecture document.

---

## 8. OTEL bootstrap inside pi is not designed carefully enough

The doc suggests adding OTEL SDK usage to pi extensions. But those extensions all run inside the **same process**.

Missing details:
- one-time global SDK initialization vs per-extension initialization
- preventing duplicate exporters/processors
- where bootstrap lives
- shutdown/flush lifecycle when pi exits

**Gap:** per-extension OTEL spans are attractive, but the doc does not address how to safely initialize OTEL once in a shared process.

---

## 9. Cancellation semantics for spawned child pi sessions are incomplete

The activity example kills the child process with `SIGTERM` when Temporal cancels.

Missing details:
- grace period before `SIGKILL`
- cleanup of child subprocess trees
- how partial output is captured on cancellation
- whether cancellation is recorded into XTDB distinctly from generic failure
- whether a cancelled child session should be marked differently than a crashed one

**Gap:** cancellation exists in the concept, but not as a full operational lifecycle.

---

## 10. UI integration is underdesigned

The architecture adds:
- Temporal UI
- Grafana
- Tempo
- Prometheus

But it does not explain how this fits the current harness UX.

Missing details:
- whether these are standalone admin tools only
- whether harness-ui links to them
- whether Caddy should proxy them
- auth model for each surface
- health/status visibility in `harness-ui`

**Gap:** the infra is proposed, but the operator workflow is not.

---

## 11. Compose replacement would regress current services if applied literally

The doc says “Replace the previous Docker Compose section with this expanded version”, but the example sections focus only on Temporal + OTEL and omit currently present services and newer infrastructure.

**Gap:** this should be framed as a **merge plan**, not a direct replacement snippet.

---

## Most Important Corrections to Make in the Document

If `Temporal_Integration_Architecture.md` is revised, the most valuable improvements would be:

1. **State clearly that this is not implemented yet.**
2. **Update the observability baseline section** to reflect the current repo state:
   - Pino logging
   - request logging
   - API metrics
   - query timing
   - error grouping
   - health prober
   - monitoring/security/quality/ticket/graph UI pages
3. **Add a package-by-package dependency plan** instead of “add to harness package.json”.
4. **Add a schema migration appendix** for Temporal correlation fields.
5. **Add a Temporal query timeout/cache/fail-open policy** for `before_agent_start`.
6. **Add a fallback reconciliation policy** for in-flight workflows.
7. **Add a worker concurrency/isolation section**.
8. **Add a payload security section** covering Temporal data exposure.
9. **Add a real deployment merge plan** for `docker-compose.yml`, Caddy, and auth.
10. **Add an OTEL-in-pi bootstrap section** so instrumentation is initialized once, not ad hoc per extension.

---

## Bottom Line

The revised Temporal architecture is **conceptually strong** because it finally respects pi’s real boundary: **pi remains the runtime, Temporal becomes the durable orchestrator**.

But today it has two big problems:
- it is **not implemented in the repo at all**, and
- it is written against a **stale baseline** that underestimates how much observability, monitoring, schema growth, and UI surface the harness already has.

So the right conclusion is:

> **Good architecture direction, but it still needs a repo-aware migration plan and several missing operational/security details before it is implementation-ready.**
