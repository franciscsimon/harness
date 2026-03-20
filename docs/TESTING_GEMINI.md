# 🧪 Codebase Testing Report

> **Summary**: Identified **450** testable units (functions/methods) across **119** source files.

This document provides a systematic, function-level analysis of the `harness` codebase. It inventories all source files, classes, and functions to assist in defining and tracking testing requirements.

## 📄 File: `agent-spawner/agents.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `parseFrontmatter` | ❌ No | |
| **Function** | `discoverAgents` | ✅ Yes | |
| **Function** | `formatAgentList` | ✅ Yes | |

## 📄 File: `agent-spawner/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `ensureDb` | ❌ No | |
| **Function** | `persistDelegation` | ❌ No | |
| **Arrow Function** | `t` | ❌ No | |
| **Arrow Function** | `n` | ❌ No | |
| **Function** | `formatAge` | ❌ No | |
| **Function** | `runSubagent` | ❌ No | |

## 📄 File: `alignment-monitor/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `reset` | ❌ No | |
| **Function** | `extractPaths` | ❌ No | |

## 📄 File: `artifact-tracker/commands.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `cmdList` | ✅ Yes | |
| **Function** | `cmdRestore` | ✅ Yes | |
| **Function** | `cmdHistory` | ✅ Yes | |

## 📄 File: `artifact-tracker/db.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `ensureDb` | ✅ Yes | |
| **Function** | `bootstrapTable` | ❌ No | |
| **Function** | `typed` | ✅ Yes | |
| **Function** | `typedNum` | ✅ Yes | |
| **Function** | `closeDb` | ✅ Yes | |

## 📄 File: `artifact-tracker/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `trackArtifactRead` | ❌ No | |
| **Arrow Function** | `t` | ❌ No | |
| **Arrow Function** | `n` | ❌ No | |
| **Arrow Function** | `t` | ❌ No | |
| **Arrow Function** | `n` | ❌ No | |
| **Function** | `inferKind` | ❌ No | |

## 📄 File: `artifact-tracker/provenance.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `collectSessionIds` | ❌ No | |
| **Function** | `collectProvenanceGraph` | ❌ No | |
| **Function** | `deduplicateById` | ❌ No | |
| **Function** | `cmdExportProvenance` | ✅ Yes | |

## 📄 File: `artifact-tracker/versioning.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `nextVersion` | ❌ No | |
| **Function** | `buildVersionJsonLd` | ❌ No | |
| **Function** | `findPriorVersionId` | ❌ No | |
| **Function** | `captureVersion` | ✅ Yes | |
| **Arrow Function** | `t` | ❌ No | |
| **Arrow Function** | `n` | ❌ No | |
| **Function** | `cleanupArtifacts` | ✅ Yes | |
| **Function** | `clearVersionState` | ✅ Yes | |

## 📄 File: `canary-monitor/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `reset` | ❌ No | |

## 📄 File: `canary-monitor/metrics.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `computeToolFailureRate` | ✅ Yes | |
| **Function** | `computeTurnInflation` | ✅ Yes | |
| **Function** | `computeContextBloat` | ✅ Yes | |
| **Function** | `detectRetryStorm` | ✅ Yes | |
| **Function** | `computeDuration` | ✅ Yes | |
| **Function** | `computeToolDensity` | ✅ Yes | |

## 📄 File: `chunker/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `reset` | ❌ No | |
| **Function** | `progressBar` | ❌ No | |
| **Function** | `findNextUndone` | ❌ No | |
| **Function** | `saveState` | ❌ No | |

## 📄 File: `contextual-prompts/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `loadConfig` | ❌ No | |
| **Function** | `saveConfig` | ❌ No | |
| **Function** | `canFire` | ❌ No | |
| **Function** | `fire` | ❌ No | |
| **Function** | `findPrompt` | ❌ No | |

## 📄 File: `data-examples/extract.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `main` | ❌ No | |

## 📄 File: `data-examples/test-xtdb-insert.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `main` | ❌ No | |
| **Arrow Function** | `t` | ❌ No | |
| **Arrow Function** | `b` | ❌ No | |
| **Arrow Function** | `n` | ❌ No | |

