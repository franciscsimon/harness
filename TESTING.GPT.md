# TESTING.GPT.md

## Scope

Systematic file/function-level testing inventory for the repository. This report covers named runtime functions, exported handlers, server entrypoints, renderers, helpers, and existing test harness files. Inline anonymous callbacks are **not** listed individually; they should be covered through parent-function tests.

## Inventory Summary

- Source files reviewed: **146**
- Named functions / handlers inventoried: **516**
- Existing test/support files found: **7** (`test/*` + `examples/hello-service/test.ts`)
- Highest-risk areas to test first: **web-chat**, **xtdb-event-logger-ui**, **xtdb-event-logger**, **artifact-tracker**, **xtdb-projector**, **project-registry**, **workflow-engine**

## Existing Automated Test Coverage

- `test/handler-tests.ts` — E2E-style handler coverage for xtdb-event-logger field extraction.
- `test/test-handler.ts` — Single/all handler runner for deployed xtdb-event-logger handlers.
- `test/ext-load-test.ts` — Extension factory smoke test against a mock ExtensionAPI.
- `test/smoke-test.ts` — Deployment/resource filesystem smoke checks.
- `test/run-tests.ts` — Scenario/integration checks against XTDB + UI.
- `test/seed-augmented-patterns.ts` — Seed-data builder for repeatable scenario/integration tests.
- `examples/hello-service/test.ts` — Example service endpoint smoke tests.

**Coverage gap summary:** current automated tests are strongest around xtdb-event-logger handlers, extension loading, deployment smoke, and the example app. The largest uncovered areas are web-chat protocol/state management, dashboard route/API behavior, artifact tracking/version cleanup, workflow-engine state transitions, and many extension-specific command/tool flows.

## Priority Legend

- **P0** — must test first; stateful, destructive, server-facing, DB-facing, or protocol-critical
- **P1** — important integration/unit coverage next; extension lifecycle, rendering, file IO, projections
- **P2** — normal unit coverage; pure helpers and support modules
- **P3** — compile/contract or indirect coverage is usually enough

## Recommended Execution Order

1. **Server/protocol tests** — `web-chat/*`, `xtdb-event-logger-ui/server.ts`, `xtdb-event-logger/index.ts`
2. **Persistence and destructive state tests** — `artifact-tracker/*`, `xtdb-event-logger-ui/lib/db.ts`, `xtdb-event-logger/endpoints/*`, `project-registry/*`
3. **Projection/normalization tests** — `xtdb-projector/*`, `xtdb-event-logger/router.ts`, all `xtdb-event-logger/handlers/*`
4. **Workflow / tool / extension behavior tests** — `workflow-engine/*`, `quality-hooks/*`, `agent-spawner/*`, `decision-log/*`, `history-retrieval/*`
5. **Rendering and browser tests** — `xtdb-event-logger-ui/pages/*`, `xtdb-event-logger-ui/static/*`, `web-chat/static/chat.js`
6. **Remaining extension and utility tests** — all other extension packages and helpers

## Package-by-Package File / Function Inventory

## agent-spawner — 2 file(s), 12 function(s)

Repository package / extension module.

### `agent-spawner/agents.ts`
- Role: support module
- Priority: **P2**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `parseFrontmatter` L11 — P2; unit; focus: valid/invalid input + edge parsing + fallback behavior.
  - `discoverAgents` L27 — P2; unit; focus: valid/invalid input + edge parsing + fallback behavior.
  - `formatAgentList` L53 — P2; unit; focus: branch/edge coverage + regression cases.

### `agent-spawner/index.ts`
- Role: package/extension entrypoint
- Priority: **P0**
- Suggested test types: db-integration, integration, snapshot, extension-smoke
- Risk flags: spawn, db, render, event, tool
- Functions to test:
  - `default export` L35 — P0; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `ensureDb` L40 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `persistDelegation` L56 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `t` L67 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `n` L68 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `execute` L237 — P0; integration; focus: branch/edge coverage + regression cases.
  - `renderCall` L269 — P0; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `formatAge` L277 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `runSubagent` L289 — P0; integration; focus: happy path + error handling + idempotence/state transitions.

## alignment-monitor — 1 file(s), 4 function(s)

Repository package / extension module.

### `alignment-monitor/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L9 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `reset` L17 — P1; integration; focus: branch/edge coverage + regression cases.
  - `extractPaths` L28 — P1; integration; focus: valid/invalid input + edge parsing + fallback behavior.
  - `execute` L161 — P1; integration; focus: branch/edge coverage + regression cases.

## artifact-tracker — 5 file(s), 27 function(s)

Artifact lineage, version capture, provenance export, cleanup.

### `artifact-tracker/commands.ts`
- Role: support module
- Priority: **P0**
- Suggested test types: db-integration, fs-integration
- Risk flags: db, fs
- Functions to test:
  - `cmdList` L4 — P0; integration; focus: branch/edge coverage + regression cases.
  - `cmdRestore` L43 — P0; integration; focus: branch/edge coverage + regression cases.
  - `cmdHistory` L67 — P0; integration; focus: branch/edge coverage + regression cases.

### `artifact-tracker/db.ts`
- Role: DB access layer
- Priority: **P0**
- Suggested test types: db-integration
- Risk flags: db
- Functions to test:
  - `ensureDb` L9 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `bootstrapTable` L29 — P0; integration; focus: branch/edge coverage + regression cases.
  - `typed` L37 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `typedNum` L39 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `closeDb` L40 — P0; integration; focus: happy path + error handling + idempotence/state transitions.

### `artifact-tracker/index.ts`
- Role: package/extension entrypoint
- Priority: **P0**
- Suggested test types: db-integration, extension-smoke
- Risk flags: db, event, tool
- Functions to test:
  - `default export` L20 — P0; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `trackArtifactRead` L44 — P0; integration; focus: branch/edge coverage + regression cases.
  - `t` L50 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `n` L51 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `t` L82 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `n` L83 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `inferKind` L135 — P0; integration; focus: branch/edge coverage + regression cases.

### `artifact-tracker/provenance.ts`
- Role: support module
- Priority: **P0**
- Suggested test types: db-integration, fs-integration
- Risk flags: db, fs
- Functions to test:
  - `collectSessionIds` L11 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `collectProvenanceGraph` L32 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `deduplicateById` L65 — P0; integration; focus: branch/edge coverage + regression cases.
  - `cmdExportProvenance` L75 — P0; integration; focus: branch/edge coverage + regression cases.

### `artifact-tracker/versioning.ts`
- Role: support module
- Priority: **P0**
- Suggested test types: db-integration, fs-integration
- Risk flags: db, fs
- Functions to test:
  - `nextVersion` L14 — P0; integration; focus: branch/edge coverage + regression cases.
  - `buildVersionJsonLd` L21 — P0; integration; focus: branch/edge coverage + regression cases.
  - `findPriorVersionId` L48 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `captureVersion` L61 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `t` L68 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `n` L69 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `cleanupArtifacts` L117 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `clearVersionState` L131 — P0; integration; focus: branch/edge coverage + regression cases.

