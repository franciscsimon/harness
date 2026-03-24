# **Harness Monorepo — Comprehensive Quality Audit**
Date: March 24, 2026  |  Codebase: 218 TypeScript files  |  ~30,000 lines of code

# **Executive Summary**
This audit identified 77 issues across 15 quality dimensions. The codebase is a functional monorepo serving as an AI agent orchestration platform with CI/CD, observability, and workflow capabilities. While architecturally ambitious, it suffers from systemic quality gaps that create real security and reliability risks.
The most alarming findings are 5 critical command injection vulnerabilities in the CI runner and build service, hardcoded database credentials in 18+ files, and a complete absence of input validation across all API surfaces. The codebase also lacks structured logging, schema validation, proper test coverage, and uses 235+ instances of "as any" to bypass TypeScript's type system.
## **Issue Summary by Severity**

| Critical | High | Medium | Low |
| --- | --- | --- | --- |
| 5 | 18 | 43 | 11 |

## **Issues by Dimension**

| Dimension | Count | Worst |
| --- | --- | --- |
| Input Validation | 8 | Critical |
| Configuration | 6 | Critical |
| Error Handling | 11 | High |
| Type Safety | 5 | High |
| Concurrency | 5 | High |
| Logging | 3 | High |
| Promise/Async | 5 | High |
| Test Quality | 6 | High |
| API Design | 6 | Medium |
| Build/Deploy | 5 | Medium |
| Readability | 8 | Medium |
| Data Quality | 3 | High |
| Dependencies | 3 | Medium |
| Dead Code | 2 | Low |
| TODO/FIXME | 1 | Low |

# **Master Issue Table**

