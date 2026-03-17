# Project Registry — V1 Plan

## Goal

Give the harness stable cross-session project identity so it can answer: "What project is this session working on?", "Have I seen this project before?", and "Is this the first session for this project?"

---

## 1. V1 Scope

Build the minimum needed to link sessions to projects:

| In scope | Out of scope (V2+) |
|---|---|
| Resolve project identity from `cwd` at session start | Cross-machine identity merging |
| `projects` table in XTDB | Project-level settings or preferences |
| `session_projects` linking table in XTDB | Team/org project sharing |
| Detect first-session-ever for a project | Manifest-based identity (package.json hash) |
| Publish project info via `globalThis` for other extensions | Project renaming / alias management |
| UI: group sessions by project on `/sessions` page | Project-scoped dashboards or analytics |
| API: list projects, get project detail | Historical backfill of existing sessions |
| Human-readable name derived from repo/directory | User-editable project names |

---

## 2. Project Identity Resolution

### Algorithm

Run on every `session_start`. Input: `cwd` (from `ctx.cwd`).

```
resolveProject(cwd):
  1. IS GIT REPO?
     Run: git -C <cwd> rev-parse --show-toplevel
     If fails → goto step 5 (non-git fallback)

  2. GET GIT ROOT
     gitRoot = result of step 1 (e.g. /Users/opunix/harness)
     This handles subdirectories: cwd=/Users/opunix/harness/src → gitRoot=/Users/opunix/harness

  3. GET REMOTE URL (prefer origin)
     Run: git -C <gitRoot> remote get-url origin
     If succeeds → normalize URL → canonical_id = "git:" + normalized
     If fails (no origin) → goto step 4

  4. NO REMOTE FALLBACK (git repo, no remote)
     Run: git -C <gitRoot> rev-list --max-parents=0 HEAD
     If succeeds → canonical_id = "git-local:" + firstCommitHash
     If fails (no commits yet) → canonical_id = "path:" + gitRoot

  5. NON-GIT FALLBACK
     canonical_id = "path:" + absolutePath(cwd)
```

### URL Normalization

Normalize git remote URLs to a stable canonical form:

```
Input                                      → Output
git@github.com:user/repo.git              → github.com/user/repo
https://github.com/user/repo.git          → github.com/user/repo
ssh://git@github.com/user/repo.git        → github.com/user/repo
https://github.com/user/repo              → github.com/user/repo
git@gitlab.com:org/sub/repo.git           → gitlab.com/org/sub/repo
```

Rules:
1. Strip protocol prefix (`https://`, `ssh://`, `git://`, `git@` with `:` → `/`)
2. Strip `.git` suffix
3. Strip trailing slashes
4. Strip `git@` userinfo
5. Lowercase the host portion

### Human-Readable Name

Derived automatically, not user-configurable in V1:

| Identity type | Name derivation |
|---|---|
| `git:github.com/user/repo` | `repo` (last path segment) |
| `git-local:<hash>` | basename of git root directory |
| `path:/abs/path` | basename of path |

### Answers to Identity Questions

1. **Multiple remotes?** V1 uses `origin` only. If no `origin`, falls back to first-commit hash. V2 could scan all remotes.
2. **No remote?** First-commit hash gives stable identity that survives adding a remote later. No commits → path fallback.
3. **Subdirectories?** `git rev-parse --show-toplevel` resolves to repo root. Same project regardless of where you `cd` within it.
4. **Same project, different paths?** If both clones have the same `origin` remote URL, they resolve to the same `canonical_id`. That's the whole point.
5. **Human-readable names?** Auto-derived from repo name. No user editing in V1.

---

## 3. XTDB Schema

### Table: `projects`

