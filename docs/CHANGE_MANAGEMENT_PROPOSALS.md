# Change Management, Traceability & Versioning — 3 Proposals

## Current State (What Already Exists)

| Requirement | Already covered | Gap |
|---|---|---|
| **Change management** | `ProjectStateChanged` projection tracks mutations (tool name, input summary, event IDs). `git-checkpoint` stashes each turn. | No link between git commits and XTDB events. No "who decided this and why". No change approval flow. |
| **Traceability** | Events → projections chain: `AgentTaskRequested` → `AgentReasoningTrace` → `AgentResultProduced` → `ProjectStateChanged`. Event IDs link everything. | Trace stops at XTDB boundary. Can't go from a git commit or file on disk back to the reasoning. |
| **Transparency** | Full event capture (30 events, no truncation). UI shows session timelines, tool calls, reasoning. Knowledge extraction. | No audit log view. No "why was this line written" query. Thinking traces exist but aren't surfaced as decision records. |
| **History** | XTDB is bitemporal (valid-time + system-time). Events are append-only. git-checkpoint stashes per turn. | Bitemporality isn't used. No time-travel UI. No artifact versioning in XTDB. |
| **Versioning** | Git tracks code. Templates/agents/skills are files in `~/.pi/agent/`. | No version tracking for prompts, templates, agent definitions. No diff view for non-code artifacts. |

---

## Proposal A: Git-Linked Audit Trail

**One-line:** Enrich every git commit with XTDB event metadata so you can trace any line of code back to the agent reasoning that produced it.

### Coverage

| Requirement | Coverage |
|---|---|
| Change management | ✅ Primary — every commit linked to session + turns |
| Traceability | ✅ Primary — commit → events → reasoning → decision |
| Transparency | ◐ Partial — via linked events, not standalone |
| History | ◐ Partial — git log becomes navigable with context |
| Versioning | ◐ Partial — code only, not templates/prompts |

### What It Builds On

- `git-checkpoint` extension (already stashes per turn)
- `ProjectStateChanged` projection (already tracks mutations)
- `committer` agent (already writes commit messages)
- `xtdb-event-logger` (event IDs available at commit time)

### What's Missing / Needs Building

**1. Commit metadata extension** (new extension or enhance `git-checkpoint`)
- On `turn_end` or explicit commit: write git notes (`git notes add`) with JSON linking to XTDB
- Content: `{ sessionId, taskId, turnIndices, eventIds, projectionIds, reasoning_summary }`
- Alternatively: structured `git trailer` lines in commit messages

**2. `git-trace` CLI command** (new pi command)
- `/trace <file>:<line>` → finds the commit that last touched that line → reads git note → fetches linked XTDB events → shows reasoning chain
- `/trace <commit>` → shows full decision context from XTDB

**3. Trace UI page** (`xtdb-event-logger-ui/pages/trace.ts`)
- Route: `GET /trace/:commitHash`
- Shows: commit diff + linked session timeline + reasoning traces
- Backlinks from session detail page to git commits

**4. Commit hook** (enhance `quality-hooks` or new extension)
- `pre-commit` or `post-commit` hook that auto-attaches XTDB metadata
- Captures: which session was active, which turns contributed, which tools mutated files

### Architecture

```
git commit
    │
    ├── git notes ──────────────────┐
    │   { sessionId, eventIds,      │
    │     projectionIds }           │
    │                               ▼
    │                    ┌─────────────────┐
    │                    │  XTDB           │
    │                    │  events table   │
    │                    │  projections    │
    ├── git log ◀────────│                 │
    │                    └────────┬────────┘
    ▼                             │
┌──────────┐              ┌──────▼──────┐
│ /trace   │◀─────────────│ Trace UI    │
│ command  │              │ /trace/:sha │
└──────────┘              └─────────────┘
```

### Trade-offs