| # | Severity | Dimension | File | Description |
| --- | --- | --- | --- | --- |
| 20 | Critical | Input Validation | ci-runner/runner.ts:274,289-301 | Command injection risk: user-controlled variables (workDir, commitHash, cloneUrl) interpolated directly into execSync() shell commands without sanitization |
| 21 | Critical | Input Validation | harness-ui/pages/git.ts:9 | execSync with SSH command using unsanitized sshHost — potential command injection |
| 22 | Critical | Input Validation | harness-ui/server.ts:296,329,400 | execSync with docker cp/compose commands using unsanitized input (hostPath, svcName) |
| 23 | Critical | Input Validation | build-service/builder.ts:77 | execSync with git fetch/checkout using unsanitized req.commit |
| 31 | Critical | Configuration | (18 files) | Hardcoded database password 'xtdb' in 18+ locations across xtdb-ops-api, sunk-cost-detector, ci-runner, build-service, etc. |
| 1 | High | Error Handling | agent-spawner/agents.ts:49 | Empty catch block `catch {}` — silently swallows error loading agent files |
| 2 | High | Error Handling | ci-runner/runner.ts:166 | Empty catch block `catch {}` — swallows recording error after CI step |
| 3 | High | Error Handling | ci-runner/runner.ts:275 | Empty catch block `catch {}` — swallows cleanup error after rm -rf |
| 15 | High | Promise/Async | lib/test-db.ts:4 | Floating promise: `ensureConnected(sql).then(ok => {` — no .catch(), unhandled rejection |
| 16 | High | Promise/Async | code-quality/detect.ts:288 | Floating promise: `detectStack(target).then(...)` — no error handling |
| 24 | High | Input Validation | harness-ui/server.ts:52-178 | 40+ route params (c.req.param, c.req.query) extracted with zero validation — no type checking, no sanitization, no length limits |
| 25 | High | Input Validation | xtdb-ops-api/server.ts:94-294 | Multiple route params used directly in database queries without validation |
| 26 | High | Input Validation | ci-runner/server.ts:57 | POST /api/enqueue parses JSON body with no schema validation |
| 28 | High | Logging | (entire codebase) | Zero structured logging: 361 console.log, 67 console.error, 10 console.warn — no pino, winston, or any structured logging library |
| 32 | High | Configuration | xtdb-ops-api/lib/incidents.ts:4 | Hardcoded localhost:5433 with no env var override — works only in specific network setup |
| 33 | High | Configuration | xtdb-ops-api/lib/backup.ts:10,210,230 | Hardcoded localhost and credentials embedded in SQL restore commands |
| 46 | High | Type Safety | (entire codebase) | 235 occurrences of `as any` — massive type safety escape hatch usage |
| 47 | High | Type Safety | (entire codebase) | 266 explicit `: any` type annotations — vast majority of function parameters and return types untyped |
| 48 | High | Type Safety | (24 locations) | 24 uses of `(globalThis as any).__piCurrentProject` — shared mutable global state with no type safety |
| 51 | High | Data Quality | scripts/seed-schema.ts | Schema seeding in a 650-line script with no migration versioning — risky for data integrity |
| 54 | High | Concurrency | docker-event-collector/writer.ts:11-15 | Module-level mutable state (buffer, flushTimer, totalWritten) shared across async operations with no synchronization |
| 55 | High | Concurrency | docker-event-collector/collector.ts:13-16 | Module-level mutable counters (lastSeenTimestamp, totalReceived, isConnected, reconnectCount) — potential race conditions |
| 62 | High | Test Quality | (codebase) | Zero unit tests for: ci-runner, build-service, docker-event-collector, web-chat, harness-ui server logic, xtdb-ops-api business logic |
| 4 | Medium | Error Handling | harness-ui/pages/ci-run-detail.ts:11,28 | Two empty catch blocks for JSON.parse — no fallback or logging |
| 5 | Medium | Error Handling | harness-ui/pages/ci-runs.ts:11,40 | Two empty catch blocks — silently ignores data parse failures |
| 6 | Medium | Error Handling | knowledge-checkpoint/index.ts:74 | Empty catch block — unknown error consumed silently |
| 7 | Medium | Error Handling | xtdb-event-logger-ui/lib/db.ts:472 | Empty catch block in database layer — error disappears |
| 8 | Medium | Error Handling | scripts/seed-schema.ts:618 | Empty catch block in schema seeding — dangerous in data operations |
| 9 | Medium | Error Handling | lib/errors.ts:148 | Ironic: the error capture module itself has empty catch blocks (lines 148, 166, 182, 210, 229, 268) |
| 17 | Medium | Promise/Async | xtdb-ops-api/lib/health.ts:20-21 | Promise chain `.then().catch()` pattern instead of async/await — inconsistent style |
| 18 | Medium | Promise/Async | harness-ui/pages/docker-events.ts:53 | `.catch(() => null)` — silently ignores health check failure |
| 19 | Medium | Promise/Async | lib/errors.ts:245 | `flushErrors().catch(() => {})` — error flushing errors is completely ignored |
| 27 | Medium | Input Validation | (all servers) | No request validation library (Zod, Joi, etc.) used anywhere in the codebase |
| 29 | Medium | Logging | (entire codebase) | No log levels, no correlation IDs, no request tracing across services |
| 30 | Medium | Logging | (entire codebase) | Ad-hoc prefix pattern `[component-name]` used inconsistently instead of proper structured fields |
| 34 | Medium | Configuration | (multiple files) | Duplicated DB connection config (host/port/user/password) in 15+ files instead of shared config module |
| 35 | Medium | Configuration | (codebase) | No .env file or .env.example — env var defaults scattered across files with no central documentation |
| 37 | Medium | API Design | (all servers) | No global error handler middleware — each route has its own try/catch with inconsistent error formats |
| 38 | Medium | API Design | ci-runner/server.ts:49,75 | Inconsistent error responses: some return { error: string }, others return raw text |
| 39 | Medium | API Design | (all servers) | No request/response schemas documented — no OpenAPI/Swagger specification |
| 40 | Medium | API Design | (all servers) | No rate limiting on any API endpoint |
| 41 | Medium | API Design | harness-ui/server.ts | Mixed API patterns: some routes return JSON, some return HTML on the same server |
| 43 | Medium | Dependencies | (root package.json) | Root package.json has only 2 dependencies (ws, biome) — no workspace management for 30+ sub-packages |
| 44 | Medium | Dependencies | (multiple) | postgres package duplicated across 15+ sub-packages instead of hoisted to root |
| 49 | Medium | Type Safety | (multiple files) | Pattern `db.typed(v as any, 25)` repeated 20+ times — casting away safety on every SQL parameter |
| 50 | Medium | Type Safety | (multiple files) | Event handlers consistently cast: `const e = event as any` — all event data is untyped |
| 52 | Medium | Data Quality | (codebase) | No schema validation library (Zod) on data flowing into or out of database |
| 53 | Medium | Data Quality | (codebase) | No database migration tool (drizzle, prisma, knex) — schema changes are manual scripts |
| 56 | Medium | Concurrency | xtdb-ops-api/lib/scheduler.ts:10-13 | Module-level mutable state (timer, intervalMs, lastRunAt, lastJobId) with no locking |
| 57 | Medium | Concurrency | xtdb-ops-api/lib/backup.ts:7 | Lazy singleton DB connection `_sql` with no mutex — potential double-initialization under load |
| 58 | Medium | Concurrency | (15+ files) | Module-level `let sql: Sql \| null = null` pattern repeated everywhere — lazy init without protection |
| 59 | Medium | Test Quality | test/ | Custom test framework (pass/fail/assert functions) instead of established framework (Jest, Vitest, node:test) |
| 60 | Medium | Test Quality | test/ | No test coverage measurement — impossible to know what's tested |
| 61 | Medium | Test Quality | test/ | No mocking/stubbing infrastructure — tests require live database and running services |
| 63 | Medium | Test Quality | test/pure-functions.ts | 798-line monolithic test file — should be split per module |
| 64 | Medium | Test Quality | (codebase) | No error path testing — only happy paths verified in contract tests |
| 65 | Medium | Build/Deploy | (all Dockerfiles) | No USER instruction — all 7 containers run as root |
| 66 | Medium | Build/Deploy | (all Dockerfiles) | No HEALTHCHECK instruction in any Dockerfile — Docker cannot auto-detect unhealthy containers |
| 67 | Medium | Build/Deploy | build-service/Dockerfile | Not multi-stage — copies everything including dev dependencies and source into final image |
| 69 | Medium | Build/Deploy | ci-runner/runner.ts:106-107 | Graceful shutdown calls process.exit(0) immediately — no draining of in-progress jobs |
| 70 | Medium | Readability | harness-ui/pages/graph.ts:165 | 292-line function `renderGraph()` — extremely long, should be decomposed |
| 71 | Medium | Readability | harness-ui/pages/chat.ts:9 | 160-line function `renderChat()` — HTML template mixed with logic |
| 72 | Medium | Readability | ci-runner/pipeline.ts:128 | 127-line function `autoDetectSteps()` — too complex, needs extraction |
| 73 | Medium | Readability | data-examples/test-xtdb-insert.ts:8 | 120-line main() function |
| 74 | Medium | Readability | harness-ui/pages/dashboard.ts:10 | 107-line function with deeply nested HTML string templates |
| 77 | Medium | Readability | (39 files) | 39 functions exceed 50 lines — many exceed 100 lines |
| 10 | Low | Error Handling | (multiple files) | 58 bare `catch {` blocks (no error variable) across codebase — makes debugging impossible |
| 11 | Low | Error Handling | (multiple files) | 25 empty `catch {}` blocks — errors completely swallowed with no logging |
| 12 | Low | Dead Code | xtdb-event-logger/env.ts:13 | TODO comment suggests unfinished feature: piVersion always returns 'unknown' |
| 13 | Low | Dead Code | code-quality/detect.ts:9-10 | Commented-out import example — leftover documentation in source |
| 14 | Low | TODO/FIXME | xtdb-event-logger/env.ts:13 | TODO: extract pi version from runtime — feature gap |
| 36 | Low | Configuration | (codebase) | No tsconfig.json at root — only one tsconfig exists in xtdb-ops-api/ |
| 42 | Low | API Design | xtdb-ops-api/lib/auth.ts:14-30 | Overly permissive PUBLIC_PATHS — 14 endpoints bypass authentication entirely including /api/incidents and /api/backups |
| 45 | Low | Dependencies | docker-event-collector/Dockerfile:5 | `npm install` without lockfile (no package-lock.json copied) — non-reproducible builds |
| 68 | Low | Build/Deploy | (codebase) | No CI/CD pipeline definition (no .github/workflows, no Jenkinsfile) — relies entirely on custom ci-runner |
| 75 | Low | Readability | xtdb-event-logger-ui/lib/db.ts | 1142-line file — god object containing all database queries |
| 76 | Low | Readability | harness-ui/server.ts | 539-line server file — route definitions, static file serving, and API logic all in one file |

