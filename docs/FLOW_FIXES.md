# Flow Page Fixes — Progress

## Current State
All 4 projection types exist in XTDB. Pipeline works. But thinking_event_ids are empty and all stored event IDs are fake UUIDs that can't cross-reference raw events.

## Root Cause: Why IDs Are Fake

Both `xtdb-event-logger` and `event-projector` are separate pi extensions that receive the same pi events. But pi events carry **no unique ID**. Each extension generates its own `crypto.randomUUID()` independently:

```
pi emits tool_call event
  ├→ xtdb-event-logger: uuid() → "282859df-..." → stored as _id in events table
  └→ event-projector:   crypto.randomUUID() → "f018164c-..." → stored in tool_call_event_ids
```

Two different UUIDs for the same event. The projector's IDs don't resolve to anything.

### What pi events DO carry as natural keys
- `tool_call` / `tool_result` → `toolCallId` (e.g. `toolu_019MZvpF...`) — unique per tool invocation
- `turn_start` / `turn_end` → `turnIndex` — unique per turn within a run
- `message_update` → `stream_delta_type` — not unique, but combinable with seq

### What xtdb-event-logger adds
- `_id` — UUID, primary key in events table
- `seq` — monotonic counter, unique within session

### Both extensions run in the same Node.js process
They're loaded by jiti into the same V8 isolate. `globalThis` is shared.

## Fix: Share real IDs via globalThis

`xtdb-event-logger` publishes each event's `_id` and `seq` to a shared ring buffer on `globalThis`. `event-projector` reads from it to get the real `_id`.

```typescript
// xtdb-event-logger/index.ts — after routeEvent()
globalThis.__piEventIds ??= {};
globalThis.__piEventIds[`${meta.sessionId}:${eventName}:${meta.seq}`] = normalized.id;

// event-projector/index.ts — in each handler
const realId = globalThis.__piEventIds?.[`${sessionId}:${eventName}:${seq}`] ?? crypto.randomUUID();
```

Problem: event-projector doesn't have access to `seq` (that's xtdb-event-logger's internal counter).

### Alternative: Share by event-specific natural keys

For events with natural keys, we can query XTDB:
- `tool_call` → lookup by `session_id + tool_call_id + event_name`
- `tool_result` → lookup by `session_id + tool_call_id + event_name`
- `turn_start`/`turn_end` → lookup by `session_id + turn_index + event_name`
- `message_update` → lookup by `session_id + seq` (need seq)

### Best approach: globalThis event bus

`xtdb-event-logger` emits to a `globalThis.__piEventBus` after each event is processed. The payload includes `{ eventName, _id, seq, sessionId, toolCallId?, turnIndex? }`. `event-projector` subscribes and uses the real `_id`.

```typescript
// xtdb-event-logger publishes:
globalThis.__piEventBus?.emit({ eventName, id: normalized.id, seq: meta.seq, sessionId: meta.sessionId });

// event-projector subscribes:
globalThis.__piEventBus?.on(({ eventName, id, seq, sessionId }) => { ... });
```

This is zero-latency, in-process, and doesn't require XTDB queries.

## Tasks
- [ ] F0: Add globalThis event bus to xtdb-event-logger — publish {eventName, _id, seq, sessionId, toolCallId, turnIndex} after each capture
- [ ] F1: Rewrite event-projector to subscribe to the bus instead of pi.on() — gets real _id for free
- [ ] F2: Fix thinking detection — `startsWith("thinking")`
- [ ] F3: Store output_summary from final assistant message in AgentResultProduced
- [ ] F4: Update flow.ts page to display reasoning text + tool summaries using real event IDs to query raw data
- [ ] F5: Test end-to-end — verify IDs resolve, content appears on flow page

## Open Questions
1. Should event-projector switch entirely to consuming from the globalThis bus (single source), or keep pi.on() hooks and just augment with the real ID from the bus?
2. Is a simple callback array sufficient for the bus, or do we need an EventEmitter?

## Status: READY — awaiting decision on approach
