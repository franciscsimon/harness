# Project Registry — Implementation Progress

> **Source plan:** `docs/PROJECT_REGISTRY_PLAN.md`
> **Motivation:** `docs/CHANGE_MANAGEMENT_PROPOSALS.md` (stable project identity needed for all 3 proposals)
> **Started:** —
> **Last updated:** —

---

## Status Summary

| Phase | Status | Steps |
|---|---|---|
| 1. JSON-LD Foundation | ⬜ Not started | 1.1 – 1.3 |
| 2. Identity Resolution | ⬜ Not started | 2.1 – 2.3 |
| 3. Extension Core | ⬜ Not started | 3.1 – 3.4 |
| 4. XTDB Storage | ⬜ Not started | 4.1 – 4.3 |
| 5. DB Queries & API | ⬜ Not started | 5.1 – 5.3 |
| 6. UI Pages | ⬜ Not started | 6.1 – 6.5 |
| 7. Testing & Verification | ⬜ Not started | 7.1 – 7.4 |

---

## Open Questions (from plan §9, must resolve before/during implementation)

1. **XTDB INSERT-on-existing-`_id` behavior:** Does `INSERT INTO projects` with a duplicate `_id` silently overwrite (PUT semantics) or throw a conflict error? If it errors → we must read-then-write. **Answer needed before Step 4.1.**

2. **Extension hook execution order:** Are `session_start` handlers across extensions sequential or concurrent? Affects whether `globalThis.__piCurrentProject` is guaranteed set before other extensions read it. The `__piLastEvent` pattern works because it's set synchronously within the *same* handler — our cross-extension publish is different. **Answer needed before Step 3.3.**

3. **`pi.exec` in `session_start`:** The plan uses `pi.exec("git", [...])` for git commands during `session_start`. `git-checkpoint` does this successfully in `session_start` and `turn_end` hooks. **Likely safe — verify in Step 3.1.**

4. **Session ID on fork/switch:** Does `ctx.sessionManager.getSessionFile()` return a new ID after `/fork`? If yes, the forked session auto-creates a new `session_projects` link on next `session_start`. If no, we may double-link. **Answer needed before Step 4.2.**

5. **SHA-256 availability:** Node.js `crypto.createHash('sha256')` is built-in. No external dep needed. **Resolved — use `node:crypto`.**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  pi session_start event                                         │
│                                                                 │
│  ┌──────────────────────────┐                                   │
│  │  project-registry ext    │                                   │
│  │  (index.ts)              │                                   │
│  │                          │                                   │
│  │  1. ctx.cwd              │                                   │
│  │  2. resolveProject(cwd)  │──▶ identity.ts (pure)             │
│  │     ├─ git remote URL?   │      ├─ normalizeGitUrl()         │
│  │     ├─ git first-commit? │      │    (normalize.ts, pure)    │
│  │     └─ path fallback     │      └─ → ProjectIdentity         │
│  │  3. sha256 → project _id │                                   │
│  │  4. Read/merge XTDB      │──▶ XTDB (projects table)          │
│  │  5. Write project record │──▶ XTDB (session_projects table)  │
│  │  6. globalThis publish   │──▶ __piCurrentProject              │
│  │  7. ctx.ui.setStatus     │                                   │
│  └──────────────────────────┘                                   │
│                                                                 │
│  ┌──────────────────────────┐    ┌────────────────────────────┐ │
│  │  xtdb-event-logger-ui    │    │  XTDB v2 (Postgres wire)   │ │
│  │                          │    │                            │ │
│  │  lib/db.ts               │◀──▶│  projects table            │ │
│  │   getProjects()          │    │  session_projects table    │ │
│  │   getSessionProject()    │    │  events table (existing)   │ │
│  │   getProjectSessions()   │    │  projections (existing)    │ │
│  │                          │    └────────────────────────────┘ │
│  │  server.ts               │                                   │
│  │   GET /projects          │                                   │
│  │   GET /projects/:id      │                                   │
│  │   GET /api/projects      │                                   │
│  │   GET /api/projects/:id  │                                   │
│  │                          │                                   │
│  │  pages/                  │                                   │
│  │   projects.ts      (new) │                                   │
│  │   project-detail.ts (new)│                                   │
│  │   sessions.ts  (modified)│                                   │
│  │   session-detail (mod.)  │                                   │
│  └──────────────────────────┘                                   │
└─────────────────────────────────────────────────────────────────┘
```

### JSON-LD Vocabulary Map

```
doap:Project ──── doap:name ──────────▶ "harness"
     │            doap:repository ────▶ doap:GitRepository
     │                                      └─ doap:location ▶ "github.com/user/harness"
     │
     └─ prov:used ◀── prov:Activity (session)
                           └─ prov:wasAssociatedWith ▶ foaf:Agent

Existing vocabularies (unchanged):
  ev:   → pi.dev event types (events table)
  schema: → Schema.org (environment metadata)
  rdf:  → RDF syntax
  xsd:  → XML Schema datatypes
```

---

## Phase 1: JSON-LD Foundation

### - [ ] 1.1 — Add DOAP, PROV-O, FOAF namespaces

**Files to modify:**
- `~/harness/xtdb-event-logger/rdf/namespaces.ts`
- `~/.pi/agent/extensions/xtdb-event-logger/rdf/namespaces.ts` (copy after edit)

**What to do:**

Add three namespace constants after the existing `SCHEMA` export:

```typescript
/** DOAP — Description of a Project */
export const DOAP = "http://usefulinc.com/ns/doap#";