| Pro | Con |
|---|---|
| Uses git — the tool developers already know | Only covers code in git repos |
| Zero new storage — git notes are free | Git notes don't transfer on `git push` by default (need `git push origin refs/notes/*`) |
| Commit-level granularity is natural | Can't trace uncommitted work |
| Works with existing git tooling (blame, log) | Requires discipline to commit frequently |

### Effort

| Component | Effort | Notes |
|---|---|---|
| Commit metadata extension | **S** | ~100 lines, enhance git-checkpoint |
| `/trace` command | **M** | New extension, XTDB queries, formatting |
| Trace UI page | **M** | New page, git + XTDB join queries |
| Commit hook | **S** | Wire into existing quality-hooks |

**Total: M** (1-2 days)

---

## Proposal B: XTDB Bitemporal Document Store

**One-line:** Store all artifacts (code files, templates, agent definitions, prompts) as XTDB documents with valid-time, making every version queryable via `AS OF` time-travel.

### Coverage

| Requirement | Coverage |
|---|---|
| Change management | ✅ Primary — every artifact change is a bitemporal fact |
| Traceability | ✅ Primary — same database holds events + artifacts + projections |
| Transparency | ✅ Primary — full audit trail in one queryable store |
| History | ✅ Primary — `AS OF` queries navigate any point in time |
| Versioning | ✅ Primary — all artifact types versioned uniformly |

### What It Builds On

- XTDB v2 bitemporality (built-in but currently unused)
- `xtdb-event-logger` (already writes to XTDB)
- `xtdb-projector` (already creates derived documents)
- `events` table schema (artifact snapshots follow same pattern)

### What's Missing / Needs Building

**1. Artifact capture extension** (new extension: `artifact-store`)
- On `tool_execution_end` for `write`/`edit` tools: snapshot the affected file into XTDB
- Document schema: `{ _id: "artifact:<path>", content, hash, size, session_id, event_id, valid_from }`
- Uses XTDB's `PUT` with valid-time to create bitemporal versions
- Also snapshots on: template changes, agent definition edits, skill modifications

**2. Artifact tables** (XTDB DDL)
```sql
-- Code artifacts
CREATE TABLE artifacts (
  _id TEXT,           -- 'artifact:/path/to/file'
  path TEXT,
  content TEXT,
  hash TEXT,
  size BIGINT,
  session_id TEXT,
  event_id TEXT,
  author TEXT          -- 'agent:<session_id>' or 'human'
);

-- Template/config artifacts
CREATE TABLE configs (
  _id TEXT,           -- 'config:agents/worker.md'
  path TEXT,
  content TEXT,
  hash TEXT,
  category TEXT,      -- 'agent' | 'skill' | 'template' | 'extension'
  session_id TEXT
);
```

**3. Time-travel UI** (`xtdb-event-logger-ui/pages/artifacts.ts`)
- Route: `GET /artifacts` — browse all tracked artifacts
- Route: `GET /artifacts/:path?at=<timestamp>` — view artifact at point in time
- Route: `GET /artifacts/:path/history` — version timeline with diffs
- Route: `GET /artifacts/:path/diff?from=<t1>&to=<t2>` — side-by-side diff
- Each version links to the session/event that produced it

**4. Time-travel API** (new endpoints in `server.ts`)
```
GET /api/artifacts?at=<ts>                    — all artifacts at a point in time
GET /api/artifacts/:path/history              — version list
GET /api/artifacts/:path?at=<ts>              — content at a point in time
GET /api/sessions/:id/artifacts               — what files did this session touch
```

**5. Diff engine** (`xtdb-event-logger-ui/lib/diff.ts`)
- Compute line-level diffs between artifact versions
- Render in UI with syntax highlighting

### Architecture

