# Proposal: Session Artifact Preservation

## Problem

When agents run a build pipeline (architect → planner → worker → tester), they produce valuable intermediate documents — `ARCHITECTURE.md`, `PLAN.md`, and similar markdown artifacts. These files:

1. Live in the project directory mixed with source code
2. Have no link back to the session that created them
3. Get overwritten silently when the pipeline runs again
4. Cannot be reviewed or compared across sessions

The hello-service pipeline produced 627 lines of design artifacts (DESIGN.md: 81, ARCHITECTURE.md: 270, PLAN.md: 276). After a rebuild, the previous versions are gone.

## What Exists Today

| Component | What it does | Where it stores data |
|---|---|---|
| **artifact-tracker** | Captures `tool_execution_end` for write/edit, stores path + content hash + session ID + JSON-LD provenance | XTDB `artifacts` table |
| **agent-spawner** | Runs sub-agents via `pi --mode json`, captures child session ID, persists parent↔child delegation lineage | XTDB `delegations` table |
| **decision-log** | Persists decisions to XTDB, injects them into future sessions via `before_agent_start` | XTDB `decisions` table |
| **session system** | JSONL files at `~/.pi/agent/sessions/--<path>--/<ts>_<uuid>.jsonl`, supports `.knowledge.md` sidecars, `CustomMessage` entries | Filesystem |

Key fact: sub-agents run in **separate pi processes**. Each process loads extensions independently, so artifact-tracker fires in child sessions. The delegation table already maps parent→child. The artifact table already has session IDs and content hashes. **The association path exists — parent session → delegations → child sessions → artifacts. What's missing is content preservation and a query interface.**

---

## Approach Evaluation

### 1. Session Sidecar Directory

Store artifact copies in `<session-file>.artifacts/` alongside the JSONL.

```
~/.pi/agent/sessions/--home-opunix-harness--/
  2026-03-17T23-00-00_abc123.jsonl
  2026-03-17T23-00-00_abc123.knowledge.md
  2026-03-17T23-00-00_abc123.artifacts/
    ARCHITECTURE.md
    PLAN.md
```

**Trigger:** `after_agent_turn` or `tool_execution_end` — copy .md files written during the session.

| Criterion | Rating | Notes |
|---|---|---|
| Simplicity | ★★★★☆ | Just `fs.copyFile` after writes. Session path discoverable via `ctx.sessionManager`. |
| Queryability | ★★☆☆☆ | Must walk filesystem. No metadata, no search. "Which session produced ARCHITECTURE.md?" requires scanning all sidecar dirs. |
| Survives rebuild | ★★★★★ | Copies are outside project directory. |
| Storage overhead | ★★★☆☆ | Full copy per session. 627 lines × N sessions. No dedup. |
| LLM cooperation | None | Fully automatic. |

**Problem:** Which session owns the sidecar? If the architect sub-agent writes ARCHITECTURE.md, the file write happens in the *child* session, but the child session's JSONL lives in the same `--home-opunix-harness--` directory as the parent. So the sidecar is on the child — not the parent. Reconstructing "show me all artifacts from pipeline run X" requires knowing child session IDs, which means querying the delegation table anyway. This approach doesn't stand alone.

---

### 2. Embed Artifacts in Session via `appendEntry`

Store artifact content inline in the JSONL as custom entries.

```jsonc
{
  "type": "custom_message",
  "customType": "session-artifact",
  "content": "# Architecture\n\n...(full content)...",
  "display": false,
  "details": {
    "path": "ARCHITECTURE.md",
    "contentHash": "a1b2c3d4e5f6...",
    "agent": "architect",
    "kind": "doc"
  }
}
```

**Trigger:** Extension calls `pi.appendEntry("session-artifact", { path, content, hash })` after detecting a doc write.