## 📄 File: `decision-log/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `connectXtdb` | ❌ No | |
| **Function** | `getProjectDecisions` | ❌ No | |
| **Arrow Function** | `t` | ❌ No | |
| **Function** | `formatDecisionsForContext` | ❌ No | |
| **Arrow Function** | `t` | ❌ No | |
| **Arrow Function** | `n` | ❌ No | |

## 📄 File: `decision-log/rdf.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `buildDecisionJsonLd` | ✅ Yes | |

## 📄 File: `examples/hello-service/test.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `run` | ❌ No | |

## 📄 File: `git-checkpoint/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `isGitRepo` | ❌ No | |
| **Function** | `stash` | ❌ No | |

## 📄 File: `habit-monitor/habits.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `checkCommitHabit` | ✅ Yes | |
| **Function** | `checkTestHabit` | ✅ Yes | |
| **Function** | `checkErrorStreak` | ✅ Yes | |
| **Function** | `checkScopeCreep` | ✅ Yes | |
| **Function** | `checkFreshStart` | ✅ Yes | |

## 📄 File: `habit-monitor/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `reset` | ❌ No | |
| **Function** | `isSnoozed` | ❌ No | |

## 📄 File: `happy-to-delete/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `reset` | ❌ No | |

## 📄 File: `history-retrieval/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `ensureDb` | ❌ No | |
| **Arrow Function** | `t` | ❌ No | |
| **Function** | `extractPaths` | ❌ No | |
| **Function** | `truncFiles` | ❌ No | |

## 📄 File: `knowledge-checkpoint/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `reset` | ❌ No | |
| **Function** | `getSessionSlug` | ❌ No | |
| **Function** | `saveCheckpoint` | ❌ No | |

## 📄 File: `knowledge-extractor/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `reset` | ❌ No | |

## 📄 File: `leap-detector/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `reset` | ❌ No | |

## 📄 File: `project-registry/identity.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `resolveProject` | ✅ Yes | |
| **Function** | `projectId` | ✅ Yes | |

## 📄 File: `project-registry/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `makeExecFn` | ❌ No | |
| **Function** | `connectXtdb` | ❌ No | |
| **Function** | `upsertProject` | ❌ No | |
| **Arrow Function** | `t` | ❌ No | |
| **Arrow Function** | `n` | ❌ No | |
| **Function** | `insertSessionLink` | ❌ No | |
| **Arrow Function** | `t` | ❌ No | |
| **Arrow Function** | `b` | ❌ No | |
| **Arrow Function** | `n` | ❌ No | |

## 📄 File: `project-registry/normalize.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `normalizeGitUrl` | ✅ Yes | |
| **Function** | `stripSuffix` | ❌ No | |

## 📄 File: `project-registry/rdf.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `buildProjectJsonLd` | ✅ Yes | |
| **Function** | `buildSessionProjectJsonLd` | ✅ Yes | |

## 📄 File: `projection-architecture.jsx`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `Arrow` | ❌ No | |
| **Function** | `ProjectionArchitecture` | ✅ Yes | |

## 📄 File: `quality-hooks/checks.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `detectComments` | ✅ Yes | |
| **Function** | `detectLargeFile` | ✅ Yes | |
| **Function** | `detectLargeFunctions` | ✅ Yes | |
| **Function** | `detectDuplication` | ✅ Yes | |
| **Function** | `detectUnusedExports` | ✅ Yes | |
| **Function** | `checkDiffSize` | ✅ Yes | |
| **Function** | `runFileChecks` | ✅ Yes | |

## 📄 File: `quality-hooks/mock-pi.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `createMockPi` | ✅ Yes | |

## 📄 File: `reference-docs/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `docPaths` | ❌ No | |
| **Function** | `findAllDocs` | ❌ No | |

## 📄 File: `refinement-loop/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `reset` | ❌ No | |

## 📄 File: `reminders/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `ensureFile` | ❌ No | |
| **Function** | `readReminders` | ❌ No | |
| **Function** | `writeReminders` | ❌ No | |

## 📄 File: `role-loader/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `discoverRoles` | ❌ No | |

