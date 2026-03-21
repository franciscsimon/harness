# Proposal: Function Call Graph via AST → JSON-LD → QLever

## Overview

Parse the harness TypeScript codebase with the TS compiler API, produce a JSON-LD graph of modules, functions, and call edges, convert to Turtle for QLever, and query via SPARQL. QLever serves as a **read-only materialized view** — no data manipulation, just fast graph queries.

## Architecture

```
scripts/parse-call-graph.ts          → data/call-graph.jsonld   (JSON-LD source of truth)
scripts/jsonld-to-turtle.ts          → data/call-graph.ttl      (Turtle for QLever)
qlever (Docker)                      → SPARQL endpoint :7001    (read-only queries)
harness-ui /graph page               → visualize via SPARQL     (D3.js force graph)
```

### Data Flow

```
TypeScript AST ──parse──► JSON-LD (.jsonld)
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
              Turtle (.ttl)   XTDB       disk (git-tracked)
                    │       (jsonld col)
                    ▼
              QLever index
                    │
                    ▼
              SPARQL :7001 ◄── harness-ui /graph
```

## Vocabulary

### Namespaces

| Prefix | URI | Source |
|--------|-----|--------|
| `schema:` | `https://schema.org/` | Existing in harness |
| `code:` | `https://pi.dev/code/` | **New** — code structure properties |
| `doap:` | `http://usefulinc.com/ns/doap#` | Existing in harness |
| `prov:` | `http://www.w3.org/ns/prov#` | Existing in harness |
| `xsd:` | `http://www.w3.org/2001/XMLSchema#` | Existing in harness |

### Entity Types

| Entity | RDF Type | IRI Pattern | Example |
|--------|----------|-------------|---------|
| Module | `schema:SoftwareSourceCode` | `urn:pi:mod:{relative-path}` | `urn:pi:mod:harness-ui/server.ts` |
| Function | `schema:DefinedTerm` | `urn:pi:fn:{relative-path}#{name}` | `urn:pi:fn:harness-ui/lib/api.ts#fetchErrors` |
| Parse run | `prov:Entity` | `urn:pi:graph:{project}:{iso-ts}` | `urn:pi:graph:harness:2026-03-20T12-00-00Z` |

### Properties

| Property | Domain | Range | Description |
|----------|--------|-------|-------------|
| `code:filePath` | Module, Function | `xsd:string` | Relative file path |
| `code:line` | Function | `xsd:integer` | Declaration line number |
| `code:isAsync` | Function | `xsd:boolean` | Whether function is async |
| `code:isExported` | Function | `xsd:boolean` | Whether function is exported |
| `code:parameters` | Function | `xsd:integer` | Parameter count |
| `code:calls` | Function | Function | Call edge: caller → callee |
| `code:definedIn` | Function | Module | Which module defines this function |
| `schema:requires` | Module | Module | Import edge: importer → imported |
| `code:exports` | Module | `xsd:string` | Exported name |

### JSON-LD Document

Single file: `data/call-graph.jsonld`

```json
{
  "@context": {
    "schema": "https://schema.org/",
    "code": "https://pi.dev/code/",
    "doap": "http://usefulinc.com/ns/doap#",
    "prov": "http://www.w3.org/ns/prov#",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "code:calls": { "@type": "@id" },
    "code:definedIn": { "@type": "@id" },
    "schema:requires": { "@type": "@id" }
  },
  "@id": "urn:pi:graph:harness:2026-03-20T12-00-00Z",
  "@type": "prov:Entity",
  "prov:generatedAtTime": "2026-03-20T12:00:00Z",
  "schema:about": { "@id": "urn:pi:proj:harness" },
  "@graph": [
    {
      "@id": "urn:pi:mod:harness-ui/server.ts",
      "@type": "schema:SoftwareSourceCode",
      "schema:name": "server.ts",
      "code:filePath": "harness-ui/server.ts",
      "schema:requires": [
        { "@id": "urn:pi:mod:harness-ui/pages/home.ts" },
        { "@id": "urn:pi:mod:harness-ui/lib/api.ts" }
      ],
      "code:exports": ["default"]
    },
    {
      "@id": "urn:pi:fn:harness-ui/lib/api.ts#fetchErrors",
      "@type": "schema:DefinedTerm",
      "schema:name": "fetchErrors",
      "code:definedIn": { "@id": "urn:pi:mod:harness-ui/lib/api.ts" },
      "code:filePath": "harness-ui/lib/api.ts",
      "code:line": 32,
      "code:isAsync": false,
      "code:isExported": true,
      "code:parameters": 1,
      "code:calls": [
        { "@id": "urn:pi:fn:harness-ui/lib/api.ts#get" }
      ]
    }
  ]
}
```