| Criterion | Rating | Notes |
|---|---|---|
| Simplicity | ★★★★★ | One `appendEntry` call. Uses existing API. Pattern proven by decision-log and agent-spawner. |
| Queryability | ★★☆☆☆ | Must parse JSONL, grep for `customType: "session-artifact"`. No SQL. |
| Survives rebuild | ★★★★★ | Embedded in session file, completely independent of project directory. |
| Storage overhead | ★★★☆☆ | Content duplicated in JSONL. Session files grow. No dedup across sessions. |
| LLM cooperation | None | Fully automatic via hook. |

**Problem:** Same child-session issue. The `appendEntry` fires in the child pi process, so the artifact is embedded in the child's JSONL. The parent session doesn't contain it. Also, JSONL is append-only and not indexed — "find all sessions that produced an ARCHITECTURE.md" is a full scan of every JSONL file.

**Advantage:** Zero infrastructure. No XTDB, no filesystem layout. If XTDB is down, artifacts are still captured.

---

### 3. Extend artifact-tracker — XTDB with Content Storage

Add a `content` column to the existing `artifacts` table (or a new `artifact_content` table keyed by content hash).

```sql
-- Option A: Add content column to artifacts
INSERT INTO artifacts (_id, ..., content)
VALUES ('art:...', ..., '# Architecture\n...');

-- Option B: Separate content-addressed table (dedup)
INSERT INTO artifact_content (_id, content_hash, content, size_bytes)
VALUES ('ac:...', 'a1b2c3d4', '# Architecture\n...', 4200);
```

**Trigger:** Extend existing `tool_execution_end` handler in artifact-tracker. For `kind=doc`, also store content.

| Criterion | Rating | Notes |
|---|---|---|
| Simplicity | ★★★★☆ | Extends existing extension. ~20 lines of change. |
| Queryability | ★★★★★ | Full SQL. `SELECT * FROM artifacts WHERE session_id = ? AND kind = 'doc'`. Join with delegations to get full pipeline view. |
| Survives rebuild | ★★★★★ | In XTDB, independent of filesystem. |
| Storage overhead | ★★★★☆ | Option B deduplicates via content hash. Identical artifacts across sessions stored once. |
| LLM cooperation | None | Fully automatic — artifact-tracker already fires on writes. |

**Advantage:** The artifact-tracker already fires on write/edit in every pi process (including sub-agents). The delegation table already links parent→child sessions. The query for "all artifacts from pipeline run X" is:

```sql
SELECT a.path, a.content_hash, ac.content, d.agent_name
FROM delegations d
JOIN artifacts a ON a.session_id = d.child_session_id
JOIN artifact_content ac ON ac.content_hash = a.content_hash
WHERE d.parent_session_id = '<parent-session-id>'
  AND a.kind = 'doc'
ORDER BY a.ts;
```

**Risk:** XTDB dependency. If XTDB is down, artifacts aren't preserved. Mitigation: fall back to `appendEntry` (approach 2) when DB is unreachable.

---

### 4. Git-based — Tag/Branch Per Session

Create a git tag or lightweight commit per session capturing artifact state.

```bash
git tag "pi-session/abc123" HEAD
# or
git stash create "session-artifacts-abc123"
```

**Trigger:** `session_shutdown` hook — tag current HEAD or create a snapshot commit.

| Criterion | Rating | Notes |
|---|---|---|
| Simplicity | ★★☆☆☆ | Git operations from extensions are fragile. Must handle dirty working tree, untracked files, concurrent sessions, repos with no commits. |
| Queryability | ★★★☆☆ | `git log --all --diff-filter=A -- ARCHITECTURE.md` works but is slow and doesn't link to session metadata. |
| Survives rebuild | ★★★★★ | In git reflog/tags. Survives file overwrites. |
| Storage overhead | ★★★★★ | Git deduplicates at object level. Extremely efficient. |
| LLM cooperation | None | Automatic on session end. |

**Problem:** Not all projects are git repos. Sub-agent sessions are short-lived — the sub-agent's `session_shutdown` fires after one prompt, but the files were written moments ago. If two sub-agents run concurrently, git operations will conflict. Also, `git tag` doesn't capture *which* files are artifacts vs. regular code — it snapshots everything.

