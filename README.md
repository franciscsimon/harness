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
| Docker | any | XTDB container |

## Quick Start

```bash
# 1. Start XTDB (postgres wire protocol on port 5433)
docker run -d --name xtdb-events \
  -p 5433:5432 -p 8081:8080 \
  ghcr.io/xtdb/xtdb:latest

# 2. Install UI dependencies
cd xtdb-event-logger-ui && npm install

# 3. Start the event stream UI
npm start  # → http://localhost:3333

# 4. Start pi — extensions auto-load from ~/.pi/agent/extensions/
pi
```

Events flow into XTDB automatically. Open http://localhost:3333 to see them.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  pi.dev agent session                               │
│                                                     │
│  ┌─────────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ 40 extensions│  │ 20 agents│  │ 10 skills     │  │
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
          │ 30 events (full content; message_update/tool_execution_update sampled at 2s)
          ▼
┌─────────────────┐     ┌──────────────────────┐
│  XTDB v2        │────▶│  Event Stream UI     │
│  :5433 (pg wire)│     │  :3333 (Hono)        │
│                 │     │                      │
│  events table   │     │  • Live stream + SSE │
│  JSON-LD / RDF  │     │  • Session timeline  │
│  schema v2      │     │  • Dashboard         │
└─────────────────┘     │  • Knowledge extract │
                        └──────────────────────┘
