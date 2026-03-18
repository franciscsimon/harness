# Proposal: Artifact Versions UI

> Add three new views to the xtdb-event-logger-ui for browsing artifact version history, content, and provenance.

## Goal

Surface `artifact_versions` data (full content, version chains, JSON-LD provenance) in the existing UI so users can browse every version of every tracked file, view diffs between versions, read rendered markdown, and follow the provenance chain across sessions.

## Context — What Exists Today

### Current `/artifacts` page
- Queries the `artifacts` table only (metadata — no content)
- Groups files by path, shows kind badge, version count (from artifacts table), content_hash
- Links to `/artifacts/history?project=X&path=Y` which shows a per-file timeline from the same `artifacts` table
- No content display, no diff, no JSON-LD panel

### Available data not yet surfaced

**`artifact_versions` table** (has full content):
```
_id            — e.g. "av:abc12345:fa3b2c1d9e01:3"
session_id     — full session ID
path           — absolute path
relative_path  — path relative to project root
version        — integer (1, 2, 3...)
content_hash   — sha256 prefix (16 chars)
content        — full file content (markdown, code, etc.)
size_bytes     — integer
operation      — "write" | "edit"
tool_call_id   — links to the tool call that created it
ts             — epoch ms
jsonld         — PROV-O Entity with wasDerivedFrom chain
```

**`artifact_reads` table** (cross-artifact derivation evidence):
```
_id, session_id, path, tool_call_id, ts
```

### Existing code patterns (must follow)

| Pattern | Convention |
|---------|-----------|
| Interfaces | `export interface XRow { ... }` in `lib/db.ts` |
| Query functions | `export async function getX(): Promise<XRow[]>` with `await _tablesReady` guard |
| SQL | Tagged template `sql\`...\`` with `t()` for text, `n()` for numbers. No complex JOINs — aggregate in JS |
| Table bootstrap | Add seed row to `ensureTables()` seeds array |
| Page renderers | `export function renderX(...): string` returning full HTML doc |
| HTML structure | `<!DOCTYPE html>` → `<header>` with nav → `<main class="dec-list">` with cards |
| CSS classes | `art-*` prefix for artifact styles. Cards use `var(--bg-card)`, `var(--border)`, `var(--radius)` |
| Routes | `app.get("/path", async (c) => { ... return c.html(renderX(...)); })` |
| Imports | server.ts imports query functions from `lib/db.ts`, renderers from `pages/*.ts` |

---

## Page 1: Enhanced Artifacts List (`/artifacts`)

### What changes

Extend the existing page. Keep everything it does now but enrich it with data from `artifact_versions`.

**Visible improvements:**
- Version count sourced from `artifact_versions` (accurate per-version count, not just artifacts table rows)
- Total content size across all versions shown per file (e.g., "3 versions · 12.4 KB")
- Each file card links to the new version detail page
- Filter bar: text input for filename search + dropdown for session filter
- Read count from `artifact_reads` shown as "📖 N reads" badge

### New in `lib/db.ts`

```typescript
export interface ArtifactVersionRow {
  _id: string;
  session_id: string;
  path: string;
  relative_path: string;
  version: number;
  content_hash: string;
  content: string;
  size_bytes: number;
  operation: string;
  tool_call_id: string;
  ts: string;
  jsonld: string;
}

// Lightweight query — omits content column for list views
export interface ArtifactVersionSummary {
  _id: string;
  session_id: string;
  path: string;
  relative_path: string;
  version: number;
  content_hash: string;
  size_bytes: number;
  operation: string;
  tool_call_id: string;
  ts: string;
}

export async function getArtifactVersionSummaries(): Promise<ArtifactVersionSummary[]>
// SQL: SELECT _id, session_id, path, relative_path, version, content_hash,
//             size_bytes, operation, tool_call_id, ts
//      FROM artifact_versions ORDER BY ts DESC
// Note: deliberately omits `content` — it can be megabytes.

export async function getArtifactReadCounts(): Promise<Record<string, number>>
// SQL: SELECT path, COUNT(*) AS cnt FROM artifact_reads GROUP BY path
// Returns: { "/abs/path/FILE.md": 5, ... }
```

