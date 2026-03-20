# TODO: Auto-Changelog for Releases

## Problem
`/release create v1.2.0` accepts a manual changelog string, but doesn't auto-generate one from decisions and artifacts since the last release.

## What exists
- `releases` table with `changelog` column (currently nullable, user-provided)
- `decisions` table with timestamps and project_id
- `artifacts` / `artifact_versions` tables with timestamps
- `deployment-tracker` extension handles `/release create`

## Approach
When `/release create <version>` is called WITHOUT a manual changelog:
1. Query the last release for this project (by `ts DESC`)
2. Query all decisions since that timestamp for this project
3. Query all artifact versions since that timestamp
4. Format into a markdown changelog:
   ```
   ## v1.2.0 — 2026-03-20
   
   ### Decisions
   - ✅ Added error handling library (data_loss → disk-first capture)
   - ✅ Fixed 52 silent catch blocks
   
   ### Files Changed
   - lib/errors.ts (new)
   - harness-ui/pages/errors.ts (new)
   - xtdb-event-logger/endpoints/xtdb.ts (modified)
   ```
5. Store in `releases.changelog` column

If manual changelog IS provided, use it as-is (current behavior).

## Files to change
- `deployment-tracker/index.ts` — enhance `/release create` handler

## Effort: Medium (1-2 hours)
