# pi.dev Augmented Coding Harness

An active quality feedback system for [pi.dev](https://pi.dev) coding agent sessions. Captures all 30 pi lifecycle events into XTDB, analyzes them in real-time, and feeds insights back into the agent loop.

```
agent events → XTDB → analysis → feedback back into agent
```

Implements 63/63 patterns from [Augmented Coding Patterns](https://lexler.github.io/augmented-coding-patterns) across three layers: **extensions** (automated hooks), **agents** (focused roles), and **skills** (on-demand workflows).

## Prerequisites

| Dependency | Version | Purpose |
|-----------|---------|---------|
| [pi.dev](https://pi.dev) | ≥ 0.58 | Coding agent |
| Node.js | ≥ 22 | Runtime |
| Docker | any | Infrastructure (XTDB, Redpanda, Garage, Keycloak) |

## Quick Start

```bash
# 1. Start infrastructure (XTDB primary+replica, Redpanda, Garage S3, Keycloak)
docker compose up -d

# 2. Seed the XTDB schema (registers all 27 tables)
NODE_PATH=xtdb-event-logger/node_modules npx jiti scripts/seed-schema.ts

# 3. Start the Harness UI (unified dashboard)
cd harness-ui && npm install && npx jiti server.ts
# → http://localhost:3336

# 4. Start the Event API (data layer for harness-ui)
cd xtdb-event-logger-ui && npm install && npm start
# → http://localhost:3333

# 5. Start pi — extensions auto-load from ~/.pi/agent/extensions/
pi
```

See [QUICKSTART.md](QUICKSTART.md) for a hands-on walkthrough building a service with harness tools.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  pi.dev agent session                               │
│                                                     │
│  ┌─────────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ 40 extensions│  │ 18 agents│  │ 10 skills     │  │
│  │ (auto hooks) │  │ (focused │  │ (on-demand    │  │
│  │              │  │  roles)  │  │  workflows)   │  │
│  └──────┬───────┘  └────┬─────┘  └───────────────┘  │
│         │               │                            │
│  ┌──────▼───────────────▼────────────────────────┐  │
│  │  11 custom tools                              │  │
│  │  quality_check, diff_check, plan_chunks,      │  │
│  │  check_alignment, save_checkpoint, set_zoom,  │  │
│  │  lookup_docs, load_reference, check_anti-     │  │
│  │  patterns, delegate, log_decision             │  │
│  └──────┬────────────────────────────────────────┘  │
└─────────┼───────────────────────────────────────────┘
          │ 30 events
          ▼
┌─────────────────────────────────────────────────────┐
│  Infrastructure (docker compose)                    │
│                                                     │
│  Redpanda (:19092) → XTDB Primary (:5433)           │
│                    → XTDB Replica (:5434)            │
│  Garage S3 (:3900) — shared object store            │
│  Keycloak (:8180) — identity provider               │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│  Services                                           │
│                                                     │
│  Harness UI    :3336 — unified dashboard            │
│  Event API     :3333 — XTDB query layer + SSE       │
│  Web Chat      :3334 — WebSocket chat interface      │
│  Ops API       :3335 — infrastructure management     │
└─────────────────────────────────────────────────────┘
```

## Infrastructure

All infrastructure runs via `docker compose up -d`:

| Service | Port | Purpose |
|---------|------|---------|
| **Redpanda** | 19092 | Kafka-compatible message broker (XTDB transaction log) |
| **XTDB Primary** | 5433 (pgwire), 8083 (http) | Main bitemporal database |
| **XTDB Replica** | 5434 (pgwire), 8084 (http) | Read replica for UI queries |
| **Garage** | 3900 | S3-compatible object store (shared storage for XTDB nodes) |
| **Keycloak** | 8180 | Identity and auth provider |

XTDB uses shared S3 storage (Garage) so both nodes read/write the same object store. Redpanda provides the Kafka-compatible transaction log.

## Services

| Service | Port | Start Command | Description |
|---------|------|---------------|-------------|
| **Harness UI** | 3336 | `cd harness-ui && npx jiti server.ts` | Unified web dashboard |
| **Event API** | 3333 | `cd xtdb-event-logger-ui && npm start` | XTDB query layer, SSE streaming, JSON APIs |
| **Web Chat** | 3334 | `cd web-chat && npx jiti server.ts` | WebSocket chat interface for pi agents |
| **Ops API** | 3335 | `cd xtdb-ops-api && npx jiti server.ts` | Infrastructure health, backup, replication |

### Harness UI Pages (http://localhost:3336)

| Page | Path | Description |
|------|------|-------------|
| **Home** | `/` | Service health status, stats overview, quick links |
| **Live Stream** | `/stream` | Real-time event stream with SSE, category filters, search |
| **Dashboard** | `/dashboard` | Session health analytics, error patterns |
| **Sessions** | `/sessions` | Session list with health scores |
| **Session Detail** | `/sessions/:id` | Event timeline, context sparkline, rot detection |
| **Flow** | `/sessions/:id/flow` | Projection-based task/reasoning/result flow |
| **Knowledge** | `/sessions/:id/knowledge` | Extracted session knowledge (tools, files, commands) |
| **Event Detail** | `/event/:id` | Full event fields + expandable JSON content |
| **Projects** | `/projects` | Project portfolio with lifecycle, dependencies, tags |
| **Decisions** | `/decisions` | Decision log with outcomes across projects |
| **Artifacts** | `/artifacts` | Tracked files with version history and diffs |
| **Errors** | `/errors` | Captured errors with severity, component filtering |
| **Chat** | `/chat` | WebSocket chat interface (connects to :3334) |
| **Ops** | `/ops` | Cluster health, replication, backup, Kafka topics |

## Extensions (40)

Extensions live in `~/.pi/agent/extensions/` and activate automatically.

| Category | Extensions |
|----------|-----------|
| **Event capture** | `xtdb-event-logger` (30 events → XTDB + JSON-LD), `xtdb-projector` (task/reasoning/result projections) |
| **Project tracking** | `project-registry`, `decision-log`, `artifact-tracker`, `deployment-tracker`, `project-lifecycle`, `requirements-tracker`, `session-postmortem`, `history-retrieval` |
| **Safety** | `permission-gate`, `protected-paths`, `git-checkpoint` |
| **Quality** | `quality-hooks`, `slop-detector`, `habit-monitor`, `canary-monitor`, `noise-cancellation` |
| **Context** | `custom-compaction`, `semantic-zoom`, `contextual-prompts` |
| **Knowledge** | `knowledge-extractor`, `knowledge-checkpoint`, `knowledge-composer`, `jit-docs`, `reference-docs` |
| **Workflow** | `chunker`, `workflow-engine`, `alignment-monitor`, `refinement-loop`, `parallel-impl`, `orchestrator` |
| **Agents** | `agent-spawner`, `role-loader` |
| **Session** | `handoff`, `reminders` |
| **Detection** | `leap-detector`, `yak-shave`, `sunk-cost-detector`, `offload-detector`, `feedback-flip` |
| **Other** | `happy-to-delete`, `mind-dump`, `playgrounds` |

## Agents (18)

Focused roles in `~/.pi/agent/agents/*.md`. Invoke with `delegate` tool.

| Category | Agents |
|----------|--------|
| **Build** | `worker`, `tester`, `refactorer`, `migrator`, `optimizer` |
| **Review** | `reviewer`, `committer`, `security-auditor`, `janitor` |
| **Design** | `planner`, `interface-first`, `explorer`, `researcher` |
| **Workflow** | `debugger`, `documenter`, `borrower`, `softest-prototype`, `refiner`, `fixture-tester` |

## Skills (10)

On-demand workflow packages in `~/.pi/agent/skills/`.

`architecture-review` · `code-review` · `context-management` · `debugging` · `knowledge-extraction` · `migration` · `performance-optimization` · `refactoring` · `security-audit` · `test-writing`

## Error Handling

Errors are captured via `captureError()` from `lib/errors.ts`:
- **Disk-first**: sync write to `~/.pi/errors/errors.jsonl` (never fails)
- **XTDB flush**: async collector flushes to `errors` table every 10s (best-effort)
- **Visible in UI**: errors page at `/errors` with severity/component filtering
- Every `catch` block must re-throw, log, notify, or be documented as intentionally silent

## Database

XTDB v2 (bitemporal, schema-on-write). 27 tables documented in [docs/XTDB_SCHEMA.md](docs/XTDB_SCHEMA.md).

```bash
# Connect via psql
psql -h localhost -p 5433 -d xtdb -U xtdb

# Recent events
SELECT event_name, ts, session_id FROM events ORDER BY seq DESC LIMIT 20;

# Errors
SELECT component, severity, error_message, ts FROM errors ORDER BY ts DESC LIMIT 10;

# Seed schema after wipe
NODE_PATH=xtdb-event-logger/node_modules npx jiti scripts/seed-schema.ts
```

## Testing

```bash
# Contract tests (black-box, no app imports — uses fetch/SQL/WebSocket)
./scripts/test-contracts.sh

# Handler unit tests
cd test && npx jiti handler-tests.ts

# Hello-service example
cd examples/hello-service && npm install && npx jiti test.ts
```

## File Layout

```
~/harness/
├── README.md                    # This file
├── QUICKSTART.md                # Hands-on walkthrough
├── LICENSE                      # MIT
├── docker-compose.yml           # Infrastructure (XTDB, Redpanda, Garage, Keycloak)
├── Taskfile.yml                 # Task runner commands
│
├── harness-ui/                  # Unified web dashboard (:3336)
│   ├── server.ts                # Hono server + routes
│   ├── pages/                   # 14 server-rendered pages
│   ├── components/              # Layout, nav, badge, table
│   ├── lib/                     # API client, formatting, health
│   └── static/                  # CSS, JS (chat, stream, ops)
│
├── xtdb-event-logger/           # Event capture extension
│   ├── handlers/                # 30 event handler files
│   ├── endpoints/               # xtdb.ts, jsonl.ts, console.ts
│   ├── rdf/                     # JSON-LD serialization
│   └── types.ts                 # EventFields, schema v2
│
├── xtdb-event-logger-ui/        # Event API service (:3333)
│   ├── server.ts                # Hono server + JSON APIs + SSE
│   ├── pages/                   # Legacy HTML pages
│   └── lib/                     # DB queries, formatting
│
├── web-chat/                    # Chat service (:3334)
├── xtdb-ops-api/                # Ops API service (:3335)
├── lib/                         # Shared libraries (errors.ts, db.ts, jsonld/)
├── agents/                      # 18 agent role definitions
├── skills/                      # 10 skill packages
├── templates/                   # Agent role templates
├── scripts/                     # seed-schema.ts, test runner
├── test/                        # Test suites + contract tests
├── docs/                        # Architecture docs, proposals, reports
└── data-examples/               # JSON-LD event samples
```

## Background

Built on the [Augmented Coding Patterns](https://lexler.github.io/augmented-coding-patterns) catalog (69 items: 45 patterns + 10 anti-patterns + 14 obstacles). Coverage: 63/63 implementable items (6 excluded as N/A for single-agent CLI).

## License

[MIT](LICENSE)