### New in `pages/artifacts.ts`

Update `renderArtifacts` signature:
```typescript
export function renderArtifacts(
  artifacts: ArtifactRow[],
  projects: ProjectRow[],
  versionSummaries: ArtifactVersionSummary[],
  readCounts: Record<string, number>
): string
```

Card changes per file:
- Version count: use `versionSummaries` grouped by path instead of `artifacts` array length
- Size badge: sum `size_bytes` from all versions of that path → format as KB/MB
- Link: wrap `art-filename` in `<a href="/artifacts/versions?path=ENCODED_PATH">`
- Read badge: `<span class="art-reads">📖 ${readCounts[path] ?? 0} reads</span>`
- Filter bar HTML at top of `<main>`: text input + session `<select>` (client-side JS filtering via `data-path` and `data-session` attributes on cards)

### Route change in `server.ts`

```typescript
app.get("/artifacts", async (c) => {
  const [artifacts, projects, versionSummaries, readCounts] = await Promise.all([
    getArtifacts(), getProjects(), getArtifactVersionSummaries(), getArtifactReadCounts()
  ]);
  return c.html(renderArtifacts(artifacts, projects, versionSummaries, readCounts));
});
```

### New CSS in `static/style.css`

```css
.art-size { font-size: 11px; color: var(--text-dim); font-family: var(--mono); }
.art-reads { font-size: 11px; color: #06b6d4; margin-left: 8px; }
.art-filter-bar { display: flex; gap: 10px; margin-bottom: 12px; padding: 0 20px; }
.art-filter-bar input,
.art-filter-bar select {
  background: var(--bg-input); color: var(--text); border: 1px solid var(--border);
  padding: 6px 12px; border-radius: var(--radius); font-size: 13px; outline: none;
}
.art-filter-bar input { flex: 1; }
.art-filter-bar select { min-width: 200px; }
.art-filter-bar input:focus,
.art-filter-bar select:focus { border-color: #3b82f6; }
```

### Effort estimate
- db.ts: ~20 lines (1 interface, 2 query functions, 1 seed row)
- artifacts.ts: ~30 lines changed (updated card template, filter bar, updated signature)
- server.ts: ~3 lines changed (updated imports, updated route handler)
- style.css: ~15 lines (filter bar + new badge styles)
- **Total: ~70 lines changed across 4 files**

---

## Page 2: Artifact Version Detail (`/artifacts/versions`)

### New page

URL: `GET /artifacts/versions?path=ENCODED_ABSOLUTE_PATH`

Shows all versions of a single file in reverse chronological order, with expandable content, inline diff, and provenance.

### New in `lib/db.ts`

```typescript
export async function getArtifactVersionsByPath(path: string): Promise<ArtifactVersionRow[]>
// SQL: SELECT * FROM artifact_versions WHERE path = ${t(path)} ORDER BY ts DESC
// Returns full rows INCLUDING content (needed for display and diff)

export async function getArtifactReadsByPath(path: string): Promise<ArtifactReadRow[]>
// SQL: SELECT * FROM artifact_reads WHERE path = ${t(path)} ORDER BY ts DESC

export interface ArtifactReadRow {
  _id: string;
  session_id: string;
  path: string;
  tool_call_id: string;
  ts: string;
}
```

### New in `pages/artifact-versions.ts` (new file)

```typescript
export function renderArtifactVersions(
  path: string,
  versions: ArtifactVersionRow[],
  reads: ArtifactReadRow[]
): string
```

**Layout:**

