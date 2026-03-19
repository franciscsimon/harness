# REPORT.PROJECT.LIFECYCLE.GPT.md

## Review Target

- Source: `docs/PROJECT_LIFECYCLE_PROPOSAL.md`
- Review goal: assess architectural fit, ontology consistency, implementation realism, and recommended sequencing against the current harness codebase.

---

## Executive Summary

This proposal is **directionally strong** and fits the overall shape of the harness well.

It correctly recognizes that the repo already has:
- project identity
- decisions
- artifacts
- provenance export
- workflows
- postmortems
- backup/ops support

And it correctly identifies the missing layer:

> turning the harness from a development-history system into a **full lifecycle system** spanning requirements, releases, environments, operations, and decommissioning.

My assessment:

- **Strategic direction:** strong
- **JSON-LD / provenance mindset:** strong
- **Implementation specificity:** medium
- **Ontology consistency:** mixed
- **Rollout order:** needs adjustment
- **Readiness for implementation:** not yet; needs one more design pass

The biggest issue is not that the proposal is wrong.
The biggest issue is that it is currently **more complete as a data model than as an operating architecture**.

It defines *what* should exist, but not yet clearly enough **who writes it, when it is written, and which subsystem owns it**.

---

## What the Proposal Gets Right

### 1. It builds on the real strengths of the current codebase
This is the proposal’s strongest quality.

It does **not** try to replace the current harness model. It extends it.

Good alignments:
- `project-registry` already models projects as `doap:Project`
- `decision-log` already models decisions as `prov:Activity`
- `artifact-tracker` already models versions as `prov:Entity`
- `workflow-engine` already uses `schema:HowTo` / `schema:HowToStep`
- `session-postmortem` already emits useful operational/dev summaries
- `xtdb-ops-api` already exists for backup/restore/health concerns

This means the proposal is evolutionary, not disruptive.

### 2. The lifecycle coverage is appropriate
The proposal covers the right missing domains:
- requirements
- lifecycle phase
- environments / releases / deployments
- maintenance / backups / incidents
- decommissioning
- cross-project compatibility

That is a reasonable definition of “project lifecycle management” for this repo.

### 3. The provenance-first framing is correct
Using JSON-LD and linked entities is the right fit for this harness.

The proposal’s best idea is not any single table.
It is this:

> all lifecycle records should become part of one queryable provenance graph.

That is fully aligned with how this repo already thinks.

### 4. The workflow-template section is especially promising
The proposal correctly notices that `workflow-engine` exists but is underused.

Using lifecycle workflows for:
- feature work
- releases
- security patches
- maintenance
- decommissioning

is a strong product direction.

---

## Best Existing Foundations to Reuse

The proposal should lean even harder on these existing assets:

### `project-registry`
Use as the root identity anchor for all lifecycle entities.

### `decision-log`
Already richer than the proposal summary implies.
Current types already support:
- `files`
- `alternatives`
- `agent`
- `tags`

So requirements/release traceability can build on that immediately.

### `artifact-tracker`
This is the best existing implementation substrate for:
- requirement → artifact links
- release composition
- changelog generation
- provenance bundles

### `session-postmortem`
Already captures:
- goal
- what worked / failed
- files changed
- artifact version counts
- decision counts
- delegation counts

That makes it a natural source for lifecycle analytics and release notes.

### `xtdb-ops-api`
Backups, restores, health, replica state, and operational jobs clearly belong here, not in general-purpose agent extensions.

---

## Key Gaps in the Proposal

## 1. Ownership boundaries are underdefined
**Severity:** High

The proposal defines new tables well, but not clearly enough **which subsystem owns each record**.

This matters because the repo already has multiple planes:
- agent/session plane
- dashboard/query plane
- ops plane (`xtdb-ops-api`)
- workflow plane
- git / external CI plane

Examples that need explicit ownership:
- `requirements` — created by user command? issue import? markdown parser? API?
- `deployments` — written by CI? by ops API? by manual command?
- `releases` — created from git tags? from decisions/artifacts? from workflow completion?
- `incidents` — manual entry? auto-generated from monitoring? imported from ops alerts?
- `backup_records` — definitely should be written by `xtdb-ops-api`, not by session extensions

### Recommendation
Add an **Ownership Matrix** section:

| Entity | Writer | Trigger | Source of truth |
|---|---|---|---|
| requirements | command/importer | manual/import | harness DB |
| releases | CI/release workflow | tag/release | git + XTDB |
| deployments | ops API / CI webhook | deploy action | CI / ops API |
| backup_records | ops API | backup job completion | ops API |
| incidents | ops API / manual | alert/manual | ops API |

Without this, implementation will drift.

---

## 2. The proposal is missing first-class test / verification entities
**Severity:** High

The document mentions:
- req → test traceability
- deploy-time checks
- coverage dashboard