## canary-monitor — 3 file(s), 9 function(s)

Repository package / extension module.

### `canary-monitor/config.ts`
- Role: config/default resolution
- Priority: **P2**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `loadCanaryConfig` L21 — P2; unit; focus: valid/invalid input + edge parsing + fallback behavior.

### `canary-monitor/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event
- Functions to test:
  - `default export` L15 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `reset` L27 — P1; integration; focus: branch/edge coverage + regression cases.

### `canary-monitor/metrics.ts`
- Role: support module
- Priority: **P2**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `computeToolFailureRate` L24 — P2; unit; focus: branch/edge coverage + regression cases.
  - `computeTurnInflation` L48 — P2; unit; focus: branch/edge coverage + regression cases.
  - `computeContextBloat` L65 — P2; unit; focus: branch/edge coverage + regression cases.
  - `detectRetryStorm` L83 — P2; unit; focus: branch/edge coverage + regression cases.
  - `computeDuration` L113 — P2; unit; focus: branch/edge coverage + regression cases.
  - `computeToolDensity` L131 — P2; unit; focus: branch/edge coverage + regression cases.

## chunker — 1 file(s), 6 function(s)

Repository package / extension module.

### `chunker/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L14 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `reset` L19 — P1; integration; focus: branch/edge coverage + regression cases.
  - `progressBar` L25 — P1; integration; focus: branch/edge coverage + regression cases.
  - `findNextUndone` L34 — P1; integration; focus: empty/single/multi result sets + filters + ordering.
  - `saveState` L76 — P1; integration; focus: happy path + error handling + idempotence/state transitions.
  - `execute` L214 — P1; integration; focus: branch/edge coverage + regression cases.

## contextual-prompts — 2 file(s), 6 function(s)

Repository package / extension module.

### `contextual-prompts/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L12 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `loadConfig` L22 — P1; integration; focus: valid/invalid input + edge parsing + fallback behavior.
  - `saveConfig` L34 — P1; integration; focus: happy path + error handling + idempotence/state transitions.
  - `canFire` L39 — P1; integration; focus: branch/edge coverage + regression cases.
  - `fire` L44 — P1; integration; focus: branch/edge coverage + regression cases.
  - `findPrompt` L51 — P1; integration; focus: empty/single/multi result sets + filters + ordering.

### `contextual-prompts/prompts.ts`
- Role: prompt/habit data module
- Priority: **P2**
- Suggested test types: unit
- Risk flags: none
- Functions: none detected. Cover behavior through import smoke tests and parent integration paths.

## custom-compaction — 1 file(s), 1 function(s)

Repository package / extension module.

### `custom-compaction/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event
- Functions to test:
  - `default export` L8 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.

## decision-log — 3 file(s), 9 function(s)

Repository package / extension module.

### `decision-log/index.ts`
- Role: package/extension entrypoint
- Priority: **P0**
- Suggested test types: db-integration, extension-smoke
- Risk flags: db, event, tool
- Functions to test:
  - `connectXtdb` L18 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `getProjectDecisions` L32 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `t` L33 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `formatDecisionsForContext` L45 — P0; integration; focus: branch/edge coverage + regression cases.
  - `default export` L57 — P0; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `execute` L128 — P0; integration; focus: branch/edge coverage + regression cases.
  - `t` L150 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `n` L151 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

### `decision-log/rdf.ts`
- Role: RDF/JSON-LD serialization helper
- Priority: **P2**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `buildDecisionJsonLd` L16 — P2; unit; focus: branch/edge coverage + regression cases.

### `decision-log/types.ts`
- Role: types/contracts
- Priority: **P3**
- Suggested test types: compile / contract
- Risk flags: none
- Functions: none. Test via compile-time contract checks / schema constant snapshots if any.

## examples — 3 file(s), 1 function(s)

Example application used to validate harness workflows.

### `examples/hello-service/app.ts`
- Role: example app / example tests
- Priority: **P0**
- Suggested test types: integration
- Risk flags: http
- Functions: none detected. Cover behavior through import smoke tests and parent integration paths.

### `examples/hello-service/index.ts`
- Role: example app / example tests
- Priority: **P2**
- Suggested test types: unit
- Risk flags: none
- Functions: none detected. Cover behavior through import smoke tests and parent integration paths.

### `examples/hello-service/test.ts`
- Role: example app / example tests
- Priority: **P2**
- Suggested test types: unit
- Risk flags: none
- Existing coverage: Example service endpoint smoke tests.
- Functions to test:
  - `run` L6 — P2; unit; focus: happy path + error handling + idempotence/state transitions.

## feedback-flip — 1 file(s), 1 function(s)

Repository package / extension module.

### `feedback-flip/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L7 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.

## git-checkpoint — 1 file(s), 3 function(s)

Repository package / extension module.

### `git-checkpoint/index.ts`
- Role: package/extension entrypoint
- Priority: **P0**
- Suggested test types: integration, extension-smoke
- Risk flags: exec, event, tool
- Functions to test:
  - `default export` L6 — P0; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `isGitRepo` L23 — P0; integration; focus: branch/edge coverage + regression cases.
  - `stash` L30 — P0; integration; focus: branch/edge coverage + regression cases.

## habit-monitor — 3 file(s), 9 function(s)

Repository package / extension module.

### `habit-monitor/config.ts`
- Role: config/default resolution
- Priority: **P2**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `loadHabitConfig` L24 — P2; unit; focus: valid/invalid input + edge parsing + fallback behavior.

### `habit-monitor/habits.ts`
- Role: prompt/habit data module
- Priority: **P2**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `checkCommitHabit` L19 — P2; unit; focus: branch/edge coverage + regression cases.
  - `checkTestHabit` L64 — P2; unit; focus: branch/edge coverage + regression cases.
  - `checkErrorStreak` L104 — P2; unit; focus: branch/edge coverage + regression cases.
  - `checkScopeCreep` L129 — P2; unit; focus: branch/edge coverage + regression cases.
  - `checkFreshStart` L148 — P2; unit; focus: branch/edge coverage + regression cases.

### `habit-monitor/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L13 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `reset` L27 — P1; integration; focus: branch/edge coverage + regression cases.
  - `isSnoozed` L38 — P1; integration; focus: branch/edge coverage + regression cases.

## handoff — 1 file(s), 1 function(s)

Repository package / extension module.

### `handoff/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: tool
- Functions to test:
  - `default export` L8 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.

## happy-to-delete — 1 file(s), 2 function(s)

Repository package / extension module.

### `happy-to-delete/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L10 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `reset` L15 — P1; integration; focus: branch/edge coverage + regression cases.

