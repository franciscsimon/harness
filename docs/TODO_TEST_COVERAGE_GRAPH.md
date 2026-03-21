# TODO: Test Coverage Graph in QLever

## Goal

Add structural test coverage analysis to the call graph — show which exported functions have tests and which don't, queryable via SPARQL and visualized with color-coded D3 nodes.

## Exploration Findings (2026-03-21)

### Current State

- AST parser (`scripts/parse-call-graph.ts`) already parses 203 TS files → 675 functions, 1042 call edges
- 22 test modules and 113 test functions are in the graph
- Module-level imports from test→source are correctly resolved (15 source modules)
- **Bug: function-level cross-module call resolution is broken** — most calls fall through to local scope instead of resolving via `importMap`

### Test Patterns in the Codebase

| Pattern | Files | How it works | Can resolve statically? |
|---------|-------|-------------|------------------------|
| Direct imports | `test/pure-functions.ts` | `import { fn } from "../src/file.ts"` then calls `fn()` | ✅ Yes — fix importMap lookup |
| Dynamic imports | `test/handler-tests.ts` | `await import("../handlers/x.ts")` — 14 handlers | ⚠️ Partial — can detect `import()` string literal |
| Mock-pi extensions | `test/ext-load-test.ts` | Loads extensions via `createMockPi()` | ❌ No — too dynamic |
| Contract tests | `test/contracts/*.ts` | `fetch()` to HTTP endpoints | ❌ No — tests API surfaces not functions |

### Numbers

- **287** exported source functions
- **4** currently marked as tested (parser bug — should be ~30+)
- **~15** source modules imported by test files
- `pure-functions.ts` alone tests functions from 10 source modules

## Implementation Steps

### Step 1: Fix cross-module call resolution in parser
**File:** `scripts/parse-call-graph.ts`
**Bug:** `resolveCallTarget()` falls through to local scope for imported names. The `importMap` stores entries like `"computeHealthScore" → "xtdb-event-logger-ui/lib/health.ts#computeHealthScore"` but the lookup isn't matching.
**Fix:** Debug `resolveCallTarget()` — ensure imported identifier calls check `importMap` before falling through to local `urn:pi:fn:{filePath}#{name}`.

### Step 2: Add test metadata to graph nodes
**File:** `scripts/parse-call-graph.ts`
- Add `code:isTestFile: true` on modules under `test/` or matching `*.test.ts` / `*.spec.ts`
- Add `code:isTestFunction: true` on functions in test files
- Add `code:tests` property (like `code:calls` but semantic) — from test function → source function

### Step 3: Handle dynamic `import()` calls
**File:** `scripts/parse-call-graph.ts`
- Detect `CallExpression` where callee is `import` keyword and argument is a string literal
- Resolve the string to a module path
- Create `code:tests` edge from the enclosing function to the target module's exported functions

### Step 4: Add "Test Coverage" SPARQL query
**File:** `harness-ui/pages/graph.ts`
Add canned query:
```sparql
PREFIX code: <https://pi.dev/code/>
PREFIX schema: <https://schema.org/>

SELECT ?name ?file ?tested WHERE {
  ?fn a schema:DefinedTerm ;
      schema:name ?name ;
      code:filePath ?file ;
      code:isExported true .
  BIND(EXISTS { ?test code:tests ?fn } AS ?tested)
}
ORDER BY ?tested ?file ?name
```

### Step 5: Color D3 graph nodes by test status
**File:** `harness-ui/pages/graph.ts`
- For the "Test Coverage" query: color nodes green (tested) / red (untested)
- Add a legend to the graph visualization

### Step 6: Re-index QLever and verify
```bash
NODE_PATH=xtdb-projector/node_modules npx jiti scripts/parse-call-graph.ts
NODE_PATH=xtdb-event-logger/node_modules npx jiti scripts/export-xtdb-triples.ts
./scripts/qlever-index.sh
```

## Effort Estimate

| Step | Effort |
|------|--------|
| 1. Fix call resolution | S-M |
| 2. Test metadata | S |
| 3. Dynamic imports | S |
| 4. SPARQL query | S |
| 5. D3 coloring | S-M |
| 6. Re-index + verify | S |
| **Total** | **~2 hours** |

## Files to Change

- `scripts/parse-call-graph.ts` — steps 1, 2, 3
- `harness-ui/pages/graph.ts` — steps 4, 5

## Expected Outcome

After implementation:
- SPARQL query shows 287 exported functions with tested/untested status
- ~30+ functions marked as tested (up from 4)
- D3 visualization colors: green = tested, red = untested
- Coverage percentage visible at a glance
