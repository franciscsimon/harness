# Root Cause 2: Content Truncated in Detail View

## Problem
`event-detail.ts` truncates every field value to 120 chars. New JSON content fields (messageContent, toolContent, etc.) are unreadable.

## Analysis
- `getPopulatedFields()` returns all non-null, non-core fields ✅
- The problem is line 25: `v.slice(0, 117) + "..."` — all values truncated to 120 chars
- Need to split fields into scalars (table) vs content blobs (expandable pre blocks)
- Content fields are always JSON strings — parseable with `JSON.parse()`
- XTDB system columns (`_system_from`, `_system_to`, `_valid_from`, `_valid_to`) now appear via `SELECT *` — need to exclude them too

## Content columns (DB names)
```
message_content, stream_delta, tool_input, tool_content, tool_details,
tool_partial_result, tool_args, agent_messages, system_prompt, images,
context_messages, provider_payload, turn_message, turn_tool_results,
compact_branch_entries
```

## Tasks
- [x] T2.1: Add XTDB system cols to `CORE_KEYS` in `format.ts`
- [x] T2.2: Define `CONTENT_KEYS` set in `event-detail.ts` (15 content + payload + jsonld)
- [x] T2.3: Split fields into scalars (table) vs content (expandable blocks) in render
- [x] T2.4: Render content as collapsible `<pre>` blocks with per-block Copy + Expand All
- [x] T2.5: Pretty-print JSON (parse + re-stringify indent 2, fallback to raw)
- [x] T2.6: CSS `.content-block` — collapsed by default, 400px max-height, scroll, toggle
- [x] T2.7: Tested — tool_result shows `tool_content` block, message_update shows `message_content` block

## Status: DONE
