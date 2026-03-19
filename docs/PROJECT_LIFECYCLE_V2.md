# Project Lifecycle Management — System Specification v2

> Version: 2.1 | Date: 2026-03-19
> Status: Design-complete, pre-implementation
> Inputs: PROJECT_LIFECYCLE_PROPOSAL.md, GPT/Gemini reviews, LIFECYCLE_REVIEW_CONSOLIDATED.md, codebase audit
> Changes from 2.0: vocabulary maximization pass (reduce `ev:` usage), CI/CD architecture decisions

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Conventions & Standards](#2-conventions--standards)
3. [Vocabulary Mapping — Standard vs Custom](#3-vocabulary-mapping)
4. [CI/CD Architecture](#4-cicd-architecture)
5. [Shared Infrastructure](#5-shared-infrastructure)
6. [Existing Entities (Current State)](#6-existing-entities-current-state)
7. [New Entities (Full Specification)](#7-new-entities-full-specification)
8. [Ownership Matrix](#8-ownership-matrix)
9. [System Boundaries](#9-system-boundaries)
10. [Event Emission & Observability](#10-event-emission--observability)
11. [Retention & Archival Policy](#11-retention--archival-policy)
12. [Migration Strategy](#12-migration-strategy)
13. [Security & RBAC](#13-security--rbac)
14. [UI Routes & Dashboard](#14-ui-routes--dashboard)
15. [Workflow Templates](#15-workflow-templates)
16. [Implementation Phases](#16-implementation-phases)
17. [Volume Estimates](#17-volume-estimates)

---

## 1. System Overview

The harness manages the full lifecycle of software projects through a provenance-first architecture where every entity is a JSON-LD document stored in XTDB, linked via `@id` references into one queryable graph.

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Layer (read-only)                      │
│  xtdb-event-logger-ui :3333  │  web-chat :3334                  │
├─────────────────────────────────────────────────────────────────┤
│                      API Layer (write + read)                    │
│  xtdb-ops-api :3335          │  CI webhook receiver (new)        │
├─────────────────────────────────────────────────────────────────┤
│                    Extension Layer (in-process)                  │
│  Pi session extensions — write dev/session records to XTDB       │
│  project-registry, decision-log, artifact-tracker, ...           │
│  requirements-tracker (new), deployment-tracker (new), ...       │
├─────────────────────────────────────────────────────────────────┤
│                      Data Layer                                  │
│  XTDB Primary :5433  ──Redpanda──  XTDB Replica :5434           │
│  ~/backups/xtdb/                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Subsystem Responsibilities

| Subsystem | Writes | Reads | Port |
|-----------|--------|-------|------|
| **Pi extensions** | Dev records: decisions, artifacts, requirements, postmortems, workflow runs | Own session state | in-process |
| **Ops API** | Infra records: backup_records, incidents, health_checks | All tables | 3335 |
| **CI webhook** | Pipeline records: test_runs, deployments, releases | Project/env context | 3335 (sub-route) |
| **Dashboard UI** | Nothing (read-only) | All tables | 3333 |
| **Web chat** | Via Pi extensions | Dashboard API | 3334 |

---

## 2. Conventions & Standards

### 2.1 Namespace Registry

| Prefix | URI | Scope | Source |
|--------|-----|-------|--------|
| `ev:` | `https://pi.dev/events/` | Custom predicates for all domains | existing |
| `prov:` | `http://www.w3.org/ns/prov#` | Provenance (Activity, Entity, Agent) | W3C |
| `schema:` | `https://schema.org/` | Actions, general types | Schema.org |
| `doap:` | `http://usefulinc.com/ns/doap#` | Projects, versions, repositories | DOAP |
| `foaf:` | `http://xmlns.com/foaf/0.1/` | Agent identity | FOAF |
| `xsd:` | `http://www.w3.org/2001/XMLSchema#` | Typed literals | W3C |
| `rdf:` | `http://www.w3.org/1999/02/22-rdf-syntax-ns#` | rdf:type | W3C |

**Decision: No new namespace prefixes.** All custom predicates use `ev:`. The previously proposed `req:`, `deploy:`, `ops:` are unnecessary — `ev:` already serves as the custom predicate namespace. This avoids fragmenting the vocabulary and keeps the `@context` consistent.

### 2.2 ID Convention

Every entity follows this pattern exactly:

```
_id   = {prefix}:{uuid}           e.g. req:a1b2c3d4-...
@id   = urn:pi:{_id}              e.g. urn:pi:req:a1b2c3d4-...
```

**Existing prefixes:**

| Prefix | Entity | Example |
|--------|--------|---------|
| `proj:` | Project | `proj:ac75514059c1` (sha256 prefix, not UUID) |
| `sp:` | Session↔Project link | `sp:{uuid}` |
| `dec:` | Decision | `dec:{uuid}` |
| `art:` | Artifact | `art:{uuid}` |
| `artver:` | Artifact version | `artver:{uuid}` |
| `aread:` | Artifact read | `aread:{uuid}` |
| `del:` | Delegation | `del:{uuid}` |
| `pm:` | Session postmortem | `pm:{uuid}` |

**New prefixes:**

| Prefix | Entity | Example |
|--------|--------|---------|
| `req:` | Requirement | `req:{uuid}` |
| `reqlink:` | Requirement link | `reqlink:{uuid}` |
| `env:` | Environment | `env:{uuid}` |
| `rel:` | Release | `rel:{uuid}` |
| `depl:` | Deployment | `depl:{uuid}` |
| `trun:` | Test run | `trun:{uuid}` |
| `bak:` | Backup record | `bak:{uuid}` |
| `inc:` | Incident | `inc:{uuid}` |
| `wfrun:` | Workflow run | `wfrun:{uuid}` |
| `wfstep:` | Workflow step run | `wfstep:{uuid}` |

### 2.3 JSON-LD Document Rules

1. **`@context`**: Always import from `lib/jsonld/context.ts`, never define inline
2. **`@id`**: Always `urn:pi:{_id}`
3. **`@type`**: Use standard ontology types. Custom `ev:` types only when no standard type fits
4. **Typed literals**: Numbers use `xsd:long` or `xsd:integer`, booleans use `xsd:boolean`, timestamps use `xsd:long` (epoch ms)
5. **References**: Link to other entities via `{ "@id": "urn:pi:{target_id}" }`
6. **Null handling**: Omit null/undefined properties from JSON-LD (don't serialize `null`)
7. **Timestamps**: All entities have `ev:ts` as epoch milliseconds

### 2.4 XTDB Column Conventions

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Primary key: `{prefix}:{uuid}` |
| `project_id` | text | FK → `projects._id` |
| `session_id` | text | Pi session file path |
| `ts` | bigint | Epoch milliseconds |
| `jsonld` | text | Full JSON-LD document (stringified) |

All other columns are scalar (text, bigint, boolean). No arrays or complex types in columns — use separate link tables or JSON in the `jsonld` column.

---

## 3. Vocabulary Mapping — Standard vs Custom

### 3.1 Design Principle

**Use `ev:` only when no standard property exists.** Every predicate must be checked against PROV-O, Schema.org, DOAP, and FOAF before falling back to `ev:`. This maximizes interoperability and makes our JSON-LD meaningful to external tools.

### 3.2 Standard Properties We Must Use (Not `ev:`)

#### Timestamps — Use PROV-O and Schema.org native properties

| V2.0 (wrong) | V2.1 (correct) | Standard | Why |
|---------------|-----------------|----------|-----|
| `ev:startedTs` | `prov:startedAtTime` | PROV-O | Native activity start time |
| `ev:completedTs` | `prov:endedAtTime` | PROV-O | Native activity end time |
| `ev:ts` (on Entity) | `prov:generatedAtTime` | PROV-O | When entity was created |
| `schema:startTime` | `schema:startTime` | Schema.org | Keep as-is (already correct for Actions) |
| `schema:endTime` | `schema:endTime` | Schema.org | Keep as-is (already correct for Actions) |

**Note:** `ev:ts` remains as a convenience column in XTDB for indexing/sorting. The JSON-LD document uses the proper PROV-O/Schema.org property. Both point to the same epoch value.

#### Agent Identity — Use PROV-O `prov:SoftwareAgent`

| V2.0 (wrong) | V2.1 (correct) | Why |
|---------------|-----------------|-----|
| `foaf:Agent` + `foaf:name` | `prov:SoftwareAgent` + `schema:name` | Our agents are software, not people. `prov:SoftwareAgent` is the W3C class for automated agents. `foaf:Agent` is for humans/organizations. |

Keep `foaf:` in the namespace registry for backward compatibility but new entities use `prov:SoftwareAgent`.

#### Project Links — Use DOAP native properties

| V2.0 (wrong) | V2.1 (correct) | Standard | Why |
|---------------|-----------------|----------|-----|
| `ev:dependsOn` array | `doap:release` + separate dep table | DOAP | DOAP has `doap:release` for Project→Version |
| custom project→version link | `doap:release` | DOAP | Native property for this exact relationship |
| `ev:lifecyclePhase` | `schema:creativeWorkStatus` | Schema.org | Generic status predicate for creative works / projects |

#### Content & Identity — Use Schema.org native properties

| V2.0 (wrong) | V2.1 (correct) | Standard | Why |
|---------------|-----------------|----------|-----|
| `ev:priority` | `schema:priority` | Schema.org | Not officially enumerated but widely used |
| `ev:status` (on Actions) | `schema:actionStatus` | Schema.org | Enumerated: `ActiveActionStatus`, `CompletedActionStatus`, `FailedActionStatus`, `PotentialActionStatus` |
| `ev:source` | `schema:isBasedOn` | Schema.org | Where the content came from |
| `ev:externalRef` | `schema:identifier` | Schema.org | External identifier (GitHub issue #, JIRA key) |
| `ev:tags` | `schema:keywords` | Schema.org | Tags/keywords on any creative work |
| `ev:gitTag` | `doap:revision` | DOAP | Already used for version numbers, also applies to git tags |
| `ev:gitCommit` | `schema:version` | Schema.org | Commit SHA as version identifier |
| `ev:reason` | `schema:description` | Schema.org | Already there, use it |
| `ev:notes` | `schema:text` | Schema.org | Free-form text content |

#### Workflow Links — Use PROV-O `prov:hadPlan`

| V2.0 (wrong) | V2.1 (correct) | Why |
|---------------|-----------------|-----|
| `prov:wasInformedBy` (step→run) | `prov:hadPlan` | PROV-O's explicit "this activity followed this plan" |

#### Test Results — Use `schema:CheckAction` not `schema:AssessAction`

| V2.0 (wrong) | V2.1 (correct) | Why |
|---------------|-----------------|-----|
| `schema:AssessAction` | `schema:CheckAction` | `CheckAction` = "verifying something against a standard" = tests. `AssessAction` = "evaluating quality" = code review. |

### 3.3 What Stays as `ev:` (Genuinely Custom)

These predicates have no standard equivalent. They are domain-specific to our harness:

| Predicate | Used On | Why Custom |
|-----------|---------|------------|
| `ev:sessionId` | All entities | Pi session concept, no standard equivalent |
| `ev:suiteName` | test_runs | `unit`/`integration`/`e2e` — no standard property |
| `ev:passed` / `ev:failed` / `ev:skipped` | test_runs | Test count metrics — no standard |
| `ev:coverage` | test_runs | Code coverage percentage |
| `ev:durationMs` | test_runs, backups | Execution duration in ms |
| `ev:backupType` | backup_records | `csv-hot` / `snapshot` — domain-specific |
| `ev:archivePath` | backup_records, decommission | File system path |
| `ev:tableCount` | backup_records | XTDB-specific |
| `ev:triggeredBy` | backup_records | `manual` / `scheduled` / `pre-deploy` |
| `ev:envType` | environments | `dev` / `staging` / `production` / `preview` |
| `ev:linkType` | requirement_links | `satisfies` / `implements` / `tests` / etc. |
| `ev:targetType` | requirement_links | Target entity table name |
| `ev:dependencyType` | project_dependencies | `runtime` / `build` / `dev` |
| `ev:versionConstraint` | project_dependencies | Semver constraint string |
| `ev:severity` | incidents | `critical` / `high` / `medium` / `low` |
| `ev:rootCause` | incidents | RCA text |
| `ev:resolution` | incidents | Fix description |
| `ev:agentRole` | workflow_step_runs | Pi agent role name |
| `ev:identityType` | projects | `git-remote` / `git-local` / `path` |
| `ev:canonicalId` | projects | Harness project canonical ID |
| `ev:acceptanceCriteria` | requirements | Array of criteria strings |
| `ev:isActive` | environments | Whether env is currently active |
| `ev:checklist` | decommission | JSON checklist object |
| `ev:impactedProjects` | decommission | Array of project refs |

### 3.4 Updated `@context` with Standard Property Usage

```jsonld
{
  "@context": {
    "ev": "https://pi.dev/events/",
    "prov": "http://www.w3.org/ns/prov#",
    "schema": "https://schema.org/",
    "doap": "http://usefulinc.com/ns/doap#",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  }
}
```

No additional namespace prefixes needed. The seven existing namespaces cover everything.

---

## 4. CI/CD Architecture

### 4.1 Current State

The harness has **no CI/CD pipeline** today:
- No `.github/workflows/`, no Jenkinsfile, no GitLab CI
- No Dockerfile for the harness itself
- No git tags/releases
- The only "deployment" is `task ext:deploy` (symlinks extensions into `~/.pi/agent/extensions/`)
- Docker Compose manages XTDB infrastructure, not application deployment
- The harness is a **local development tool**, not a deployed service

### 4.2 Decision: CI/CD is Ingestion, Not Execution

The harness does NOT run CI/CD pipelines. It **receives and records** CI/CD events from external systems.

```
┌──────────────┐     webhook POST      ┌─────────────┐     INSERT     ┌──────┐
│ GitHub Actions│ ──────────────────→   │  Ops API    │ ────────────→  │ XTDB │
│ GitLab CI    │   /api/ci/events      │  :3335      │                │      │
│ Jenkins      │                        │  (receiver) │                │      │
│ Local script │                        └─────────────┘                └──────┘
└──────────────┘
```

**Rationale:**
- The harness manages many projects, each with its own CI/CD stack (GitHub Actions, GitLab, Jenkins, none)
- We don't want to be a CI/CD platform — that's a solved problem
- We want a single provenance graph that includes CI/CD data alongside decisions, artifacts, and requirements
- CDEvents (CNCF standard) defines exactly this: a standard envelope for CI/CD events

### 4.3 CI/CD Integration Points

#### 4.3.1 Inbound: CI → Harness (webhook receiver)

**Single endpoint:** `POST /api/ci/events`

Accepts a simplified CDEvents-inspired payload:

```typescript
interface CIEvent {
  type: "build.finished" | "test.finished" | "artifact.published" | "deployment.finished" | "release.published";
  project: string;          // Git remote URL or canonical project ID
  source: string;           // "github-actions" | "gitlab-ci" | "jenkins" | "local"
  subject: {
    id: string;             // CI run ID / job ID
    version?: string;       // Semver for releases
    environment?: string;   // Environment name for deployments
    git_commit?: string;    // Commit SHA
    git_tag?: string;       // Tag name
    status: "succeeded" | "failed" | "error";
    // Test-specific
    passed?: number;
    failed?: number;
    skipped?: number;
    coverage?: string;
    suite_name?: string;
    // Deployment-specific
    url?: string;           // Deployed URL
    // Build-specific
    artifact_url?: string;  // Build artifact URL
    duration_ms?: number;
  };
  timestamp: string;        // ISO 8601
  signature?: string;       // HMAC-SHA256 for verification
}
```

The ops API receiver:
1. Verifies HMAC signature (if `CI_WEBHOOK_SECRET` is set)
2. Resolves `project` to a `projects._id` via git remote URL match
3. Maps `type` to the appropriate XTDB insert:
   - `test.finished` → `test_runs` table
   - `deployment.finished` → `deployments` table
   - `release.published` → `releases` table
   - `build.finished` → logged as `lifecycle_events` (no dedicated table)
   - `artifact.published` → logged as `lifecycle_events`
4. Emits a `lifecycle_events` row for dashboard SSE
5. Returns `{ received: true, entity_id: "depl:xxx" }`

#### 4.3.2 Outbound: Harness → CI (none initially)

No outbound CI triggers in v2.1. The harness records, it doesn't command.

**Future possibility:** Webhook-on-lifecycle-event (e.g., trigger CI when a release is created in the harness). Deferred — would add `webhook_subscriptions` table.

#### 4.3.3 Local/Manual CI — The Pi Agent as CI

For projects without external CI, the Pi agent itself IS the CI:
- **Test execution:** Agent runs `npm test` / `pytest` etc. via tool_call → `leap-detector` and `quality-hooks` already monitor this
- **Recording:** A new `test-recorder` extension watches for test command results and writes `test_runs` records
- **Deployment:** Agent runs deploy commands → `deployment-tracker` extension records the deployment
- **Release:** `/release create` command aggregates decisions + artifacts → creates `releases` record + git tag

This means every project has CI/CD coverage regardless of whether it has GitHub Actions:
- Projects WITH external CI: webhook ingestion
- Projects WITHOUT: Pi agent as lightweight CI

#### 4.3.4 GitHub Actions Integration (reference implementation)

A reusable workflow step that POSTs to the harness after each job:

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
      - name: Report to Harness
        if: always()
        run: |
          curl -X POST http://$HARNESS_HOST:3335/api/ci/events \
            -H "Content-Type: application/json" \
            -H "X-Signature: $(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$CI_WEBHOOK_SECRET")" \
            -d '{
              "type": "test.finished",
              "project": "${{ github.repository }}",
              "source": "github-actions",
              "subject": {
                "id": "${{ github.run_id }}",
                "git_commit": "${{ github.sha }}",
                "status": "${{ job.status == 'success' && 'succeeded' || 'failed' }}",
                "suite_name": "unit"
              },
              "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
            }'
```

### 4.4 Project Resolution from CI Events

CI events carry a `project` field (git remote URL like `github.com/franciscsimon/harness`).
The ops API resolves this to a `projects._id` by:

1. Normalizing the URL (strip `.git`, `https://`, `git@`, etc.)
2. Computing the same `canonicalId` that `project-registry` uses
3. Looking up `projects` table by `canonical_id`
4. If not found: create a stub project record (will be enriched when a Pi session runs in that project)

This means CI events can arrive before any Pi session has touched a project. The project record exists as a "CI-discovered" stub until a session fills in the full identity.

### 4.5 What We Are NOT Building

| Not Building | Why |
|---|---|
| Pipeline orchestration engine | Use GitHub Actions / GitLab CI / Jenkins |
| Container registry | Use ghcr.io / Docker Hub / ECR |
| Artifact storage | Use GitHub Releases / S3 |
| Secret management | Use Vault / env vars / GitHub Secrets |
| Build caching | CI platform responsibility |
| Notifications/alerting engine | Future scope — use PagerDuty / Slack webhooks from CI |

---

## 5. Shared Infrastructure

### 3.1 `lib/jsonld/context.ts` — Shared JSON-LD Context

Replaces the 7 duplicate context definitions. Single source of truth.

```typescript
export const NS = {
  ev: "https://pi.dev/events/",
  prov: "http://www.w3.org/ns/prov#",
  schema: "https://schema.org/",
  doap: "http://usefulinc.com/ns/doap#",
  foaf: "http://xmlns.com/foaf/0.1/",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
} as const;

export const JSONLD_CONTEXT = { ...NS };

export function piId(id: string): string {
  return `urn:pi:${id}`;
}

export function piRef(id: string): { "@id": string } {
  return { "@id": piId(id) };
}

export function xsdLong(v: number): { "@value": string; "@type": string } {
  return { "@value": String(v), "@type": "xsd:long" };
}

export function xsdInt(v: number): { "@value": string; "@type": string } {
  return { "@value": String(v), "@type": "xsd:integer" };
}

export function xsdBool(v: boolean): { "@value": string; "@type": string } {
  return { "@value": String(v), "@type": "xsd:boolean" };
}
```

### 3.2 `lib/db.ts` — Shared XTDB Connection

Replaces the 15 duplicate `postgres()` calls.

```typescript
import postgres from "postgres";

const XTDB_HOST = process.env.XTDB_EVENT_HOST ?? "localhost";
const XTDB_PORT = Number(process.env.XTDB_EVENT_PORT ?? "5433");

export type Sql = ReturnType<typeof postgres>;

export function connectXtdb(opts?: { max?: number }): Sql {
  return postgres({
    host: XTDB_HOST,
    port: XTDB_PORT,
    database: "xtdb",
    user: "xtdb",
    password: "xtdb",
    max: opts?.max ?? 1,
    idle_timeout: 30,
    connect_timeout: 10,
  });
}

export function typed(v: string | null): ReturnType<Sql["typed"]> {
  return postgres.typed(v as any, 25) as any;
}

export function typedNum(v: number | null): ReturnType<Sql["typed"]> {
  return postgres.typed(v as any, 20) as any;
}

export function typedBool(v: boolean | null): ReturnType<Sql["typed"]> {
  return postgres.typed(v as any, 16) as any;
}
```

### 3.3 `lib/jsonld/ids.ts` — ID Generation

```typescript
import { randomUUID } from "node:crypto";

export const ids = {
  requirement: () => `req:${randomUUID()}`,
  requirementLink: () => `reqlink:${randomUUID()}`,
  environment: () => `env:${randomUUID()}`,
  release: () => `rel:${randomUUID()}`,
  deployment: () => `depl:${randomUUID()}`,
  testRun: () => `trun:${randomUUID()}`,
  backupRecord: () => `bak:${randomUUID()}`,
  incident: () => `inc:${randomUUID()}`,
  workflowRun: () => `wfrun:${randomUUID()}`,
  workflowStepRun: () => `wfstep:${randomUUID()}`,
} as const;
```

---

## 6. Existing Entities (Current State)

14 tables currently in XTDB. All function correctly.

| Table | `_id` prefix | `@type` | Writer | Records |
|-------|-------------|---------|--------|---------|
| `projects` | `proj:` | `doap:Project` | `project-registry` ext | Projects detected from git/cwd |
| `session_projects` | `sp:` | `prov:Activity` | `project-registry` ext | Session↔project links |
| `decisions` | `dec:` | `prov:Activity` | `decision-log` ext | Architectural/code decisions |
| `artifacts` | `art:` | `prov:Entity` | `artifact-tracker` ext | Files tracked as artifacts |
| `artifact_versions` | `artver:` | `prov:Entity` | `artifact-tracker` ext | Version history per artifact |
| `artifact_reads` | `aread:` | `prov:Entity` | `artifact-tracker` ext | File read tracking |
| `artifact_cleanup` | — | — | `artifact-tracker` ext | Cleanup records |
| `delegations` | `del:` | `prov:Activity` | `agent-spawner` ext | Background agent spawns |
| `session_postmortems` | `pm:` | `prov:Activity` | `session-postmortem` ext | End-of-session summaries |
| `events` | — | `ev:{EventType}` | `xtdb-event-logger` ext | Raw Pi SDK events |
| `projections` | — | — | `xtdb-projector` ext | Materialized views |
| `file_metrics` | — | — | `xtdb-event-logger` ext | Per-file metrics |

---

## 7. New Entities (Full Specification)

### 5.1 Project Extensions (extend existing `projects` table)

**New columns added to `projects`:**

| Column | Type | Description | Default |
|--------|------|-------------|---------|
| `lifecycle_phase` | text | `planning` \| `active` \| `maintenance` \| `deprecated` \| `decommissioned` | `active` |
| `config_json` | text | Per-project JSON config (backup schedule, deploy target, etc.) | `{}` |

**NOT added as columns** (use separate tables instead):
- Dependencies → `project_dependencies` table
- Tags → `project_tags` table

**Updated JSON-LD:**

```jsonld
{
  "@context": "<shared>",
  "@id": "urn:pi:proj:ac75514059c1",
  "@type": "doap:Project",
  "doap:name": "harness",
  "ev:identityType": "git-remote",
  "ev:canonicalId": "git:github.com/opunix/harness",
  "schema:creativeWorkStatus": "active",
  "ev:configJson": "{\"backupSchedule\":\"0 3 * * *\"}",
  "doap:repository": {
    "@type": "doap:GitRepository",
    "doap:location": "git@github.com:opunix/harness.git"
  },
  "prov:generatedAtTime": { "@value": "1742000000000", "@type": "xsd:long" },
  "schema:dateModified": { "@value": "1742360000000", "@type": "xsd:long" },
  "ev:sessionCount": { "@value": "42", "@type": "xsd:integer" }
}
```

---

### 5.2 `project_dependencies`

**Purpose:** Track which projects depend on which other projects. Separate table for queryability.

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | `pdep:{uuid}` |
| `project_id` | text | FK → source project |
| `depends_on_id` | text | FK → target project |
| `dependency_type` | text | `runtime` \| `build` \| `dev` \| `optional` |
| `version_constraint` | text | Semver constraint (e.g., `^1.2.0`) or null |
| `ts` | bigint | When recorded |
| `jsonld` | text | JSON-LD document |

```jsonld
{
  "@context": "<shared>",
  "@id": "urn:pi:pdep:{uuid}",
  "@type": "ev:ProjectDependency",
  "ev:sourceProject": { "@id": "urn:pi:proj:abc123" },
  "ev:targetProject": { "@id": "urn:pi:proj:def456" },
  "ev:dependencyType": "runtime",
  "ev:versionConstraint": "^1.2.0",
  "ev:ts": { "@value": "1742360000000", "@type": "xsd:long" }
}
```

---

### 5.3 `project_tags`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | `ptag:{uuid}` |
| `project_id` | text | FK → project |
| `tag` | text | Tag string |
| `ts` | bigint | When added |

No JSON-LD needed — lightweight lookup table.

---

### 5.4 `requirements`

**Purpose:** Track requirements, user stories, acceptance criteria per project.

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | `req:{uuid}` |
| `project_id` | text | FK → project |
| `session_id` | text | Session that created it |
| `title` | text | Short title |
| `description` | text | Full description |
| `priority` | text | `critical` \| `high` \| `medium` \| `low` |
| `status` | text | `draft` \| `approved` \| `in-progress` \| `done` \| `cancelled` |
| `acceptance_criteria` | text | JSON array of strings |
| `source` | text | `manual` \| `import-markdown` \| `import-github` |
| `external_ref` | text | External ID (GitHub issue #, JIRA key) or null |
| `created_by` | text | Agent or user who created |
| `ts` | bigint | Creation timestamp |
| `updated_ts` | bigint | Last update timestamp |
| `jsonld` | text | JSON-LD document |

```jsonld
{
  "@context": "<shared>",
  "@id": "urn:pi:req:{uuid}",
  "@type": "schema:CreativeWork",
  "schema:name": "User authentication via OAuth2",
  "schema:description": "Users must be able to sign in via Google/GitHub OAuth2 flows",
  "schema:isPartOf": { "@id": "urn:pi:proj:ac75514059c1" },
  "schema:priority": "high",
  "schema:creativeWorkStatus": "in-progress",
  "ev:acceptanceCriteria": [
    "Google OAuth2 login works end-to-end",
    "GitHub OAuth2 login works end-to-end"
  ],
  "schema:isBasedOn": "manual",
  "schema:identifier": null,
  "prov:wasAttributedTo": { "@type": "prov:Person", "schema:name": "product-owner" },
  "prov:generatedAtTime": { "@value": "1742360000000", "@type": "xsd:long" }
}
```

---

### 5.5 `requirement_links`

**Purpose:** Traceability from requirements to decisions, artifacts, tests, deployments.

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | `reqlink:{uuid}` |
| `requirement_id` | text | FK → requirement |
| `target_id` | text | FK → any entity (decision, artifact, test_run, deployment) |
| `target_type` | text | `decision` \| `artifact` \| `test_run` \| `deployment` |
| `link_type` | text | `satisfies` \| `implements` \| `tests` \| `deploys` \| `blocks` \| `supersedes` |
| `session_id` | text | Session that created the link |
| `ts` | bigint | When linked |
| `jsonld` | text | JSON-LD document |

```jsonld
{
  "@context": "<shared>",
  "@id": "urn:pi:reqlink:{uuid}",
  "@type": "prov:Influence",
  "prov:influencer": { "@id": "urn:pi:req:a1b2c3d4" },
  "prov:entity": { "@id": "urn:pi:dec:x9y0z1w2" },
  "ev:linkType": "satisfies",
  "ev:targetType": "decision",
  "ev:ts": { "@value": "1742361000000", "@type": "xsd:long" }
}
```

---

### 5.6 `environments`

**Purpose:** Define deployment targets per project.

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | `env:{uuid}` |
| `project_id` | text | FK → project |
| `name` | text | Human name (e.g., "production-us-east") |
| `env_type` | text | `dev` \| `staging` \| `production` \| `preview` |
| `url` | text | Endpoint URL or null |
| `config_json` | text | Environment-specific config |
| `is_active` | boolean | Whether environment is currently active |
| `ts` | bigint | When created |
| `jsonld` | text | JSON-LD document |

```jsonld
{
  "@context": "<shared>",
  "@id": "urn:pi:env:{uuid}",
  "@type": "schema:SoftwareApplication",
  "schema:name": "production-us-east",
  "schema:isPartOf": { "@id": "urn:pi:proj:ac75514059c1" },
  "ev:envType": "production",
  "schema:url": "https://app.example.com",
  "ev:isActive": { "@value": "true", "@type": "xsd:boolean" },
  "ev:ts": { "@value": "1742360000000", "@type": "xsd:long" }
}
```

> **Type choice:** `schema:SoftwareApplication` (broader than `WebApplication`, covers CLIs, workers, data pipelines).

---

### 5.7 `releases`

**Purpose:** Track versioned releases per project.

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | `rel:{uuid}` |
| `project_id` | text | FK → project |
| `session_id` | text | Session that created it (or null if from CI) |
| `version` | text | Semver string |
| `name` | text | Release title |
| `changelog` | text | Markdown changelog |
| `git_tag` | text | Git tag name or null |
| `git_commit` | text | Commit SHA or null |
| `previous_release_id` | text | FK → previous release |
| `status` | text | `draft` \| `published` \| `yanked` |
| `ts` | bigint | When created |
| `jsonld` | text | JSON-LD document |

```jsonld
{
  "@context": "<shared>",
  "@id": "urn:pi:rel:{uuid}",
  "@type": ["doap:Version", "prov:Entity"],
  "doap:revision": "1.2.0",
  "doap:name": "v1.2.0 — OAuth2 & backup improvements",
  "schema:isPartOf": { "@id": "urn:pi:proj:ac75514059c1" },
  "schema:description": "Auto-generated changelog from 5 decisions, 12 artifacts",
  "prov:wasDerivedFrom": { "@id": "urn:pi:rel:{prev-uuid}" },
  "doap:revision": "v1.2.0",
  "schema:version": "abc123def456",
  "schema:creativeWorkStatus": "published",
  "prov:generatedAtTime": { "@value": "1742360000000", "@type": "xsd:long" }
}
```

---

### 5.8 `deployments`

**Purpose:** Track what is deployed where, when, by whom.

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | `depl:{uuid}` |
| `project_id` | text | FK → project |
| `environment_id` | text | FK → environment |
| `release_id` | text | FK → release (or null for ad-hoc) |
| `session_id` | text | Session (or null if from CI) |
| `deployed_by` | text | Agent/user/CI pipeline name |
| `status` | text | `pending` \| `in-progress` \| `succeeded` \| `failed` \| `rolled-back` |
| `rollback_of_id` | text | FK → deployment being rolled back (or null) |
| `notes` | text | Free-form notes |
| `started_ts` | bigint | Deploy start time |
| `completed_ts` | bigint | Deploy completion time (or null if pending) |
| `ts` | bigint | Record creation time |
| `jsonld` | text | JSON-LD document |

```jsonld
{
  "@context": "<shared>",
  "@id": "urn:pi:depl:{uuid}",
  "@type": ["schema:DeployAction", "prov:Activity"],
  "schema:object": { "@id": "urn:pi:rel:{uuid}" },
  "schema:targetCollection": { "@id": "urn:pi:env:{uuid}" },
  "prov:wasAssociatedWith": { "@type": "foaf:Agent", "foaf:name": "ci-pipeline" },
  "ev:status": "succeeded",
  "ev:notes": "Hotfix for auth token expiry",
  "schema:startTime": { "@value": "1742360000000", "@type": "xsd:long" },
  "schema:endTime": { "@value": "1742360300000", "@type": "xsd:long" },
  "ev:ts": { "@value": "1742360000000", "@type": "xsd:long" }
}
```

---

### 5.9 `test_runs`

**Purpose:** Record test execution results for traceability and release gating.

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | `trun:{uuid}` |
| `project_id` | text | FK → project |
| `session_id` | text | Session (or null if from CI) |
| `release_id` | text | FK → release being tested (or null) |
| `deployment_id` | text | FK → deployment that triggered test (or null) |
| `suite_name` | text | `unit` \| `integration` \| `e2e` \| `security` \| `performance` |
| `runner` | text | Who/what ran it: agent name, CI pipeline, manual |
| `passed` | bigint | Count of passing tests |
| `failed` | bigint | Count of failing tests |
| `skipped` | bigint | Count of skipped tests |
| `coverage` | text | Coverage percentage as string (e.g., "87.5") or null |
| `duration_ms` | bigint | Total run time in ms |
| `status` | text | `passed` \| `failed` \| `error` |
| `error_summary` | text | Summary of failures (first 500 chars) or null |
| `git_commit` | text | Commit SHA tested |
| `ts` | bigint | When run completed |
| `jsonld` | text | JSON-LD document |

```jsonld
{
  "@context": "<shared>",
  "@id": "urn:pi:trun:{uuid}",
  "@type": ["schema:AssessAction", "prov:Activity"],
  "schema:object": { "@id": "urn:pi:proj:ac75514059c1" },
  "prov:wasAssociatedWith": { "@type": "foaf:Agent", "foaf:name": "tester-agent" },
  "ev:suiteName": "unit",
  "ev:passed": { "@value": "42", "@type": "xsd:integer" },
  "ev:failed": { "@value": "0", "@type": "xsd:integer" },
  "ev:skipped": { "@value": "3", "@type": "xsd:integer" },
  "ev:coverage": "87.5",
  "ev:durationMs": { "@value": "12500", "@type": "xsd:long" },
  "ev:status": "passed",
  "ev:gitCommit": "abc123def456",
  "ev:ts": { "@value": "1742360000000", "@type": "xsd:long" }
}
```

---

### 5.10 `backup_records`

**Purpose:** Persist a record every time a backup completes (success or failure).

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | `bak:{uuid}` |
| `backup_type` | text | `csv-hot` \| `snapshot` |
| `status` | text | `completed` \| `failed` \| `verified` |
| `archive_path` | text | File path of backup archive |
| `size_bytes` | bigint | Archive size |
| `table_count` | bigint | Number of tables exported |
| `duration_ms` | bigint | How long backup took |
| `triggered_by` | text | `manual` \| `scheduled` \| `pre-deploy` |
| `verified_at` | bigint | Timestamp of verification test (or null) |
| `ts` | bigint | When backup completed |
| `jsonld` | text | JSON-LD document |

```jsonld
{
  "@context": "<shared>",
  "@id": "urn:pi:bak:{uuid}",
  "@type": "prov:Entity",
  "ev:backupType": "csv-hot",
  "ev:status": "completed",
  "ev:archivePath": "/Users/opunix/backups/xtdb/20260319T095447.tar.gz",
  "ev:sizeBytes": { "@value": "519045120", "@type": "xsd:long" },
  "ev:tableCount": { "@value": "13", "@type": "xsd:integer" },
  "ev:durationMs": { "@value": "297000", "@type": "xsd:long" },
  "ev:triggeredBy": "scheduled",
  "prov:wasGeneratedBy": {
    "@type": "prov:Activity",
    "prov:wasAssociatedWith": { "@type": "foaf:Agent", "foaf:name": "ops-scheduler" }
  },
  "ev:ts": { "@value": "1742360000000", "@type": "xsd:long" }
}
```

---

### 5.11 `incidents`

**Purpose:** Track operational incidents with root cause and resolution.

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | `inc:{uuid}` |
| `project_id` | text | FK → project (or null if infra-wide) |
| `title` | text | Short description |
| `description` | text | Detailed description |
| `severity` | text | `critical` \| `high` \| `medium` \| `low` |
| `status` | text | `open` \| `investigating` \| `resolved` \| `postmortem-done` |
| `root_cause` | text | Root cause analysis (filled after resolution) |
| `resolution` | text | What was done to fix it |
| `caused_by_id` | text | FK → deployment/change that caused it (or null) |
| `started_ts` | bigint | When incident started |
| `resolved_ts` | bigint | When resolved (or null) |
| `ts` | bigint | When recorded |
| `jsonld` | text | JSON-LD document |

```jsonld
{
  "@context": "<shared>",
  "@id": "urn:pi:inc:{uuid}",
  "@type": "schema:Event",
  "schema:name": "XTDB replica lag > 5 minutes",
  "schema:description": "Replica fell behind primary during large batch insert",
  "schema:isPartOf": { "@id": "urn:pi:proj:ac75514059c1" },
  "ev:severity": "high",
  "ev:status": "resolved",
  "ev:rootCause": "Redpanda consumer group rebalancing during broker restart",
  "ev:resolution": "Restarted replica, caught up in 2 minutes",
  "prov:wasInfluencedBy": { "@id": "urn:pi:depl:{uuid}" },
  "ev:startedTs": { "@value": "1742356800000", "@type": "xsd:long" },
  "ev:resolvedTs": { "@value": "1742357700000", "@type": "xsd:long" },
  "ev:ts": { "@value": "1742360000000", "@type": "xsd:long" }
}
```

---

### 5.12 `workflow_runs`

**Purpose:** Persist workflow execution history (currently lost when session ends).

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | `wfrun:{uuid}` |
| `project_id` | text | FK → project |
| `session_id` | text | Session that ran the workflow |
| `workflow_name` | text | Name of the workflow definition |
| `task` | text | User's task description |
| `status` | text | `running` \| `completed` \| `failed` \| `cancelled` |
| `total_steps` | bigint | Total number of steps |
| `completed_steps` | bigint | Steps completed so far |
| `started_ts` | bigint | When workflow started |
| `completed_ts` | bigint | When finished (or null) |
| `ts` | bigint | Record creation time |
| `jsonld` | text | JSON-LD document |

```jsonld
{
  "@context": "<shared>",
  "@id": "urn:pi:wfrun:{uuid}",
  "@type": ["schema:HowTo", "prov:Activity"],
  "schema:name": "feature",
  "ev:task": "Implement OAuth2 authentication",
  "schema:isPartOf": { "@id": "urn:pi:proj:ac75514059c1" },
  "prov:wasAssociatedWith": { "@type": "foaf:Agent", "foaf:name": "pi-agent" },
  "ev:status": "completed",
  "ev:totalSteps": { "@value": "6", "@type": "xsd:integer" },
  "ev:completedSteps": { "@value": "6", "@type": "xsd:integer" },
  "ev:startedTs": { "@value": "1742350000000", "@type": "xsd:long" },
  "ev:completedTs": { "@value": "1742360000000", "@type": "xsd:long" },
  "ev:ts": { "@value": "1742350000000", "@type": "xsd:long" }
}
```

---

### 5.13 `workflow_step_runs`

**Purpose:** Individual step execution within a workflow run.

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | `wfstep:{uuid}` |
| `workflow_run_id` | text | FK → workflow_run |
| `step_name` | text | Step name from definition |
| `step_position` | bigint | 1-based step index |
| `agent_role` | text | Agent role used (e.g., "architect") |
| `status` | text | `pending` \| `active` \| `done` \| `skipped` \| `failed` |
| `started_ts` | bigint | When step started |
| `completed_ts` | bigint | When step finished (or null) |
| `ts` | bigint | Record creation time |
| `jsonld` | text | JSON-LD document |

```jsonld
{
  "@context": "<shared>",
  "@id": "urn:pi:wfstep:{uuid}",
  "@type": ["schema:HowToStep", "prov:Activity"],
  "schema:name": "implement",
  "schema:position": { "@value": "3", "@type": "xsd:integer" },
  "ev:agentRole": "worker",
  "ev:status": "done",
  "prov:wasInformedBy": { "@id": "urn:pi:wfrun:{parent-uuid}" },
  "ev:startedTs": { "@value": "1742355000000", "@type": "xsd:long" },
  "ev:completedTs": { "@value": "1742358000000", "@type": "xsd:long" },
  "ev:ts": { "@value": "1742355000000", "@type": "xsd:long" }
}
```

---

### 5.14 `decommission_records`

**Purpose:** Record project decommissioning with checklist and impact.

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | `decom:{uuid}` |
| `project_id` | text | FK → project being decommissioned |
| `reason` | text | Why decommissioning |
| `replacement_project_id` | text | FK → replacement project (or null) |
| `impacted_project_ids` | text | JSON array of project IDs that depended on this |
| `checklist_json` | text | JSON object of checklist items with boolean values |
| `status` | text | `in-progress` \| `completed` |
| `decommissioned_by` | text | Who initiated |
| `archive_path` | text | Path to data archive (or null) |
| `ts` | bigint | When initiated |
| `completed_ts` | bigint | When fully done (or null) |
| `jsonld` | text | JSON-LD document |

```jsonld
{
  "@context": "<shared>",
  "@id": "urn:pi:decom:{uuid}",
  "@type": ["schema:DeleteAction", "prov:Activity"],
  "schema:object": { "@id": "urn:pi:proj:ac75514059c1" },
  "prov:wasAssociatedWith": { "@type": "foaf:Agent", "foaf:name": "opunix" },
  "ev:reason": "Replaced by harness-v2",
  "ev:replacementProject": { "@id": "urn:pi:proj:xyz789" },
  "ev:impactedProjects": [
    { "@id": "urn:pi:proj:def456" }
  ],
  "ev:status": "completed",
  "ev:archivePath": "/archive/harness-20260319.tar.gz",
  "ev:ts": { "@value": "1742360000000", "@type": "xsd:long" }
}
```

---

## 8. Ownership Matrix

| Entity | Writer Subsystem | Trigger | Source of Truth |
|--------|-----------------|---------|-----------------|
| `projects` (extended) | `project-registry` ext | session_start (auto) | XTDB |
| `project_dependencies` | `project-lifecycle` ext | `/project deps add` command | XTDB |
| `project_tags` | `project-lifecycle` ext | `/project tag` command | XTDB |
| `requirements` | `requirements-tracker` ext | `/req add`, `/req import` | XTDB |
| `requirement_links` | `requirements-tracker` ext | `/req link`, auto on decision/artifact create | XTDB |
| `environments` | `deployment-tracker` ext OR ops API | `/env add` or `POST /api/environments` | XTDB |
| `releases` | `deployment-tracker` ext OR CI webhook | `/release create` or `POST /api/releases` | XTDB + git tags |
| `deployments` | CI webhook OR ops API OR ext | `POST /api/deployments` or `/deploy record` | CI pipeline |
| `test_runs` | CI webhook OR Pi ext | `POST /api/test-runs` or auto from test commands | CI pipeline |
| `backup_records` | **ops API exclusively** | Backup job completion in `lib/backup.ts` | ops API |
| `incidents` | ops API OR `incident-tracker` ext | `POST /api/incidents` or `/incident create` | ops API |
| `workflow_runs` | `workflow-engine` ext | Workflow start/complete | XTDB |
| `workflow_step_runs` | `workflow-engine` ext | Step transitions | XTDB |
| `decommission_records` | `project-lifecycle` ext | `/project decommission` | XTDB |

---

## 9. System Boundaries

### Rule: Each subsystem writes only its own records

```
Pi Extensions (in-process)
├── project-registry         → projects, session_projects
├── project-lifecycle (new)  → project_dependencies, project_tags, decommission_records
│                              + extends projects with lifecycle_phase, config_json
├── decision-log             → decisions
├── artifact-tracker         → artifacts, artifact_versions, artifact_reads, artifact_cleanup
├── session-postmortem       → session_postmortems
├── agent-spawner            → delegations
├── requirements-tracker (new) → requirements, requirement_links
├── deployment-tracker (new)   → environments, releases (can also come from CI)
├── workflow-engine (extended) → workflow_runs, workflow_step_runs
└── xtdb-event-logger        → events, file_metrics

Ops API (:3335)
├── backup operations        → backup_records
├── incident management      → incidents
├── CI webhook receiver      → deployments, test_runs, releases
├── health monitoring        → (in-memory, future: health_checks table)
└── replica/topic management → (operational, no records)

Dashboard UI (:3333)
└── READ ONLY — all tables

Web Chat (:3334)
└── Writes via Pi extensions only
```

---

## 10. Event Emission & Observability

### Problem
New lifecycle records won't appear in the event stream, SSE dashboard, or projector because they bypass the `xtdb-event-logger`.

### Solution: Lifecycle Change Notifications

Each lifecycle extension emits a synthetic Pi event via `ctx.session.emit()` (if available) or logs to a `lifecycle_events` table that the dashboard can poll.

**Simpler approach chosen:** Each writer INSERT also writes a row to a lightweight `lifecycle_events` table:

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | `lev:{uuid}` |
| `event_type` | text | `requirement_created`, `deployment_succeeded`, `release_published`, etc. |
| `entity_id` | text | `@id` of the entity that changed |
| `entity_type` | text | Table name |
| `project_id` | text | FK → project |
| `summary` | text | Human-readable one-liner |
| `ts` | bigint | When it happened |

The dashboard SSE endpoint polls this table (same as it polls `events`) to include lifecycle activity in the unified stream. No JSON-LD needed for this table — it's an internal notification mechanism, not a provenance entity.

### Event Types

| Event | Emitted By | When |
|-------|-----------|------|
| `requirement_created` | requirements-tracker ext | New requirement added |
| `requirement_status_changed` | requirements-tracker ext | Status transition |
| `requirement_linked` | requirements-tracker ext | New traceability link |
| `environment_created` | deployment-tracker ext / ops API | New environment registered |
| `release_created` | deployment-tracker ext / CI | New release created |
| `deployment_started` | CI webhook / ops API | Deployment begins |
| `deployment_succeeded` | CI webhook / ops API | Deployment completes |
| `deployment_failed` | CI webhook / ops API | Deployment fails |
| `test_run_completed` | CI webhook / ext | Test suite finishes |
| `backup_completed` | ops API | Backup finishes |
| `backup_failed` | ops API | Backup fails |
| `incident_opened` | ops API / ext | New incident |
| `incident_resolved` | ops API / ext | Incident resolved |
| `workflow_started` | workflow-engine | Workflow begins |
| `workflow_completed` | workflow-engine | Workflow finishes |
| `lifecycle_phase_changed` | project-lifecycle ext | Project phase transition |
| `project_decommissioned` | project-lifecycle ext | Project decommissioned |

---

## 11. Retention & Archival Policy

| Entity | Retention Rule | Rationale |
|--------|---------------|-----------|
| `projects` | Forever | Core identity, never delete |
| `requirements` | Forever | Business context |
| `requirement_links` | Forever | Traceability chain |
| `decisions` | Forever | Architectural history |
| `artifacts` | Forever | File identity |
| `artifact_versions` | Last 100 per artifact | Oldest versions rarely needed |
| `releases` | Forever | Version history |
| `deployments` | Last 50 per environment | Historical deployments |
| `test_runs` | Last 30 per project per suite | Trend data, not raw history |
| `backup_records` | Last 30 | Older records = just metadata |
| `incidents` | Forever | Institutional memory |
| `workflow_runs` | Last 50 per workflow | Historical runs |
| `workflow_step_runs` | Cascades with workflow_runs | Linked data |
| `events` | Last 100K or 90 days | Largest table by far |
| `lifecycle_events` | Last 10K or 30 days | Notification feed |
| `session_postmortems` | Forever | Session history |

**Implementation:** Add a `task xtdb:retain` task that enforces retention by deleting old rows. Run weekly or as needed.

**Backup archives:** Governed by `config_json.backupRetention` in project config. Default: keep last 10 archives, delete older. Implemented in ops API.

---

## 12. Migration Strategy

### Existing `projects` table
- XTDB is schema-on-read: missing columns return `null`
- New columns (`lifecycle_phase`, `config_json`) will be `null` for existing rows
- **Backfill task:** `task project:migrate` — reads all existing projects, sets `lifecycle_phase = 'active'`, `config_json = '{}'`, and rebuilds the `jsonld` column with new fields
- Run once after deploying `project-lifecycle` extension

### Existing extensions → shared lib migration
- Migrate each extension from local `JSONLD_CONTEXT` / `postgres()` to shared `lib/` imports
- One extension at a time, test after each
- Order: project-registry → decision-log → artifact-tracker → session-postmortem → agent-spawner → others
- Each migration is a separate commit

### New tables
- All new tables are created on first write (INSERT creates the table in XTDB)
- No DDL migration needed — XTDB auto-creates tables

---

## 13. Security & RBAC

### Current State
- No authentication on any endpoint (flagged in security audit)
- `POST /api/wipe` deletes all data with no auth

### Lifecycle-Specific Concerns
- Destructive lifecycle actions: decommission, wipe, deployment rollback
- Sensitive data: incident root causes, deployment credentials in config_json

### Minimum Required (Phase 1)
1. **API key auth** for ops API mutations: `X-Ops-Key` header checked against env var `OPS_API_KEY`
2. **CI webhook secret**: HMAC signature verification on `POST /api/deployments`, `/api/test-runs`, `/api/releases`
3. **Read-only dashboard**: Dashboard UI already read-only — no changes needed

### Future (Phase 2+)
4. Role-based access: `admin` (all ops), `developer` (requirements, releases), `viewer` (read-only)
5. Audit log: who accessed/modified what when

### Implementation
```typescript
// Middleware for ops API
function requireOpsKey(c, next) {
  const key = c.req.header("X-Ops-Key");
  if (key !== process.env.OPS_API_KEY) return c.json({ error: "Unauthorized" }, 401);
  return next();
}

// Apply to all mutating routes
app.post("/api/*", requireOpsKey);
app.delete("/api/*", requireOpsKey);
```

---

## 14. UI Routes & Dashboard

### New Dashboard Pages

| Route | Purpose | Data Source |
|-------|---------|------------|
| `/portfolio` | All projects grid: name, phase, health, last activity, alerts | `projects` + `lifecycle_events` |
| `/projects/:id/requirements` | Requirements list with coverage matrix | `requirements` + `requirement_links` |
| `/projects/:id/releases` | Release timeline with changelogs | `releases` |
| `/projects/:id/deployments` | Deployment history per environment | `deployments` + `environments` |
| `/projects/:id/tests` | Test run history with pass/fail trends | `test_runs` |
| `/projects/:id/incidents` | Incident timeline | `incidents` |
| `/projects/:id/workflows` | Workflow run history | `workflow_runs` + `workflow_step_runs` |
| `/ops/backups` | Backup history, storage usage, verification status | `backup_records` |
| `/ops/incidents` | Cross-project incident view | `incidents` |

### New API Endpoints (Dashboard)

| Endpoint | Returns |
|----------|---------|
| `GET /api/portfolio` | All projects with phase, health score, last event |
| `GET /api/projects/:id/requirements` | Requirements with coverage counts |
| `GET /api/projects/:id/releases` | Releases with deployment status per env |
| `GET /api/projects/:id/tests` | Test run summaries with trends |
| `GET /api/lifecycle/stream` | SSE stream of `lifecycle_events` |

### New Ops API Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/environments` | POST | Register environment | ops key |
| `/api/releases` | POST | Record release (from CI) | webhook secret |
| `/api/deployments` | POST | Record deployment (from CI) | webhook secret |
| `/api/test-runs` | POST | Record test results (from CI) | webhook secret |
| `/api/incidents` | POST | Create incident | ops key |
| `/api/incidents/:id` | PATCH | Update incident status/resolution | ops key |
| `/api/backup/schedule` | GET/PUT | View/set backup schedule | ops key |

---

## 15. Workflow Templates

Files in `~/.pi/agent/workflows/` loaded by the workflow engine. Each is a `schema:HowTo` JSON-LD document.

| Workflow | Steps | Agents Used |
|----------|-------|-------------|
| `new-project.jsonld` | init-repo → define-requirements → design-architecture → setup-ci → first-deploy | worker, planner, architect, worker, worker |
| `feature.jsonld` | requirement → design → implement → test → review → deploy | planner, architect, worker, tester, reviewer, worker |
| `bugfix.jsonld` | reproduce → debug → fix → test → review → deploy | debugger, debugger, worker, tester, reviewer, worker |
| `security-patch.jsonld` | audit → patch → test → emergency-deploy → postmortem | security-auditor, worker, tester, worker, documenter |
| `release.jsonld` | freeze → test-all → changelog → tag → stage → approve → prod | worker, tester, documenter, worker, worker, reviewer, worker |
| `maintenance.jsonld` | dep-update → security-scan → perf-check → backup-verify | migrator, security-auditor, optimizer, worker |
| `decommission.jsonld` | impact-analysis → data-export → archive → notify → tombstone | researcher, worker, worker, documenter, worker |

---

## 16. Implementation Phases

### Phase 0: Foundation (prerequisite for all other phases)
- [ ] Create `lib/jsonld/context.ts` — shared namespaces, context, helpers
- [ ] Create `lib/jsonld/ids.ts` — ID generation functions
- [ ] Create `lib/db.ts` — shared XTDB connection factory
- [ ] Migrate existing extensions to use shared libs (one at a time, test each)
- [ ] Document conventions in `docs/CONVENTIONS.md`

### Phase 1: Project Lifecycle Core
- [ ] Extend `project-registry` with `lifecycle_phase`, `config_json`
- [ ] Create `project-lifecycle` extension: `/project status`, `/project config`
- [ ] Create `project_dependencies` table + `/project deps` command
- [ ] Create `project_tags` table + `/project tag` command
- [ ] Backfill migration task: `task project:migrate`
- [ ] Create `lifecycle_events` table + notification helper

### Phase 2: Workflow Persistence
- [ ] Add XTDB connection to `workflow-engine`
- [ ] Create `workflow_runs` + `workflow_step_runs` tables
- [ ] Persist workflow start/step/complete to XTDB
- [ ] Write at least 2 workflow templates (`feature.jsonld`, `bugfix.jsonld`)
- [ ] Deploy to `~/.pi/agent/workflows/`

### Phase 3: Requirements & Test Evidence
- [ ] Create `requirements-tracker` extension
- [ ] Implement `requirements` + `requirement_links` tables
- [ ] Commands: `/req add`, `/req list`, `/req link`, `/req coverage`, `/req import`
- [ ] Create `test_runs` table
- [ ] Wire test commands to produce `test_runs` records
- [ ] Auto-link: when a decision is logged, check if active requirement matches

### Phase 4: Releases & Deployments
- [ ] Create `deployment-tracker` extension
- [ ] Implement `environments`, `releases`, `deployments` tables
- [ ] Commands: `/env add`, `/release create`, `/deploy record`, `/deploy status`
- [ ] Auto-changelog: aggregate decisions + artifacts since last release
- [ ] CI webhook endpoints in ops API: `POST /api/releases`, `/api/deployments`, `/api/test-runs`
- [ ] Webhook HMAC verification

### Phase 5: Operations & Incidents
- [ ] Add `backup_records` persistence to ops API `lib/backup.ts`
- [ ] Backup scheduler with cron + retention policy
- [ ] Backup verification (restore to temp, sanity query, destroy)
- [ ] Create `incidents` table + ops API CRUD
- [ ] API key auth middleware for ops API mutations

### Phase 6: Portfolio Dashboard & Decommissioning
- [ ] Portfolio page in dashboard: all projects at a glance
- [ ] Lifecycle SSE stream (`/api/lifecycle/stream`)
- [ ] Per-project pages: requirements, releases, deployments, tests, incidents, workflows
- [ ] Create `decommission_records` table + `/project decommission` command
- [ ] Decommission workflow template
- [ ] Retention task: `task xtdb:retain`
- [ ] Remaining workflow templates (5 more)

---

## 17. Volume Estimates

For a single-user harness managing ~10 projects:

| Entity | Estimated Volume | Growth Rate | Storage Impact |
|--------|-----------------|-------------|----------------|
| `projects` | 10-20 rows | ~1/month | Negligible |
| `project_dependencies` | 20-50 rows | ~2/month | Negligible |
| `project_tags` | 30-100 rows | ~5/month | Negligible |
| `requirements` | 50-200 per project | ~10/month | Low |
| `requirement_links` | 200-1000 total | ~20/month | Low |
| `environments` | 2-5 per project | ~1/quarter | Negligible |
| `releases` | 1-4/month per project | ~20/month total | Low |
| `deployments` | 5-20/month per project | ~100/month total | Low |
| `test_runs` | 10-50/day if CI | ~1000/month | Moderate |
| `backup_records` | 1-3/day | ~60/month | Negligible |
| `incidents` | 1-5/month | ~5/month | Negligible |
| `workflow_runs` | 5-10/week | ~30/month | Low |
| `workflow_step_runs` | 20-60/week | ~200/month | Low |
| `lifecycle_events` | 50-200/day | ~5000/month | Moderate (retained 30d) |
| `events` (existing) | 500-2000/day | ~50K/month | **Largest by far** |

**Total new storage:** ~5-10MB/month for lifecycle tables (excluding events). Retention policies keep `test_runs` and `lifecycle_events` bounded.

---

## Provenance Graph — Complete Entity Relationships

```
                         doap:Project (projects)
                              │
        ┌─────────┬───────────┼───────────┬──────────────┬──────────┐
        │         │           │           │              │          │
   project_deps  project_tags │      environments    incidents  decommission
        │                     │           │                        records
        │              requirements   deployments
        │                  │     │        │
        │           requirement  │    test_runs
        │             _links     │
        │               │        │
        │          ┌────┘        │
        │     decisions     releases
        │          │           │
        │     artifacts ───────┘
        │          │
        │   artifact_versions
        │
   workflow_runs ─── workflow_step_runs
        │
   session_postmortems ─── delegations
        │
   session_projects ─── events
```

All edges are `@id` references. The entire graph is exportable as a `prov:Bundle` via the existing provenance export mechanism.