/** PROV-O — W3C Provenance Ontology */
export const PROV = "http://www.w3.org/ns/prov#";

/** FOAF — Friend of a Friend (agent identity) */
export const FOAF = "http://xmlns.com/foaf/0.1/";
```

Extend `JSONLD_CONTEXT` to include the new prefixes:

```typescript
export const JSONLD_CONTEXT = {
  ev: EV,
  rdf: RDF,
  xsd: XSD,
  schema: SCHEMA,
  doap: DOAP,
  prov: PROV,
  foaf: FOAF,
};
```

**Depends on:** Nothing
**Test:** `grep 'DOAP\|PROV\|FOAF' xtdb-event-logger/rdf/namespaces.ts` shows all three. Existing JSON-LD serialization still works (start a pi session, verify events still log).
**Effort:** S

---

### - [ ] 1.2 — Define project JSON-LD @context

**Files to create:**
- `~/harness/project-registry/rdf.ts`

**What to do:**

Define the JSON-LD `@context` object specific to project documents. This is the context embedded in project records stored in XTDB's `jsonld` column.

```typescript
export const PROJECT_JSONLD_CONTEXT = {
  doap: "http://usefulinc.com/ns/doap#",
  prov: "http://www.w3.org/ns/prov#",
  foaf: "http://xmlns.com/foaf/0.1/",
  ev: "https://pi.dev/events/",
  xsd: "http://www.w3.org/2001/XMLSchema#",
};
```

Define the JSON-LD document shape for a **project record**:

```jsonc
// Example: what gets stored in projects.jsonld column
{
  "@context": { /* PROJECT_JSONLD_CONTEXT */ },
  "@id": "urn:pi:proj:a1b2c3d4e5f6",
  "@type": "doap:Project",
  "doap:name": "harness",
  "doap:repository": {
    "@type": "doap:GitRepository",
    "doap:location": "github.com/user/harness"
  },
  "ev:identityType": "git-remote",
  "ev:canonicalId": "git:github.com/user/harness",
  "ev:firstSeenTs": { "@value": "1710000000000", "@type": "xsd:long" },
  "ev:lastSeenTs": { "@value": "1710100000000", "@type": "xsd:long" },
  "ev:sessionCount": { "@value": "5", "@type": "xsd:integer" }
}
```

Define the JSON-LD document shape for a **session-project link**:

```jsonc
// Example: what gets stored in session_projects.jsonld column
{
  "@context": { /* PROJECT_JSONLD_CONTEXT */ },
  "@id": "urn:pi:sp:uuid-here",
  "@type": "prov:Activity",
  "prov:used": { "@id": "urn:pi:proj:a1b2c3d4e5f6" },
  "prov:wasAssociatedWith": {
    "@type": "foaf:Agent",
    "foaf:name": "pi-agent"
  },
  "ev:sessionId": "/path/to/.pi/sessions/abc.json",
  "ev:cwd": "/Users/opunix/harness/src",
  "ev:ts": { "@value": "1710050000000", "@type": "xsd:long" },
  "ev:isFirstSession": { "@value": "false", "@type": "xsd:boolean" }
}
```

Write a `buildProjectJsonLd(record: ProjectRecord): object` function and a `buildSessionProjectJsonLd(link: SessionProjectRecord): object` function that produce these shapes from TypeScript types.

**Depends on:** 1.1 (namespace URIs)
**Test:** Import and call both builders with sample data, `JSON.stringify` the output, verify `@type` and property names are correct.
**Effort:** S

---

### - [ ] 1.3 — Define TypeScript types for Project and SessionProject

**Files to create:**
- `~/harness/project-registry/types.ts`

**What to do:**

```typescript
/** The result of resolving project identity from cwd */
export interface ProjectIdentity {
  canonicalId: string;         // "git:github.com/user/repo" | "git-local:<hash>" | "path:/abs/path"
  name: string;                // human-readable, auto-derived
  identityType: "git-remote" | "git-local" | "path";
  gitRemoteUrl: string | null; // raw origin URL, null for non-git
  gitRootPath: string | null;  // absolute path to git root, null for non-git
}

/** Row shape for the XTDB `projects` table */
export interface ProjectRecord {
  _id: string;                 // "proj:<sha256-prefix>"
  canonical_id: string;
  name: string;
  identity_type: string;       // "git-remote" | "git-local" | "path"
  git_remote_url: string | null;
  git_root_path: string | null;
  first_seen_ts: number;       // epoch ms
  last_seen_ts: number;        // epoch ms
  session_count: number;
  jsonld: string;              // serialized JSON-LD document
}

/** Row shape for the XTDB `session_projects` table */
export interface SessionProjectRecord {
  _id: string;                 // "sp:<uuid>"
  session_id: string;          // from ctx.sessionManager.getSessionFile()
  project_id: string;          // FK → projects._id
  canonical_id: string;        // denormalized
  cwd: string;                 // actual working directory
  git_root_path: string | null;
  ts: number;                  // epoch ms
  is_first_session: boolean;
  jsonld: string;              // serialized JSON-LD document
}

/** What gets published to globalThis for other extensions */
export interface CurrentProject {
  projectId: string;
  canonicalId: string;
  name: string;
  isFirstSession: boolean;
  identityType: string;
}

