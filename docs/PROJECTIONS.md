# Event Projections — Reduced History

## Goal
Transform ~363 raw events per agent run into ~4-6 semantic domain events that capture the full flow as a readable history.

## Source
`projection-architecture.jsx` — React visualization defining 4 projection types.

## Decisions
- **Projector runs as a pi extension (real-time)** — hooks `turn_end` and `agent_end` to emit projections as they happen
- **Separate `projections` table** in XTDB — clean history only, no mixing with raw events
- **Reasoning traces store event IDs, not concatenated content** — always cross-reference against raw data
- **Mutations = only things that produce a change** — `write`, `edit`, mutating `bash` commands. Reads (`read`, `grep`, `ls`, `find`) are not mutations.
- **Separate UI page** — `/sessions/:id/flow` for the clean projected history

## The 4 Projected Event Types

### 1. AgentTaskRequested
**Source:** `input` + `before_agent_start`
**Captures:** Human intent — what was asked, session context.
```
Fields: @type, xt/id, sessionId, prompt, inputSource, contextMsgCount,
        systemPromptEventId, inputEventId, ts
```

### 2. AgentReasoningTrace
**Source:** `turn_start` → `message_update`s → `tool_call`/`tool_result` → `turn_end`
**Captures:** One per turn — references to thinking deltas + tool call/result event IDs.
```
Fields: @type, xt/id, taskId, sessionId, turnIndex,
        thinkingEventIds[], toolCallEventIds[], toolResultEventIds[],
        providerPayloadBytes, toolCount, turnStartEventId, turnEndEventId, ts
```

### 3. AgentResultProduced
**Source:** `agent_end` + final assistant message
**Captures:** What was delivered — output summary, totals, references.
```
Fields: @type, xt/id, taskId, sessionId,
        reasoningTraceIds[], totalTurns, totalMsgCount,
        agentEndEventId, finalMessageEventId, outputSummary, ts
```

### 4. ProjectStateChanged
**Source:** mutating `tool_call` + `tool_result` pairs
**Captures:** Actual state mutations only.
```
Fields: @type, xt/id, taskId, sessionId,
        mutations[]: { toolName, toolCallEventId, toolResultEventId, input_summary },
        mutatingToolCount, ts
```

Mutation classification:
- `write` → always a mutation
- `edit` → always a mutation
- `bash` → mutation only if command produces a change (git commit, rm, mv, cp, mkdir, npm install, etc.)
- `read`, `grep`, `ls`, `find` → never a mutation

## Reduction
- Raw: ~363 events per prompt
- Projected: ~4-6 events per prompt (1 task + N traces + 1 result + 0-1 changes)
- Ratio: ~60:1 compression

## Implementation Tasks

### Phase 1 — Extension + table
- [ ] T1: Create `event-projector` extension scaffold (`~/.pi/agent/extensions/event-projector/`)
- [ ] T2: Define projections table schema — `CREATE TABLE projections` via first INSERT (XTDB schema-on-write)
- [ ] T3: Implement run-level state accumulator — tracks current task/turn/tool IDs as events flow

### Phase 2 — Projectors (one per type)
- [ ] T4: `AgentTaskRequested` — emit on `agent_start` (input + before_agent_start already captured)
- [ ] T5: `AgentReasoningTrace` — emit on `turn_end` (collect thinking event IDs + tool event IDs from the turn)
- [ ] T6: `AgentResultProduced` — emit on `agent_end` (collect trace IDs, extract output summary)
- [ ] T7: `ProjectStateChanged` — emit on `agent_end` (filter tool calls to mutations only)

### Phase 3 — UI
- [ ] T8: Add `getProjections(sessionId)` query to `lib/db.ts`
- [ ] T9: Create `/sessions/:id/flow` page — renders projected history as a clean timeline
- [ ] T10: Add "Flow" link to session detail page header
- [ ] T11: Wire route in `server.ts`

### Phase 4 — Verify
- [ ] T12: Test with live session — trigger a prompt, verify 4 projection types appear
- [ ] T13: Verify event ID references resolve back to raw events

## Status: READY TO IMPLEMENT
