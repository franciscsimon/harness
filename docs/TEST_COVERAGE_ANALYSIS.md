# Test Coverage Analysis — Consumer Contract Perspective

Generated: 2026-03-20

## Testing Philosophy

**Tests verify observable behavior from the consumer's perspective, not internal implementation.**

If we rewrite an extension from scratch, the tests should still pass — because they test
what the system *produces* (DB rows, API responses, UI pages, user-facing output), not
how the code is structured internally.

The consumers of this system are:
1. **XTDB** — receives rows with specific table schemas
2. **HTTP APIs** — return JSON/HTML with specific shapes
3. **UI pages** — render meaningful content
4. **pi agent users** — see command output, notifications, guidelines
5. **Kafka** — receives messages within size limits
6. **Other extensions** — read data written by other extensions

---

## Consumer Contracts to Test

### Contract 1: XTDB Persistence (26 tables)

**Consumer:** Any code that reads from XTDB (UI, APIs, other extensions)
**Contract:** "When X happens in a pi session, row Y appears in table Z with correct fields"

| Table | Trigger | What to verify |
|-------|---------|---------------|
| `events` | Any pi agent event | Row exists with event_name, session_id, ts, correct fields per event type |
| `decisions` | Agent calls `log_decision` | Row with task, what, outcome, why, project_id |
| `projects` | Agent opens a git repo | Row with canonical_id, git_remote_url, lifecycle_phase |
| `session_projects` | Agent starts in a project dir | Row linking session_id ↔ project_id |
| `artifacts` | Agent writes/edits a file | Row with path, kind, operation, content_hash |
| `artifact_versions` | Agent writes/edits a file | Row with content, version number, size_bytes |
| `artifact_reads` | Agent reads a file | Row with path, session_id |
| `delegations` | Agent spawns a child agent | Row with parent/child session, agent_name, exit_code |
| `session_postmortems` | Session ends | Row with goal, what_worked, what_failed, error_count |
| `file_metrics` | Agent edits files with errors | Row with file_path, edit_count, error_count |
| `projections` | Events flow in | Rows with type=task_start/turn/task_end/mutations |
| `workflow_runs` | User runs `/workflow` | Row with workflow_name, status, current_step |
| `workflow_step_runs` | Workflow progresses | Row with step_name, status, position |
| `requirements` | User runs `/req add` | Row with title, priority, status |
| `requirement_links` | Decision auto-links to requirement | Row with requirement_id, entity_type, entity_id |
| `releases` | User runs `/release create` or CI webhook | Row with version, status, changelog |
| `deployments` | User runs `/deploy` or CI webhook | Row with environment_id, release_id, status |
| `test_runs` | CI webhook `test.finished` | Row with passed, failed, coverage, status |
| `environments` | User runs `/env add` | Row with name, url, env_type |
| `incidents` | POST /api/incidents | Row with severity, title, status |
| `lifecycle_events` | Phase change or CI event | Row with event_type, entity_id, summary |
| `backup_records` | Backup completes | Row with backup_type, size_bytes, status |
| `project_dependencies` | User runs `/project deps` | Row with name, version, dep_type |
| `project_tags` | User runs `/project tag` | Row with tag |
| `decommission_records` | User runs `/project decommission` | Row with reason, decommissioned_by |
| `artifact_cleanup` | Artifact versioned | Row with path, session_id |

**Test pattern:** INSERT known data → SELECT and verify shape + values. Don't import extension code — talk to the database directly.

### Contract 2: HTTP API Responses (4 services, ~60 endpoints)

**Consumer:** harness-ui, browser clients, ops dashboard
**Contract:** "GET /api/X returns JSON with fields A, B, C in the expected shape"

