# Project Lifecycle Management — Gap Analysis & Proposal

> Generated: 2026-03-19 | Updated: 2026-03-19 (JSON-LD alignment pass)
> Scope: Full application lifecycle — requirements → development → deployment → maintenance → decommissioning

---

## JSON-LD Vocabulary & Ontology Strategy

All data in the harness is modeled as JSON-LD using established W3C/community ontologies.
New lifecycle entities **must** follow the same patterns. Here's the shared vocabulary:

### Current Namespace Registry (`xtdb-event-logger/rdf/namespaces.ts`)
| Prefix | URI | Used For |
|--------|-----|----------|
| `ev:` | `https://pi.dev/events/` | Custom predicates (sessionId, path, outcome, etc.) |
| `prov:` | `http://www.w3.org/ns/prov#` | Provenance (Activity, Entity, Agent, wasDerivedFrom, etc.) |
| `schema:` | `https://schema.org/` | Actions (SearchAction, CreateAction), general types |
| `doap:` | `http://usefulinc.com/ns/doap#` | Projects (doap:Project, doap:GitRepository) |
| `foaf:` | `http://xmlns.com/foaf/0.1/` | Agent identity (foaf:Agent, foaf:name) |
| `xsd:` | `http://www.w3.org/2001/XMLSchema#` | Typed literals (xsd:long, xsd:integer, xsd:boolean) |
| `rdf:` | `http://www.w3.org/1999/02/22-rdf-syntax-ns#` | rdf:type |

### Current Entity Modeling Patterns
| Entity | `@type` | Ontology | Where |
|--------|---------|----------|-------|
| Project | `doap:Project` | DOAP | `project-registry/rdf.ts` |
| Session↔Project link | `prov:Activity` | PROV-O | `project-registry/rdf.ts` |
| Decision | `prov:Activity` | PROV-O | `decision-log/rdf.ts` |
| Artifact version | `prov:Entity` | PROV-O | `artifact-tracker/versioning.ts` |
| Session postmortem | `prov:Activity` | PROV-O | `session-postmortem/index.ts` |
| Workflow definition | `schema:HowTo` | Schema.org | `workflow-engine/rdf/` |
| Workflow step | `schema:HowToStep` + action types | Schema.org | `workflow-engine/rdf/` |
| Raw events | `ev:{PascalCaseEvent}` | Custom | `xtdb-event-logger/rdf/triples.ts` |
| Provenance bundle | `prov:Bundle` + `@graph` | PROV-O | `artifact-tracker/provenance.ts` |

### URI Patterns
| Entity | Pattern | Example |
|--------|---------|---------|
| Project | `urn:pi:proj:{sha256-prefix}` | `urn:pi:proj:ac75514059c1` |
| Decision | `urn:pi:dec:{uuid}` | `urn:pi:dec:a1b2c3d4-...` |
| Artifact version | `urn:pi:artver:{uuid}` | `urn:pi:artver:e5f6g7h8-...` |
| Session | `urn:pi:session:{sessionId}` | `urn:pi:session:/path/to/session` |
| Tool call | `urn:pi:toolcall:{callId}` | `urn:pi:toolcall:xyz789` |
| Event | `urn:uuid:{uuid}` | `urn:uuid:12345-...` |

### New Namespaces Needed for Lifecycle
| Prefix | URI | Covers |
|--------|-----|--------|
| `req:` | `https://pi.dev/requirements/` | Requirements-specific predicates |
| `deploy:` | `https://pi.dev/deployments/` | Deployment-specific predicates |
| `ops:` | `https://pi.dev/ops/` | Operational predicates (backup, incident, maintenance) |

> **Rule:** Use standard ontology types (`schema:`, `prov:`, `doap:`) for `@type`. Use `ev:` or domain-specific prefixes (`req:`, `deploy:`, `ops:`) only for custom predicates that have no standard equivalent.

---

## What We Already Have ✅

