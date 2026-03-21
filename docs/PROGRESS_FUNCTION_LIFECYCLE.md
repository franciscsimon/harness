# Function Lifecycle Tracking — Implementation Summary

> Last updated: 2026-03-21
> Status: Research complete, ready for implementation
> Related: `docs/PROPOSAL_CALL_GRAPH.md`, `docs/TODO_TEST_COVERAGE_GRAPH.md`

---

## Goal

Track every function from first creation through changes to decommissioning, driven by changing requirements. When a file changes, identify which functions were affected and calculate the blast radius through the call graph.

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

## Total Effort Estimate

| Phase | Effort | Cumulative |
|---|---|---|
| 1. Hook + registry | 2-3h | 2-3h |
| 2. Blast radius | 1-2h | 3-5h |
| 3. XTDB + QLever | 2-3h | 5-8h |
| 4. Requirement linkage | 1-2h | 6-10h |
| 5. Historical backfill | 3-4h | 9-14h |
| **Total** | **9-14h** | |

Phases 1-2 are immediately useful without XTDB. Phase 3 integrates with the existing data platform. Phases 4-5 are enrichment.