# **1. Error Handling**
The codebase contains 417 catch blocks across 218 TypeScript files. Of these, 25 are completely empty (`catch {}`) and 58 are bare catches with no error variable binding. This means errors are silently swallowed in critical paths including database operations, CI recording, and JSON parsing.
Key findings: The lib/errors.ts module — the designated error capture utility — itself contains 6 bare catch blocks. The pattern `try { await sql.end(); } catch { /* cleanup */ }` appears in 5+ files for DB cleanup. While individually defensible, the pervasive habit of empty catches means real bugs hide in silence.
The predominant error handling pattern is `console.error(`[component] message: ${err}`)` which discards the stack trace and only preserves the error message string. No errors are ever propagated to a monitoring system.

# **2. Dead Code**
The codebase is relatively clean of commented-out code blocks. Most comments are documentation headers (e.g., "Pure functions — no DB dependencies"). One notable dead code item: xtdb-event-logger/env.ts:13 has a TODO for extracting the pi version, currently hardcoded to "unknown". The code-quality/detect.ts file contains commented-out import examples at lines 9-10.
The bigger structural concern is whether all 218 files are actively used. The monorepo contains directories like happy-to-delete/, playgrounds/, data-examples/ that may be vestigial.

# **3. TODO/FIXME/HACK/XXX Comments**
Remarkably clean — only 1 genuine TODO found: xtdb-event-logger/env.ts:13 ("TODO: extract from pi if runtime exposes it"). The quality-hooks/checks.ts file explicitly skips TODO/FIXME/HACK/NOTE/XXX comments in its quality analysis (line 27), suggesting the team has a policy of resolving these quickly.

