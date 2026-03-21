# Code Quality Standard

> Every codebase the harness touches must have automated formatting, linting, and type checking.
> This is not optional. These are the rules every agent follows regardless of role.

---

## The Rule

**Before writing code in any codebase, detect the language stack and ensure quality tools are configured.** If they aren't, set them up first. If they are, run them after writing.

This applies to the planner (who must include it in plans), the worker (who must run it), the tester (who must verify it passes), the reviewer (who must check it was run), and the committer (who must not commit code that fails checks).

## The Workflow

### 1. On first contact with any codebase

Run `/quality scan` or mentally execute this checklist:

```
What language(s) does this codebase use?
  → Check: file extensions, manifest files (package.json, go.mod, Cargo.toml, pyproject.toml, etc.)

Does it have a formatter configured?
  → Check: biome.json, .prettierrc, rustfmt.toml, .clang-format, pyproject.toml [tool.ruff], etc.
  → If NO: this is the first thing to fix. Pick the canonical tool for the language (see table below).

Does it have a linter configured?
  → Check: biome.json, .golangci.yml, clippy in Cargo.toml, pyproject.toml [tool.ruff], etc.
  → If NO: set it up. A codebase without a linter is a codebase accumulating invisible debt.

Does it have type checking?
  → Check: tsconfig.json, mypy.ini, pyproject.toml [tool.mypy], etc.
  → If NO and the language supports it: configure it.
```

### 2. On every file write

```
After writing or editing a file:
  1. Imports at the top, sorted, no duplicates, no unused
  2. No debug statements left in (console.log, print, debugger, println!)
  3. Run the formatter (or know it runs on save)
  4. Run the linter — fix all errors, evaluate all warnings
  5. If typed language: run the type checker
```

### 3. Before every commit

```
Run the full quality check for the language:
  TypeScript:    npx biome check .
  Go:            gofmt -l . && go vet ./... && golangci-lint run
  Rust:          cargo fmt --check && cargo clippy -- -D warnings
  Python:        ruff check . && ruff format --check . && mypy .
  etc.

If any check fails, fix it before committing.
No exceptions. No "I'll fix it later." Fix it now.
```

## The Tool for Each Language

Every language has a canonical set of quality tools. Use these. Don't reinvent.

| Language | Formatter | Linter/Vet | Type Checker | Test Runner |
|---|---|---|---|---|
| **TypeScript/JS** | Biome | Biome | tsc --noEmit | bun test / vitest |
| **Go** | gofmt (built-in) | go vet + golangci-lint | (compiler) | go test |
| **Rust** | rustfmt (built-in) | clippy (built-in) | (compiler) | cargo test |
| **Python** | ruff format | ruff check | mypy | pytest |
| **Java** | google-java-format | checkstyle + spotbugs | (compiler) | JUnit / Gradle |
| **Kotlin** | ktlint | detekt | (compiler) | JUnit / Gradle |
| **C/C++** | clang-format | clang-tidy + cppcheck | (compiler) | googletest / catch2 |
| **C#** | dotnet format | Roslyn analyzers | (compiler) | dotnet test |
| **Ruby** | RuboCop | RuboCop | Sorbet (optional) | RSpec / minitest |
| **PHP** | php-cs-fixer | phpstan | phpstan | PHPUnit |
| **Swift** | swift-format | SwiftLint | (compiler) | XCTest |
| **Elixir** | mix format (built-in) | credo | dialyzer | ExUnit |
| **Zig** | zig fmt (built-in) | — | (compiler) | zig test |
| **Shell** | shfmt | shellcheck | — | bats |
| **SQL** | sqlfluff | sqlfluff | — | — |
| **Terraform** | terraform fmt | tflint | — | terraform validate |
| **Dockerfile** | — | hadolint | — | — |

**The "all-in-one" tools** (one binary, one config, replaces multiple tools):
- TypeScript/JS → **Biome** (replaces ESLint + Prettier)
- Python → **Ruff** (replaces black + isort + flake8 + pylint)
- Go → built-in (gofmt + go vet + go test ship with the language)
- Rust → built-in (rustfmt + clippy + cargo test ship with the toolchain)

## What Each Tool Role Catches

**Formatter (fmt)** — Non-negotiable. Zero-config where possible.
- Consistent indentation, spacing, line breaks
- Import ordering and grouping
- Trailing commas, semicolons, quote style
- **Why:** Eliminates 100% of style arguments in code review

**Linter (lint/vet)** — Catches bugs the compiler misses.
- Unused variables and imports
- Unreachable code
- Suspicious patterns (== vs ===, catch-and-swallow, floating promises)
- Circular dependencies
- Security issues (hardcoded secrets, SQL injection patterns)
- **Why:** Prevents entire categories of bugs before they reach production

**Type Checker** — Catches type errors at compile time.
- Wrong argument types, missing properties
- Null/undefined dereferences
- API contract violations (return type changed but callers not updated)
- **Why:** Turns runtime crashes into compile-time errors