### Infrastructure & Data Layer
| Capability | Implementation | Status |
|---|---|---|
| **Event store** | XTDB cluster (primary + replica + Redpanda) | ✅ Production |
| **Event logging** | `xtdb-event-logger` — 25+ event handlers, N3 triples → JSON-LD | ✅ Production |
| **Hot backup (CSV)** | `task xtdb:backup` — psql CSV export, 13 tables | ✅ Production |
| **Snapshot backup** | `xtdb-ops-api/lib/backup.ts` — stop-replica-tar approach | ✅ Production |
| **Restore** | `task xtdb:restore` + ops API restore endpoint | ✅ Production |
| **Ops API** | `xtdb-ops-api` — health, backup, replica, topics (port 3335) | ✅ Production |
| **Replication** | Primary/replica via Redpanda log shipping | ✅ Production |
| **Projections** | `xtdb-projector` — materialized views from events | ✅ Production |

### Project Awareness
| Capability | Implementation | JSON-LD | Status |
|---|---|---|---|
| **Project registry** | `project-registry` | `doap:Project` + `doap:GitRepository` | ✅ |
| **Session↔Project** | `session_projects` table | `prov:Activity` + `prov:used → doap:Project` | ✅ |
| **Session postmortems** | `session-postmortem` | `prov:Activity` with ev: metrics | ✅ |

### Development Support
| Capability | Implementation | JSON-LD | Status |
|---|---|---|---|
| **Decision tracking** | `decision-log` | `prov:Activity` + `prov:used → doap:Project` | ✅ |
| **Artifact tracking** | `artifact-tracker` | `prov:Entity` + `prov:wasDerivedFrom` chain | ✅ |
| **Provenance export** | `artifact-tracker/provenance.ts` | `prov:Bundle` with `@graph` aggregation | ✅ |
| **Workflow engine** | `workflow-engine` | `schema:HowTo` + `schema:HowToStep` | ✅ (no workflows defined) |
| **20 agent roles** | agents/ directory | N/A (markdown templates) | ✅ |
| **Quality hooks** | `quality-hooks` | N/A (runtime only) | ✅ |
| **Git checkpoints** | `git-checkpoint` | N/A (git operations) | ✅ |

### Observability & Context
| Capability | Implementation | Status |
|---|---|---|
| **Dashboard UI** | `xtdb-event-logger-ui` | ✅ |
| **Web chat** | `web-chat` | ✅ |
| **Canary monitor** | `canary-monitor` | ✅ |
| **Alignment monitor** | `alignment-monitor` | ✅ |
| **Knowledge extraction** | knowledge-extractor, composer, checkpoint | ✅ |

---

## What's Missing ❌ — With JSON-LD Models

### 1. REQUIREMENTS MANAGEMENT

**New table: `requirements`**

```jsonld
{
  "@context": {
    "prov": "http://www.w3.org/ns/prov#",
    "schema": "https://schema.org/",
    "ev": "https://pi.dev/events/",
    "req": "https://pi.dev/requirements/",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@id": "urn:pi:req:a1b2c3d4",
  "@type": "schema:CreativeWork",
  "schema:name": "User authentication via OAuth2",
  "schema:description": "Users must be able to sign in via Google/GitHub OAuth2 flows",
  "schema:isPartOf": { "@id": "urn:pi:proj:ac75514059c1" },
  "req:priority": "high",
  "req:status": "in-progress",
  "req:acceptanceCriteria": [
    "Google OAuth2 login works end-to-end",
    "GitHub OAuth2 login works end-to-end",
    "Session persists across page reloads"
  ],
  "prov:wasAttributedTo": { "@type": "foaf:Agent", "foaf:name": "product-owner" },
  "ev:ts": { "@value": "1742360000000", "@type": "xsd:long" }
}
```

**New table: `requirement_links` (traceability)**

```jsonld
{
  "@context": { "prov": "http://www.w3.org/ns/prov#", "req": "https://pi.dev/requirements/", "ev": "https://pi.dev/events/" },
  "@id": "urn:pi:reqlink:e5f6g7h8",
  "@type": "prov:Influence",
  "prov:influencer": { "@id": "urn:pi:req:a1b2c3d4" },
  "prov:entity": { "@id": "urn:pi:dec:x9y0z1w2" },
  "req:linkType": "satisfies",
  "ev:ts": { "@value": "1742361000000", "@type": "xsd:long" }
}
```

