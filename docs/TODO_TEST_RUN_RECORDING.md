# TODO: Test Run Recording

## Problem
`test_runs` table exists and is seeded but **nothing writes to it**. The traceability chain `requirement → code → test → evidence` breaks at the test step.

## What exists
- `test_runs` table in XTDB schema (17 columns: _id, project_id, session_id, suite_name, test_name, status, duration_ms, error_summary, stack_trace, file_path, line_number, runner, run_group_id, entity_type, entity_id, ts, jsonld)
- `requirement_links` table can link tests to requirements
- Contract test runner (`scripts/test-contracts.sh`) runs 34 tests
- Handler tests (`test/handler-tests.ts`)

## Approach options

### Option A: Post-run script
A script that parses test output (pass/fail/duration) and INSERTs rows into `test_runs`. Run after `test-contracts.sh` or handler tests. Simple, no extension needed.

### Option B: Test runner wrapper
Wrap `npx jiti` test invocations to capture results and write to XTDB automatically. More integrated but couples test execution to DB.

### Option C: Extension hook
Add test recording to an existing extension (e.g., `quality-hooks`) that captures test results when the agent runs tests during a session.

## Questions for user
- Should this capture only harness's own tests, or also tests the agent runs on user projects?
- Option A (post-run script) seems simplest — is that the right scope?

## Effort: Medium (1-2 hours)