/** Exec function signature — injected for testability */
export type ExecFn = (cmd: string, args: string[], opts: object) => Promise<{ stdout?: string; stderr?: string }>;
```

**Depends on:** Nothing (but aligns with 1.2 JSON-LD shapes)
**Test:** TypeScript compiles without errors.
**Effort:** S

---

## Phase 2: Identity Resolution (pure functions, testable)

### - [ ] 2.1 — Git URL normalizer

**Files to create:**
- `~/harness/project-registry/normalize.ts`

**What to do:**

Implement `normalizeGitUrl(raw: string): string` as a pure function. No I/O.

Rules (from plan §2):
1. `git@host:path` → `host/path` (SSH shorthand: replace `:` with `/`, strip `git@`)
2. `ssh://git@host/path` → `host/path` (strip protocol + userinfo)
3. `https://host/path` → `host/path` (strip protocol)
4. `git://host/path` → `host/path` (strip protocol)
5. Strip `.git` suffix
6. Strip trailing slashes
7. Lowercase the host portion only (path stays as-is)

Test cases from the plan:

| Input | Output |
|---|---|
| `git@github.com:user/repo.git` | `github.com/user/repo` |
| `https://github.com/user/repo.git` | `github.com/user/repo` |
| `ssh://git@github.com/user/repo.git` | `github.com/user/repo` |
| `https://github.com/user/repo` | `github.com/user/repo` |
| `git@gitlab.com:org/sub/repo.git` | `gitlab.com/org/sub/repo` |
| `https://GITHUB.COM/User/Repo.git` | `github.com/User/Repo` |

Export the function as a named export. No default export.

**Depends on:** Nothing
**Test:** Call with each test case, assert output matches. Can run as a standalone script: `npx tsx -e "import {normalizeGitUrl} from './normalize.ts'; console.log(normalizeGitUrl('git@github.com:user/repo.git'))"`
**Effort:** S

---

### - [ ] 2.2 — Project identity resolver

**Files to create:**
- `~/harness/project-registry/identity.ts`

**What to do:**

Implement `resolveProject(cwd: string, exec: ExecFn): Promise<ProjectIdentity>`.

The `exec` parameter is an injected function matching `pi.exec` signature — this makes the function testable without a real git repo.

Algorithm (from plan §2):

```
1. git -C <cwd> rev-parse --show-toplevel
   → success: gitRoot = stdout.trim()
   → failure: go to step 5

2. git -C <gitRoot> remote get-url origin
   → success: raw URL. Normalize via normalizeGitUrl().
     canonicalId = "git:" + normalized
     identityType = "git-remote"
     name = last segment of normalized path
   → failure: go to step 3

3. git -C <gitRoot> rev-list --max-parents=0 HEAD
   → success: firstCommitHash = stdout.trim().split('\n')[0]
     canonicalId = "git-local:" + firstCommitHash
     identityType = "git-local"
     name = basename(gitRoot)
   → failure: go to step 4

4. No commits yet:
   canonicalId = "path:" + gitRoot
   identityType = "path"
   name = basename(gitRoot)

5. Not a git repo:
   canonicalId = "path:" + resolve(cwd)
   identityType = "path"
   name = basename(cwd)
```

Import `normalizeGitUrl` from `./normalize.ts`. Import `basename`, `resolve` from `node:path`.

**Depends on:** 2.1 (normalizeGitUrl)
**Test:** Create a mock `exec` that returns canned stdout/stderr for each git command. Test all 4 paths: git-remote, git-local, no-commits, non-git. See Step 7.1 for full test details.
**Effort:** S

---

### - [ ] 2.3 — Deterministic project ID generation

**Files to modify:**
- `~/harness/project-registry/identity.ts` (add to same file)

**What to do:**

Add a function: `generateProjectId(canonicalId: string): string`

```typescript
import { createHash } from "node:crypto";

export function generateProjectId(canonicalId: string): string {
  const hash = createHash("sha256").update(canonicalId).digest("hex");
  return "proj:" + hash.slice(0, 12);
}
```

The 12-character hex prefix gives 48 bits of entropy — collision-safe for any plausible number of projects on a single machine.

Test cases:

| Input | Output (verify deterministic, not specific hash) |
|---|---|
| `"git:github.com/user/repo"` | `"proj:"` + 12 hex chars |
| Same input twice | Same output |
| Different input | Different output |

**Depends on:** Nothing (but lives in identity.ts alongside 2.2)
**Test:** Call twice with same input → same result. Call with different input → different result.
**Effort:** S

---

## Phase 3: Extension Core

### - [ ] 3.1 — Extension entry point (session_start hook)

**Files to create:**
- `~/harness/project-registry/index.ts`
- `~/harness/project-registry/package.json`

**What to do:**

**`package.json`:**
```json
{
  "name": "project-registry",
  "private": true,
  "dependencies": {
    "postgres": "^3.4.5"
  }
}
```

Run `cd ~/harness/project-registry && npm install` after creating.

**`index.ts`:** Default export function matching the pi extension API (`(pi: ExtensionAPI) => void`).

Hook `session_start` only. Inside the handler:

```
1.  cwd = ctx.cwd ?? process.cwd()
2.  sessionId = ctx.sessionManager.getSessionFile()
3.  identity = await resolveProject(cwd, pi.exec)
4.  projectId = generateProjectId(identity.canonicalId)
5.  [XTDB read/write — see Phase 4]
6.  [globalThis publish — see Step 3.3]
7.  ctx.ui.setStatus("project", `📁 ${identity.name}`)
```

