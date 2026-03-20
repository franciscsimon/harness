# Proposal: Versioned Artifact JSON-LD Provenance

## Goal

Wire `artifact_versions` into the W3C PROV-O provenance graph so that every document version links back through the full chain: version → tool call → session → agent → delegation → parent session → project.

---

## Current Provenance Graph (what exists)

```
┌─────────────┐   prov:used    ┌──────────┐
│  decision   │───────────────→│ project  │
│ prov:Activity│               │doap:Proj │
└──────┬──────┘               └────▲─────┘
       │ prov:wasAssociatedWith     │
       ▼                           │ prov:used
  foaf:Agent                 ┌─────┴──────┐
                             │session_proj│
┌─────────────┐              │prov:Activity│
│  artifact   │              └────────────┘
│ prov:Entity │
│             │─── prov:wasGeneratedBy ──→ urn:pi:toolcall:<id>
└─────────────┘

┌─────────────┐   prov:wasInformedBy    ┌────────────────┐
│ delegation  │────────────────────────→│ parent session │
│prov:Activity│                         └────────────────┘
│             │─── prov:generated ─────→ child session
└─────────────┘

┌──────────────────┐
│artifact_versions │  ← NO jsonld. No provenance links.
│  (content store) │     Relational columns only.
└──────────────────┘
```

**The gap:** `artifact_versions` stores the actual document content but is invisible to the provenance graph. You can't ask "show me the chain that produced ARCHITECTURE.md v2" because versions have no PROV-O identity.

---

## Proposal

### 1. Add `jsonld` column to `artifact_versions`

**PROV-O type:** `prov:Entity` — same as `artifacts`. A version is a specific entity; the abstract artifact is the generic entity it specializes.

**New URN pattern:** `urn:pi:artver:<_id>` (where `_id` is the existing `av:...` composite key)

**JSON-LD shape:**

```json
{
  "@context": {
    "prov": "http://www.w3.org/ns/prov#",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "ev": "https://pi.dev/events/",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@id": "urn:pi:artver:av:a1b2c3d4:e5f6a7b8c9d0:2",
  "@type": "prov:Entity",

  "prov:wasGeneratedBy": {
    "@id": "urn:pi:toolcall:tc_abc123"
  },
  "prov:wasDerivedFrom": {
    "@id": "urn:pi:artver:av:a1b2c3d4:e5f6a7b8c9d0:1"
  },
  "prov:specializationOf": {
    "@id": "urn:pi:art:550e8400-e29b-41d4-a716-446655440000"
  },
  "prov:wasAttributedTo": {
    "@id": "urn:pi:session:2026-03-17T23-00-00_abc123.jsonl"
  },

  "ev:path": "/home/opunix/harness/ARCHITECTURE.md",
  "ev:relativePath": "ARCHITECTURE.md",
  "ev:version": { "@value": "2", "@type": "xsd:integer" },
  "ev:contentHash": "a1b2c3d4e5f6a7b8",
  "ev:sizeBytes": { "@value": "4096", "@type": "xsd:integer" },
  "ev:operation": "write",
  "ev:ts": { "@value": "1742227200000", "@type": "xsd:long" }
}
```

**PROV-O relationships used:**

| Relationship | From | To | Meaning |
|---|---|---|---|
| `prov:wasGeneratedBy` | version entity | tool call URN | Which write/edit call produced this version |
| `prov:wasDerivedFrom` | version N | version N-1 | Version chain (v2 came from v1) |
| `prov:specializationOf` | version entity | artifact entity | This version is a specific state of the abstract artifact |
| `prov:wasAttributedTo` | version entity | session URN | Which session produced this version |

**Derivation rules:**

- **Within a session:** If `version > 1` for the same `(session_id, path)`, link `prov:wasDerivedFrom` → previous version's `_id`. The previous version is deterministic: same session, same path, version - 1.
- **First version in a session (version = 1):** Query for the latest prior version of the same `path` across all sessions. If found, link `prov:wasDerivedFrom` → that version. If not found (genuinely new file), omit the relationship.
- **`prov:specializationOf`:** Look up the `artifacts` row for the same `(session_id, path, tool_call_id)` — this is the parent artifact entity. The `artifacts` insert happens first in `tool_execution_end`, then `captureVersion` fires.

