# UI Fixes Remaining — 5 Specific Issues

## Issue 1: Session Detail Broken
**Symptom:** Clicking a session card goes to 404
**Root cause:** Server route is `/sessions/:id` but session IDs contain slashes (e.g. `/Users/opunix/.pi/agent/sessions/--Users-opunix-harness--/2026-03-19T16-44-37-67`)
**Fix:** Change route in `server.ts` to `/sessions/:id{.+}` — ALREADY DONE but needs commit + restart
**Status:** Code fixed, needs deploy

## Issue 2: Artifacts Not Clickable / No Content View
**Symptom:** Artifact cards don't link anywhere, can't view content
**Root cause:** No `/artifacts/versions` or `/artifacts/content/:id` routes in harness-ui. Original on :3333 has these but they query DB directly — no JSON API exists for them.
**Fix options:**
- A) Add API endpoints to :3333: `GET /api/artifacts/versions?path=...` and `GET /api/artifacts/content/:id` 
- B) Link artifacts to :3333 directly: `href="http://localhost:3333/artifacts/versions?path=..."` (quick hack)
- C) Add the routes to harness-ui that proxy to :3333's HTML pages
**Recommended:** Option A — add 2 API endpoints on :3333, then consume in harness-ui

## Issue 3: Projects Detail Not Working
**Symptom:** Clicking a project card goes to 404
**Root cause:** No `/projects/:id` route in harness-ui server.ts. No `/api/projects` or `/api/projects/:id` endpoint on :3333 either.
**Fix:**
1. Add `GET /api/projects` and `GET /api/projects/:id` endpoints to xtdb-event-logger-ui/server.ts
2. Add `/projects/:id{.+}` route to harness-ui/server.ts
3. Create `pages/project-detail.ts` — port from xtdb-event-logger-ui/pages/projects.ts `renderProjectDetail()`
**Verified API shape needed:** `{_id, name, canonical_id, identity_type, session_count, first_seen_ts, last_seen_ts, lifecycle_phase, git_remote_url, git_root_path}`

## Issue 4: Ops Not Complete
**Symptom:** Backup data shows wrong fields, some sections empty
**Root cause:** Ops page uses field names `size` and `created` but API returns `sizeBytes`/`sizeHuman` and `modifiedAt`
**Fix:** Update `renderBackupsSection()` in `pages/ops.ts`:
- `b.size` → `b.sizeBytes`
- `b.created` → `b.modifiedAt`
- Add `b.sizeHuman` display
- Also: replication shows `synced: false` and `lag: -1` which may be correct data but looks alarming

## Issue 5: Chat Broken
**Symptom:** Chat page doesn't work
**Root cause:** Need to verify — the WebSocket URL `ws://localhost:3334/ws` is correct. Possible issues:
- :3334 (web-chat) not running
- CORS blocking WebSocket from :3336 origin
- Chat page JS errors in browser console
**Debug steps:**
1. Check if :3334 is running: `lsof -ti:3334`
2. Open browser dev tools on :3336/chat, check console for errors
3. Check if web-chat server has WebSocket CORS headers

## Quick Wins (can fix without new APIs)
- Issue 1: Already fixed in code, just needs restart ✅
- Issue 4: 3-line field name fix in ops.ts
- Issue 5: Likely just needs :3334 running

## Needs Backend Changes
- Issue 2: Needs 2 new API endpoints on :3333
- Issue 3: Needs 2 new API endpoints on :3333 + new page file
