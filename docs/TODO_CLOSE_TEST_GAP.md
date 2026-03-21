# TODO: Close Test Coverage Gap (44/292 → 292/292)

## Current State (2026-03-21)

- **44 tested** (15%), **249 untested** (85%) out of 292 exported functions
- Tested via: `test/pure-functions.ts` (10 modules), `test/handler-tests.ts` (14 handlers), `test/ext-load-test.ts`, `lib/test-shared.ts`
- Constraint: **black-box contract tests only** — use fetch/SQL/WebSocket, zero application code imports for integration tests. Pure unit tests can import source directly.
- Tracking: re-run `parse-call-graph.ts` + `export-xtdb-triples.ts` + `qlever-index.sh` and check the Test Coverage query on `/graph` after each batch

## Testing Strategy

| Category | Count | Approach | Test file |
|----------|-------|----------|-----------|
| Pure functions (sync, no I/O) | 133 | Direct import + assert | `test/pure-functions.ts` (extend) |
| Async functions (DB/HTTP/fs) | 80 | Contract tests via fetch/SQL | `test/contracts/*.ts` (extend) |
| UI render functions | 36 | HTTP GET + check HTML contains | `test/contracts/api-harness-ui.ts` (extend) |

## Phase 1: Pure Functions (133 → 0 untested)

Easiest — import and call, no mocks needed. Add to `test/pure-functions.ts`.

### Batch 1.1 — Utilities & Formatters (est. 30 min)
- [ ] `harness-ui/lib/format.ts`: escapeHtml, formatDate, formatDuration, formatNumber, healthColor, relativeTime, truncate (7)
- [ ] `harness-ui/lib/health.ts`: computeHealthScore, healthColor, healthLabel (3)
- [ ] `harness-ui/components/badge.ts`: badge, healthDot (2)
- [ ] `harness-ui/components/table.ts`: renderTable (1)
- [ ] `lib/db.ts`: b, n, t (3) — SQL template tag helpers
- [ ] `lib/jsonld/context.ts`: personAgent (1)

### Batch 1.2 — Domain Logic (est. 45 min)
- [ ] `canary-monitor/metrics.ts`: computeContextBloat, computeDuration, computeToolDensity, computeToolFailureRate, computeTurnInflation, detectRetryStorm (6)
- [ ] `habit-monitor/habits.ts`: checkCommitHabit, checkErrorStreak, checkFreshStart, checkScopeCreep, checkTestHabit (5)
- [ ] `xtdb-projector/mutations.ts`: inputSummary, isMutation (2)
- [ ] `xtdb-projector/projectors.ts`: projectChanges, projectReasoning, projectResult, projectTask (4)
- [ ] `xtdb-projector/accumulator.ts`: accumulate, createRunState (2)
- [ ] `xtdb-event-logger/rdf/serialize.ts`: triplesToJsonLd (1)
- [ ] `xtdb-event-logger/rdf/triples.ts`: eventToTriples (1)

### Batch 1.3 — Config & Identity (est. 20 min)
- [ ] `canary-monitor/config.ts`: loadCanaryConfig (1)
- [ ] `habit-monitor/config.ts`: loadHabitConfig (1)
- [ ] `project-registry/identity.ts`: projectId, resolveProject (2)
- [ ] `project-registry/registry.ts`: getRegistry (1)
- [ ] `project-registry/heuristics.ts`: detectProjectFromCwd (1)
- [ ] `agent-spawner/agents.ts`: discoverAgents, formatAgentList (2)

### Batch 1.4 — Remaining Pure Functions (est. 30 min)
- [ ] `artifact-tracker/db.ts`: closeDb, ensureDb, typed, typedNum (4)
- [ ] `artifact-tracker/commands.ts`: cmdHistory, cmdList, cmdRestore (3)
- [ ] `artifact-tracker/provenance.ts`: cmdExportProvenance (1)
- [ ] `artifact-tracker/versioning.ts`: captureVersion, cleanupArtifacts, clearVersionState (3)
- [ ] `xtdb-event-logger-ui/lib/diff.ts`: renderDiffHtml (1)
- [ ] `xtdb-event-logger-ui/lib/format.ts`: compactEvent, getDisplayFields, getPopulatedFields (3)
- [ ] `xtdb-event-logger-ui/lib/knowledge.ts`: generateKnowledgeMarkdown (1)
- [ ] `deployment-tracker/index.ts`: generateChangelog (1)
- [ ] `decision-log/index.ts`: logDecision (1)
- [ ] `web-chat/lib/ws-protocol.ts`: formatServerMessage, formatToolResponse (2)

