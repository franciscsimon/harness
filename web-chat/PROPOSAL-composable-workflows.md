# Proposal: Composable Workflow Templates (JSON-LD / RDF)

## 1. Goal

Enable users to define, select, and run multi-step workflows that chain agent roles with transition conditions, using JSON-LD workflow definitions processed with proper RDF libraries — consistent with the harness's existing semantic data model.

## 2. RDF Library Stack

The harness already has a proper RDF pipeline in `xtdb-event-logger/rdf/`:

| Library | Role | Already In Use |
|---------|------|----------------|
| `n3` | Triple store, DataFactory, parser/writer | ✅ xtdb-event-logger, data-examples |
| `jsonld-streaming-serializer` | N3 triples → JSON-LD serialization | ✅ xtdb-event-logger |
| `@rdfjs/types` | TypeScript types for RDF/JS interfaces | ✅ xtdb-event-logger |

The workflow engine will use the same stack. Workflow definitions are loaded as JSON-LD, **parsed into an RDF graph** (not just `JSON.parse`), and manipulated as triples. This means:

- `@context` expansion is done by the JSON-LD processor, not string matching
- `@id` references resolve properly across documents
- Sub-workflow composition works via graph merging
- Validation checks `rdf:type` triples, not JSON shape
- Serialization back to JSON-LD uses `jsonld-streaming-serializer`

**Not** `JSON.parse()` + manual property access.

## 3. Vocabulary Evaluation

### Candidates

#### A. P-Plan (extends PROV-O)
- `p-plan:Plan` → `p-plan:Step` → `p-plan:isPrecededBy`
- `p-plan:Activity` for execution records with `p-plan:correspondsToStep`
- **Strengths:** Extends PROV-O (already in use), has plan/execution duality, designed for scientific workflows
- **Weaknesses:** Academic vocabulary with limited adoption (~200 citations). No built-in agent assignment, action status, or transition semantics. Every workflow-specific concept needs custom predicates. No native instrument/tool modeling. The vocabulary is essentially just "step + ordering" — everything else is custom.

#### B. Schema.org Action Types
- `schema:Action` — base class for things being done
  - `schema:agent` — who performs the action (maps directly to agent roles)
  - `schema:object` — what is acted upon (the task/codebase)
  - `schema:result` — what was produced (artifacts)
  - `schema:instrument` — tool/skill used
  - `schema:actionStatus` → `PotentialActionStatus`, `ActiveActionStatus`, `CompletedActionStatus`, `FailedActionStatus`
  - `schema:potentialAction` — actions that can follow (chaining/composition)
  - `schema:target` / `schema:EntryPoint` — execution target
- Specific subtypes:
  - `schema:PlanAction` — making a plan
  - `schema:ReviewAction` — reviewing something
  - `schema:CreateAction` — creating something
  - `schema:AssessAction` — assessing/testing
  - `schema:OrganizeAction` → `schema:PlanAction` — organizing work
  - `schema:SearchAction` — exploring/discovering

- **Strengths:**
  1. **`schema:agent` is first-class** — maps directly to our agent roles, no custom predicate needed
  2. **`schema:actionStatus` with 4 states** — covers our pending/active/done/failed lifecycle natively
  3. **`schema:potentialAction` for chaining** — one action's potentialAction is the next step. This IS composition.
  4. **`schema:instrument`** — maps to skills (debugging, refactoring) without custom predicates
  5. **Massively adopted** — Schema.org is used by Google, Microsoft, Apple. Tooling everywhere.
  6. **Already in the harness namespace** — `SCHEMA = "https://schema.org/"` is already declared in `xtdb-event-logger/rdf/namespaces.ts`
  7. **Action subtypes map to our agent roles:**
     - explorer → `schema:SearchAction`
     - architect → `schema:PlanAction`
     - planner → `schema:PlanAction`
     - worker → `schema:CreateAction`
     - tester → `schema:AssessAction`
     - reviewer → `schema:ReviewAction`
     - debugger → `schema:AssessAction`
  8. **Rich result modeling** — `schema:result` can link to artifacts via `@id`

