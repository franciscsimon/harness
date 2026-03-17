# Flow Page Fixes — Progress

## Current State
The projections pipeline works. All 4 types exist in XTDB:
- 2 AgentTaskRequested, 28 AgentReasoningTrace, 1 AgentResultProduced, 1 ProjectStateChanged
- ProjectStateChanged correctly captured 4 mutations: rm, write package.json, write routes.ts, write index.ts
- AgentResultProduced captured total_turns=22, total_msg_count=44

## What's broken on the flow page

### Bug 1: No reasoning text displayed
**Root cause:** `thinking_event_ids` is always `[]` in every AgentReasoningTrace.
**Why:** `accumulator.ts` line 88 checks `ame?.type === "thinking"` but real delta types are `thinking_start`, `thinking_delta`, `thinking_end`. Should match any type starting with `"thinking"`.
**Fix:** Change to `ame?.type?.startsWith("thinking")`.

### Bug 2: Event IDs are unresolvable
**Root cause:** The projector generates `crypto.randomUUID()` for every event ID instead of using real XTDB `_id` values from the `events` table.
**Why:** The event-projector extension and xtdb-event-logger are separate extensions with no shared state. The projector never sees the real `_id`.
**Fix options:**
- **(A)** Query XTDB for the real event ID by matching session_id + seq + event_name after each event
- **(B)** Have xtdb-event-logger expose a lookup, or share the ID via a shared module
- **(C)** Don't store event IDs at all — store the actual content inline (thinking text, tool input/output) directly in the projection row
- **(C is best)** — the whole point of projections is a self-contained reduced history. Cross-referencing back to raw events defeats the purpose. Store the content.

### Bug 3: output_summary is always null
**Root cause:** `projectors.ts` sets `output_summary: null` with a comment "Resolved by UI from final_message_event_id". But the event ID is fake so the UI can't resolve it.
**Fix:** Extract the final assistant text content from the `agent_end` event's messages array directly in the accumulator, store it in RunState, emit it in the projection.

### Bug 4: AgentTaskRequested prompt not shown on flow page
**Root cause:** Need to verify — the prompt IS in the DB but the flow page rendering may not display it.

## Tasks
- [ ] F1: Fix thinking detection — `startsWith("thinking")` in accumulator.ts
- [ ] F2: Store content inline instead of event IDs — add `thinking_text`, `tool_summaries` (JSON array of {name, input_preview, output_preview, is_error}), `assistant_text` fields to reasoning traces
- [ ] F3: Store `output_summary` from final assistant message in AgentResultProduced
- [ ] F4: Verify flow page renders prompt, reasoning text, mutations, and result
- [ ] F5: Update flow.ts page to display the new inline content fields

## Status: READY — awaiting go-ahead
