---
name: debugging
description: Systematic debugging workflow using Approved Logs pattern. Adds logging first, reads output, forms hypothesis, then verifies. Use when tracking down bugs.
---

# Debugging

## Workflow

1. **Reproduce the bug**
   ```bash
   # Run the failing test or trigger the bug
   npm test -- --grep "failing test"
   ```
   If you can't reproduce it, you can't fix it.

2. **Add logging at the boundary**
   Add `console.log` at the entry and exit of the suspected function:
   ```typescript
   console.log("[DEBUG] functionName input:", JSON.stringify(args));
   // ... function body ...
   console.log("[DEBUG] functionName output:", JSON.stringify(result));
   ```

3. **Read the output** — don't guess, read what actually happened

4. **Form a hypothesis** — "The bug is because X returns Y when it should return Z"

5. **Narrow down** — add more logging between entry and exit to find the exact line

6. **Verify the hypothesis** — write a test that fails because of the bug:
   ```typescript
   it("should handle the edge case that caused the bug", () => {
     expect(fn(buggyInput)).toBe(expectedOutput);
   });
   ```

7. **Fix the bug** — make the test pass

8. **Clean up** — remove debug logging, commit fix + test

## Rules

- Say "I don't know" rather than guessing the cause
- Always reproduce before fixing
- Always add a regression test
- Remove all debug logging before committing
