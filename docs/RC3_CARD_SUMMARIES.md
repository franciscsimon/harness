# Root Cause 3: Card Summaries Ignore New Fields

## Problem
`format.ts` `FIELD_PICKERS` control what shows on event cards (stream view + session timeline). They reference only old sparse fields. New content fields are invisible on the card/timeline level.

## Tasks
- [ ] T3.1: Audit current `FIELD_PICKERS` — list what each event type shows now vs what it could show
- [ ] T3.2: Update pickers to include short previews from new content fields
- [ ] T3.3: Add a `preview()` helper — extract first N chars of text from JSON content, strip markup
- [ ] T3.4: Update session timeline to show inline content preview below event header
- [ ] T3.5: CSS for `.tl-content-preview` — muted text, truncated, below field-pairs
- [ ] T3.6: Visual test — check stream view and session timeline show meaningful previews

## Picker Update Plan
| Event | Current display | Better display |
|-------|----------------|----------------|
| message_update | stream_delta_type, stream_delta_len | stream_delta text (truncated) |
| message_start | message_role | message_role + content preview |
| message_end | message_role | message_role + content preview |
| tool_call | tool_name, tool_call_id, payload | tool_name + tool_input preview |
| tool_result | tool_name, tool_call_id, is_error | tool_name + is_error + tool_content preview |
| tool_execution_start | tool_name, tool_call_id | tool_name + tool_args preview |
| tool_execution_end | tool_name, tool_call_id, is_error | tool_name + is_error + tool_content preview |
| tool_execution_update | tool_name, tool_call_id | tool_name + partial_result preview |
| turn_end | turn_index, turn_end_tool_count | turn_index + tool_count + message preview |
| agent_end | agent_end_msg_count | count (already fine) |
| before_agent_start | prompt_text | prompt_text + system_prompt preview |
| session_before_compact | compact_tokens | compact_tokens + branch entry count |
| context | context_msg_count | count (already fine) |
| before_provider_request | provider_payload_bytes | bytes (already fine) |

## Tasks
- [x] T3.1: Audited all FIELD_PICKERS — identified 12 events that benefit from content previews
- [x] T3.2: Added `preview()` helper — extracts readable text from JSON content fields
- [x] T3.3: Updated 12 pickers: message_start/end, message_update, tool_call, tool_result, tool_execution_start/update/end, turn_end, before_agent_start, message_start, message_end
- [x] T3.4: Fixed assistant message preview to skip thinking blocks, show first text block
- [x] T3.5: Tested — session timeline shows system_prompt preview, delta text, content previews, tool input/output

## Status: DONE
