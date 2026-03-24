**Harness Quality Prevention Plan**
Making Code Quality Automatic in the pi.dev Environment

March 2026
Based on Comprehensive Code Quality Audits

*Confidential*

# **Section 1: Current Tooling Inventory**
The harness monorepo includes a rich ecosystem of quality-related extensions, hooks, agents, and CI infrastructure built on pi.dev's extension API. This section catalogues everything that exists today.
## **1.1 Pre-Commit Hook (.githooks/pre-commit)**
A bash-based git hook that runs language-appropriate quality tools on staged files. Supports TypeScript/JS (Biome), Go (gofmt + go vet), Python (ruff), Rust (cargo fmt + clippy), and Shell (shellcheck).
**Critical finding: The hook is NON-BLOCKING (always exits 0). Issues are reported but commits proceed regardless.**
Activation requires manual setup: git config core.hooksPath .githooks (Taskfile task: hooks:install). Not enforced by default.
## **1.2 Quality Hooks Extension (quality-hooks/)**
A pi.dev extension that runs deterministic quality checks after every file write/edit. Checks include:
- Comment detection (flags explanatory comments that should be self-documenting code)
- File size check (warns at >300 lines)
- Function size check (warns at >50 lines)
- Duplication detection (4-line duplicate blocks within a single file)
- Bad test pattern detection (raw SQL in tests, exact score assertions, internal schema assertions)
- Git diff size check (warns >10 files or >300 lines changed before commit)
- Test result recording (captures pass/fail counts from bash test commands to XTDB)
Also registers LLM-callable tools: quality_check and diff_check.
## **1.3 Code Quality Extension (code-quality/)**
Detects the project's language stack at session start using a comprehensive registry of 18+ languages and their canonical quality tools. Reports installed vs. missing tools, provides /quality command with scan/fix/setup/report actions. Registry covers TypeScript, Go, Rust, Python, Java, Kotlin, C/C++, C#, Ruby, PHP, Swift, Elixir, Zig, Shell, SQL, Terraform, Dockerfile, YAML, and Markdown.
## **1.4 Slop Detector Extension (slop-detector/)**
Monitors for 5 AI anti-patterns: AI Slop (filler phrases), Answer Injection, Obsess Over Rules, Perfect Recall Fallacy, and Tell Me a Lie. Tracks tool calls, written files, test runs, context size, and session duration. Fires warnings via ctx.ui.notify. Also provides an LLM-callable check_antipatterns tool.
## **1.5 Alignment Monitor (alignment-monitor/)**
Detects scope drift by comparing files touched against paths mentioned in the original user prompt. Warns when the agent works on 3+ unrelated files or installs dependencies not requested. Provides /check-alignment command and LLM-callable check_alignment tool.
## **1.6 Canary Monitor (canary-monitor/)**
Computes runtime quality signals: tool failure rate, turn inflation, context bloat, retry storms, tool density per turn, and session duration. Surfaces warnings when thresholds are crossed. Updates a status widget with live metrics.
## **1.7 Habit Monitor (habit-monitor/)**
Tracks developer behavioral patterns: commit frequency (reminds after N edits without a commit), test frequency (reminds after N edits without running tests), error streaks (injects corrective prompts after consecutive failures), scope creep (warns when touching too many files), and context fresh-start (warns when context gets too large). Supports snoozing individual habits.
## **1.8 Protected Paths Extension (protected-paths/)**
Blocks writes to sensitive paths (.env files, node_modules, .git, lock files, SSH keys, AWS credentials) with a confirmation dialog. Pattern-based protection using regex matching.
## **1.9 Error Capture Library (lib/errors.ts)**
A disk-first error capture system. Writes errors synchronously to a JSONL file, then a background collector flushes to XTDB periodically. Captures component, operation, severity (data_loss/degraded/transient/cosmetic), stack traces, and session context. Generates JSON-LD for each error record.
## **1.10 CI Runner (ci-runner/)**
A file-based CI runner that watches a queue, checks out code, resolves pipeline steps (from .ci.jsonld or auto-detection), runs each step in Docker containers, and stores results in XTDB as JSON-LD. Supports Soft Serve post-receive hooks for automatic triggering.
**Current .ci.jsonld only runs pure-functions.ts tests. No lint, typecheck, or security steps are defined in CI.**
## **1.11 Biome Configuration (biome.json)**
Biome v2.4.8 is configured with formatter (space indent, 120 line width, double quotes, semicolons, trailing commas) and linter rules:
- correctness: noUnusedImports (error), noUnusedVariables (error), noUnreachable (error), noUnresolvedImports (warn)
- suspicious: noExplicitAny (warn), noDebugger (error), noConsole (warn), noDoubleEquals (error), noDuplicateObjectKeys (error), noEmptyBlockStatements (warn), noImportCycles (error)
- style: noNonNullAssertion (warn), useImportType (error), useConst (error)
- nursery: noFloatingPromises (warn), noMisusedPromises (warn)
## **1.12 Agents**
18 agent definitions in agents/ directory. Quality-relevant agents include:
- security-auditor.md: Reviews code for OWASP Top 10, secrets, vulnerable deps. Read-only.
- reviewer.md: Code review agent that flags bugs, concerns, suggestions. Read-only.
- tester.md, fixture-tester.md: Testing-focused agents.
- janitor.md: Cleanup agent for dead code and tech debt.
- refactorer.md: Restructuring agent.
## **1.13 Skills**
10 skill packages in skills/: architecture-review, code-review, context-management, debugging, knowledge-extraction, migration, performance-optimization, refactoring, security-audit, test-writing. These provide structured prompts for specific development activities.
## **1.14 VSCode Configuration (.vscode/)**
Recommends the Biome extension. Configures format-on-save for TypeScript, JavaScript, and JSON. Disables Prettier and ESLint. Sets tab size to 2 spaces with trailing whitespace trimming and final newlines.
## **1.15 Test Infrastructure**
test/ directory contains: pure-functions.ts (the only CI-executed test), ext-load-test.ts, handler-tests.ts, integration.ts, lifecycle.ts, security.ts, contracts/, smoke-test.ts. Uses a custom minimal test framework (pass/fail/assert/eq functions, no vitest/jest).

