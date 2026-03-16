---
name: code-review
description: Structured code review workflow. Reviews code changes for correctness, style, security, and performance. Use when reviewing PRs, diffs, or code before committing.
---

# Code Review

Systematic code review following augmented coding patterns.

## Workflow

1. **Understand the change**
   ```bash
   git diff --stat
   git log --oneline -5
   ```
   Read the diff. Understand what changed and why.

2. **Check correctness**
   - Does the code do what it claims?
   - Are edge cases handled?
   - Are error paths covered?
   - Are there off-by-one errors, null checks, race conditions?

3. **Check style & patterns**
   - Does it follow existing codebase conventions?
   - Are names clear and consistent?
   - Is there unnecessary complexity?
   - Any code duplication?

4. **Check security**
   - User input validated/sanitized?
   - No hardcoded secrets?
   - SQL injection, XSS, CSRF risks?
   - Permissions checked?

5. **Check performance**
   - Any O(n²) or worse in hot paths?
   - Unnecessary allocations or copies?
   - Missing indexes for new queries?

6. **Check tests**
   - Are new features tested?
   - Do existing tests still pass?
   ```bash
   npm test
   ```

7. **Report findings**
   Format:
   ```
   ## Review Summary
   
   ### Critical
   - [file:line] Issue description
   
   ### Suggestions
   - [file:line] Improvement suggestion
   
   ### Strengths
   - What's done well
   ```

## Active Partner Rules

- Push back if the diff is too large: "This should be split into smaller reviews."
- Say "I don't understand this change" rather than guessing.
- Challenge: "Is this the simplest way to do this?"