#### xtdb-event-logger-ui (:3333) — 15 API endpoints
| Endpoint | Response contract |
|----------|------------------|
| `GET /api/stats` | `{ total: number, byCategory: Record<string, number> }` |
| `GET /api/sessions/list` | Array of `{ sessionId, projectName, startTs, endTs, turnCount, ... }` |
| `GET /api/sessions/:id/events` | Array of event objects |
| `GET /api/dashboard` | `{ sessions: [...], recentDecisions: [...], recentArtifacts: [...] }` |
| `GET /api/decisions` | Array of `{ _id, task, what, outcome, why, ts, ... }` |
| `GET /api/artifacts` | Array of `{ _id, path, kind, operation, ts, ... }` |
| `GET /api/artifact-versions` | Array of version objects |
| `GET /api/events/:id` | Single event object |
| `GET /api/sessions/:id/knowledge` | Knowledge object |

#### xtdb-ops-api (:3335) — 20 API endpoints
| Endpoint | Response contract |
|----------|------------------|
| `GET /api/health` | `{ overall, components: [...] }` |
| `GET /api/health/primary` | `{ status, latency }` |
| `GET /api/health/replica` | `{ status, latency }` |
| `GET /api/health/redpanda` | `{ status, ... }` |
| `GET /api/replication` | `{ primary: {...}, replica: {...}, lag }` |
| `POST /api/backup` | `{ jobId }` |
| `GET /api/backup/status/:id` | `{ status, progress, ... }` |
| `GET /api/backups` | Array of backup file objects |
| `GET /api/replica/status` | `{ running, ... }` |
| `GET /api/scheduler/status` | `{ running, interval, lastRunAt }` |
| `POST /api/ci/events` | `{ ok, id }` for valid CDEvents payloads |
| `GET /api/incidents` | Array of incident objects |
| `POST /api/incidents` | Created incident |
| `GET /api/incidents/:id` | Single incident with correct fields |
| `GET /api/lifecycle/events` | Array of lifecycle event objects |
| `GET /api/topics` | Array of Kafka topic names |

#### web-chat (:3334) — WebSocket contract
| Message | Response contract |
|---------|------------------|
| `{"type":"chat","content":"hello"}` | Streamed responses with `type: "chunk"/"done"/"error"` |
| Connection open | Session assigned from pool |
| Connection close | Session released back to pool |

**Test pattern:** HTTP fetch against running service → assert status code + JSON shape. Don't import server internals.

### Contract 3: UI Page Rendering (3 UIs, ~28 pages)

**Consumer:** Browser users
**Contract:** "GET /page returns 200 with HTML containing expected elements"

#### xtdb-event-logger-ui (:3333) — 12 pages
| Page | Must contain |
|------|-------------|
| `GET /` | Session list, nav bar |
| `GET /sessions` | Session cards with project names |
| `GET /dashboard` | Stats, recent activity |
| `GET /decisions` | Decision cards with task/outcome |
| `GET /artifacts` | Artifact list with paths/kinds |
| `GET /projects` | Project list |
| `GET /projects/:id` | Project detail with sessions/decisions |
| `GET /sessions/:id` | Event timeline |
| `GET /sessions/:id/flow` | Flow visualization |
| `GET /sessions/:id/knowledge` | Knowledge summary |
| `GET /artifacts/versions` | Version list |
| `GET /ops` | Ops dashboard |

#### harness-ui (:3336) — 10 pages
| Page | Must contain |
|------|-------------|
| `GET /` | Home with stats |
| `GET /sessions` | Session list |
| `GET /dashboard` | Dashboard stats |
| `GET /decisions` | Decision list |
| `GET /artifacts` | Artifact list |
| `GET /projects` | Project list |
| `GET /ops` | Ops controls |
| `GET /chat` | Chat interface |
| `GET /sessions/:id` | Session detail |
| `GET /projects/:id` | Project detail |

#### xtdb-ops-api (:3335) — 2 pages
| Page | Must contain |
|------|-------------|
| `GET /dashboard` | Portfolio view |
| `GET /dashboard/project/:id` | Project lifecycle detail |

**Test pattern:** `fetch(url)` → assert status 200, assert HTML contains key elements (nav, content sections, no "undefined"). Don't import page rendering functions.

### Contract 4: Extension Commands (user-facing output)

**Consumer:** Pi agent users typing commands
**Contract:** "When I type /command with args, I get expected output"