```sql
-- XTDB is schema-on-write; this documents the shape, not DDL to execute.
-- _id is the XTDB document ID (required, unique).

INSERT INTO projects (_id, canonical_id, name, identity_type, git_remote_url, git_root_path, first_seen_ts, last_seen_ts, session_count)
VALUES (
  'proj:<sha256(canonical_id)>',   -- _id: deterministic from canonical_id, 12-char hex prefix
  'git:github.com/user/repo',      -- canonical_id: the full resolved identity string
  'repo',                           -- name: human-readable, auto-derived
  'git-remote',                     -- identity_type: 'git-remote' | 'git-local' | 'path'
  'git@github.com:user/repo.git',  -- git_remote_url: raw origin URL (null for non-git)
  '/Users/opunix/repo',            -- git_root_path: absolute path on this machine (informational)
  1710000000000,                    -- first_seen_ts: epoch ms of first session
  1710100000000,                    -- last_seen_ts: epoch ms of most recent session
  5                                 -- session_count: total sessions linked to this project
);
```

**`_id` generation:** `"proj:" + sha256(canonical_id).slice(0, 12)`. Deterministic so repeated UPSERTs for the same project hit the same row.

**Why not use `canonical_id` as `_id` directly?** XTDB `_id` values appear in URLs and logs. A hashed prefix is shorter and avoids special characters in git URLs.

### Table: `session_projects`

```sql
INSERT INTO session_projects (_id, session_id, project_id, canonical_id, cwd, git_root_path, ts, is_first_session)
VALUES (
  'sp:<uuid>',                          -- _id: unique per session-project link
  '/path/to/.pi/sessions/abc.json',     -- session_id: from ctx.sessionManager.getSessionFile()
  'proj:a1b2c3d4e5f6',                  -- project_id: FK to projects._id
  'git:github.com/user/repo',           -- canonical_id: denormalized for easy querying
  '/Users/opunix/repo/src',             -- cwd: the actual working directory (may be subdirectory)
  '/Users/opunix/repo',                 -- git_root_path: resolved root (null for non-git)
  1710050000000,                        -- ts: when this session started
  false                                 -- is_first_session: true only for the very first session
);
```

---

## 4. Extension Design

### New extension: `project-registry`

**Location:** `~/.pi/agent/extensions/project-registry/index.ts`

**File structure:**
```
project-registry/
├── index.ts          # Extension entry. Hooks session_start, wires identity → XTDB.
├── identity.ts       # Pure function: resolveProject(cwd, execFn) → ProjectIdentity
├── normalize.ts      # Pure function: normalizeGitUrl(raw) → canonical string
├── types.ts          # ProjectIdentity, ProjectRecord, SessionProjectRecord
└── package.json      # deps: postgres
```

### Event hooks

**Only one hook: `session_start`**

Why not `session_directory`?
- `session_directory` fires with NO ctx (see `NO_CTX` set in event-logger). No `sessionId` available.
- We need `sessionId` to create the session-project link.
- `session_start` provides both `ctx.cwd` and `ctx.sessionManager.getSessionFile()`.

**Why not also hook `session_directory`?**
- V1 simplicity. One hook is enough. The session hasn't started yet at `session_directory` time.
- V2 could use `session_directory` for pre-loading project context before the agent starts.

### Logic on `session_start`

```
on session_start:
  1. cwd = ctx.cwd ?? process.cwd()
  2. sessionId = ctx.sessionManager.getSessionFile()
  3. identity = await resolveProject(cwd, pi.exec)    // runs git commands
  4. projectId = "proj:" + sha256(identity.canonicalId).slice(0, 12)

  5. existingProject = await SELECT * FROM projects WHERE _id = projectId
  6. isFirstSession = (existingProject === null)

  7. UPSERT project record:
     INSERT INTO projects (...) VALUES (...)
     ON CONFLICT (_id) → update last_seen_ts, session_count, git_root_path

     NOTE: XTDB v2 doesn't support ON CONFLICT / UPSERT.
     Use: INSERT INTO projects ... (always). XTDB PUT semantics =
     writing the same _id overwrites the previous version.
     So: read existing → merge → write.

  8. INSERT session_projects link (always a new row, unique _id per session)

  9. Publish to globalThis for other extensions:
     (globalThis as any).__piCurrentProject = {
       projectId, canonicalId, name, isFirstSession, identityType
     }

  10. UI status: ctx.ui.setStatus("project", "📁 <name>")
```

