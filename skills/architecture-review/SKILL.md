---
name: architecture-review
description: Review and document system architecture. Maps components, data flows, boundaries, and dependencies. Use when onboarding to a codebase or before major design changes.
---

# Architecture Review

## Workflow

1. **Map the components**
   ```bash
   find . -name "*.ts" -o -name "*.js" | head -50
   ls -R src/ lib/ app/ 2>/dev/null
   ```
   Identify: services, models, controllers, utils, configs

2. **Trace data flow** — follow a request from entry to response
   - Where does input enter?
   - What transforms it?
   - Where does output go?

3. **Identify boundaries**
   - What talks to external services?
   - What accesses the database?
   - What's the public API vs internal?

4. **Draw ASCII diagram**
   ```
   ┌─────────┐     ┌─────────┐     ┌─────────┐
   │ Client  │────▶│   API   │────▶│   DB    │
   └─────────┘     └─────────┘     └─────────┘
   ```

5. **Check for concerns**
   - Circular dependencies?
   - God modules that do too much?
   - Missing abstractions?
   - Unclear ownership?

6. **Document findings** — write to `docs/architecture.md`