## 📄 File: `session-postmortem/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `emptyState` | ❌ No | |
| **Function** | `connectDb` | ❌ No | |
| **Arrow Function** | `t` | ❌ No | |
| **Arrow Function** | `n` | ❌ No | |

## 📄 File: `slop-detector/detectors.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `detectAiSlop` | ✅ Yes | |
| **Function** | `detectAnswerInjection` | ✅ Yes | |
| **Function** | `detectObsessOverRules` | ✅ Yes | |
| **Function** | `detectPerfectRecallFallacy` | ✅ Yes | |
| **Function** | `detectTellMeALie` | ✅ Yes | |
| **Function** | `runAllDetectors` | ✅ Yes | |

## 📄 File: `slop-detector/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `freshState` | ❌ No | |

## 📄 File: `sunk-cost-detector/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `reset` | ❌ No | |
| **Function** | `connectDb` | ❌ No | |
| **Arrow Function** | `t` | ❌ No | |
| **Arrow Function** | `t` | ❌ No | |
| **Arrow Function** | `n` | ❌ No | |

## 📄 File: `test/ext-load-test.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `ok` | ❌ No | |
| **Function** | `fail` | ❌ No | |

## 📄 File: `test/handler-tests.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `test` | ❌ No | |
| **Function** | `safeStringify` | ❌ No | |
| **Function** | `run` | ❌ No | |

## 📄 File: `test/mock-pi.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `createMockPi` | ✅ Yes | |

## 📄 File: `test/run-tests.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `t` | ❌ No | |
| **Arrow Function** | `n` | ❌ No | |
| **Function** | `pass` | ❌ No | |
| **Function** | `fail` | ❌ No | |
| **Function** | `skip` | ❌ No | |
| **Function** | `assert` | ❌ No | |
| **Function** | `fetchOk` | ❌ No | |
| **Function** | `testInfrastructure` | ❌ No | |
| **Function** | `testContextMarkers` | ❌ No | |
| **Function** | `testTemplates` | ❌ No | |
| **Function** | `testCanaryMetrics` | ❌ No | |
| **Function** | `testHabitHooks` | ❌ No | |
| **Function** | `testDashboard` | ❌ No | |
| **Function** | `testKnowledge` | ❌ No | |
| **Function** | `main` | ❌ No | |

## 📄 File: `test/seed-augmented-patterns.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `t` | ❌ No | |
| **Arrow Function** | `n` | ❌ No | |
| **Arrow Function** | `b` | ❌ No | |
| **Function** | `nextSeq` | ❌ No | |
| **Function** | `uuid` | ❌ No | |
| **Function** | `insert` | ❌ No | |
| **Function** | `seedSession` | ❌ No | |
| **Function** | `main` | ❌ No | |

## 📄 File: `test/smoke-test.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `ok` | ❌ No | |
| **Function** | `fail` | ❌ No | |
| **Function** | `assert` | ❌ No | |

## 📄 File: `test/test-handler.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `testHandler` | ❌ No | |
| **Function** | `main` | ❌ No | |

## 📄 File: `web-chat/lib/session-pool.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `resolveDialog` | ✅ Yes | |
| **Function** | `requestDialog` | ❌ No | |
| **Function** | `buildUiContext` | ❌ No | |
| **Function** | `createPoolSession` | ✅ Yes | |
| **Function** | `getPoolSession` | ✅ Yes | |
| **Function** | `setUnsubscribe` | ✅ Yes | |
| **Function** | `destroyPoolSession` | ✅ Yes | |
| **Function** | `poolSize` | ✅ Yes | |
| **Function** | `setSessionModel` | ✅ Yes | |
| **Function** | `getContextUsageInfo` | ✅ Yes | |
| **Function** | `getSessionStatsInfo` | ✅ Yes | |
| **Function** | `getSessionInfo` | ✅ Yes | |
| **Function** | `extractHistory` | ✅ Yes | |
| **Function** | `getForkPoints` | ✅ Yes | |
| **Function** | `getAvailableCommands` | ✅ Yes | |

## 📄 File: `web-chat/lib/ws-protocol.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `parseClientMessage` | ✅ Yes | |
| **Function** | `send` | ✅ Yes | |