### Cross-extension communication

Following the established pattern from `xtdb-event-logger` → `xtdb-projector`:

```typescript
// project-registry writes:
(globalThis as any).__piCurrentProject = {
  projectId: "proj:a1b2c3d4e5f6",
  canonicalId: "git:github.com/user/repo",
  name: "repo",
  isFirstSession: false,
  identityType: "git-remote",
};

// Other extensions read:
const project = (globalThis as any).__piCurrentProject;
```

This lets the projector (or future extensions) tag their output with `project_id` without any coupling.

### Extension load order

Extensions load alphabetically. Current relevant order:
```
... (other extensions)
project-registry          ← NEW (runs on session_start)
... (other extensions)
xtdb-event-logger         ← captures events (session_start included)
xtdb-projector            ← projects events into semantic rows
```

`project-registry` comes before `xtdb-event-logger` alphabetically, which is fine — both independently hook `session_start`. The project-registry just needs to complete its async work (git commands + DB write) during the session_start handler. The pi runtime runs extension hooks sequentially per event.

### Error handling

- Git command failures → fall through to next identity strategy (remote → local-hash → path)
- XTDB write failures → `console.error`, do NOT crash the session
- No git, no path (impossible in practice) → skip silently, no project record

---

## 5. Session Linking

### How sessions get tagged

The `session_projects` table is the join table. It is written once per session at `session_start` time.

### Querying "all sessions for a project"

```sql
SELECT sp.session_id, sp.cwd, sp.ts, sp.is_first_session
FROM session_projects sp
WHERE sp.project_id = 'proj:a1b2c3d4e5f6'
ORDER BY sp.ts DESC
```

### Querying "what project is this session in?"

```sql
SELECT sp.project_id, sp.canonical_id, p.name
FROM session_projects sp, projects p
WHERE sp.session_id = '<session_id>'
  AND sp.project_id = p._id
```

Note: XTDB v2 SQL supports basic JOINs. If JOIN doesn't work, do two queries and join in JS (same pattern as `db.ts` already uses throughout).

### Querying "is this a new project?"

Already captured as `is_first_session` boolean on `session_projects`. Also derivable from `projects.session_count = 1`.

---

## 6. UI Integration

### Sessions page (`/sessions`) — group by project

Current: flat list of session cards sorted by recency.

Change: group sessions under project headers.

```
┌─────────────────────────────────────────┐
│  📁 harness  (git:github.com/.../harness)   │
│  ├── Session abc — 2min ago, 85 events  │
│  ├── Session def — 1hr ago, 120 events  │
│  └── Session ghi — yesterday, 45 events │
│                                         │
│  📁 my-app  (git:github.com/.../my-app)    │
│  ├── Session jkl — 3hr ago, 200 events  │
│  └── Session mno — 2 days ago, 30 events│
│                                         │
│  📁 /tmp/scratch  (no git)              │
│  └── Session pqr — 5min ago, 12 events  │
└─────────────────────────────────────────┘
```

**Implementation:** 
- `lib/db.ts`: add `getSessionsWithProjects()` — query `session_projects` + `projects`, group in JS
- `pages/sessions.ts`: `renderSessions()` takes grouped data, renders project headers + nested session cards
- Sessions without a project link (historical, pre-registry) render in an "Unlinked" group at the bottom

### Session detail page (`/sessions/:id`) — show project badge

Add a project name badge in the session header. Links to the project page.

### New page: Project detail (`/projects/:id`)

- Project name, canonical ID, identity type
- First seen / last seen timestamps
- Total session count
- List of all sessions (reuse session card component)

### New page: Project list (`/projects`)

- All known projects, sorted by last_seen_ts DESC
- Each card: name, identity type, session count, last active

---

## 7. API

### New endpoints in `server.ts`