```
┌──────────────────────────────────────────────────────────┐
│ ← Artifacts · 📦 DESIGN.md                    3 versions │
│ /home/user/project/DESIGN.md                             │
├──────────────────────────────────────────────────────────┤
│ [Filter: All sessions ▾]  [View: Timeline | Diff]       │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ ┌─ v3 · ✏️ edit · 2.4 KB · abc123 · 5m ago ──────────┐ │
│ │ Session: planner-abc123                              │ │
│ │ ▶ Show content                                       │ │
│ │ ▶ Show diff from v2                                  │ │
│ │ ▶ Show provenance (JSON-LD)                          │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─ v2 · ✏️ edit · 2.1 KB · def456 · 12m ago ─────────┐ │
│ │ Session: worker-def456                               │ │
│ │ ▶ Show content                                       │ │
│ │ ▶ Show diff from v1                                  │ │
│ │ ▶ Show provenance (JSON-LD)                          │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─ v1 · 📝 write · 1.8 KB · 789abc · 20m ago ────────┐ │
│ │ Session: architect-789abc                            │ │
│ │ ▶ Show content                                       │ │
│ │ ▶ Show provenance (JSON-LD)                          │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ── Reads ──────────────────────────────────────────────  │
│ 📖 Read by session planner-abc123 · 8m ago              │
│ 📖 Read by session tester-xyz789 · 3m ago               │
└──────────────────────────────────────────────────────────┘
```

**HTML structure per version card:**

```html
<div class="artv-card">
  <div class="artv-card-top">
    <span class="artv-version">v3</span>
    <span class="art-op">✏️</span>
    <span class="art-kind-badge" style="--kind-color:#f97316">edit</span>
    <span class="artv-size">2.4 KB</span>
    <span class="artv-hash"><code>abc123def456</code></span>
    <span class="dec-ago">5m ago</span>
  </div>
  <div class="art-meta">
    <span>Session: <a href="/sessions/SESSION_ID">planner-abc123</a></span>
    <span>Tool call: <code>toolu_abc</code></span>
  </div>

  <!-- Expandable: content -->
  <div class="content-block">
    <div class="content-block-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
      <span class="content-block-toggle">▶</span>
      <span class="content-block-key">Content</span>
      <span class="content-block-size">2.4 KB</span>
    </div>
    <div class="content-block-body collapsed">
      <div class="artv-content-tabs">
        <button class="btn btn-sm artv-tab-active" onclick="...">Rendered</button>
        <button class="btn btn-sm" onclick="...">Raw</button>
      </div>
      <div class="artv-rendered"><!-- server-rendered markdown HTML --></div>
      <div class="artv-raw" style="display:none"><pre><!-- raw content --></pre></div>
    </div>
  </div>

  <!-- Expandable: diff (not shown for v1) -->
  <div class="content-block">
    <div class="content-block-header" onclick="...">
      <span class="content-block-toggle">▶</span>
      <span class="content-block-key">Diff from v2</span>
      <span class="content-block-size">+12 / -3 lines</span>
    </div>
    <div class="content-block-body collapsed">
      <div class="artv-diff"><!-- inline diff HTML --></div>
    </div>
  </div>

  <!-- Expandable: JSON-LD provenance -->
  <div class="content-block">
    <div class="content-block-header" onclick="...">
      <span class="content-block-toggle">▶</span>
      <span class="content-block-key">Provenance</span>
    </div>
    <div class="content-block-body collapsed">
      <div class="artv-prov-chain">
        <!-- Visual chain: v3 ← v2 ← v1 ← (cross-session v5) -->
      </div>
      <pre class="jsonld-block"><!-- pretty-printed JSON-LD --></pre>
    </div>
  </div>
</div>
```

### Diff computation

**Approach: server-side line diff, rendered as HTML.**

Add `lib/diff.ts` (~40 lines):
```typescript
export interface DiffLine {
  type: "add" | "remove" | "context";
  text: string;
  oldLineNo?: number;
  newLineNo?: number;
}
export function computeLineDiff(oldText: string, newText: string): DiffLine[]
// Simple LCS-based line diff. No external dependency.
// Output: array of DiffLine for rendering as inline diff.

export function renderDiffHtml(lines: DiffLine[]): string
// Returns HTML with .diff-add, .diff-remove, .diff-ctx classes.
```

Diff is computed in `renderArtifactVersions` at render time — versions are sorted chronologically (oldest first for diffing), each version diffs against its predecessor.

### Markdown rendering

**Approach: minimal server-side markdown → HTML.**

