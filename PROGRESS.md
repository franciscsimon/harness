# History-Aware Harness — Implementation Progress

**Created:** 2026-03-17
**Source:** REPORT.md (verified synthesis of GPT + Gemini reviews)

---

## Phase 1 — Fix Trust Issues

### 1.1 Fix getSessionKnowledge field mismatch
- **File:** `xtdb-event-logger-ui/lib/db.ts` → `getSessionKnowledge()`
- **Bug:** reads `ev.payload` but handler stores field as `tool_args` (from `xtdb-event-logger/handlers/tool-execution-start.ts`)
- **Fix:** change `ev.payload` to `ev.tool_args`, parse JSON to extract `path`
- **Status:** [x] ✅ Done

### 1.2 Fix sampling flush logic
- **File:** `xtdb-event-logger/index.ts` lines 202-230
- **Bug:** on `message_end`, flushes sampled `message_update` but passes the `message_end` event object to `capture("message_update", event, ...)` — the stored "update" row has end-event fields, not update fields
- **Same bug** on `tool_execution_end` flush of `tool_execution_update`
- **Fix:** store the last sampled event object in `sampling.ts`, flush that instead of the end event
- **Status:** [x] ✅ Done — `sampling.ts` now stores `lastEvent`, `flushSampler()` returns it, `index.ts` uses it

### 1.3 Align README with reality
- **File:** `README.md`
- **Changes:**
  - [x] Architecture diagram: note streaming events sampled at 2s
  - [x] Event capture description: add "(streaming events sampled at 2s)"
  - [x] Event schema section: disclose sampling, remove "no truncation"
  - [x] knowledge-extractor: changed "→ XTDB" to "→ markdown sidecar"
- **Status:** [x] ✅ Done

---

## Phase 2 — Foundations

### 2.1 Persist delegation lineage to XTDB
- **File:** `agent-spawner/index.ts`
- **Status:** [x] ✅ Done
- `runSubagent()` now extracts child session ID from pi JSON output
- `persistDelegation()` inserts `delegations` row with JSON-LD (prov:Activity + prov:wasInformedBy)
- UI: `getDelegations()`, `getSessionDelegations()` queries added, table seeded

### 2.2 Cross-session sunk-cost state
- **File:** `sunk-cost-detector/index.ts`
- **Status:** [x] ✅ Done
- On `session_start`: loads prior `file_metrics` from XTDB, warns when touching high-error files
- On `session_shutdown`: persists per-file edit counts to `file_metrics` table
- Table seeded in UI db.ts

### 2.3 Automated session post-mortems
- **File:** new extension `session-postmortem/index.ts`
- **Status:** [x] ✅ Done
- Collects goal, files changed, tool usage, errors, bash commands during session
- On `session_shutdown`: inserts `session_postmortems` row with JSON-LD
- Rule-based extraction (no LLM dependency)
- UI: `getPostmortems()`, `getProjectPostmortems()` queries added, table seeded

---

## Phase 3 — Artifact History

### 3.1 Store artifact snapshots on write/edit
- **Current state:** `tool_execution_end` stores `toolName`, `toolCallId`, `isError`, `toolContent`, `toolDetails`. `tool_call` stores `toolInput` (has the file path + content). No separate artifact table.
- **Tasks:**
  - [ ] New extension `artifact-tracker/` or hook into existing `xtdb-event-logger`
  - [ ] On `tool_execution_end` for write/edit (non-error): extract path from corresponding `tool_call` event's `toolInput`
  - [ ] Compute content hash (SHA-256 of written content)
  - [ ] Insert `artifacts` row: `_id`, `project_id`, `session_id`, `path`, `content_hash`, `kind` (code/doc/config), `operation` (write/edit), `tool_call_id`, `ts`, `jsonld`
  - [ ] Do NOT store full content — git has it. Store hash for dedup/change detection
  - [ ] Seed `artifacts` table
- **Status:** [ ]

