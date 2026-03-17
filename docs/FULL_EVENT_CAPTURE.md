# Full Event Data Capture — Progress Tracker

## Problem
Every handler in `xtdb-event-logger` strips the actual content from events.
We record metadata (counts, sizes, types) but throw away the data that makes
the events useful for analysis. This defeats the purpose of the event store.

## Audit: What Each Handler Keeps vs Drops

### ✅ Handlers that already capture everything (no changes needed)

| # | Handler | Raw Fields | What We Keep | Status |
|---|---------|-----------|-------------|--------|
| 1 | `session_start` | `{}` (empty) | everything | ✅ DONE |
| 2 | `session_shutdown` | `{}` (empty) | everything | ✅ DONE |
| 3 | `agent_start` | `{}` (empty) | everything | ✅ DONE |
| 4 | `resources_discover` | `{}` (empty) | everything | ✅ DONE |
| 5 | `session_switch` | `reason`, `previousSessionFile` | both | ✅ DONE |
| 6 | `session_before_switch` | `reason`, `targetSessionFile` | both | ✅ DONE |
| 7 | `session_before_fork` | `entryId` | kept | ✅ DONE |
| 8 | `session_fork` | `previousSessionFile` | kept | ✅ DONE |
| 9 | `session_tree` | `newLeafId`, `oldLeafId`, `fromExtension` | all three | ✅ DONE |
| 10 | `session_before_tree` | `newLeafId`, `oldLeafId`, `fromExtension` | all three | ✅ DONE |
| 11 | `session_directory` | `cwd` | kept | ✅ DONE |
| 12 | `model_select` | `model`, `previousModel`, `source` | all | ✅ DONE |
| 13 | `turn_start` | `turnIndex`, `timestamp` | both | ✅ DONE |
| 14 | `user_bash` | `command`, `excludeFromContext` | both | ✅ DONE |

### ❌ Handlers that DROP data (need fixing)

| # | Handler | Raw Fields | We Keep | We DROP | Priority |
|---|---------|-----------|---------|---------|----------|
| 15 | `message_update` | `message`, `assistantMessageEvent` (`type`, `delta`) | `streamDeltaType`, `streamDeltaLen` | **delta text** (LLM output tokens), **message** | P0 |
| 16 | `message_start` | `message` (full message object with role + content) | `messageRole` | **message content** | P0 |
| 17 | `message_end` | `message` (full message object with role + content) | `messageRole` | **message content** | P0 |
| 18 | `tool_result` | `toolName`, `toolCallId`, `isError`, `content`, `details`, `input` | name, id, isError | **content** (tool output), **details**, **input** | P0 |
| 19 | `tool_call` | `toolName`, `toolCallId`, `input` | name, id, input (truncated 4KB) | **input truncated** — large args cut off | P1 |
| 20 | `tool_execution_end` | `toolCallId`, `toolName`, `result`, `isError` | name, id, isError | **result** (full tool output) | P0 |
| 21 | `tool_execution_start` | `toolCallId`, `toolName`, `args` | name, id | **args** | P1 |
| 22 | `tool_execution_update` | `toolCallId`, `toolName`, `args`, `partialResult` | name, id | **args**, **partialResult** | P2 |
| 23 | `turn_end` | `turnIndex`, `message`, `toolResults[]` | turnIndex, toolResults count | **message** (assistant response), **toolResults** (all tool outputs) | P0 |
| 24 | `agent_end` | `messages[]` (all messages from this prompt) | message count | **messages array** (entire agent conversation) | P0 |
| 25 | `before_agent_start` | `prompt`, `images[]`, `systemPrompt` | prompt (truncated 2KB) | **systemPrompt**, **images**, **prompt truncated** | P1 |
| 26 | `context` | `messages[]` (full conversation for LLM) | message count | **messages array** (entire context window) | P2 |
| 27 | `before_provider_request` | `payload` (complete LLM request) | byte size | **payload** (full request to provider) | P2 |
| 28 | `session_before_compact` | `preparation` (`tokensBefore`), `branchEntries[]`, `signal` | `compactTokens` | **branchEntries** | P1 |
| 29 | `session_compact` | `preparation` (`tokensBefore`), result | `compactTokens`, `compactFromExt` | nothing critical — already good | ✅ |

## Implementation Tasks

Changes required across 3 layers: handlers → types → endpoints (columns + triples).