But it does **not** define a lifecycle entity for test execution itself.

That leaves a major hole in the graph:

`requirement -> implementation -> test evidence -> release -> deployment`

Right now the proposal has no explicit `test_runs`, `verification_runs`, or release gate records.

### Recommendation
Add at least one new entity family, e.g.:
- `test_runs` as `prov:Activity` or `schema:AssessAction`
- `verification_links` / `requirement_links` with `linkType: tests`
- optional `quality_gates` for release readiness

This is one of the most important missing parts.

---

## 3. JSON-LD reuse is conceptually aligned, but not operationally aligned yet
**Severity:** High

The proposal treats `xtdb-event-logger/rdf/namespaces.ts` as the shared namespace registry.
That is only partially true.

In the current codebase, several packages define their own local context objects instead of importing one canonical shared context:
- `project-registry/rdf.ts`
- `decision-log/rdf.ts`
- `artifact-tracker/versioning.ts`
- `session-postmortem/index.ts`

So adding prefixes to `xtdb-event-logger/rdf/namespaces.ts` alone will **not** align the system.

### Recommendation
Before adding lifecycle entities, introduce a true shared module such as:
- `lib/jsonld/namespaces.ts`
- `lib/jsonld/ids.ts`
- `lib/jsonld/context.ts`

Then migrate current producers to use it.

This should be an explicit prerequisite.

---

## 4. Several JSON-LD examples are internally inconsistent
**Severity:** Medium-High

The ontology direction is good, but a few example documents have broken or incomplete contexts.

Examples in the proposal:
- `requirement_links` uses `xsd:long` but its `@context` does not include `xsd`
- `deployments` uses `foaf:Agent` but its `@context` does not include `foaf`
- `backup_records` uses `foaf:Agent` but its `@context` does not include `foaf`
- `decommission` uses `foaf:Agent` but its `@context` does not include `foaf`
- `cross-project versioning` uses `xsd:long` but its `@context` does not include `xsd`

These are fixable, but they matter because the proposal claims ontology rigor.

### Recommendation
Run a consistency pass on every JSON-LD example:
- every used prefix must appear in `@context`
- examples should follow one consistent `@id` strategy
- avoid `null` properties in examples unless you want null persisted explicitly

---

## 5. ID strategy is not fully aligned with current implementation
**Severity:** Medium

Current code generally follows this pattern:
- DB `_id` is something like `proj:...`, `dec:...`, `sp:...`
- JSON-LD `@id` is usually `urn:pi:${_id}`

The proposal mixes:
- `urn:pi:req:...`
- `urn:pi:release:...`
- `urn:pi:env:...`
- `urn:pi:compat:...`

This is fine in principle, but it should be made consistent with how current modules already build IDs.

### Recommendation
Choose one rule and document it explicitly:

Option A:
- `_id = req:<id>`
- `@id = urn:pi:req:<id>`

Option B:
- `_id = urn:pi:req:<id>`
- `@id = _id`

Right now the repo is closer to **Option A**.

---

## 6. Some proposed types are workable but semantically weak
**Severity:** Medium

### `environments` as `schema:WebApplication`
This works for deployed web endpoints, but it is too narrow for:
- staging slots
- worker environments
- data-plane environments
- non-web deploy targets

### compatibility matrix as `schema:SoftwareSourceCode`
This is the weakest modeling choice in the proposal.
A compatibility record is not source code.

### decommission checklist as nested object
This is convenient, but not very graph-friendly.
It is better as repeated predicates or checklist item entities.

### Recommendation
Refine the semantic model:
- keep `doap:Version` for releases
- reconsider `schema:WebApplication` for generic environments
- replace compatibility record type with a more neutral entity/action model
- flatten or normalize checklist semantics

---

## 7. `projects` table extension needs a queryability decision
**Severity:** Medium

The proposal adds to `projects`:
- `lifecycle_phase`
- `config_json`
- `tags`
- `depends_on`

This is reasonable, but the current SQL style in the repo is very scalar-oriented:
- text
- bigint
- boolean
- jsonld string

Arrays and opaque config blobs will reduce query clarity unless you define how they are stored.

### Recommendation
Split this into two categories:

**Safe inline fields**
- `lifecycle_phase`
- maybe `config_json`

**Better as separate link tables**
- dependencies
- maybe tags if they need filtering/analytics

A `project_dependencies` table may be better than `depends_on` embedded arrays.

---

## 8. Workflow templates alone will not create lifecycle history
**Severity:** Medium

The proposal correctly wants lifecycle workflows.
But the current `workflow-engine`:
- loads workflow definitions from JSON-LD
- injects role prompts
- persists local workflow state in session entries
- does **not** persist workflow runs to XTDB as first-class records

So adding 7 workflow JSON-LD files is not enough if the goal is historical lifecycle observability.

