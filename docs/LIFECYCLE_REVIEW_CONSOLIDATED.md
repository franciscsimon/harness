# Consolidated Review — Gemini & GPT Reports on PROJECT_LIFECYCLE_PROPOSAL

> Cross-referenced against actual codebase on 2026-03-19
> Source: `REPORT.PROJECT.LIFECYCLE.GEMINI.md`, `REPORT.PROJECT.LIFECYCLE.GPT.md`

---

## Verdict on Each Report

### Gemini Report
**Assessment: mostly a summary, not a review.** It restates the proposal approvingly but doesn't challenge it. It identifies no bugs, no missing pieces, no inconsistencies. Almost zero actionable critique. Useful as a sanity check that the proposal is coherent, but offers nothing we don't already know.

### GPT Report
**Assessment: genuinely useful.** Identifies 10 concrete issues, most of which are validated by the codebase. Some are real blockers. A few are medium-value. One or two overstate the problem. This is the one to take seriously.

---

## GPT Findings — Validated Against Codebase

### ✅ VALID: 7 duplicate JSONLD_CONTEXT definitions (Finding #3)
**Confirmed.** There are exactly 7 independent context definitions across the codebase:

| File | Variable |
|------|----------|
| `xtdb-event-logger/rdf/namespaces.ts` | `JSONLD_CONTEXT` (most complete: ev, rdf, xsd, schema, doap, prov, foaf) |
| `workflow-engine/rdf/namespaces.ts` | `JSONLD_CONTEXT` (schema, prov, ev, xsd, rdf) |
| `decision-log/rdf.ts` | `CONTEXT` (prov, foaf, ev, xsd) |
| `project-registry/rdf.ts` | `CONTEXT` (doap, prov, foaf, ev, xsd) |
| `artifact-tracker/versioning.ts` | `JSONLD_CONTEXT` (prov, ev, xsd) |
| `artifact-tracker/index.ts` | `JSONLD_CONTEXT` (prov, ev, xsd) |
| `session-postmortem/index.ts` | `JSONLD_CONTEXT` (prov, ev, xsd) |
| `agent-spawner/index.ts` | `JSONLD_CONTEXT` (prov, foaf, ev, xsd) |

**Each has a different subset of prefixes.** This is a real maintenance risk. Adding `req:`, `deploy:`, `ops:` means touching 7+ files or perpetuating the fragmentation.

**Action required:** Create `lib/jsonld/context.ts` as a single shared module. Prerequisite before any new lifecycle entities.

---

### ✅ VALID: Broken JSON-LD examples in the proposal (Finding #4)
**Confirmed.** Several examples in our proposal have incomplete `@context`:

| Example | Uses | Missing from `@context` |
|---------|------|-------------------------|
| `requirement_links` | `xsd:long` | `xsd` |
| `deployments` | `foaf:Agent` | `foaf` |
| `backup_records` | `foaf:Agent` | `foaf` |
| `decommission` | `foaf:Agent` | `foaf` |
| `cross-project versioning` | `xsd:long` | `xsd` |

**Action required:** Fix all examples in proposal v2. Better yet, reference the shared context rather than inlining partial copies.

---

### ✅ VALID: _id / @id convention inconsistency (Finding #5)
**Confirmed.** Current codebase uses:

| Extension | `_id` pattern | `@id` pattern |
|-----------|--------------|---------------|
| `decision-log` | `dec:{uuid}` | `urn:pi:dec:{uuid}` |
| `project-registry` (project) | `proj:{sha256}` | `urn:pi:proj:{sha256}` |
| `project-registry` (session link) | `sp:{uuid}` | `urn:pi:sp:{uuid}` |
| `artifact-tracker` (artifact) | `art:{uuid}` | `urn:pi:art:{uuid}` |
| `artifact-tracker` (version) | `artver:{uuid}` | `urn:pi:artver:{uuid}` |
| `artifact-tracker` (read) | `aread:{uuid}` | `urn:pi:aread:{uuid}` |
| `session-postmortem` | `pm:{uuid}` | `urn:pi:pm:{uuid}` |
| `agent-spawner` | `del:{uuid}` | `urn:pi:del:{uuid}` |

**Convention is clear:** `_id = {prefix}:{id}`, `@id = urn:pi:{_id}` = `urn:pi:{prefix}:{id}`.

Our proposal uses inconsistent patterns like `urn:pi:req:a1b2c3d4` (no prefix in _id) and `urn:pi:release:v1.2.0` (human-readable version, not UUID).

**Action required:** Document the convention explicitly. New entities should follow: `_id = req:{uuid}`, `@id = urn:pi:req:{uuid}`.

---

### ✅ VALID: No test/verification entities (Finding #2)
**Confirmed.** The proposal has a traceability gap. The chain should be:

```
requirement → decision → artifact → test evidence → release → deployment
```

We have requirement → decision → artifact, and artifact → release → deployment, but **no test evidence entity**. The `leap-detector` and `quality-hooks` extensions detect missing tests at _dev time_ but produce no persistent records.

**Action required:** Add `test_runs` table:

```jsonld
{
  "@id": "urn:pi:trun:{uuid}",
  "@type": ["schema:AssessAction", "prov:Activity"],
  "schema:object": { "@id": "urn:pi:proj:{id}" },
  "ev:testSuite": "unit",
  "ev:passed": 42,
  "ev:failed": 0,
  "ev:skipped": 3,
  "ev:coverage": 0.87,
  "ev:triggeredBy": { "@id": "urn:pi:deploy:{id}" },
  "ev:ts": ...
}
```

Link type `tests` in `requirement_links` to connect requirements → test evidence.

---

### ✅ VALID: Ownership boundaries undefined (Finding #1)
**Confirmed.** The proposal says _what_ exists but not _who writes it_. The harness has distinct subsystems:

| Subsystem | Port | Role |
|-----------|------|------|
| Pi session extensions | in-process | Dev-time records (decisions, artifacts, postmortems) |
| `xtdb-ops-api` | 3335 | Infrastructure ops (backup, restore, health, replica) |
| `xtdb-event-logger-ui` | 3333 | Read-only dashboard |
| `web-chat` | 3334 | Interactive chat UI |
| Workflow engine | in-process | Workflow orchestration |
| External CI | N/A | Not yet integrated |

**Action required:** Add ownership matrix:

| Entity | Writer | Trigger |
|--------|--------|---------|
| `requirements` | Pi extension (`requirements-tracker`) | `/req add` command or markdown import |
| `requirement_links` | Pi extension (auto + manual) | `/req link` command, auto on decision/artifact creation |
| `environments` | Ops API or Pi extension | Manual setup via `/env add` |
| `deployments` | Ops API (CI webhook) or Pi extension | Deploy action or CI callback |
| `releases` | Pi extension (`deployment-tracker`) | `/release create` or workflow completion |
| `backup_records` | Ops API exclusively | Backup job completion |
| `incidents` | Ops API or Pi extension | Manual `/incident` or auto from health alerts |
| `test_runs` | Pi extension or CI webhook | Test suite completion |
| `workflow_runs` | Workflow engine | Workflow start/step/complete |

---

### ✅ VALID: Workflow engine has zero persistence (Finding #8)
**Confirmed.** `workflow-engine/index.ts` has no SQL, no XTDB connection, no `INSERT` statements. Workflow state lives only in-memory during a session and is lost when the session ends.

**Action required:** Add `workflow_runs` and `workflow_step_runs` tables:

```
workflow_runs: _id, project_id, session_id, workflow_name, status, started_ts, completed_ts, jsonld
workflow_step_runs: _id, workflow_run_id, step_name, agent_role, status, started_ts, completed_ts, jsonld
```

Both as `prov:Activity`. This is required before lifecycle workflows can produce useful history.

---

### ✅ VALID: `schema:WebApplication` too narrow for environments (Finding #6)
**Partially valid.** Not all deploy targets are web applications. Worker processes, data pipelines, CLI tools don't fit.

**Better option:** Use `schema:SoftwareApplication` (broader) or just `ev:Environment` as a custom type. Keep it simple:

```jsonld
{ "@type": ["ev:Environment", "prov:Location"] }
```

---

### ✅ VALID: `schema:SoftwareSourceCode` wrong for compatibility matrix (Finding #6)
**Fully valid.** A compatibility record is not source code. Better modeled as:

```jsonld
{ "@type": "ev:CompatibilityAssertion" }
```

with `ev:projectA`, `ev:projectB`, `ev:compatible`, `ev:testedAt`. Custom type is more honest than misusing Schema.org.

---

### ⚠️ PARTIALLY VALID: CI/git integration undefined (Finding #9)
**Valid concern, but lower severity than claimed.** The harness already tracks git via `project-registry` (git remote, git root). What's truly missing is:
- Webhook endpoint for CI to POST deployment/test results
- Git tag → release record binding

This is a Phase 5+ concern, not a blocker for Phase 1-3.

---