```

## Extensions (40)

Extensions live in `~/.pi/agent/extensions/` and activate automatically. Use `task setup:all` to deploy everything, or `task ext:deploy:all` for extensions only.

| Category | Extensions |
|----------|-----------|
| **Event capture** | `xtdb-event-logger` (all 30 events → XTDB, JSON-LD, schema v2), `xtdb-projector` (task/reasoning/result/state projections) |
| **Project history** | `project-registry` (auto-registers projects), `decision-log` (`log_decision` tool), `history-retrieval` (injects prior failures), `artifact-tracker` (file mutation tracking), `session-postmortem` (per-session summaries) |
| **Safety** | `permission-gate` (blocks dangerous bash), `protected-paths` (prevents writes to critical files), `git-checkpoint` (stashes each turn, `/fork` restore) |
| **Quality** | `quality-hooks` (`quality_check` + `diff_check` tools), `slop-detector` (`check_antipatterns` tool), `habit-monitor` (coding habit enforcement) |
| **Context** | `canary-monitor` (context health alerts), `custom-compaction` (Gemini Flash structured summaries), `semantic-zoom` (`set_zoom` tool), `noise-cancellation` (filters low-signal events) |
| **Knowledge** | `knowledge-extractor` (session knowledge → markdown sidecar), `knowledge-checkpoint` (`save_checkpoint` tool), `knowledge-composer` (assembles reference docs), `jit-docs` (`lookup_docs` tool), `reference-docs` (`load_reference` tool) |
| **Workflow** | `chunker` (`plan_chunks` tool), `alignment-monitor` (`check_alignment` tool), `refinement-loop` (iterative improvement), `parallel-impl` (parallel task execution) |
| **Agents** | `agent-spawner` (`delegate` tool, spawns subagents), `role-loader` (`/agent`, `/role` commands) |
| **Session** | `handoff` (`/handoff` generates transfer prompt), `contextual-prompts` (context-aware suggestions), `reminders` (persistent reminders) |
| **Detection** | `leap-detector` (flags assumption jumps), `yak-shave` (detects tangent chains), `sunk-cost-detector` (flags stuck approaches), `offload-detector` (catches manual work), `feedback-flip` (reversal detection) |
| **Other** | `happy-to-delete` (encourages deletion), `mind-dump` (brain dump capture), `playgrounds` (experimental sandboxes), `orchestrator` (multi-agent coordination) |

## Agents (20)

Agents are focused roles in `~/.pi/agent/agents/*.md`. Invoke with the `delegate` tool or `/agent` command. Use `task agents:deploy` (or `task setup:all`) to deploy.

| Category | Agents |
|----------|--------|
| **Build** | `worker`, `tester`, `refactorer`, `migrator`, `optimizer` |
| **Review** | `reviewer`, `committer`, `security-auditor`, `janitor` |
| **Design** | `architect`, `planner`, `interface-first`, `explorer`, `researcher` |
| **Workflow** | `debugger`, `documenter`, `borrower`, `softest-prototype`, `refiner`, `fixture-tester` |

Read-only agents (`reviewer`, `planner`, `architect`, `researcher`, `security-auditor`, `documenter`, `committer`) are automatically restricted to read-only tools at runtime.

## Skills (10)

Skills are on-demand workflow packages in `~/.pi/agent/skills/`. The agent loads them when a task matches. Use `task skills:deploy` (or `task setup:all`) to deploy.

| Skill | Trigger |
|-------|---------|
| `architecture-review` | Onboarding to a codebase, before design changes |
| `code-review` | Reviewing PRs, diffs, code before commit |
| `context-management` | Long sessions, degraded context |
| `debugging` | Tracking down bugs (log-first approach) |
| `knowledge-extraction` | Before compacting or ending productive sessions |
| `migration` | Upgrading dependencies, modernizing code |
| `performance-optimization` | Profiling and optimizing bottlenecks |
| `refactoring` | Restructuring code without behavior changes |
| `security-audit` | Before deploying, reviewing sensitive code |
| `test-writing` | Adding test coverage |

## Custom Tools (11)

Registered by extensions, callable by the LLM during sessions.

| Tool | Extension | Purpose |
|------|-----------|---------|
| `quality_check` | quality-hooks | Run code quality checks on a file |
| `diff_check` | quality-hooks | Check if staged changes are commit-sized |
| `plan_chunks` | chunker | Break complex tasks into ordered steps |
| `check_alignment` | alignment-monitor | Verify work matches original request |
| `save_checkpoint` | knowledge-checkpoint | Save session state checkpoint |
| `set_zoom` | semantic-zoom | Set response detail level |
| `lookup_docs` | jit-docs | Search and load documentation |
| `load_reference` | reference-docs | Load a reference doc by name |
| `check_antipatterns` | slop-detector | Scan text for AI anti-patterns |
| `delegate` | agent-spawner | Spawn a subagent with isolated context |
| `log_decision` | decision-log | Record a decision, failure, or deferral for the project |

## Event Stream UI

Start with `cd xtdb-event-logger-ui && npm start` → http://localhost:3333

| Page | URL | Description |
|------|-----|-------------|
| **Stream** | `/` | Live event stream with SSE, category filters, search |
| **Sessions** | `/sessions` | Session list with health scores and badges |
| **Session Detail** | `/sessions/:id` | Timeline with nested grouping (agent → turn → tool), context sparkline, rot zone detection |
| **Event Detail** | `/event/:id` | All fields + expandable JSON content blocks + JSON-LD |
| **Dashboard** | `/dashboard` | Aggregated health metrics, error patterns, tool usage |
| **Knowledge** | `/sessions/:id/knowledge` | Extracted decisions, gotchas, patterns from a session |
| **Projects** | `/projects` | Registered projects with identity type, session count |
| **Project Detail** | `/projects/:id` | Project info, linked sessions, decisions, JSON-LD |
| **Decisions** | `/decisions` | All logged decisions across projects with outcomes |

### Keyboard Shortcuts (in pi)

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+Q` | Toggle quality hooks on/off |
| `Ctrl+Alt+G` | Quick git checkpoint |

### CLI Flags

```bash
pi --quality      # Enable quality hooks
pi --checkpoints  # Enable git checkpoints
```

## Event Schema

All 30 pi events are captured with full content (schema v2). Streaming events (`message_update`, `tool_execution_update`) are sampled at 2s intervals to avoid flooding XTDB.

| Category | Events |
|----------|--------|
| **Session** (11) | `session_directory`, `session_start`, `session_before_switch`, `session_switch`, `session_before_fork`, `session_fork`, `session_before_compact`, `session_compact`, `session_before_tree`, `session_tree`, `session_shutdown` |
| **Agent** (7) | `before_agent_start`, `agent_start`, `agent_end`, `turn_start`, `turn_end`, `context`, `before_provider_request` |
| **Message** (3) | `message_start`, `message_update`, `message_end` |
| **Tool** (5) | `tool_call`, `tool_result`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end` |
| **Other** (4) | `input`, `user_bash`, `model_select`, `resources_discover` |

Each event is stored with:
- Structured fields (scalar metadata)
- Full content fields (complete JSON, no size limits)
- JSON-LD serialization (RDF triples)

## Querying XTDB

```bash
# Connect via psql
psql -h localhost -p 5433 -d xtdb -U xtdb

# Recent events
SELECT event_name, ts, session_id FROM events ORDER BY seq DESC LIMIT 20;

# Tool usage
SELECT tool_name, COUNT(*) FROM events
WHERE event_name = 'tool_call' GROUP BY tool_name ORDER BY count DESC;

# Session context growth
SELECT seq, provider_payload_bytes FROM events
WHERE session_id = 'your-session-id' AND provider_payload_bytes IS NOT NULL
ORDER BY seq;

# Full tool output for a specific call
SELECT tool_content, tool_details FROM events
WHERE tool_call_id = 'your-call-id' AND event_name = 'tool_result';

# Registered projects
SELECT _id, name, identity_type, session_count FROM projects ORDER BY last_seen_ts DESC;

# Project decisions (failures, successes, deferrals)
SELECT task, what, outcome, why FROM decisions
WHERE project_id = 'proj:...' ORDER BY ts DESC;

# Sessions linked to a project
SELECT session_id, cwd, is_first_session FROM session_projects
WHERE project_id = 'proj:...' ORDER BY ts DESC;
```

## Testing

```bash
# Handler unit tests (24 tests across 14 handlers)
cd test && npx jiti handler-tests.ts

# Seed test data (12 sessions for augmented pattern tests)
cd test && npx jiti seed-augmented-patterns.ts

# Full test suite (91 automated tests across 6 categories)
cd test && npx jiti run-tests.ts

# Hello-service example tests
cd examples/hello-service && npm install && npx jiti test.ts
```

## File Layout

```
~/harness/                          # Version-controlled copies
├── README.md
├── xtdb-event-logger/              # Event capture extension source
│   ├── handlers/                   # 30 event handler files
│   ├── endpoints/                  # xtdb.ts, jsonl.ts, console.ts
│   ├── rdf/                        # JSON-LD serialization
│   ├── types.ts                    # EventFields, schema v2
│   └── index.ts                    # Extension entry point
├── project-registry/                # Project identity + XTDB persistence
├── decision-log/                   # Decision/failure/deferral logging
├── xtdb-event-logger-ui/           # Web UI (Hono)
│   ├── pages/                      # Server-rendered HTML
│   ├── lib/                        # DB queries, formatting, health
│   └── static/                     # CSS, JS
├── templates/                      # Agent role templates (20)
├── skills/                         # Skill packages (10)
├── docs/                           # Architecture docs, audits
├── data-examples/                  # JSON-LD event samples
└── test/                           # Handler tests, seed data

~/.pi/agent/
├── extensions/                     # Live extensions (40)
├── agents/                         # Agent definitions (20)
└── skills/                         # Skill definitions (10)
```

## Background

Built on the [Augmented Coding Patterns](https://lexler.github.io/augmented-coding-patterns) catalog (69 items: 45 patterns + 10 anti-patterns + 14 obstacles). Coverage: 63/63 implementable items (6 excluded as N/A for single-agent CLI).
