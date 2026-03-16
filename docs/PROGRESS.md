# PROGRESS: Pi.dev → XTDB Event Logger Implementation

> Status: **PLANNING**
> Captures all 30 pi.dev events → XTDB v2 via `postgres` npm driver
> References: `PI_HOOKS_REFERENCE.md`, `XTDB_EVENT_LOGGER_PLAN.md`

---

## 1. Scope

Capture **all 30 pi.dev extension events** and persist every one into XTDB.
No event is silently dropped. Two high-frequency events (`message_update`,
`tool_execution_update`) are captured in a **sampled/debounced** mode rather
than skipped entirely, so the log is truly complete.

---

## 2. Prerequisites

```bash
# 1. XTDB running on Docker
docker run -d \
  --name xtdb-events \
  --restart unless-stopped \
  -p 5433:5432 \
  -p 8081:8080 \
  -v ~/.pi/agent/xtdb-data:/var/lib/xtdb \
  ghcr.io/xtdb/xtdb:latest

# 2. Extension directory
mkdir -p ~/.pi/agent/extensions/xtdb-event-logger/lib
cd ~/.pi/agent/extensions/xtdb-event-logger
npm init -y && npm install postgres
```

---

## 3. File Layout

```
~/.pi/agent/extensions/xtdb-event-logger/
├── index.ts              # Extension entry point — wires everything
├── package.json          # { "dependencies": { "postgres": "^3.4.8" } }
├── node_modules/
└── lib/
    ├── db.ts             # XTDB connection, typed INSERT, health check, queue
    ├── extract.ts        # Per-event field extraction (the core mapping)
    ├── constants.ts      # Event list, categories, interceptable set
    └── sampling.ts       # Debounce logic for high-frequency events
```

---

## 4. XTDB Column Inventory

Every INSERT touches the same `events` table. XTDB creates columns on first use.

| Column | Type | Populated By | Description |
|--------|------|-------------|-------------|
| `_id` | text | All events | UUIDv4 (XTDB requires this) |
| `environment` | text | All events | Always `"pi.dev"` |
| `event_name` | text | All events | The pi event name verbatim |
| `category` | text | All events | Derived from event name |
| `can_intercept` | bool | All events | Whether handler can return blocking value |
| `ts` | bigint | All events | `Date.now()` at capture time |
| `seq` | bigint | All events | Monotonic counter per session |
| `session_id` | text | All with ctx | `ctx.sessionManager.getSessionFile()` |
| `cwd` | text | All with ctx | `ctx.cwd` |
| `turn_index` | bigint | turn_start, turn_end | `event.turnIndex` |
| `turn_timestamp` | bigint | turn_start | `event.timestamp` |
| `tool_name` | text | tool_call, tool_result, tool_execution_* | `event.toolName` |
| `tool_call_id` | text | tool_call, tool_result, tool_execution_* | `event.toolCallId` |
| `is_error` | bool | tool_result, tool_execution_end | `event.isError` |
| `model_provider` | text | model_select | `event.model.provider` |
| `model_id` | text | model_select | `event.model.id` |
| `model_source` | text | model_select | `event.source` ("set"\|"cycle"\|"restore") |
| `prev_model_provider` | text | model_select | `event.previousModel?.provider` |
| `prev_model_id` | text | model_select | `event.previousModel?.id` |
| `message_role` | text | message_start, message_end | `event.message.role` |
| `input_text` | text | input | `event.text` (truncated 2KB) |
| `input_source` | text | input | `event.source` |
| `input_has_images` | bool | input | `(event.images?.length ?? 0) > 0` |
| `bash_command` | text | user_bash | `event.command` (truncated 2KB) |
| `bash_exclude` | bool | user_bash | `event.excludeFromContext` |
| `prompt_text` | text | before_agent_start | `event.prompt` (truncated 2KB) |
| `switch_reason` | text | session_before_switch, session_switch | `event.reason` |
| `switch_target` | text | session_before_switch | `event.targetSessionFile` |
| `switch_previous` | text | session_switch | `event.previousSessionFile` |
| `fork_entry_id` | text | session_before_fork | `event.entryId` |
| `fork_previous` | text | session_fork | `event.previousSessionFile` |
| `tree_new_leaf` | text | session_tree | `event.newLeafId` |
| `tree_old_leaf` | text | session_tree | `event.oldLeafId` |
| `tree_from_ext` | bool | session_tree | `event.fromExtension` |
| `compact_from_ext` | bool | session_compact | `event.fromExtension` |
| `compact_tokens` | bigint | session_before_compact | `event.preparation.tokensBefore` |
| `context_msg_count` | bigint | context | `event.messages.length` |
| `provider_payload_bytes` | bigint | before_provider_request | `JSON.stringify(event.payload).length` |
| `agent_end_msg_count` | bigint | agent_end | `event.messages.length` |
| `turn_end_tool_count` | bigint | turn_end | `event.toolResults.length` |
| `stream_delta_type` | text | message_update | `event.assistantMessageEvent.type` |
| `stream_delta_len` | bigint | message_update | `event.assistantMessageEvent.delta?.length` |
| `payload` | text | All events | Full JSON (truncated 4KB) as fallback |

