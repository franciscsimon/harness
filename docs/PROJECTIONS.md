# Event Projections — Reduced History

## Goal
Transform ~363 raw events per agent run into ~4-6 semantic domain events that capture the full flow as a readable history.

## Source
`projection-architecture.jsx` — React visualization defining 4 projection types.

## The 4 Projected Event Types

### 1. AgentTaskRequested
**Source:** `input` + `before_agent_start`
**Captures:** Human intent — what was asked, session context, prompt text.
```
Fields: @type, xt/id, prompt, inputSource, sessionRef, contextMsgCount, compactTokens
```

### 2. AgentReasoningTrace
**Source:** `turn_start` → `message_update` (thinking deltas) → `tool_call`/`tool_result` → `turn_end`
**Captures:** One per turn — full reasoning chain + all tool interactions.
```
Fields: @type, xt/id, parentTaskId, turnIndex, thinkingContent, toolCalls[], providerPayloadBytes, toolCount
```

### 3. AgentResultProduced
**Source:** `agent_end` + final assistant message
**Captures:** What was delivered — output text, total turns, message count.
```
Fields: @type, xt/id, parentTaskId, reasoningTraceIds[], totalTurns, totalMsgCount, outputSummary
```

### 4. ProjectStateChanged
**Source:** `tool_call`(write/edit/bash) + `tool_result` — mutating commands only
**Captures:** Actual state mutations — files written, git commits, edits.
```
Fields: @type, xt/id, parentTaskId, resultId, mutations[], mutatingCommands[]
```

## Reduction
- Raw: ~363 events per prompt (2541 total / 7 runs)
- Projected: ~4-6 events per prompt (1 task + N reasoning traces + 1 result + 1 changes)
- Ratio: ~60:1 compression while preserving full semantic flow

## Architecture Options (from jsx)
- **Option A — Pi Extension (real-time):** Hook into event stream, write projections as each turn completes
- **Option B — Session File Watcher (batch):** Parse JSONL session files post-hoc, project into XTDB

## Tasks
- [ ] T1: Decide: real-time extension vs batch projector vs XTDB-to-XTDB query
- [ ] T2: Define projection table schema (separate `projections` table or same `events` table?)
- [ ] T3: Implement AgentTaskRequested projector (simplest — 2 source events)
- [ ] T4: Implement AgentReasoningTrace projector (hardest — accumulate thinking deltas across message_update events within a turn, collect tool calls)
- [ ] T5: Implement AgentResultProduced projector (extract final assistant message text from agent_end)
- [ ] T6: Implement ProjectStateChanged projector (classify tool_calls as mutating vs read-only, extract mutations)
- [ ] T7: Add UI page to browse projected history
- [ ] T8: Test with real session data

## Status: PLANNING — questions below

## Open Questions
See below.
