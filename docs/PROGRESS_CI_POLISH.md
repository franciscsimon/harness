# CI Runner Polish — Remaining Tasks

> Status: Core pipeline works end-to-end, 4 polish tasks remain
> Last updated: 2026-03-22

## What Works ✅
- Soft Serve at :23231/:23232 with harness repo
- CI runner: queue → clone via SSH → Docker steps → XTDB recording
- ci_runs table seeded, QLever export wired, SPARQL query card added
- Soft Serve in System Health

## Remaining Tasks

### 1. Fix enqueue.sh path in Soft Serve hook (5 min)
**Problem:** Hook expects `/opt/harness/ci-runner/enqueue.sh` but script is at `/opt/enqueue.sh`.
**Fix:** Update hook's `ENQUEUE_PATH` default OR copy enqueue.sh to the expected path. The enqueue.sh also needs to write to a queue dir accessible from the host (the runner runs on host, not in container). 
**Best approach:** The hook should write the job file to a shared volume, or use `docker exec` to notify the host runner. Simplest: mount a shared volume for the queue directory between Soft Serve container and host.

### 2. Fix .ci.jsonld pipeline to pass (10 min)
**Problem:** `npm ci` in `node:22-slim` fails — the container needs the project's node_modules.
**Root cause:** The Docker step runs in isolation. `npm ci` downloads all deps from scratch which is slow and may fail on native modules.
**Options:**
- A) Use `node:22` (full) instead of `node:22-slim` — more tools, but heavier
- B) Skip `npm ci` — the cloned repo already has the code, tests use `npx jiti` which auto-resolves
- C) Mount host `node_modules` into the container (breaks isolation)
**Recommendation:** B — change commands to just `npx jiti test/pure-functions.ts` since jiti handles TS compilation. For a real project, A is better.

### 3. SSE notification on CI completion (30 min)
**Problem:** CI results only go to XTDB. No real-time notification.
**What to build:**
- After `recordCIRun()` in runner.ts, POST to Event API `/api/events/stream` or a new `/api/ci/notify` endpoint
- Event API emits SSE event with type `ci_run` containing repo, status, duration
- harness-ui `/stream` page already listens to SSE — CI events will appear automatically
**Simplest approach:** POST a JSON event to `:3333/api/events` (if it accepts POSTs) or directly emit via the XTDB event system. Alternative: runner.ts does a simple `fetch("http://localhost:3333/api/ci-notify", { method: "POST", body: JSON.stringify(result) })`.

### 4. CI Runs page in harness-ui (30 min)
**What to build:** `harness-ui/pages/ci-runs.ts` — table of CI runs from `/api/ci-runs` endpoint
**Columns:** Repo, Commit (short hash), Status (✅/❌), Steps (passed/failed), Duration, Time
**API needed:** Add `getCIRuns()` to `xtdb-event-logger-ui/lib/db.ts`, expose via `/api/ci-runs` endpoint
**Nav:** Add "CI" link between Graph and Chat

## Implementation Order

| # | Task | Est. | Depends on |
|---|------|------|-----------|
| 1 | Fix .ci.jsonld to pass | 10 min | — |
| 2 | Fix enqueue.sh path + shared queue | 15 min | — |
| 3 | Add /api/ci-runs + CI Runs page | 30 min | — |
| 4 | SSE notification on CI complete | 20 min | Task 3 |
| **Total** | | **~1h 15min** | |
