# Function Lifecycle Tracking — Implementation Summary

> Last updated: 2026-03-21
> Status: Research complete, ready for implementation
> Related: `docs/PROPOSAL_CALL_GRAPH.md`, `docs/TODO_TEST_COVERAGE_GRAPH.md`

---

## Goal

Track every function from first creation through changes to decommissioning, driven by changing requirements. When a file changes, identify which functions were affected and calculate the blast radius through the call graph. Beyond structural tracking, detect resilience antipatterns — silent error swallowing, missing timeouts, type safety erosion, partial failure vulnerabilities — that the AST makes visible but no human consistently checks.

## Research Findings

### 1. Existing ontologies don't fit functional TypeScript

We evaluated five code ontologies. All are OOP-centric (Class → Method → Inheritance). The harness has **3 classes** and **304 exported functions**. The organizing unit is the ES Module (file), not the Class.

| Ontology | Problem |
|---|---|
| CodeOntology (ISWC 2017) | Package → Class → Method hierarchy, no modules |
| SEON Code Ontology (UZH) | Explicitly OOP |
| SEON (UFES, Brazil) | Process-level, not code structure |
| LLNL Call Graph Ontology | Call edges only — no structural model |
| GraphGen4Code (IBM) | Python-centric, Class as primary container |

**Reusable pieces:** LLNL's `calls`/`calledBy` naming convention. `xkos:hasPart` for containment. The `code:` namespace already adopted in `scripts/parse-call-graph.ts`.

### 2. `git log -L` is regex, not AST

We tested `git log -L :funcname:file` against the harness codebase. It uses regex heuristics from userdiff patterns — **not AST parsing**. There is no built-in TypeScript pattern.

| What | `git log -L` | AST parser |
|---|---|---|
| Top-level `function X()` | ✅ finds | ✅ finds |
| Indented/nested functions | ❌ `fatal: no match` | ✅ finds |
| `const X = () => {}` | Unreliable | ✅ finds |
| Object methods | ❌ | ✅ finds |
| Function END line | ❌ guesses | ✅ exact |
| Call edges | ❌ | ✅ |
| **Coverage** | **~66% of functions** | **100%** |

Proven on real example: `persistDelegation` (async function, indented inside handler) — git says `fatal: no match`, AST finds it immediately.

**Conclusion:** AST parsing is required for accuracy. Git provides the *trigger* (which files changed), AST provides the *analysis* (what functions exist and how they connect).

### 3. The blast radius model works

Tested two real examples from the harness:

**`lib/errors.ts` changed → 6 files in blast radius**
- Origin: 11 functions (captureError, flushErrors, startErrorCollector, etc.)
- Distance 1: 4 files (agent-spawner, artifact-tracker, web-chat, xtdb-event-logger)
- Distance 2: 1 file (agent-spawner again, via runSubagent → captureError)

**`web-chat/lib/session-pool.ts` changed → 44 files in blast radius**
- Origin: 40 functions (notify, setStatus, createPoolSession, etc.)
- Distance 1: 35 files — every extension handler calls notify()
- Distance 2: 6 files (test files, router, workflow engine)
- Distance 3: 2 files (test/test-handler::main, xtdb-event-logger::capture)

The chain: `file changed → functions in file → callers of those functions → files containing those callers → repeat`.

### 4. The harness already has most of the infrastructure

| Component | Status | What it does |
|---|---|---|
| AST call graph parser | ✅ exists | `scripts/parse-call-graph.ts` — 192 files, 675+ functions, 1042 call edges |
| QLever SPARQL endpoint | ✅ exists | Indexes all triples, queries from `/graph` page |
| Triple export pipeline | ✅ exists | `scripts/export-xtdb-triples.ts` → `data/harness-graph.ttl` |
| Decision log | ✅ exists | Records what/why/outcome with file paths |
| Requirements tracker | ✅ exists | proposed → accepted → implemented → verified → rejected |
| Test recorder | ✅ exists | Writes test results to XTDB `test_runs` table |
| Test coverage in graph | ✅ exists | `code:tests` edges, 44/292 functions tested |
| Event system | ✅ exists | 30 lifecycle events routed through XTDB |
| Git hooks | ❌ missing | Only default samples, none active |
| Incremental graph update | ❌ missing | Full re-parse required currently |
| Function lifecycle events | ❌ missing | No tracking of created/modified/deleted |
| Commit → function mapping | ❌ missing | No link from git commit to affected functions |
| Blast radius calculation | ❌ missing | Call graph exists but no tooling to walk it from a change |