```
tool_execution_end (write/edit)
        │
        ▼
┌─────────────────┐     PUT with valid-time
│ artifact-store   │────────────────────────┐
│ extension        │                        │
└─────────────────┘                        ▼
                              ┌─────────────────────┐
events ───────────────────────│       XTDB v2        │
projections ──────────────────│                      │
artifacts ────────────────────│  bitemporal queries: │
configs ──────────────────────│  SELECT ... AS OF    │
                              └──────────┬──────────┘
                                         │
                              ┌──────────▼──────────┐
                              │    Artifact UI       │
                              │  /artifacts          │
                              │  /artifacts/:path    │
                              │  history + diff      │
                              └─────────────────────┘
```

### Trade-offs

| Pro | Con |
|---|---|
| Single source of truth — events, reasoning, and artifacts in one DB | Storage grows fast (full file content per version) |
| True time-travel — `AS OF` queries are native XTDB | XTDB is not optimized for large binary blobs |
| Covers ALL artifact types uniformly (code, templates, prompts) | Duplicates what git already does for code files |
| No git dependency — works for non-git artifacts | Complex — biggest implementation effort |
| Can answer "what did the project look like at 3pm Tuesday?" | Requires XTDB expertise for bitemporal query patterns |

### Effort

| Component | Effort | Notes |
|---|---|---|
| `artifact-store` extension | **M** | Hook tool_execution_end, snapshot files, PUT with valid-time |
| Artifact tables (DDL) | **S** | Two CREATE TABLE statements |
| Time-travel API | **M** | 4-5 new endpoints, `AS OF` queries |
| Artifact history UI | **L** | New pages: browse, history, diff viewer |
| Diff engine | **M** | Line-level diff computation + rendering |

**Total: L** (3-5 days)

---

## Proposal C: Projected Changelog with Decision Records

**One-line:** Extend the projector to emit `ChangeRecord` documents that automatically link what changed → why → who decided, creating a machine-generated Architecture Decision Record (ADR) system.

### Coverage

| Requirement | Coverage |
|---|---|
| Change management | ✅ Primary — structured change records with full context |
| Traceability | ✅ Primary — each record links mutations → reasoning → task |
| Transparency | ✅ Primary — human-readable decision records, browsable |
| History | ◐ Partial — changelog is linear, not time-travel |
| Versioning | ○ Minimal — records reference changes but don't store versions |

### What It Builds On

- `xtdb-projector` (already emits 4 projection types)
- `ProjectStateChanged` (already captures mutations)
- `AgentReasoningTrace` (already captures thinking + tool chains)
- `knowledge.ts` (already generates session summaries)
- Knowledge extraction page (already renders markdown summaries)

### What's Missing / Needs Building

**1. ChangeRecord projector** (extend `xtdb-projector/projectors.ts`)
- New projection type: `ChangeRecord`
- Emitted at `agent_end` when mutations exist
- Schema:
```typescript
interface ChangeRecordRow extends ProjectionBase {
  type: "ChangeRecord";
  // What changed
  files_modified: string;      // JSON array of paths
  mutation_summary: string;    // human-readable: "Created app.ts, modified index.ts"
  // Why it changed
  task_prompt: string;         // the original user request
  reasoning_summary: string;   // extracted from thinking traces
  decision_rationale: string;  // why this approach vs alternatives
  // Who
  actor: string;               // 'agent:worker' | 'agent:architect' | 'human'
  parent_session_id: string;   // delegating session (if subagent)
  // Links
  task_id: string;
  reasoning_trace_ids: string; // JSON array
  mutation_event_ids: string;  // JSON array
  commit_hash: string | null;  // if a commit happened in this session
}
```

**2. Reasoning summarizer** (`xtdb-projector/summarizer.ts`)
- Extract key decisions from thinking traces
- Input: accumulated `message_update` deltas with thinking content
- Output: 2-3 sentence summary of the reasoning and alternatives considered
- Can use simple heuristics (first/last thinking block) or LLM summarization

**3. Changelog UI page** (`xtdb-event-logger-ui/pages/changelog.ts`)
- Route: `GET /changelog` — reverse-chronological list of ChangeRecords
- Each entry shows: timestamp, actor, files changed, task, reasoning summary
- Expandable to show full reasoning traces, tool calls, diffs
- Filter by: actor, file path, date range, session

