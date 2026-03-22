# RDF Enforcement: Kill the String Soup

> The harness already has correct RDF tooling in `xtdb-event-logger/rdf/`.
> Every other module ignores it and hand-crafts JSON objects with string keys.
> This document describes how to fix that permanently.

## The Problem

```typescript
// THIS IS NOT RDF. This is a JSON object with strings that look like RDF.
const jsonld = JSON.stringify({
  "@context": JSONLD_CONTEXT,
  "@type": "schema:AssessAction",      // ← just a string, no validation
  "schema:name": input.suiteName,      // ← typo "schema:naem" would silently create a new predicate
  "ev:passed": input.passed,           // ← ev: namespace has no formal definition
});
```

```typescript
// THIS IS RDF. Proper terms, typed literals, validated structure.
const s = namedNode(`urn:pi:${id}`);
out.push(triple(s, namedNode(`${RDF}type`), namedNode(`${SCHEMA}AssessAction`)));
out.push(triple(s, namedNode(`${SCHEMA}name`), literal(input.suiteName)));
out.push(triple(s, namedNode(`${SCHEMA}result`), literal(String(input.passed), namedNode(`${XSD}integer`))));
```

The first version creates whatever the developer types. Typos, invented predicates, wrong
types — all silently accepted. The second version uses `namedNode()` which is a proper RDF
term. The namespace URI is resolved at construction time. The serializer validates structure.

## The Correct Pattern (already exists)

`xtdb-event-logger/rdf/` has three files that form the complete pattern:

1. **`namespaces.ts`** — imports from shared `lib/jsonld/context.ts`, exports URI constants
2. **`triples.ts`** — uses N3.js `DataFactory` (`namedNode`, `literal`, `blankNode`, `triple`)
3. **`serialize.ts`** — uses `jsonld-streaming-serializer` to produce JSON-LD from triples

Dependencies: `n3` (RDF.js spec-compliant), `jsonld-streaming-serializer`

## What Needs to Change

### 1. Move RDF builders to `lib/rdf/` (shared, not per-extension)

The N3.js-based builders should live in `lib/rdf/`, not inside `xtdb-event-logger/rdf/`.
Every extension and module imports from `lib/rdf/`. Nobody builds JSON-LD by hand.

```
lib/rdf/
  namespaces.ts    — all namespace URIs (from lib/jsonld/context.ts)
  factory.ts       — re-exports N3 DataFactory + typed literal helpers
  vocab.ts         — EVERY allowed predicate as a NamedNode constant
  serialize.ts     — triples → JSON-LD string (for XTDB jsonld column)
  validate.ts      — checks triples against the vocabulary (optional but powerful)
```

### 2. Define the vocabulary as NamedNode constants

Instead of string keys that anyone can invent, predicates are TypeScript constants:

```typescript
// lib/rdf/vocab.ts
import { DataFactory } from "n3";
const { namedNode } = DataFactory;

// ─── Standard vocabularies ─────────────────────────────────────
// These are real, published, dereferenceable vocabularies.

export const RDF = {
  type: namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
} as const;

export const SCHEMA = {
  name: namedNode("https://schema.org/name"),
  description: namedNode("https://schema.org/description"),
  actionStatus: namedNode("https://schema.org/actionStatus"),
  CompletedActionStatus: namedNode("https://schema.org/CompletedActionStatus"),
  FailedActionStatus: namedNode("https://schema.org/FailedActionStatus"),
  AssessAction: namedNode("https://schema.org/AssessAction"),
  SoftwareSourceCode: namedNode("https://schema.org/SoftwareSourceCode"),
  SoftwareApplication: namedNode("https://schema.org/SoftwareApplication"),
  // ... every schema.org term actually used
} as const;

export const PROV = {
  Activity: namedNode("http://www.w3.org/ns/prov#Activity"),
  Entity: namedNode("http://www.w3.org/ns/prov#Entity"),
  SoftwareAgent: namedNode("http://www.w3.org/ns/prov#SoftwareAgent"),
  generatedAtTime: namedNode("http://www.w3.org/ns/prov#generatedAtTime"),
  wasAssociatedWith: namedNode("http://www.w3.org/ns/prov#wasAssociatedWith"),
  used: namedNode("http://www.w3.org/ns/prov#used"),
  // ... every prov term actually used
} as const;

export const DOAP = {
  Project: namedNode("http://usefulinc.com/ns/doap#Project"),
  GitRepository: namedNode("http://usefulinc.com/ns/doap#GitRepository"),
  name: namedNode("http://usefulinc.com/ns/doap#name"),
  revision: namedNode("http://usefulinc.com/ns/doap#revision"),
} as const;

export const FOAF = {
  Person: namedNode("http://xmlns.com/foaf/0.1/Person"),
  Agent: namedNode("http://xmlns.com/foaf/0.1/Agent"),
  name: namedNode("http://xmlns.com/foaf/0.1/name"),
} as const;

// ─── Custom vocabulary (harness-specific) ──────────────────────
// These are terms that have NO equivalent in standard vocabularies.
// Every term here must have a comment explaining why no standard term fits.

export const CODE = {
  // Code structure (no standard covers function-level AST relationships)
  Function: namedNode("https://pi.dev/code/Function"),
  calls: namedNode("https://pi.dev/code/calls"),
  definedIn: namedNode("https://pi.dev/code/definedIn"),
  exports: namedNode("https://pi.dev/code/exports"),
  tests: namedNode("https://pi.dev/code/tests"),
  filePath: namedNode("https://pi.dev/code/filePath"),
  line: namedNode("https://pi.dev/code/line"),
  isExported: namedNode("https://pi.dev/code/isExported"),
  isAsync: namedNode("https://pi.dev/code/isAsync"),
  parameters: namedNode("https://pi.dev/code/parameters"),
  isTestFile: namedNode("https://pi.dev/code/isTestFile"),
  isTestFunction: namedNode("https://pi.dev/code/isTestFunction"),

  // CI (schema:Action covers the run, but step-level details are custom)
  CIRun: namedNode("https://pi.dev/code/CIRun"),
  CIStep: namedNode("https://pi.dev/code/CIStep"),
  Pipeline: namedNode("https://pi.dev/code/Pipeline"),
  PipelineStep: namedNode("https://pi.dev/code/PipelineStep"),
  commitHash: namedNode("https://pi.dev/code/commitHash"),
  image: namedNode("https://pi.dev/code/image"),
  commands: namedNode("https://pi.dev/code/commands"),
  steps: namedNode("https://pi.dev/code/steps"),
  repo: namedNode("https://pi.dev/code/repo"),
  ref: namedNode("https://pi.dev/code/ref"),
  exitCode: namedNode("https://pi.dev/code/exitCode"),
  durationMs: namedNode("https://pi.dev/code/durationMs"),
} as const;
```

**The key enforcement:** If a predicate is not in this file, it does not exist. TypeScript
will give you a compile error if you try to use `CODE.whateverIJustInvented`.

### 3. Kill the ev: namespace (migrate to standard predicates)

Most `ev:` predicates are reinventions of standard vocabulary terms:

| Current `ev:` predicate | Standard equivalent | Action |
|---|---|---|
| `ev:ts` | `prov:generatedAtTime` | Replace |
| `ev:status` | `schema:actionStatus` | Replace |
| `ev:durationMs` | `schema:duration` (ISO 8601) or keep as `code:durationMs` | Migrate |
| `ev:projectId` | `prov:used` (link to project entity) | Replace with reference |
| `ev:sessionId` | `prov:wasAssociatedWith` (link to session) | Replace with reference |
| `ev:agentName` | `prov:wasAssociatedWith` → `schema:name` | Replace |
| `ev:exitCode` | `code:exitCode` | Move to code: |
| `ev:passed` / `ev:failed` / `ev:skipped` | `schema:result` sub-properties | Restructure |
| `ev:goal` | `schema:description` | Replace |
| `ev:what` / `ev:why` / `ev:outcome` | `schema:description` / `prov:generated` | Replace |
| `ev:path` | `schema:url` or `code:filePath` | Replace |
| `ev:sizeBytes` | `schema:contentSize` | Replace |
| `ev:version` | `schema:version` or `doap:revision` | Replace |

The remaining `ev:` predicates that are truly harness-specific (event capture fields
like `toolName`, `toolCallId`, `turnIndex`, `compactTokens`, etc.) should move to a
properly defined `ev:` vocabulary with `rdfs:label` and `rdfs:range` for each term.
These go into `lib/rdf/vocab.ts` as `EV.toolName`, `EV.turnIndex`, etc.

### 4. Builder functions that enforce structure

Instead of every module assembling triples by hand, provide builder functions:

```typescript
// lib/rdf/builders.ts
import { DataFactory } from "n3";
import { SCHEMA, PROV, CODE, RDF } from "./vocab.ts";
import { xsdLong, xsdString } from "./factory.ts";

const { namedNode, triple } = DataFactory;

export function buildCIRun(id: string, input: CIRunInput) {
  const s = namedNode(`urn:pi:${id}`);
  const triples = [
    triple(s, RDF.type, CODE.CIRun),
    triple(s, SCHEMA.name, xsdString(`CI: ${input.repo}@${input.commitHash.slice(0, 8)}`)),
    triple(s, CODE.repo, xsdString(input.repo)),
    triple(s, CODE.commitHash, xsdString(input.commitHash)),
    triple(s, SCHEMA.actionStatus, input.status === "passed" ? SCHEMA.CompletedActionStatus : SCHEMA.FailedActionStatus),
    triple(s, CODE.durationMs, xsdLong(input.durationMs)),
    triple(s, PROV.generatedAtTime, xsdLong(Date.now())),
  ];
  return triples;
}

export function buildTestRun(id: string, input: TestRunInput) {
  const s = namedNode(`urn:pi:${id}`);
  return [
    triple(s, RDF.type, SCHEMA.AssessAction),
    triple(s, SCHEMA.name, xsdString(input.suiteName)),
    triple(s, SCHEMA.actionStatus, input.status === "passed" ? SCHEMA.CompletedActionStatus : SCHEMA.FailedActionStatus),
    triple(s, PROV.generatedAtTime, xsdLong(Date.now())),
    // ... properly typed, no string-key invention possible
  ];
}
```

### 5. Biome rule to ban raw JSON-LD construction

Add to `biome.json` restricted imports:

```json
{
  "linter": {
    "rules": {
      "style": {
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "paths": {
              "../lib/jsonld/context.ts": {
                "importNames": ["JSONLD_CONTEXT"],
                "message": "Do not use JSONLD_CONTEXT directly. Use lib/rdf/builders.ts to construct RDF. Raw JSON-LD construction is banned."
              }
            }
          }
        }
      }
    }
  }
}
```

This makes it a lint error to import `JSONLD_CONTEXT` for hand-crafting JSON objects.
The only allowed consumer of `JSONLD_CONTEXT` is `lib/rdf/serialize.ts`.

### 6. Agent instructions (CODE_QUALITY_STANDARD.md update)

Add to the standard:

```
## RDF Rules

1. NEVER construct JSON-LD by hand. Use lib/rdf/builders.ts.
2. NEVER invent new predicates. If you need a new predicate:
   a. Check if a standard vocabulary already has it (schema.org, PROV-O, DOAP, FOAF)
   b. If not, add it to lib/rdf/vocab.ts with a comment explaining why
   c. Get it reviewed — new custom predicates are a code smell
3. ALWAYS use N3.js DataFactory (namedNode, literal, triple) for RDF construction.
4. NEVER use string keys like "ev:whatever" or "code:newThing" in JSON objects.
5. The jsonld-streaming-serializer produces the JSON-LD string. You produce triples.
```

## Migration Order

1. **Create `lib/rdf/`** — move and generalize from `xtdb-event-logger/rdf/`
2. **Create `lib/rdf/vocab.ts`** — define every predicate as a NamedNode constant
3. **Migrate `lib/test-recorder.ts`** — replace JSON object with builder
4. **Migrate `decision-log/rdf.ts`** — replace JSON object with builder
5. **Migrate `project-registry/rdf.ts`** — replace JSON object with builder
6. **Migrate `ci-runner/recorder.ts`** — replace JSON object with builder
7. **Migrate `scripts/parse-call-graph.ts`** — replace JSON-LD assembly with triples
8. **Migrate `scripts/export-xtdb-triples.ts`** — it reads JSON-LD, should validate
9. **Add Biome restriction** — ban direct JSONLD_CONTEXT imports
10. **Kill `ev:` duplicates** — replace with standard vocabulary terms
11. **Update `xtdb-event-logger/rdf/`** — import from `lib/rdf/` instead of local copy

## Dependencies

Already in the codebase (used by xtdb-event-logger):
- `n3` — RDF.js spec-compliant library (DataFactory, Store, Parser, Writer)
- `jsonld-streaming-serializer` — triples → JSON-LD

No new dependencies needed. The tooling exists. It just needs to be the only path.

## What This Prevents

- Typos in predicates (`"schema:naem"` → compile error: `SCHEMA.naem` doesn't exist)
- Invented predicates (`"ev:myNewThing"` → must be added to vocab.ts and reviewed)
- Wrong types (`literal(42)` vs `xsdString("42")` — the DataFactory enforces types)
- Duplicate predicates (`ev:status` vs `schema:actionStatus` — one source of truth)
- Orphan predicates (grep `vocab.ts` to see every predicate; unused ones are dead code)