## history-retrieval — 1 file(s), 5 function(s)

Repository package / extension module.

### `history-retrieval/index.ts`
- Role: package/extension entrypoint
- Priority: **P0**
- Suggested test types: db-integration, extension-smoke
- Risk flags: db, event
- Functions to test:
  - `default export` L17 — P0; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `ensureDb` L19 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `t` L42 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `extractPaths` L144 — P0; integration; focus: valid/invalid input + edge parsing + fallback behavior.
  - `truncFiles` L158 — P0; integration; focus: branch/edge coverage + regression cases.

## jit-docs — 1 file(s), 2 function(s)

Repository package / extension module.

### `jit-docs/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L13 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `execute` L152 — P1; integration; focus: branch/edge coverage + regression cases.

## knowledge-checkpoint — 1 file(s), 5 function(s)

Repository package / extension module.

### `knowledge-checkpoint/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L15 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `reset` L25 — P1; integration; focus: branch/edge coverage + regression cases.
  - `getSessionSlug` L34 — P1; integration; focus: empty/single/multi result sets + filters + ordering.
  - `saveCheckpoint` L38 — P1; integration; focus: happy path + error handling + idempotence/state transitions.
  - `execute` L192 — P1; integration; focus: branch/edge coverage + regression cases.

## knowledge-composer — 1 file(s), 1 function(s)

Repository package / extension module.

### `knowledge-composer/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L11 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.

## knowledge-extractor — 1 file(s), 2 function(s)

Repository package / extension module.

### `knowledge-extractor/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event
- Functions to test:
  - `default export` L8 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `reset` L17 — P1; integration; focus: branch/edge coverage + regression cases.

## leap-detector — 1 file(s), 2 function(s)

Repository package / extension module.

### `leap-detector/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event
- Functions to test:
  - `default export` L10 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `reset` L15 — P1; integration; focus: branch/edge coverage + regression cases.

## mind-dump — 1 file(s), 1 function(s)

Repository package / extension module.

### `mind-dump/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L11 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.

## noise-cancellation — 1 file(s), 1 function(s)

Repository package / extension module.

### `noise-cancellation/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L21 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.

## offload-detector — 1 file(s), 1 function(s)

Repository package / extension module.

### `offload-detector/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L18 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.

## orchestrator — 1 file(s), 1 function(s)

Repository package / extension module.

### `orchestrator/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L17 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.

## parallel-impl — 1 file(s), 1 function(s)

Repository package / extension module.

### `parallel-impl/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L17 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.

## permission-gate — 1 file(s), 1 function(s)

Repository package / extension module.

### `permission-gate/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event
- Functions to test:
  - `default export` L18 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.

## playgrounds — 1 file(s), 1 function(s)

Repository package / extension module.

### `playgrounds/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L9 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.

## project-registry — 5 file(s), 16 function(s)

Cross-session project identity and project/session linking.

### `project-registry/identity.ts`
- Role: support module
- Priority: **P0**
- Suggested test types: integration
- Risk flags: exec
- Functions to test:
  - `resolveProject` L15 — P0; integration; focus: valid/invalid input + edge parsing + fallback behavior.
  - `projectId` L78 — P0; integration; focus: branch/edge coverage + regression cases.

### `project-registry/index.ts`
- Role: package/extension entrypoint
- Priority: **P0**
- Suggested test types: db-integration, integration, extension-smoke
- Risk flags: exec, db, event
- Functions to test:
  - `makeExecFn` L12 — P0; integration; focus: branch/edge coverage + regression cases.
  - `connectXtdb` L19 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `upsertProject` L25 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `t` L28 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `n` L29 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `insertSessionLink` L65 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `t` L67 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `b` L68 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `n` L69 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `default export` L95 — P0; extension-integration; focus: registration + lifecycle hooks + state reset.

### `project-registry/normalize.ts`
- Role: support module
- Priority: **P2**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `normalizeGitUrl` L13 — P2; unit; focus: valid/invalid input + edge parsing + fallback behavior.
  - `stripSuffix` L35 — P3; unit; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

### `project-registry/rdf.ts`
- Role: RDF/JSON-LD serialization helper
- Priority: **P2**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `buildProjectJsonLd` L14 — P2; unit; focus: branch/edge coverage + regression cases.
  - `buildSessionProjectJsonLd` L40 — P2; unit; focus: branch/edge coverage + regression cases.

### `project-registry/types.ts`
- Role: types/contracts
- Priority: **P3**
- Suggested test types: compile / contract
- Risk flags: none
- Functions: none. Test via compile-time contract checks / schema constant snapshots if any.

## projection-architecture.jsx — 1 file(s), 2 function(s)

Repository package / extension module.

### `projection-architecture.jsx`
- Role: visual architecture artifact
- Priority: **P2**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `Arrow` L111 — P2; unit; focus: branch/edge coverage + regression cases.
  - `ProjectionArchitecture` L119 — P2; unit; focus: branch/edge coverage + regression cases.

## protected-paths — 1 file(s), 1 function(s)

Repository package / extension module.

### `protected-paths/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event
- Functions to test:
  - `default export` L18 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.

## quality-hooks — 3 file(s), 11 function(s)

File quality and diff sizing tools.

### `quality-hooks/checks.ts`
- Role: support module
- Priority: **P0**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `detectComments` L15 — P0; unit; focus: branch/edge coverage + regression cases.
  - `detectLargeFile` L46 — P0; unit; focus: branch/edge coverage + regression cases.
  - `detectLargeFunctions` L60 — P0; unit; focus: branch/edge coverage + regression cases.
  - `detectDuplication` L106 — P0; unit; focus: branch/edge coverage + regression cases.
  - `detectUnusedExports` L132 — P0; unit; focus: branch/edge coverage + regression cases.
  - `checkDiffSize` L156 — P0; unit; focus: branch/edge coverage + regression cases.
  - `runFileChecks` L185 — P0; unit; focus: happy path + error handling + idempotence/state transitions.

### `quality-hooks/index.ts`
- Role: package/extension entrypoint
- Priority: **P0**
- Suggested test types: integration, extension-smoke
- Risk flags: exec, event, tool
- Functions to test:
  - `default export` L14 — P0; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `execute` L143 — P0; integration; focus: branch/edge coverage + regression cases.
  - `execute` L180 — P0; integration; focus: branch/edge coverage + regression cases.

### `quality-hooks/mock-pi.ts`
- Role: support module
- Priority: **P2**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `createMockPi` L16 — P2; unit; focus: branch/edge coverage + regression cases.

## reference-docs — 1 file(s), 4 function(s)

Repository package / extension module.

### `reference-docs/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L12 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `docPaths` L18 — P1; integration; focus: branch/edge coverage + regression cases.
  - `findAllDocs` L26 — P1; integration; focus: empty/single/multi result sets + filters + ordering.
  - `execute` L180 — P1; integration; focus: branch/edge coverage + regression cases.