**Why this works:** The `_id` format `av:<session>:<pathHash>:<version>` is deterministic. Within a session, chaining is free (decrement version number). Cross-session chaining requires one query at insert time — find the max-ts row for the same path.

---

### 2. Cross-session derivation lookup

When `captureVersion` inserts version 1 for a path in a new session, it needs the latest prior version:

```sql
SELECT _id FROM artifact_versions
WHERE path = $1 AND session_id != $2
ORDER BY ts DESC
LIMIT 1
```

This returns the `_id` to use as the `prov:wasDerivedFrom` target. If no row exists, this is a brand-new artifact — no derivation link.

**Cost:** One extra query per first-version-of-a-file-in-a-session. Subsequent versions within the same session chain locally with zero queries.

**Edge case — concurrent sessions editing same file:** Both sessions' v1 would derive from the same prior version. This is correct PROV-O semantics — two independent derivations from the same source. The graph fans out:

```
prior-v3 ←─── session-A v1
         ←─── session-B v1
```

---

### 3. `specializationOf` — linking versions to abstract artifacts

The `artifacts` table already records every write/edit with a `prov:Entity` JSON-LD document. Each `artifact_versions` row is a *specialization* of the corresponding `artifacts` row — same tool call, same session, same path.

**Lookup:** At insert time in `captureVersion`, the caller (`tool_execution_end` handler in index.ts) has just inserted the `artifacts` row and knows its `_id`. Pass this `_id` into `captureVersion` as a new parameter.

This creates a two-level entity model:
- `artifacts` = "ARCHITECTURE.md was written in session X" (metadata only, no content)
- `artifact_versions` = "here is the exact content at that point" (full content + provenance chain)

```
artifact (prov:Entity)          ← what the artifacts table stores
    ▲
    │ prov:specializationOf
    │
artifact_version (prov:Entity)  ← what artifact_versions will store
    │
    │ prov:wasDerivedFrom
    ▼
artifact_version (prior)        ← the previous version
```

---

### 4. Session provenance — composite view, not new storage

**Recommendation: Do NOT create a new table.** The provenance data already exists across 5 tables. A session's full story is a query, not a document.

**Session provenance query:**

```sql
-- Everything a session produced or was involved in
SELECT 'artifact_version' AS type, _id, jsonld, ts
  FROM artifact_versions WHERE session_id = $1
UNION ALL
SELECT 'artifact' AS type, _id, jsonld, ts
  FROM artifacts WHERE session_id = $1
UNION ALL
SELECT 'decision' AS type, _id, jsonld, ts
  FROM decisions WHERE session_id = $1
UNION ALL
SELECT 'delegation' AS type, _id, jsonld, ts
  FROM delegations WHERE parent_session_id = $1 OR child_session_id = $1
UNION ALL
SELECT 'postmortem' AS type, _id, jsonld, ts
  FROM session_postmortems WHERE session_id = $1
ORDER BY ts ASC
```

This returns every provenance-bearing record for a session, ordered chronologically. The JSON-LD documents can be assembled into a `prov:Bundle` at export time (see §6).

**Why not a new table:** Adding a composite document means maintaining consistency when any constituent changes. The query approach is always fresh. Storage is already happening in the component tables — duplicating it adds complexity with no queryability benefit.

**Extension point:** The `session_postmortems` jsonld could be enriched with summary counts:

```json
{
  "ev:artifactVersionsProduced": { "@value": "5", "@type": "xsd:integer" },
  "ev:decisionsLogged": { "@value": "2", "@type": "xsd:integer" },
  "ev:delegationsSpawned": { "@value": "3", "@type": "xsd:integer" }
}
```

This is cheap — the postmortem already runs at `session_shutdown` and has access to the DB. Three COUNT queries.

---

### 5. Pipeline provenance — cross-agent derivation

For a pipeline like `architect → planner → worker → tester`:

```
Parent session (orchestrator)
  │
  ├─ delegates to architect (delegations row)
  │     └─ architect session produces ARCHITECTURE.md v1 (artifact_version)
  │
  ├─ delegates to planner (delegations row)
  │     ├─ planner reads ARCHITECTURE.md (tool_call: Read)
  │     └─ planner produces PLAN.md v1 (artifact_version)
  │
  ├─ delegates to worker (delegations row)
  │     ├─ worker reads PLAN.md (tool_call: Read)
  │     └─ worker produces src/app.ts v1 (artifact — not .md, no version)
  │
  └─ delegates to tester (delegations row)
        └─ tester reads src/app.ts, runs tests
```

**The hard problem:** How do we know PLAN.md was *derived from* ARCHITECTURE.md? Today we don't capture Read events in the artifact-tracker — only writes.

**Three approaches, in order of pragmatism:**

#### 5a. Session-level inference (recommended, Phase 1)

**Rule:** All artifacts produced by a child session are implicitly derived from the delegation that spawned it. The delegation links to the parent session. The parent session's prior delegations produced the inputs.

This gives us the pipeline chain via delegation hops:

```
ARCHITECTURE.md v1
  ← produced by architect session
    ← delegated from parent session
      → also delegated to planner session
        → which produced PLAN.md v1
```

**No new data needed.** The query walks: `delegations.parent_session_id` → `delegations.child_session_id` → `artifact_versions.session_id`. The ordering is temporal — delegations have timestamps.

**JSON-LD for this:** The delegation already has `prov:wasInformedBy` (parent) and `prov:generated` (child). The artifact version has `prov:wasAttributedTo` (session). The chain is navigable.

#### 5b. Read-tracking (Phase 2)

Add a lightweight `artifact_reads` table that fires on `tool_call` for the `read` tool when the path matches a known artifact:

```
_id, session_id, path, tool_call_id, ts
```

Then the derivation becomes explicit: "planner session Read ARCHITECTURE.md (artifact_reads) then Write PLAN.md (artifact_versions)." PLAN.md `prov:wasDerivedFrom` ARCHITECTURE.md because the same session read one and wrote the other.

**Cost:** ~15 lines in artifact-tracker's `tool_call` handler. No JSON-LD needed on reads — they're just linkage evidence.

#### 5c. PROV-O Bundle per pipeline run (Phase 3)

A `prov:Bundle` is a named set of provenance assertions. For a full pipeline run, construct one at export time:

```json
{
  "@context": { "prov": "http://www.w3.org/ns/prov#", "ev": "https://pi.dev/events/" },
  "@id": "urn:pi:pipeline:<parent-session-id>",
  "@type": "prov:Bundle",
  "@graph": [
    { "@id": "urn:pi:artver:av:...:1", "@type": "prov:Entity", "prov:wasGeneratedBy": "..." },
    { "@id": "urn:pi:del:...", "@type": "prov:Activity", "prov:wasInformedBy": "..." },
    { "@id": "urn:pi:artver:av:...:1", "@type": "prov:Entity", "prov:wasDerivedFrom": "..." }
  ]
}
```

This is a computed export, not stored. See §6.

---

### 6. Export: `/export-provenance` command

A new pi command that emits a complete PROV-O graph for a session or pipeline.

**Command:** `/export-provenance [session|pipeline] [--format jsonld|turtle]`

**Implementation:** New command registration in artifact-tracker (or a dedicated `provenance-export` extension).

**Algorithm:**

1. Given a session ID, find all delegations where `parent_session_id = $1`
2. Collect child session IDs recursively (handles nested delegations)
3. For all collected session IDs, run the union query from §4
4. Parse each row's `jsonld` column → JavaScript objects
5. Wrap in a `prov:Bundle` with the root session as `@id`
6. Serialize as JSON-LD (native — just `JSON.stringify` the bundle)
7. Optionally serialize as Turtle via the existing `jsonld-streaming-serializer` in `xtdb-event-logger/rdf/serialize.ts`

**Output location:** Write to `<cwd>/provenance-<session-slug>.jsonld` or print to stdout.

**Effort:** ~80 lines. The recursive delegation walk is the only non-trivial part.

---

### 7. Queryability — relational columns for queries, jsonld for export

**Confirmed pattern from codebase review:** Every extension queries via SQL on relational columns. The `jsonld` column is never used in WHERE, JOIN, or ORDER BY. It's a serialized document for display (event-detail.ts renders it as pretty-printed JSON) and export.

