---
name: migration
description: Dependency upgrade and API migration workflow. Upgrades packages, migrates deprecated APIs, and modernizes code step by step. Use when upgrading frameworks, libraries, or language versions.
---

# Migration

## Workflow

1. **Check current state**
   ```bash
   npm outdated
   npm audit
   ```

2. **Read the migration guide** — check official docs for breaking changes

3. **Migrate one dependency at a time**
   ```bash
   npm install <package>@latest
   npm test
   ```

4. **If tests break** — fix migration issues, don't skip

5. **Commit each migration separately**
   ```bash
   git add -A && git commit -m "chore: upgrade <package> to vX.Y.Z"
   ```

6. **Repeat** until all dependencies are current

## Rules

- One dependency per commit
- Tests must pass between each upgrade
- Read the changelog before upgrading
- If a migration is too complex, document it and move on