**Problem 2:** The user asked for "ability to review artifacts from past sessions." Git diff between tags shows *all* changes, not just artifacts. You'd need artifact-tracker metadata to know which files to look at, which means you need XTDB anyway.

---

### 5. New Extension with `save_artifact` Tool

Register a `save_artifact` tool that the LLM calls explicitly.

```typescript
pi.registerTool({
  name: "save_artifact",
  parameters: { path: string, label?: string, tags?: string[] },
  async execute(_, params, _, _, ctx) {
    const content = await fs.readFile(params.path, "utf-8");
    const hash = sha256(content);
    // Store in XTDB or sidecar
    await persist(ctx.sessionManager.getSessionId(), params.path, content, hash);
  }
});
```

| Criterion | Rating | Notes |
|---|---|---|
| Simplicity | ★★★★★ | Clean, explicit, easy to implement. |
| Queryability | ★★★★★ | Only intentionally-saved artifacts in the store. High signal-to-noise. |
| Survives rebuild | ★★★★★ | Content stored externally. |
| Storage overhead | ★★★★★ | Only saves what's explicitly marked. No noise. |
| LLM cooperation | **Required** | LLM must call the tool. Risk: LLMs forget, skip it under token pressure, or don't know about it in sub-agent contexts. |

**Problem:** The pipeline agents (architect, planner) run in sub-processes spawned by the delegate tool. Their system prompts come from `~/.pi/agent/agents/<name>.md`. To make them call `save_artifact`, you'd need to:
1. Add instructions to every agent's system prompt
2. Hope the LLM follows them reliably (it won't — see decision-log's need for "active reminders")
3. Accept that when it fails, artifacts are silently lost

The decision-log already demonstrates this fragility: it needed a `**Reminder:** After completing any coding task, call log_decision...` injected into every turn to get models to use it. Artifact saving is lower-priority in the model's attention than decision logging — it will be skipped more often.

**Advantage:** When it works, you get rich metadata (user-chosen labels, tags). Could complement an automatic system.

---

### 6. Automatic Capture via `after_agent_turn` — Filesystem Diff

Snapshot the filesystem before/after each agent turn. New/modified .md files are artifacts.

```typescript
pi.on("before_agent_start", async () => {
  // Snapshot: Map<path, mtime> for all .md files in cwd
  snapshot = await scanMdFiles(process.cwd());
});

pi.on("after_agent_turn", async () => {
  const current = await scanMdFiles(process.cwd());
  const newOrChanged = diff(snapshot, current);
  for (const path of newOrChanged) {
    await persistArtifact(sessionId, path, await readFile(path));
  }
});
```

| Criterion | Rating | Notes |
|---|---|---|
| Simplicity | ★★★☆☆ | Filesystem scanning adds complexity. Must handle race conditions, symlinks, node_modules exclusion. |
| Queryability | Depends | On backend (XTDB = ★★★★★, files = ★★☆☆☆). |
| Survives rebuild | Depends | On backend. |
| Storage overhead | ★★★☆☆ | Captures ALL .md changes, not just pipeline artifacts. README.md edits, CHANGELOG updates all get saved. |
| LLM cooperation | None | Fully automatic. |

**Problem:** False positives. Any .md file change gets captured, including incidental edits. The `after_agent_turn` hook fires in every session, not just pipeline sessions. You'd need heuristics to distinguish "ARCHITECTURE.md written by architect agent" from "README.md updated by user request."

**Problem 2:** Same child-session issue. The filesystem diff runs in the child process, so it captures artifacts there — but the parent needs to assemble the full picture.

**Advantage over artifact-tracker approach:** Catches files that weren't written via the Write tool (e.g., if a bash command writes a file). But in the pipeline, all artifacts are written via Write tool, so this advantage doesn't apply.

---

## Comparison Matrix