# **Section 2: Gap Analysis**
For each category of issues found in the code quality audits, this section identifies what existing tooling should have caught it, why it did not, and what is missing entirely.
## **2.1 Hardcoded Credentials (30+ instances, CRITICAL)**

| Aspect | Status |
| --- | --- |
| Existing tooling | protected-paths/ blocks writes to .env and .ssh files, but does NOT scan file content for credentials. The pre-commit hook runs Biome which has no secret-scanning rules. The security-auditor agent exists but is manual/on-demand only. |
| Why it wasn't caught | No tool in the pipeline scans for patterns like password: "...", hardcoded tokens, or connection strings with embedded credentials. Protected-paths only guards paths, not content. |
| What's missing | A secret scanner (like gitleaks, trufflehog, or detect-secrets) as a pre-commit hook and CI step. A quality-hooks check that regex-scans for credential patterns. Biome cannot do this; a dedicated tool is needed. |

## **2.2 Empty Catch Blocks (40+ instances)**

| Aspect | Status |
| --- | --- |
| Existing tooling | Biome has noEmptyBlockStatements set to 'warn' (not error). quality-hooks/checks.ts does NOT check for empty catches. The pre-commit hook runs Biome but issues are non-blocking. |
| Why it wasn't caught | Biome's noEmptyBlockStatements is set to warn, not error, and the pre-commit hook always exits 0. Many empty catches have a comment like /* silent */ which Biome may not flag. The quality-hooks extension has no catch-block checker. |
| What's missing | Promote noEmptyBlockStatements to error in biome.json. Add a quality-hooks check that detects catch blocks with no error logging or re-throw. Make the pre-commit hook blocking. |

## **2.3 No Input Validation (All 101 endpoints)**

| Aspect | Status |
| --- | --- |
| Existing tooling | None. No schema validation library exists in the codebase. The code-quality extension detects languages and tools but has no concept of 'input validation coverage.' The security-auditor agent mentions checking for injection but is manual. |
| Why it wasn't caught | No automated tool checks for the presence of input validation at endpoint boundaries. This is an architectural gap, not a linting issue. |
| What's missing | Adopt Zod or Valibot for schema validation. Add a quality-hooks check that flags Hono route handlers without schema validation. Add a CI step that reports validation coverage. |

## **2.4 92% Untested Files**

