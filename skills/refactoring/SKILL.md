---
name: refactoring
description: Safe refactoring workflow using Chain of Small Steps. Restructures code without changing behavior, with tests between each step. Use when code needs cleanup or restructuring.
---

# Refactoring

## Workflow

1. **Verify tests pass before starting**
   ```bash
   npm test
   ```
   If tests fail, fix them first. Never refactor without a green baseline.

2. **Identify the smell** — duplication, long method, feature envy, god class, etc.

3. **Plan small steps** — each step must be one atomic change that keeps tests green

4. **Execute one step at a time**
   - Make one change
   - Run tests: `npm test`
   - If green: commit with `refactor: <what changed>`
   - If red: revert immediately

5. **Repeat** until the smell is gone

6. **Final check**
   ```bash
   npm test
   git diff --stat HEAD~N  # Review total changes
   ```

## Rules

- Never change behavior. Tests must pass at every step.
- Never add features during refactoring.
- If a test breaks, the refactoring introduced a bug — revert.
- One commit per refactoring step.