**Automatic XTDB columns (free, untouched):**
`_system_from`, `_system_to`, `_valid_from`, `_valid_to`

---

## 5. Event-by-Event Extraction Spec

Every event maps to **one row**. The `extract.ts` module contains a single
`extractFields(eventName, event, ctx)` function that returns a flat object of
column values. Here is the exact field extraction for each of the 30 events.

### Legend

- **ctx** = has ExtensionContext (all except `session_directory` and `resources_discover`)
- **return** = what the handler MUST return to avoid interference
- **freq** = firing frequency

---

### 5.1 Session Events (9)

#### `session_directory` — #1
- **ctx:** ❌ (no ctx, no second arg)
- **return:** `undefined`
- **freq:** Once at CLI startup
- **Extract:**

| Column | Source |
|--------|--------|
| `cwd` | `event.cwd` |

```typescript
{ cwd: event.cwd }
```

**Handler signature:** `pi.on("session_directory", async (event) => { ... })`
**Note:** Fires before `session_start`. DB may not be connected yet → buffer this event.

---

#### `session_start` — #2
- **ctx:** ✅
- **return:** `void`
- **freq:** Once per session load
- **Extract:** No event-specific fields. Only base fields (session_id, cwd).

```typescript
{}
```

**This is where we connect to XTDB and flush any buffered events.**

---

#### `session_before_switch` — #3
- **ctx:** ✅
- **return:** `undefined` (must not return `{ cancel: true }`)
- **freq:** On `/new` or `/resume`
- **Extract:**

| Column | Source |
|--------|--------|
| `switch_reason` | `event.reason` |
| `switch_target` | `event.targetSessionFile` |

```typescript
{ switch_reason: event.reason, switch_target: event.targetSessionFile ?? null }
```

---

#### `session_switch` — #4
- **ctx:** ✅
- **return:** `void`
- **freq:** After session switch
- **Extract:**

| Column | Source |
|--------|--------|
| `switch_reason` | `event.reason` |
| `switch_previous` | `event.previousSessionFile` |

```typescript
{ switch_reason: event.reason, switch_previous: event.previousSessionFile ?? null }
```

---

#### `session_before_fork` — #5
- **ctx:** ✅
- **return:** `undefined` (must not return `{ cancel: true }`)
- **freq:** On `/fork`
- **Extract:**

| Column | Source |
|--------|--------|
| `fork_entry_id` | `event.entryId` |

```typescript
{ fork_entry_id: event.entryId }
```

---

#### `session_fork` — #6
- **ctx:** ✅
- **return:** `void`
- **freq:** After fork
- **Extract:**

| Column | Source |
|--------|--------|
| `fork_previous` | `event.previousSessionFile` |

```typescript
{ fork_previous: event.previousSessionFile ?? null }
```

---