# **4. Promise/Async Issues**
Two floating promises found that lack error handling: lib/test-db.ts:4 calls `ensureConnected(sql).then(...)` without a .catch(), and code-quality/detect.ts:288 has `detectStack(target).then(...)` similarly unguarded. These will cause unhandled promise rejection crashes in Node 22+.
Multiple `.catch(() => null)` and `.catch(() => {})` patterns found (20+ instances) which silently discard errors from fetch requests, database operations, and file I/O. While some are intentional "best-effort" operations, others mask genuine failures (e.g., health checks returning null instead of signaling an unhealthy state).
18 Promise constructors found — most are legitimate (wrapping child_process spawn, WebSocket events), but several could be simplified with util.promisify.

# **5. Input Validation (CRITICAL)**
This is the most severe finding. The CI runner (ci-runner/runner.ts) and build service (build-service/builder.ts) execute shell commands with user-controlled input interpolated directly into execSync() calls without any sanitization:
- Line 274: execSync(`rm -rf ${workDir}`) — workDir derived from job data
- Lines 289-301: git checkout with ${job.commitHash} — a malicious commit hash could inject shell commands
- Line 300: GIT_SSH_COMMAND with unsanitized clone URL
- harness-ui/server.ts:400: docker compose up with unsanitized service name
- build-service/builder.ts:77: git fetch with unsanitized commit ref
The harness-ui server extracts 40+ route parameters with c.req.param() and c.req.query() with zero validation. No validation library (Zod, Joi, etc.) is used anywhere. API endpoints accept arbitrary JSON bodies without schema validation. The ci-runner/server.ts POST /api/enqueue endpoint accepts untrusted JSON that ultimately controls Docker container execution.

# **6. Logging**
The entire codebase relies exclusively on console.log (361 calls), console.error (67 calls), and console.warn (10 calls). There is no structured logging library whatsoever — no pino, winston, bunyan, or even a custom logger.
Logs use an inconsistent ad-hoc prefix pattern: `[component-name] message`. There are no correlation IDs, no request tracing, no log levels beyond what console provides. In a distributed system with 7+ microservices, this makes debugging production issues extremely difficult. No sensitive data was found in log output, which is a positive.

# **7. Configuration (CRITICAL)**
The database password "xtdb" is hardcoded in plain text in 18+ source files across sunk-cost-detector, ci-runner, artifact-tracker, xtdb-ops-api (4 locations), build-service, xtdb-projector, history-retrieval, xtdb-event-logger-ui, xtdb-event-logger, and lib/db.ts. Even where env vars are used for host/port, the password is always "xtdb".
Database connection configuration is duplicated in 15+ files with the same host/port/user/password/pool settings, instead of being centralized in a shared module. The lib/db.ts exists but is not used by many services.
No .env file or .env.example exists. Env var defaults are scattered across files. There is no root-level tsconfig.json — only xtdb-ops-api has one. There is no env var validation at startup.

# **8. API Design**
The codebase uses Hono as the HTTP framework across all services, which is good for consistency. However: there is no global error handling middleware, no OpenAPI/Swagger documentation, no rate limiting, and no request validation middleware.
Error responses are inconsistent: ci-runner returns `{ error: string }`, while harness-ui returns raw HTML or text error messages. Some routes return 500 with the raw Error.message (potentially leaking internal details), while others silently return null/empty data.
The harness-ui server mixes HTML page rendering and JSON API endpoints on the same server (539 lines), making the API surface unclear. The xtdb-ops-api auth module (auth.ts) has 14 public paths that bypass JWT authentication, including sensitive endpoints like /api/incidents and /api/backups.