### Batch 1.5 — Event Handlers (est. 20 min)
Remaining untested handlers (14 tested already via handler-tests.ts):
- [ ] `xtdb-event-logger/handlers/session-start.ts`: handler
- [ ] `xtdb-event-logger/handlers/session-shutdown.ts`: handler
- [ ] `xtdb-event-logger/handlers/session-compact.ts`: handler
- [ ] `xtdb-event-logger/handlers/session-directory.ts`: handler
- [ ] `xtdb-event-logger/handlers/session-fork.ts`: handler
- [ ] `xtdb-event-logger/handlers/session-switch.ts`: handler
- [ ] `xtdb-event-logger/handlers/session-tree.ts`: handler
- [ ] `xtdb-event-logger/handlers/turn-start.ts`: handler
- [ ] `xtdb-event-logger/handlers/user-bash.ts`: handler
Add these to `test/handler-tests.ts` (same dynamic import pattern).

## Phase 2: Async / Infrastructure Functions (80 → 0 untested)

These need running services (XTDB, HTTP endpoints). Use contract test pattern.

### Batch 2.1 — DB Query Functions (est. 1h)
All in `xtdb-event-logger-ui/lib/db.ts` — 41 functions.
Test via SQL queries to `:5434` (replica) verifying the functions return expected shapes.
- [ ] Session queries: getSessions, getSessionList, getSessionEvents, getSessionArtifacts, getSessionDelegations, getSessionKnowledge (6)
- [ ] Event queries: getEvents, getEvent, getEventsSince, getMaxSeq, getStats (5)
- [ ] Artifact queries: getArtifacts, getArtifactHistory, getArtifactVersion, getArtifactVersionsByPath, getArtifactVersionSummaries, getArtifactReadCounts, getArtifactReadsByPath (7)
- [ ] Decision queries: getDecisions, getDelegations (2)
- [ ] Dashboard: getDashboardSessions (1)
- [ ] Error queries: getErrors, getErrorSummary, getErrorPatterns (3)
- [ ] Project queries: getProjects, getProject, getProjectSessions, getProjectArtifacts, getProjectDecisions, getProjectTags, getProjectDependencies, getProjectLifecycleEvents, getProjectDecommissions, getProjectPostmortems (10)
- [ ] Projections: getProjections (1)
- [ ] Tool stats: getToolUsageStats (1)
- [ ] Test runs: getTestRuns (1)
- [ ] Postmortems: getPostmortems (1)
- [ ] Admin: wipeAllEvents, closeDb (2)

### Batch 2.2 — API Client Functions (est. 30 min)
`harness-ui/lib/api.ts` — 25 functions. All are HTTP fetch wrappers.
Test via contract tests: start harness-ui, fetch each endpoint, verify response shape.
- [ ] Stats/dashboard: fetchStats, fetchDashboard (2)
- [ ] Session: fetchSessionList, fetchSessionEvents (2)
- [ ] Events: fetchEvent (1)
- [ ] Artifacts: fetchArtifacts, fetchArtifactVersions (2)
- [ ] Decisions: fetchDecisions (1)
- [ ] Errors: fetchErrors, fetchErrorSummary (2)
- [ ] Projects: fetchProjects, fetchProjectDetail (2)
- [ ] Projections: fetchProjections (1)
- [ ] Knowledge: fetchKnowledge (1)
- [ ] Ops: fetchHealth, fetchReplication, fetchIncidents, fetchBackups, fetchScheduler (5)
- [ ] Test runs: fetchTestRuns (1)
- [ ] Lifecycle: fetchLifecycleEvents (1)
- [ ] Health checks: checkAllContainers, checkChatHealth, checkQleverHealth (3)
- [ ] SPARQL: sparqlQuery (1)

### Batch 2.3 — Ops API Functions (est. 1h)
`xtdb-ops-api/lib/*.ts` — 35 functions.
Test via HTTP to `:3335` (ops API).
- [ ] Health: checkAll, checkPrimary, checkReplica, checkRedpanda (4)
- [ ] Backup: startSnapshotBackup, startCsvBackup, startSnapshotRestore, restoreFromArchive, getJob (5)
- [ ] Files: listBackups, getBackupPath, getBackupDir, createDownloadStream, deleteBackup (5)
- [ ] Replica: replicaStatus, startReplica, stopReplica, startPrimary, stopPrimary (5)
- [ ] Incidents: listIncidents, getIncident, createIncident, updateIncident (4)
- [ ] Redpanda: listTopics, describeTopic, deleteTopic (3)
- [ ] Scheduler: schedulerStatus, startScheduler, stopScheduler (3)
- [ ] Auth: authMiddleware, getUser (2)
- [ ] CI: processCIEvent, verifySignature (2)
- [ ] Exec: exec (1)
- [ ] Verify: verifyBackup (1)