#### `session_before_tree` — #7
- **ctx:** ✅
- **return:** `undefined` (must not return `{ cancel: true }` or `{ summary }`)
- **freq:** On `/tree`
- **Extract:** No safe-to-extract fields (`preparation` is opaque, `signal` is an AbortSignal).

```typescript
{}
```

---

#### `session_tree` — #8
- **ctx:** ✅
- **return:** `void`
- **freq:** After tree navigation
- **Extract:**

| Column | Source |
|--------|--------|
| `tree_new_leaf` | `event.newLeafId` |
| `tree_old_leaf` | `event.oldLeafId` |
| `tree_from_ext` | `event.fromExtension` |

```typescript
{ tree_new_leaf: event.newLeafId, tree_old_leaf: event.oldLeafId, tree_from_ext: event.fromExtension }
```

---

#### `session_shutdown` — #9
- **ctx:** ✅
- **return:** `void`
- **freq:** Once on exit
- **Extract:** No event-specific fields.

```typescript
{}
```

**This is where we flush pending writes and close the DB connection.**

---

### 5.2 Compaction Events (2)

#### `session_before_compact` — #10
- **ctx:** ✅
- **return:** `undefined` (must not return `{ cancel }` or `{ compaction }`)
- **freq:** On `/compact` or auto-compaction
- **Extract:**

| Column | Source |
|--------|--------|
| `compact_tokens` | `event.preparation.tokensBefore` |

```typescript
{ compact_tokens: event.preparation?.tokensBefore ?? null }
```

**Note:** `event.branchEntries` is an array of entries — too large. Don't serialize.
`event.signal` is an AbortSignal — ignore.

---

#### `session_compact` — #11
- **ctx:** ✅
- **return:** `void`
- **freq:** After compaction
- **Extract:**

| Column | Source |
|--------|--------|
| `compact_from_ext` | `event.fromExtension` |

```typescript
{ compact_from_ext: event.fromExtension }
```

---

### 5.3 Agent Events (5)

#### `before_agent_start` — #12
- **ctx:** ✅
- **return:** `undefined` (must not return `{ message }` or `{ systemPrompt }`)
- **freq:** Once per user prompt
- **Extract:**

| Column | Source |
|--------|--------|
| `prompt_text` | `event.prompt` (truncated 2KB) |
| `input_has_images` | `(event.images?.length ?? 0) > 0` |

```typescript
{ prompt_text: trunc(event.prompt, 2048), input_has_images: (event.images?.length ?? 0) > 0 }
```

**Note:** `event.systemPrompt` is the full system prompt (huge). Do NOT capture it.

---

#### `agent_start` — #13
- **ctx:** ✅
- **return:** `void`
- **freq:** Once per user prompt
- **Extract:** No event-specific fields.

```typescript
{}
```

---

#### `agent_end` — #14
- **ctx:** ✅
- **return:** `void`
- **freq:** Once per user prompt
- **Extract:**

| Column | Source |
|--------|--------|
| `agent_end_msg_count` | `event.messages?.length ?? 0` |

```typescript
{ agent_end_msg_count: event.messages?.length ?? 0 }
```

**Note:** `event.messages` is the full message array. Do NOT serialize — just count.

---

#### `turn_start` — #15
- **ctx:** ✅
- **return:** `void`
- **freq:** Once per turn
- **Extract:**

| Column | Source |
|--------|--------|
| `turn_index` | `event.turnIndex` |
| `turn_timestamp` | `event.timestamp` |

```typescript
{ turn_index: event.turnIndex, turn_timestamp: event.timestamp }
```

---

#### `turn_end` — #16
- **ctx:** ✅
- **return:** `void`
- **freq:** Once per turn
- **Extract:**

| Column | Source |
|--------|--------|
| `turn_index` | `event.turnIndex` |
| `turn_end_tool_count` | `event.toolResults?.length ?? 0` |

```typescript
{ turn_index: event.turnIndex, turn_end_tool_count: event.toolResults?.length ?? 0 }
```

**Note:** `event.message` and `event.toolResults` contain full data. Count only.