## 📄 File: `web-chat/pages/chat.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `renderChat` | ✅ Yes | |

## 📄 File: `web-chat/server.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `sendContextUsage` | ❌ No | |
| **Function** | `sendStats` | ❌ No | |
| **Function** | `sendFullState` | ❌ No | |
| **Function** | `subscribeSession` | ❌ No | |
| **Function** | `initConnection` | ❌ No | |
| **Arrow Function** | `wsSend` | ❌ No | |

## 📄 File: `web-chat/static/chat.js`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `connect` | ❌ No | |
| **Function** | `wsSend` | ❌ No | |
| **Function** | `handleMessage` | ❌ No | |
| **Function** | `updateSessionInfo` | ❌ No | |
| **Function** | `fetchDecisionsAndArtifacts` | ❌ No | |
| **Function** | `renderDecisions` | ❌ No | |
| **Function** | `renderArtifacts` | ❌ No | |
| **Function** | `updateStats` | ❌ No | |
| **Function** | `setState` | ❌ No | |
| **Function** | `startAssistantBubble` | ❌ No | |
| **Function** | `appendText` | ❌ No | |
| **Function** | `appendThinking` | ❌ No | |
| **Function** | `toolSummaryHint` | ❌ No | |
| **Function** | `shortenPath` | ❌ No | |
| **Function** | `tryParseJson` | ❌ No | |
| **Function** | `startTool` | ❌ No | |
| **Function** | `updateTool` | ❌ No | |
| **Function** | `endTool` | ❌ No | |
| **Function** | `findTool` | ❌ No | |
| **Function** | `finalizeBubble` | ❌ No | |
| **Function** | `addUserBubble` | ❌ No | |
| **Function** | `showError` | ❌ No | |
| **Function** | `showNotify` | ❌ No | |
| **Function** | `showExtStatus` | ❌ No | |
| **Function** | `renderWorkflowSidebar` | ❌ No | |
| **Function** | `showSystemMsg` | ❌ No | |
| **Function** | `renderHistory` | ❌ No | |
| **Function** | `updateContextUsage` | ❌ No | |
| **Function** | `formatTokens` | ❌ No | |
| **Function** | `sendPrompt` | ❌ No | |
| **Function** | `autoResize` | ❌ No | |
| **Function** | `scrollDown` | ❌ No | |
| **Function** | `renderMd` | ❌ No | |
| **Function** | `inline` | ❌ No | |
| **Function** | `showCommandList` | ❌ No | |
| **Function** | `showAutocomplete` | ❌ No | |
| **Function** | `hideAutocomplete` | ❌ No | |
| **Function** | `handleConfirm` | ❌ No | |
| **Function** | `handleSelect` | ❌ No | |
| **Function** | `handleInput` | ❌ No | |
| **Function** | `showDialogOverlay` | ❌ No | |
| **Function** | `respond` | ❌ No | |
| **Function** | `el` | ❌ No | |
| **Function** | `esc` | ❌ No | |

## 📄 File: `workflow-engine/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `emptyState` | ❌ No | |
| **Function** | `progressBar` | ❌ No | |
| **Function** | `currentStepDef` | ❌ No | |
| **Function** | `statusPayload` | ❌ No | |
| **Function** | `ensureWorkflowsLoaded` | ❌ No | |
| **Function** | `formatWorkflowList` | ❌ No | |
| **Function** | `saveState` | ❌ No | |
| **Function** | `activateWorkflow` | ❌ No | |
| **Function** | `advanceStep` | ❌ No | |
| **Function** | `skipStep` | ❌ No | |
| **Function** | `abandonWorkflow` | ❌ No | |

## 📄 File: `workflow-engine/rdf/workflow-graph.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `loadWorkflowFile` | ✅ Yes | |
| **Function** | `loadWorkflowDir` | ✅ Yes | |
| **Function** | `getStringValue` | ❌ No | |
| **Function** | `getIntValue` | ❌ No | |

## 📄 File: `workflow-engine/test-load.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `main` | ❌ No | |

