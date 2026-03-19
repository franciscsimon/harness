# Harness Project Guidelines

## Migration & Code Porting Rules

When migrating, unifying, or consolidating existing code into a new location:

1. **Read the original source file COMPLETELY before writing any replacement.** Never guess what it does.
2. **Copy the rendering/logic functions, then change ONLY what must change** (data source, imports, wrapper). Keep all formatting, badges, links, health indicators, grouping logic.
3. **Your new file must be within 20% line count of the original.** If it's half the size, you deleted functionality. Stop and re-read the original.
4. **Diff your new file against the original.** Only data-source lines should differ, not rendering.

## API Consumer Rules

Before writing ANY code that calls an API endpoint:

1. **curl the actual endpoint first** and examine the real JSON response.
2. **Use the exact field names from the real response** — never assume (`sessionId` not `session_id`, `ts` not `timestamp`).
3. **Paste the real response shape as a comment** in your code so it's verifiable.

```bash
# ALWAYS do this first
curl -s http://localhost:3333/api/sessions/list | python3 -m json.tool | head -20
```

## Process Management Rules

1. **Never start long-running services with `&` in bash calls.** They die silently or get killed by timeouts.
2. **For testing server pages, use inline test scripts:** import the server, setTimeout to test, process.exit().
3. **Always use `--max-time` with curl** to prevent hanging.
4. **Always use `timeout` parameter on bash calls** that involve network or servers.

## Test Writing Rules

When writing tests for this codebase, follow these rules strictly:

### DO: Contract/Consumer Tests
- Test through the **public interface** that real consumers use (HTTP endpoints, tool `execute()`, exported functions)
- Assert on **requirements** ("healthy scores higher than unhealthy") not exact values ("score equals 100")
- Assert on **observable outcomes** ("output contains the task value") not internal encoding ("property ev:task equals X")
- For DB-backed features, test through the API layer (e.g., `getDecisions()`) not raw SQL

### DON'T: Implementation-Coupled Tests
- Don't assert exact numeric outputs of computed values (breaks on formula tweaks)
- Don't assert on internal property names, enum values, or type discriminants
- Don't write raw SQL INSERT/SELECT in tests — go through the function that writes the data
- Don't test private/unexported functions directly — test them through their public caller
- Don't hardcode truncation markers, separator strings, or formatting details

### Test Categories
1. **Specification tests** — input→output for pure functions with stable contracts (e.g., URL normalization)
2. **Behavior tests** — "A scores higher than B", "error input returns error", "empty input is handled"
3. **Contract tests** — HTTP status codes, WebSocket message types, protocol shapes
4. **Smoke tests** — "server responds", "DB connects", "extension loads"

### When a test breaks
If a test breaks after a code change, ask: "Did the **requirement** change, or just the implementation?" If only the implementation changed, the test was wrong — it was testing internals.
