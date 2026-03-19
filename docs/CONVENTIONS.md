# Harness Conventions

## ID Format
- `_id` column: `{prefix}:{uuid}` (e.g., `proj:ac75514059c1`, `dec:a1b2c3d4-...`)
- `@id` in JSON-LD: `urn:pi:{_id}` (e.g., `urn:pi:proj:ac75514059c1`)
- Prefixes: `proj:`, `sp:`, `dec:`, `art:`, `artv:`, `req:`, `reqlink:`, `env:`, `rel:`, `depl:`, `trun:`, `bak:`, `inc:`, `wfrun:`, `wfstep:`, `decom:`, `pdep:`, `ptag:`, `lev:`
- Generate with `lib/jsonld/ids.ts`: `ids.decision()`, `ids.artifact()`, etc.

## JSON-LD
- Shared context: `import { JSONLD_CONTEXT } from "../lib/jsonld/context.ts"`
- Namespaces: `ev:`, `prov:`, `schema:`, `doap:`, `foaf:`, `xsd:`, `rdf:`
- Prefer standard predicates over `ev:` — see §3 of `PROJECT_LIFECYCLE_V2.md`
- Helpers: `piId(id)` → `urn:pi:{id}`, `piRef(id)` → `{ "@id": "urn:pi:{id}" }`
- Typed values: `xsdLong(n)`, `xsdInt(n)`, `xsdBool(b)`

## Database
- Shared connection: `import { connectXtdb } from "../lib/db.ts"`
- XTDB is schema-on-write — tables/columns auto-created on first INSERT
- Upsert pattern: SELECT existing row → modify → INSERT full row (XTDB creates new bitemporal version)
- Typed parameters: `sql.typed(value as any, 25)` for text, `20` for bigint, `16` for boolean
- Always store `jsonld` column as `JSON.stringify(doc)` for every entity

## Extensions
- Package must have `"pi": { "extensions": ["./index.ts"] }` in package.json
- Default export: `function(pi: ExtensionAPI) { ... }`
- Commands: `pi.registerCommand({ name, description, schema, execute })`
- Events: `pi.on("session_start" | "session_shutdown" | "before_agent_start", handler)`
- Deploy: `task ext:deploy:all` (copies to `~/.pi/agent/extensions/`)
- Current project: `(globalThis as any).__piCurrentProject?.projectId`

## Lifecycle Events
- Emit via INSERT into `lifecycle_events` table
- Fields: `_id` (lev:uuid), `event_type`, `entity_id`, `entity_type`, `project_id`, `summary`, `ts`
