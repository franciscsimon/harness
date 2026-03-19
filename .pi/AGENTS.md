# Harness Project Guidelines

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