### 3.2 Link artifacts to projections
- **Current state:** `ProjectStateChanged` projection stores `mutations` as JSON array of `{tool, path, args}` summaries
- **Tasks:**
  - [ ] After artifact insert, add artifact IDs to the corresponding `ProjectStateChanged` projection
  - [ ] Or: query artifacts by session + time range when rendering projections in UI
  - [ ] Simpler approach: just query artifacts table when showing flow/projections — no schema change needed
- **Status:** [ ]

### 3.3 Enrich decision-log schema
- **File:** `decision-log/types.ts`, `decision-log/index.ts`
- **Tasks:**
  - [ ] Add optional fields to `DecisionRecord`: `files` (string[]), `event_ids` (string[]), `alternatives` (string), `agent` (string), `tags` (string[])
  - [ ] Add optional params to `log_decision` tool: `files`, `alternatives`, `tags`
  - [ ] Update JSON-LD builder to include new fields
  - [ ] Update XTDB seed row to include new columns
  - [ ] Keep backward-compatible — all new fields nullable
- **Status:** [ ]

---

## Phase 4 — Active History Use

### 4.1 Pre-task history retrieval
- **Hook:** `before_agent_start` (same pattern as decision-log)
- **Tasks:**
  - [ ] New extension `history-retrieval/` or add to `decision-log`
  - [ ] On `before_agent_start`, extract file paths from the user's prompt (regex: paths with extensions, @-references)
  - [ ] Query XTDB: prior sessions that touched those files (via `artifacts` table or `tool_call` events with matching paths)
  - [ ] Query XTDB: prior `session_postmortems` for the project
  - [ ] Query XTDB: prior `decisions` with matching file paths
  - [ ] Format as compact "Prior Work" section and inject via message
  - [ ] Limit to last N relevant entries to control context size
- **Status:** [ ]

### 4.2 Retry/failure prevention warnings
- **Tasks:**
  - [ ] On `before_agent_start`, compare extracted goal/files against failed decisions and failed post-mortems
  - [ ] Match by: exact file paths, tool patterns, decision outcome=failure
  - [ ] Inject warning: "⚠️ Previously failed: [what] — [why]"
  - [ ] Configurable: can be disabled per project
- **Status:** [ ]

---

## Phase 5 — Bridge

### 5.1 XTDB time-travel UI
- **Confirmed:** XTDB supports `FOR VALID_TIME AS OF` and `FOR SYSTEM_TIME AS OF`
- **Tasks:**
  - [ ] Add `/artifacts` page: list all tracked files with last-modified time
  - [ ] Add `/artifacts/:path/history` page: show all artifact versions for a file path, with diffs between versions
  - [ ] Add time-travel controls to project detail: "project state as of [date]"
  - [ ] Add `getArtifacts()`, `getArtifactHistory()` queries to `lib/db.ts`
  - [ ] Add artifact styles to `style.css`
- **Status:** [ ]

### 5.2 Git commit metadata
- **Tasks:**
  - [ ] New extension `git-metadata/` or extend `git-checkpoint`
  - [ ] On `session_shutdown` (or on explicit commit), attach XTDB metadata to the most recent git commit as git notes
  - [ ] Metadata: session_id, project_id, decision_ids[], artifact_ids[], postmortem summary
  - [ ] Format: `git notes add -m "<json>"` on HEAD
  - [ ] UI: show git notes on session detail page if available
- **Status:** [ ]

### 5.3 Nav links for new pages
- **Tasks:**
  - [ ] Add Decisions nav link to project detail page header
  - [ ] Add Artifacts nav link to all page headers (after Phase 5.1)
  - [ ] Add Delegations section to session detail page (after Phase 2.1)
- **Status:** [ ]

---

## Summary

| Phase | Items | Focus |
|-------|-------|-------|
| 1 | 3 | Fix bugs, align docs |
| 2 | 3 | Delegation lineage, cross-session metrics, post-mortems |
| 3 | 3 | Artifact tracking, enriched decisions |
| 4 | 2 | Pre-task retrieval, retry prevention |
| 5 | 3 | Time-travel UI, git metadata, nav |
| **Total** | **14** | |