---

## Architecture

### The event flow

```
git commit
  │
  ▼
.githooks/post-commit (shell script)
  │  runs: git diff --name-only HEAD~1 HEAD
  │  filters: only .ts files
  │  calls: scripts/update-graph.ts <changed-files>
  │
  ▼
scripts/update-graph.ts
  │  1. Loads stored graph state (per-file function registry)
  │  2. AST-parses ONLY the changed .ts files
  │  3. Diffs new functions vs stored functions for each file:
  │     - Function in new but not old → CREATED
  │     - Function in old but not new → DELETED
  │     - Function in both but signature/calls changed → MODIFIED
  │     - Call edges added/removed → RECONNECTED
  │  4. Emits lifecycle events as JSON-LD → XTDB
  │  5. Updates stored graph state
  │  6. Calculates blast radius from changed functions
  │  7. Logs summary to stdout
  │
  ▼
XTDB (function_events table)
  │  stores: lifecycle events with commit hash, session, decision links
  │
  ▼
export-xtdb-triples.ts + qlever-index.sh
  │  periodic: materializes all triples for SPARQL querying
  │
  ▼
QLever → /graph page
     queryable: function history, blast radius, requirement traceability
```

### The data model

Uses the existing `code:` namespace (`https://pi.dev/code/`) from `lib/jsonld/context.ts`.

#### New: Function lifecycle event (JSON-LD → XTDB)

```jsonld
{
  "@context": { /* existing JSONLD_CONTEXT */ },
  "@id": "urn:pi:fnevt:<uuid>",
  "@type": "code:FunctionEvent",
  "code:eventType": "created | modified | deleted | moved | renamed",
  "code:functionId": "urn:pi:fn:<filePath>#<functionName>",
  "code:filePath": "lib/errors.ts",
  "code:functionName": "captureError",
  "code:commitHash": "abc123def",
  "code:commitMessage": "feat: add error capture",
  "code:sessionId": "sess:<uuid>",          // if from agent session
  "code:decisionId": "dec:<uuid>",           // if decision log entry exists
  "prov:generatedAtTime": { "@type": "xsd:long", "@value": "1711000000000" },
  "code:blastRadius": 6,
  "code:affectedFiles": ["agent-spawner/index.ts", "web-chat/server.ts", ...]
}
```

#### New: Per-file function registry (stored graph state)

```json
{
  "lib/errors.ts": {
    "commitHash": "abc123",
    "functions": {
      "captureError": { "line": 45, "exported": true, "async": false, "calls": ["extractError", "ensureDir"], "params": 3 },
      "flushErrors": { "line": 78, "exported": false, "async": true, "calls": ["t", "n", "buildJsonLd"], "params": 0 }
    }
  }
}
```

Stored at: `data/function-registry.json` (committed to repo, updated by post-commit hook).

### Blast radius calculation

Walk the call graph outward from changed functions:

```
Input:  set of function IDs that changed
Output: rings of affected files at increasing distance

Ring 0: the changed file itself
Ring 1: files containing functions that CALL the changed functions
Ring 2: files containing functions that CALL Ring 1 functions
Ring N: continue until no new files found (or max depth)
```

The call graph for this walk comes from the existing `data/call-graph.jsonld` (already has `code:calls` edges between all functions).

### Linking to requirements and decisions

The connection through existing infrastructure:

```
Requirement (requirements table)
  → links to: Decision (decisions table)
    → decision has: files[] (JSON array of affected file paths)
      → file path matches: code:filePath on function nodes
        → function has: code:calls edges to other functions
          → blast radius calculable from here
```

And in reverse (from a commit):

```
Commit (from post-commit hook)
  → changed files (git diff --name-only)
    → functions in those files (function registry)
      → decisions referencing those files (SPARQL query)
        → requirements linked to those decisions (SPARQL query)
```

---

## Implementation Plan

### Phase 1: Post-commit hook + function registry (core)

**Files to create:**
- `.githooks/post-commit` — shell script, entry point
- `scripts/update-graph.ts` — incremental AST parser + diff engine
- `data/function-registry.json` — per-file function state (generated)

