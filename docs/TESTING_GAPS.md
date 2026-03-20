# Testing Gaps & Opportunities

**Date:** 2026-03-18
**Based on:** TESTING.GEMINI.md, TESTING.GPT.md, REPORT.SEC.md, current test/ directory

## Validation of Existing Reports

Both TESTING.*.md files are **valid inventories** but have minor staleness:
- `session-pool.ts` was rewritten (functions like `resolveDialog`, `requestDialog`, `buildUiContext` no longer exist)
- New extensions added in Phase 2-5 (`history-retrieval`, `session-postmortem`, `artifact-tracker`) are partially covered in Gemini's inventory but GPT has better coverage
- GPT report is more actionable (priorities, risk flags, test types)

## Current Test Coverage

| File | Lines | What it tests |
|------|-------|---------------|
| `test/handler-tests.ts` | 172 | Event logger handler field extraction |
| `test/test-handler.ts` | 121 | Single handler runner |
| `test/run-tests.ts` | 526 | Integration: XTDB + UI endpoints |
| `test/smoke-test.ts` | 193 | Deployment/filesystem checks |
| `test/ext-load-test.ts` | 74 | Extension factory smoke test |
| `test/seed-augmented-patterns.ts` | 290 | Test data builder |
| `test/mock-pi.ts` | 38 | Mock ExtensionAPI |

**Total:** ~1,472 lines, 7 files. No test runner framework (uses custom assert/pass/fail).

## Priority 1: Security-Critical (from REPORT.SEC.md)

These have **zero test coverage** and are the highest-risk items:

| Test | File to test | What to verify |
|------|-------------|----------------|
| Wipe endpoint requires auth | `xtdb-event-logger-ui/server.ts` | POST `/api/wipe` without token returns 401 |
| Static file allowlist blocks traversal | Both `server.ts` files | `GET /static/../../etc/passwd` returns 404 |
| set_cwd rejects invalid paths | `web-chat/server.ts` | Paths outside $HOME are rejected |
| CORS restricted to localhost | `xtdb-event-logger-ui/server.ts` | Cross-origin requests from evil.com blocked |
| WebSocket rejects malformed messages | `web-chat/lib/ws-protocol.ts` | Invalid JSON, missing fields, unknown types handled |

## Priority 2: Pure Functions (easy wins, no DB needed)

These are **trivially testable** with no infrastructure:

| Function | File | Input/Output |
|----------|------|-------------|
| `extractPaths(text)` | `history-retrieval/index.ts` | `"fix @src/index.ts"` → `["src/index.ts"]` |
| `truncFiles(json)` | `history-retrieval/index.ts` | `'["a/b.ts","c/d.ts"]'` → `"b.ts, d.ts"` |
| `inferKind(ext)` | `artifact-tracker/index.ts` | `"ts"` → `"code"`, `"md"` → `"doc"` |
| `relativeTime(ts)` | `xtdb-event-logger-ui/lib/format.ts` | epoch ms → `"2m ago"` |
| `computeHealthScore(s)` | `xtdb-event-logger-ui/lib/health.ts` | session stats → 0-100 |
| `healthColor(score)` | `xtdb-event-logger-ui/lib/health.ts` | 85 → `"#22c55e"` |
| `renderMarkdown(src)` | `xtdb-event-logger-ui/lib/markdown.ts` | `"# Hello"` → `"<h1>Hello</h1>"` |
| `computeLineDiff(a, b)` | `xtdb-event-logger-ui/lib/diff.ts` | Two strings → diff ops |
| `buildDecisionJsonLd(r)` | `decision-log/rdf.ts` | DecisionRecord → JSON-LD object |
| `eventToTriples(ev)` | `xtdb-event-logger/rdf/triples.ts` | Event → RDF triples |
| `triplesToJsonLd(triples)` | `xtdb-event-logger/rdf/serialize.ts` | Triples → JSON-LD string |
| `parseClientMessage(raw)` | `web-chat/lib/ws-protocol.ts` | JSON string → typed message or null |
| `shouldCapture(name)` | `xtdb-event-logger/sampling.ts` | Event name → boolean |
| `routeEvent(name)` | `xtdb-event-logger/router.ts` | Event name → handler |
| `uuid()` | `xtdb-event-logger/util.ts` | → UUID string |
| `trunc(s, n)` | `xtdb-event-logger/util.ts` | Long string → truncated |
| `parseFrontmatter(text)` | `agent-spawner/agents.ts` | YAML frontmatter → object |
| `formatAge(ms)` | `agent-spawner/index.ts` | 90000 → `"1m"` |
| `computeToolFailureRate()` | `canary-monitor/metrics.ts` | Counts → rate |
| `detectRetryStorm()` | `canary-monitor/metrics.ts` | Pattern → boolean |
| `checkCommitHabit()` | `habit-monitor/habits.ts` | State → warning or null |
| `checkErrorStreak()` | `habit-monitor/habits.ts` | State → warning or null |
| `esc(s)` | Multiple files | `"<script>"` → `"&lt;script&gt;"` |
| `compactEvent(row)` | `xtdb-event-logger-ui/lib/format.ts` | DB row → compact display |
| `progressBar(done, total)` | `chunker/index.ts` | 3, 5 → `"▓▓▓░░ 3/5"` |
| `normalizeGitRemote(url)` | `project-registry/normalize.ts` | SSH/HTTPS URLs → canonical form |