## 📄 File: `xtdb-event-logger/endpoints/console.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Class** | `ConsoleEndpoint` | ✅ Yes | |
| Method | `ConsoleEndpoint.init` | N/A | |
| Method | `ConsoleEndpoint.emit` | N/A | |
| Method | `ConsoleEndpoint.flush` | N/A | |
| Method | `ConsoleEndpoint.close` | N/A | |

## 📄 File: `xtdb-event-logger/endpoints/jsonl.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Class** | `JsonlEndpoint` | ✅ Yes | |
| Method | `JsonlEndpoint.init` | N/A | |
| Method | `JsonlEndpoint.emit` | N/A | |
| Method | `JsonlEndpoint.flush` | N/A | |
| Method | `JsonlEndpoint.close` | N/A | |

## 📄 File: `xtdb-event-logger/endpoints/xtdb.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Class** | `XtdbEndpoint` | ✅ Yes | |
| Method | `XtdbEndpoint.init` | N/A | |
| Method | `XtdbEndpoint.emit` | N/A | |
| Method | `XtdbEndpoint.flush` | N/A | |
| Method | `XtdbEndpoint.close` | N/A | |
| Method | `XtdbEndpoint.flushNow` | N/A | |
| Method | `XtdbEndpoint.insertRow` | N/A | |
| **Arrow Function** | `t` | ❌ No | |
| **Arrow Function** | `b` | ❌ No | |
| **Arrow Function** | `n` | ❌ No | |

## 📄 File: `xtdb-event-logger/env.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `getEnvironmentMeta` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/agent-end.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/agent-start.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/before-agent-start.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/before-provider-request.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/context.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/input.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/message-end.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/message-start.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/message-update.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/model-select.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/resources-discover.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/session-before-compact.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/session-before-fork.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/session-before-switch.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/session-before-tree.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/session-compact.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/session-directory.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/session-fork.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/session-shutdown.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/session-start.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/session-switch.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/session-tree.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/tool-call.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/tool-execution-end.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/tool-execution-start.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/tool-execution-update.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/tool-result.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/turn-end.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/turn-start.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/handlers/user-bash.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `handler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `metaFromCtx` | ❌ No | |
| **Function** | `metaNoCtx` | ❌ No | |
| **Function** | `capture` | ❌ No | |
| **Function** | `emitToAll` | ❌ No | |

## 📄 File: `xtdb-event-logger/rdf/serialize.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `triplesToJsonLd` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/rdf/triples.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `xsdString` | ❌ No | |
| **Arrow Function** | `xsdLong` | ❌ No | |
| **Arrow Function** | `xsdInt` | ❌ No | |
| **Arrow Function** | `xsdBoolean` | ❌ No | |
| **Function** | `pascalType` | ❌ No | |
| **Function** | `eventToTriples` | ✅ Yes | |
| **Arrow Function** | `str` | ❌ No | |
| **Arrow Function** | `num` | ❌ No | |
| **Arrow Function** | `bool` | ❌ No | |

## 📄 File: `xtdb-event-logger/router.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `routeEvent` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/sampling.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `setSamplingInterval` | ✅ Yes | |
| **Function** | `shouldCapture` | ✅ Yes | |
| **Function** | `flushSampler` | ✅ Yes | |

## 📄 File: `xtdb-event-logger/util.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `uuid` | ✅ Yes | |
| **Function** | `trunc` | ✅ Yes | |
| **Function** | `safeJsonSize` | ✅ Yes | |