Add `lib/markdown.ts` (~50 lines):
```typescript
export function renderMarkdown(src: string): string
// Converts markdown to HTML. Handles: headings, paragraphs, code blocks,
// inline code, bold, italic, lists, links. No external dependency — regex-based.
// Output is wrapped in <div class="artv-md"> for scoped styling.
```

This avoids adding a dependency like `marked`. The content is primarily `.md` design docs — no need for full GFM support. If a file is not markdown (detected by extension), show raw `<pre>` instead.

### Provenance chain rendering

Parse the `jsonld` column, extract:
- `prov:wasDerivedFrom` → link to previous version
- `prov:specializationOf` → link to parent artifact in artifacts table
- `prov:wasAttributedTo` → link to session
- `prov:wasGeneratedBy` → tool call reference

Render as a horizontal chain: `v3 ← v2 ← v1 ← (cross-session prior)` with clickable links.

### Route in `server.ts`

```typescript
import { renderArtifactVersions } from "./pages/artifact-versions.ts";
import { getArtifactVersionsByPath, getArtifactReadsByPath } from "./lib/db.ts";

app.get("/artifacts/versions", async (c) => {
  const path = c.req.query("path") ?? "";
  if (!path) return c.html("<h1>Missing path parameter</h1>", 400);
  const [versions, reads] = await Promise.all([
    getArtifactVersionsByPath(path),
    getArtifactReadsByPath(path)
  ]);
  if (versions.length === 0) return c.html("<h1>No versions found for this path</h1>", 404);
  return c.html(renderArtifactVersions(path, versions, reads));
});
```

### New CSS

```css
/* Version cards */
.artv-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; margin-bottom: 8px; }
.artv-card-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.artv-version { font-weight: 700; font-family: var(--mono); font-size: 14px; color: #3b82f6; }
.artv-size { font-size: 12px; color: var(--text-dim); font-family: var(--mono); }
.artv-hash { font-size: 11px; color: var(--text-dim); }
.artv-hash code { font-family: var(--mono); font-size: 11px; }

/* Content tabs */
.artv-content-tabs { display: flex; gap: 4px; margin-bottom: 8px; padding: 4px 0; }
.artv-tab-active { background: #3b82f6 !important; color: #fff !important; border-color: #3b82f6 !important; }

/* Rendered markdown */
.artv-md { font-size: 13px; line-height: 1.6; color: var(--text); }
.artv-md h1, .artv-md h2, .artv-md h3 { color: var(--text-bright); margin: 12px 0 6px; }
.artv-md h1 { font-size: 18px; } .artv-md h2 { font-size: 16px; } .artv-md h3 { font-size: 14px; }
.artv-md code { font-family: var(--mono); background: var(--bg-input); padding: 1px 4px; border-radius: 3px; font-size: 12px; }
.artv-md pre { background: #0d0f14; padding: 12px; border-radius: var(--radius); overflow-x: auto; }
.artv-md pre code { background: none; padding: 0; }

/* Diff */
.artv-diff { font-family: var(--mono); font-size: 12px; line-height: 1.5; }
.diff-add { background: rgba(34,197,94,0.12); color: #86efac; }
.diff-remove { background: rgba(239,68,68,0.12); color: #fca5a5; }
.diff-ctx { color: var(--text-dim); }
.diff-line-no { display: inline-block; width: 40px; text-align: right; color: #555; margin-right: 8px; user-select: none; }

/* Provenance chain */
.artv-prov-chain { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 8px; font-size: 12px; flex-wrap: wrap; }
.artv-prov-node { background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius); padding: 4px 10px; font-family: var(--mono); font-size: 11px; }
.artv-prov-node.active { border-color: #3b82f6; color: #3b82f6; }
.artv-prov-arrow { color: var(--text-dim); }

/* Reads section */
.artv-reads { margin-top: 20px; border-top: 1px solid var(--border); padding-top: 12px; }
.artv-reads h3 { font-size: 13px; color: var(--text-dim); margin-bottom: 8px; }
.artv-read-row { font-size: 12px; color: var(--text-dim); padding: 4px 0; }
```