---

### 5.4 Message Events (3)

#### `message_start` — #17
- **ctx:** ✅
- **return:** `void`
- **freq:** Per message
- **Extract:**

| Column | Source |
|--------|--------|
| `message_role` | `event.message?.role` |

```typescript
{ message_role: event.message?.role ?? null }
```

---

#### `message_update` — #18 ⚡ HIGH FREQUENCY
- **ctx:** ✅
- **return:** `void`
- **freq:** **Per token** (hundreds/thousands per response)
- **Extract (sampled — one row per 2 seconds max):**

| Column | Source |
|--------|--------|
| `stream_delta_type` | `event.assistantMessageEvent?.type` |
| `stream_delta_len` | `event.assistantMessageEvent?.delta?.length ?? 0` |

```typescript
{ stream_delta_type: event.assistantMessageEvent?.type ?? null,
  stream_delta_len: event.assistantMessageEvent?.delta?.length ?? 0 }
```

**Sampling strategy:** Debounce to max 1 INSERT per 2000ms. Accumulate delta
lengths between flushes and write the total. This gives a "streaming is happening"
signal without flooding the DB. See [Section 6: Sampling](#6-sampling-strategy).

---

#### `message_end` — #19
- **ctx:** ✅
- **return:** `void`
- **freq:** Per message
- **Extract:**

| Column | Source |
|--------|--------|
| `message_role` | `event.message?.role` |

```typescript
{ message_role: event.message?.role ?? null }
```

---

### 5.5 Tool Events (7)

#### `tool_call` — #20
- **ctx:** ✅
- **return:** `undefined` (must not return `{ block: true }`)
- **freq:** Per tool call
- **Extract:**

| Column | Source |
|--------|--------|
| `tool_name` | `event.toolName` |
| `tool_call_id` | `event.toolCallId` |
| `payload` | `JSON.stringify(event.input)` (truncated 4KB) |

```typescript
{ tool_name: event.toolName, tool_call_id: event.toolCallId,
  payload: trunc(JSON.stringify(event.input), 4096) }
```

---

#### `tool_result` — #21
- **ctx:** ✅
- **return:** `undefined` (must not return `{ content, details, isError }`)
- **freq:** Per tool result
- **Extract:**

| Column | Source |
|--------|--------|
| `tool_name` | `event.toolName` |
| `tool_call_id` | `event.toolCallId` |
| `is_error` | `event.isError` |

```typescript
{ tool_name: event.toolName, tool_call_id: event.toolCallId, is_error: event.isError }
```

**Note:** `event.content` and `event.details` can be huge. Don't serialize.

---

#### `tool_execution_start` — #22
- **ctx:** ✅
- **return:** `void`
- **freq:** Per tool call
- **Extract:**

| Column | Source |
|--------|--------|
| `tool_name` | `event.toolName` |
| `tool_call_id` | `event.toolCallId` |

```typescript
{ tool_name: event.toolName, tool_call_id: event.toolCallId }
```

---

#### `tool_execution_update` — #23 ⚡ HIGH FREQUENCY
- **ctx:** ✅
- **return:** `void`
- **freq:** **Per streaming chunk** (many per tool execution)
- **Extract (sampled — one row per 2 seconds max):**

| Column | Source |
|--------|--------|
| `tool_name` | `event.toolName` |
| `tool_call_id` | `event.toolCallId` |

```typescript
{ tool_name: event.toolName, tool_call_id: event.toolCallId }
```

**Same sampling as message_update.** See [Section 6](#6-sampling-strategy).

---

#### `tool_execution_end` — #24
- **ctx:** ✅
- **return:** `void`
- **freq:** Per tool call
- **Extract:**

| Column | Source |
|--------|--------|
| `tool_name` | `event.toolName` |
| `tool_call_id` | `event.toolCallId` |
| `is_error` | `event.isError` |

```typescript
{ tool_name: event.toolName, tool_call_id: event.toolCallId, is_error: event.isError }
```

---

#### `context` — #25
- **ctx:** ✅
- **return:** `undefined` (must not return `{ messages }`)
- **freq:** Once per LLM call
- **Extract:**

| Column | Source |
|--------|--------|
| `context_msg_count` | `event.messages?.length ?? 0` |

```typescript
{ context_msg_count: event.messages?.length ?? 0 }
```

**Note:** `event.messages` is a deep copy of the full conversation. Count only.

---

#### `before_provider_request` — #26
- **ctx:** ✅
- **return:** `undefined` (must not return modified payload)
- **freq:** Once per LLM call
- **Extract:**

| Column | Source |
|--------|--------|
| `provider_payload_bytes` | `JSON.stringify(event.payload ?? {}).length` |

```typescript
{ provider_payload_bytes: JSON.stringify(event.payload ?? {}).length }
```

**Note:** `event.payload` is the full provider HTTP payload — potentially 100KB+. Size only.

---

### 5.6 Input Events (2)

#### `input` — #27
- **ctx:** ✅
- **return:** `undefined` (must not return `{ action: "transform" }` or `{ action: "handled" }`)
- **freq:** Per user prompt
- **Extract:**

| Column | Source |
|--------|--------|
| `input_text` | `event.text` (truncated 2KB) |
| `input_source` | `event.source` |
| `input_has_images` | `(event.images?.length ?? 0) > 0` |

```typescript
{ input_text: trunc(event.text, 2048), input_source: event.source,
  input_has_images: (event.images?.length ?? 0) > 0 }
```

---

#### `user_bash` — #28
- **ctx:** ✅
- **return:** `undefined` (must not return `{ operations }` or `{ result }`)
- **freq:** Per `!` / `!!` command
- **Extract:**

| Column | Source |
|--------|--------|
| `bash_command` | `event.command` (truncated 2KB) |
| `bash_exclude` | `event.excludeFromContext` |

```typescript
{ bash_command: trunc(event.command, 2048), bash_exclude: event.excludeFromContext }
```

---

### 5.7 Model Events (1)

#### `model_select` — #29
- **ctx:** ✅
- **return:** `void`
- **freq:** On model change
- **Extract:**

| Column | Source |
|--------|--------|
| `model_provider` | `event.model?.provider` |
| `model_id` | `event.model?.id` |
| `model_source` | `event.source` |
| `prev_model_provider` | `event.previousModel?.provider` |
| `prev_model_id` | `event.previousModel?.id` |

```typescript
{ model_provider: event.model?.provider, model_id: event.model?.id,
  model_source: event.source,
  prev_model_provider: event.previousModel?.provider ?? null,
  prev_model_id: event.previousModel?.id ?? null }
```

---

### 5.8 Resource Events (1)

#### `resources_discover` — #30
- **ctx:** ❌ (no ctx arg — handler receives only event)
- **return:** `undefined` (must not return `{ skillPaths, promptPaths, themePaths }`)
- **freq:** On startup + `/reload`
- **Extract:** No event-specific fields (event is `{}`).

```typescript
{}
```

**Handler signature:** `pi.on("resources_discover", () => { ... return undefined; })`

---

## 6. Sampling Strategy

For `message_update` (#18) and `tool_execution_update` (#23):

```typescript
// lib/sampling.ts

interface Sampler {
  key: string;          // grouping key (e.g. "message_update" or toolCallId)
  lastFlush: number;    // timestamp of last DB write
  accumulated: number;  // e.g. accumulated delta bytes
  pending: boolean;     // has data waiting
}

const samplers = new Map<string, Sampler>();
const INTERVAL_MS = 2000;  // max one write per 2 seconds per sampler key

export function shouldCapture(key: string, deltaLen: number): { capture: boolean; accumulatedLen: number } {
  let s = samplers.get(key);
  if (!s) {
    s = { key, lastFlush: 0, accumulated: 0, pending: false };
    samplers.set(key, s);
  }

  s.accumulated += deltaLen;
  s.pending = true;

  const now = Date.now();
  if (now - s.lastFlush >= INTERVAL_MS) {
    const total = s.accumulated;
    s.accumulated = 0;
    s.lastFlush = now;
    s.pending = false;
    return { capture: true, accumulatedLen: total };
  }

  return { capture: false, accumulatedLen: 0 };
}

// Call on message_end / tool_execution_end to flush any remaining
export function flushSampler(key: string): { capture: boolean; accumulatedLen: number } {
  const s = samplers.get(key);
  if (s && s.pending && s.accumulated > 0) {
    const total = s.accumulated;
    s.accumulated = 0;
    s.lastFlush = Date.now();
    s.pending = false;
    samplers.delete(key);
    return { capture: true, accumulatedLen: total };
  }
  samplers.delete(key);
  return { capture: false, accumulatedLen: 0 };
}
```

Result: `message_update` produces ~1 row per 2s of streaming instead of ~100/s.

---

## 7. DB Write Strategy

### Async Fire-and-Forget with Queue

Event handlers must return fast to not slow down pi. DB writes go through
an async queue that batches INSERTs.

```typescript
// lib/db.ts (queue portion)

const writeQueue: EventRow[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 500;  // flush every 500ms
const FLUSH_BATCH = 20;      // or when 20 rows pending

function enqueue(row: EventRow) {
  writeQueue.push(row);
  if (writeQueue.length >= FLUSH_BATCH) {
    flushNow();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushNow, FLUSH_INTERVAL);
  }
}

async function flushNow() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (writeQueue.length === 0 || !sql) return;

  const batch = writeQueue.splice(0, FLUSH_BATCH);
  try {
    // XTDB supports multi-row INSERT via RECORDS syntax
    for (const row of batch) {
      await insertRow(row);  // individual INSERT for now (XTDB RECORDS needs transit)
    }
  } catch (err) {
    console.error(`[xtdb-logger] Flush failed: ${err}`);
    // Re-queue on failure? Or drop? Decision: drop + log.
  }
}
```

### Startup Buffer

`session_directory` and `resources_discover` fire BEFORE `session_start`.
DB connection happens in `session_start`. Buffer pre-connection events:

```typescript
const preConnectBuffer: EventRow[] = [];
let connected = false;

function captureEvent(row: EventRow) {
  if (!connected) {
    preConnectBuffer.push(row);
  } else {
    enqueue(row);
  }
}

// In session_start handler:
async function onSessionStart() {
  await connectDb();
  connected = true;
  // Flush buffer
  for (const row of preConnectBuffer) {
    enqueue(row);
  }
  preConnectBuffer.length = 0;
}
```

### Shutdown Flush

In `session_shutdown`, flush all pending writes before closing:

```typescript
async function onSessionShutdown() {
  // Capture the shutdown event itself
  captureEvent(/* ... */);
  // Flush everything
  await flushNow();
  await disconnectDb();
}
```

---

## 8. Safety Constraints

Every handler MUST follow these rules:

| Rule | Reason |
|------|--------|
| **Return `undefined`** for interceptable events | Returning anything else blocks tools, cancels sessions, modifies prompts |
| **Return nothing** for non-interceptable events | Handler signature expects `void` |
| **Never `await` the DB write in the handler** | Would slow down pi (use async queue) |
| **Catch all errors** | Extension errors on `tool_call` cause tool to be blocked (fail-safe) |
| **Never access `event.messages` content** | Large arrays — only count `.length` |
| **Never serialize `event.payload`** on `before_provider_request` | Can be 100KB+ — only measure `.length` |
| **Never serialize `event.systemPrompt`** on `before_agent_start` | Multi-KB system prompt — skip it |
| **Truncate all text fields** | `input.text`, `event.command`, `event.prompt` capped at 2KB; `event.input` (tool) at 4KB |

---

## 9. Handler Registration Order

```
Extension loads
  │
  ├─ Register session_directory handler (buffers, no ctx)
  ├─ Register resources_discover handler (buffers, no ctx)
  ├─ Register session_start handler (connects DB, flushes buffer, captures event)
  ├─ Register all 26 other event handlers (capture via async queue)
  └─ Register session_shutdown handler (flush + disconnect)
```

**Critical ordering:** `session_start` must be registered EARLY so the DB
connects before other events fire. But `session_directory` and `resources_discover`
fire before `session_start`, so they use the pre-connect buffer.

**Double-registration concern:** `session_start` and `session_shutdown` have
both infrastructure logic (connect/disconnect) AND capture logic (log the event
itself). Handle both in the same handler:

```typescript
pi.on("session_start", async (_event, ctx) => {
  // 1. Infrastructure: connect
  await connectDb();
  connected = true;
  // 2. Flush pre-connect buffer
  for (const row of preConnectBuffer) enqueue(row);
  preConnectBuffer.length = 0;
  // 3. Capture this event
  captureEvent(buildRow("session_start", {}, ctx, seq++));
  // 4. UI feedback
  ctx.ui.setStatus("xtdb-logger", "📊");
  // 5. Return nothing (void)
});
```

---

## 10. Verification Queries

After the extension runs, verify capture with:

```sql
-- Total events captured
SELECT COUNT(*) FROM events;

-- Events by name
SELECT event_name, COUNT(*) AS cnt FROM events GROUP BY event_name ORDER BY cnt DESC;

-- Events by category
SELECT category, COUNT(*) AS cnt FROM events GROUP BY category ORDER BY cnt DESC;

-- Verify all 30 event types appear (over time)
SELECT DISTINCT event_name FROM events ORDER BY event_name;

-- Tool call pairs (start → end with duration)
SELECT
  s.tool_name,
  s.tool_call_id,
  e.ts - s.ts AS duration_ms,
  e.is_error
FROM events s
JOIN events e ON s.tool_call_id = e.tool_call_id
WHERE s.event_name = 'tool_execution_start'
  AND e.event_name = 'tool_execution_end';

-- Sampled message_update activity
SELECT ts, stream_delta_type, stream_delta_len
FROM events
WHERE event_name = 'message_update'
ORDER BY seq;

-- Session timeline
SELECT event_name, ts, seq
FROM events
WHERE session_id = '/path/to/session.jsonl'
ORDER BY seq;

-- Time-travel: events as of an hour ago
SELECT *
FROM events
FOR SYSTEM_TIME AS OF TIMESTAMP '2026-03-16T14:00:00Z'
ORDER BY seq;
```

---

## 11. Implementation Checklist

```
[ ] Step 1:  Start XTDB Docker container
[ ] Step 2:  Create extension directory + npm install postgres
[ ] Step 3:  Write lib/constants.ts (event list, category map, interceptable set)
[ ] Step 4:  Write lib/sampling.ts (debounce for high-freq events)
[ ] Step 5:  Write lib/db.ts (connect, disconnect, typed INSERT, async queue, buffer)
[ ] Step 6:  Write lib/extract.ts (per-event field extraction — the 30-event switch)
[ ] Step 7:  Write index.ts (entry point — register all 30 handlers)
[ ] Step 8:  Test: start pi, run a prompt, check XTDB has rows
[ ] Step 9:  Verify all event types captured (use verification queries)
[ ] Step 10: Add /xtdb-stats command to query event counts from inside pi
```

---

## 12. Open Items

| # | Item | Status |
|---|------|--------|
| 1 | Decide: drop sampled events on DB failure, or retry? | **Proposed: drop + log** |
| 2 | Decide: flush interval (500ms) vs batch size (20) tuning | **Proposed: 500ms / 20** |
| 3 | Decide: sampling interval for high-freq events | **Proposed: 2000ms** |
| 4 | Decide: truncation limits (2KB text, 4KB payload) | **Proposed: as stated** |
| 5 | Decide: add `/xtdb-stats` and `/xtdb-query` commands? | **Nice-to-have** |
| 6 | Decide: XTDB connection retry on failure during session? | **Proposed: no retry, log warning** |
| 7 | Decide: separate `events` table per category, or single table? | **Proposed: single table** |
