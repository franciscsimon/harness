# Event Projector — Design

## Problem

~363 raw events per agent run. Unreadable as history.
Reduce to ~4-6 semantic projections that capture the full flow.

---

## File Structure

```
event-projector/
├── index.ts          # Extension entry. Hooks pi events, wires accumulator → projectors → XTDB.
├── types.ts          # All type definitions. Projection shapes, RunState, event field subsets.
├── accumulator.ts    # Pure function: (state, event) → state. No I/O.
├── projectors.ts     # Pure functions: state → Projection | null. One per type. No I/O.
├── mutations.ts      # Pure function: classifyMutation(toolName, input) → boolean.
└── package.json
```

No classes. No framework. Every module except `index.ts` is pure functions + types.

---

## Data Flow

```
pi events (30 types)
    │
    │  index.ts hooks 9 of them
    ▼
┌─────────────────────┐
│  accumulator.ts     │  (state, event) → state
│  RunState           │  mutable per-run, reset on input
└────────┬────────────┘
         │  on turn_end / agent_end, call projectors
         ▼
┌─────────────────────┐
│  projectors.ts      │  state → Projection | null
│  4 pure functions   │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  XTDB              │  INSERT INTO projections
│  (projections tbl) │  via postgres wire protocol
└─────────────────────┘
```

**Key rule:** Accumulator runs on every hooked event. Projectors run only at
emit points (`agent_start`, `turn_end`, `agent_end`). This keeps projector
logic stateless — they receive a complete snapshot and produce output or null.

---

## RunState Accumulator

One `RunState` per agent run. Created on `input`, destroyed on `agent_end`.

```
RunState {
  // ── Identity ──
  sessionId:    string          // from event meta
  taskId:       string          // generated on input, links all projections for this run

  // ── Task capture (input + before_agent_start) ──
  prompt:                string | null
  inputSource:           string | null      // "user", "tool", "followUp"
  inputEventId:          string | null      // raw event _id from xtdb-event-logger
  systemPromptEventId:   string | null
  contextMsgCount:       number | null
  inputTs:               number | null

  // ── Turn tracking (reset per turn) ──
  turnIndex:             number             // incremented on turn_start
  currentTurn: {
    thinkingEventIds:    string[]           // message_update with deltaType="thinking"
    toolCallEventIds:    string[]           // tool_call event IDs
    toolResultEventIds:  string[]           // tool_result event IDs
    providerPayloadBytes: number | null
    turnStartEventId:    string | null
  }

  // ── Run-level accumulators ──
  reasoningTraceIds:     string[]           // IDs of emitted AgentReasoningTrace projections
  mutations:             MutationRecord[]   // classified mutating tool pairs
  totalTurns:            number
  agentEndEventId:       string | null
  finalMessageEventId:   string | null
  agentEndMsgCount:      number | null
}

MutationRecord {
  toolName:          string
  toolCallEventId:   string
  toolResultEventId: string | null    // null until tool_result arrives
  inputSummary:      string           // e.g. "write → src/foo.ts" or "bash → git commit -m ..."
}
```

### State transitions

```
input              → create RunState, capture prompt/inputSource/inputEventId/inputTs
before_agent_start → capture systemPromptEventId, contextMsgCount
agent_start        → EMIT AgentTaskRequested
turn_start         → increment turnIndex, reset currentTurn, capture turnStartEventId
message_update     → if deltaType=thinking: push to currentTurn.thinkingEventIds
tool_call          → push to currentTurn.toolCallEventIds; classify mutation
tool_result        → push to currentTurn.toolResultEventIds; patch mutation's toolResultEventId
turn_end           → EMIT AgentReasoningTrace; push traceId to reasoningTraceIds
agent_end          → capture agentEndEventId, agentEndMsgCount
                     EMIT ProjectStateChanged (if mutations.length > 0)
                     EMIT AgentResultProduced
                     destroy RunState
```

---