| Command | Extension | Expected behavior |
|---------|-----------|-------------------|
| `/project status` | project-lifecycle | Shows current phase, project name, session count |
| `/project phase <phase>` | project-lifecycle | Changes phase, emits lifecycle_event |
| `/project deps` | project-lifecycle | Lists dependencies from package.json |
| `/project tag <tag>` | project-lifecycle | Adds tag to project |
| `/project decommission` | project-lifecycle | Sets phase=decommissioned, creates record |
| `/req add <title>` | requirements-tracker | Creates requirement row |
| `/req list` | requirements-tracker | Lists requirements with status |
| `/req status <id> <status>` | requirements-tracker | Updates requirement status |
| `/env add <name> <url>` | deployment-tracker | Creates environment row |
| `/release create <version>` | deployment-tracker | Creates release row |
| `/deploy <env> <release>` | deployment-tracker | Creates deployment row |
| `/workflow <name>` | workflow-engine | Starts workflow, creates workflow_run |
| `/spawn <agent> <task>` | agent-spawner | Spawns child agent |

**Test pattern:** These need a mock pi ExtensionAPI that captures command registrations, then invoke the handler with test args and verify the DB result. Test the *outcome* (DB row + user notification), not the handler code.

### Contract 5: Data Integrity Constraints

**Consumer:** The whole system — data corruption affects everything
**Contract:** "System invariants are maintained regardless of implementation"

| Invariant | What to verify |
|-----------|---------------|
| Kafka message size | Events with large context don't exceed 1MB after truncation |
| Schema completeness | All 26 tables exist with all columns after seed script |
| Primary↔Replica sync | Data written to :5433 is readable from :5434 |
| JSON-LD validity | All jsonld columns contain valid JSON with @context, @type, @id |
| ID uniqueness | No duplicate _id values within a table |
| Referential integrity | session_projects.project_id points to existing project |
| Timestamp ordering | ts values are monotonically increasing for sequential events |

**Test pattern:** Direct DB queries to verify invariants. No code imports.

### Contract 6: Infrastructure Health

**Consumer:** Ops team, monitoring
**Contract:** "Infrastructure services are running and responding correctly"

| Check | What to verify |
|-------|---------------|
| XTDB primary alive | `GET :8083/healthz/alive` → "Alive." |
| XTDB primary started | `GET :8083/healthz/started` → "Started." |
| XTDB replica alive | `GET :8084/healthz/alive` → "Alive." |
| XTDB replica started | `GET :8084/healthz/started` → "Started." |
| Redpanda healthy | `rpk cluster health` → healthy |
| Garage healthy | `GET :3903/health` → operational |
| Garage bucket exists | S3 list on `xtdb` bucket succeeds |

**Test pattern:** HTTP/TCP checks against running infrastructure.

---

## Existing Coverage vs Contracts

| Contract | Existing tests | Coverage |
|----------|---------------|----------|
| 1. XTDB Persistence | `integration.ts` (5 tables), `lifecycle.ts` (incidents, CI) | ~25% |
| 2. HTTP API Responses | `lifecycle.ts` (a few ops endpoints) | ~10% |
| 3. UI Page Rendering | `run-tests.ts` (dashboard), `lifecycle.ts` (ops dashboard) | ~10% |
| 4. Extension Commands | None | **0%** |
| 5. Data Integrity | `pure-functions.ts` (JSON-LD builder) | ~10% |
| 6. Infrastructure Health | None | **0%** |

---

## Contract 7: Expected Error Behavior

**Consumer:** Anyone calling an API, querying the DB, or using the system incorrectly
**Contract:** "When something goes wrong, the system responds with a specific, predictable error — anything else is a bug"

Unexpected errors are the silent killers. If we don't define what errors *should* look like,
we can't distinguish "working correctly under bad input" from "broken."

### API Error Contracts