**What it does:**
1. post-commit hook calls update-graph.ts with list of changed .ts files
2. update-graph.ts loads function-registry.json
3. For each changed file: AST-parse → extract functions and calls → diff against registry
4. Emit created/modified/deleted events to stdout (human-readable summary)
5. Write updated function-registry.json
6. Optionally write lifecycle events to XTDB (if XTDB is running)

**Setup:**
```bash
git config core.hooksPath .githooks
chmod +x .githooks/post-commit
```

**Effort estimate:** M (2-3 hours)

### Phase 2: Blast radius calculation

**Files to modify:**
- `scripts/update-graph.ts` — add blast radius walk after detecting changes

**What it does:**
1. After detecting changed functions, load the call graph (from `data/call-graph.jsonld` or re-parse)
2. Reverse-walk `code:calls` edges from changed functions outward
3. Group affected functions by file = blast radius rings
4. Log: "Changed lib/errors.ts → blast radius: 6 files (4 at distance 1, 1 at distance 2)"
5. Identify affected test files in the blast radius

**Effort estimate:** S-M (1-2 hours)

### Phase 3: XTDB integration + QLever queries

**Files to create/modify:**
- `scripts/update-graph.ts` — write `code:FunctionEvent` JSON-LD to XTDB `function_events` table
- `scripts/export-xtdb-triples.ts` — add `function_events` to the export list
- `harness-ui/pages/graph.ts` — add SPARQL query cards for lifecycle

**New XTDB table:** `function_events`
```
_id, function_id, file_path, function_name, event_type, commit_hash,
commit_message, session_id, decision_id, blast_radius, affected_files, ts, jsonld
```

**New SPARQL queries for /graph page:**
- "Function Lifecycle" — show all events for a given function
- "Blast Radius" — given a file, show affected files and distance
- "Recently Created Functions" — functions born in last N commits
- "Recently Deleted Functions" — functions removed in last N commits
- "Most Changed Functions" — functions with the most modification events (volatility)
- "Orphaned Functions" — functions with no requirement/decision link

**Effort estimate:** M (2-3 hours)

### Phase 4: Requirement linkage

**Files to modify:**
- `scripts/update-graph.ts` — after detecting changes, query decisions table for matching file paths
- Link: function event → decision → requirement (through existing XTDB relationships)

**New SPARQL queries:**
- "Requirement → Functions" — forward traceability: which functions implement a requirement
- "Function → Requirements" — reverse traceability: which requirements drove this function
- "Unlinked Functions" — functions with no decision or requirement connection

**Effort estimate:** S-M (1-2 hours)

### Phase 5: Historical backfill

**Files to create:**
- `scripts/backfill-function-history.ts` — walk entire git history and generate lifecycle events

**What it does:**
1. `git log --reverse --format="%H %s"` — get all commits chronologically
2. For each commit: `git diff --name-only <commit>~1 <commit>` → changed .ts files
3. For each changed file: checkout at that commit, AST-parse, diff against previous
4. Emit lifecycle events backdated to the commit timestamp
5. Write all events to XTDB

**Optimization:** Only parse files that actually changed (not the full 192 at each commit). Typical commit touches 2-5 files. 210 commits × ~3 files avg = ~630 file parses.

**Effort estimate:** M-L (3-4 hours)

---

## Key Design Decisions

### D1: AST for accuracy, git for triggering
Git tells us WHICH files changed (cheap: `git diff --name-only`). AST tells us WHAT changed inside those files (accurate: full syntax tree). We never use `git log -L` for function detection — it misses 34% of functions in TypeScript.

### D2: File is the event boundary, function is the connection point
A commit changes files. Each file contains functions (the registry). Functions are connected to other functions via call edges. The blast radius propagates through these connections. The file is the unit of change detection; the function is the unit of impact analysis.

### D3: Incremental updates, not full re-parse
On each commit, re-parse only the changed files (~2-5 typically). The rest of the graph stays as-is. The function registry stores the "last known" state per file.

### D4: Use existing vocabulary and infrastructure
Use the `code:` namespace already in `lib/jsonld/context.ts`. Write to XTDB like everything else. Export to QLever via existing pipeline. Display on existing `/graph` page.

