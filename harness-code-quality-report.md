**Code Quality Report**
pi.dev Harness Monorepo

Comprehensive Static Analysis & Architecture Review
March 23, 2026
Prepared for: Frank Simon

**Overall Grade: B**

# **Executive Summary**
The pi.dev Harness monorepo is a well-structured codebase implementing an active quality feedback system for AI-augmented coding sessions. With approximately 30,000 lines of TypeScript across 55 packages, 47 extensions, 18 agent definitions, and 10 skill modules, the project demonstrates solid engineering discipline in areas like naming conventions, module organization, and error handling.
The codebase earns an overall weighted grade of B (3.02 GPA). While architectural clarity, code consistency, and documentation are genuine strengths, these are offset by serious deficiencies in security (hardcoded credentials throughout configuration files), test coverage (45+ modules with zero behavioral tests and no coverage metrics), and TypeScript strictness (no strict compiler settings, 35+ untyped any instances). The overall grade reflects a weighted average where security, testing, and type safety carry the most weight, since they have the greatest impact on production reliability. This is a good codebase with real gaps that need addressing before it can be considered production-hardened.
## **Quality Scorecard**

| Dimension | Grade | Severity of Issues | Weight |
| --- | --- | --- | --- |
| Project Structure & Organization | A | None | 10% |
| Linting & Formatting | A- | Info | 7% |
| Test Coverage | C+ | Critical | 15% |
| Dependency Management | B | Warning | 8% |
| Code Consistency | A | None | 6% |
| Documentation | B+ | Info | 7% |
| TypeScript & Type Safety | B | Warning | 12% |
| Docker & CI/CD | B+ | Warning | 10% |
| Security | C | Critical | 18% |
| Code Smells & Dead Code | B+ | Info | 7% |

## **Grading Methodology**
The overall grade is a weighted GPA average (A=4.0, B=3.0, C=2.0). Weights reflect production impact: Security (18%) and Test Coverage (15%) carry the highest weights because credential exposure and untested code pose the greatest risk to production reliability. TypeScript strictness (12%), Docker/CI (10%), and Project Structure (10%) follow. Cosmetic dimensions like Code Consistency (6%) and Documentation (7%) carry less weight. The weighted calculation yields a GPA of 3.02, which corresponds to a B.
This grade says the codebase is good but not yet production-hardened. The well-designed architecture and consistent conventions provide an excellent foundation, but the security and testing deficiencies must be addressed before the grade can move into the A range.

# **1. Project Structure & Organization**
The monorepo follows a flat, domain-driven architecture with clear separation between extensions (event-driven pi.dev hooks), services (HTTP/WebSocket APIs), shared libraries, and supporting infrastructure. This is a mature organizational pattern that enables independent development of each module while maintaining cohesion through shared conventions.
## **Architecture Overview**

| Layer | Count | Description |
| --- | --- | --- |
| Extensions | 47 | Pi.dev hooks for event capture, quality enforcement, project tracking, safety, and workflow orchestration |
| Services | 7 | Hono-based REST/WebSocket APIs (harness-ui, event-logger-ui, web-chat, ops-api, ci-runner, build-service, docker-event-collector) |
| Agents | 18 | Markdown-defined role templates (worker, tester, reviewer, debugger, planner, etc.) |
| Skills | 10 | On-demand workflow packages (code-review, debugging, security-audit, etc.) |
| Shared Libraries | 3 | db.ts (PostgreSQL), errors.ts (disk-first capture), jsonld/ (context and ID generation) |
| Documentation | 33+ | Architecture docs, pattern guides, progress tracking, and proposals |

## **Module Structure Consistency**
All 47 extensions follow a consistent pattern: a package.json declaring pi.extensions, a single index.ts entry point exporting a default function, optional types.ts and rdf.ts files, and minimal dependencies. Services follow a parallel pattern with server.ts entry points, lib/ directories for internal utilities, and Dockerfiles for containerization. This consistency reduces cognitive overhead when navigating the codebase.
The monorepo lacks formal workspace tooling (no npm/yarn/pnpm workspaces). Each sub-module installs dependencies independently. While this provides isolation, it leads to version drift across packages.