| Method | Route | Response | Description |
|---|---|---|---|
| `GET` | `/api/projects` | `ProjectSummary[]` | All projects, sorted by last_seen DESC |
| `GET` | `/api/projects/:id` | `ProjectDetail` | Single project with metadata |
| `GET` | `/api/projects/:id/sessions` | `SessionSummary[]` | All sessions linked to this project |
| `GET` | `/projects` | HTML | Project list page |
| `GET` | `/projects/:id` | HTML | Project detail page |

### New queries in `lib/db.ts`

```typescript
// List all projects
async function getProjects(): Promise<ProjectSummary[]>
// SELECT * FROM projects ORDER BY last_seen_ts DESC

// Get single project
async function getProject(id: string): Promise<ProjectRecord | null>
// SELECT * FROM projects WHERE _id = <id>

// Get sessions for a project
async function getProjectSessions(projectId: string): Promise<SessionSummary[]>
// SELECT * FROM session_projects WHERE project_id = <id> ORDER BY ts DESC
// Then join with existing session aggregation logic

// Get project for a session (used by session detail page)
async function getSessionProject(sessionId: string): Promise<ProjectRecord | null>
// SELECT * FROM session_projects WHERE session_id = <id>
// Then SELECT * FROM projects WHERE _id = <project_id>
```

### Types in `lib/db.ts`

```typescript
interface ProjectSummary {
  projectId: string;       // _id
  canonicalId: string;
  name: string;
  identityType: string;    // 'git-remote' | 'git-local' | 'path'
  sessionCount: number;
  firstSeenTs: number;
  lastSeenTs: number;
}

interface ProjectRecord extends ProjectSummary {
  gitRemoteUrl: string | null;
  gitRootPath: string | null;
}
```

---

## 8. What V1 Does NOT Cover

| Deferred item | Why deferred | When to revisit |
|---|---|---|
| **Backfill existing sessions** | Requires re-scanning `events.cwd` for all historical sessions. Complex, not blocking. | V2, after V1 is stable |
| **Cross-machine merging** | Same project on two machines has same `canonical_id` via git remote URL, so identity already works. Display merging needs thought. | V2 |
| **User-editable project names** | Auto-derived names are good enough for V1. | When users complain |
| **Project settings/preferences** | No use case yet. | When we need per-project config |
| **Non-origin remotes** | Repos with `upstream` but no `origin`. Rare for personal use. | V2, scan all remotes |
| **Monorepo sub-projects** | A monorepo is one project in V1. Sub-project detection needs heuristics. | V2, if needed |
| **`session_directory` pre-hook** | Could pre-resolve project before session starts. No sessionId available. | V2, for project-aware system prompts |
| **Project-scoped analytics** | Dashboard filtered by project. | After V1 UI works |
| **Manifest-based identity** | Using package.json/Cargo.toml for non-git dirs. Over-engineered for V1. | If non-git projects matter |
| **`target_exists` detection** | The change-management proposal wanted "does the target already exist?" checks. Needs the registry to know which files existed before a session. | Proposal B (artifact store) |
| **Projector integration** | Tag projections (AgentTaskRequested, etc.) with `project_id`. | V2, after globalThis contract is proven |

---

## 9. Open Questions

1. **XTDB UPSERT semantics:** XTDB v2 uses PUT-based semantics where writing the same `_id` replaces the document. Confirm that `INSERT INTO projects` with an existing `_id` acts as an upsert (overwrites), not a conflict error. If it errors, we need read-then-write.