For now (before Phase 4), stub steps 5-6: log to console and set UI status. This lets us verify the hook fires and identity resolution works.

Use a lazy postgres connection (same pattern as `xtdb-projector/index.ts`):
```typescript
let sql: ReturnType<typeof postgres> | null = null;
function getSql() {
  if (!sql) {
    sql = postgres({
      host: process.env.XTDB_HOST ?? "localhost",
      port: Number(process.env.XTDB_PORT ?? 5433),
      database: "xtdb", user: "xtdb", password: "xtdb",
    });
  }
  return sql;
}
```

Wrap entire handler in try/catch — never crash the session on registry failure.

**Depends on:** 1.3 (types), 2.2 (resolveProject), 2.3 (generateProjectId)
**Test:** Copy to extensions dir (Step 3.4), start pi in `~/harness`, see `📁 harness` status and console log of resolved identity.
**Effort:** M

---

### - [ ] 3.2 — Hook session_shutdown for cleanup

**Files to modify:**
- `~/harness/project-registry/index.ts`

**What to do:**

Add a `session_shutdown` hook that closes the postgres connection:

```typescript
pi.on("session_shutdown", async () => {
  if (sql) {
    try { await sql.end(); } catch {}
    sql = null;
  }
});
```

Follow the same pattern as `xtdb-event-logger/index.ts` session_shutdown handler.

**Depends on:** 3.1
**Test:** Start and stop a session. No orphaned postgres connections. (Check with `SELECT * FROM pg_stat_activity` if needed.)
**Effort:** S

---

### - [ ] 3.3 — globalThis sharing for other extensions

**Files to modify:**
- `~/harness/project-registry/index.ts` (inside session_start handler)

**What to do:**

After resolving identity and writing to XTDB (or after the stub in 3.1), publish:

```typescript
(globalThis as any).__piCurrentProject = {
  projectId,
  canonicalId: identity.canonicalId,
  name: identity.name,
  isFirstSession,  // determined during XTDB read in Phase 4
  identityType: identity.identityType,
} satisfies CurrentProject;
```

This follows the established pattern from `xtdb-event-logger` → `xtdb-projector` where `__piLastEvent` is set on globalThis.

**Note:** Extension load order is alphabetical. `project-registry` sorts before `xtdb-event-logger` and `xtdb-projector`, so `__piCurrentProject` will be set by the time those extensions' `session_start` handlers fire. (Pi runs handlers per-extension in load order for each event.)

**Depends on:** 3.1, 1.3 (CurrentProject type)
**Test:** After session start, from the xtdb-projector or another extension, read `(globalThis as any).__piCurrentProject` and verify it has the expected shape.
**Effort:** S

---

### - [ ] 3.4 — Copy to extensions directory + install deps

**Files to create:**
- `~/.pi/agent/extensions/project-registry/` (full copy of `~/harness/project-registry/`)

**What to do:**

Copy the entire `~/harness/project-registry/` directory to `~/.pi/agent/extensions/project-registry/`. This matches the existing pattern — `xtdb-event-logger` and `xtdb-projector` are direct copies in `~/.pi/agent/extensions/`, not symlinks.

```bash
cp -r ~/harness/project-registry ~/.pi/agent/extensions/project-registry
cd ~/.pi/agent/extensions/project-registry && npm install
```

**Convention note:** After any change to files in `~/harness/project-registry/`, re-copy to `~/.pi/agent/extensions/project-registry/`. The harness directory is the source of truth; the extensions directory is the deployed copy.

**Depends on:** 3.1, 3.2, 3.3
**Test:** `ls ~/.pi/agent/extensions/project-registry/` shows `index.ts`, `identity.ts`, `normalize.ts`, `types.ts`, `rdf.ts`, `package.json`, `node_modules/`. Start pi — extension loads without error.
**Effort:** S

---

## Phase 4: XTDB Storage

### - [ ] 4.1 — Project record INSERT (with JSON-LD + read-then-merge)

**Files to modify:**
- `~/harness/project-registry/index.ts` (replace stub from 3.1)

**What to do:**

Inside the `session_start` handler, after resolving identity:

**Read existing project:**
```typescript
const db = getSql();
const t = (v: string | null) => db.typed(v as any, 25);
const n = (v: number | null) => db.typed(v as any, 20);
const b = (v: boolean | null) => db.typed(v as any, 16);

const existing = await db`SELECT * FROM projects WHERE _id = ${t(projectId)}`;
const isFirstSession = existing.length === 0;
const now = Date.now();
```

**Merge + write project:**
```typescript
const sessionCount = isFirstSession ? 1 : (Number(existing[0].session_count) + 1);
const firstSeenTs = isFirstSession ? now : Number(existing[0].first_seen_ts);

const projectRecord: ProjectRecord = {
  _id: projectId,
  canonical_id: identity.canonicalId,
  name: identity.name,
  identity_type: identity.identityType,
  git_remote_url: identity.gitRemoteUrl,
  git_root_path: identity.gitRootPath,
  first_seen_ts: firstSeenTs,
  last_seen_ts: now,
  session_count: sessionCount,
  jsonld: JSON.stringify(buildProjectJsonLd(/* ... */)),
};

await db`INSERT INTO projects (
  _id, canonical_id, name, identity_type,
  git_remote_url, git_root_path,
  first_seen_ts, last_seen_ts, session_count, jsonld
) VALUES (
  ${t(projectRecord._id)}, ${t(projectRecord.canonical_id)},
  ${t(projectRecord.name)}, ${t(projectRecord.identity_type)},
  ${t(projectRecord.git_remote_url)}, ${t(projectRecord.git_root_path)},
  ${n(projectRecord.first_seen_ts)}, ${n(projectRecord.last_seen_ts)},
  ${n(projectRecord.session_count)}, ${t(projectRecord.jsonld)}
)`;
```

