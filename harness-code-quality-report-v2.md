**HARNESS MONOREPO**
Deep Code Quality Audit — v2
March 23, 2026
**OVERALL GRADE: D+  —  NOT PRODUCTION-READY**
314 files checked  |  527 lint errors  |  1,533 warnings  |  30 files over 300 lines
9 critical vulnerabilities  |  8 high-severity issues  |  Widespread error swallowing

# 1. Critical Issues — Fix Immediately
These issues represent immediate risks to data integrity, security, and application stability. They must be addressed before any production deployment.
## 1.1 Unauthenticated Database Wipe Endpoint
**Severity: ****CRITICAL**  |  File: xtdb-event-logger-ui/server.ts, lines 290–293
A POST /api/wipe endpoint exists with zero authentication. Anyone with network access can permanently destroy all event data. Combined with CORS origin: "*", this can be triggered from any malicious webpage the user visits.
`app.post("/api/wipe", async (c) => {`
`  const deleted = await wipeAllEvents();`
`  return c.json({ deleted, message: `Erased ${deleted} events` });`
`});`
## 1.2 Hardcoded Database Credentials (16+ Files)
**Severity: ****CRITICAL**  |  Files: xtdb-ops-api/server.ts, backup.ts, build-service/server.ts, xtdb-event-logger-ui/lib/db.ts, and 12+ others
The password "xtdb" is hardcoded throughout the codebase. Credentials appear in source code visible in git history, Docker images, and stack traces. No secret management is used anywhere.
`const primaryDb = postgres({`
`  database: "xtdb", user: "xtdb", password: "xtdb", // HARDCODED`
`});`
Also found: Keycloak admin/admin in docker-compose.yml (lines 130–141), SSH keys exposed in compose file.
## 1.3 Command Injection in Git/Deploy Operations
**Severity: ****CRITICAL**  |  Files: harness-ui/pages/git.ts (lines 9, 17), harness-ui/server.ts (line 400), ci-runner/runner.ts (line 289)
Shell commands are constructed via string interpolation with unsanitized inputs. Repository names, service names, and commit hashes are injected directly into shell commands without escaping. Example:
`execSync(`ssh -p 23231 ${sshHost} repo info ${name}`);  // name is user-controlled`
`execSync(`git checkout ${job.commitHash} -f -- .`);  // commitHash not validated`
An attacker could execute arbitrary commands on the host by supplying a crafted repo name like "test`rm -rf /`".
## 1.4 Unauthenticated Replica/Restore Operations
**Severity: ****CRITICAL**  |  File: xtdb-ops-api/lib/auth.ts, lines 14–30
The PUBLIC_PATHS whitelist includes: /api/replica/start, /api/replica/stop, /api/restore, and /api/incidents. Anyone can stop the database replica (denial of service), restore from arbitrary backups (data corruption), or create fake incidents.
## 1.5 Undefined Variable Bug in CI Runner
**Severity: ****CRITICAL**  |  File: ci-runner/runner.ts, lines 243–244
References undefined variable "stepResults" (should be "results"). This will crash at runtime when a CI job completes, breaking all UI notifications for build results.
`stepsTotal: stepResults.length,  // stepResults is undefined; should be results`
## 1.6 All Containers Run as Root with Docker Socket
**Severity: ****CRITICAL**  |  Files: All Dockerfiles (ci-runner, harness-ui, build-service, docker-event-collector, web-chat, xtdb-event-logger-ui, xtdb-ops-api)
No Dockerfile includes a USER directive. All containers run as root. Five services mount /var/run/docker.sock, creating a full host compromise path: container escape via root + Docker socket = host root access.

# 2. Linter Results (Biome)
Biome was run against all 314 source files using the project's biome.json configuration. Results:

| Rule | Count | Level |
| --- | --- | --- |
| suspicious/noExplicitAny | 579 | warn |
| suspicious/noConsole | 444 | warn |
| complexity/useArrowFunction | 222 | info |
| style/useTemplate | 195 | info |
| correctness/noUnresolvedImports | 82 | warn |
| correctness/noInnerDeclarations | 55 | error |
| correctness/noUnusedVariables | 48 | error |
| suspicious/noEmptyBlockStatements | 44 | warn |
| nursery/noFloatingPromises | 35 | warn |
| style/noNonNullAssertion | 34 | warn |
| correctness/noUnusedFunctionParameters | 33 | error |
| correctness/noUnusedImports | 32 | error |
| style/useConst | 27 | error |
| complexity/useSimplifiedLogicExpression | 19 | warn |
| suspicious/noDoubleEquals | 13 | error |
| suspicious/useIterableCallbackReturn | 12 | warn |
| suspicious/noRedeclare | 9 | error |
| suspicious/noPrototypeBuiltins | 7 | warn |
| suspicious/noGlobalIsNan | 5 | error |

**Summary: **527 errors, 1,533 warnings, 214 infos. **Key concerns: **579 uses of 'any' type defeat TypeScript's purpose. 44 empty catch blocks silently swallow errors. 35 floating promises risk unhandled rejections. 13 uses of == instead of === can cause type coercion bugs.
Worst files by lint issue count: test/pure-functions.ts (54), web-chat/server.ts (44), test/integration.ts (39), test/run-tests.ts (36), xtdb-event-logger-ui/lib/db.ts (35), test/lifecycle.ts (34), workflow-engine/index.ts (30), web-chat/lib/session-pool.ts (30).

# 3. Security Audit
## 3.1 CORS Misconfiguration
**Severity: HIGH**
Three servers accept requests from any origin: web-chat/server.ts (line 18), xtdb-ops-api/server.ts (line 23), xtdb-event-logger-ui/server.ts (line 57). All use cors({ origin: "*" }). Combined with unauthenticated destructive endpoints, this enables CSRF attacks from any malicious webpage.
## 3.2 Weak Webhook Signature Verification
**Severity: MEDIUM**
File: xtdb-ops-api/lib/ci-webhook.ts, lines 50–55. If CI_WEBHOOK_SECRET is not set (the default), all webhook signatures are accepted. Uses === for comparison instead of timingSafeEqual, making it vulnerable to timing attacks.
## 3.3 Path Traversal in Backup System
**Severity: MEDIUM**
File: xtdb-ops-api/lib/files.ts, lines 52–56. Filename validation uses string includes() which can be bypassed by null byte injection, URL encoding, or symlinks. Used in the restore endpoint to load arbitrary archives.
## 3.4 No TLS/HTTPS
**Severity: MEDIUM**
Caddy reverse proxy only exposes HTTP on port 80 with no TLS configuration. All credentials (including the hardcoded ones) are transmitted in plaintext over the network.
## 3.5 No Rate Limiting
**Severity: MEDIUM**
No rate limiting on any endpoint. Destructive endpoints (/api/wipe, /api/backup, /api/deploy) can be called repeatedly without restriction.
## 3.6 Unbounded Query Parameters
**Severity: MEDIUM**
File: xtdb-event-logger-ui/server.ts, lines 102–110. The limit query parameter is not bounded. A request for limit=999999999 would attempt to load millions of records, causing resource exhaustion / denial of service.

# 4. Error Handling Analysis
## 4.1 Empty Catch Blocks (44 Instances)
44 empty catch blocks were detected by the linter. The actual problem is worse because many catch blocks contain only comments like "best-effort" or "intentionally silent" and still swallow the error. Key locations:
`xtdb-event-logger-ui/lib/db.ts — 13 bare catch {} blocks (lines 31, 147, 157, 166, 210, 230, 297, 346, etc.)`
`harness-ui/server.ts — 4 intentionally silent catches (lines 60, 118, 317, 427)`
`ci-runner/runner.ts — 3 silenced catches including fs.watch errors (lines 101, 166, 275)`
`xtdb-ops-api/lib/backup.ts — catch(() => {}) on replica restart (line 177)`
## 4.2 Inconsistent Error Patterns
Some modules use a shared captureError() function (web-chat/server.ts). Most do not. There is a lib/errors.ts with error capture infrastructure, but it is only used by a minority of modules. The codebase has no consistent strategy for:
Whether to log errors vs. capture them. What context to include (operation name, component, inputs). Whether to rethrow after catching. How to surface errors to users vs. operators.
## 4.3 Floating Promises (35 Instances)
35 promises are created but never awaited or caught. If they reject, the error is silently lost. This is especially dangerous in event handlers and cleanup code where failures should trigger alerts or retries.