### Effort estimate
- `lib/db.ts`: ~20 lines (2 query functions, 1 new interface)
- `lib/diff.ts`: ~40 lines (new file — LCS line diff + HTML renderer)
- `lib/markdown.ts`: ~50 lines (new file — minimal regex markdown renderer)
- `pages/artifact-versions.ts`: ~150 lines (new file — version list, content blocks, diff, provenance)
- `server.ts`: ~8 lines (1 new import, 1 new route)
- `style.css`: ~50 lines (version card, diff, markdown, provenance styles)
- **Total: ~320 lines across 6 files**

---

## Page 3: Artifact Content View (`/artifacts/content/:id`)

### New page

URL: `GET /artifacts/content/:id`

Dedicated full-page content viewer for a single artifact version. Useful for deep-linking, sharing, and reading long documents.

### New in `lib/db.ts`

```typescript
export async function getArtifactVersion(id: string): Promise<ArtifactVersionRow | null>
// SQL: SELECT * FROM artifact_versions WHERE _id = ${t(id)}

export async function getAdjacentVersions(path: string, version: number): Promise<{
  prev: ArtifactVersionSummary | null;
  next: ArtifactVersionSummary | null;
}>
// Two queries:
//   SELECT _id, version, ts, operation FROM artifact_versions
//     WHERE path = ${t(path)} AND version = ${n(version - 1)}
//   SELECT _id, version, ts, operation FROM artifact_versions
//     WHERE path = ${t(path)} AND version = ${n(version + 1)}
// Note: version numbers may not be contiguous across sessions, so these queries
// find by path + version number match, not by ordering. If version numbering
// resets per session, use ts-ordered approach instead:
//   ... WHERE path = ${path} AND ts < ${thisTs} ORDER BY ts DESC LIMIT 1
//   ... WHERE path = ${path} AND ts > ${thisTs} ORDER BY ts ASC LIMIT 1
```

### New in `pages/artifact-content.ts` (new file)

```typescript
export function renderArtifactContent(
  version: ArtifactVersionRow,
  prev: ArtifactVersionSummary | null,
  next: ArtifactVersionSummary | null
): string
```

**Layout:**

```
┌──────────────────────────────────────────────────────────┐
│ ← Versions · 📦 DESIGN.md · v3                          │
├──────────────────────────────────────────────────────────┤
│ Breadcrumb:                                              │
│ Session planner-abc → Tool Write → DESIGN.md v3          │
├──────────────────────────────────────────────────────────┤
│ [◀ v2]  v3 · ✏️ edit · 2.4 KB · abc123 · 5m ago  [v4 ▶]│
├──────────────────────────────────────────────────────────┤
│ [Rendered] [Raw] [Provenance]                            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ # Design: Hello Service                                  │
│                                                          │
│ ## Components                                            │
│ - app.ts — Hono routes                                   │
│ - index.ts — server bootstrap                            │
│ ...                                                      │
│ (full rendered markdown, scrollable)                     │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Provenance:                                              │
│ v3 ←derived— v2 ←derived— v1                            │
│ ↑ specializationOf artifact:harness:DESIGN.md            │
│ ↑ attributedTo session:planner-abc123                    │
│ ↑ generatedBy toolcall:toolu_abc                         │
└──────────────────────────────────────────────────────────┘
```

**HTML structure:**