| Aspect | Status |
| --- | --- |
| Existing tooling | habit-monitor reminds to run tests after N edits. quality-hooks records test results. The .ci.jsonld only runs pure-functions.ts. No coverage tracking tool exists. |
| Why it wasn't caught | The CI pipeline only runs one test file. No coverage threshold is enforced. habit-monitor only nudges during active sessions—it can't prevent merging untested code. |
| What's missing | Test coverage reporting (c8 or istanbul). CI coverage threshold enforcement (fail if coverage drops). Expand .ci.jsonld to run ALL test files. Add a quality-hooks check that warns when new files have no corresponding test file. |

## **2.5 250+ as any Type Casts**

| Aspect | Status |
| --- | --- |
| Existing tooling | Biome has noExplicitAny set to 'warn' (not error). No TypeScript compiler (tsc --noEmit) step in CI. The code-quality registry knows about tsc but it's not enforced. |
| Why it wasn't caught | noExplicitAny is warn-only. No tsc --noEmit in CI means type errors don't block merges. 'as any' casts bypass the type system entirely and Biome's noExplicitAny won't flag them (it only flags explicit 'any' type annotations, not cast expressions). |
| What's missing | Add tsc --noEmit to CI pipeline. Create a custom quality-hooks check that counts 'as any' casts and flags files exceeding a threshold. Consider a Biome plugin or custom lint rule for 'as any' detection. |

## **2.6 No Structured Logging (441 raw console statements)**

| Aspect | Status |
| --- | --- |
| Existing tooling | Biome has noConsole set to 'warn' (not error). lib/errors.ts provides structured error capture, but it's only used in a few places. No logging framework exists. |
| Why it wasn't caught | noConsole at warn level was insufficient. The error capture library exists but isn't adopted project-wide. No enforcement mechanism requires structured logging. |
| What's missing | Adopt Pino as the structured logging library. Promote noConsole to error in biome.json (forces migration). Create a logging wrapper in lib/. Add a quality-hooks check that flags console.* usage in non-test files. |

## **2.7 Race Conditions & Concurrency Issues**

| Aspect | Status |
| --- | --- |
| Existing tooling | Biome nursery has noFloatingPromises and noMisusedPromises at 'warn' level. No dedicated concurrency analysis tool exists. quality-hooks has no race condition detection. |
| Why it wasn't caught | Promise-related checks are warn-only and in nursery (experimental). Race conditions in file operations, database access, and shared state require deeper analysis than linting can provide. |
| What's missing | Promote noFloatingPromises and noMisusedPromises to error. Add tsc --noEmit (catches many async/await issues). Consider adding a quality-hooks check for common patterns like unguarded shared state mutations. |

## **2.8 Dead Code & Unused Exports**

| Aspect | Status |
| --- | --- |
| Existing tooling | quality-hooks has detectUnusedExports but it only runs within a single file context (requires 'allContent' parameter which is not passed during on-write checks). Biome has noUnusedImports and noUnusedVariables at error level. The janitor agent can find dead code manually. |
| Why it wasn't caught | The unused export detector requires cross-file analysis which isn't performed during write-time checks. Biome catches unused imports but not unused exports across modules. No CI step performs dead code analysis. |
| What's missing | Add ts-prune or knip to CI pipeline for cross-file dead code detection. Wire allContent parameter in quality-hooks. Add a periodic dead code audit task. |

## **2.9 Inconsistent API Design (Error formats, status codes)**

| Aspect | Status |
| --- | --- |
| Existing tooling | None. No tool checks for API response consistency, HTTP status code correctness, or standardized error shapes. |
| Why it wasn't caught | This is an architectural issue. Linters check syntax, not API design. No shared response helpers or middleware enforce consistency. |
| What's missing | Create shared response helpers (lib/response.ts) with ok(), error(), paginated() functions. Add a quality-hooks check that flags raw c.json() calls without using the shared helpers. Add API contract tests. |

## **2.10 Wildcard CORS & Missing CSRF Protection**

| Aspect | Status |
| --- | --- |
| Existing tooling | The security-auditor agent mentions checking for misconfigurations but is manual. No automated security scanning in CI. |
| Why it wasn't caught | No SAST (Static Application Security Testing) tool is configured. The pre-commit hook has no security checks. |
| What's missing | Add semgrep or eslint-plugin-security rules to CI. Add a quality-hooks check for cors({ origin: "*" }) patterns. Configure CSRF middleware for state-changing endpoints. |