XTDB v2 PUT semantics: writing the same `_id` overwrites the previous document. This is the read-then-merge pattern — we read the existing record to preserve `first_seen_ts` and increment `session_count`.

**Depends on:** 3.1, 1.2 (buildProjectJsonLd), 1.3 (ProjectRecord type)
**Test:** Start pi in `~/harness`. Query XTDB: `SELECT * FROM projects`. Verify one row with `canonical_id` starting with `git:`. Start pi again → same `_id`, `session_count` incremented, `last_seen_ts` updated.
**Effort:** M

---

### - [ ] 4.2 — Session-project link INSERT

**Files to modify:**
- `~/harness/project-registry/index.ts` (add after 4.1 project write)

**What to do:**

After writing the project record, write the session-project link:

```typescript
const spId = `sp:${crypto.randomUUID()}`;

const spRecord: SessionProjectRecord = {
  _id: spId,
  session_id: sessionId,
  project_id: projectId,
  canonical_id: identity.canonicalId,
  cwd,
  git_root_path: identity.gitRootPath,
  ts: now,
  is_first_session: isFirstSession,
  jsonld: JSON.stringify(buildSessionProjectJsonLd(/* ... */)),
};

await db`INSERT INTO session_projects (
  _id, session_id, project_id, canonical_id,
  cwd, git_root_path, ts, is_first_session, jsonld
) VALUES (
  ${t(spRecord._id)}, ${t(spRecord.session_id)},
  ${t(spRecord.project_id)}, ${t(spRecord.canonical_id)},
  ${t(spRecord.cwd)}, ${t(spRecord.git_root_path)},
  ${n(spRecord.ts)}, ${b(spRecord.is_first_session)}, ${t(spRecord.jsonld)}
)`;
```

Every session creates a new `session_projects` row (unique `_id` via UUID). This is always an INSERT, never an update.

**Depends on:** 4.1, 1.2 (buildSessionProjectJsonLd)
**Test:** Start two pi sessions in the same repo. Query `SELECT * FROM session_projects WHERE project_id = '<id>'`. Verify two rows with different `session_id` values. First row has `is_first_session = true`, second has `false`.
**Effort:** S

---

### - [ ] 4.3 — Re-copy to extensions directory

**Files to update:**
- `~/.pi/agent/extensions/project-registry/` (re-copy from `~/harness/project-registry/`)

**What to do:**

After all Phase 3+4 changes:
```bash
rm -rf ~/.pi/agent/extensions/project-registry
cp -r ~/harness/project-registry ~/.pi/agent/extensions/project-registry
cd ~/.pi/agent/extensions/project-registry && npm install
```

**Depends on:** 4.1, 4.2
**Test:** Start pi, verify both `projects` and `session_projects` rows appear in XTDB.
**Effort:** S

---

## Phase 5: DB Queries & API

### - [ ] 5.1 — Query functions in db.ts

**Files to modify:**
- `~/harness/xtdb-event-logger-ui/lib/db.ts`
- `~/.pi/agent/extensions/xtdb-event-logger-ui/lib/db.ts` (copy after edit)

**What to do:**

Add these types and functions. Follow the existing pattern in db.ts: simple XTDB SQL queries, assemble/join in JS where needed.

**Types:**
```typescript
export interface ProjectSummary {
  projectId: string;
  canonicalId: string;
  name: string;
  identityType: string;
  sessionCount: number;
  firstSeenTs: number;
  lastSeenTs: number;
}

export interface ProjectRecord extends ProjectSummary {
  gitRemoteUrl: string | null;
  gitRootPath: string | null;
}

export interface SessionWithProject extends SessionSummary {
  projectId: string | null;
  projectName: string | null;
  canonicalId: string | null;
}
```

**Functions:**

1. `getProjects(): Promise<ProjectSummary[]>`
   — `SELECT * FROM projects ORDER BY last_seen_ts DESC`
   — Map XTDB snake_case columns to camelCase ProjectSummary

2. `getProject(id: string): Promise<ProjectRecord | null>`
   — `SELECT * FROM projects WHERE _id = <id>`

3. `getProjectSessions(projectId: string): Promise<SessionSummary[]>`
   — `SELECT * FROM session_projects WHERE project_id = <id> ORDER BY ts DESC`
   — For each session_id, call existing `getSessionList()` logic or query session aggregates
   — XTDB SQL is limited, so: get session_ids from session_projects, then query events table grouped by those session_ids, assemble in JS (same pattern as existing `getSessionList`)

4. `getSessionProject(sessionId: string): Promise<ProjectRecord | null>`
   — `SELECT * FROM session_projects WHERE session_id = <id>`
   — If found, `SELECT * FROM projects WHERE _id = <project_id>`

5. `getSessionsGroupedByProject(): Promise<Map<string, { project: ProjectSummary | null; sessions: SessionSummary[] }>>`
   — Calls `getSessionList()` and `getProjects()` and all `session_projects`
   — Groups sessions under their project; sessions without a project link go under `null` key
   — Returns a Map keyed by projectId (or "unlinked")