2. **Extension execution order:** Pi runs `session_start` handlers across extensions — are they sequential or concurrent? If concurrent, `globalThis.__piCurrentProject` may not be set before other extensions read it. Need to verify. (The event-logger → projector pattern uses `globalThis.__piLastEvent` which works because it's set synchronously in the same event handler call.)

3. **`pi.exec` availability:** The `git-checkpoint` extension uses `pi.exec("git", [...])`. Confirm this is available during `session_start` handler (not just during turn execution). If not, fall back to `child_process.execSync`.

4. **Session ID stability:** Is `ctx.sessionManager.getSessionFile()` the same string across session switches (`/fork`, `/switch`)? If a session forks, does the forked session get a new session ID? Affects whether we need to re-register on `session_fork`.

5. **SHA-256 availability:** Need `crypto.createHash('sha256')` for deterministic `_id` generation. Node.js built-in `crypto` module should work. Alternatively, use a simpler hash or just URL-encode the `canonical_id` directly.

---

## 10. Step-by-Step Implementation Order

### Step 1: Identity resolution module (pure functions, no I/O)
**Files:** `project-registry/normalize.ts`, `project-registry/identity.ts`, `project-registry/types.ts`
**What:** `normalizeGitUrl(raw) → string`, `resolveProject(cwd, execFn) → ProjectIdentity`. The `execFn` parameter is injected so these are testable without git.
**Effort:** S (30 min)

### Step 2: Extension entry point with XTDB writes
**Files:** `project-registry/index.ts`, `project-registry/package.json`
**What:** Hook `session_start`. Call `resolveProject()`. Read existing project from XTDB. Write/update `projects` row. Write `session_projects` row. Set `globalThis.__piCurrentProject`. Set UI status.
**Depends on:** Step 1
**Effort:** M (1 hr)

### Step 3: Symlink into extensions directory + smoke test
**What:** `ln -s ~/harness/project-registry ~/.pi/agent/extensions/project-registry`. Start pi in a git repo. Verify `projects` and `session_projects` rows appear in XTDB via `psql`. Start pi in a non-git directory. Verify path-based fallback.
**Depends on:** Step 2
**Effort:** S (15 min)

### Step 4: DB query functions for the UI
**Files:** `xtdb-event-logger-ui/lib/db.ts`
**What:** Add `getProjects()`, `getProject(id)`, `getProjectSessions(projectId)`, `getSessionProject(sessionId)`, `getSessionsGroupedByProject()`. Add `ProjectSummary` and `ProjectRecord` types.
**Depends on:** Step 3 (needs data in XTDB to test against)
**Effort:** S (30 min)

### Step 5: API endpoints
**Files:** `xtdb-event-logger-ui/server.ts`
**What:** Add `GET /api/projects`, `GET /api/projects/:id`, `GET /api/projects/:id/sessions`. Wire to DB functions from Step 4.
**Depends on:** Step 4
**Effort:** S (20 min)

### Step 6: Sessions page — group by project
**Files:** `xtdb-event-logger-ui/pages/sessions.ts`
**What:** Change `renderSessions()` to accept grouped data. Render project headers with collapsible session lists beneath. Sessions without project links go in "Unlinked" group.
**Depends on:** Step 4
**Effort:** M (45 min)

### Step 7: Project list page
**Files:** `xtdb-event-logger-ui/pages/projects.ts`
**What:** New page. Cards for each project: name, type badge, session count, last active. Links to project detail.
**Depends on:** Step 4, Step 5
**Effort:** S (30 min)

### Step 8: Project detail page + session detail badge
**Files:** `xtdb-event-logger-ui/pages/project-detail.ts`, modify `pages/session-detail.ts`
**What:** Project detail: header with metadata + list of sessions. Session detail: add project name badge linking to project page.
**Depends on:** Step 4, Step 7
**Effort:** S (30 min)

### Step 9: Nav links + polish
**Files:** Modify nav in all page templates
**What:** Add "Projects" link to the nav bar (alongside Stream, Sessions, Dashboard). Polish styling for project grouping.
**Depends on:** Step 7
**Effort:** S (15 min)

---

### Total effort estimate: ~4.5 hours

| Steps | Category | Effort |
|---|---|---|
| 1–3 | Extension (core) | ~1.75 hr |
| 4–5 | Backend (queries + API) | ~50 min |
| 6–9 | UI (pages + nav) | ~2 hr |

### Suggested commit points

1. After Step 3: `feat: project-registry extension with identity resolution + XTDB storage`
2. After Step 5: `feat: project API endpoints and DB queries`
3. After Step 9: `feat: project-grouped sessions UI + project pages`
