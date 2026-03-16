---
name: test-writing
description: Systematic test writing workflow. Writes comprehensive tests for existing code covering happy paths, edge cases, and error handling. Use when code needs test coverage.
---

# Test Writing

Write thorough tests following augmented coding patterns.

## Workflow

1. **Read the source code**
   Understand what the function/module does. Note:
   - Input types and valid ranges
   - Return types and possible values
   - Side effects (file I/O, network, DB)
   - Error conditions and thrown exceptions

2. **Identify test categories**
   - ✅ Happy path — normal inputs, expected outputs
   - 🔲 Edge cases — empty, null, zero, boundary values, max size
   - ❌ Error cases — invalid inputs, missing deps, network failures
   - 🔄 State — before/after, concurrent access, ordering

3. **Write tests — one category at a time**
   ```typescript
   describe("functionName", () => {
     describe("happy path", () => {
       it("should return X when given Y", () => { ... });
     });
     describe("edge cases", () => {
       it("should handle empty input", () => { ... });
       it("should handle null", () => { ... });
     });
     describe("error handling", () => {
       it("should throw on invalid input", () => { ... });
     });
   });
   ```

4. **Run tests after each group**
   ```bash
   npm test -- --grep "functionName"
   ```

5. **Verify coverage**
   ```bash
   npm test -- --coverage
   ```

6. **Report**
   ```
   Tests written: N
   Coverage: happy path ✅, edge cases ✅, errors ✅
   Bugs found: [list any failures that reveal real bugs]
   ```

## Rules

- Test behavior, not implementation
- One assertion per test (prefer)
- Don't modify source code — report bugs, don't fix them
- Use descriptive test names that read like sentences