**This is correct.** XTDB's SQL engine operates on relational columns. JSON-LD is not a query language — it's a serialization format. Keep all queryable data in dedicated columns:

| Query | Uses columns | Does NOT use jsonld |
|---|---|---|
| "All versions of ARCHITECTURE.md" | `path`, `ts` | ✗ |
| "What did session X produce?" | `session_id` | ✗ |
| "Full pipeline from parent" | `delegations.parent_session_id` → `child_session_id` → `artifact_versions.session_id` | ✗ |
| "Show provenance graph" | Read `jsonld` column for display/export | ✓ (read, not query) |

**No schema changes needed for queryability.** The existing relational columns (`session_id`, `path`, `version`, `tool_call_id`, `ts`) support all the queries. The `jsonld` column adds the PROV-O semantics for export and interoperability.

---

## Implementation Plan

### Phase 1 — Core (3 steps, ~100 lines changed)

**Step 1: Add `jsonld` column to `artifact_versions` bootstrap**

File: `artifact-tracker/db.ts`

Change the `bootstrapTable` call to include `jsonld`:
```
"_id, session_id, path, relative_path, version, content_hash, content, size_bytes, operation, tool_call_id, ts, jsonld"
```

Also add `jsonld` to the UI's `ensureTables` in `xtdb-event-logger-ui/lib/db.ts`.

Effort: 2 lines.

**Step 2: Build JSON-LD in `captureVersion`**

File: `artifact-tracker/versioning.ts`

New function `buildVersionJsonLd(...)` that constructs the JSON-LD document. Called from `captureVersion` before the INSERT.

Derivation logic:
- If `version > 1`: derive from `av:<session>:<pathHash>:<version-1>` (local, no query)
- If `version === 1`: query for latest prior version of same `path` across sessions (one SELECT)

Pass the parent artifact `_id` from index.ts for `prov:specializationOf`.

Effort: ~40 lines for the builder + ~10 lines for the cross-session lookup.

**Step 3: Pass artifact `_id` from index.ts into `captureVersion`**

File: `artifact-tracker/index.ts`

After the `artifacts` INSERT succeeds, pass the `id` (e.g., `art:550e8400...`) to `captureVersion` as a new parameter so it can populate `prov:specializationOf`.

Update `captureVersion` signature to accept `parentArtifactId: string`.

Effort: ~5 lines changed across 2 files.

### Phase 2 — Postmortem enrichment (1 step, ~20 lines)

**Step 4: Add summary counts to session_postmortems jsonld**

File: `session-postmortem/index.ts`

In the `session_shutdown` handler, before building jsonld, run three COUNT queries:
```sql
SELECT COUNT(*) FROM artifact_versions WHERE session_id = $1
SELECT COUNT(*) FROM decisions WHERE session_id = $1
SELECT COUNT(*) FROM delegations WHERE parent_session_id = $1
```

Add `ev:artifactVersionsProduced`, `ev:decisionsLogged`, `ev:delegationsSpawned` to the postmortem jsonld.

Effort: ~20 lines.

### Phase 3 — Export command (1 step, ~80 lines)

**Step 5: `/export-provenance` command**

File: `artifact-tracker/commands.ts` (or new `provenance-export/index.ts`)

Register `/export-provenance` command. Algorithm:
1. Recursive delegation walk from root session
2. Union query across all provenance tables for collected sessions
3. Assemble `prov:Bundle` from jsonld columns
4. Write JSON-LD file to cwd

Effort: ~80 lines.

### Phase 4 — Read tracking (1 step, ~25 lines)

**Step 6: Track artifact reads for cross-artifact derivation**

File: `artifact-tracker/index.ts`

In the `tool_call` handler, if `toolName === "read"` and the path matches a tracked artifact (exists in `artifacts` table), insert a row into a new `artifact_reads` table:

```
_id, session_id, path, tool_call_id, ts
```

No jsonld needed — reads are evidence for derivation inference, not provenance entities themselves.

Effort: ~25 lines + bootstrap table addition.

---

## Schema Changes Summary

### Modified table: `artifact_versions`

```diff
- _id, session_id, path, relative_path, version, content_hash, content, size_bytes, operation, tool_call_id, ts
+ _id, session_id, path, relative_path, version, content_hash, content, size_bytes, operation, tool_call_id, ts, jsonld
```