> **Ontology rationale:** Requirements are `schema:CreativeWork` (structured authored content). Links use `prov:Influence` — the W3C PROV-O class for one thing affecting another. `linkType` values: `satisfies`, `implements`, `tests`, `blocks`, `supersedes`.

| Missing Piece | JSON-LD Type | Priority |
|---|---|---|
| Requirements store | `schema:CreativeWork` | 🔴 High |
| Req → Decision traceability | `prov:Influence` | 🔴 High |
| Req → Artifact traceability | `prov:Influence` | 🔴 High |
| Requirements import (markdown/issues) | Parser → `schema:CreativeWork` | 🟡 Medium |
| Coverage dashboard | Query across `requirement_links` | 🟡 Medium |
| Change requests | `schema:CreativeWork` with `prov:wasRevisionOf` | 🟡 Medium |

---

### 2. PROJECT LIFECYCLE STATE

**Extend existing `projects` table (doap:Project):**

```jsonld
{
  "@context": {
    "doap": "http://usefulinc.com/ns/doap#",
    "schema": "https://schema.org/",
    "ev": "https://pi.dev/events/",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@id": "urn:pi:proj:ac75514059c1",
  "@type": "doap:Project",
  "doap:name": "harness",
  "ev:identityType": "git-remote",
  "ev:canonicalId": "git:github.com/opunix/harness",

  "ev:lifecyclePhase": "active",
  "ev:configJson": "{\"backupSchedule\":\"0 3 * * *\",\"deployTarget\":\"docker-local\"}",
  "ev:tags": ["infrastructure", "ai-harness"],
  "ev:dependsOn": [
    { "@id": "urn:pi:proj:b2c3d4e5" }
  ],

  "doap:repository": {
    "@type": "doap:GitRepository",
    "doap:location": "git@github.com:opunix/harness.git"
  },
  "ev:firstSeenTs": { "@value": "1742000000000", "@type": "xsd:long" },
  "ev:lastSeenTs": { "@value": "1742360000000", "@type": "xsd:long" },
  "ev:sessionCount": { "@value": "42", "@type": "xsd:integer" }
}
```

> **Ontology rationale:** `doap:Project` is already used. Lifecycle phase and tags are custom `ev:` predicates since DOAP doesn't model lifecycle states. Dependencies use `@id` references to other projects.

| Missing Piece | JSON-LD Change | Priority |
|---|---|---|
| Lifecycle phase | Add `ev:lifecyclePhase` to `doap:Project` | 🔴 High |
| Project config | Add `ev:configJson` to `doap:Project` | 🔴 High |
| Project dependencies | Add `ev:dependsOn` (array of `@id` refs) | 🟡 Medium |
| Project tags | Add `ev:tags` array | 🟢 Low |

---

### 3. DEPLOYMENT & RELEASE MANAGEMENT

**New table: `environments`**

```jsonld
{
  "@context": {
    "schema": "https://schema.org/",
    "deploy": "https://pi.dev/deployments/",
    "ev": "https://pi.dev/events/",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@id": "urn:pi:env:prod-us-east",
  "@type": "schema:WebApplication",
  "schema:name": "production-us-east",
  "deploy:envType": "production",
  "schema:isPartOf": { "@id": "urn:pi:proj:ac75514059c1" },
  "schema:url": "https://app.example.com",
  "deploy:configJson": "{\"region\":\"us-east-1\",\"replicas\":3}",
  "ev:ts": { "@value": "1742360000000", "@type": "xsd:long" }
}
```

**New table: `deployments`**

```jsonld
{
  "@context": {
    "prov": "http://www.w3.org/ns/prov#",
    "schema": "https://schema.org/",
    "deploy": "https://pi.dev/deployments/",
    "ev": "https://pi.dev/events/",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@id": "urn:pi:deploy:f1g2h3i4",
  "@type": ["schema:DeployAction", "prov:Activity"],
  "schema:object": { "@id": "urn:pi:release:v1.2.0" },
  "schema:targetCollection": { "@id": "urn:pi:env:prod-us-east" },
  "prov:wasAssociatedWith": { "@type": "foaf:Agent", "foaf:name": "ci-pipeline" },
  "deploy:status": "succeeded",
  "deploy:rollbackOf": null,
  "deploy:notes": "Hotfix for auth token expiry",
  "schema:startTime": { "@value": "2026-03-19T10:30:00Z", "@type": "xsd:dateTime" },
  "schema:endTime": { "@value": "2026-03-19T10:35:00Z", "@type": "xsd:dateTime" },
  "ev:ts": { "@value": "1742360000000", "@type": "xsd:long" }
}
```

