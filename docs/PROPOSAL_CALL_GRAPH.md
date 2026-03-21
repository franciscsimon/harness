# Proposal: Linked Data Graph — XTDB JSON-LD → QLever SPARQL

## Overview

The harness already stores JSON-LD documents in 20 XTDB tables. QLever becomes a **read-only materialized SPARQL view** over all this linked data — code structure (from AST parsing), events, decisions, projects, artifacts, deployments, errors, and more. No data manipulation in QLever; it's a query engine over a periodically-refreshed snapshot.

## Architecture

```
                    XTDB (source of truth)
                    ┌─────────────────────┐
                    │ 20 tables with jsonld│
                    │ columns + new AST    │
                    │ call-graph jsonld    │
                    └─────────┬───────────┘
                              │
              scripts/export-xtdb-triples.ts
              (SELECT jsonld FROM each table)
                              │
                              ▼
                    data/harness-graph.ttl
                    (all triples, one file)
                              │
                              ▼
                    ┌─────────────────────┐
                    │  QLever :7001       │
                    │  (SPARQL endpoint)  │
                    │  read-only index    │
                    └─────────┬───────────┘
                              │
                    harness-ui /graph page
                    (SPARQL → D3.js visualization)
```

### Data Sources

**20 XTDB tables with `jsonld` columns:**

| Table | @type | Triples About |
|-------|-------|---------------|
| `projects` | `doap:Project` | Project identity, git remote, lifecycle phase |
| `session_projects` | `prov:Activity` | Session ↔ project links |
| `project_dependencies` | `prov:Entity` | npm/pip dependencies per project |
| `decommission_records` | `prov:Activity` | Project decommission events |
| `decisions` | `prov:Activity` | Design decisions with outcomes |
| `session_postmortems` | `prov:Activity` | Session summaries (turns, errors, files) |
| `delegations` | `prov:Activity` | Agent delegation events |
| `artifacts` | `prov:Entity` | Tracked file artifacts |
| `artifact_versions` | `schema:CreativeWork` + `prov:Entity` | File version history |
| `workflow_runs` | `schema:HowTo` + `prov:Activity` | Workflow execution records |
| `workflow_step_runs` | `prov:Activity` | Individual workflow step results |
| `requirements` | `schema:CreativeWork` + `prov:Entity` | Project requirements |
| `releases` | `doap:Version` + `prov:Entity` | Software releases |
| `deployments` | `schema:DeployAction` + `prov:Activity` | Deployment records |
| `test_runs` | `schema:AssessAction` | Test execution results |
| `environments` | `schema:Place` + `prov:Location` | Deployment environments |
| `backup_records` | `prov:Entity` | Backup snapshots |
| `incidents` | `schema:Action` | Operational incidents |
| `errors` | `schema:Action` (FailedActionStatus) | Captured error events |
| `events` | (has jsonld column) | All 30 pi lifecycle events |

**Plus the AST call graph** (new, from `scripts/parse-call-graph.ts`):

| Source | @type | Triples About |
|--------|-------|---------------|
| `data/call-graph.jsonld` | `schema:SoftwareSourceCode`, `schema:DefinedTerm` | Modules, functions, call edges, imports |

## Vocabulary

All namespaces already in `lib/jsonld/context.ts` plus one new one:

| Prefix | URI | Used By |
|--------|-----|---------|
| `schema:` | `https://schema.org/` | Most entities |
| `prov:` | `http://www.w3.org/ns/prov#` | Provenance chains |
| `doap:` | `http://usefulinc.com/ns/doap#` | Projects, releases |
| `foaf:` | `http://xmlns.com/foaf/0.1/` | Agents |
| `ev:` | `https://pi.dev/events/` | Harness-specific properties |
| `code:` | `https://pi.dev/code/` | **New** — AST code structure |
| `xsd:` | `http://www.w3.org/2001/XMLSchema#` | Typed literals |

### New `code:` Properties (for AST graph only)

| Property | Domain | Range | Description |
|----------|--------|-------|-------------|
| `code:filePath` | Module, Function | `xsd:string` | Relative file path |
| `code:line` | Function | `xsd:integer` | Declaration line number |
| `code:isAsync` | Function | `xsd:boolean` | Async function |
| `code:isExported` | Function | `xsd:boolean` | Exported from module |
| `code:parameters` | Function | `xsd:integer` | Parameter count |
| `code:calls` | Function | Function | Call edge |
| `code:definedIn` | Function | Module | Module containing function |
| `code:exports` | Module | `xsd:string` | Exported name |

## Export Pipeline

### Step 1: Export XTDB JSON-LD → Turtle

`scripts/export-xtdb-triples.ts`:

```
For each of 20 tables:
  SELECT _id, jsonld FROM {table} WHERE jsonld IS NOT NULL AND jsonld != ''
  Parse each jsonld string as JSON-LD
  Expand @context → full IRIs
  Emit as N-Triples / Turtle
→ data/harness-graph.ttl
```

This single file contains ALL linked data from the harness — decisions linked to projects, artifacts linked to sessions, errors linked to components, code functions linked to modules.

### Step 2: Add AST call graph

`scripts/parse-call-graph.ts`:
- Parse ~200 TypeScript files with TS compiler API
- Output `data/call-graph.jsonld`
- Convert to Turtle and **append** to `data/harness-graph.ttl`

### Step 3: QLever index + serve

```bash
# Build index from combined Turtle
docker exec qlever bash -c "
  cd /data &&
  cp /input/harness-graph.ttl . &&
  qlever index &&
  qlever start
"
```