# **2. Linting & Formatting**
The project uses Biome v2.4.8 as a unified tool for formatting, linting, and import organization, fully replacing ESLint and Prettier. The configuration is well-considered. However, the pre-commit hook is non-blocking (always exits 0), which means lint violations can be committed without friction. This undermines the otherwise strong enforcement posture.
## **Biome Configuration Highlights**

| Setting | Value | Assessment |
| --- | --- | --- |
| Indent style | 2 spaces | Standard for TypeScript projects |
| Line width | 120 characters | Reasonable for modern displays |
| Quote style | Double quotes | Consistent across all files |
| Trailing commas | All | Good for cleaner diffs |
| noUnusedImports | Error | Strict import hygiene |
| noUnusedVariables | Error | No dead local code |
| noExplicitAny | Warn | Should be upgraded to Error |
| noImportCycles | Error | Prevents circular dependencies |
| noConsole | Warn | Appropriate for structured logging |
| noDoubleEquals | Error | Enforces strict equality |
| noFloatingPromises | Warn (nursery) | Good async safety |

## **Quality Enforcement Layers**
The project implements three complementary quality enforcement mechanisms:
- Biome: Handles formatting, linting, and import sorting via biome.json, integrated with VS Code for format-on-save.
- Quality Hooks Extension: Provides 10 deterministic checks (file size >300 lines, function size >50 lines, duplication detection, dead code detection, diff size limits) that run non-blocking on write/edit operations.
- Git Pre-commit Hook: Multi-language quality gate (.githooks/pre-commit) supporting TypeScript/JavaScript (Biome), Go (gofmt + go vet), Python (ruff), Rust (rustfmt + clippy), and Shell (shellcheck). Warns but does not block commits.
The pre-commit hook is non-blocking (always exits 0). Consider making it blocking for critical checks like formatting and import cycles to prevent regressions.

# **3. Test Coverage**
The project contains approximately 4,170 lines of test code in 17 files within a centralized /test directory. Testing is layered (unit, integration, contract, smoke, security) but uses a custom test runner rather than a standard framework. This is the most significant quality gap in the codebase: 45+ extension modules have zero behavioral tests, no coverage metrics exist, and the custom runner lacks mocking, snapshot testing, and watch mode. The test layers that do exist are well-structured, but the overall coverage is inadequate for a production system.
## **Test Distribution**

| Test Category | Lines | Files | What It Covers |
| --- | --- | --- | --- |
| Pure Function Unit Tests | 798 | 1 | Health scoring, time formatting, markdown rendering, diff computation, UUID generation |
| Lifecycle Tests (L0–L5) | 507 | 1 | Infrastructure, shared libs, extension deployment, agent/skill deployment, dashboard |
| API Contract Tests | 763 | 5 | All HTTP endpoints: event-logger, ops-api, harness-ui, infrastructure, comprehensive |
| Handler E2E Tests | 253 | 1 | 30 event handlers: message_update, tool_result, turn_end, etc. |
| Smoke Tests | 193 | 1 | Post-deployment: 40+ extensions deployed, agents/skills verified |
| Security Tests | 114 | 1 | Path traversal, SQL injection, CORS headers, static file allowlist |
| WebSocket Protocol Tests | 157 | 1 | Client message parsing: prompt, abort, compact, set_cwd |
| Integration Tests | 178 | 1 | Round-trip XTDB persistence for decisions, projects, delegations |

## **Testing Gaps**
45+ extension modules have no dedicated unit tests. Extensions are only validated through load testing (can they import without crashing?) rather than behavioral testing. This is the single largest quality gap in the codebase.
No standard test framework is used. The custom runner (pass/fail/assert/eq functions) lacks features like mocking, snapshot testing, watch mode, and coverage reporting. Adopting vitest or a similar framework would improve developer experience and enable coverage metrics.
No performance or load tests exist. Given the event-driven architecture with high-frequency event sampling, stress testing the ingestion pipeline would be valuable.

# **4. Dependency Management**
The monorepo deliberately avoids npm bloat with a minimal dependency footprint. The root package.json contains only two dependencies (ws for WebSocket support and Biome for linting). Individual packages are lean, typically depending only on postgres for database access and hono for HTTP services.
## **Version Inconsistencies**
The same dependencies are pinned to different versions across packages, creating potential for subtle runtime inconsistencies:

| Dependency | Version A | Packages | Version B | Packages |
| --- | --- | --- | --- | --- |
| postgres | ^3.4.7 | 4 packages | ^3.4.8 | 18 packages |
| hono | ^4.0.0 | 2 packages | ^4.7.5 | 5 packages |
| @hono/node-server | ^1.0.0 | 2 packages | ^1.14.1 | 5 packages |
| @hono/node-ws | ^1.1.1 | 1 package | ^1.3.0 | 2 packages |

## **Positive Observations**
- No duplicate or redundant dependencies detected across packages.
- No known deprecated packages found in the dependency tree.
- Each module imports only what it needs with no unnecessary transitive dependencies.
- Semantic web libraries (jsonld, n3, @rdfjs/types) are isolated to modules that need them.

# **5. Code Consistency & Naming Conventions**
Code consistency is a standout strength of this codebase. Across all 225 source files sampled, naming conventions, formatting, and structural patterns are remarkably uniform.
## **Conventions Observed**

| Convention | Usage | Consistency |
| --- | --- | --- |
| Variable/function naming | camelCase | 100% — No deviations found |
| Database column naming | snake_case | 100% — Inherited from XTDB schema |
| Constants | UPPER_CASE | 100% — Used for env vars and config values |
| File naming | kebab-case directories, camelCase .ts files | Consistent throughout |
| Logging | Prefixed console.log (e.g., [Deploy], [backup]) | Structured, intentional |
| Error handling | Try-catch with context logging | Consistent pattern |
| Module entry points | index.ts with default export | All 47 extensions |

Biome enforcement with format-on-save ensures formatting consistency is maintained automatically. The 120-character line width and double-quote conventions are applied uniformly.

# **6. Documentation Quality**
Centralized documentation is strong: a detailed README, QUICKSTART guide, and 33 markdown files covering architecture, patterns, and proposals. Inline documentation is present in 179 of 225 files, with section headers and JSDoc on complex types. However, individual extension directories almost universally lack README files, making it difficult for new contributors to understand what each of the 47 extensions does without reading the source. API documentation is also absent — no OpenAPI specs or endpoint references exist for any of the 7 services.
## **Documentation Inventory**

| Document Type | Count | Quality Assessment |
| --- | --- | --- |
| Root README + QUICKSTART | 2 | Thorough: architecture overview, infra table, quick start instructions |
| Architecture Documents | 5+ | ARCHITECTURE_WEBCHAT, IMPLEMENTATION, XTDB_SCHEMA, etc. |
| Pattern Guides | 4+ | AUGMENTED_PATTERNS, AUGMENTED_PATTERNS_V2, conventions docs |
| Progress & Proposals | 10+ | Active tracking of project milestones and feature proposals |
| Inline Code Comments | 179/225 files | Section headers using unicode separators; JSDoc on complex types |
| TODO/FIXME Comments | 2 total | Both legitimate, with context provided |

Sub-module READMEs are sparse. While the centralized docs/ directory is excellent, individual extension directories would benefit from brief README files describing their purpose and event handlers.

# **7. TypeScript Usage & Type Safety**
The codebase is 100% TypeScript with no JavaScript files in the workspace. TypeScript is used for domain modeling with interfaces, union types, and type narrowing. However, the absence of a strict base tsconfig is a fundamental gap: without strictNullChecks and noImplicitAny enforced at the compiler level, the type system is operating well below its potential. Combined with 35+ explicit any instances (primarily in the database layer), the type safety story is weaker than it appears at first glance.
## **Type Safety Issues**
No shared tsconfig.base.json with strict: true exists. The only tsconfig found (in xtdb-ops-api) is minimal and only configures JSX for Hono. Most packages rely on TypeScript defaults, which do not enforce strictNullChecks, noImplicitAny, or other strict compiler options.
35+ occurrences of the any type found across the codebase. The database layer is the primary offender, using sql.typed(v as any, 25) as a repeated anti-pattern for PostgreSQL type codes. Other instances include untyped function parameters (ctx: any, sql: any) and error catching with catch (err: any).
## **Type Safety Positives**
- Well-structured domain interfaces (DecisionRecord, ComponentHealth, EventFields, NormalizedEvent) with union types and literal string types.
- No @ts-ignore or @ts-nocheck comments found anywhere in the codebase.
- Biome enforces useImportType (error) ensuring type-only imports are used correctly.
- No .d.ts declaration files needed; the codebase is pure TypeScript.
- Good use of Record<string, unknown>, const assertions, and type narrowing with instanceof.