```html
<header>
  <div class="header-top">
    <h1>
      <a href="/artifacts" class="back-link">← Artifacts</a>
      <span class="header-sep">·</span>
      <a href="/artifacts/versions?path=..." class="back-link">📦 DESIGN.md</a>
      <span class="header-sep">·</span>
      v3
    </h1>
  </div>
</header>

<main class="artc-page">
  <!-- Provenance breadcrumb -->
  <div class="artc-breadcrumb">
    <a href="/sessions/SESSION">planner-abc123</a> → Write → DESIGN.md v3
  </div>

  <!-- Prev/Next navigation -->
  <div class="artc-nav">
    <a href="/artifacts/content/PREV_ID" class="btn btn-sm">◀ v2</a>
    <div class="artv-card-top">
      <span class="artv-version">v3</span>
      <span class="art-op">✏️</span>
      <span class="art-kind-badge" style="--kind-color:#f97316">edit</span>
      <span class="artv-size">2.4 KB</span>
      <span class="artv-hash"><code>abc123</code></span>
      <span class="dec-ago">5m ago</span>
    </div>
    <a href="/artifacts/content/NEXT_ID" class="btn btn-sm">v4 ▶</a>
  </div>

  <!-- View toggle -->
  <div class="artc-tabs">
    <button class="btn btn-sm artv-tab-active">Rendered</button>
    <button class="btn btn-sm">Raw</button>
    <button class="btn btn-sm">Provenance</button>
  </div>

  <!-- Content -->
  <div class="artc-content">
    <div class="artv-md"><!-- rendered markdown --></div>
  </div>

  <!-- Provenance footer -->
  <div class="artc-provenance">
    <div class="artv-prov-chain">...</div>
    <pre class="jsonld-block">...</pre>
  </div>
</main>
```

### Route in `server.ts`

```typescript
import { renderArtifactContent } from "./pages/artifact-content.ts";
import { getArtifactVersion, getAdjacentVersions } from "./lib/db.ts";

app.get("/artifacts/content/:id{.+}", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  const version = await getArtifactVersion(id);
  if (!version) return c.html("<h1>Version not found</h1>", 404);
  const { prev, next } = await getAdjacentVersions(version.path, version.version);
  return c.html(renderArtifactContent(version, prev, next));
});
```

### New CSS

```css
.artc-page { padding: 16px 20px; max-width: 900px; }
.artc-breadcrumb { font-size: 12px; color: var(--text-dim); margin-bottom: 12px; }
.artc-breadcrumb a { color: #3b82f6; text-decoration: none; }
.artc-breadcrumb a:hover { text-decoration: underline; }
.artc-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.artc-tabs { display: flex; gap: 4px; margin-bottom: 12px; }
.artc-content { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; min-height: 300px; overflow-y: auto; }
.artc-provenance { margin-top: 16px; }
```

### Effort estimate
- `lib/db.ts`: ~20 lines (2 query functions)
- `pages/artifact-content.ts`: ~100 lines (new file — full-page viewer)
- `server.ts`: ~6 lines (1 import, 1 route)
- `style.css`: ~15 lines
- **Total: ~140 lines across 4 files**

---

## Seed Row Addition

Add to `ensureTables()` seeds in `lib/db.ts`:

```typescript
{ table: "artifact_versions", columns: "_id, session_id, path, relative_path, version, content_hash, content, size_bytes, operation, tool_call_id, ts, jsonld", values: "'_seed', '', '', '', 0, '', '', 0, '', '', 0, ''" },
{ table: "artifact_reads", columns: "_id, session_id, path, tool_call_id, ts", values: "'_seed', '', '', '', 0" },
```

---

## Implementation Order

| Step | What | Depends on | Effort |
|------|------|-----------|--------|
| 1 | Add `ArtifactVersionRow`, `ArtifactVersionSummary`, `ArtifactReadRow` interfaces + seed rows to `lib/db.ts` | — | Small |
| 2 | Add `getArtifactVersionSummaries()`, `getArtifactReadCounts()` queries to `lib/db.ts` | Step 1 | Small |
| 3 | Update `renderArtifacts()` in `pages/artifacts.ts` — version counts, size, links, filter bar | Step 2 | Medium |
| 4 | Update `/artifacts` route in `server.ts` to pass new data | Steps 2-3 | Small |
| 5 | Add filter bar CSS to `style.css` | — | Small |
| 6 | Create `lib/diff.ts` — line diff computation + HTML rendering | — | Medium |
| 7 | Create `lib/markdown.ts` — minimal markdown → HTML renderer | — | Medium |
| 8 | Add `getArtifactVersionsByPath()`, `getArtifactReadsByPath()` to `lib/db.ts` | Step 1 | Small |
| 9 | Create `pages/artifact-versions.ts` — version list page renderer | Steps 6-8 | Large |
| 10 | Add `/artifacts/versions` route to `server.ts` | Steps 8-9 | Small |
| 11 | Add version page CSS to `style.css` | — | Small |
| 12 | Add `getArtifactVersion()`, `getAdjacentVersions()` to `lib/db.ts` | Step 1 | Small |
| 13 | Create `pages/artifact-content.ts` — content view renderer | Steps 7, 12 | Medium |
| 14 | Add `/artifacts/content/:id` route to `server.ts` | Steps 12-13 | Small |
| 15 | Add content page CSS to `style.css` | — | Small |