### Task 1: Add new fields to `EventFields` in `types.ts`
New fields needed:
- `messageContent?: string | null` — full message JSON (message_start, message_end, message_update, turn_end)
- `streamDelta?: string | null` — actual delta text from message_update
- `toolInput?: string | null` — full tool input JSON (tool_call, tool_execution_start, tool_result)
- `toolContent?: string | null` — full tool output content JSON (tool_result, tool_execution_end)
- `toolDetails?: string | null` — tool result details JSON (tool_result, tool_execution_end)
- `toolPartialResult?: string | null` — streaming partial result (tool_execution_update)
- `agentMessages?: string | null` — full messages array JSON (agent_end)
- `systemPrompt?: string | null` — system prompt text (before_agent_start)
- `images?: string | null` — images JSON (before_agent_start, input)
- `contextMessages?: string | null` — full context messages JSON (context)
- `providerPayload?: string | null` — full provider request JSON (before_provider_request)
- `turnMessage?: string | null` — assistant message from turn (turn_end)
- `turnToolResults?: string | null` — tool results array JSON (turn_end)
- `compactBranchEntries?: string | null` — branch entries JSON (session_before_compact)
- `toolArgs?: string | null` — tool args (tool_execution_start, tool_execution_update)
- [ ] **Status: NOT STARTED**

### Task 2: Fix P0 handlers (the critical data)
- [ ] `message_update` — add `streamDelta` (actual delta text), `messageContent` (full message)
- [ ] `message_start` — add `messageContent` (full message JSON)
- [ ] `message_end` — add `messageContent` (full message JSON)
- [ ] `tool_result` — add `toolContent`, `toolDetails`, `toolInput` (full content + details + input)
- [ ] `tool_execution_end` — add `toolContent`, `toolDetails` (full result)
- [ ] `turn_end` — add `turnMessage`, `turnToolResults` (full message + tool results)
- [ ] `agent_end` — add `agentMessages` (full messages array)
- [ ] **Status: NOT STARTED**

### Task 3: Fix P1 handlers (truncated/missing data)
- [ ] `tool_call` — remove 4KB truncation on `payload`, store full `toolInput`
- [ ] `tool_execution_start` — add `toolArgs` (full args)
- [ ] `before_agent_start` — remove 2KB truncation on `promptText`, add `systemPrompt`, `images`
- [ ] `session_before_compact` — add `compactBranchEntries`
- [ ] **Status: NOT STARTED**

### Task 4: Fix P2 handlers (large but useful data)
- [ ] `tool_execution_update` — add `toolArgs`, `toolPartialResult`
- [ ] `context` — add `contextMessages` (full context)
- [ ] `before_provider_request` — add `providerPayload` (full payload)
- [ ] **Status: NOT STARTED**

### Task 5: Add new columns to XTDB INSERT in `endpoints/xtdb.ts`
- [ ] Add all new fields to the INSERT statement
- [ ] Use `text` type (OID 25) for all new JSON string columns
- [ ] **Status: NOT STARTED**

### Task 6: Add new triples to `rdf/triples.ts`
- [ ] Add `str()` calls for each new field in `eventToTriples()`
- [ ] **Status: NOT STARTED**

### Task 7: Update JSONL endpoint
- [ ] No changes needed — JSONL already serializes full `NormalizedEvent.fields`
- [x] **Status: DONE** (automatic)

### Task 8: Bump schema version
- [ ] Increment `SCHEMA_VERSION` in `types.ts`
- [ ] **Status: NOT STARTED**

### Task 9: Verify with data-examples
- [ ] Re-run `data-examples/extract.ts` after changes
- [ ] Verify new fields appear in JSON-LD output
- [ ] Save updated examples
- [ ] **Status: NOT STARTED**

## Notes
- All new content fields store JSON.stringify'd values as strings — XTDB text columns
- No truncation — store the full content
- `message_update` is high-frequency (sampled at 1/2s) — delta text is small per event anyway
- `context` and `before_provider_request` can be large (100KB+) but that's what storage is for
- `agent_end.messages` can be very large — consider: is this redundant with individual message events?
  - Answer: keep it — it's the complete picture for one prompt, individual events are fragments

## Execution Order
1. Task 1 (types.ts) — foundation for everything else
2. Task 2 (P0 handlers) — most critical data
3. Task 5 (XTDB columns) — so new data actually persists
4. Task 6 (RDF triples) — so JSON-LD includes new data
5. Task 3 (P1 handlers)
6. Task 4 (P2 handlers)
7. Task 8 (schema bump)
8. Task 9 (verify)