# **8. Docker & CI/CD Configuration**
The infrastructure layer is well-designed with 14 services orchestrated via docker-compose.yml, Caddy as a reverse proxy (the only publicly exposed port), and multi-stage Dockerfiles for all services. The CI/CD pipeline uses JSON-LD configuration files and a custom CI runner with Docker-based execution.
## **Docker Best Practices**

| Practice | Status | Details |
| --- | --- | --- |
| Multi-stage builds | 6/7 Dockerfiles | build-service lacks multi-stage optimization |
| Layer caching | Good | Dependencies installed before source code copy |
| Base image | node:22-slim | Consider node:22-alpine for smaller attack surface |
| Non-root execution | Implicit | Should add explicit USER node declarations |
| Health checks | Present | XTDB uses /healthz/alive; services use /api/health |
| .dockerignore | Good | Excludes node_modules, .git, test/, docs/, scripts/ |
| Single exposed port | Excellent | Only Caddy port 80 is host-accessible |

## **CI/CD Pipeline**
The CI pipeline is defined in .ci.jsonld (test step with npm install and pure function tests in node:22-slim). The CD pipeline in .cd.jsonld defines rolling deployment for 7 services with health check paths. The custom CI runner in ci-runner/ watches a job queue, detects language from pipeline configs, and executes builds in Docker containers with results stored in XTDB as JSON-LD.

# **9. Security Analysis**
Security is the weakest dimension and the primary reason the overall grade cannot reach the A range. Despite architectural positives (single exposed Caddy port, JWT via Keycloak, spawn-based command execution), the codebase contains hardcoded credentials in at least 6 files, disabled SSH host key verification in CI pipelines, an unauthenticated container registry, and an environment variable that can disable all authentication. Any one of these would be a significant finding; together they represent a systemic gap in secrets management.
## **Critical Findings**

| Finding | Severity | Location | Impact |
| --- | --- | --- | --- |
| Hardcoded database password ("xtdb") | CRITICAL | xtdb-event-logger-ui/lib/db.ts, xtdb-ops-api/lib/ci-webhook.ts | Full database access with default credentials |
| Hardcoded S3/Garage credentials | CRITICAL | xtdb-primary.yaml, xtdb-replica.yaml, garage-init.sh | Complete object store compromise if repo is leaked |
| Trivial Garage admin token ("admin-secret") | CRITICAL | garage.toml | Garage admin API fully accessible |
| Hardcoded Keycloak admin/admin | CRITICAL | docker-compose.yml | Identity provider admin access |
| SSH host key verification disabled | CRITICAL | ci-runner/runner.ts, build-service/builder.ts | Vulnerable to man-in-the-middle attacks on git clones |

## **Medium-Severity Findings**

| Finding | Severity | Details |
| --- | --- | --- |
| Docker socket mounted in 5 services | WARNING | ops-api, harness-ui, ci-runner, docker-event-collector, build-service have full Docker daemon access |
| QLever runs as root | WARNING | user: root in docker-compose.yml for the SPARQL endpoint |
| CI webhook secret defaults to empty | WARNING | CI_WEBHOOK_SECRET ?? "" makes signature verification optional |
| Zot registry has no authentication | WARNING | Unauthenticated OCI registry allows anyone to push/pull images |
| Auth can be disabled via env var | WARNING | AUTH_ENABLED=false disables all authentication in ops-api |

## **Security Positives**
- JWT-based authentication via Keycloak with JOSE library for token verification.
- Static file serving includes path traversal protection (checks for ".." in paths).
- CI runner uses spawn() instead of shell: true for Docker command execution.
- Caddy reverse proxy as single entry point limits attack surface.
- Security tests exist for path traversal, SQL injection, and CORS headers.

# **10. Code Smells & Anti-Patterns**
The codebase is generally clean, though not without issues. The 1,142-line db.ts file in xtdb-event-logger-ui is a significant smell, combining query building and schema management in a single module. The repeated PostgreSQL connection factory across 3 services indicates an extraction opportunity. Hardcoded timeout values appear in 5+ locations rather than named constants.
## **Issues Found**