**New table: `releases`**

```jsonld
{
  "@context": {
    "schema": "https://schema.org/",
    "doap": "http://usefulinc.com/ns/doap#",
    "prov": "http://www.w3.org/ns/prov#",
    "ev": "https://pi.dev/events/",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@id": "urn:pi:release:v1.2.0",
  "@type": ["doap:Version", "prov:Entity"],
  "doap:revision": "1.2.0",
  "doap:name": "v1.2.0 — OAuth2 & backup improvements",
  "schema:isPartOf": { "@id": "urn:pi:proj:ac75514059c1" },
  "schema:description": "Auto-generated changelog from 5 decisions, 12 artifacts",
  "prov:wasGeneratedBy": { "@id": "urn:pi:session:xyz" },
  "prov:wasDerivedFrom": { "@id": "urn:pi:release:v1.1.0" },
  "ev:gitTag": "v1.2.0",
  "ev:ts": { "@value": "1742360000000", "@type": "xsd:long" }
}
```

> **Ontology rationale:** Deployments are `schema:DeployAction` (Schema.org action vocabulary) **and** `prov:Activity` (provenance tracking). Releases are `doap:Version` (DOAP's native version class) + `prov:Entity` (something generated, derivable). Environments are `schema:WebApplication` (closest Schema.org type for a deployed service endpoint).

| Missing Piece | JSON-LD Type | Priority |
|---|---|---|
| Environment registry | `schema:WebApplication` | 🔴 High |
| Deployment records | `schema:DeployAction` + `prov:Activity` | 🔴 High |
| Release versioning | `doap:Version` + `prov:Entity` | 🔴 High |
| Deployment workflows | Workflow template (`schema:HowTo`) | 🟡 Medium |
| Rollback tracking | `schema:DeployAction` with `deploy:rollbackOf` | 🟡 Medium |
| Deploy-time checks | `prov:Activity` linked to deploy via `prov:wasInformedBy` | 🟡 Medium |

---

### 4. MAINTENANCE & OPERATIONS

**New table: `backup_records`**

```jsonld
{
  "@context": {
    "prov": "http://www.w3.org/ns/prov#",
    "ops": "https://pi.dev/ops/",
    "ev": "https://pi.dev/events/",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@id": "urn:pi:backup:20260319T095447",
  "@type": "prov:Entity",
  "ops:backupType": "csv-hot",
  "ops:status": "completed",
  "ops:archivePath": "/Users/opunix/backups/xtdb/20260319T095447.tar.gz",
  "ops:sizeBytes": { "@value": "519045120", "@type": "xsd:long" },
  "ops:tableCount": { "@value": "13", "@type": "xsd:integer" },
  "ops:durationMs": { "@value": "297000", "@type": "xsd:long" },
  "ops:scheduledBy": "cron",
  "prov:wasGeneratedBy": {
    "@type": "prov:Activity",
    "prov:wasAssociatedWith": { "@type": "foaf:Agent", "foaf:name": "ops-scheduler" }
  },
  "ev:ts": { "@value": "1742360000000", "@type": "xsd:long" }
}
```

**New table: `incidents`**

```jsonld
{
  "@context": {
    "schema": "https://schema.org/",
    "prov": "http://www.w3.org/ns/prov#",
    "ops": "https://pi.dev/ops/",
    "ev": "https://pi.dev/events/",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@id": "urn:pi:incident:j5k6l7m8",
  "@type": "schema:Event",
  "schema:name": "XTDB replica lag > 5 minutes",
  "schema:description": "Replica fell behind primary during large batch insert",
  "ops:severity": "high",
  "ops:status": "resolved",
  "ops:rootCause": "Redpanda consumer group rebalancing during broker restart",
  "ops:resolution": "Restarted replica, caught up in 2 minutes",
  "schema:isPartOf": { "@id": "urn:pi:proj:ac75514059c1" },
  "prov:wasInfluencedBy": { "@id": "urn:pi:deploy:f1g2h3i4" },
  "schema:startDate": { "@value": "2026-03-19T08:00:00Z", "@type": "xsd:dateTime" },
  "schema:endDate": { "@value": "2026-03-19T08:15:00Z", "@type": "xsd:dateTime" },
  "ev:ts": { "@value": "1742360000000", "@type": "xsd:long" }
}
```

> **Ontology rationale:** Backups are `prov:Entity` (a produced artifact). Incidents are `schema:Event` (a notable occurrence) with `prov:wasInfluencedBy` linking to the deployment/change that caused them.

| Missing Piece | JSON-LD Type | Priority |
|---|---|---|
| Scheduled backups + records | `prov:Entity` with `ops:` metadata | 🔴 High |
| Backup verification | `prov:Activity` linked to backup `prov:Entity` | 🟡 Medium |
| Incident log | `schema:Event` | 🟡 Medium |
| Health monitoring history | `schema:Observation` or `ops:HealthCheck` | 🟡 Medium |
| Dependency freshness | `prov:Entity` per dep check result | 🟡 Medium |

---

### 5. DECOMMISSIONING

**Modeled as lifecycle phase transition + archival:**

```jsonld
{
  "@context": {
    "prov": "http://www.w3.org/ns/prov#",
    "schema": "https://schema.org/",
    "ev": "https://pi.dev/events/",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@id": "urn:pi:decommission:n8o9p0q1",
  "@type": ["schema:DeleteAction", "prov:Activity"],
  "schema:object": { "@id": "urn:pi:proj:ac75514059c1" },
  "prov:wasAssociatedWith": { "@type": "foaf:Agent", "foaf:name": "opunix" },
  "ev:reason": "Replaced by harness-v2",
  "ev:impactedProjects": [
    { "@id": "urn:pi:proj:b2c3d4e5" }
  ],
  "ev:archivePath": "/archive/harness-20260319.tar.gz",
  "ev:checklist": {
    "codeArchived": true,
    "dataExported": true,
    "dependentsNotified": true,
    "infraRemoved": true,
    "dnsRemoved": false
  },
  "ev:ts": { "@value": "1742360000000", "@type": "xsd:long" }
}
```

> **Ontology rationale:** `schema:DeleteAction` (the act of removing something) + `prov:Activity` (provenance trail). The project record itself gets `ev:lifecyclePhase: "decommissioned"` and retains all historical data.

| Missing Piece | JSON-LD Type | Priority |
|---|---|---|
| Decommission workflow | `schema:HowTo` (workflow template) | 🟡 Medium |
| Impact analysis | Query `ev:dependsOn` graph | 🟡 Medium |
| Data archival record | `prov:Entity` (the archive) | 🟡 Medium |
| Tombstone record | `schema:DeleteAction` + `prov:Activity` | 🟡 Medium |

---

### 6. CROSS-PROJECT VERSIONING

**Version matrix modeled as linked releases:**

```jsonld
{
  "@context": {
    "schema": "https://schema.org/",
    "prov": "http://www.w3.org/ns/prov#",
    "ev": "https://pi.dev/events/"
  },
  "@id": "urn:pi:compat:harness-v1.2+sdk-v3.1",
  "@type": "schema:SoftwareSourceCode",
  "schema:name": "harness@1.2.0 ↔ pi-sdk@3.1.0 compatibility",
  "ev:projectA": { "@id": "urn:pi:release:harness-v1.2.0" },
  "ev:projectB": { "@id": "urn:pi:release:sdk-v3.1.0" },
  "ev:compatible": true,
  "ev:testedAt": { "@value": "1742360000000", "@type": "xsd:long" }
}
```

| Missing Piece | JSON-LD Type | Priority |
|---|---|---|
| Multi-project version matrix | `schema:SoftwareSourceCode` with compatibility links | 🟡 Medium |
| Breaking change detection | `prov:Revision` with `ev:breakingChange: true` | 🟡 Medium |
| Migration tracking | `prov:Activity` per migration applied | 🟡 Medium |
| Changelog generation | Aggregate `prov:Activity` (decisions) → `schema:Article` | 🟡 Medium |

---

## Updated Namespace Registry

Add to `xtdb-event-logger/rdf/namespaces.ts`:

```typescript
/** Requirements vocabulary */
export const REQ = "https://pi.dev/requirements/";

/** Deployments vocabulary */
export const DEPLOY = "https://pi.dev/deployments/";

/** Operations vocabulary */
export const OPS = "https://pi.dev/ops/";
```

Updated `JSONLD_CONTEXT`:

```typescript
export const JSONLD_CONTEXT = {
  ev: EV,
  rdf: RDF,
  xsd: XSD,
  schema: SCHEMA,
  doap: DOAP,
  prov: PROV,
  foaf: FOAF,
  req: REQ,       // NEW
  deploy: DEPLOY, // NEW
  ops: OPS,       // NEW
};
```

---

## New XTDB Tables Summary

| Table | `@type` | Key Columns | JSON-LD |
|-------|---------|-------------|---------|
| `requirements` | `schema:CreativeWork` | _id, project_id, title, description, priority, status, acceptance_criteria, ts | ✅ |
| `requirement_links` | `prov:Influence` | _id, requirement_id, link_type, target_id, ts | ✅ |
| `environments` | `schema:WebApplication` | _id, project_id, name, env_type, config_json, url, ts | ✅ |
| `deployments` | `schema:DeployAction` + `prov:Activity` | _id, project_id, env_id, release_id, status, deployed_by, ts | ✅ |
| `releases` | `doap:Version` + `prov:Entity` | _id, project_id, version, changelog, git_tag, ts | ✅ |
| `backup_records` | `prov:Entity` | _id, backup_type, status, archive_path, size_bytes, ts | ✅ |
| `incidents` | `schema:Event` | _id, project_id, name, severity, status, root_cause, resolution, ts | ✅ |

**Extended tables:**
| Table | New Columns |
|-------|------------|
| `projects` | + lifecycle_phase, config_json, tags, depends_on |

---

## Provenance Graph — How Everything Links

```
                    doap:Project
                    urn:pi:proj:xxx
                        │
          ┌─────────────┼─────────────────────────┐
          │             │                         │
    schema:CreativeWork  doap:Version          schema:WebApplication
    (requirements)       (releases)            (environments)
          │               │                       │
    prov:Influence    schema:DeployAction ─────────┘
    (req → decision)  (deployments)
    (req → artifact)      │
    (req → test)    schema:Event
                    (incidents)
                          │
                    prov:Entity
                    (backup_records)
```

All links use `@id` references, making the entire graph queryable via SPARQL or JSON-LD framing. Provenance export (`/provenance`) can be extended to include lifecycle entities in the `prov:Bundle`.

---

## Workflow Templates (JSON-LD `schema:HowTo`)

These go in `~/.pi/agent/workflows/` and are loaded by the workflow engine:

| Workflow File | `@type` | Steps |
|---|---|---|
| `new-project.jsonld` | `schema:HowTo` | init → requirements → design → CI setup → first deploy |
| `feature.jsonld` | `schema:HowTo` | requirement → design → implement → test → review → deploy |
| `bugfix.jsonld` | `schema:HowTo` | reproduce → debug → fix → test → review → deploy |
| `security-patch.jsonld` | `schema:HowTo` | audit → patch → test → emergency deploy → postmortem |
| `release.jsonld` | `schema:HowTo` | freeze → test suite → changelog → tag → stage → approve → prod |
| `maintenance.jsonld` | `schema:HowTo` | dep update → security scan → perf check → backup verify |
| `decommission.jsonld` | `schema:HowTo` | impact analysis → data export → archive → notify → tombstone |

---

## Implementation Priority (unchanged, now with JSON-LD types)

1. **Project lifecycle status** — extend `doap:Project` with `ev:lifecyclePhase` (quick win)
2. **Portfolio dashboard** — query `doap:Project` table with lifecycle/health view
3. **Scheduled backups** — `prov:Entity` backup records + cron in ops API
4. **Requirements tracker** — `schema:CreativeWork` + `prov:Influence` links
5. **Deployment tracker** — `schema:DeployAction` + `doap:Version` + `schema:WebApplication`
6. **Workflow templates** — 7 `schema:HowTo` JSON-LD files
7. **Decommissioning** — `schema:DeleteAction` + workflow