## 📄 File: `xtdb-event-logger-ui/lib/db.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Arrow Function** | `t` | ❌ No | |
| **Arrow Function** | `n` | ❌ No | |
| **Function** | `ensureTables` | ❌ No | |
| **Function** | `getEvents` | ✅ Yes | |
| **Function** | `getEventsSince` | ✅ Yes | |
| **Function** | `getEvent` | ✅ Yes | |
| **Function** | `getSessions` | ✅ Yes | |
| **Function** | `getStats` | ✅ Yes | |
| **Function** | `getSessionList` | ✅ Yes | |
| **Function** | `getSessionEvents` | ✅ Yes | |
| **Function** | `getMaxSeq` | ✅ Yes | |
| **Function** | `getDashboardSessions` | ✅ Yes | |
| **Function** | `getToolUsageStats` | ✅ Yes | |
| **Function** | `getSessionKnowledge` | ✅ Yes | |
| **Function** | `getErrorPatterns` | ✅ Yes | |
| **Function** | `wipeAllEvents` | ✅ Yes | |
| **Function** | `getProjections` | ✅ Yes | |
| **Function** | `getProjects` | ✅ Yes | |
| **Function** | `getProject` | ✅ Yes | |
| **Function** | `getProjectSessions` | ✅ Yes | |
| **Function** | `getDecisions` | ✅ Yes | |
| **Function** | `getProjectDecisions` | ✅ Yes | |
| **Function** | `getDelegations` | ✅ Yes | |
| **Function** | `getSessionDelegations` | ✅ Yes | |
| **Function** | `getPostmortems` | ✅ Yes | |
| **Function** | `getProjectPostmortems` | ✅ Yes | |
| **Function** | `getArtifacts` | ✅ Yes | |
| **Function** | `getProjectArtifacts` | ✅ Yes | |
| **Function** | `getArtifactHistory` | ✅ Yes | |
| **Function** | `getSessionArtifacts` | ✅ Yes | |
| **Function** | `getArtifactVersionSummaries` | ✅ Yes | |
| **Function** | `getArtifactReadCounts` | ✅ Yes | |
| **Function** | `getArtifactVersionsByPath` | ✅ Yes | |
| **Function** | `getArtifactReadsByPath` | ✅ Yes | |
| **Function** | `getArtifactVersion` | ✅ Yes | |
| **Function** | `getAdjacentVersions` | ✅ Yes | |
| **Function** | `closeDb` | ✅ Yes | |

## 📄 File: `xtdb-event-logger-ui/lib/diff.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `computeLineDiff` | ✅ Yes | |
| **Function** | `renderDiffHtml` | ✅ Yes | |
| **Function** | `esc` | ❌ No | |

## 📄 File: `xtdb-event-logger-ui/lib/format.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `relativeTime` | ✅ Yes | |
| **Function** | `pick` | ❌ No | |
| **Function** | `preview` | ❌ No | |
| **Function** | `getDisplayFields` | ✅ Yes | |
| **Function** | `getPopulatedFields` | ✅ Yes | |
| **Function** | `compactEvent` | ✅ Yes | |

## 📄 File: `xtdb-event-logger-ui/lib/health.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `computeHealthScore` | ✅ Yes | |
| **Function** | `healthColor` | ✅ Yes | |
| **Function** | `healthLabel` | ✅ Yes | |

## 📄 File: `xtdb-event-logger-ui/lib/knowledge.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `generateKnowledgeMarkdown` | ✅ Yes | |

## 📄 File: `xtdb-event-logger-ui/lib/markdown.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `renderMarkdown` | ✅ Yes | |
| **Function** | `closeList` | ❌ No | |
| **Function** | `inline` | ❌ No | |
| **Function** | `esc` | ❌ No | |

## 📄 File: `xtdb-event-logger-ui/pages/artifact-content.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `formatSize` | ❌ No | |
| **Function** | `shortSession` | ❌ No | |
| **Function** | `renderArtifactContent` | ✅ Yes | |
| **Function** | `esc` | ❌ No | |

## 📄 File: `xtdb-event-logger-ui/pages/artifact-versions.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `formatSize` | ❌ No | |
| **Function** | `shortSession` | ❌ No | |
| **Function** | `renderArtifactVersions` | ✅ Yes | |
| **Function** | `esc` | ❌ No | |

## 📄 File: `xtdb-event-logger-ui/pages/artifacts.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `formatSize` | ❌ No | |
| **Function** | `renderArtifacts` | ✅ Yes | |
| **Function** | `esc` | ❌ No | |

## 📄 File: `xtdb-event-logger-ui/pages/dashboard.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `renderDashboard` | ✅ Yes | |
| **Function** | `formatDuration` | ❌ No | |
| **Function** | `colorHex` | ❌ No | |
| **Function** | `esc` | ❌ No | |