## refinement-loop — 1 file(s), 2 function(s)

Repository package / extension module.

### `refinement-loop/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L7 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `reset` L12 — P1; integration; focus: branch/edge coverage + regression cases.

## reminders — 1 file(s), 4 function(s)

Repository package / extension module.

### `reminders/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L13 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `ensureFile` L19 — P1; integration; focus: happy path + error handling + idempotence/state transitions.
  - `readReminders` L26 — P1; integration; focus: branch/edge coverage + regression cases.
  - `writeReminders` L35 — P1; integration; focus: branch/edge coverage + regression cases.

## role-loader — 1 file(s), 2 function(s)

Repository package / extension module.

### `role-loader/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L47 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `discoverRoles` L53 — P1; integration; focus: valid/invalid input + edge parsing + fallback behavior.

## semantic-zoom — 1 file(s), 2 function(s)

Repository package / extension module.

### `semantic-zoom/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L25 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `execute` L80 — P1; integration; focus: branch/edge coverage + regression cases.

## session-postmortem — 1 file(s), 5 function(s)

Repository package / extension module.

### `session-postmortem/index.ts`
- Role: package/extension entrypoint
- Priority: **P0**
- Suggested test types: db-integration, extension-smoke
- Risk flags: db, event
- Functions to test:
  - `emptyState` L28 — P0; integration; focus: branch/edge coverage + regression cases.
  - `default export` L41 — P0; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `connectDb` L45 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `t` L166 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `n` L168 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

## slop-detector — 2 file(s), 9 function(s)

Repository package / extension module.

### `slop-detector/detectors.ts`
- Role: support module
- Priority: **P2**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `detectAiSlop` L29 — P2; unit; focus: branch/edge coverage + regression cases.
  - `detectAnswerInjection` L59 — P2; unit; focus: branch/edge coverage + regression cases.
  - `detectObsessOverRules` L107 — P2; unit; focus: branch/edge coverage + regression cases.
  - `detectPerfectRecallFallacy` L136 — P2; unit; focus: branch/edge coverage + regression cases.
  - `detectTellMeALie` L166 — P2; unit; focus: branch/edge coverage + regression cases.
  - `runAllDetectors` L208 — P2; unit; focus: happy path + error handling + idempotence/state transitions.

### `slop-detector/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L10 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `freshState` L15 — P1; integration; focus: branch/edge coverage + regression cases.
  - `execute` L139 — P1; integration; focus: branch/edge coverage + regression cases.

## sunk-cost-detector — 1 file(s), 6 function(s)

Repository package / extension module.

### `sunk-cost-detector/index.ts`
- Role: package/extension entrypoint
- Priority: **P0**
- Suggested test types: db-integration, extension-smoke
- Risk flags: db, event, tool
- Functions to test:
  - `default export` L28 — P0; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `reset` L42 — P0; integration; focus: branch/edge coverage + regression cases.
  - `connectDb` L51 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `t` L80 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `t` L210 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `n` L211 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

## test — 7 file(s), 34 function(s)

Existing automated test harness and smoke checks.

### `test/ext-load-test.ts`
- Role: test harness / meta-tests
- Priority: **P1**
- Suggested test types: meta-test
- Risk flags: none
- Existing coverage: Extension factory smoke test against a mock ExtensionAPI.
- Functions to test:
  - `ok` L21 — P1; unit; focus: branch/edge coverage + regression cases.
  - `fail` L23 — P1; unit; focus: branch/edge coverage + regression cases.

### `test/handler-tests.ts`
- Role: test harness / meta-tests
- Priority: **P1**
- Suggested test types: meta-test
- Risk flags: none
- Existing coverage: E2E-style handler coverage for xtdb-event-logger field extraction.
- Functions to test:
  - `test` L9 — P1; unit; focus: branch/edge coverage + regression cases.
  - `safeStringify` L14 — P3; unit; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `run` L18 — P1; unit; focus: happy path + error handling + idempotence/state transitions.

### `test/mock-pi.ts`
- Role: test harness / meta-tests
- Priority: **P1**
- Suggested test types: meta-test
- Risk flags: none
- Functions to test:
  - `createMockPi` L16 — P1; unit; focus: branch/edge coverage + regression cases.

### `test/run-tests.ts`
- Role: test harness / meta-tests
- Priority: **P0**
- Suggested test types: meta-test
- Risk flags: db
- Existing coverage: Scenario/integration checks against XTDB + UI.
- Functions to test:
  - `t` L10 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `n` L11 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `pass` L23 — P0; integration; focus: branch/edge coverage + regression cases.
  - `fail` L28 — P0; integration; focus: branch/edge coverage + regression cases.
  - `skip` L34 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `assert` L39 — P0; integration; focus: branch/edge coverage + regression cases.
  - `fetchOk` L44 — P0; integration; focus: branch/edge coverage + regression cases.
  - `testInfrastructure` L56 — P0; integration; focus: branch/edge coverage + regression cases.
  - `testContextMarkers` L83 — P0; integration; focus: branch/edge coverage + regression cases.
  - `testTemplates` L138 — P0; integration; focus: branch/edge coverage + regression cases.
  - `testCanaryMetrics` L188 — P0; integration; focus: branch/edge coverage + regression cases.
  - `testHabitHooks` L288 — P0; integration; focus: branch/edge coverage + regression cases.
  - `testDashboard` L373 — P0; integration; focus: branch/edge coverage + regression cases.
  - `testKnowledge` L439 — P0; integration; focus: branch/edge coverage + regression cases.
  - `main` L495 — P0; integration; focus: branch/edge coverage + regression cases.

### `test/seed-augmented-patterns.ts`
- Role: test harness / meta-tests
- Priority: **P0**
- Suggested test types: meta-test
- Risk flags: db
- Existing coverage: Seed-data builder for repeatable scenario/integration tests.
- Functions to test:
  - `t` L10 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `n` L11 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `b` L12 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `nextSeq` L15 — P0; integration; focus: branch/edge coverage + regression cases.
  - `uuid` L17 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `insert` L19 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `seedSession` L40 — P0; integration; focus: branch/edge coverage + regression cases.
  - `main` L51 — P0; integration; focus: branch/edge coverage + regression cases.

### `test/smoke-test.ts`
- Role: test harness / meta-tests
- Priority: **P1**
- Suggested test types: meta-test
- Risk flags: none
- Existing coverage: Deployment/resource filesystem smoke checks.
- Functions to test:
  - `ok` L21 — P1; unit; focus: branch/edge coverage + regression cases.
  - `fail` L23 — P1; unit; focus: branch/edge coverage + regression cases.
  - `assert` L24 — P1; unit; focus: branch/edge coverage + regression cases.