| Approach | Simplicity | Queryability | Survives Rebuild | Storage | LLM Cooperation | Child Session Problem |
|---|---|---|---|---|---|---|
| 1. Sidecar dir | ★★★★ | ★★ | ★★★★★ | ★★★ | None | Still needs delegation lookup |
| 2. appendEntry | ★★★★★ | ★★ | ★★★★★ | ★★★ | None | Content in child JSONL only |
| 3. XTDB content | ★★★★ | ★★★★★ | ★★★★★ | ★★★★ | None | Solved — join via delegation table |
| 4. Git tags | ★★ | ★★★ | ★★★★★ | ★★★★★ | None | Concurrent git ops |
| 5. save_artifact tool | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★★ | **Required** | Must inject into sub-agent prompts |
| 6. FS diff | ★★★ | Varies | Varies | ★★★ | None | Content in child process only |

---

## Recommendation

**Primary: Approach 3 (extend artifact-tracker with XTDB content storage)**
**Fallback: Approach 2 (appendEntry) when XTDB is unavailable**
**Optional: Approach 5 (save_artifact tool) for explicit user-driven saves**

### Why Approach 3 Wins

1. **Infrastructure already exists.** artifact-tracker fires on every write in every pi process (including sub-agents). The delegation table already maps parent→child sessions. We're adding ~30 lines, not a new extension.

2. **The child-session problem is already solved.** The query path is: parent session → `delegations` table (child sessions) → `artifacts` table (files written) → `artifact_content` table (stored content). Every link in this chain exists today except the content storage.

3. **Content-addressed storage is free dedup.** artifact-tracker already computes SHA-256 hashes. Storing content keyed by hash means identical artifacts across sessions are stored once.

4. **Fully automatic.** No LLM cooperation needed. No agent prompt changes. No heuristics to distinguish artifact types — filter on `kind = 'doc'` (already inferred from `.md` extension).

5. **Rich queryability.** SQL queries across all pipeline runs, agents, sessions, files.

### Why appendEntry as Fallback

When XTDB is down (container restart, network issue), artifact-tracker silently drops events. Adding `appendEntry` as a fallback ensures content is at least embedded in the session JSONL. This is the decision-log pattern — primary to XTDB, but session JSONL is the safety net.

---

## Artifact Lifecycle

```
  ┌──────────────────────────────────────────────────────────┐
  │                    During Session                        │
  │                                                          │
  │  agent writes ARCHITECTURE.md (v1)                       │
  │       │                                                  │
  │       ▼                                                  │
  │  tool_execution_end fires                                │
  │       │                                                  │
  │       ├─ read file content via fs.readFile               │
  │       ├─ hash content (SHA-256)                          │
  │       ├─ INSERT into artifact_versions (v1, full content)│
  │       └─ file stays on disk (agents can read it normally)│
  │                                                          │
  │  agent edits ARCHITECTURE.md (v2)                        │
  │       │                                                  │
  │       ▼                                                  │
  │  tool_execution_end fires again                          │
  │       │                                                  │
  │       ├─ read file content via fs.readFile               │
  │       ├─ hash content (new hash ≠ v1 hash)              │
  │       ├─ INSERT into artifact_versions (v2, full content)│
  │       └─ file stays on disk                              │
  │                                                          │
  │  ... pipeline continues, planner reads ARCHITECTURE.md   │
  │      from disk as normal, worker reads PLAN.md, etc.     │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────────────┐
  │                   Session End                            │
  │                                                          │
  │  session_shutdown fires                                  │
  │       │                                                  │
  │       ├─ query XTDB: all artifact paths for this session │
  │       ├─ for each tracked .md artifact:                  │
  │       │     if file still on disk → fs.unlink()          │
  │       └─ project directory is now clean                  │
  │                                                          │
  │  Disk: only DESIGN.md + source code remain               │
  │  XTDB: ARCHITECTURE.md (v1, v2), PLAN.md (v1) preserved│
  └──────────────────────────────────────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────────────┐
  │                   Later / On Demand                      │
  │                                                          │
  │  /artifacts                 → list what's stored         │
  │  /artifacts restore PLAN.md → write back to disk         │
  │  /artifacts history ARCH..  → show v1 vs v2 diff         │
  │  /artifacts --pipeline      → full pipeline view         │
  └──────────────────────────────────────────────────────────┘
```