## 📄 File: `xtdb-event-logger-ui/pages/decisions.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `renderDecisions` | ✅ Yes | |
| **Function** | `renderProjectDecisionsSection` | ✅ Yes | |
| **Function** | `esc` | ❌ No | |

## 📄 File: `xtdb-event-logger-ui/pages/event-detail.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `isContentField` | ❌ No | |
| **Function** | `prettyPrint` | ❌ No | |
| **Function** | `renderEventDetail` | ✅ Yes | |
| **Function** | `esc` | ❌ No | |

## 📄 File: `xtdb-event-logger-ui/pages/flow.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `typeColor` | ❌ No | |
| **Function** | `eventLink` | ❌ No | |
| **Function** | `parseJsonArray` | ❌ No | |
| **Function** | `renderCardBody` | ❌ No | |
| **Function** | `isEmptyTrace` | ❌ No | |
| **Function** | `renderFullCard` | ❌ No | |
| **Function** | `renderCollapsedGroup` | ❌ No | |
| **Function** | `renderFlow` | ✅ Yes | |
| **Function** | `flushEmpty` | ❌ No | |
| **Function** | `esc` | ❌ No | |
| **Function** | `truncate` | ❌ No | |

## 📄 File: `xtdb-event-logger-ui/pages/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `renderIndex` | ✅ Yes | |
| **Function** | `esc` | ❌ No | |

## 📄 File: `xtdb-event-logger-ui/pages/knowledge.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `renderKnowledge` | ✅ Yes | |
| **Function** | `esc` | ❌ No | |

## 📄 File: `xtdb-event-logger-ui/pages/projects.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `renderProjects` | ✅ Yes | |
| **Function** | `renderProjectDetail` | ✅ Yes | |
| **Function** | `esc` | ❌ No | |

## 📄 File: `xtdb-event-logger-ui/pages/session-detail.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `ctxHealthColor` | ❌ No | |
| **Function** | `renderSparkline` | ❌ No | |
| **Function** | `renderSessionDetail` | ✅ Yes | |
| **Function** | `formatDuration` | ❌ No | |
| **Function** | `esc` | ❌ No | |

## 📄 File: `xtdb-event-logger-ui/pages/sessions.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `renderSessions` | ✅ Yes | |
| **Function** | `formatDuration` | ❌ No | |
| **Function** | `esc` | ❌ No | |

## 📄 File: `xtdb-event-logger-ui/static/session.js`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `closeToolExec` | ❌ No | |
| **Function** | `closeTurn` | ❌ No | |
| **Function** | `closeAgentRun` | ❌ No | |
| **Function** | `renderItems` | ❌ No | |
| **Function** | `countEvents` | ❌ No | |
| **Function** | `esc` | ❌ No | |

## 📄 File: `xtdb-event-logger-ui/static/stream.js`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `connect` | ❌ No | |
| **Function** | `addCard` | ❌ No | |
| **Function** | `passesFilter` | ❌ No | |
| **Function** | `refilterCards` | ❌ No | |
| **Function** | `updateStats` | ❌ No | |
| **Function** | `relativeTime` | ❌ No | |
| **Function** | `esc` | ❌ No | |

## 📄 File: `xtdb-projector/accumulator.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `freshTurn` | ❌ No | |
| **Function** | `createRunState` | ✅ Yes | |
| **Function** | `accumulate` | ✅ Yes | |

## 📄 File: `xtdb-projector/index.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `getSql` | ❌ No | |
| **Function** | `emit` | ❌ No | |
| **Arrow Function** | `t` | ❌ No | |
| **Arrow Function** | `n` | ❌ No | |
| **Function** | `asRecord` | ❌ No | |
| **Function** | `realId` | ❌ No | |

## 📄 File: `xtdb-projector/mutations.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `isMutation` | ✅ Yes | |
| **Function** | `inputSummary` | ✅ Yes | |

## 📄 File: `xtdb-projector/projectors.ts`

| Type | Name | Exported | Notes / Test Coverage |
|------|------|----------|-----------------------|
| **Function** | `projectTask` | ✅ Yes | |
| **Function** | `projectReasoning` | ✅ Yes | |
| **Function** | `projectResult` | ✅ Yes | |
| **Function** | `projectChanges` | ✅ Yes | |

