# UI Page Migration Task

## What exists
- `harness-ui/` on :3336 — scaffold works (server, layout, nav, CSS, components)
- All 9 routes wired, pages return 200 but render wrong/minimal data

## What's broken
Every page in `harness-ui/pages/` was written from scratch instead of ported from the originals. They need to be replaced with faithful ports.

## How to fix each page

For EACH page below:
1. Read the original file completely
2. Copy its render function into the harness-ui page
3. Change ONLY the data source: replace `db.query(...)` / function params with `await fetchXxx()` from `lib/api.ts`
4. Wrap in `layout()` instead of the original's inline HTML shell
5. Verify line count is within 20% of original

| Page | Original source | Lines | Current broken | 
|------|----------------|-------|----------------|
| sessions | `xtdb-event-logger-ui/pages/sessions.ts` | 108 | 35 |
| session-detail | `xtdb-event-logger-ui/pages/session-detail.ts` | 237 | 32 |
| dashboard | `xtdb-event-logger-ui/pages/dashboard.ts` | 156 | 67 |
| decisions | `xtdb-event-logger-ui/pages/decisions.ts` | 131 | 26 |
| artifacts | `xtdb-event-logger-ui/pages/artifacts.ts` | 130 | 30 |
| projects | `xtdb-event-logger-ui/pages/projects.ts` + `xtdb-ops-api/views/portfolio.tsx` | 233+64 | 56 |
| ops | `xtdb-event-logger-ui/pages/ops.ts` | 125 | 90 |

## Key differences in the new pages
- Data comes from `lib/api.ts` fetch calls, not DB queries
- Layout uses `layout()` from `components/layout.ts` instead of inline HTML
- Health functions need to be copied from `xtdb-event-logger-ui/lib/health.ts`
- Format functions need to be copied from `xtdb-event-logger-ui/lib/format.ts`

## API endpoints (verified with curl)
- `GET :3333/api/sessions/list` → `[{sessionId, eventCount, firstTs, lastTs, lastEventName, lastSeq, byCategory, errorRate, turnCount, maxPayloadBytes, durationMs}]`
- `GET :3333/api/sessions/:id/events` → `[{seq, event_name, event_category, ts, ...}]`
- `GET :3333/api/dashboard` → `{totalSessions, totalEvents, avgEventsPerSession, overallErrorRate, sessions[{sessionId,eventCount,errorRate,turnCount,maxPayloadBytes,durationMs,firstTs,lastTs,healthScore,healthColor}], toolUsage[], errorPatterns[]}`
- `GET :3333/api/decisions` → `[{_id, task, what, outcome, why, alternatives, files, tags, ts, session_id, project_id}]`
- `GET :3333/api/artifacts` → `[{_id, path, kind, operation, content_hash, ts, session_id, project_id, tool_call_id}]`
- `GET :3335/api/health` → `{overall, components[{name, status, details, checkedAt}]}`
- `GET :3335/api/backups` → `[{filename, size, created}]`
- `GET :3335/api/incidents` → `[{_id, severity, title, status, started_ts, ...}]`
- `GET :3335/api/replication` → `{primary, replica, lag, synced}` (requires AUTH_ENABLED=false)
- `GET :3335/api/scheduler/status` → `{running, intervalHours, lastRun}` (requires AUTH_ENABLED=false)

## Do ONE page at a time, test, then next