#### xtdb-ops-api (:3335)
| Scenario | Expected response |
|----------|------------------|
| `GET /api/backup/status/nonexistent` | 404 `{ error: "Job not found" }` |
| `GET /api/backups/nonexistent.tar.gz` | 404 `{ error: "File not found" }` |
| `POST /api/restore` with no body | 400 `{ error: "Missing archive" }` |
| `POST /api/restore` with bad filename | 400 `{ error: "Invalid archive name" }` |
| `POST /api/ci/events` with bad signature | 401 `{ error: "Invalid signature" }` |
| `POST /api/ci/events` with missing fields | 400 `{ error: "Missing required fields: ..." }` |
| `POST /api/incidents` missing severity/title | 400 `{ error: "Missing required fields: ..." }` |
| `GET /api/incidents/nonexistent` | 404 `{ error: "Incident not found" }` |
| `PUT /api/incidents/nonexistent` | 404 `{ error: "Incident not found" }` |
| `POST /api/backup/verify` with no archive | 400 `{ error: "Missing archive" }` |
| XTDB primary down → any health endpoint | 500 `{ error: "..." }` (not crash/timeout) |
| Redpanda down → topic endpoints | 500 `{ error: "..." }` (not crash/timeout) |

#### xtdb-event-logger-ui (:3333)
| Scenario | Expected response |
|----------|------------------|
| `GET /projects/nonexistent` | 404 HTML with "Project not found" |
| `GET /sessions/nonexistent` | 404 HTML with "Session not found" |
| `GET /event/nonexistent` | 404 HTML with "Event not found" |
| `GET /artifacts/content/nonexistent` | 404 HTML "Version not found" |
| `GET /artifacts/versions` with no path param | 400 HTML "Missing path parameter" |
| `GET /api/events/nonexistent` | 404 `{ error: "Not found" }` |
| `GET /api/artifact-versions/nonexistent` | 404 `{ error: "not found" }` |
| `GET /api/sessions/nonexistent/knowledge` | 404 `{ error: "Session not found" }` |
| `GET /static/../../etc/passwd` | 404 (path traversal blocked) |

#### web-chat (:3334)
| Scenario | Expected response |
|----------|------------------|
| Invalid WebSocket message format | Error frame, connection stays open |
| All sessions in pool exhausted | Queued or error message, not crash |

### Database Error Contracts

| Scenario | Expected behavior |
|----------|------------------|
| INSERT duplicate `_id` | XTDB replaces (upsert), no error |
| SELECT from nonexistent table | Empty result + warning (not crash) |
| SELECT nonexistent column | Result without that column + warning (not crash) |
| XTDB primary unreachable | Extensions log error, continue without crashing pi agent |
| Very large field (>1MB) | Truncated to fit Kafka limit, row still persists |

### Extension Error Contracts

| Scenario | Expected behavior |
|----------|------------------|
| XTDB connection fails on startup | Extension logs warning, pi agent continues |
| Extension handler throws | pi agent continues, error logged, no data corruption |
| Invalid command arguments | User gets helpful error notification, no DB side effects |
| Project not found for `/project status` | User notification: "No project detected" |
| Requirement not found for `/req status` | User notification: "Requirement not found" |

### What "unexpected" means

An **unexpected error** is any response not in the tables above. Examples:
- 500 where we expected 400 or 404
- Crash/hang where we expected a JSON error
- Corrupted data where we expected truncation
- Silent failure where we expected user notification
- Stack trace in HTTP response body

Tests should verify both the **happy path** and the **specific error response**. If we get
a *different* error than documented, that's a regression.

---

## Phase 0 Prerequisite: Error Handling Audit

Before testing errors, the code must actually surface them. Current state:

| Pattern | Count | Action needed |
|---------|-------|---------------|
| `catch {}` — silent swallow | 52 | Audit each: add logging, re-throw, or document why silent is correct |
| `catch` + `console.error` only | 24 | Decide: should these propagate to caller or stay as log-only? |
| `catch` + `ctx.ui.notify` | 25 | ✅ Good — keep |
| `throw new Error(msg)` | 22 | ✅ Good — keep |
| `c.json({ error })` | 39 | ✅ Good — keep |

### Categories of silent catches

**Acceptable (keep silent):**
- `sql.end()` cleanup in `finally`/shutdown — 15 instances
- JSON.parse fallback to default — 3 instances
- "table may not exist yet" seed attempts — 5 instances

**Must fix (add logging or propagation):**
- DB writes that silently fail: `artifact_reads`, `file_metrics` INSERTs — data silently lost
- WebSocket session control: `steer()`, `followUp()`, `abort()` — user gets no feedback
- Extension handler errors that vanish — pi agent appears to work but data is missing

