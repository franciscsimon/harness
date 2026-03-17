# Root Cause 2: Content Truncated in Detail View

## Problem
`event-detail.ts` truncates every field value to 120 chars. New JSON content fields (messageContent, toolContent, etc.) are unreadable.

## Tasks
- [ ] T2.1: Identify which fields are "large content" vs "scalar" — need a list of the 15 v2 field names as DB column names
- [ ] T2.2: Split rendering — scalars stay in table, large content gets expandable `<pre>` blocks below
- [ ] T2.3: Pretty-print JSON content (parse + re-stringify with indent)
- [ ] T2.4: Add CSS for `.content-block` — collapsible, max-height, scroll, toggle
- [ ] T2.5: Add copy button per content block
- [ ] T2.6: Visual test — open event detail for a tool_result with full content

## Status: NOT STARTED