**Key principle:** Every write/edit to a `.md` file creates a new version row in XTDB. Files stay on disk during the session so agents can read them normally. At session end, tracked artifacts are deleted from disk — XTDB is the single source of truth from that point forward.

---

## Implementation Design

### Schema: `artifact_versions` Table

Stores every version of every artifact. NOT content-addressed — each write is a distinct row with its own content, even if the hash matches a prior version. This preserves the full edit timeline.

```sql
INSERT INTO artifact_versions (
  _id,            -- 'av:<session_id>:<path_hash>:<version>'
  session_id,     -- Session that wrote this version
  path,           -- Absolute file path at write time
  relative_path,  -- Path relative to cwd (e.g. 'ARCHITECTURE.md')
  version,        -- Monotonic version counter per (session, path)
  content_hash,   -- SHA-256 of content
  content,        -- Full file content at this version
  size_bytes,     -- Content length
  operation,      -- 'write' or 'edit'
  tool_call_id,   -- The tool call that produced this version
  ts              -- Timestamp of the write
) VALUES (...);
```

**Why not content-addressed?** Content-addressed dedup (keyed by hash) loses the timeline. If an agent writes v1, edits to v2, then reverts to v1's content, a content-addressed store would show 1 row. The version table shows 3 rows — the full history including the revert.

### Schema: `artifact_cleanup` Table

Tracks which files to delete at session end.

```sql
INSERT INTO artifact_cleanup (
  _id,            -- 'aclean:<session_id>:<path_hash>'
  session_id,     -- Session responsible for cleanup
  path,           -- Absolute file path to delete
  relative_path,  -- For display
  created_at      -- When first tracked
) VALUES (...);
```

### artifact-tracker Changes

**On `tool_execution_end` (existing hook, extended):**

```
IF file extension is .md:
  1. Read file content from disk (fs.readFile)
  2. Compute SHA-256 hash
  3. Query current version count for (session_id, path)
  4. INSERT into artifact_versions with version = count + 1
  5. INSERT into artifact_cleanup (idempotent — skip if exists)
  6. On XTDB failure: fall back to appendEntry("session-artifact", { path, content, hash, version })
```

**On `session_shutdown` (new hook):**

```
  1. Query artifact_cleanup WHERE session_id = current session
  2. For each path:
     a. Check file still exists on disk
     b. fs.unlink(path)
     c. Log: "Archived <relative_path> (N versions in XTDB)"
  3. On failure: leave file on disk, log warning (no data loss)
```

### Query Interface — `/artifacts` Command

```
/artifacts                           — list artifacts from current session + child sessions
/artifacts restore <file>            — restore latest version of artifact to disk
/artifacts restore <file> --version N — restore specific version
/artifacts history <file>            — show all versions with timestamps and diffs
/artifacts --pipeline                — group by pipeline stage (architect → planner → worker)
/artifacts --diff <v1> <v2>          — diff two specific versions
/artifacts --session <id>            — list artifacts from a specific session
```

### `restore_artifact` Tool (for LLM access)

```typescript
pi.registerTool({
  name: "restore_artifact",
  description: "Restore a previously archived artifact from XTDB to disk",
  parameters: { path: string, version?: number },
  async execute(_, params) {
    // Query artifact_versions, write content back to disk
  }
});
```

### Context Injection (Phase 2)

On `before_agent_start`, inject a summary of available artifacts:

```
## Archived Artifacts (from prior sessions)
- ARCHITECTURE.md — 2 versions, last written 2026-03-17 by architect agent
- PLAN.md — 1 version, last written 2026-03-17 by planner agent
Use restore_artifact tool to access content.
```

---

## Implementation Steps

### Phase 1: Version Capture (Core)