### `test/test-handler.ts`
- Role: test harness / meta-tests
- Priority: **P1**
- Suggested test types: meta-test
- Risk flags: none
- Existing coverage: Single/all handler runner for deployed xtdb-event-logger handlers.
- Functions to test:
  - `testHandler` L2 — P1; unit; focus: branch/edge coverage + regression cases.
  - `main` L14 — P1; unit; focus: branch/edge coverage + regression cases.

## web-chat — 5 file(s), 71 function(s)

Local chat server/client for driving agent sessions over WebSocket.

### `web-chat/lib/session-pool.ts`
- Role: support module
- Priority: **P0**
- Suggested test types: fs-integration
- Risk flags: fs
- Functions to test:
  - `resolveDialog` L22 — P0; integration; focus: valid/invalid input + edge parsing + fallback behavior.
  - `requestDialog` L30 — P0; integration; focus: branch/edge coverage + regression cases.
  - `buildUiContext` L59 — P0; integration; focus: branch/edge coverage + regression cases.
  - `createPoolSession` L98 — P0; integration; focus: branch/edge coverage + regression cases.
  - `getPoolSession` L145 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `setUnsubscribe` L151 — P0; integration; focus: branch/edge coverage + regression cases.
  - `destroyPoolSession` L156 — P0; integration; focus: branch/edge coverage + regression cases.
  - `poolSize` L170 — P0; integration; focus: branch/edge coverage + regression cases.
  - `setSessionModel` L172 — P0; integration; focus: branch/edge coverage + regression cases.
  - `getContextUsageInfo` L181 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getSessionStatsInfo` L191 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getSessionInfo` L206 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `extractHistory` L221 — P0; integration; focus: valid/invalid input + edge parsing + fallback behavior.
  - `getForkPoints` L262 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getAvailableCommands` L272 — P0; integration; focus: empty/single/multi result sets + filters + ordering.

### `web-chat/lib/ws-protocol.ts`
- Role: support module
- Priority: **P1**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `parseClientMessage` L74 — P1; unit; focus: valid/invalid input + edge parsing + fallback behavior.
  - `send` L78 — P1; unit; focus: branch/edge coverage + regression cases.

### `web-chat/pages/chat.ts`
- Role: SSR page renderer
- Priority: **P1**
- Suggested test types: fs-integration, snapshot
- Risk flags: fs, render
- Functions to test:
  - `renderChat` L1 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.

### `web-chat/server.ts`
- Role: HTTP/WebSocket server
- Priority: **P0**
- Suggested test types: integration, snapshot
- Risk flags: http, render
- Functions to test:
  - `sendContextUsage` L46 — P0; integration; focus: branch/edge coverage + regression cases.
  - `sendStats` L51 — P0; integration; focus: branch/edge coverage + regression cases.
  - `sendFullState` L55 — P0; integration; focus: branch/edge coverage + regression cases.
  - `subscribeSession` L68 — P0; integration; focus: protocol flow + ordering + disconnect/error paths.
  - `initConnection` L143 — P0; integration; focus: protocol flow + ordering + disconnect/error paths.
  - `onOpen` L164 — P0; integration; focus: protocol flow + ordering + disconnect/error paths.
  - `onMessage` L168 — P0; integration; focus: protocol flow + ordering + disconnect/error paths.
  - `wsSend` L173 — P0; integration; focus: branch/edge coverage + regression cases.
  - `onClose` L376 — P0; integration; focus: protocol flow + ordering + disconnect/error paths.

### `web-chat/static/chat.js`
- Role: browser/client script
- Priority: **P0**
- Suggested test types: fs-integration, snapshot
- Risk flags: fs, render
- Functions to test:
  - `connect` L35 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `wsSend` L58 — P0; integration; focus: branch/edge coverage + regression cases.
  - `handleMessage` L62 — P0; integration; focus: branch/edge coverage + regression cases.
  - `updateSessionInfo` L122 — P0; integration; focus: branch/edge coverage + regression cases.
  - `fetchDecisionsAndArtifacts` L140 — P0; integration; focus: branch/edge coverage + regression cases.
  - `renderDecisions` L153 — P0; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `renderArtifacts` L164 — P0; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `updateStats` L180 — P0; integration; focus: branch/edge coverage + regression cases.
  - `setState` L187 — P0; integration; focus: branch/edge coverage + regression cases.
  - `startAssistantBubble` L199 — P0; integration; focus: branch/edge coverage + regression cases.
  - `appendText` L209 — P0; integration; focus: branch/edge coverage + regression cases.
  - `appendThinking` L216 — P0; integration; focus: branch/edge coverage + regression cases.
  - `toolSummaryHint` L232 — P0; integration; focus: branch/edge coverage + regression cases.
  - `shortenPath` L249 — P0; integration; focus: branch/edge coverage + regression cases.
  - `tryParseJson` L255 — P0; integration; focus: branch/edge coverage + regression cases.
  - `startTool` L259 — P0; integration; focus: branch/edge coverage + regression cases.
  - `updateTool` L273 — P0; integration; focus: branch/edge coverage + regression cases.
  - `endTool` L281 — P0; integration; focus: branch/edge coverage + regression cases.
  - `findTool` L293 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `finalizeBubble` L298 — P0; integration; focus: branch/edge coverage + regression cases.
  - `addUserBubble` L300 — P0; integration; focus: branch/edge coverage + regression cases.
  - `showError` L307 — P0; integration; focus: branch/edge coverage + regression cases.
  - `showNotify` L314 — P0; integration; focus: branch/edge coverage + regression cases.
  - `showExtStatus` L325 — P0; integration; focus: branch/edge coverage + regression cases.
  - `renderWorkflowSidebar` L339 — P0; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `showSystemMsg` L362 — P0; integration; focus: branch/edge coverage + regression cases.
  - `renderHistory` L371 — P0; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `updateContextUsage` L396 — P0; integration; focus: branch/edge coverage + regression cases.
  - `formatTokens` L408 — P0; integration; focus: branch/edge coverage + regression cases.
  - `sendPrompt` L444 — P0; integration; focus: branch/edge coverage + regression cases.
  - `autoResize` L474 — P0; integration; focus: branch/edge coverage + regression cases.
  - `scrollDown` L485 — P0; integration; focus: branch/edge coverage + regression cases.
  - `renderMd` L491 — P0; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `inline` L515 — P0; integration; focus: branch/edge coverage + regression cases.
  - `showCommandList` L529 — P0; integration; focus: branch/edge coverage + regression cases.
  - `showAutocomplete` L558 — P0; integration; focus: branch/edge coverage + regression cases.
  - `hideAutocomplete` L589 — P0; integration; focus: branch/edge coverage + regression cases.
  - `handleConfirm` L607 — P0; integration; focus: branch/edge coverage + regression cases.
  - `handleSelect` L619 — P0; integration; focus: branch/edge coverage + regression cases.
  - `handleInput` L628 — P0; integration; focus: branch/edge coverage + regression cases.
  - `showDialogOverlay` L637 — P0; integration; focus: branch/edge coverage + regression cases.
  - `respond` L650 — P0; integration; focus: branch/edge coverage + regression cases.
  - `el` L720 — P0; integration; focus: branch/edge coverage + regression cases.
  - `esc` L721 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

## workflow-engine — 4 file(s), 18 function(s)

Workflow loading/execution state machine and RDF graph parsing.

### `workflow-engine/index.ts`
- Role: package/extension entrypoint
- Priority: **P0**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L28 — P0; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `emptyState` L32 — P0; integration; focus: branch/edge coverage + regression cases.
  - `progressBar` L36 — P0; integration; focus: branch/edge coverage + regression cases.
  - `currentStepDef` L44 — P0; integration; focus: branch/edge coverage + regression cases.
  - `statusPayload` L50 — P0; integration; focus: branch/edge coverage + regression cases.
  - `ensureWorkflowsLoaded` L71 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `formatWorkflowList` L80 — P0; integration; focus: branch/edge coverage + regression cases.
  - `saveState` L148 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `activateWorkflow` L160 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `advanceStep` L193 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `skipStep` L233 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `abandonWorkflow` L247 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `execute` L304 — P0; integration; focus: branch/edge coverage + regression cases.

### `workflow-engine/rdf/namespaces.ts`
- Role: RDF/JSON-LD serialization helper
- Priority: **P2**
- Suggested test types: unit
- Risk flags: none
- Functions: none detected. Cover behavior through import smoke tests and parent integration paths.

### `workflow-engine/rdf/workflow-graph.ts`
- Role: RDF/JSON-LD serialization helper
- Priority: **P2**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `loadWorkflowFile` L44 — P2; unit; focus: valid/invalid input + edge parsing + fallback behavior.
  - `loadWorkflowDir` L116 — P2; unit; focus: valid/invalid input + edge parsing + fallback behavior.
  - `getStringValue` L137 — P2; unit; focus: empty/single/multi result sets + filters + ordering.
  - `getIntValue` L142 — P2; unit; focus: empty/single/multi result sets + filters + ordering.

### `workflow-engine/test-load.ts`
- Role: support module
- Priority: **P2**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `main` L5 — P2; unit; focus: branch/edge coverage + regression cases.

## xtdb-event-logger — 43 file(s), 75 function(s)

Raw event capture, normalization, RDF serialization, endpoint persistence.

### `xtdb-event-logger/config.ts`
- Role: config/default resolution
- Priority: **P1**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `defaults` L7 — P1; unit; focus: branch/edge coverage + regression cases.
  - `loadConfig` L45 — P1; unit; focus: valid/invalid input + edge parsing + fallback behavior.

### `xtdb-event-logger/endpoints/console.ts`
- Role: persistence/output endpoint
- Priority: **P0**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `ConsoleEndpoint` L7 — P0; smoke; focus: constructor/import smoke + methods via integration.
  - `init` L9 — P0; unit; focus: branch/edge coverage + regression cases.
  - `emit` L16 — P0; unit; focus: happy path + error handling + idempotence/state transitions.
  - `flush` L32 — P0; unit; focus: happy path + error handling + idempotence/state transitions.
  - `close` L36 — P0; unit; focus: happy path + error handling + idempotence/state transitions.

### `xtdb-event-logger/endpoints/jsonl.ts`
- Role: persistence/output endpoint
- Priority: **P0**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `JsonlEndpoint` L10 — P0; smoke; focus: constructor/import smoke + methods via integration.
  - `init` L13 — P0; unit; focus: branch/edge coverage + regression cases.
  - `emit` L29 — P0; unit; focus: happy path + error handling + idempotence/state transitions.
  - `flush` L50 — P0; unit; focus: happy path + error handling + idempotence/state transitions.
  - `close` L54 — P0; unit; focus: happy path + error handling + idempotence/state transitions.

### `xtdb-event-logger/endpoints/xtdb.ts`
- Role: persistence/output endpoint
- Priority: **P0**
- Suggested test types: db-integration
- Risk flags: db
- Functions to test:
  - `XtdbEndpoint` L12 — P0; smoke; focus: constructor/import smoke + methods via integration.
  - `init` L21 — P0; integration; focus: branch/edge coverage + regression cases.
  - `emit` L48 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `flush` L58 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `close` L62 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `flushNow` L77 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `insertRow` L102 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `t` L105 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `b` L106 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `n` L107 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

### `xtdb-event-logger/env.ts`
- Role: support module
- Priority: **P1**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `getEnvironmentMeta` L10 — P1; unit; focus: empty/single/multi result sets + filters + ordering.

### `xtdb-event-logger/handlers/agent-end.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/agent-start.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/before-agent-start.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/before-provider-request.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L5 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/context.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/input.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L5 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/message-end.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/message-start.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/message-update.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/model-select.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/resources-discover.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L5 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/session-before-compact.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/session-before-fork.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/session-before-switch.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/session-before-tree.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L5 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/session-compact.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/session-directory.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L6 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/session-fork.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/session-shutdown.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L5 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/session-start.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L5 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/session-switch.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/session-tree.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/tool-call.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/tool-execution-end.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/tool-execution-start.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/tool-execution-update.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/tool-result.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/turn-end.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/turn-start.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L4 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/handlers/user-bash.ts`
- Role: event field extractor
- Priority: **P1**
- Suggested test types: unit-fixture
- Risk flags: none
- Functions to test:
  - `handler` L5 — P1; unit-fixture; focus: raw event → fields mapping incl null/missing/full payloads.

### `xtdb-event-logger/index.ts`
- Role: package/extension entrypoint
- Priority: **P0**
- Suggested test types: extension-smoke
- Risk flags: event
- Functions to test:
  - `default export` L21 — P0; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `metaFromCtx` L40 — P0; integration; focus: branch/edge coverage + regression cases.
  - `metaNoCtx` L48 — P0; integration; focus: branch/edge coverage + regression cases.
  - `capture` L58 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `emitToAll` L80 — P0; integration; focus: happy path + error handling + idempotence/state transitions.

### `xtdb-event-logger/rdf/namespaces.ts`
- Role: RDF/JSON-LD serialization helper
- Priority: **P1**
- Suggested test types: unit
- Risk flags: none
- Functions: none detected. Cover behavior through import smoke tests and parent integration paths.

### `xtdb-event-logger/rdf/serialize.ts`
- Role: RDF/JSON-LD serialization helper
- Priority: **P1**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `triplesToJsonLd` L14 — P1; unit; focus: branch/edge coverage + regression cases.

### `xtdb-event-logger/rdf/triples.ts`
- Role: RDF/JSON-LD serialization helper
- Priority: **P1**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `xsdString` L9 — P3; unit; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `xsdLong` L11 — P3; unit; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `xsdInt` L12 — P3; unit; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `xsdBoolean` L13 — P3; unit; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `pascalType` L16 — P3; unit; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `eventToTriples` L31 — P1; unit; focus: branch/edge coverage + regression cases.
  - `str` L56 — P1; unit; focus: branch/edge coverage + regression cases.
  - `num` L60 — P1; unit; focus: branch/edge coverage + regression cases.
  - `bool` L63 — P1; unit; focus: branch/edge coverage + regression cases.

### `xtdb-event-logger/router.ts`
- Role: support module
- Priority: **P0**
- Suggested test types: unit
- Risk flags: event
- Functions to test:
  - `routeEvent` L100 — P0; integration; focus: branch/edge coverage + regression cases.

### `xtdb-event-logger/sampling.ts`
- Role: support module
- Priority: **P1**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `setSamplingInterval` L23 — P1; unit; focus: branch/edge coverage + regression cases.
  - `shouldCapture` L34 — P1; unit; focus: timing boundary + accumulation + flush semantics.
  - `flushSampler` L68 — P1; unit; focus: timing boundary + accumulation + flush semantics.

### `xtdb-event-logger/types.ts`
- Role: types/contracts
- Priority: **P1**
- Suggested test types: compile / contract
- Risk flags: none
- Functions: none. Test via compile-time contract checks / schema constant snapshots if any.

### `xtdb-event-logger/util.ts`
- Role: support module
- Priority: **P1**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `uuid` L6 — P3; unit; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `trunc` L14 — P1; unit; focus: branch/edge coverage + regression cases.
  - `safeJsonSize` L24 — P1; unit; focus: branch/edge coverage + regression cases.

## xtdb-event-logger-ui — 21 file(s), 122 function(s)

Dashboard/API server plus SSR/browser views over XTDB event data.

### `xtdb-event-logger-ui/lib/db.ts`
- Role: DB access layer
- Priority: **P0**
- Suggested test types: db-integration
- Risk flags: db
- Functions to test:
  - `t` L9 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `n` L11 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `ensureTables` L14 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `getEvents` L81 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getEventsSince` L144 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getEvent` L156 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getSessions` L167 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getStats` L179 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getSessionList` L197 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getSessionEvents` L294 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getMaxSeq` L306 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getDashboardSessions` L334 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getToolUsageStats` L396 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getSessionKnowledge` L434 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getErrorPatterns` L485 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `wipeAllEvents` L515 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `getProjections` L537 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getProjects` L575 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getProject` L586 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getProjectSessions` L597 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getDecisions` L624 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getProjectDecisions` L635 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getDelegations` L663 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getSessionDelegations` L672 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getPostmortems` L701 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getProjectPostmortems` L710 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getArtifacts` L738 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getProjectArtifacts` L747 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getArtifactHistory` L758 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getSessionArtifacts` L771 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getArtifactVersionSummaries` L816 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getArtifactReadCounts` L826 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getArtifactVersionsByPath` L834 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getArtifactReadsByPath` L840 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getArtifactVersion` L846 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getAdjacentVersions` L852 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `closeDb` L879 — P0; integration; focus: happy path + error handling + idempotence/state transitions.

### `xtdb-event-logger-ui/lib/diff.ts`
- Role: support module
- Priority: **P1**
- Suggested test types: snapshot
- Risk flags: render
- Functions to test:
  - `computeLineDiff` L5 — P1; unit; focus: branch/edge coverage + regression cases.
  - `renderDiffHtml` L32 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `esc` L44 — P3; unit; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

### `xtdb-event-logger-ui/lib/format.ts`
- Role: support module
- Priority: **P1**
- Suggested test types: db-integration
- Risk flags: db
- Functions to test:
  - `relativeTime` L17 — P3; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `pick` L124 — P3; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `preview` L137 — P3; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `getDisplayFields` L166 — P1; integration; focus: empty/single/multi result sets + filters + ordering.
  - `getPopulatedFields` L181 — P1; integration; focus: empty/single/multi result sets + filters + ordering.
  - `compactEvent` L193 — P1; integration; focus: branch/edge coverage + regression cases.

### `xtdb-event-logger-ui/lib/health.ts`
- Role: support module
- Priority: **P1**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `computeHealthScore` L19 — P1; unit; focus: branch/edge coverage + regression cases.
  - `healthColor` L31 — P1; unit; focus: branch/edge coverage + regression cases.
  - `healthLabel` L40 — P1; unit; focus: branch/edge coverage + regression cases.

### `xtdb-event-logger-ui/lib/knowledge.ts`
- Role: support module
- Priority: **P1**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `generateKnowledgeMarkdown` L5 — P1; unit; focus: branch/edge coverage + regression cases.

### `xtdb-event-logger-ui/lib/markdown.ts`
- Role: support module
- Priority: **P1**
- Suggested test types: snapshot
- Risk flags: render
- Functions to test:
  - `renderMarkdown` L1 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `closeList` L40 — P1; unit; focus: happy path + error handling + idempotence/state transitions.
  - `inline` L45 — P1; unit; focus: branch/edge coverage + regression cases.
  - `esc` L54 — P3; unit; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

### `xtdb-event-logger-ui/pages/artifact-content.ts`
- Role: SSR page renderer
- Priority: **P1**
- Suggested test types: snapshot
- Risk flags: render
- Functions to test:
  - `formatSize` L6 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `shortSession` L12 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `renderArtifactContent` L14 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `showTab` L87 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `esc` L96 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

### `xtdb-event-logger-ui/pages/artifact-versions.ts`
- Role: SSR page renderer
- Priority: **P1**
- Suggested test types: snapshot
- Risk flags: render
- Functions to test:
  - `formatSize` L13 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `shortSession` L19 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `renderArtifactVersions` L21 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `toggleBlock` L119 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `esc` L128 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

### `xtdb-event-logger-ui/pages/artifacts.ts`
- Role: SSR page renderer
- Priority: **P1**
- Suggested test types: snapshot
- Risk flags: render
- Functions to test:
  - `formatSize` L9 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `renderArtifacts` L23 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `filterArtifacts` L114 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `esc` L126 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

### `xtdb-event-logger-ui/pages/dashboard.ts`
- Role: SSR page renderer
- Priority: **P1**
- Suggested test types: snapshot
- Risk flags: render
- Functions to test:
  - `renderDashboard` L4 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `formatDuration` L131 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `colorHex` L139 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `esc` L145 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

### `xtdb-event-logger-ui/pages/decisions.ts`
- Role: SSR page renderer
- Priority: **P1**
- Suggested test types: snapshot
- Risk flags: render
- Functions to test:
  - `renderDecisions` L19 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `renderProjectDecisionsSection` L87 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `esc` L126 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

### `xtdb-event-logger-ui/pages/event-detail.ts`
- Role: SSR page renderer
- Priority: **P1**
- Suggested test types: snapshot
- Risk flags: render
- Functions to test:
  - `isContentField` L16 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `prettyPrint` L22 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `renderEventDetail` L33 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `toggleBlock` L144 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `expandAll` L150 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `copyBlock` L158 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `copyJsonLd` L165 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `esc` L177 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

### `xtdb-event-logger-ui/pages/flow.ts`
- Role: SSR page renderer
- Priority: **P1**
- Suggested test types: snapshot
- Risk flags: render
- Functions to test:
  - `typeColor` L14 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `eventLink` L18 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `parseJsonArray` L22 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `renderCardBody` L32 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `isEmptyTrace` L122 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `renderFullCard` L129 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `renderCollapsedGroup` L140 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `renderFlow` L168 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `flushEmpty` L177 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `esc` L365 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `truncate` L369 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.

### `xtdb-event-logger-ui/pages/index.ts`
- Role: SSR page renderer
- Priority: **P1**
- Suggested test types: snapshot
- Risk flags: render
- Functions to test:
  - `renderIndex` L10 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `esc` L72 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

### `xtdb-event-logger-ui/pages/knowledge.ts`
- Role: SSR page renderer
- Priority: **P1**
- Suggested test types: snapshot
- Risk flags: render
- Functions to test:
  - `renderKnowledge` L3 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `esc` L56 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

### `xtdb-event-logger-ui/pages/projects.ts`
- Role: SSR page renderer
- Priority: **P1**
- Suggested test types: snapshot
- Risk flags: render
- Functions to test:
  - `renderProjects` L13 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `renderProjectDetail` L76 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `esc` L156 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

### `xtdb-event-logger-ui/pages/session-detail.ts`
- Role: SSR page renderer
- Priority: **P1**
- Suggested test types: snapshot
- Risk flags: render
- Functions to test:
  - `ctxHealthColor` L9 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `renderSparkline` L17 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `renderSessionDetail` L90 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `formatDuration` L219 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `esc` L232 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

### `xtdb-event-logger-ui/pages/sessions.ts`
- Role: SSR page renderer
- Priority: **P1**
- Suggested test types: snapshot
- Risk flags: render
- Functions to test:
  - `renderSessions` L10 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `formatDuration` L90 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `esc` L103 — P3; snapshot; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

### `xtdb-event-logger-ui/server.ts`
- Role: HTTP/WebSocket server
- Priority: **P0**
- Suggested test types: integration, snapshot
- Risk flags: http, render
- Functions: none detected. Test the exported routes/side effects through HTTP integration against a real in-memory server instance.

### `xtdb-event-logger-ui/static/session.js`
- Role: browser/client script
- Priority: **P1**
- Suggested test types: fs-integration, snapshot
- Risk flags: fs, render
- Functions to test:
  - `closeToolExec` L118 — P1; integration; focus: happy path + error handling + idempotence/state transitions.
  - `closeTurn` L130 — P1; integration; focus: happy path + error handling + idempotence/state transitions.
  - `closeAgentRun` L140 — P1; integration; focus: happy path + error handling + idempotence/state transitions.
  - `renderItems` L151 — P1; snapshot; focus: empty/populated states + escaping/XSS safety.
  - `countEvents` L191 — P1; integration; focus: branch/edge coverage + regression cases.
  - `esc` L226 — P3; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

### `xtdb-event-logger-ui/static/stream.js`
- Role: browser/client script
- Priority: **P1**
- Suggested test types: fs-integration, snapshot
- Risk flags: fs, render
- Functions to test:
  - `connect` L29 — P1; integration; focus: happy path + error handling + idempotence/state transitions.
  - `addCard` L64 — P1; integration; focus: branch/edge coverage + regression cases.
  - `passesFilter` L116 — P1; integration; focus: branch/edge coverage + regression cases.
  - `refilterCards` L150 — P1; integration; focus: branch/edge coverage + regression cases.
  - `updateStats` L180 — P1; integration; focus: branch/edge coverage + regression cases.
  - `relativeTime` L196 — P3; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `esc` L205 — P3; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.

## xtdb-projector — 5 file(s), 16 function(s)

Semantic projections over raw events.

### `xtdb-projector/accumulator.ts`
- Role: support module
- Priority: **P0**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `freshTurn` L6 — P0; unit; focus: branch/edge coverage + regression cases.
  - `createRunState` L22 — P0; unit; focus: branch/edge coverage + regression cases.
  - `accumulate` L53 — P0; unit; focus: branch/edge coverage + regression cases.

### `xtdb-projector/index.ts`
- Role: package/extension entrypoint
- Priority: **P0**
- Suggested test types: db-integration, extension-smoke
- Risk flags: db, event
- Functions to test:
  - `default export` L8 — P0; extension-integration; focus: registration + lifecycle hooks + state reset.
  - `getSql` L14 — P0; integration; focus: empty/single/multi result sets + filters + ordering.
  - `emit` L32 — P0; integration; focus: happy path + error handling + idempotence/state transitions.
  - `t` L37 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `n` L38 — P2; integration; focus: cover indirectly via parent integration; add direct unit test only if formatting/serialization bugs appear.
  - `asRecord` L95 — P0; integration; focus: branch/edge coverage + regression cases.
  - `realId` L103 — P0; integration; focus: branch/edge coverage + regression cases.

### `xtdb-projector/mutations.ts`
- Role: support module
- Priority: **P1**
- Suggested test types: fs-integration
- Risk flags: fs
- Functions to test:
  - `isMutation` L21 — P1; integration; focus: branch/edge coverage + regression cases.
  - `inputSummary` L36 — P1; integration; focus: branch/edge coverage + regression cases.

### `xtdb-projector/projectors.ts`
- Role: support module
- Priority: **P2**
- Suggested test types: unit
- Risk flags: none
- Functions to test:
  - `projectTask` L15 — P2; unit; focus: branch/edge coverage + regression cases.
  - `projectReasoning` L33 — P2; unit; focus: branch/edge coverage + regression cases.
  - `projectResult` L60 — P2; unit; focus: branch/edge coverage + regression cases.
  - `projectChanges` L79 — P2; unit; focus: branch/edge coverage + regression cases.

### `xtdb-projector/types.ts`
- Role: types/contracts
- Priority: **P3**
- Suggested test types: compile / contract
- Risk flags: none
- Functions: none. Test via compile-time contract checks / schema constant snapshots if any.

## yak-shave — 1 file(s), 1 function(s)

Repository package / extension module.

### `yak-shave/index.ts`
- Role: package/extension entrypoint
- Priority: **P1**
- Suggested test types: extension-smoke
- Risk flags: event, tool
- Functions to test:
  - `default export` L26 — P1; extension-integration; focus: registration + lifecycle hooks + state reset.