## Priority 3: Integration Tests (need XTDB)

| Test | What to verify |
|------|----------------|
| `ensureDb()` idempotence | All extensions: calling twice doesn't error |
| `persistDelegation()` | Insert → query → verify fields match |
| Artifact version lifecycle | `captureVersion()` → `nextVersion()` → `cleanupArtifacts()` |
| Session postmortem persist | Collect state → shutdown → query postmortem row |
| Cross-session sunk-cost load | Insert file_metrics → new session → verify priorFileErrors populated |
| History retrieval queries | Insert failures → `before_agent_start` → verify "Prior Work" injected |
| Decision log round-trip | `log_decision` tool → query decisions table → verify all fields |
| Project registry identity | Git remote → projectId → session_projects link |
| XTDB table seeding | All tables seed without error on fresh DB |

## Priority 4: WebSocket Protocol (need server running)

| Test | What to verify |
|------|----------------|
| Connect → receive status + cwd | Client connects, gets `idle` + `cwd` |
| Init → session created | Send `init` → receive `session_info` + `history` |
| Prompt → streaming response | Send `prompt` → receive `text_delta` events → `agent_end` |
| Abort during streaming | Send `prompt` then `abort` → streaming stops |
| Compact | Send `compact` → receive `compact_done` |
| New session | Send `new_session` → receive new `session_info` + empty history |
| Pool eviction | Open MAX_SESSIONS+1 → oldest evicted |
| Reconnect | Server restarts → client reconnects |

## Priority 5: Rendering (snapshot tests)

| Page | Key scenarios |
|------|--------------|
| `/` (stream) | Empty state, with events |
| `/sessions` | Empty, with sessions |
| `/projects/:id` | Project with decisions + sessions |
| `/decisions` | Mixed outcomes (success/failure/deferred) |
| `/artifacts` | Files with multiple versions |
| `/dashboard` | Health scores, tool usage stats |
| Chat page | Initial load, message history |

## Not Worth Testing

- Arrow functions `t`, `n` (typed SQL helpers) — covered indirectly
- `reset()` functions — trivial state clear
- Extension `default export` wiring — covered by `ext-load-test.ts`
- `esc()` — same implementation in 17 files, test once

## Recommended Next Steps

1. **Write `test/pure-functions.ts`** — 25 pure function tests, no deps, runs in <1s
2. **Write `test/security.ts`** — 5 security tests from REPORT.SEC.md Priority 1
3. **Extend `test/run-tests.ts`** — add integration tests for new tables/extensions
4. **Add `test/ws-protocol.ts`** — WebSocket protocol contract tests