# **9. Dependencies**
The root package.json contains only ws and biome as dependencies — there is no npm/yarn workspace configuration for the 30+ sub-packages. This means each sub-package independently manages its own node_modules, leading to duplication (e.g., postgres appears in 15+ package.json files).
The docker-event-collector Dockerfile runs `npm install` without copying a lockfile, meaning builds are non-reproducible. Other Dockerfiles correctly use `npm ci` with lockfiles. 24 package-lock.json files exist across the repo.

# **10. Type Safety**
TypeScript's type system is heavily undermined throughout the codebase: 235 uses of `as any` (type assertion bypass), 266 explicit `: any` annotations, and 24 uses of `(globalThis as any).__piCurrentProject` for accessing shared global state.
A recurring anti-pattern is `db.typed(v as any, 25)` for SQL parameter typing, repeated 20+ times. Event handlers routinely cast `const e = event as any` because the event system lacks proper type definitions. The auth module (auth.ts) uses `(c as any).user` to store authenticated user data, and `(payload as any).email` to extract JWT fields.
Despite 0 @ts-ignore/@ts-expect-error directives (which is positive), the pervasive use of `any` effectively negates TypeScript's benefits. The codebase would benefit enormously from proper type definitions for the pi extension API, database query results, and event payloads.

# **11. Data Quality**
Schema management is handled via a single 650-line script (scripts/seed-schema.ts) with no migration versioning. There is no migration tool (Drizzle, Prisma, Knex) and no way to track which schema changes have been applied. The schema seeding script has an empty catch block.
No schema validation library is used for data flowing into or out of the database. Query results are cast to `any[]` throughout. The SQL template tag library (postgres) does use parameterized queries (preventing SQL injection), which is positive — but the ${t()} and ${n()} wrapper functions that cast `as any` weaken the safety.

# **12. Concurrency**
Multiple services use module-level mutable state that is accessed from async operations without synchronization. The docker-event-collector has 4 mutable module-level variables (buffer, flushTimer, totalWritten, writeErrors) that are read and written from concurrent async handlers. Similarly, the xtdb-ops-api scheduler has 4 mutable state variables.
The pervasive pattern `let sql: Sql | null = null` for lazy DB connection initialization (in 15+ files) has a race condition: two concurrent requests could both see null and both attempt to initialize, potentially creating duplicate connections.
The xtdb-ops-api backup module's lazy singleton pattern (`let _sql = null; function getSql() { if (!_sql) _sql = postgres(...); return _sql; }`) is similarly unsafe.

# **13. Test Quality**
Tests use a custom minimal framework (pass/fail/assert functions defined in pure-functions.ts) instead of an established test runner (Jest, Vitest, node:test). This means no test coverage measurement, no watch mode, no snapshot testing, and no parallel execution.
The test directory contains 12 test files totaling ~4000 lines. The pure-functions.ts (798 lines) is a monolithic file testing functions from 10+ modules. Contract tests (test/contracts/) require live running services, making them integration tests that cannot run in CI without the full stack.
Critical gaps: zero unit tests for ci-runner execution logic, build-service, docker-event-collector, web-chat session management, harness-ui server routes, and xtdb-ops-api business logic (backup, restore, scheduler). No error path testing found — only happy paths verified.

# **14. Build/Deploy**
All 7 Dockerfiles run containers as root (no USER instruction) — a significant security risk. No Dockerfile includes a HEALTHCHECK instruction, so Docker cannot auto-detect unhealthy containers (health checks exist only at the application level via /api/health routes).
The build-service Dockerfile is not multi-stage, copying everything into the final image. All others use proper multi-stage builds. The ci-runner's graceful shutdown (lines 106-107) calls process.exit(0) immediately on SIGTERM/SIGINT without draining in-progress jobs.
No CI/CD pipeline definition exists (.github/workflows, Jenkinsfile, etc.) — the project relies on its own custom ci-runner, which creates a bootstrapping problem. The process-compose.yml suggests local development orchestration.

# **15. Readability**
39 functions exceed 50 lines, with the worst offenders being: renderGraph() at 292 lines, renderChat() at 160 lines, renderDockerEvents() at 139 lines, renderProjectDetail() at 136 lines, and autoDetectSteps() at 127 lines.
The largest files are: xtdb-event-logger-ui/lib/db.ts (1142 lines — a god object with all DB queries), test/pure-functions.ts (798 lines), scripts/seed-schema.ts (650 lines), and deployment-tracker/index.ts (561 lines).
The harness-ui/pages/ directory contains HTML template strings embedded in TypeScript functions — effectively server-side rendering without a template engine. This makes the HTML difficult to maintain and impossible to lint. Many render functions mix data fetching, error handling, and HTML generation in a single function.