### Refresh (periodic or on-demand)

```bash
# Re-export all XTDB JSON-LD + re-parse AST → rebuild QLever index
NODE_PATH=xtdb-event-logger/node_modules npx jiti scripts/export-xtdb-triples.ts
NODE_PATH=xtdb-projector/node_modules npx jiti scripts/parse-call-graph.ts
# → data/harness-graph.ttl (combined)
docker exec qlever bash -c "cd /data && cp /input/harness-graph.ttl . && qlever index && qlever restart"
```

Add as a Taskfile command: `task graph:refresh`

## QLever Docker

Add to `docker-compose.yml`:

```yaml
qlever:
  image: adfreiburg/qlever:latest
  ports:
    - "7001:7001"
  volumes:
    - qlever-data:/data
    - ./data:/input:ro

qlever-data:
  driver: local
```

## Example SPARQL Queries

### Cross-domain: Which functions are involved in decisions?

```sparql
PREFIX code: <https://pi.dev/code/>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX ev: <https://pi.dev/events/>
PREFIX schema: <https://schema.org/>

SELECT ?decision ?task ?file WHERE {
  ?decision a prov:Activity ;
            ev:task ?task ;
            ev:files ?file .
  ?mod a schema:SoftwareSourceCode ;
       code:filePath ?file .
}
```

### All entities linked to a project

```sparql
PREFIX doap: <http://usefulinc.com/ns/doap#>
PREFIX ev: <https://pi.dev/events/>
PREFIX schema: <https://schema.org/>

SELECT ?entity ?type WHERE {
  ?entity ev:projectId "proj:harness" ;
          a ?type .
}
```

### Error → component → functions (trace from error to code)

```sparql
PREFIX schema: <https://schema.org/>
PREFIX code: <https://pi.dev/code/>

SELECT ?error ?component ?fn ?fnName WHERE {
  ?error a schema:Action ;
         schema:actionStatus schema:FailedActionStatus ;
         schema:agent/schema:name ?component .
  ?fn code:definedIn ?mod ;
     schema:name ?fnName .
  ?mod code:filePath ?path .
  FILTER(CONTAINS(?path, ?component))
}
```

### Function call hotspots

```sparql
PREFIX code: <https://pi.dev/code/>
PREFIX schema: <https://schema.org/>

SELECT ?name (COUNT(?caller) AS ?callCount) WHERE {
  ?caller code:calls ?fn .
  ?fn schema:name ?name .
}
GROUP BY ?name
ORDER BY DESC(?callCount)
LIMIT 20
```

### Module dependency graph

```sparql
PREFIX schema: <https://schema.org/>
PREFIX code: <https://pi.dev/code/>

SELECT ?from ?to WHERE {
  ?from a schema:SoftwareSourceCode ;
        schema:requires ?to .
}
```

### Deployment → release → test run chain

```sparql
PREFIX schema: <https://schema.org/>
PREFIX doap: <http://usefulinc.com/ns/doap#>

SELECT ?deploy ?env ?release ?version ?testStatus WHERE {
  ?deploy a schema:DeployAction ;
          schema:location ?env .
  ?release a doap:Version ;
           doap:revision ?version .
  OPTIONAL {
    ?test a schema:AssessAction ;
          schema:actionStatus ?testStatus .
  }
}
```

## XTDB / Seed Schema Impact

**No new XTDB tables needed.** The AST call graph lives on disk as `data/call-graph.jsonld` — it's not stored in XTDB. QLever reads from a combined Turtle file that merges:
1. JSON-LD extracted from existing XTDB `jsonld` columns (20 tables)
2. The AST call graph from disk

**No seed schema changes needed.** All 20 tables with `jsonld` columns are already seeded. The `events` table already has a `jsonld` column. The `code:` namespace is added only to `lib/jsonld/context.ts` (shared config, not schema).

**What does change:**
- `lib/jsonld/context.ts` — add `code: "https://pi.dev/code/"` to the NS object
- `docker-compose.yml` — add QLever service
- `Taskfile.yml` — add `task graph:refresh`
- New scripts: `scripts/parse-call-graph.ts`, `scripts/export-xtdb-triples.ts`
- New data files: `data/call-graph.jsonld`, `data/harness-graph.ttl`

## Implementation Plan

| Step | Script / File | Output | Effort |
|------|---------------|--------|--------|
| 1 | `scripts/parse-call-graph.ts` | `data/call-graph.jsonld` | M |
| 2 | `scripts/export-xtdb-triples.ts` | `data/harness-graph.ttl` (all JSON-LD from XTDB + call graph) | M |
| 3 | `docker-compose.yml` + init | QLever on `:7001` | S |
| 4 | `harness-ui/pages/graph.ts` | `/graph` page with D3.js | L |
| 5 | SPARQL proxy in harness-ui | `/api/sparql` → `:7001` | S |
| 6 | `Taskfile.yml` entry | `task graph:refresh` | S |

### Data Volume Estimate

| Source | Estimated Triples |
|--------|-------------------|
| events (7000 rows × ~20 triples) | ~140,000 |
| decisions (~50 rows × ~8 triples) | ~400 |
| artifacts (~200 rows × ~6 triples) | ~1,200 |
| projects + sessions (~50 rows × ~10) | ~500 |
| AST call graph (~200 files, ~800 fns) | ~5,000 |
| All other tables | ~2,000 |
| **Total** | **~150,000 triples** |

QLever handles billions of triples. 150K will index in under a second.
