# UI Fixes Remaining — Precise Diagnostics

All API shapes verified by curl on 2026-03-19.

## Real API Responses

```
GET :3333/api/stats → {total: 17475, byCategory: {agent, compaction, input, message, resource, session, tool}}
GET :3333/api/dashboard → {totalSessions, totalEvents, avgEventsPerSession, overallErrorRate, sessions[{sessionId, eventCount, errorRate, turnCount, maxPayloadBytes, durationMs, firstTs, lastTs, healthScore, healthColor}], toolUsage[{tool, count, errors, errorRate}], errorPatterns[]}
GET :3333/api/sessions/list → [{sessionId, eventCount, firstTs, lastTs, lastEventName, lastSeq, byCategory, errorRate, turnCount, maxPayloadBytes, durationMs}]
GET :3333/api/sessions/:id/events → [{_id, event_name, category, seq, ts, cwd, tool_name, provider_payload_bytes, ...}]
GET :3333/api/decisions → [{_id, task, what, outcome, why, ts, session_id, project_id, ...}]
GET :3333/api/artifacts → [{_id, path, kind, operation, content_hash, ts, session_id, project_id}]
GET :3335/api/health → {overall, components[{name, status, details, checkedAt}]}
GET :3335/api/backups → [{filename, sizeBytes, sizeHuman, modifiedAt, type}]
GET :3335/api/replication → {primary, replica, lag, synced}
GET :3335/api/scheduler/status → {running, intervalHours, lastRunAt, lastJobId, lastJobStatus, maxBackups}
GET :3335/api/incidents → [{_id, severity, title, status, started_ts, ...}]
```

## Issue 1: Home Page — undefined values
**File:** `harness-ui/pages/home.ts`
**Problem:** Uses `stats.totalSessions`, `stats.activeSessions`, `stats.totalEvents`, `stats.latestEvent` — none of these exist. `/api/stats` returns `{total, byCategory}`.
**Fix:** Use `fetchDashboard()` for session count (`data.totalSessions`). Use `fetchStats()` for event count (`data.total`). Remove `activeSessions`/`latestEvent` references.

## Issue 2: Home Page — system health wrong
**File:** `harness-ui/pages/home.ts`
**Problem:** Likely references health fields that don't match real shape.
**Fix:** Health is `{overall, components[{name, status, details, checkedAt}]}`. Use `health.overall` and iterate `health.components`.

## Issue 3: Session Detail — missing turns, filters, details
**File:** `harness-ui/pages/session-detail.ts`  
**Problem:** Original has client-side JS (`/static/session.js`) that does grouping, collapse/expand, and filtering. The harness-ui doesn't serve that JS file.
**Fix:** Copy `xtdb-event-logger-ui/static/session.js` to `harness-ui/static/session.js`. Add `<script src="/static/session.js"></script>` to the session-detail page output.

## Issue 4: Artifacts — no content view
**File:** `harness-ui/pages/artifacts.ts`
**Problem:** Original has `/artifacts/content/:id` route that reads file content from DB. No JSON API exists for artifact content.
**Fix:** Either add `GET /api/artifacts/:id/content` to :3333, or link to `http://localhost:3333/artifacts/content/:id` directly.

## Issue 5: Ops — incomplete (replication, scheduler, backups)
**File:** `harness-ui/pages/ops.ts`
**Problem:** Field name mismatches. Backup uses `size`/`created` but API returns `sizeBytes`/`sizeHuman`/`modifiedAt`. Scheduler uses `lastRun` but API returns `lastRunAt`.
**Fix:** Update field references:
- `b.size` → `b.sizeBytes` or `b.sizeHuman`
- `b.created` → `b.modifiedAt`
- `sched.lastRun` → `sched.lastRunAt`
Also: original ops page on :3333 uses client-side JS (`/static/ops.js`) that polls APIs. harness-ui renders server-side but missing the interactive controls (backup buttons, replica controls, kafka topics).

## Issue 6: Chat broken
**File:** `harness-ui/pages/chat.ts`
**Problem:** 361 lines — was NOT ported from original (152 lines). Was a from-scratch rewrite. Likely has client-side JS bugs.
**Fix:** Read `web-chat/pages/chat.ts` (152 lines) and port it properly. The chat page is mostly client-side JS that connects to `ws://localhost:3334/ws`.

## Issue 7: Dashboard — tool field name mismatch
**File:** `harness-ui/pages/dashboard.ts`
**Problem:** Uses `t.tool_name` but API returns `t.tool`. Uses `t.error_count` but API returns `t.errors`.
**Fix:** `t.tool_name` → `t.tool`, `t.error_count` → `t.errors`

## Execution Order
1. Fix home.ts (undefined values) — 10 min
2. Copy session.js + ops.js static files — 5 min  
3. Fix ops.ts field names — 5 min
4. Fix dashboard.ts tool field names — 2 min
5. Port chat.ts from original — 30 min
6. Add artifact content route — 15 min