**Depends on:** 4.2 (data must exist in XTDB to test against)
**Test:** Start the UI server (`npx tsx xtdb-event-logger-ui/server.ts`). Hit `/api/projects` — returns array. Hit `/api/projects/<known-id>` — returns single project. Verify `getSessionsGroupedByProject` groups correctly.
**Effort:** M

---

### - [ ] 5.2 — API endpoints in server.ts

**Files to modify:**
- `~/harness/xtdb-event-logger-ui/server.ts`
- `~/.pi/agent/extensions/xtdb-event-logger-ui/server.ts` (copy after edit)

**What to do:**

Add imports for new db functions at the top. Add these routes (insert after the existing `/api/sessions` routes):

```typescript
// ── Project API ────────────────────────────────────────────────

app.get("/api/projects", async (c) => {
  const projects = await getProjects();
  return c.json(projects);
});

app.get("/api/projects/:id", async (c) => {
  const id = c.req.param("id");
  const project = await getProject(id);
  if (!project) return c.json({ error: "Not found" }, 404);
  return c.json(project);
});

app.get("/api/projects/:id/sessions", async (c) => {
  const id = c.req.param("id");
  const sessions = await getProjectSessions(id);
  return c.json(sessions);
});
```

Add HTML page routes (insert before the catch-all or after existing HTML routes):

```typescript
app.get("/projects", async (c) => {
  const projects = await getProjects();
  return c.html(renderProjects(projects));
});

app.get("/projects/:id", async (c) => {
  const id = c.req.param("id");
  const project = await getProject(id);
  if (!project) return c.html("<h1>Project not found</h1>", 404);
  const sessions = await getProjectSessions(id);
  return c.html(renderProjectDetail(project, sessions));
});
```

Add imports for `renderProjects` and `renderProjectDetail` from new page files (Phase 6).

**Depends on:** 5.1
**Test:** `curl http://localhost:3333/api/projects | jq .` returns project list. `curl http://localhost:3333/api/projects/proj:xxxxx | jq .` returns single project or 404.
**Effort:** S

---

### - [ ] 5.3 — Update sessions API to include project info

**Files to modify:**
- `~/harness/xtdb-event-logger-ui/server.ts` (modify existing `/sessions` route)

**What to do:**

Change the existing `GET /sessions` HTML route to use grouped data:

```typescript
// BEFORE:
app.get("/sessions", async (c) => {
  const sessions = await getSessionList();
  return c.html(renderSessions(sessions));
});

// AFTER:
app.get("/sessions", async (c) => {
  const grouped = await getSessionsGroupedByProject();
  return c.html(renderSessions(grouped));
});
```

Also update `GET /sessions/:id` to pass project info to `renderSessionDetail`:

```typescript
// Add project lookup:
const project = await getSessionProject(id);
return c.html(renderSessionDetail(id, events, project));
```

**Depends on:** 5.1, 5.2
**Test:** Visit `http://localhost:3333/sessions` — sessions are grouped by project. Visit a session detail — project badge appears in header.
**Effort:** S

---

## Phase 6: UI Pages

### - [ ] 6.1 — Project list page (`/projects`)

**Files to create:**
- `~/harness/xtdb-event-logger-ui/pages/projects.ts`

**What to do:**

Create `renderProjects(projects: ProjectSummary[]): string`.

Returns full HTML page. Structure matches the existing sessions page pattern (cards in a grid).

Each project card shows:
- 📁 icon + project name (large)
- Identity type badge: 🌐 `git-remote` | 💻 `git-local` | 📂 `path`
- Canonical ID (monospaced, smaller)
- Session count
- "First seen" + "Last active" relative timestamps
- Links to `/projects/<id>`

Page header includes nav links: `← Stream · Sessions · 📁 Projects · 📊 Dashboard`

Use `esc()` helper for all user-provided strings (same as sessions.ts). Use `relativeTime()` from `lib/format.ts` for timestamps.

**Depends on:** 5.2 (routes must exist)
**Test:** Visit `http://localhost:3333/projects` — renders project cards. Click a card → navigates to project detail.
**Effort:** S

---

### - [ ] 6.2 — Project detail page (`/projects/:id`)

**Files to create:**
- `~/harness/xtdb-event-logger-ui/pages/project-detail.ts`

**What to do:**

Create `renderProjectDetail(project: ProjectRecord, sessions: SessionSummary[]): string`.

Returns full HTML page. Layout:

**Header section:**
- 📁 Project name (h1)
- Identity type badge
- Canonical ID
- Git remote URL (if applicable, clickable link for github/gitlab)
- Git root path
- First seen / last seen timestamps
- Session count

**Sessions section:**
- Reuse the session card HTML from `sessions.ts` (extract the card rendering into a shared helper, or duplicate for now — mark as refactor candidate)
- Each session card: name, event count, duration, last event, health badge
- Sorted by most recent first

Nav: `← Projects · Sessions · 📊 Dashboard`

**Depends on:** 5.2 (routes), 5.1 (getProjectSessions)
**Test:** Visit `http://localhost:3333/projects/<known-id>` — shows project metadata + list of linked sessions.
**Effort:** S

---

### - [ ] 6.3 — Sessions page — group by project

**Files to modify:**
- `~/harness/xtdb-event-logger-ui/pages/sessions.ts`

**What to do:**

Change `renderSessions` signature to accept grouped data:

```typescript
export function renderSessions(
  grouped: Map<string, { project: ProjectSummary | null; sessions: SessionSummary[] }>
): string
```

Render each group as:
- **Project header:** 📁 name + link to `/projects/<id>` + session count badge
- **Session cards** beneath (same card HTML as before)
- **"Unlinked Sessions"** group at the bottom for sessions without project links (historical sessions from before the registry existed)

If there's only one project (or zero), skip the grouping and render flat (avoid unnecessary visual complexity for single-project users).

**Depends on:** 5.3, 6.1
**Test:** Visit `/sessions` with multiple projects in XTDB — sessions grouped under project headers. Historical sessions without links appear in "Unlinked" section.
**Effort:** M

---

### - [ ] 6.4 — Session detail — project badge

**Files to modify:**
- `~/harness/xtdb-event-logger-ui/pages/session-detail.ts`

**What to do:**

Change `renderSessionDetail` signature to accept optional project:

```typescript
export function renderSessionDetail(
  sessionId: string,
  events: EventRow[],
  project?: ProjectRecord | null
): string
```

In the `<header>` section, after the session name, add a project badge:

```html
<!-- If project is linked -->
<a href="/projects/proj:xxxxx" class="project-badge">
  📁 harness
</a>
```

Add CSS for `.project-badge` in `static/style.css`:
- Rounded pill shape, subtle background color
- Sits inline with the session name in the header

**Depends on:** 5.3, 5.1 (getSessionProject)
**Test:** Visit a session detail page — project badge appears, links to project detail.
**Effort:** S

---

### - [ ] 6.5 — Nav links across all pages

**Files to modify:**
- `~/harness/xtdb-event-logger-ui/pages/sessions.ts` (already has nav)
- `~/harness/xtdb-event-logger-ui/pages/session-detail.ts` (already has nav)
- `~/harness/xtdb-event-logger-ui/pages/index.ts` (stream page)
- `~/harness/xtdb-event-logger-ui/pages/dashboard.ts`
- `~/harness/xtdb-event-logger-ui/pages/flow.ts`
- `~/harness/xtdb-event-logger-ui/pages/knowledge.ts`

**What to do:**

Add a "Projects" link to the nav bar on every page. Current nav pattern:

```html
<a href="/" class="back-link">← Stream</a>
<span class="header-sep">·</span>
<a href="/sessions" class="back-link">Sessions</a>
<span class="header-sep">·</span>
<a href="/projects" class="back-link">📁 Projects</a>
<span class="header-sep">·</span>
<a href="/dashboard" class="back-link">📊 Dashboard</a>
```

Each page currently has its own header with slightly different nav. Standardize: all pages get all four nav links. The current page's link is bold/non-clickable.

**Depends on:** 6.1 (projects page must exist)
**Test:** Visit each page — "Projects" link appears in nav. Click it → navigates to `/projects`.
**Effort:** S

---

## Phase 7: Testing & Verification

### - [ ] 7.1 — Unit tests for identity resolution + URL normalizer

**Files to create:**
- `~/harness/test/project-registry/normalize.test.ts`
- `~/harness/test/project-registry/identity.test.ts`

**What to do:**

**`normalize.test.ts`** — test `normalizeGitUrl()`:
```typescript
// Test all cases from plan §2:
assert(normalizeGitUrl("git@github.com:user/repo.git") === "github.com/user/repo");
assert(normalizeGitUrl("https://github.com/user/repo.git") === "github.com/user/repo");
assert(normalizeGitUrl("ssh://git@github.com/user/repo.git") === "github.com/user/repo");
assert(normalizeGitUrl("https://github.com/user/repo") === "github.com/user/repo");
assert(normalizeGitUrl("git@gitlab.com:org/sub/repo.git") === "gitlab.com/org/sub/repo");

// Edge cases:
assert(normalizeGitUrl("https://GITHUB.COM/User/Repo.git") === "github.com/User/Repo"); // host lowercase, path preserved
assert(normalizeGitUrl("git://github.com/user/repo.git") === "github.com/user/repo");
assert(normalizeGitUrl("https://github.com/user/repo/") === "github.com/user/repo"); // trailing slash
```

**`identity.test.ts`** — test `resolveProject()` with mock exec:
```typescript
// Mock exec that simulates git commands
function mockExec(responses: Record<string, { stdout: string } | Error>) {
  return async (cmd: string, args: string[]) => {
    const key = `${cmd} ${args.join(" ")}`;
    // Match against expected git commands
    const match = Object.entries(responses).find(([k]) => key.includes(k));
    if (match && match[1] instanceof Error) throw match[1];
    if (match) return match[1] as { stdout: string };
    throw new Error(`Unexpected command: ${key}`);
  };
}

// Test path 1: git-remote
// Test path 2: git-local (no origin, has commits)
// Test path 3: git repo, no commits
// Test path 4: not a git repo

// Test generateProjectId determinism
```

Use `node:test` + `node:assert` (matches existing test infrastructure in `~/harness/test/`).

**Depends on:** 2.1, 2.2, 2.3
**Test:** `npx tsx --test test/project-registry/normalize.test.ts && npx tsx --test test/project-registry/identity.test.ts` — all pass.
**Effort:** M

---

### - [ ] 7.2 — Seed test data for projects

**Files to create:**
- `~/harness/test/project-registry/seed.ts`

**What to do:**