# 5. Architecture Assessment
## 5.1 God Object: db.ts (1,142 lines)
xtdb-event-logger-ui/lib/db.ts handles ALL database access for the event logger UI: event queries, dashboard aggregations, project management, decisions, delegations, post-mortems, artifacts, versions, errors, test runs, CI runs, and docker events. There is zero separation of concerns. Business logic, data access, and result transformation are all mixed in one file.
Every query manually lists 20+ column names. If the schema changes, every query must be updated manually. The file contains 7 separate queries to build a single page (N+1 pattern in getSessionList, lines 214–301).
## 5.2 Duplicated Database Boilerplate
Every module that accesses the database repeats identical boilerplate: a lazy connection function, type helpers t() and n() for OID 25 and OID 20, and an ensureConnected check. This appears in at least 8 files: deployment-tracker, requirements-tracker, workflow-engine, project-lifecycle, code-quality, ci-runner, agent-spawner, and session-postmortem. A shared lib/db-pool.ts does not exist.
## 5.3 No Dependency Injection
Modules import dependencies directly and manage their own connections. This makes testing impossible without a real database, prevents mocking, and creates tight coupling between components. There are no interfaces or abstractions for external services.
## 5.4 Global State in Extensions
workflow-engine/index.ts (lines 33–36) stores workflow state in a module-level closure without session isolation. If multiple sessions are active, they share and potentially corrupt each other's state. harness-ui/static/chat.js has 30+ global variables (lines 2–32).
## 5.5 Missing API Versioning
No API versioning exists. The harness-ui makes direct calls to event-api endpoints. If any API changes, all consumers break simultaneously with no migration path.

# 6. Code Duplication
The codebase suffers from extensive copy-paste patterns:
Database connection boilerplate: Identical 10–15 line blocks in 8+ modules. JSON-LD object construction: Same pattern with @context, @id, @type repeated in deployment-tracker (lines 71–80, 215–225), requirements-tracker (lines 384–393), and others. SELECT column lists: The events table column list (20+ columns) is repeated verbatim in 10+ queries in db.ts. Error handling try-catch-return-JSON: Every API handler in harness-ui/server.ts wraps with the same pattern.
Estimated duplicated code: 800–1,200 lines across the codebase that could be extracted to shared utilities.

# 7. Docker & Infrastructure
## 7.1 Docker Positives
Multi-stage builds are used across most Dockerfiles, reducing image sizes by 40–50%. The Taskfile.yml is comprehensive with 42 well-organized tasks. Process-compose.yml provides local orchestration.
## 7.2 Docker Issues
All containers run as root (no USER directive). Five services mount Docker socket. 14 of 18 services have no health checks. 16 of 18 services have no resource limits. docker-event-collector uses npm install instead of npm ci (non-deterministic). build-service doesn't copy package-lock.json before npm install. .dockerignore is minimal (only 4 lines) and doesn't exclude: .git, test/, docs/, data-examples/, scripts/, *.patch files, or .env files.
## 7.3 CI/CD Assessment
The CI system is a custom-built JSON-LD pipeline runner (ci-runner/). While innovative, it lacks: secret scanning, dependency vulnerability scanning, automated lint enforcement, test gates (builds can proceed without passing tests), rollback mechanisms, and deployment approval gates. The StrictHostKeyChecking=no in SSH commands (ci-runner/runner.ts, line 300) disables SSH host verification, enabling MITM attacks.