## Hooked Events (9 of 30)

| pi event             | What we extract                                         | Emit point? |
|----------------------|---------------------------------------------------------|-------------|
| `input`              | prompt text, input source, event ID                     | —           |
| `before_agent_start` | system prompt event ID, context msg count               | —           |
| `agent_start`        | (trigger only)                                          | **AgentTaskRequested** |
| `turn_start`         | turn index, turn timestamp, event ID                    | —           |
| `message_update`     | delta type (thinking vs text), event ID                 | —           |
| `tool_call`          | tool name, tool call ID, input (for mutation classify)  | —           |
| `tool_result`        | tool call ID (to match), is_error, event ID             | —           |
| `turn_end`           | tool count (for cross-check), event ID                  | **AgentReasoningTrace** |
| `agent_end`          | message count, event ID                                 | **ProjectStateChanged** + **AgentResultProduced** |

Events we **ignore**: `session_*`, `message_start`, `message_end`, `tool_execution_*`,
`context`, `before_provider_request`, `user_bash`, `model_select`, `resources_discover`,
`session_before_compact`, `session_compact`. None carry data the projections need.

---

## Mutation Classification (mutations.ts)

Single pure function: `isMutation(toolName: string, input: Record<string, any>): boolean`

```
ALWAYS mutation:  write, edit (any invocation)
NEVER mutation:   read, grep, glob, ls, find
CONDITIONAL:      bash → mutation only if command matches mutating pattern
```

Bash mutating patterns (prefix match on the command string):
```
git commit, git push, git merge, git rebase, git checkout -b, git branch -d,
rm, mv, cp, mkdir, rmdir, chmod, chown,
npm install, npm uninstall, yarn add, yarn remove, pnpm add, pnpm remove,
pip install, pip uninstall,
docker run, docker build, docker compose up,
brew install, apt install, apt remove
```

Everything else from bash (cat, echo, grep, find, ls, pwd, which, env, test commands) → not a mutation.

**Input summary extraction** (for MutationRecord.inputSummary):
- `write` / `edit` → `"{toolName} → {input.path}"`
- `bash` → `"bash → {first 80 chars of input.command}"`

---

## XTDB Projections Table

Table: `projections` (schema-on-write, no DDL needed)

### Common columns (every row)

| Column          | XTDB type | Description                                    |
|-----------------|-----------|------------------------------------------------|
| `_id`           | text      | UUID, primary key                              |
| `type`          | text      | `AgentTaskRequested` / `AgentReasoningTrace` / `AgentResultProduced` / `ProjectStateChanged` |
| `task_id`       | text      | Links all projections for one agent run         |
| `session_id`    | text      | Pi session ID                                  |
| `ts`            | bigint    | Emission timestamp (epoch ms)                  |

### AgentTaskRequested columns

| Column                  | XTDB type | Source                              |
|-------------------------|-----------|-------------------------------------|
| `prompt`                | text      | RunState.prompt                     |
| `input_source`          | text      | RunState.inputSource                |
| `context_msg_count`     | bigint    | RunState.contextMsgCount            |
| `system_prompt_event_id`| text      | raw event _id                       |
| `input_event_id`        | text      | raw event _id                       |

### AgentReasoningTrace columns

| Column                   | XTDB type | Source                             |
|--------------------------|-----------|------------------------------------|
| `turn_index`             | bigint    | RunState.turnIndex                 |
| `thinking_event_ids`     | text      | JSON array of raw event _ids       |
| `tool_call_event_ids`    | text      | JSON array of raw event _ids       |
| `tool_result_event_ids`  | text      | JSON array of raw event _ids       |
| `provider_payload_bytes` | bigint    | from before_provider_request       |
| `tool_count`             | bigint    | length of tool_call_event_ids      |
| `turn_start_event_id`    | text      | raw event _id                      |
| `turn_end_event_id`      | text      | raw event _id                      |

### AgentResultProduced columns