### New table (Phase 4): `artifact_reads`

```
_id          TEXT  -- "aread:<uuid>"
session_id   TEXT  -- which session read the artifact
path         TEXT  -- absolute path that was read
tool_call_id TEXT  -- the Read tool call ID
ts           BIGINT
```

### No new tables for session provenance or pipeline bundles

These are computed from existing tables at query/export time.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cross-session derivation query is slow | Low | Low | Query is `WHERE path = X ORDER BY ts DESC LIMIT 1` — single index scan. Runs once per new-file-in-session, not per version. |
| `prov:specializationOf` link breaks if artifacts INSERT fails | Low | Low | If parent artifact INSERT fails, omit the `specializationOf` link. Version still has `wasGeneratedBy` and `wasAttributedTo`. |
| XTDB down — jsonld not computed | Low | Low | Existing fallback: `appendEntry` in session JSONL. JSON-LD is a column value, not a separate system — if the INSERT fails, everything fails together. |
| Pipeline derivation (5b) adds overhead to every Read call | Medium | Low | Gate on: (a) path ends in `.md`, and (b) path exists in `artifacts` table. Cache known artifact paths in memory. |
| JSON-LD documents grow large with deep version chains | Low | Low | Each document only links to its immediate predecessor (`wasDerivedFrom` is one hop). The full chain is walked by following links, not stored in one document. |
| Export of large pipelines produces huge Bundle | Low | Medium | Cap at 1000 nodes. Add `--depth N` flag to limit delegation recursion. |

---

## Verification

After Phase 1 implementation:

1. **Write a .md file twice in one session.** Check `artifact_versions` — v2's jsonld should have `prov:wasDerivedFrom` pointing to v1's `_id`.
2. **Start a new session, edit the same file.** New v1's jsonld should have `prov:wasDerivedFrom` pointing to the prior session's last version.
3. **Check `prov:specializationOf`.** Each version's jsonld should reference the corresponding `artifacts` row `_id`.
4. **Parse the jsonld as JSON.** Verify `@context`, `@id`, `@type` match the spec above.

After Phase 3:

5. **Run `/export-provenance` on a multi-agent pipeline.** Output should contain all artifact versions, delegations, and decisions as a single `prov:Bundle`.
6. **Validate the Bundle** with a JSON-LD playground (https://json-ld.org/playground/) — should expand without errors.

---

## Files Changed

| Phase | File | Change |
|---|---|---|
| 1 | `artifact-tracker/db.ts` | Add `jsonld` to `artifact_versions` bootstrap columns |
| 1 | `artifact-tracker/versioning.ts` | Add `buildVersionJsonLd()`, cross-session derivation lookup, new `parentArtifactId` param |
| 1 | `artifact-tracker/index.ts` | Pass artifact `_id` to `captureVersion` |
| 1 | `xtdb-event-logger-ui/lib/db.ts` | Add `jsonld` to `artifact_versions` seed columns |
| 2 | `session-postmortem/index.ts` | Add COUNT queries + summary fields to jsonld |
| 3 | `artifact-tracker/commands.ts` | Add `/export-provenance` command (or new extension) |
| 4 | `artifact-tracker/db.ts` | Bootstrap `artifact_reads` table |
| 4 | `artifact-tracker/index.ts` | Track Read tool calls for known artifact paths |

---

## Open Questions

1. **Should `artifact_reads` track non-.md files?** Currently artifact-tracker only versions `.md` files. If we want pipeline derivation for source code (`worker reads PLAN.md → writes app.ts`), we'd need to track reads of `.md` that lead to writes of `.ts`. Phase 4 could start with `.md` reads only.

2. **Should the UI show provenance graphs visually?** The `flow.ts` page already renders a timeline of projections. A provenance view could show the derivation chain as a DAG. Defer to a separate UI proposal.

3. **Turtle export — needed?** The `jsonld-streaming-serializer` in `xtdb-event-logger` can produce Turtle from N3 triples. But converting our hand-built JSON-LD back to N3 triples just to re-serialize to Turtle is roundabout. If Turtle is needed, use `jsonld` npm package to expand + `n3` to serialize. Defer unless there's a concrete consumer.