### D5: The hook is a `.githooks/` directory committed to the repo
Following git 2.9+ convention: `git config core.hooksPath .githooks`. The hook scripts are version-controlled, shared across all developers, and don't conflict with user-local hooks in `.git/hooks/`.

### D6: Blast radius includes test identification
When calculating blast radius, test files are flagged. This connects to the existing test coverage graph (44/292 tested) and answers "which tests should re-run after this change?"

---

## Dependencies

| Dependency | Status | Notes |
|---|---|---|
| TypeScript compiler API | ✅ available | Used by existing `scripts/parse-call-graph.ts` |
| XTDB | ✅ running | Existing infrastructure, 20+ tables |
| QLever | ✅ running | Existing SPARQL endpoint |
| `code:` namespace | ✅ defined | In `lib/jsonld/context.ts` |
| `data/call-graph.jsonld` | ✅ generated | By `scripts/parse-call-graph.ts` |
| Git 2.9+ | ✅ available | Required for `core.hooksPath` |

## Files Summary

| File | Action | Phase |
|---|---|---|
| `.githooks/post-commit` | Create | 1 |
| `scripts/update-graph.ts` | Create | 1-4 |
| `data/function-registry.json` | Generated | 1 |
| `scripts/export-xtdb-triples.ts` | Modify (add function_events) | 3 |
| `harness-ui/pages/graph.ts` | Modify (add query cards) | 3 |
| `scripts/backfill-function-history.ts` | Create | 5 |
| `lib/jsonld/context.ts` | Verify (code: namespace) | 1 |

## Missing Critical Pieces (Identified from Research)

The initial plan covers the *mechanics* of tracking (hook, parse, diff, store). But software engineering research on architecture erosion, coupling analysis, and system resilience identifies several things the graph *can already detect* that we're not planning to measure. These are not nice-to-haves — they're early warning signals for systemic problems.

### M1: Architecture Erosion Detection

Research finding: *"Architecture erosion manifests not only through architectural violations and structural issues but also causing problems in software quality and during software evolution. Non-technical reasons that cause AEr should receive the same attention as technical reasons."* (Li et al., 2022 — Systematic Mapping Study, 73 papers)