Script that inserts sample project + session_project data directly into XTDB for UI testing. Creates 3 projects with varying identity types:

1. `git-remote` project (github.com/opunix/harness)
2. `git-local` project (first-commit hash)
3. `path` project (/tmp/scratch)

Each with 2-3 fake session_projects links.

Run with: `npx tsx test/project-registry/seed.ts`

Include a `--wipe` flag that does `ERASE FROM projects WHERE _id IS NOT NULL` + `ERASE FROM session_projects WHERE _id IS NOT NULL` before seeding.

**Depends on:** 4.1, 4.2 (table shapes must be finalized)
**Test:** After running seed, `curl http://localhost:3333/api/projects` returns 3 projects.
**Effort:** S

---

### - [ ] 7.3 — Integration test: start pi, verify project record

**What to do:**

Manual verification checklist (not automated — pi session is interactive):

1. `cd ~/harness && pi` — start pi session
2. Check XTDB: `psql -h localhost -p 5433 -U xtdb -d xtdb -c "SELECT _id, name, identity_type, session_count FROM projects"`
   - Expect: one row, name = "harness", identity_type = "git-remote"
3. Check session link: `SELECT * FROM session_projects ORDER BY ts DESC LIMIT 1`
   - Expect: `project_id` matches the projects row, `is_first_session` = true (first time) or false (subsequent)
4. Check UI status bar shows `📁 harness`
5. Check globalThis: in the pi session, the agent can see project context

6. `cd /tmp && mkdir test-no-git && cd test-no-git && pi` — non-git directory
7. Check XTDB: new project row with `identity_type = "path"`, `name = "test-no-git"`

8. Restart pi in `~/harness` — verify `session_count` incremented, `last_seen_ts` updated, `first_seen_ts` unchanged.

**Depends on:** 4.3 (extension deployed)
**Test:** All 8 checks pass.
**Effort:** S

---

### - [ ] 7.4 — UI smoke tests

**What to do:**

Manual verification checklist for all UI pages:

1. `http://localhost:3333/projects` — project list renders, cards show correct data
2. `http://localhost:3333/projects/<id>` — project detail renders, linked sessions listed
3. `http://localhost:3333/sessions` — sessions grouped by project (or flat if single project)
4. `http://localhost:3333/sessions/<id>` — project badge in header, links to project detail
5. Nav links work on all pages — "Projects" link present everywhere
6. Edge case: session from before registry exists → appears in "Unlinked" group on sessions page
7. JSON-LD column: `SELECT jsonld FROM projects LIMIT 1` — valid JSON-LD with `@context`, `@type: doap:Project`

**Depends on:** 6.1–6.5 (all UI pages)
**Test:** All 7 checks pass.
**Effort:** S

---

## Re-copy Checklist

After all phases complete, do a final copy of all modified files:

```bash
# Extension
rm -rf ~/.pi/agent/extensions/project-registry
cp -r ~/harness/project-registry ~/.pi/agent/extensions/project-registry
cd ~/.pi/agent/extensions/project-registry && npm install

# Event logger (namespaces.ts changed)
cp ~/harness/xtdb-event-logger/rdf/namespaces.ts ~/.pi/agent/extensions/xtdb-event-logger/rdf/namespaces.ts

# UI (db.ts, server.ts, pages/* changed)
cp ~/harness/xtdb-event-logger-ui/lib/db.ts ~/.pi/agent/extensions/xtdb-event-logger-ui/lib/db.ts
cp ~/harness/xtdb-event-logger-ui/server.ts ~/.pi/agent/extensions/xtdb-event-logger-ui/server.ts
cp ~/harness/xtdb-event-logger-ui/pages/*.ts ~/.pi/agent/extensions/xtdb-event-logger-ui/pages/
```

---

## Dependency Graph

```
1.1 ──▶ 1.2 ──▶ 4.1
1.3 ──────────▶ 3.1
2.1 ──▶ 2.2 ──▶ 3.1
2.3 ──────────▶ 3.1
        3.1 ──▶ 3.2
        3.1 ──▶ 3.3
        3.1 ──▶ 3.4
        3.1 ──▶ 4.1 ──▶ 4.2 ──▶ 4.3
                              ──▶ 5.1 ──▶ 5.2 ──▶ 5.3
                                    5.1 ──▶ 6.1
                                    5.1 ──▶ 6.2
                                    5.3 ──▶ 6.3
                                    5.1 ──▶ 6.4
                                    6.1 ──▶ 6.5
2.1 + 2.2 + 2.3 ──▶ 7.1
4.1 + 4.2 ──────────▶ 7.2
4.3 ────────────────▶ 7.3
6.1–6.5 ────────────▶ 7.4
```

## Estimated Total Effort

| Phase | Steps | Effort |
|---|---|---|
| 1. JSON-LD Foundation | 1.1–1.3 | 3× S = ~1 hr |
| 2. Identity Resolution | 2.1–2.3 | 3× S = ~1 hr |
| 3. Extension Core | 3.1–3.4 | 1M + 3S = ~1.5 hr |
| 4. XTDB Storage | 4.1–4.3 | 1M + 2S = ~1 hr |
| 5. DB Queries & API | 5.1–5.3 | 1M + 2S = ~1 hr |
| 6. UI Pages | 6.1–6.5 | 1M + 4S = ~2 hr |
| 7. Testing | 7.1–7.4 | 1M + 3S = ~1.5 hr |
| **Total** | **24 steps** | **~9 hr** |