# **Files Requiring Refactoring — Master List**
*Files are ordered by urgency. Critical security issues first, then architectural problems.*

| File | Priority | Reason |
| --- | --- | --- |
| ci-runner/runner.ts | Immediate | CRITICAL: Command injection via unsanitized execSync calls. Sanitize all inputs, use spawn() with arg arrays. |
| build-service/builder.ts | Immediate | CRITICAL: Command injection via unsanitized git/docker commands. |
| harness-ui/server.ts | Immediate | CRITICAL: execSync with unsanitized docker commands; 539 lines needs splitting. |
| harness-ui/pages/git.ts | Immediate | CRITICAL: execSync with unsanitized SSH commands. |
| xtdb-ops-api/lib/incidents.ts | Week 1 | Hardcoded localhost + password. No env var override. |
| xtdb-ops-api/lib/backup.ts | Week 1 | Hardcoded credentials, 467 lines, lazy singleton race condition. |
| xtdb-ops-api/server.ts | Week 1 | Hardcoded credentials in 3 locations, no input validation. |
| lib/db.ts | Week 1 | Shared DB module with hardcoded password. Should use env vars exclusively. |
| xtdb-event-logger-ui/lib/db.ts | Week 2 | 1142-line god object. Split by domain. Hardcoded credentials. |
| docker-event-collector/writer.ts | Week 2 | Mutable shared state without synchronization. Race conditions. |
| docker-event-collector/collector.ts | Week 2 | Mutable shared state, 4 unsynchronized module-level variables. |
| scripts/seed-schema.ts | Week 2 | 650 lines, no migration versioning, empty catch block. |
| harness-ui/pages/graph.ts | Week 3 | 292-line renderGraph() function. Decompose. |
| harness-ui/pages/chat.ts | Week 3 | 160-line HTML template function. Extract to template. |
| lib/errors.ts | Week 3 | Error capture module with 6 bare catch blocks. Practice what it preaches. |

# **Prioritized Remediation Roadmap**
## **Phase 1: Critical Security (Week 1)**
1. Replace all execSync() with spawn() using argument arrays — eliminates all command injection vectors
2. Extract all hardcoded database credentials to environment variables
3. Create a shared database configuration module to replace 15+ duplicated connection configs
4. Add input validation (Zod) to all API route handlers, especially ci-runner/server.ts POST /api/enqueue
5. Add Dockerfile USER instruction to all 7 containers to stop running as root
## **Phase 2: Reliability (Weeks 2-3)**
1. Replace console.log/error/warn with pino structured logging across all services
2. Add proper error handling to all 25 empty catch blocks and 58 bare catch blocks
3. Implement global error handling middleware in all Hono servers
4. Fix floating promises in lib/test-db.ts and code-quality/detect.ts
5. Add HEALTHCHECK to all Dockerfiles
6. Fix graceful shutdown in ci-runner to drain in-progress jobs before exit
## **Phase 3: Type Safety (Weeks 3-4)**
1. Define proper TypeScript interfaces for pi extension API events
2. Define database query result types to replace `as any[]` casts
3. Replace `(globalThis as any).__piCurrentProject` with typed accessor function
4. Add proper type definitions for Hono context extensions (user, etc.)
5. Introduce strict tsconfig.json at root level
## **Phase 4: Architecture (Weeks 4-6)**
1. Set up npm workspaces to deduplicate dependencies across 30+ sub-packages
2. Split xtdb-event-logger-ui/lib/db.ts (1142 lines) by domain
3. Split harness-ui/server.ts into route modules
4. Decompose functions over 100 lines (renderGraph, renderChat, autoDetectSteps, etc.)
5. Introduce a database migration tool (Drizzle recommended for TypeScript projects)
6. Add schema validation (Zod) for all data flowing into/out of the database
## **Phase 5: Testing & Observability (Weeks 6-8)**
1. Migrate from custom test framework to Vitest
2. Add unit tests for all untested services (ci-runner, build-service, docker-event-collector, etc.)
3. Add error path tests for all API endpoints
4. Set up test coverage measurement with >60% target
5. Add rate limiting to all public API endpoints
6. Create OpenAPI documentation for all API surfaces
7. Add request correlation IDs for distributed tracing