- **Weaknesses:** No explicit "step position" property (use `schema:position` from `ListItem` mixin). No "prompt template" concept (needs one custom predicate).

#### C. BPMN Ontology
- **Rejected** — 300+ classes, designed for enterprise business processes. Massively over-engineered.

#### D. PROV-O Alone
- **Rejected** — No Step primitive, no ordering, no agent assignment. Too low-level.

### Recommendation: Schema.org Action Types + PROV-O

**Schema.org Action wins over P-Plan** because:

| Concern | P-Plan | Schema.org Action |
|---------|--------|-------------------|
| Agent assignment | Custom predicate needed | `schema:agent` built-in |
| Action status | Custom predicate needed | `schema:actionStatus` with 4 states |
| Step chaining | `p-plan:isPrecededBy` (backward) | `schema:potentialAction` (forward, composable) |
| Tool/skill | Custom predicate needed | `schema:instrument` built-in |
| Results | Custom predicate needed | `schema:result` built-in |
| Action subtypes | None — all steps are generic | SearchAction, PlanAction, CreateAction, AssessAction, ReviewAction |
| Adoption | ~200 academic citations | Billions of web pages, all major search engines |
| Already in harness | No | Yes — `SCHEMA` namespace in namespaces.ts |
| Custom predicates needed | 5+ (agent, status, instrument, prompt, position) | 1 (prompt template only) |

P-Plan would require us to reinvent `agent`, `status`, `instrument`, and `result` as custom `ev:` predicates. Schema.org has all of these built in. The only custom predicate we need is `ev:promptTemplate` for the prompt text.

We combine Schema.org Action with PROV-O for the provenance bridge:
- Workflow execution activities link to sessions via `prov:wasAssociatedWith`
- Artifacts produced by a step link via `prov:wasGeneratedBy`
- This connects workflows into the existing provenance graph

## 4. JSON-LD @context

```json
{
  "@context": {
    "schema": "https://schema.org/",
    "prov": "http://www.w3.org/ns/prov#",
    "ev": "https://pi.dev/events/",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  }
}
```

This reuses the context already declared in `xtdb-event-logger/rdf/namespaces.ts`.

### Mapping: Workflow Concepts → Schema.org + ev:

| Workflow Concept | Property | Vocabulary |
|-----------------|----------|------------|
| Workflow (template) | `@type: schema:HowTo` | schema.org |
| Step | `@type: schema:Action` (or subtype) | schema.org |
| Step name | `schema:name` | schema.org |
| Step description | `schema:description` | schema.org |
| Step position | `schema:position` | schema.org |
| Agent role | `schema:agent` → `@id: urn:pi:agent:<role>` | schema.org |
| Skill/tool | `schema:instrument` → `@id: urn:pi:skill:<name>` | schema.org |
| Prompt template | `ev:promptTemplate` | custom (only custom predicate) |
| Transition mode | `ev:transitionMode` ("user" / "auto") | custom |
| Next step | `schema:potentialAction` → `@id` of next step | schema.org |
| Sub-workflow | `schema:potentialAction` → another `schema:HowTo` | schema.org (composition!) |
| Step status (runtime) | `schema:actionStatus` → `schema:PotentialActionStatus` etc. | schema.org |
| Result artifacts | `schema:result` → `@id: urn:pi:artver:<id>` | schema.org |
| Session link | `prov:wasAssociatedWith` → `@id: urn:pi:session:<id>` | PROV-O |

**Only 2 custom `ev:` predicates needed** (promptTemplate, transitionMode). Everything else is standard vocabulary.

## 5. Workflow Definition: feature-build

This is loaded as JSON-LD, parsed by `jsonld` processor, stored as RDF triples:

```json
{
  "@context": {
    "schema": "https://schema.org/",
    "prov": "http://www.w3.org/ns/prov#",
    "ev": "https://pi.dev/events/",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@id": "urn:pi:workflow:feature-build",
  "@type": "schema:HowTo",
  "schema:name": "feature-build",
  "schema:description": "Build a feature from requirements to tested code",
  "schema:step": [
    {
      "@id": "urn:pi:workflow:feature-build/step/explore",
      "@type": "schema:SearchAction",
      "schema:name": "explore",
      "schema:description": "Explore the codebase to understand the current state",
      "schema:position": 1,
      "schema:agent": { "@id": "urn:pi:agent:explorer" },
      "schema:actionStatus": "schema:PotentialActionStatus",
      "ev:promptTemplate": "Explore the codebase to understand the current state.\nFocus on: {context}\nIdentify relevant files, patterns, and constraints.",
      "ev:transitionMode": "user",
      "schema:potentialAction": { "@id": "urn:pi:workflow:feature-build/step/architect" }
    },
    {
      "@id": "urn:pi:workflow:feature-build/step/architect",
      "@type": "schema:PlanAction",
      "schema:name": "architect",
      "schema:description": "Design the architecture",
      "schema:position": 2,
      "schema:agent": { "@id": "urn:pi:agent:architect" },
      "schema:instrument": { "@id": "urn:pi:skill:architecture-review" },
      "schema:actionStatus": "schema:PotentialActionStatus",
      "ev:promptTemplate": "Based on the exploration above, design the architecture for: {task}\nProduce ARCHITECTURE.md with components, boundaries, and interfaces.",
      "ev:transitionMode": "user",
      "schema:potentialAction": { "@id": "urn:pi:workflow:feature-build/step/plan" }
    },
    {
      "@id": "urn:pi:workflow:feature-build/step/plan",
      "@type": "schema:PlanAction",
      "schema:name": "plan",
      "schema:description": "Create implementation plan",
      "schema:position": 3,
      "schema:agent": { "@id": "urn:pi:agent:planner" },
      "schema:actionStatus": "schema:PotentialActionStatus",
      "ev:promptTemplate": "Create an implementation plan based on the architecture above.\nProduce PLAN.md with ordered steps, file changes, and effort estimates.",
      "ev:transitionMode": "user",
      "schema:potentialAction": { "@id": "urn:pi:workflow:feature-build/step/implement" }
    },
    {
      "@id": "urn:pi:workflow:feature-build/step/implement",
      "@type": "schema:CreateAction",
      "schema:name": "implement",
      "schema:description": "Implement the plan",
      "schema:position": 4,
      "schema:agent": { "@id": "urn:pi:agent:worker" },
      "schema:actionStatus": "schema:PotentialActionStatus",
      "ev:promptTemplate": "Implement the plan from PLAN.md. Work through each step.\nTest as you go. Commit after each completed unit.",
      "ev:transitionMode": "user",
      "schema:potentialAction": { "@id": "urn:pi:workflow:feature-build/step/test" }
    },
    {
      "@id": "urn:pi:workflow:feature-build/step/test",
      "@type": "schema:AssessAction",
      "schema:name": "test",
      "schema:description": "Test the implementation",
      "schema:position": 5,
      "schema:agent": { "@id": "urn:pi:agent:tester" },
      "schema:instrument": { "@id": "urn:pi:skill:test-writing" },
      "schema:actionStatus": "schema:PotentialActionStatus",
      "ev:promptTemplate": "Review and test the implementation. Write missing tests.\nVerify all tests pass. Report coverage gaps.",
      "ev:transitionMode": "auto",
      "schema:potentialAction": { "@id": "urn:pi:workflow:feature-build/step/review" }
    },
    {
      "@id": "urn:pi:workflow:feature-build/step/review",
      "@type": "schema:ReviewAction",
      "schema:name": "review",
      "schema:description": "Review code changes",
      "schema:position": 6,
      "schema:agent": { "@id": "urn:pi:agent:reviewer" },
      "schema:instrument": { "@id": "urn:pi:skill:code-review" },
      "schema:actionStatus": "schema:PotentialActionStatus",
      "ev:promptTemplate": "Review the code changes for correctness, style, security, and performance.",
      "ev:transitionMode": "user"
    }
  ]
}
```

### Composition: Sub-workflow Reference

A step's `schema:potentialAction` can reference another `schema:HowTo` — this is standard Schema.org composition, no custom predicates:

```json
{
  "@id": "urn:pi:workflow:full-pipeline",
  "@type": "schema:HowTo",
  "schema:name": "full-pipeline",
  "schema:description": "Exploration + feature build + security audit",
  "schema:step": [
    {
      "@id": "urn:pi:workflow:full-pipeline/step/explore-phase",
      "@type": "schema:Action",
      "schema:name": "exploration phase",
      "schema:position": 1,
      "schema:potentialAction": { "@id": "urn:pi:workflow:exploration" },
      "ev:transitionMode": "user"
    },
    {
      "@id": "urn:pi:workflow:full-pipeline/step/build-phase",
      "@type": "schema:Action",
      "schema:name": "build phase",
      "schema:position": 2,
      "schema:potentialAction": { "@id": "urn:pi:workflow:feature-build" },
      "ev:transitionMode": "user"
    },
    {
      "@id": "urn:pi:workflow:full-pipeline/step/audit-phase",
      "@type": "schema:Action",
      "schema:name": "security audit phase",
      "schema:position": 3,
      "schema:potentialAction": { "@id": "urn:pi:workflow:security-audit" },
      "ev:transitionMode": "user"
    }
  ]
}
```

### Runtime Execution State

When a workflow runs, step statuses are updated in-place using `schema:actionStatus`. Execution records as PROV-O activities connect to the session provenance graph:

```json
{
  "@id": "urn:pi:wfexec:abc123",
  "@type": ["schema:Action", "prov:Activity"],
  "schema:name": "feature-build execution",
  "schema:object": { "@id": "urn:pi:workflow:feature-build" },
  "prov:wasAssociatedWith": { "@id": "urn:pi:session:def456" },
  "schema:actionStatus": "schema:ActiveActionStatus",
  "schema:result": [
    { "@id": "urn:pi:artver:architecture-md-v1" },
    { "@id": "urn:pi:artver:plan-md-v1" }
  ],
  "prov:startedAtTime": { "@value": "2026-03-19T10:30:00Z", "@type": "xsd:dateTime" }
}
```

## 6. RDF Processing Pipeline

Following the pattern from `xtdb-event-logger/rdf/`:

```
workflow.jsonld file
       │
       ▼
┌──────────────────┐
│ jsonld.expand()  │  ← proper JSON-LD expansion (resolves @context)
│ or N3 Parser     │
└──────────────────┘
       │
       ▼
   RDF triples (N3 Store)
       │
       ├──▶ Validate (check rdf:type, required properties)
       ├──▶ Query (find steps by position, resolve potentialAction chains)
       ├──▶ Merge (compose sub-workflows by graph union)
       │
       ▼
┌──────────────────────────┐
│ jsonld-streaming-         │
│ serializer → JSON-LD     │  ← for XTDB storage / API output
└──────────────────────────┘
```

### New file: `workflow-engine/rdf/workflow-graph.ts`

```typescript
import { DataFactory, Store, Parser, Writer } from "n3";
import { SCHEMA, EV, PROV } from "../../xtdb-event-logger/rdf/namespaces.ts";

const { namedNode, literal } = DataFactory;

/** Load a .jsonld workflow file into an N3 Store */
export async function loadWorkflowGraph(jsonldPath: string): Promise<Store> {
  // Use jsonld library to expand, then N3 to parse
  const jsonld = await import("jsonld");
  const raw = JSON.parse(readFileSync(jsonldPath, "utf-8"));
  const expanded = await jsonld.expand(raw);
  const nquads = await jsonld.toRDF(raw, { format: "application/n-quads" });

  const store = new Store();
  const parser = new Parser({ format: "N-Quads" });
  store.addQuads(parser.parse(nquads));
  return store;
}

/** Extract ordered steps from a workflow graph */
export function getSteps(store: Store, workflowId: string): WorkflowStep[] {
  const wf = namedNode(workflowId);
  const stepQuads = store.getQuads(wf, namedNode(`${SCHEMA}step`), null, null);
  // ... query each step for position, agent, prompt, transition
}
```

## 7. Built-in Workflow Templates