## QLever Setup

### Docker Service

Add to `docker-compose.yml`:

```yaml
qlever:
  image: adfreiburg/qlever:latest
  ports:
    - "7001:7001"
  volumes:
    - qlever-data:/data
    - ./data:/input:ro
  environment:
    - UID=1000
    - GID=1000

qlever-data:
  driver: local
```

### Index Build

After generating `data/call-graph.ttl`:

```bash
docker exec qlever bash -c "
  cd /data &&
  qlever setup-config harness --data-format ttl &&
  cp /input/call-graph.ttl . &&
  qlever index &&
  qlever start
"
```

QLever indexes the Turtle file and starts a SPARQL endpoint at `:7001`.

### Re-index (on code changes)

```bash
# 1. Re-parse
NODE_PATH=xtdb-projector/node_modules npx jiti scripts/parse-call-graph.ts

# 2. Convert
NODE_PATH=xtdb-projector/node_modules npx jiti scripts/jsonld-to-turtle.ts

# 3. Re-index
docker exec qlever bash -c "cd /data && cp /input/call-graph.ttl . && qlever index && qlever restart"
```

## Example SPARQL Queries

### All functions in a module
```sparql
PREFIX code: <https://pi.dev/code/>
PREFIX schema: <https://schema.org/>

SELECT ?fn ?name ?line WHERE {
  ?fn a schema:DefinedTerm ;
      code:definedIn <urn:pi:mod:harness-ui/lib/api.ts> ;
      schema:name ?name ;
      code:line ?line .
}
ORDER BY ?line
```

### Who calls fetchErrors?
```sparql
PREFIX code: <https://pi.dev/code/>
PREFIX schema: <https://schema.org/>

SELECT ?caller ?callerName ?callerFile WHERE {
  ?caller code:calls <urn:pi:fn:harness-ui/lib/api.ts#fetchErrors> ;
          schema:name ?callerName ;
          code:filePath ?callerFile .
}
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

### Most-called functions (hotspots)
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

### Call chain (2 levels deep)
```sparql
PREFIX code: <https://pi.dev/code/>
PREFIX schema: <https://schema.org/>

SELECT ?l1name ?l2name ?l3name WHERE {
  <urn:pi:fn:harness-ui/server.ts#renderHome> code:calls ?l2 .
  ?l2 schema:name ?l2name .
  OPTIONAL {
    ?l2 code:calls ?l3 .
    ?l3 schema:name ?l3name .
  }
  BIND("renderHome" AS ?l1name)
}
```

## Implementation Plan

| Step | Script | Output | Effort |
|------|--------|--------|--------|
| 1 | `scripts/parse-call-graph.ts` | `data/call-graph.jsonld` | M |
| 2 | `scripts/jsonld-to-turtle.ts` | `data/call-graph.ttl` | S |
| 3 | Docker compose + index script | QLever on `:7001` | S |
| 4 | `harness-ui/pages/graph.ts` | `/graph` page with D3.js | L |
| 5 | SPARQL proxy in harness-ui | `/api/sparql` → `:7001` | S |

### Step 1: AST Parser (Medium)
- Use `typescript` package (already in `xtdb-projector/node_modules/`)
- Walk all `.ts` files, skip `node_modules/`
- For each file: extract imports, exports, function declarations
- For each function: walk body, find `CallExpression` nodes, resolve to function IRIs
- Output `@graph` array as JSON-LD

### Step 2: JSON-LD → Turtle (Small)
- Expand JSON-LD context to full IRIs
- Convert each entity to Turtle triples
- Simple template: `<subject> <predicate> <object> .`

### Step 3: QLever Docker (Small)
- Add to docker-compose.yml
- Init script: copy TTL, build index, start server
- Health check on `:7001`

### Step 4: Graph UI Page (Large)
- Server-rendered page at `/graph`
- D3.js force-directed layout
- Fetch data via SPARQL (module dependency or function call graph)
- Click node → show callers/callees
- Filter by module prefix

### Step 5: SPARQL Proxy (Small)
- `/api/sparql` endpoint in harness-ui
- Forwards SPARQL queries to QLever `:7001`
- Avoids CORS issues