### Batch 2.4 — Error Handling (est. 15 min)
`lib/errors.ts`:
- [ ] captureError, startErrorCollector, stopErrorCollector, unflushedErrorCount (4)

## Phase 3: UI Render Functions (36 → 0 untested)

Test via HTTP GET + check response contains expected HTML elements.
Extend `test/contracts/api-harness-ui.ts`.

### Batch 3.1 — harness-ui Pages (est. 30 min)
- [ ] renderHome, renderSessions, renderSessionDetail, renderDashboard (4)
- [ ] renderDecisions, renderArtifacts, renderArtifactVersions (3)
- [ ] renderErrors, renderStream, renderChat, renderOps (4)
- [ ] renderProjects, renderProjectDetail (2)
- [ ] renderFlow, renderKnowledgePage, renderEventDetail (3)
- [ ] renderGraph (1)
- [ ] layout, renderNav (2)

### Batch 3.2 — xtdb-event-logger-ui Pages (est. 30 min)
These are the OLD UI pages. Once harness-ui migration is complete, these become dead code.
Decide: test them or decommission them?
- [ ] renderIndex, renderSessions, renderSessionDetail, renderEventDetail (4)
- [ ] renderDashboard, renderDecisions, renderProjectDecisionsSection (3)
- [ ] renderArtifacts, renderArtifactVersions, renderArtifactContent (3)
- [ ] renderFlow, renderKnowledge, renderOps (3)
- [ ] renderProjects, renderProjectDetail (2)

## Effort Estimate

| Phase | Functions | Effort | Priority |
|-------|-----------|--------|----------|
| 1.1 Utilities | 17 | 30 min | P0 |
| 1.2 Domain | 21 | 45 min | P0 |
| 1.3 Config | 8 | 20 min | P1 |
| 1.4 Remaining pure | 20 | 30 min | P1 |
| 1.5 Handlers | 9 | 20 min | P1 |
| 2.1 DB queries | 41 | 1h | P1 |
| 2.2 API clients | 25 | 30 min | P2 |
| 2.3 Ops API | 35 | 1h | P2 |
| 2.4 Errors | 4 | 15 min | P0 |
| 3.1 UI pages | 19 | 30 min | P2 |
| 3.2 Old UI pages | 15 | decommission | P3 |
| **Total** | **249** | **~6h** | |

## Priority Order

1. **P0 (1h 30min)**: Batches 1.1, 1.2, 2.4 — pure functions + error handling. Highest ROI.
2. **P1 (2h 35min)**: Batches 1.3, 1.4, 1.5, 2.1 — remaining pure + DB queries.
3. **P2 (2h)**: Batches 2.2, 2.3, 3.1 — API clients, ops API, UI pages.
4. **P3 (skip)**: Batch 3.2 — old UI pages, decommission instead.

## How to Track Progress

After each batch:
```bash
# Re-run the pipeline
NODE_PATH=xtdb-projector/node_modules npx jiti scripts/parse-call-graph.ts
NODE_PATH=xtdb-event-logger/node_modules npx jiti scripts/export-xtdb-triples.ts
./scripts/qlever-index.sh

# Check coverage on /graph → Test Coverage query
# Or via CLI:
curl -s http://localhost:7001/ --data-urlencode 'query=PREFIX code: <https://pi.dev/code/> PREFIX schema: <https://schema.org/> SELECT ?tested (COUNT(*) AS ?c) WHERE { ?fn a schema:DefinedTerm ; code:isExported true . OPTIONAL { ?t code:tests ?fn } OPTIONAL { ?t2 code:tests ?m . ?fn code:definedIn ?m } BIND(BOUND(?t)||BOUND(?t2) AS ?tested) } GROUP BY ?tested' -H "Accept: application/json"
```

## Decision: Old UI Pages (Batch 3.2)

The 15 `xtdb-event-logger-ui/pages/*.ts` render functions are duplicates of `harness-ui/pages/*.ts`. Once harness-ui migration is confirmed complete, these should be **decommissioned** (deleted), not tested. This removes 15 functions from the untested count without writing tests.
