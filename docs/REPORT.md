# Progress Report: History-Aware Development Harness

**Date:** 2026-03-17
**Derived from:** REPORT.GPT.md, REPORT.GEMINI.md
**Verified against:** actual codebase

---

## Claim Verification

Both reports were checked against the running code. Here's what holds up and what doesn't.

### Confirmed ✅

| Claim | Verdict | Evidence |
|-------|---------|----------|
| Sampling on message_update/tool_execution_update | ✅ True | `xtdb-event-logger/index.ts:17-18`, `sampling.ts` exists, 2s default interval |
| Flush uses wrong event object on message_end/tool_execution_end | ✅ True | `index.ts:202-225` — flushes sampled update using the _end event |
| knowledge-extractor writes markdown, not XTDB | ✅ True | writes `.knowledge.md` via `writeFileSync`, no postgres/sql imports |
| sunk-cost-detector resets on session_start | ✅ True | `sunk-cost-detector/index.ts:44-45` calls `reset()` |
| getSessionKnowledge looks for ev.payload (wrong field) | ✅ True | `db.ts` reads `ev.payload`, but handler stores `tool_args` — field mismatch |
| agent-spawner does not persist delegation links to XTDB | ✅ True | no SQL/XTDB code in `agent-spawner/index.ts` |
| decision-log schema is minimal (no files, event_ids, alternatives) | ✅ True | `decision-log/types.ts` has only task/what/outcome/why |
| No artifact/file version history in XTDB | ✅ True | no artifact table, no content hashes stored |
| XTDB bitemporality not exposed in UI | ✅ True | no `AS OF` queries, no time-travel routes |
| README overstates full capture (sampling not disclosed) | ✅ True | README says "full content, no truncation" — sampling contradicts this |

### Partially true 🟡

| Claim | Verdict | Notes |
|-------|---------|-------|
| No delegation lineage at all | 🟡 Partial | `agent-spawner/index.ts:53` passes `parentSession` to the child process — the link exists at runtime but is **not persisted to XTDB** |
| Knowledge-checkpoint tracks decisions | 🟡 Overstated | It tracks files/tools/errors but not decision-log records |

### Denied / Overstated ❌

| Claim | Verdict | Notes |
|-------|---------|-------|
| GPT suggests vector search for task similarity | ❌ Premature | At current scale (<50 sessions/project), SQL pattern matching on XTDB suffices. Vector DB adds complexity without proportional value |
| Gemini suggests embedding + vector store for pre-flight RAG | ❌ Premature | Same reasoning. Structured queries on existing XTDB data cover the use case until scale demands otherwise |

---

## Agreed Gaps — Prioritized

Both reports converge on the same core gaps. Ordered by impact and dependency:

### Tier 1 — Fix what's broken (trust)

**1. Fix getSessionKnowledge field mismatch**
- `xtdb-event-logger-ui/lib/db.ts` reads `ev.payload` but the handler stores `tool_args`
- Files modified list is always empty in the knowledge page
- Fix: read `ev.tool_args` and parse path from it

**2. Fix sampling flush logic**
- `message_end` and `tool_execution_end` flush sampled updates using the _end event object, not the actual last sampled update
- Fix: store last sampled event separately and flush that

**3. Align README with reality**
- Disclose that `message_update` and `tool_execution_update` are sampled (2s default)
- Remove "no truncation" claim for these two event types
- Fix knowledge-extractor description (markdown sidecar, not XTDB)

### Tier 2 — Close history gaps (foundations)

**4. Persist delegation lineage to XTDB**
- `agent-spawner` already has `parentSession` — persist a `delegations` record
- Fields: `_id`, `parent_session_id`, `parent_event_id`, `child_session_id`, `agent_name`, `task`, `status`, `ts`, `jsonld`
- Enables: UI navigation parent↔child, complete task tracing

**5. Cross-session sunk-cost state**
- Store file-level error counts and edit-thrashing metrics in XTDB
- On `session_start`, load prior metrics for the current project
- Warn when touching files with high historical failure rates
- Existing `sunk-cost-detector` stays for in-session detection

**6. Automated session post-mortems**
- On `session_shutdown`, generate a semantic summary (not just stats)
- Store as a `session_postmortem` record in XTDB linked to project
- Fields: `_id`, `project_id`, `session_id`, `goal`, `what_worked`, `what_failed`, `files_changed`, `ts`, `jsonld`
- Can use LLM (like custom-compaction does) or rule-based extraction from events

### Tier 3 — Artifact history (traceability)

**7. Store artifact snapshots on write/edit**
- On `tool_execution_end` for write/edit, capture: path, content hash, diff size, source event_id
- `artifacts` table in XTDB with JSON-LD
- Enables: "what changed this file and why?" queries

**8. Link artifacts to projections and decisions**
- `ProjectStateChanged` projections should reference artifact IDs
- Decisions should optionally reference affected files

**9. Enrich decision-log schema**
- Add optional fields: `files[]`, `event_ids[]`, `alternatives_considered`, `agent`, `tags[]`
- Keep backward-compatible — new fields are nullable
- Enables richer retrieval and better retry prevention

### Tier 4 — Active history use (the goal)

**10. Pre-task history retrieval**
- On `before_agent_start`, query XTDB for prior sessions/attempts that touched the same files or had similar goals
- Inject "prior related work" section into context
- Start simple: match by file paths mentioned in the prompt vs `tool_args` paths in past sessions

**11. Retry/failure prevention warnings**
- Compare current task against past failed decisions and post-mortems
- Warn when current approach resembles a prior failure
- Start with exact match on file paths + tool patterns, not semantic similarity

**12. XTDB time-travel UI**
- Expose `AS OF` queries in the UI for artifact and project state
- File history page: `/artifacts/:path/history`
- Project state at a point in time

### Tier 5 — Git integration (bridge)

**13. Attach XTDB metadata to git commits**
- Git notes or commit trailers with session_id, decision_ids, attempt summary
- Enables: `git blame` → session → reasoning → decision chain

---

## Implementation Order

```
Phase 1 — Trust (Tier 1)                    ← fix bugs, align docs
    │
Phase 2 — Foundations (Tier 2: items 4-6)   ← delegation, cross-session memory, post-mortems
    │
Phase 3 — Artifacts (Tier 3: items 7-9)     ← file history, enriched decisions
    │
Phase 4 — Active Use (Tier 4: items 10-11)  ← the actual goal: prevent repeated mistakes
    │
Phase 5 — Bridge (Tier 5: items 12-13)      ← time-travel UI, git integration
```

Each phase is independently useful. Phase 1 can be done now. Phase 4 is the target — everything before it is scaffolding to get there.

---

## What Not To Do

- **No vector DB** — XTDB SQL covers retrieval needs at current scale. Revisit only if >500 sessions/project.
- **No redesign of existing extensions** — extend, don't replace. decision-log, knowledge-extractor, sunk-cost-detector all keep their current behavior.
- **No complex NLP for similarity** — start with exact file-path matching and event pattern matching. Semantic similarity is a Phase 5+ concern.
- **No artifact content storage in XTDB** — store hashes and metadata, not full file content. Git already has the content.

---

## Summary

The harness has strong event capture and project identity. The main gap is not *recording* history — it's *using* history. The path from "observable session logger" to "history-aware development system" is:

1. Fix trust issues (broken queries, misleading docs)
2. Add missing lineage (delegation, cross-session state)
3. Track artifacts (file-level change history)
4. Retrieve and inject history before new work starts
5. Bridge to git for full traceability

Both reports agree on this direction. The disagreement is only on vector DB (premature) and scope of Phase 1 fixes (GPT's report is more thorough on bugs).