**Principle:** Every `catch` block should do ONE of:
1. **Re-throw** — let the caller handle it
2. **Log with context** — `console.error(\`[component] operation failed for \${id}: \${err}\`)`
3. **Notify the user** — `ctx.ui.notify(message, "error")`
4. **Be explicitly documented** — `catch { /* safe to ignore: sql.end() during shutdown */ }`

A bare `catch {}` with no comment is always a bug — it hides information.

### How this relates to testing

We can't write error contract tests until errors are observable. The fix order is:
1. Audit and fix the 52 silent catches (add logging/notification)
2. Then write contract tests that verify the error IS surfaced
3. Contract tests check: "when X fails, the system responds with Y" not silence

---

## Implementation Plan (by contract, not by code)

### Phase 1: Infrastructure Health (fastest, highest confidence)
**No data needed, just running services**

```
test/contracts/infrastructure.ts
```
- XTDB primary + replica alive/started
- Redpanda cluster health
- Garage bucket accessible
- All 4 HTTP services responding (ports 3333, 3334, 3335, 3336)
- Est: ~80 lines

### Phase 2: API Response Contracts (happy path + error path)
**Needs seeded data in XTDB**

```
test/contracts/api-event-logger.ts   — :3333 API endpoints
test/contracts/api-ops.ts            — :3335 API endpoints
test/contracts/api-harness-ui.ts     — :3336 page responses
test/contracts/api-web-chat.ts       — :3334 WebSocket
```
- Seed known data → fetch each endpoint → verify JSON shape + status codes
- **Error contract tests:** every 400/401/404 scenario from Contract 7
  - Missing IDs → 404 with correct error message
  - Bad input → 400 with correct error message
  - Invalid auth → 401 with correct error message
  - Path traversal → 404 (blocked)
- Est: ~500 lines total

### Phase 3: XTDB Persistence Contracts
**Needs running XTDB, tests write+read directly**

```
test/contracts/persistence.ts
```
- For each of the 26 tables: INSERT a known row → SELECT it back → verify all columns
- Test UPDATE behavior (XTDB uses INSERT for updates)
- Test that DELETE works
- Verify primary→replica replication for each table
- Est: ~300 lines

### Phase 4: Data Integrity + Error Behavior Contracts
**Needs seeded data**

```
test/contracts/integrity.ts
```
- Schema completeness (all 26 tables, all columns exist)
- JSON-LD validity for all jsonld columns
- Kafka message size budget enforcement
- ID uniqueness across tables
- **DB error behavior:** duplicate _id → upsert (no error), nonexistent table → empty + warning, large fields → truncated
- Est: ~200 lines

### Phase 5: Extension Command Contracts
**Needs XTDB + mock pi API**

```
test/contracts/commands.ts
```
- Each command (13 commands) → invoke handler → verify DB row created
- Uses mock ExtensionAPI to capture command registrations
- Tests the contract: "command X produces DB row Y"
- Est: ~350 lines

### Phase 6: Test Runner
```
scripts/test.sh
```
- Runs phases 1→5 in order (fails fast if infra is down)
- Reports total pass/fail across all contract files
- Est: ~30 lines

---

## Summary

| Phase | File(s) | Happy path | Error path | Depends on |
|-------|---------|-----------|------------|-----------|
| 1. Infrastructure | `infrastructure.ts` | ~8 | — | Running containers |
| 2. API Contracts | 4 files | ~40 | ~25 | Running services + seed data |
| 3. Persistence | `persistence.ts` | ~52 | — | Running XTDB |
| 4. Integrity + Errors | `integrity.ts` | ~12 | ~8 | Seeded XTDB |
| 5. Commands | `commands.ts` | ~13 | ~8 | XTDB + mock pi |
| 6. Runner | `test.sh` | — | — | All above |
| **Total** | **8 files** | **~125** | **~41** | |

All tests are black-box: they talk to databases, APIs, and services — never import application code.
If we rewrite every extension from scratch, these tests still verify the system works.