### Recommendation
Add persistent runtime entities such as:
- `workflow_runs`
- `workflow_step_runs`

Modeled as `prov:Activity` and linked to:
- project
- session
- decisions
- artifacts
- releases/deployments where relevant

---

## 9. Release/deployment modeling needs git/CI integration defined
**Severity:** Medium

The proposal’s release/deployment section is useful, but it assumes these records can simply exist.

In practice, you still need a source of truth for:
- git tag creation
- changelog assembly
- CI result status
- environment target
- rollback event

The current harness does not yet strongly bind:
- git commits
- tags
- releases
- deployments

### Recommendation
Make CI/CD integration explicit:
- release creation from git tags or release workflow completion
- deployment records from CI webhook or ops API call
- changelog generation from decisions/artifacts/postmortems, but anchored to a commit/tag boundary

---

## 10. Ops-plane records should be explicitly separated from session-plane records
**Severity:** Medium

The proposal mixes session/dev concepts and ops concepts in one conceptual layer.
That is good for the final graph, but the implementation should preserve subsystem boundaries.

Examples:
- `backup_records` and restore activity belong to `xtdb-ops-api`
- incidents likely belong to monitoring/ops ingestion
- requirements/decision links belong to harness-side workflows/tools

### Recommendation
Add a section:

## System Boundaries
- Harness extensions write dev/session records
- Ops API writes infrastructure/backup/restore records
- CI pipeline writes release/deployment records
- UI only reads / aggregates

That will make the implementation much safer and cleaner.

---

## Places Where the Proposal Understates Current Capability

These are positive mismatches:

### 1. `decision-log` is richer than described
Current `DecisionRecord` already includes:
- `files`
- `alternatives`
- `agent`
- `tags`

So requirement traceability can likely start from that richer base.

### 2. `session-postmortem` is stronger than the proposal uses
It already emits counts for:
- artifact versions
- decisions logged
- delegations spawned

Those are useful building blocks for release summaries and maintenance analytics.

### 3. `artifact-tracker/provenance.ts` is a major asset
The proposal mentions provenance export, but this deserves more prominence.
It is already the natural mechanism for producing lifecycle bundles.

---

## Recommended Revision to the Implementation Order

The current order in the proposal is good, but I would change it slightly.

### Current order
1. lifecycle phase
2. portfolio dashboard
3. scheduled backups
4. requirements tracker
5. deployment tracker
6. workflows
7. decommissioning

### Recommended order
1. **Shared JSON-LD conventions pass**
   - shared namespaces/context/id utilities
   - fix example consistency
2. **Extend `projects` with lifecycle phase**
   - quick win
3. **Add requirements + requirement links**
   - strongest product leverage
4. **Add test/verification entities**
   - required for true traceability
5. **Add releases / environments / deployments**
   - with CI/ops ownership defined
6. **Add workflow templates + workflow run persistence**
   - now the workflows produce history, not just prompts
7. **Add backup / incident persistence via ops API**
   - use existing ops surface
8. **Add decommission / cross-project compatibility**
   - valuable, but later-stage

Why change it?
Because scheduled backup records are useful, but they are less central to “project lifecycle management” than:
- requirements
- test evidence
- releases/deployments

---

## Concrete Changes I Would Make to the Proposal Before Implementation

### Must-fix
- add an ownership matrix for every new entity
- add first-class test/verification entities
- fix broken JSON-LD example contexts
- define one canonical `_id` / `@id` convention
- add a shared JSON-LD utility layer as a prerequisite

### Should-fix
- reconsider `schema:WebApplication` and `schema:SoftwareSourceCode` choices
- separate dependency links from the `projects` row if they need graph/query power
- persist workflow runs, not just workflow definitions
- specify how release/deployment data enters the system

### Nice-to-have
- sketch UI routes/pages for:
  - `/requirements`
  - `/releases`
  - `/deployments`
  - `/incidents`
  - `/portfolio`
- include sample queries for lifecycle dashboards

---

## Final Verdict

`PROJECT_LIFECYCLE_PROPOSAL.md` is a **good proposal that should be kept**, but it is **not ready to implement as-is**.

Best way to describe it:

> The proposal is strong at the ontology and entity-design layer, but still one step short at the subsystem-ownership and event-ingestion layer.

If revised with:
- shared JSON-LD conventions
- lifecycle writer ownership
- test/verification entities
- corrected ontology examples
- persisted workflow runs

then it becomes a very credible roadmap for evolving the harness into a full lifecycle platform.

---

## Short Conclusion

**Recommendation:** accept the proposal direction, but require a **Revision 2** before implementation.

That revision should answer five questions clearly:
1. Who writes each lifecycle record?
2. How do records enter the system?
3. How are IDs and contexts standardized?
4. Where is test evidence modeled?
5. Which parts live in harness extensions vs ops API vs CI?

Once those are answered, this proposal becomes implementation-ready.