| Issue | Severity | Instances | Details |
| --- | --- | --- | --- |
| Oversized files (>500 lines) | WARNING | 3–4 | xtdb-event-logger-ui/lib/db.ts (1142 lines) is the worst offender; candidates for splitting into queries + schema modules |
| Repeated DB connection factory | INFO | 3 | PostgreSQL connection initialization duplicated across build-service, ops-api, and event-logger |
| Magic timeout numbers | INFO | 5+ | Hardcoded values like 5000 and 10000 instead of named constants |
| No exponential backoff | INFO | 1 | Docker event collector uses fixed 5-second reconnect delay |
| as any type casts in DB layer | WARNING | 10+ | sql.typed(v as any, 25) pattern repeated in database utilities |

## **Clean Code Positives**
- No deep nesting detected (maximum 3 levels observed across all sampled files).
- No commented-out code blocks found.
- Only 2 TODO comments in the entire codebase, both legitimate and contextual.
- No unused imports or variables (enforced by Biome at error level).
- No circular dependencies (enforced by Biome noImportCycles at error level).
- Console.log usage is intentional and prefixed for structured logging in containers.

# **Recommendations**
## **Critical Priority (Fix Immediately)**
- Move all hardcoded credentials to environment variables. Create a .env.example template and use Docker secrets or a vault for production. Regenerate all currently exposed secrets (S3 keys, Garage tokens, Keycloak passwords, database credentials).
- Enable SSH host key verification in ci-runner and build-service by removing StrictHostKeyChecking=no and implementing proper SSH key management.
- Add authentication to the Zot container registry to prevent unauthorized image pushes.
## **High Priority (Fix This Sprint)**
- Create a tsconfig.base.json with strict: true, strictNullChecks: true, and noImplicitAny: true. Have all packages extend from this base configuration.
- Upgrade Biome noExplicitAny from warn to error and systematically replace the 35+ any type instances with proper types, especially in the database layer.
- Standardize dependency versions across all packages: postgres to ^3.4.8, hono to ^4.7.5, @hono/node-server to ^1.14.1.
- Adopt a standard test framework (vitest recommended) to enable coverage reporting, mocking, snapshot tests, and watch mode.
## **Medium Priority (This Quarter)**
- Add unit tests for the 45+ extensions that currently have no behavioral tests. Prioritize extensions with complex logic: quality-hooks, workflow-engine, code-quality, ci-runner.
- Split xtdb-event-logger-ui/lib/db.ts (1142 lines) into separate query and schema modules.
- Extract the repeated PostgreSQL connection factory into a shared lib/pg.ts module.
- Replace magic timeout numbers with named constants throughout the codebase.
- Consider adopting npm/pnpm workspaces for coordinated dependency management across the monorepo.
- Add brief README files to each extension directory describing its purpose, event handlers, and configuration.
## **Low Priority (Nice to Have)**
- Switch Docker base images from node:22-slim to node:22-alpine to reduce image size and attack surface.
- Add explicit USER node declarations to all Dockerfiles.
- Implement exponential backoff for the Docker event collector reconnection logic.
- Consider making the git pre-commit hook blocking for critical checks (formatting, import cycles).
- Add performance/load tests for the event ingestion pipeline.

# **Appendix: Files Analyzed**
This report was generated through comprehensive static analysis of the Harness monorepo. The following key areas were examined:

| Area | Files/Directories Examined |
| --- | --- |
| Configuration | biome.json, package.json (root + 22 sub-packages), tsconfig.json, docker-compose.yml, .ci.jsonld, .cd.jsonld, process-compose.yml, Taskfile.yml |
| Infrastructure | 7 Dockerfiles, .dockerignore, garage.toml, garage-init.sh, zot-config.json, xtdb-primary.yaml, xtdb-replica.yaml, Caddyfile |
| Source Code | 225 TypeScript files across all extensions, services, and shared libraries |
| Tests | 17 test files (4,170 lines) including unit, integration, contract, smoke, and security tests |
| Documentation | README.md, QUICKSTART.md, 33 docs/ files, agent definitions, skill definitions |
| Quality Tools | code-quality/ extension, quality-hooks/ extension, .githooks/pre-commit, .vscode/ settings |