**Phases for incremental delivery:**
- **Phase A** (Steps 1–5): Enhanced artifacts list — immediate value, minimal risk
- **Phase B** (Steps 6–11): Version detail page — bulk of the work, highest value
- **Phase C** (Steps 12–15): Content viewer — nice-to-have, builds on Phase B

---

## Risks

| Risk | Mitigation |
|------|-----------|
| **Large content in artifact_versions** — fetching all versions with content for a file could be slow if versions are many or large | `getArtifactVersionSummaries()` deliberately omits `content`. Full content only fetched on version detail page per-file. Content view loads one version at a time. |
| **Diff computation on large files** — LCS is O(n*m) on line arrays | Cap diff input at 5000 lines. Show "File too large for diff" message beyond that. Markdown design docs rarely exceed 500 lines. |
| **No markdown dependency** — regex-based rendering may miss edge cases | Acceptable for internal tool. Headings, code blocks, lists, bold/italic cover 95% of design doc content. Can upgrade to `marked` later if needed. |
| **XTDB query limitations** — version numbering resets per session, so `getAdjacentVersions` by version number won't work across sessions | Use ts-ordered queries (ORDER BY ts DESC/ASC with LIMIT 1) as the canonical approach for prev/next navigation. Version numbers are display-only. |
| **Filter bar requires client JS** — existing pages are server-rendered with no interactivity beyond SSE stream page | Add minimal inline `<script>` (~15 lines) for filtering. Follows pattern of existing `static/stream.js` / `static/dashboard.js`. Alternatively, make filters server-side via query params (URL: `/artifacts?session=X&search=Y`). Server-side is more consistent with the app's architecture. |
| **Nav bar getting crowded** — 6 items already | New pages are sub-pages of Artifacts (reachable via links, not nav). No new nav items needed. |

---

## Verification

Each phase can be verified independently:

**Phase A — Enhanced artifacts list:**
1. Start UI: `cd xtdb-event-logger-ui && npx jiti server.ts`
2. Navigate to `/artifacts`
3. Confirm version counts match `SELECT COUNT(*) FROM artifact_versions WHERE path = X` per file
4. Confirm size badges show formatted byte sizes
5. Confirm file names link to `/artifacts/versions?path=...`
6. Confirm filter bar narrows displayed cards

**Phase B — Version detail:**
1. Click a file from `/artifacts` → lands on `/artifacts/versions?path=...`
2. All versions listed in reverse chronological order
3. Expand content → shows rendered markdown (or raw for non-md)
4. Toggle to Raw → shows source
5. Expand diff → shows inline line diff from previous version (not shown for v1)
6. Expand provenance → shows JSON-LD with wasDerivedFrom chain
7. Reads section shows read events

**Phase C — Content viewer:**
1. From version list, click version ID or "View full" → lands on `/artifacts/content/:id`
2. Full rendered markdown displayed
3. Prev/Next buttons navigate between versions
4. Provenance breadcrumb links to session
5. Toggle Raw/Rendered/Provenance views

---

## Total Effort Summary

| Component | Lines | Files |
|-----------|-------|-------|
| `lib/db.ts` changes | ~60 | 1 (modified) |
| `lib/diff.ts` | ~40 | 1 (new) |
| `lib/markdown.ts` | ~50 | 1 (new) |
| `pages/artifacts.ts` changes | ~30 | 1 (modified) |
| `pages/artifact-versions.ts` | ~150 | 1 (new) |
| `pages/artifact-content.ts` | ~100 | 1 (new) |
| `server.ts` changes | ~15 | 1 (modified) |
| `static/style.css` additions | ~80 | 1 (modified) |
| **Total** | **~530** | **4 modified, 4 new** |