# 8. Test Quality
The test suite uses a custom test framework (no Jest, Vitest, or Bun test). While custom runners are not inherently bad, this one lacks assertion libraries, mocking utilities, and coverage reporting.
## 8.1 What Exists
pure-functions.ts (798 lines): Good coverage of utility functions with edge cases. lifecycle.ts (507 lines): Tests extension lifecycle hooks. handler-tests.ts (253 lines): Tests API handlers. integration.ts (178 lines): Integration tests against running services. smoke-test.ts (193 lines): Basic health checks. contracts/ directory: API contract tests.
## 8.2 What's Missing
No tests for CI runner job queue, race conditions, or Docker execution failures. No error path testing (what happens when Docker fails? SSH fails? XTDB is unavailable?). No concurrency tests (multiple simultaneous jobs). No stress tests (large payloads, timeout handling). No security tests (injection, CSRF, auth bypass). No mocking of external services. No code coverage measurement or enforcement.

# 9. Logging & Observability
The codebase uses raw console.log/warn/error throughout (444 console.* calls detected by linter). There is no structured logging library, no log levels, no timestamps in structured format, no request correlation IDs, and no centralized log aggregation.
Dangerous operations (backup, restore, replica stop/start, database wipe) have no audit logging recording WHO performed the operation, WHEN, with WHAT parameters, or the result.
lib/errors.ts provides a captureError() function that syncs errors to disk, but most modules don't use it. There is no error rate monitoring, no alerting on patterns, and no distinction between expected and unexpected errors.

# 10. Files Over 300 Lines
The following table lists all source files exceeding 300 lines, sorted by size descending. Package-lock.json files are included as they were found by the search but are auto-generated.

| File Path | Lines | Notes |
| --- | --- | --- |
| xtdb-event-logger-ui/package-lock.json | 3587 | Auto-generated lock file |
| web-chat/package-lock.json | 3572 | Auto-generated lock file |
| xtdb-event-logger-ui/lib/db.ts | 1142 | God object - ALL database queries |
| test/pure-functions.ts | 798 | Test file - acceptable size |
| harness-ui/static/chat.js | 725 | UI with 30+ global vars |
| scripts/seed-schema.ts | 650 | Schema seed - repetitive SQL |
| deployment-tracker/index.ts | 561 | Duplicated DB boilerplate |
| code-quality/registry.ts | 561 | Quality check registry |
| harness-ui/server.ts | 539 | Server with unauthed endpoints |
| Taskfile.yml | 539 | Task runner config |
| test/run-tests.ts | 526 | Custom test runner |
| test/lifecycle.ts | 507 | Lifecycle tests |
| workflow-engine/index.ts | 492 | Global state, no isolation |
| requirements-tracker/index.ts | 476 | Unescaped LIKE queries |
| xtdb-ops-api/lib/backup.ts | 467 | Swallowed errors in catch |
| harness-ui/pages/graph.ts | 457 | Graph page renderer |
| project-lifecycle/index.ts | 435 | Duplicated DB boilerplate |
| scripts/parse-call-graph.ts | 419 | Call graph parser |
| workflow-engine/package-lock.json | 399 | Auto-generated lock file |
| ci-runner/runner.ts | 381 | Undefined var bug (line 243) |
| xtdb-ops-api/server.ts | 377 | Hardcoded creds, CORS * |
| web-chat/server.ts | 373 | CORS *, no auth |
| harness-ui/static/ops.js | 367 | Operations UI JS |
| projection-architecture.jsx | 339 | Root-level loose JSX file |
| agent-spawner/index.ts | 330 | Leaks process.env to children |
| code-quality/detect.ts | 326 | Quality detection logic |
| docker-compose.yml | 312 | No TLS, hardcoded secrets |
| web-chat/lib/session-pool.ts | 308 | Race condition in cleanup |
| xtdb-event-logger/package-lock.json | 305 | Auto-generated lock file |
| xtdb-event-logger-ui/server.ts | 300 | Unauthed /api/wipe endpoint |