**What we should track over time:**
- Module coupling trend (is it increasing per commit? That's erosion)
- Circular dependency count (should decrease or stay at 0)
- Blast radius trend (are changes affecting more files over time?)

**Current state in harness:** 3 circular dependencies detected. Should be zero.

### M2: Coupling Metrics (Fan-in / Fan-out)

Research finding: *"Minimizing architecture debt is anticipated to make software less costly and more adaptable to change via decoupling level and propagation cost measures."* (Baabad et al., 2025)

**Fan-in** = how many callers a function has. High fan-in means fragile — change it and many things break.
**Fan-out** = how many things a function calls. High fan-out means it knows too much — god function.

**Current state in harness:**
- `artifact-tracker/db::typed` has 61 callers (fan-in) — extremely fragile
- `web-chat/server::onMessage` calls 32 functions (fan-out) — god function
- 53 functions have fan-out > 8
- 18 functions have fan-in > 5

These metrics should be calculated on every commit and trended. A function gaining callers over time is accumulating risk.

### M3: Dead Code Detection

**Current state:** 438 functions (51% of all defined) are never called by anything in the codebase. Many of these are extension entry points (handler, setup, execute) that are called dynamically by the pi framework — not statically detectable. But some will be genuinely dead code.

**What we should do:** Distinguish framework entry points (handler, setup, getArgumentCompletions, execute — called by convention) from truly dead code. Track dead function count over time. It should decrease, not increase.

### M4: Orphan Module Detection

**Current state:** 114 modules have nothing depending on them. Many are extension entry points (loaded dynamically). But orphan modules that are NOT entry points indicate abandoned or disconnected code.

### M5: Circular Dependency Monitoring

**Current state:** 3 circular dependencies found:
- `agent-spawner/agents ↔ agent-spawner/index` (within same package — acceptable)
- `artifact-tracker/db ↔ deployment-tracker/index` (cross-package — problematic)
- `web-chat/lib/session-pool ↔ web-chat/server` (tight coupling — known)

New circular dependencies should be flagged on commit. The hook should warn (not block) when a commit introduces a new cycle.

### M6: Change Volatility / Hotspot Detection

Research finding: Functions that change frequently are disproportionately likely to contain bugs. (Nagappan et al., "Change Bursts as Defect Predictors", ISSRE 2010)

**What we should track:** Modification count per function over time. Functions with >5 modifications in the last 20 commits are hotspots. Hotspots that also have high fan-in are critical risk — they change often AND many things depend on them.

### M7: Knowledge Loss Tracking

Research finding: *"Non-technical reasons that cause architecture erosion include knowledge loss"* — when the context for why a function exists is lost, it becomes impossible to maintain correctly.

**What we should track:**
- Functions with no linked decision or requirement (orphaned rationale)
- Functions whose last modifier is no longer active (bus factor)
- Functions with no comments AND no linked decision (zero context)

The harness decision log already captures "why" — but only if the developer uses it. Functions with no decision link are undocumented risk.

### M8: Resilience of the Tracking System Itself

**What happens when:**
- The post-commit hook fails? (Answer: commit still succeeds — hooks are informational only. But registry may be stale.)
- The function registry is corrupted? (Answer: we need a rebuild-from-scratch command.)
- XTDB is unreachable? (Answer: lifecycle events should queue locally, flush later.)
- A rebase rewrites history? (Answer: the registry is per-file, not per-commit — survives rebasing.)
- A merge conflict in function-registry.json? (Answer: registry should be regeneratable, not merge-resolved. Add to `.gitattributes` as merge=ours or regenerate on conflict.)

**Required safety mechanisms:**
1. `scripts/rebuild-registry.ts` — full AST parse of all files, regenerates function-registry.json from scratch. Use when registry is stale or corrupt.
2. The hook must NEVER block a commit. All errors → stderr warning, non-zero exit ONLY from pre-commit (never post-commit).
3. XTDB writes must be fire-and-forget from the hook. If XTDB is down, log to `data/pending-events.jsonl` and flush on next successful connection.
4. The registry file should have a `schemaVersion` field so future format changes can be detected and trigger a rebuild.

### M9: Architectural Boundary Enforcement

Research finding: *"Architectural rules, such as layer dependencies, should be automatically checked. Violations introduced during development without being noticed increase maintenance difficulty."* (Hu, 2023 — Philips Medical case study)

The harness has an implicit layered architecture:
```
lib/            → shared infrastructure (should depend on nothing internal)
extensions/     → each extension should depend on lib/ and pi framework only
harness-ui/     → UI depends on lib/ only
test/           → tests depend on everything but nothing depends on tests
scripts/        → tooling, no production code depends on scripts
```

**What we should check:** When a commit introduces an import that violates these layer rules (e.g., `lib/errors.ts` importing from `web-chat/`), the hook should flag it as an architectural violation.

### M10: Error Handling Quality (AST-detectable)

Research domain: Recovery-Oriented Computing (Patterson et al., UC Berkeley ROC project, 2002). Core insight — *systems fail; what matters is how fast and correctly they recover. Most outages are caused not by the original fault, but by incorrect error handling.*

**Audit results on harness (2026-03-21):**

| Pattern | Count | Risk |
|---|---|---|
| try/catch blocks in production code | 59 files | — |
| catch-and-log-only (console.error, no recovery, no rethrow) | 34 | **HIGH** — failure is silently swallowed, caller thinks success |
| Explicit "never crash" swallow comments | 2 | Intentional but dangerous — masks cascading failures |
| Global unhandled rejection handlers | **0** | **CRITICAL** — unhandled promise rejection = silent data loss |
| Graceful shutdown handlers (SIGTERM/SIGINT) | **0** | **CRITICAL** — process kill = mid-write data corruption |

**What the AST can detect:**
1. **Catch-and-swallow** — catch block where body contains only console.log/error/warn and no throw/rethrow. Flag as "silent failure risk."
2. **Catch-all without discrimination** — `catch (e) { ... }` that doesn't inspect error type. Research shows undifferentiated error handling is the #1 cause of incorrect recovery (Rubio-González et al., ASPLOS 2009).
3. **Missing finally** — try/catch that acquires a resource (DB connection, file handle) but has no finally block for cleanup.
4. **Error string construction** — `catch (e) { return { error: String(e) } }` destroys the stack trace and error type. Found in `xtdb-event-logger/index.ts:71`.

### M11: Partial Failure Handling

Research domain: Distributed systems reliability (Alvaro et al., "Lineage-driven fault injection", SIGMOD 2015). Core insight — *in a system of N operations, any subset can fail. Code that uses all-or-nothing patterns when partial success is acceptable will fail more often than necessary.*

**Audit results:**

| Pattern | Count | Implication |
|---|---|---|
| `Promise.all` (all-or-nothing) | 9 | If any one promise rejects, ALL results are lost |
| `Promise.allSettled` (partial failure safe) | **0** | No code handles partial failure |
| `Promise.race` | 0 | No timeout-via-race patterns |

Every `Promise.all` call in the codebase is a site where one failing sub-operation kills all sibling operations. For example, if the hook initializes 5 XTDB endpoints with `Promise.all`, one unreachable endpoint kills all 5 — including the ones that would have worked.

**What the AST can detect:** `Promise.all` calls that are not wrapped in try/catch or where no `.catch` handler exists on the returned promise. Flag as "partial failure vulnerability."

### M12: Timeout and Cancellation

Research domain: Release It! (Nygard, 2007, 2018). Stability pattern: *"Every outward call must have a timeout. Without one, a hung dependency silently converts your system from 'running' to 'stuck'."*

**Audit results:**
- 8 `fetch()` calls in production code with no AbortController or timeout signal
- 0 uses of `Promise.race` for timeout-via-race

**What the AST can detect:** `fetch()`, `http.request()`, or DB query calls where no `AbortController`, `signal`, or `setTimeout` exists in the enclosing scope. Flag as "missing timeout — may hang indefinitely."

### M13: Type Safety Erosion

Research domain: Type system effectiveness studies (Hanenberg et al., ESEM 2014). Finding — *`as any` in TypeScript defeats the entire purpose of the type system. It's not a cast, it's a promise to the compiler that you know better — and that promise is almost never kept.*

**Audit results:**

| Pattern | Count | Risk |
|---|---|---|
| `as any` casts | 171 | **HIGH** — each is a hole in the type system |
| Non-null assertions (`!.`) | 10 | Medium — may NPE at runtime |
| Total unsafe operations | 216 | |
| Runtime assertions in production | **3** | Almost no defense-in-depth |
| Exported functions without return type | 43 of 222 (19%) | Caller has no contract |

171 `as any` casts means 171 places where a runtime type error can occur that the compiler cannot prevent. This is a form of technical debt that accumulates silently — the compiler reports zero errors, but the runtime guarantees are hollow.

**What the AST can detect:**
1. `as any` — count per file, track trend. Should be decreasing.
2. Exported functions without return type annotation — these are public API surface with no contract.
3. Non-null assertions — each one is a potential null pointer at runtime.

**Proposed metric:** "Type Safety Score" = 1 − (unsafe_casts / total_expressions). Track per module, trend per commit.

### M14: API Contract Stability (Breaking Change Detection)

Research domain: Semantic Versioning and contract-first design (Hyrum's Law: *"With a sufficient number of users, every observable behavior of your system will be depended on by somebody."*)

The harness has 293 exported symbols. Any change to their signature (parameters added/removed, return type changed, function renamed) is a potential breaking change that ripples through all callers.

**What the AST can detect on commit:**
1. Exported function signature changed (parameter count, parameter types, return type)
2. Exported function removed (= definitely breaking)
3. Exported function renamed (= breaking unless re-exported under old name)

The lifecycle event system already tracks MODIFIED — extend it to track WHAT changed (signature, body, or both). Signature changes are breaking; body changes are non-breaking (if contract is preserved).

### M15: Observability Gaps

Research domain: Observability Engineering (Majors et al., O'Reilly 2022). Core principle — *"You cannot fix what you cannot see. Structured logs, not printf debugging."*

**Audit results:**

| Pattern | Count | Assessment |
|---|---|---|
| `console.log/error/warn` in production | 82 | Unstructured — no level, no correlation ID, no timestamp |
| Structured logger usage | 3 | Almost none |
| Health check endpoints | 3 | Minimal |
| Distributed trace IDs / correlation | 0 | No request tracing across modules |

The harness has an event system that writes to XTDB — which is a form of structured logging. But the 82 console.* calls bypass it entirely. These are invisible to the graph, to XTDB, and to any monitoring.

**What the AST can detect:** Functions that use `console.log/error/warn` instead of the event system. Track count per module. Should trend toward zero as structured logging replaces printf debugging.

### M16: Shared Mutable State

Research domain: Concurrency correctness (Goetz et al., "Java Concurrency in Practice", 2006; adapted to Node.js event loop). Core risk — *even in single-threaded Node.js, module-level `let` variables shared across async call chains create temporal coupling bugs.*

**Audit results:**
- 20 module-level `let` declarations in production code
- 0 mutex/lock patterns (acceptable in Node.js single-thread, BUT WebSocket handlers run interleaved across `await` points)

Module-level `let` variables in the harness include session pools, enabled flags, and endpoint lists. These are mutated by async handlers that yield at `await` points. Between the `await` and the resume, another handler may mutate the same variable.

**What the AST + call graph can detect together:**
1. Module-level `let` — flag as shared mutable state
2. Functions that write to module-level `let` AND are async — flag as "concurrent mutation risk"
3. Two different async functions in the same module both writing the same `let` — flag as "race condition candidate"

This is the `mg:writesBinding` edge type from the vocabulary we designed. It already exists in the data model — we just haven't planned to use it for safety analysis.

### M17: Resilience Under Dependency Failure

Research domain: Chaos Engineering (Basiri et al., "Chaos Engineering", IEEE Software 2016). Core question — *"What happens to YOUR system when a dependency is unavailable?"*

The harness depends on: XTDB (database), QLever (SPARQL), WebSocket connections, filesystem, and the pi coding agent framework. For each dependency:

| Dependency | What happens when it's down? | Evidence |
|---|---|---|
| XTDB | Events silently swallowed (catch-and-swallow at line 86) | Intentional but loses data |
| QLever | Unknown — no error handling in graph queries | Likely uncaught exception |
| WebSocket disconnect | Session pool handles it | Tested |
| Filesystem full | Unknown — no disk space checks | Likely crash |
| pi framework unavailable | Extensions fail to load | Handled by framework |

**What we should add to the graph:** A `code:dependsOnExternal` edge type that tags which external systems each function relies on. When a function calls `fetch()`, `sql`, `db.query()`, or `fs.*`, the graph should record the external dependency. This enables "What breaks if XTDB is down?" as a SPARQL query.

---

## Updated Phase Plan

Add to existing phases:

### Phase 2b: Code Health Metrics (alongside blast radius)

Calculate on each commit and store as JSON-LD:
- Fan-in / fan-out per changed function
- Circular dependency count (delta from previous)
- Dead code count (delta)
- Module coupling score for changed modules

### Phase 3b: Health Dashboard SPARQL Queries

Add to `/graph` page:
- "Coupling Trend" — fan-in/fan-out over last N commits
- "Circular Dependencies" — current cycles in the graph
- "Hotspots" — most-modified functions (requires lifecycle events from Phase 1)
- "Architecture Violations" — imports that cross layer boundaries
- "Dead Code" — functions with zero callers (excluding framework entry points)

### Phase 6: Architectural Rule Checking (new)

Define allowed import directions in a config file. The hook checks every new import against the rules and warns on violations.

**Effort estimate:** S-M (1-2 hours)

### Phase 7: Resilience Pattern Detection (new — from M10-M17)

Extend the AST parser to detect antipatterns WITHIN function bodies, not just structural relationships between them. This is where the call graph becomes a code health system.

**7a. Error handling quality scanner**
For each function, classify its error handling:
- `safe` — try/catch with recovery logic or rethrow
- `swallowed` — catch with only console.* and no rethrow
- `unhandled` — async function with no try/catch around I/O
- `discriminated` — catch block that inspects error type before acting
- `undiscriminated` — catch block that treats all errors identically

Store as property on function node: `code:errorHandling "swallowed"`.

**7b. Timeout and cancellation scanner**
For each function that makes outward calls (fetch, DB query, HTTP):
- `guarded` — has AbortController or timeout
- `unguarded` — no timeout mechanism

Store as: `code:timeoutGuard "unguarded"`.

**7c. Type safety scorer**
Per module:
- Count of `as any` casts
- Count of non-null assertions
- Count of exported functions without return type
- "Type Safety Score" = 1 − (unsafe / total)

Store as: `code:typeSafetyScore "0.82"`.

**7d. Shared state detector**
For each module-level `let`:
- Which async functions write to it?
- Is it written from multiple async call chains?
- Flag concurrent mutation candidates

Uses existing `mg:writesBinding` from the vocabulary.

**7e. Partial failure detector**
Flag `Promise.all` calls where:
- No try/catch wraps the call
- No `.catch()` on the returned promise
- `Promise.allSettled` would be more appropriate

**Effort estimate for Phase 7:** M-L (3-5 hours)

### Phase 8: External Dependency Mapping (new — from M17)

Add `code:dependsOnExternal` edges to the graph. When AST detects:
- `fetch()` → tag with "http"
- `sql` template tag or `db.query()` → tag with "xtdb"
- `fs.*` calls → tag with "filesystem"
- `WebSocket` or `ws.*` → tag with "websocket"

Enables SPARQL query: "Which functions break if XTDB is down?" → all functions with `code:dependsOnExternal "xtdb"` plus their callers via blast radius.

**Effort estimate:** S-M (1-2 hours)

---

## Prioritized Risk Summary

The audit identified these concrete risks in the current codebase, ranked by severity:

| # | Risk | Severity | Evidence | Detectable by graph? |
|---|---|---|---|---|
| 1 | No global unhandled rejection handler | CRITICAL | 0 handlers found | No — requires code review |
| 2 | No graceful shutdown (SIGTERM/SIGINT) | CRITICAL | 0 handlers found | No — requires code review |
| 3 | 34 catch-and-log-only patterns | HIGH | Silent failure in 34 catch blocks | **YES — AST pattern** |
| 4 | 171 `as any` casts | HIGH | Type system bypassed 171 times | **YES — AST count** |
| 5 | 0 `Promise.allSettled` / 9 `Promise.all` | HIGH | No partial failure handling | **YES — AST pattern** |
| 6 | 8 fetch() calls without timeout | HIGH | May hang indefinitely | **YES — AST pattern** |
| 7 | 3 circular dependencies | MEDIUM | Cross-package cycles exist | **YES — graph cycle** |
| 8 | `typed()` has 61 callers (fan-in) | MEDIUM | Single function = single point of failure | **YES — fan-in metric** |
| 9 | `onMessage` calls 32 functions (fan-out) | MEDIUM | God function, untestable | **YES — fan-out metric** |
| 10 | 43 exported functions without return type | MEDIUM | No API contract for callers | **YES — AST pattern** |
| 11 | 82 console.* calls bypass event system | LOW | Invisible to monitoring | **YES — AST pattern** |
| 12 | 20 module-level `let` in async code | LOW | Potential race conditions | **YES — AST + writesBinding** |

Items 1-2 should be fixed immediately — they don't need the graph system. Items 3-12 are what the graph system should detect and trend over time.

---

## Total Effort Estimate

| Phase | Effort | Cumulative |
|---|---|---|
| 1. Hook + registry | 2-3h | 2-3h |
| 2. Blast radius | 1-2h | 3-5h |
| 2b. Code health metrics | 1-2h | 4-7h |
| 3. XTDB + QLever | 2-3h | 6-10h |
| 3b. Health dashboard queries | 1-2h | 7-12h |
| 4. Requirement linkage | 1-2h | 8-14h |
| 5. Historical backfill | 3-4h | 11-18h |
| 6. Architectural rule checking | 1-2h | 12-20h |
| 7. Resilience pattern detection | 3-5h | 15-25h |
| 8. External dependency mapping | 1-2h | 16-27h |
| **Total** | **16-27h** | |

**Suggested implementation order by value:**
1. **Phase 1** (hook + registry) — foundation, everything else depends on it
2. **Phase 2 + 2b** (blast radius + health metrics) — immediately actionable on every commit
3. **Phase 7a** (error handling scanner) — catches the most dangerous patterns (34 silent failures)
4. **Phase 6** (architectural rules) — prevents new erosion while you fix existing
5. **Phase 3 + 3b** (XTDB + dashboard) — makes everything visible and queryable
6. **Phase 7b-e** (remaining resilience scanners) — deeper safety analysis
7. **Phase 8** (dependency mapping) — "what breaks if X is down" queries
8. **Phase 4** (requirement linkage) — traceability enrichment
9. **Phase 5** (historical backfill) — trend analysis over full project history

Phases 1-2 are immediately useful standalone. Phase 7a has the highest safety ROI because it finds the 34 places where failures are silently swallowed today.
