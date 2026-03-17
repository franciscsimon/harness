# Flow Page Fixes — Progress

## What every pi event shares

Every `pi.on()` handler receives `(event, ctx)`. Both extensions get the **same** `ctx` for the **same** event:

```
ctx.sessionManager.getSessionFile()  → session file path (= session_id in XTDB)
ctx.sessionManager.getSessionId()    → short session ID
ctx.cwd                              → working directory
```

This is how xtdb-event-logger gets `sessionId` — via `ctx.sessionManager.getSessionFile()`.

## Natural keys per event type

| Event | Natural key | Unique within session? |
|-------|------------|----------------------|
| `tool_call` | `toolCallId` | ✅ Yes |
| `tool_result` | `toolCallId` | ✅ Yes |
| `tool_execution_start` | `toolCallId` | ✅ Yes |
| `tool_execution_end` | `toolCallId` | ✅ Yes |
| `turn_start` | `turnIndex` | ❌ No — resets each agent run |
| `turn_end` | `turnIndex` | ❌ No — resets each agent run |
| `message_update` | none | ❌ |
| `input` | none | ❌ |
| `agent_start` / `agent_end` | none | ❌ |
| `before_agent_start` | none | ❌ |

## The universal key: seq

`xtdb-event-logger` assigns a monotonic `seq` counter to every event. `session_id + seq` is globally unique. But `seq` is internal to xtdb-event-logger — event-projector can't see it.

## Fix: xtdb-event-logger publishes last event ID on globalThis

Both extensions run in the **same Node.js process** (loaded by jiti). Pi calls handlers sequentially per event, in extension load order. So for each event:

1. `xtdb-event-logger` handler fires first → generates `_id`, assigns `seq`, writes to XTDB
2. `xtdb-event-logger` writes `globalThis.__piLastEvent = { _id, seq, eventName, sessionId }` 
3. `event-projector` handler fires second → reads `globalThis.__piLastEvent` to get the real `_id`

This is one line of code in xtdb-event-logger and one line in event-projector. No bus, no EventEmitter, no complexity.

## All bugs and fixes

| Bug | Issue | Fix |
|-----|-------|-----|
| **Fake IDs** | Event-projector generates its own UUIDs | Read real `_id` from `globalThis.__piLastEvent` |
| **Empty thinking** | Checks `type === "thinking"`, real types are `thinking_start`/`thinking_delta` | Change to `type?.startsWith("thinking")` |
| **No output_summary** | Never extracted from agent_end messages | Extract final assistant text in accumulator |
| **Flow page empty cards** | No content to render | Use real event IDs to link to raw event detail pages |

## Tasks
- [ ] F1: xtdb-event-logger — add one line after `capture()`: publish `{ _id, seq, eventName, sessionId }` to `globalThis.__piLastEvent`
- [ ] F2: event-projector — read `globalThis.__piLastEvent._id` instead of `crypto.randomUUID()` in each handler
- [ ] F3: Fix thinking detection — `startsWith("thinking")`
- [ ] F4: Extract output_summary from agent_end messages in accumulator
- [ ] F5: Update flow.ts — link event IDs to `/event/:id` detail pages, show tool summaries and prompt text

## Status: READY — awaiting go-ahead