# 11. Category Grades
Each category is graded on a standard A–F scale. These grades are intentionally harsh to reflect production readiness.

| Category | Grade | Rationale |
| --- | --- | --- |
| Security | F | Unauthenticated destructive endpoints, hardcoded credentials everywhere, command injection, CORS *, no TLS, no rate limiting, no audit logging |
| Error Handling | D- | 44+ empty catches, inconsistent patterns, floating promises, errors silently swallowed in critical paths |
| Architecture | D+ | God object db.ts, massive duplication, no DI, global state, no API versioning, tight coupling |
| Code Quality | C- | 527 lint errors, 579 uses of 'any', copy-paste patterns, hardcoded values, magic numbers |
| Testing | C | Tests exist and cover pure functions well, but no error paths, no mocking, no coverage, custom framework limits tooling |
| Docker/Infra | C- | Multi-stage builds are good. Running as root, no healthchecks, no resource limits, Docker socket exposure are not |
| CI/CD | D+ | Novel approach but no security scanning, no test gates, no deployment approval, SSH MITM vulnerability |
| Logging/Observability | D | Raw console.log everywhere, no structured logging, no audit trail, no request tracing, no metrics |
| Documentation | B- | Good README and QUICKSTART. In-code documentation is sparse. No API documentation |

**Overall Grade: D+** — The codebase has creative ideas (JSON-LD CI pipelines, event-sourced architecture) and shows active development. However, the security posture is entirely inadequate for production, error handling is unreliable, and significant architectural debt exists. This is prototype-quality code that needs substantial hardening.

# 12. Prioritized Recommendations
## P0 — Before Any Production Deployment
- Add authentication to ALL destructive endpoints (/api/wipe, /api/restore, /api/replica/*, /api/deploy, /api/ci/enqueue, /api/auth/upload). Remove these from PUBLIC_PATHS.
- Move all hardcoded credentials to environment variables with no defaults. Implement a secrets manager (Vault, SOPS, or at minimum .env files excluded from git).
- Fix command injection: replace all execSync string interpolation with array-form spawn(). Validate all inputs (commit hashes, repo names, service names) against allowlists.
- Fix the undefined stepResults variable in ci-runner/runner.ts line 243.
- Add USER nobody to all Dockerfiles. Remove Docker socket mounts where not strictly needed.
- Replace CORS origin: "*" with explicit domain allowlist.
## P1 — Within 1 Sprint
- Extract database connection boilerplate to lib/db-pool.ts. Remove duplicated t() and n() helpers.
- Break db.ts (1,142 lines) into focused modules: events-queries.ts, projects-queries.ts, dashboard-queries.ts, etc.
- Replace all 44+ empty catch blocks with captureError() calls. Establish a project-wide error handling convention.
- Add health checks to all 14 unconfigured Docker services. Add resource limits.
- Implement structured logging (Pino or similar) to replace 444 console.* calls.
- Add npm audit and secret scanning to the CI pipeline.
- Use timingSafeEqual in webhook signature verification. Fail if CI_WEBHOOK_SECRET is unset.
- Enable TLS in Caddy. Add rate limiting to destructive endpoints.
## P2 — Within 1 Month
- Implement proper RBAC. JWT tokens contain roles but no authorization checks exist per endpoint.
- Add input validation (bounded limits, regex validation on IDs, URL-decode-safe path checks).
- Consolidate N+1 query patterns (getSessionList 7 queries -> 1–2 with JOINs). Replace SELECT * with specific columns.
- Add API versioning to prevent breaking changes from cascading.
- Migrate to a standard test framework (Vitest) with coverage enforcement. Add error path and security tests.
- Implement request correlation IDs across all services for distributed tracing.
- Add audit logging for all privileged operations (who, when, what, result).
- Improve .dockerignore to exclude .git, test/, docs/, data-examples/, scripts/, *.patch, .env.

*Report generated March 23, 2026. Based on analysis of all 314 source files, biome lint results, Docker configurations, CI/CD pipeline, git history, test suite, and security audit.*