1. **Add `artifact_versions` + `artifact_cleanup` table bootstrap** to artifact-tracker's `ensureDb()`.

2. **Extend `tool_execution_end` handler** — for `.md` files, read content, compute hash, insert versioned row into `artifact_versions`. Register path in `artifact_cleanup`. Fall back to `appendEntry` on DB failure.

3. **Add `session_shutdown` handler** — query `artifact_cleanup`, delete tracked files from disk.

4. **Add `/artifacts` command** — list artifacts, show version counts, timestamps.

5. **Add `/artifacts restore` subcommand** — query latest (or specific) version from `artifact_versions`, write to disk.

### Phase 2: History & Pipeline View

6. **Add `/artifacts history <file>`** — show all versions with timestamps, content hashes, and producing agent. Inline diff between consecutive versions.

7. **Add `/artifacts --pipeline`** — join through delegations table to reconstruct: parent session → delegate calls → child sessions → artifacts per child, ordered by timestamp.

8. **Add `restore_artifact` tool** — let the LLM restore archived artifacts programmatically.

### Phase 3: Context Injection

9. **Add `before_agent_start` injection** — summarize available archived artifacts so agents know what exists from prior runs without needing the files on disk.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| XTDB stores large content blobs | Medium | Artifacts are typically 5-15KB markdown. Even 1000 versions is ~15MB. Monitor, offload to filesystem-backed store if needed. |
| artifact-tracker doesn't fire in sub-agents | Low | Verified: sub-agents are full `pi` processes that load extensions. Already works for write tracking. |
| `fs.readFile` in `tool_execution_end` reads stale content | Low | Event fires immediately after write tool succeeds. Content is fresh. |
| Session crash before `session_shutdown` — files not cleaned up | Medium | Files remain on disk (safe direction). Next session can detect orphaned artifacts via `artifact_cleanup` table and offer to clean up. |
| Cleanup deletes a file the user wants to keep | Medium | Only delete files tracked in `artifact_cleanup` (i.e., files created by agents during this session). DESIGN.md (user-created) is never tracked. Add `/artifacts keep <file>` to remove from cleanup list. |
| XTDB down during write — version lost | Low | Fall back to `appendEntry` in session JSONL. On next session start, replay JSONL entries into XTDB if DB is back. |
| User expects parent session to show all artifacts | Medium | `/artifacts` command joins through delegations table. Artifacts are stored per child session but queryable from parent. |
| Concurrent sub-agents writing same file | Low | Each write gets its own version row with timestamp. No conflict — just multiple versions. |

---

## What This Does NOT Solve

- **Non-markdown artifacts** (generated images, compiled outputs) — could extend to binary content later.
- **Cross-project artifact comparison** — possible via XTDB queries but no UI proposed here.
- **Artifact validation** — "is this ARCHITECTURE.md well-formed?" is out of scope.
- **Selective cleanup** — currently all tracked `.md` artifacts are deleted at session end. Phase 2 could add patterns/rules for what to keep (e.g., keep DESIGN.md, archive ARCHITECTURE.md).

---

## Open Decisions

### What counts as an artifact?

**All `.md` files written or edited by agents are artifacts.** No exceptions. This includes DESIGN.md — in a real pipeline the architect generates DESIGN.md just like ARCHITECTURE.md and PLAN.md. The hello-service example had a static DESIGN.md, but that's the exception not the rule.

Rule: every `.md` write/edit → versioned in XTDB → cleaned from disk at session end.

On the next pipeline run, the architect either:
- Generates a fresh DESIGN.md from scratch, or
- Restores a prior version from XTDB via `restore_artifact` and iterates on it

This means **XTDB is the canonical store for all design documents.** The project directory only contains source code between sessions.

### Cleanup opt-out

Should there be a way to keep specific artifacts on disk after session end?
- `/artifacts keep ARCHITECTURE.md` — removes from cleanup list

Defer to Phase 2 — start with "clean up everything" and add opt-out if needed based on usage.