| Name | Chain | Action Types |
|------|-------|-------------|
| `feature-build` | explorer → architect → planner → worker → tester → reviewer | Search → Plan → Plan → Create → Assess → Review |
| `bug-fix` | debugger → worker → tester | Assess → Create → Assess |
| `exploration` | explorer → architect → planner | Search → Plan → Plan |
| `refactoring` | architect → planner → refactorer → tester → reviewer | Plan → Plan → Create → Assess → Review |
| `code-review` | reviewer → refactorer → tester | Review → Create → Assess |
| `security-audit` | security-auditor → worker → tester | Assess → Create → Assess |

## 8. Storage

### XTDB `workflows` table
- `_id`: `urn:pi:workflow:<name>`
- `name`, `description`, `version`
- `jsonld`: Full JSON-LD document (serialized by `jsonld-streaming-serializer`)
- `ts`: timestamp

### XTDB `workflow_executions` table
- `_id`: `urn:pi:wfexec:<uuid>`
- `workflow_id`, `session_id`, `current_step`, `task`
- `step_states`: JSON array of `{ position, actionStatus, startedAt, endedAt }`
- `jsonld`: Execution record as PROV-O Activity
- `ts`: timestamp

### File storage: `~/.pi/agent/workflows/*.jsonld`

## 9. Architecture

Same extension-only approach as before:

```
┌────────────────────────────┐
│  workflow-engine            │  (new extension)
│  ├─ rdf/workflow-graph.ts  │  ← N3 + jsonld processing
│  ├─ loads .jsonld defs     │  ← proper JSON-LD expansion
│  ├─ upserts to XTDB       │  ← serialized via jsonld-streaming-serializer
│  ├─ injects role           │  ← before_agent_start hook
│  ├─ tracks state           │  ← appendEntry + XTDB persistence
│  └─ reports status         │  ← ctx.ui.setStatus("workflow", JSON)
└────────────────────────────┘
```

Dependencies: `n3`, `jsonld`, `jsonld-streaming-serializer`, `@rdfjs/types` (all already used in xtdb-event-logger).

## 10. Implementation Plan

### Phase 1: RDF Core + Extension (~300 lines, 4 files)
1. `workflow-engine/rdf/workflow-graph.ts` — Load .jsonld → N3 Store, extract steps, validate schema:HowTo structure
2. `workflow-engine/index.ts` — Extension: state machine, before_agent_start hook, /workflow command, set_workflow tool
3. `workflow-engine/package.json` — Dependencies (n3, jsonld, jsonld-streaming-serializer)

### Phase 2: Workflow Definitions (~6 files)
4. Six `.jsonld` files in `~/.pi/agent/workflows/`

### Phase 3: Web-Chat UI (~100 lines, 3 files)
5. Sidebar HTML, client JS workflow renderer, CSS

### Phase 4: Integration (~50 lines)
6. Chunker interop, agent validation, deploy task

**~450 lines across ~14 files, ~4 sessions**

## 11. Sidebar UI

```
┌─────────────────────────────────┐
│ ▸ Workflow                      │
│                                 │
│   🔨 feature-build         [✕] │
│                                 │
│   ✅ 1. explore  (SearchAction) │
│   ✅ 2. architect (PlanAction)  │
│   👉 3. plan     (PlanAction)   │
│   ⬜ 4. implement (CreateAction)│
│   ⬜ 5. test     (AssessAction) │
│   ⬜ 6. review   (ReviewAction) │
│                                 │
│   [■■■□□□] 2/6                  │
│   [📋 Switch]                   │
└─────────────────────────────────┘
```

## 12. Risks

**R1: jsonld library size** — The `jsonld` npm package is ~150KB. Acceptable for a server-side extension. Not a browser concern.

**R2: before_agent_start hook conflict with chunker** — Workflow injects the broad role, chunker appends step focus. Additive.

**R3: Schema.org HowTo/Action semantics don't perfectly match** — `schema:HowTo` is designed for instructional content. We're using it for executable workflow templates. This is a pragmatic mapping, not a perfect semantic fit — but Schema.org explicitly encourages extensions via custom properties, and the Action status/agent/instrument model is a genuine match.

**R4: Compaction loses context** — State persisted via appendEntry + XTDB survives. before_agent_start re-injects per turn.