# **Section 3: Prevention Plan by Category**
For every issue type discovered in audits, this section specifies exactly what extension, hook, agent, or habit should prevent it going forward.
## **3.1 Pre-Commit Hook Upgrades**
**File to modify: .githooks/pre-commit**

**Change 1: Make the hook BLOCKING**
Change line 126 from 'exit 0' to 'exit $exitcode'. This single change means quality issues prevent commits. Developers can bypass with git commit --no-verify for emergencies, but the default path enforces quality.

**Change 2: Add secret scanning**
Add a gitleaks check for staged files. Install: brew install gitleaks. Add to .githooks/pre-commit after the language checks:
`gitleaks detect --staged --no-banner --redact || { echo 'Secrets detected in staged files'; exitcode=1; }`

**Change 3: Add TypeScript type checking**
Add a tsc --noEmit check for staged .ts files. This catches type errors, 'as any' abuse, and async/await misuse before they reach CI.

**Change 4: Add dead code scanning**
Add knip --no-progress for detecting unused exports, unreferenced files, and unused dependencies.

## **3.2 Biome Configuration Updates**
**File to modify: biome.json**

The following rule changes promote warnings to errors, making them blocking in both the pre-commit hook and CI:

| Rule | Current | Proposed | Rationale |
| --- | --- | --- | --- |
| noExplicitAny | warn | error | Forces proper typing; prevents 'as any' proliferation |
| noConsole | warn | error | Forces adoption of structured logging |
| noEmptyBlockStatements | warn | error | Prevents silent error swallowing |
| noNonNullAssertion | warn | error | Prevents runtime null errors |
| noFloatingPromises | warn | error | Prevents unhandled async errors |
| noMisusedPromises | warn | error | Prevents race conditions from promise misuse |
| noAccumulatingSpread | warn | error | Prevents O(n^2) performance bugs |
| useSimplifiedLogicExpression | warn | error | Enforces readable conditionals |

Additional rules to ADD to biome.json:
- suspicious.noAsyncPromiseExecutor: 'error' (prevents a common async anti-pattern)
- suspicious.noMisleadingCharacterClass: 'error'
- correctness.noUndeclaredVariables: 'error'
- security.noDangerouslySetInnerHtml: 'error'
## **3.3 Quality Hooks Extension Updates**
**File to modify: quality-hooks/checks.ts**

Add these new check functions to checks.ts:

**Check: detectHardcodedCredentials**
Regex scan for patterns like password: "...", token: "...", secret: "...", apiKey: "...", connection strings with embedded passwords. Severity: block. This catches the 30+ hardcoded 'xtdb' passwords found in the audit.

**Check: detectEmptyCatchBlocks**
Find catch blocks that contain no statements, or only a comment. Flag as 'warn' if a comment exists, 'block' if completely empty. Suggest using captureError() from lib/errors.ts.

**Check: detectMissingInputValidation**
For Hono route handler files, check that endpoint functions reference a schema validation call (z.object, z.parse, Type.Object, etc.) within 10 lines of the route definition. Severity: warn.

**Check: detectAsAnyCasts**
Count occurrences of 'as any' in a file. Warn if count > 3 per file, block if count > 10. This addresses the 250+ 'as any' casts found in the audit.

**Check: detectConsoleStatements**
Flag console.log/console.error/console.warn in non-test files. Suggest using the structured logger instead. Severity: warn.

**Check: detectMissingTestFile**
When a new .ts file is written that contains exported functions, check if a corresponding .test.ts or test file exists. Severity: warn if missing.

**File to modify: quality-hooks/index.ts**
Wire the new checks into runFileChecks(). Also pass the allContent parameter when checking for unused exports (currently empty string).
## **3.4 CI Pipeline Expansion**
**File to modify: .ci.jsonld**

The current CI pipeline only runs pure-functions.ts. The expanded pipeline should have these steps:

| Step | Commands | Blocking? |
| --- | --- | --- |
| lint | npm ci && npx biome ci . | Yes |
| typecheck | npx tsc --noEmit | Yes |
| test | npx jiti test/run-tests.ts (all test files) | Yes |
| coverage | c8 npx jiti test/run-tests.ts && c8 check-coverage --lines 30 | Yes (threshold) |
| secrets | gitleaks detect --source . --no-banner | Yes |
| dead-code | npx knip --no-progress | Advisory |
| security | npx semgrep --config auto --error 2>/dev/null \|\| true | Advisory |

The runner.ts already supports multiple steps and stops on first failure. Making lint and typecheck blocking catches the majority of issues before tests even run.
## **3.5 New Extensions to Create**

**Extension: security-scanner/**
A pi.dev extension that runs on session_start and tool_execution_end. On session start, scans the project for .env files with real credentials, checks for known vulnerable npm dependencies (npm audit). On file write, scans for hardcoded secrets using the same patterns as the quality-hooks check. Registers /security-scan command and security_scan LLM tool.
Directory: security-scanner/index.ts, security-scanner/patterns.ts, security-scanner/package.json

**Extension: structured-logger/**
A shared logging module (lib/logger.ts) built on Pino that provides: log levels (debug/info/warn/error/fatal), JSON output in production, pretty output in development, request correlation IDs, component tagging, and child logger creation. Every service (harness-ui, ci-runner, ops-api, etc.) should import this instead of using console.*.
File: lib/logger.ts (new), plus updates to every server.ts in the monorepo

**Extension: config-validator/**
A startup validation module (lib/config.ts) that validates required environment variables, checks connectivity to declared dependencies (XTDB, Keycloak, etc.), and fails fast with clear error messages. Every service's startup should call validateConfig() before binding to a port.
File: lib/config.ts (new)

**Extension: api-standards/**
A shared API response library (lib/response.ts) providing standardized success/error response shapes, an error-handling middleware for Hono, and request logging middleware. Also provides a Zod-based validation middleware for route parameters.
File: lib/response.ts (new), lib/middleware.ts (new)
## **3.6 Agent Updates**

**Update: security-auditor.md**
Add to the Ground Rules: Check for hardcoded credentials using grep patterns. Run npm audit for dependency vulnerabilities. Verify CORS configuration is restrictive. Check for input validation at all HTTP endpoints. Check for CSRF protection on state-changing endpoints.

**New Agent: quality-gate.md**
A pre-merge review agent that runs the full quality checklist before any merge to main: all tests pass, no new 'as any' casts, no hardcoded secrets, no empty catches, coverage threshold met, no new console.* in non-test files, all new endpoints have input validation. Provides a structured pass/fail report.

**Update: reviewer.md**
Add to Review Structure: Check for proper error handling (no empty catches). Verify input validation exists. Check for hardcoded values that should be config. Verify test coverage for new code.
## **3.7 Habit Monitor Updates**
**File to modify: habit-monitor/habits.ts**

Add these new habits:
- **security-check: **After writing code that handles user input, HTTP requests, or database queries, remind to consider input validation and SQL injection.
- **error-handling: **After writing a try/catch block, remind to log or capture the error (not silently swallow it).
- **type-safety: **After using 'as any' or type assertion, remind about type-safe alternatives.
- **config-externalize: **After writing a hardcoded string that looks like a URL, port, password, or API key, remind to use an environment variable.
## **3.8 Infrastructure & Dependency Changes**

**Secret Management**
Create a .env.example file documenting all environment variables. Add .env to .gitignore (already present). Replace all 30+ hardcoded password: "xtdb" with process.env.XTDB_PASSWORD. Consider a secrets vault (1Password CLI, doppler, or SOPS) for production.

**Schema Validation**
Install Zod (npm install zod). Create validation schemas for every Hono endpoint's request body and query parameters. Generate TypeScript types from Zod schemas to eliminate manual type definitions.

**Test Coverage Enforcement**
Install c8 (npm install -D c8). Configure .c8rc.json with initial thresholds of 30% line coverage (the codebase is at ~8% currently). Increase thresholds quarterly: 30% -> 50% -> 70%. Add c8 to CI pipeline.

**Dependency Auditing**
Add npm audit --audit-level=high to CI pipeline. Run automatically on schedule. Consider adding Socket.dev or Snyk for deeper dependency analysis.

# **Section 4: Implementation Roadmap**
Ordered by impact-to-effort ratio. Each phase can be completed independently. The first phase addresses the highest-severity issues from the audit with the least code change.
## **Phase 1: Immediate Wins (1-2 days)**
These changes require modifying existing files, not creating new ones. They close the biggest gaps with minimal effort.

| Action | File(s) | Impact |
| --- | --- | --- |
| Make pre-commit hook blocking | .githooks/pre-commit line 126: change 'exit 0' to 'exit $exitcode' | All quality issues now prevent commits |
| Promote Biome warnings to errors | biome.json: noEmptyBlockStatements, noExplicitAny, noFloatingPromises, noMisusedPromises -> error | Catches empty catches, any-abuse, promise bugs at lint time |
| Expand CI pipeline | .ci.jsonld: add lint step (npx biome ci .), add typecheck step (npx tsc --noEmit) | CI now catches lint + type errors |
| Replace hardcoded passwords | 30+ files: change password: "xtdb" to password: process.env.XTDB_PASSWORD ?? "xtdb" | Credentials no longer in source code |
| Create .env.example | New file: .env.example listing all env vars with descriptions | Documents all configuration in one place |
| Activate hooks by default | Taskfile.yml: add hooks:install as a dependency of setup and setup:all tasks | Every developer gets quality hooks on setup |

## **Phase 2: New Quality Checks (3-5 days)**
Add detection capabilities to existing extensions.

| Action | File(s) | Impact |
| --- | --- | --- |
| Add secret scanning to pre-commit | .githooks/pre-commit: add gitleaks check | Prevents credentials from entering git history |
| Add credential detection to quality-hooks | quality-hooks/checks.ts: new detectHardcodedCredentials() | Real-time credential detection during development |
| Add empty catch detection to quality-hooks | quality-hooks/checks.ts: new detectEmptyCatchBlocks() | Catches silent error swallowing at write time |
| Add 'as any' counter to quality-hooks | quality-hooks/checks.ts: new detectAsAnyCasts() | Prevents type-safety erosion |
| Add console.* detection to quality-hooks | quality-hooks/checks.ts: new detectConsoleStatements() | Forces structured logging adoption |
| Add security habits to habit-monitor | habit-monitor/habits.ts: add security-check, error-handling habits | Real-time behavioral nudges |
| Run ALL tests in CI | .ci.jsonld: change to run test/run-tests.ts covering all test files | Goes from 1 test file to full test suite |

## **Phase 3: Infrastructure (1-2 weeks)**
Create new shared libraries and tools.

| Action | File(s) | Impact |
| --- | --- | --- |
| Create structured logger | lib/logger.ts (new), update all server.ts files | Structured JSON logging with levels and correlation IDs |
| Create config validator | lib/config.ts (new), update service startup files | Fail-fast on missing/invalid configuration |
| Create API response helpers | lib/response.ts (new), lib/middleware.ts (new) | Consistent API responses across all 101 endpoints |
| Add Zod validation to endpoints | Install zod, add schemas to each route handler | Input validation at every API boundary |
| Add test coverage to CI | Install c8, add .c8rc.json, update .ci.jsonld | Coverage visibility and threshold enforcement |
| Create security-scanner extension | security-scanner/index.ts (new package) | Automated security scanning in pi.dev sessions |

## **Phase 4: Continuous Improvement (Ongoing)**
Iterative tightening of quality standards as the codebase improves.

- Increase test coverage thresholds quarterly (30% -> 50% -> 70% -> 85%)
- Add new Biome rules as they graduate from nursery to stable
- Create the quality-gate.md agent for pre-merge reviews
- Add npm audit and dependency scanning to CI
- Add API contract tests (Hurl or similar) to CI
- Migrate remaining console.* calls to structured logger
- Add CORS restriction and CSRF middleware
- Add API versioning to all endpoints
- Review and tighten protected-paths patterns

# **Section 5: Quality Architecture**
The diagram below shows how all quality tools connect across the three enforcement layers: development time, commit time, and CI/merge time.

## **5.1 Three-Layer Quality Architecture**

**LAYER 1: Development Time (pi.dev extensions)**
These tools run automatically during development sessions. They provide real-time feedback and behavioral nudges.

| Extension | Trigger | What It Catches |
| --- | --- | --- |
| quality-hooks | Every file write/edit | Comments, large files/functions, duplication, empty catches, hardcoded creds, console.*, as any, missing tests |
| code-quality | Session start | Missing quality tools, unformatted code, linter violations |
| slop-detector | Every turn end | AI anti-patterns: slop, answer injection, rule obsession |
| alignment-monitor | Every tool call | Scope drift, unexpected dependency installs |
| canary-monitor | Every tool/turn boundary | Tool failures, retry storms, context bloat, turn inflation |
| habit-monitor | Every turn end | Missing commits, missing tests, error streaks, scope creep, security gaps |
| protected-paths | Every write/edit | Writes to .env, .git, lock files, SSH keys |
| security-scanner (NEW) | Session start + file write | Hardcoded secrets, vulnerable dependencies, CORS misconfig |

**LAYER 2: Commit Time (git hooks)**
These tools run when a developer attempts to commit. They are the hard gate between development and version control.

| Check | Tool | Blocking? |
| --- | --- | --- |
| Format + lint + imports | npx biome check (staged files) | YES (blocking) |
| Type checking | npx tsc --noEmit | YES (blocking) |
| Secret scanning | gitleaks detect --staged | YES (blocking) |
| Dead code detection | npx knip --no-progress | Advisory (warn) |
| Go formatting | gofmt -l (staged .go files) | YES (blocking) |
| Python linting | ruff check + ruff format --check | YES (blocking) |
| Shell linting | shellcheck (staged .sh files) | YES (blocking) |

**LAYER 3: CI/Merge Time (ci-runner)**
These tools run on every push and must pass before merging. They perform more thorough analysis than commit-time checks.

| Step | Tool/Command | Must Pass to Merge? |
| --- | --- | --- |
| Lint | npx biome ci . (full repo) | YES |
| Type check | npx tsc --noEmit | YES |
| All tests | npx jiti test/run-tests.ts | YES |
| Coverage check | c8 check-coverage --lines 30 | YES |
| Secret scan | gitleaks detect --source . | YES |
| Dead code | npx knip | Advisory |
| Security scan | semgrep --config auto | Advisory |
| Dependency audit | npm audit --audit-level=high | Advisory |

## **5.2 Data Flow**
All quality signals flow into XTDB as JSON-LD events. This enables querying across quality dimensions:
- quality-hooks violations -> XTDB events table (via xtdb-event-logger)
- CI run results -> XTDB ci_runs table (via ci-runner/recorder.ts)
- Test results -> XTDB test_runs table (via quality-hooks test recording)
- Error captures -> XTDB errors table (via lib/errors.ts collector)
- Canary metrics -> XTDB events table (via xtdb-event-logger)

The harness-ui dashboard (port 3336) can surface these quality signals as dashboards showing: trend of violations over time, test coverage progression, CI pass/fail rates, most common error types, and files with the most quality issues.
## **5.3 Enforcement Summary**

| Issue Category | Layer 1 (Dev) | Layer 2 (Commit) | Layer 3 (CI) |
| --- | --- | --- | --- |
| Hardcoded credentials | quality-hooks + security-scanner | gitleaks --staged | gitleaks --source . |
| Empty catch blocks | quality-hooks | biome (noEmptyBlockStatements: error) | biome ci |
| No input validation | quality-hooks + habit-monitor | N/A | API contract tests |
| Low test coverage | habit-monitor (test-reminder) | N/A | c8 check-coverage |
| as any abuse | quality-hooks | biome (noExplicitAny: error) + tsc | tsc --noEmit |
| Console.* logging | quality-hooks | biome (noConsole: error) | biome ci |
| Floating promises | quality-hooks | biome (noFloatingPromises: error) | tsc --noEmit |
| Dead code | quality-hooks (exports) | knip (advisory) | knip (advisory) |
| Scope drift | alignment-monitor | N/A | N/A |
| AI slop | slop-detector | N/A | N/A |
| CORS/CSRF | security-scanner | N/A | semgrep (advisory) |
| Inconsistent API | quality-hooks | N/A | API contract tests |

With all three layers active, every issue category from the audit has at least one automated enforcement point. The combination of real-time feedback (Layer 1), hard commit gates (Layer 2), and comprehensive CI checks (Layer 3) creates defense in depth where no single point of failure allows quality issues to reach production.
