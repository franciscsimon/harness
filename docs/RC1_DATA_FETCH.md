# Root Cause 1: Data Never Fetched

## Problem
`lib/db.ts` `ALL_COLS` lists only v1 columns. The 15 new schema v2 columns are never SELECTed from XTDB, so no UI page can see them.

## Affected
- Every query in `db.ts` uses `ALL_COLS` → stream view, session detail, event detail, dashboard, SSE polling
- `EventRow` interface has `[key: string]: any` catch-all but columns must be in SELECT to appear

## Tasks
- [x] T1.1: Add 15 new columns to `ALL_COLS` in `lib/db.ts`
- [x] T1.2: Verify columns resolve against live XTDB — confirmed with psql, data present in message_content, stream_delta, tool_content, tool_input, turn_message, etc.
- [x] T1.3: Confirm `getPopulatedFields()` picks up the new columns — verified CORE_KEYS does not contain any of the 15 new column names, so they flow through automatically
- [ ] T1.4: Restart UI server and verify event detail page shows new fields — deferred until RC2 fixes truncation, otherwise content will appear but chopped to 120 chars

## Status: DONE (data flows, rendering fix in RC2)