**4. Changelog API** (new endpoints)
```
GET /api/changelog                        — all change records
GET /api/changelog?file=<path>            — changes to a specific file
GET /api/changelog?actor=<agent>          — changes by a specific agent
GET /api/changelog/:id                    — single record with full context
```

**5. Decision record markdown export** (enhance `knowledge.ts`)
- `GET /api/changelog/:id/adr` → generates ADR-format markdown:
```markdown
# ADR-2026-03-17-001: Separate app.ts from index.ts

## Status: Accepted
## Context: User requested hello-service implementation
## Decision: Split Hono app definition from server startup
## Rationale: Enables test imports without starting server
## Consequences: Two files instead of one, slightly more complex
## Traces: [link to reasoning], [link to tool calls]
```

### Architecture

```
xtdb-projector (existing)
        │
        ├── AgentTaskRequested      (existing)
        ├── AgentReasoningTrace     (existing)
        ├── AgentResultProduced     (existing)
        ├── ProjectStateChanged     (existing)
        │
        └── ChangeRecord            (NEW)
                │
                ├── files_modified
                ├── task_prompt
                ├── reasoning_summary  ◀── summarizer (NEW)
                ├── decision_rationale
                ├── actor
                └── trace links
                        │
                        ▼
              ┌─────────────────┐
              │   Changelog UI  │
              │  /changelog     │
              │                 │
              │  • Timeline     │
              │  • Per-file     │
              │  • Per-actor    │
              │  • ADR export   │
              └─────────────────┘
```

### Trade-offs

| Pro | Con |
|---|---|
| Builds directly on existing projector — minimal new infra | Doesn't store artifact content (no diff view) |
| Human-readable output (ADR format) | Reasoning summary quality depends on thinking trace quality |
| Lightweight — just one more projection type | Linear changelog, not true time-travel |
| Answers "why was this change made" directly | Requires agent sessions to produce records (manual edits invisible) |
| ADR export integrates with standard engineering practices | Commit hash linking requires the commit to happen within the session |

### Effort

| Component | Effort | Notes |
|---|---|---|
| ChangeRecord projector | **S** | ~50 lines in projectors.ts + types.ts |
| Reasoning summarizer | **M** | Heuristic version S, LLM version M |
| Changelog UI page | **M** | New page with filters, expandable entries |
| Changelog API | **S** | 3-4 endpoints, straightforward queries |
| ADR markdown export | **S** | Template + data formatting |

**Total: M** (2-3 days)

---

## Comparison Matrix

| | **A: Git-Linked** | **B: XTDB Bitemporal** | **C: Projected Changelog** |
|---|---|---|---|
| **Change mgmt** | ✅ commit-level | ✅ document-level | ✅ record-level |
| **Traceability** | ✅ commit → events | ✅ artifact → events | ✅ record → traces |
| **Transparency** | ◐ via linked events | ✅ full audit store | ✅ decision records |
| **History** | ◐ git log + notes | ✅ AS OF time-travel | ◐ linear changelog |
| **Versioning** | ◐ code only | ✅ all artifacts | ○ references only |
| **Effort** | **M** (1-2 days) | **L** (3-5 days) | **M** (2-3 days) |
| **New infra** | git notes | new tables, extension | 1 projector, 1 page |
| **Storage cost** | ~zero | high (full snapshots) | low (summaries) |
| **Works without git** | ✗ | ✓ | ✓ |
| **Covers non-code** | ✗ | ✓ | ✓ (references only) |

## Recommendation

These proposals are **composable**, not mutually exclusive:

- **Start with C** — lowest effort, highest immediate value. You get a changelog and decision records from day one.
- **Add A** — when you want git blame → reasoning traces. Complements C by linking the code-level view.
- **Consider B** — when you need to version non-code artifacts (templates, prompts, configs) or want true time-travel. This is the "full platform" play.

The natural progression is **C → A → B**, adding capabilities as needs grow.