| Column                  | XTDB type | Source                              |
|-------------------------|-----------|-------------------------------------|
| `reasoning_trace_ids`   | text      | JSON array of emitted trace _ids    |
| `total_turns`           | bigint    | RunState.totalTurns                 |
| `total_msg_count`       | bigint    | RunState.agentEndMsgCount           |
| `agent_end_event_id`    | text      | raw event _id                       |
| `final_message_event_id`| text      | raw event _id                       |
| `output_summary`        | text      | first 200 chars of final assistant msg (or null) |

### ProjectStateChanged columns

| Column                  | XTDB type | Source                              |
|-------------------------|-----------|-------------------------------------|
| `mutations`             | text      | JSON array of MutationRecord        |
| `mutating_tool_count`   | bigint    | mutations.length                    |

**Note:** XTDB is schema-on-write. Columns not relevant to a projection type
are simply not included in that row's INSERT. No NULLs for inapplicable columns.

---

## index.ts Wiring (pseudo-logic, not code)

```
export default function (pi: ExtensionAPI) {
  let state: RunState | null = null
  let sql: postgres connection (lazy init)

  pi.on("input",              (e) => state = createRunState(e))
  pi.on("before_agent_start", (e) => state = accumulate(state, "before_agent_start", e))
  pi.on("agent_start",        (e) => { state = accumulate(...); emit(projectTask(state)) })
  pi.on("turn_start",         (e) => state = accumulate(state, "turn_start", e))
  pi.on("message_update",     (e) => state = accumulate(state, "message_update", e))
  pi.on("tool_call",          (e) => state = accumulate(state, "tool_call", e))
  pi.on("tool_result",        (e) => state = accumulate(state, "tool_result", e))
  pi.on("turn_end",           (e) => { state = accumulate(...); emit(projectTrace(state)) })
  pi.on("agent_end",          (e) => {
    state = accumulate(state, "agent_end", e)
    emit(projectStateChanged(state))   // only if mutations exist
    emit(projectResult(state))
    state = null                        // run complete
  })

  function emit(projection) { if (projection) insertIntoXtdb(sql, projection) }
}
```

**Error handling:** Every `emit()` is fire-and-forget with try/catch + console.error.
A failed projection insert must never crash the agent run.

**Connection:** Lazy-init postgres on first emit. Same host:port as xtdb-event-logger
(`localhost:5433`). Read from env `XTDB_HOST` / `XTDB_PORT` for consistency.

---

## Boundaries

```
┌──────────────┐         ┌──────────────────┐         ┌──────────┐
│  pi runtime  │──events─▶  event-projector  │──INSERT─▶  XTDB    │
│  (30 types)  │         │  (index.ts)       │         │ projections│
└──────────────┘         └──────────────────┘         └──────────┘
                                │                            ▲
                                │                            │
                         ┌──────┴───────┐              ┌─────┴──────┐
                         │ accumulator  │              │  xtdb-event │
                         │ projectors   │              │  -logger-ui │
                         │ mutations    │              │  (reads)    │
                         │ (pure fns)   │              └────────────┘
                         └──────────────┘

Ownership:
- event-projector WRITES to `projections` table
- xtdb-event-logger WRITES to `events` table (unchanged)
- xtdb-event-logger-ui READS both (Phase 3, not this design)
- No coupling between event-projector and xtdb-event-logger at runtime
- Only shared contract: event ID format (UUIDs from xtdb-event-logger)
```

---

## What This Design Does NOT Cover

- **UI** (`/sessions/:id/flow`) — Phase 3, separate concern
- **Event ID resolution** — projections store IDs; the UI joins against `events` table at read time
- **Backfill** — projecting historical events; this is real-time only
- **Output summary extraction** — the `output_summary` field on AgentResultProduced needs access to the final assistant message content; `agent_end` event may or may not carry it. If not available from the event payload, store null and let the UI resolve it from the referenced `final_message_event_id`