### ⚠️ PARTIALLY VALID: Ops/session plane separation (Finding #10)
**Valid principle, but already somewhat followed.** `xtdb-ops-api` already owns backup/restore/health. The proposal doesn't violate this — it just doesn't state it. Adding the ownership matrix (Finding #1) fixes this.

---

### ℹ️ LOW VALUE: Gemini report entirely
The Gemini report is a polished summary that adds zero critical insight beyond the proposal itself. It's useful for executive buy-in but not for implementation planning.

---

## Issues NEITHER Report Found

### 🆕 1. No shared DB connection utility
Every extension creates its own `postgres()` connection with hardcoded `localhost:5433/xtdb/xtdb`. There are 6+ independent connection pools:
- `decision-log/index.ts`
- `project-registry/index.ts`
- `session-postmortem/index.ts`
- `artifact-tracker/db.ts`
- `artifact-tracker/provenance.ts`
- `agent-spawner/index.ts`

Adding 5+ new lifecycle extensions means 5+ more duplicated connection setups. **Need a shared `lib/db.ts`** alongside the shared JSON-LD context.

### 🆕 2. No event emission for lifecycle state changes
The `xtdb-event-logger` captures Pi SDK events (session_start, tool_call, etc.) but new lifecycle entities (requirement created, deployment recorded, phase changed) won't emit events automatically. They'll be rows in XTDB but invisible to the event stream, dashboard SSE, and projector.

**Need:** Either lifecycle extensions emit custom events that the event logger can capture, or the new entities need their own change-notification mechanism (XTDB polling, Redpanda topics, or SSE push from ops API).

### 🆕 3. No migration strategy for existing project records
The `projects` table already has rows. Adding `lifecycle_phase`, `config_json`, `tags`, `depends_on` columns means existing records need migration. XTDB handles schema-on-read (missing columns return null), but:
- The `doap:Project` JSON-LD in the `jsonld` column won't have the new fields
- Queries filtering on `lifecycle_phase` will miss existing projects
- Need a backfill task: `task project:migrate` to add defaults to existing records

### 🆕 4. No retention/archival policy for lifecycle data
The proposal adds 7+ new tables that will grow indefinitely. Unlike events (which can be sampled), lifecycle records are all important. But old backup_records, resolved incidents, and completed workflow_runs need a retention strategy:
- Keep last N backup records, archive older
- Incidents: keep forever (they're historical)
- Workflow runs: keep last N per workflow type
- Test runs: keep last N per project + summarize trends

### 🆕 5. No rate/volume estimates
The proposal doesn't estimate data volume. For a single-user harness managing ~10 projects:
- Requirements: ~50-200 per project → low volume
- Releases: ~1-4/month per project → very low
- Deployments: ~5-20/month per project → low
- Backup records: 1-3/day → very low
- Test runs: could be 10-50/day if CI integrated → moderate
- Workflow runs: ~5-10/week → low

Total: manageable. But if we ever manage 100+ projects or integrate CI pipelines, test_runs could explode. Need `ops:retentionDays` in project config.

### 🆕 6. No RBAC/permission model for lifecycle actions
The security audit already flagged unauth endpoints. New lifecycle actions (record deployment, change lifecycle phase, decommission project) are destructive/important. The proposal adds no auth layer. At minimum, lifecycle-mutating ops API endpoints need the same protection recommended in the security audit.

---

## Consolidated Action Items — Ordered

### Prerequisites (before any new entity)
1. **Create `lib/jsonld/context.ts`** — single source of truth for namespaces, context, and ID builders
2. **Create `lib/db.ts`** — shared XTDB connection factory
3. **Document conventions** — `_id = {prefix}:{uuid}`, `@id = urn:pi:{_id}`, context always imported from shared module
4. **Fix proposal JSON-LD examples** — every example must have complete `@context`
5. **Add ownership matrix** — who writes each entity, what triggers it

### Phase 1: Project Lifecycle State
6. Extend `projects` table with `lifecycle_phase`, `config_json`
7. Backfill migration task for existing projects
8. Update `project-registry/rdf.ts` to emit new fields in JSON-LD

### Phase 2: Workflow Persistence
9. Add `workflow_runs` + `workflow_step_runs` tables
10. Wire workflow engine to persist runs to XTDB
11. This is required before lifecycle workflows can produce history

### Phase 3: Requirements + Test Evidence
12. Add `requirements` table (`schema:CreativeWork`)
13. Add `requirement_links` table (`prov:Influence`)
14. Add `test_runs` table (`schema:AssessAction` + `prov:Activity`)
15. Build `requirements-tracker` extension with `/req` commands

### Phase 4: Releases + Deployments
16. Add `releases` table (`doap:Version` + `prov:Entity`)
17. Add `environments` table (`ev:Environment` + `prov:Location`)
18. Add `deployments` table (`schema:DeployAction` + `prov:Activity`)
19. Build `deployment-tracker` extension
20. Add CI webhook endpoint to ops API

### Phase 5: Ops Lifecycle Records
21. Add `backup_records` table (written by ops API)
22. Add `incidents` table
23. Add retention policy support
24. Wire backup job completion → backup_records insert

### Phase 6: Portfolio & Cross-Project
25. Portfolio dashboard page
26. Decommission workflow + `schema:DeleteAction`
27. Cross-project compatibility assertions
28. Lifecycle event emission to SSE/event stream
