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
- [x] T1: Create `event-projector` extension — `~/.pi/agent/extensions/event-projector/` (delegate→architect + delegate→worker)
- [x] T2: Projections table created via schema-on-write on first INSERT
- [x] T3: RunState accumulator — pure function, tracks task/turn/tool IDs

### Phase 2 — Projectors (one per type)
- [x] T4: `AgentTaskRequested` — emits on `agent_start` ✅ (1 row in XTDB, prompt captured)
- [x] T5: `AgentReasoningTrace` — emits on `turn_end` ✅ (43 rows, tool_call_event_ids populated)
- [x] T6: `AgentResultProduced` — emits on `agent_end` (code done, needs `/reload` for live session)
- [x] T7: `ProjectStateChanged` — emits on `agent_end` if mutations exist (code done, needs `/reload`)

### Phase 3 — UI
- [x] T8: `getProjections(sessionId)` in `lib/db.ts` (delegate→worker)
- [x] T9: `/sessions/:id/flow` page — clean vertical timeline with color-coded cards
- [x] T10: "🔀 Flow" link in session detail header
- [x] T11: Route wired in `server.ts`

### Phase 4 — Verify
- [x] T12: 44 projections in XTDB from subagent session (1 task + 43 reasoning traces)
- [ ] T13: Verify AgentResultProduced + ProjectStateChanged appear after `/reload` on next prompt

## Status: DONE (pending `/reload` for full 4-type verification)