## Anti-Patterns Every Agent Must Avoid

These are the patterns the quality tools catch. Know them so you don't generate them:

### Universal (all languages)

1. **Imports in the middle of the file.** Imports go at the top. Always. No exceptions.
2. **Debug statements left in.** No console.log, print(), println!, dbg!, System.out.println in committed code.
3. **Unused imports.** Dead imports are noise. Remove them.
4. **Unused variables.** If you declared it and don't use it, delete it.
5. **Inconsistent formatting.** Use the formatter. Don't hand-format.
6. **Commented-out code.** Delete it. Git remembers. You don't need commented-out code as a backup.
7. **Magic numbers without names.** `if (retries > 3)` → `if (retries > MAX_RETRIES)`.

### Error Handling

8. **Catch-and-swallow.** `catch (e) { console.log(e) }` is NOT error handling. Either recover, rethrow, or return an error to the caller.
9. **Catch-all without discrimination.** Different errors need different handling. Don't treat network errors the same as parse errors.
10. **Missing error handling on I/O.** Every fetch, DB query, file read, and network call can fail. Handle it.

### Type Safety

11. **`as any` (TypeScript), `type: ignore` (Python), unsafe blocks without justification (Rust).** Each one is a hole in the safety net. Minimize them. When unavoidable, add a comment explaining why.
12. **Missing return types on public functions.** Public API = contract. The caller needs to know what they get back.
13. **Non-null assertions without proof.** `user!.name` will crash if user is null. Check first.

### Architecture

14. **Circular imports.** Module A imports B which imports A. This creates initialization order bugs and makes the code impossible to reason about.
15. **God functions.** If a function calls more than 8-10 other functions, it knows too much. Split it.
16. **Cross-layer imports.** Shared libraries should not import from application code. Tests should not be imported by production code.

### Async / Concurrency

17. **Floating promises.** `doSomethingAsync()` without await or .catch() means errors are silently lost.
18. **Promise.all without partial failure handling.** If one of 5 operations fails, do you really want to lose all 5 results? Consider Promise.allSettled.
19. **Missing timeouts on outward calls.** Every HTTP request, DB query, or RPC call needs a timeout. Without one, a hung dependency silently hangs your system.

## For Each Agent Role

### Planner
- Include "set up code quality tools" as step 1 in every plan that touches a new codebase
- Reference this standard in the plan
- Verify: "Does this codebase have fmt + lint + typecheck configured?"

### Worker / Implementer
- Run `/quality scan` on first contact with any codebase
- Run the formatter after every file write
- Run the linter before declaring a task done
- Never commit code that fails `biome check` / `ruff check` / `cargo clippy` / etc.

### Tester
- Verify that quality tools pass as part of the test suite
- If tests import production code, verify no circular dependencies are introduced
- Lint the test files too — test code is production code

### Reviewer
- First check: "Did the quality tools run?" If not, stop the review
- Verify: no new `as any`, no new `catch-and-swallow`, no new circular deps
- Check: imports at top, no debug statements, no unused code

### Committer
- Run the full quality suite before committing
- If any check fails, do not commit. Fix first.
- Include quality tool output in commit context if relevant

### Janitor
- Run `/quality report` to see the current state
- Track: number of `as any` casts, catch-and-swallow patterns, circular deps
- Goal: these numbers should decrease over time, never increase

### Security Auditor
- Verify that linting includes security rules (gosec, Biome suspicious, phpstan security)
- Check for hardcoded secrets, SQL injection patterns, path traversal

## Setup for a New Codebase

When an agent encounters a codebase with no quality tools:

```bash
# 1. Detect what's there
cd /path/to/project

# 2. Look at what language it is
ls *.ts *.go *.py *.rs *.java  # what files exist?
cat package.json               # Node/TS project?
cat go.mod                     # Go project?
cat Cargo.toml                 # Rust project?
cat pyproject.toml             # Python project?

# 3. Install the canonical tool (see table above)
# For TypeScript:
npm install --save-dev --save-exact @biomejs/biome
npx biome init

# For Python:
pip install ruff mypy
# Add [tool.ruff] section to pyproject.toml

# For Go:
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
# Create .golangci.yml

# 4. Run first check — this shows the current state
npx biome check .       # TypeScript
ruff check .            # Python
golangci-lint run       # Go
cargo clippy            # Rust

# 5. Auto-fix what can be auto-fixed
npx biome check --write .   # TypeScript
ruff check --fix .           # Python
golangci-lint run --fix      # Go
cargo clippy --fix           # Rust

# 6. Commit the config files
git add biome.json           # or .golangci.yml, pyproject.toml, etc.
git commit -m "chore: add code quality tooling"
```

## Reference

Full tool registry with install commands, check commands, fix commands, and config file names: `code-quality/registry.ts`

Stack detection (auto-detects languages and missing tools): `code-quality/detect.ts`

Extension (integrates with harness lifecycle): `code-quality/index.ts`
