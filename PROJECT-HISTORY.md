# Harness Project History

Generated from git log (125 commits), XTDB (20,929 events across 29 sessions), 49 decisions, 13 delegations, 211 artifacts, 14 session postmortems.

Timeline: **2026-03-16 → 2026-03-19** (4 days)

---

## Day 1 — March 16: Foundation Sprint (38 commits)

The project was born in a single intense day, building the entire observability and extension infrastructure.

### Phase 1: Event Logger Core (commits 1–7)
- **xtdb-event-logger** — pi extension that captures all 30 SDK events into XTDB v2 with JSON-LD triples
- **Event stream web UI** — live SSE visualization of XTDB events (port 3333)
- **Session grouping** — list + nested timeline views for events grouped by session

### Phase 2: Augmented Coding Patterns (commits 8–21)
Massive implementation sprint covering 63 patterns from [lexler.github.io/augmented-coding-patterns](https://lexler.github.io/augmented-coding-patterns):
- **V1**: 6 core patterns (91/103 tests passing)
- **V2 Phase 1–3**: 12 additional patterns
- **V2 Phase 2**: 5 more extensions
- **Full audit**: identified 20 missing patterns, then implemented all 20
- **Final count**: 63/63 implementable patterns covered (100%)

Extensions created in this phase include: alignment-monitor, canary-monitor, chunker, contextual-prompts, custom-compaction, feedback-flip, git-checkpoint, habit-monitor, handoff, happy-to-delete, jit-docs, knowledge-checkpoint, knowledge-composer, knowledge-extractor, leap-detector, mind-dump, noise-cancellation, offload-detector, orchestrator, parallel-impl, permission-gate, playgrounds, protected-paths, quality-hooks, reference-docs, refinement-loop, reminders, role-loader, semantic-zoom, slop-detector, sunk-cost-detector, yak-shave.

### Phase 3: Agent Infrastructure (commits 22–38)
- **Agent spawner** — delegate tool for spawning focused sub-agents
- **20 agent roles** — architect, planner, worker, tester, debugger, reviewer, refactorer, security-auditor, optimizer, janitor, researcher, migrator, documenter, explorer, borrower, committer, interface-first, fixture-tester, softest-prototype, refiner
- **10 skills** — architecture-review, code-review, context-management, debugging, knowledge-extraction, migration, performance-optimization, refactoring, security-audit, test-writing
- **Role loader** — enforces setActiveTools for read-only agents
- **Keyboard shortcuts + mode flags**
- **Custom compaction + handoff**

**Day 1 summary**: From zero to a fully instrumented AI coding harness with 30+ extensions, 20 agents, 10 skills, event logging, and a web UI. All built by AI agents in ~4 hours.

---

## Day 2 — March 17: Data Integrity & Provenance (49 commits)

Focus shifted to data quality, provenance, and proving the multi-agent pipeline works.

### Morning: Event Capture Quality (commits 39–51)
- Extracted 21 JSON-LD event examples and audited all handlers
- Found **15 handlers dropping data** — fixed across P0/P1/P2 priority tiers
- Schema v2: added 15 new content columns to XTDB INSERT
- Full capture: 24/24 handler tests passing
- UI fixes: `SELECT *` instead of hardcoded columns, expandable content blocks

### Afternoon: Documentation & Example Pipeline (commits 52–58)
- README, QUICKSTART, DESIGN.md for hello-service
- **Multi-agent pipeline demonstration**: architect → planner → worker → tester
  - Architect analyzed DESIGN.md → produced ARCHITECTURE.md
  - Planner produced self-contained PLAN.md with exact file contents
  - Worker implemented 4 files exactly per plan
  - Tester verified all 6 assertions pass
- Proved the pipeline works end-to-end

### Evening: Trust & Artifact System (commits 59–87)
- **Phase 1 — Trust fixes**: fixed delegate tool crash (`_ctx` → `ctx` typo), resource loading, pi.extensions manifests
- **Phase 2 — Foundations**: delegations table, cross-session sunk-cost detection, session postmortems with JSON-LD
- **Phase 3 — Artifact history**: artifact-tracker extended with versioned .md storage, PROV-O provenance chains, export-provenance command
- **Phase 4 — Active history**: history-retrieval, artifact reads tracking
- **Phase 5 — Artifact versions UI**: 3 new pages (list, version detail, content viewer) with inline diff, rendered markdown, provenance panels

**XTDB stats for Day 2**: 14 sessions, ~8,000 events, first decisions and delegations logged.

---

## Day 3 — March 18: Web Chat UI (20 commits)

The biggest architectural addition — a full web-based chat interface.

### Web Chat Server (commits 88–95)
- **Proposal phase**: evaluated 4 approaches, recommended standalone server on port 3334
- **Implementation**: Hono + WebSocket + createAgentSession()
- Vanilla JS frontend with streaming markdown, collapsible tool calls + thinking blocks
- Session persistence via sessionStorage + init message protocol
- "Open in Chat" button on session detail page

### Web Chat Polish (commits 96–107)
- Extension parity — all harness extensions load in web-chat sessions
- UI bridge for ctx.ui methods (notify, setStatus, confirm, select, input)
- Sidebar with session info, decisions, artifacts, model/thinking controls
- Slash command discovery + autocomplete
- Dashboard JSON APIs + CORS
- **Security audit**: 4 high, 5 medium, 4 low findings documented
- Header controls moved to sidebar for cleaner layout

**Day 3 summary**: Web-chat went from proposal to fully functional in one day. Users can now interact with pi through a browser instead of terminal.

---

## Day 4 — March 19: Composable Workflows & Quality (28 commits)

Focus split between the workflow engine, quality improvements, and testing infrastructure.

### Morning: Bug Fixes & Connection Tuning (commits 108–111)
- **Postgres pool tuning**: reduced from ~90N connections to ~9 per session across 10 postgres() calls
- **Web-chat tool display fix**: corrected 3 field-name mismatches (SDK uses `args`/`partialResult`/`result`, not `input`/`text`)
- **Quality hooks fix**: `tool_execution_end` lacks `args` — added pendingArgs Map bridging start→end events

### Midday: Composable Workflow Engine (commits 112–115)
- Evaluated 6 RDF vocabularies, selected Schema.org Action + PROV-O
- Built workflow-engine extension with JSON-LD → N3 Store pipeline
- 6 workflow definitions (.jsonld): feature-build, bug-fix, code-review, refactoring, exploration, security-audit
- Workflow sidebar UI in web-chat

### Afternoon: Quality & Testing (commits 116–125)
- Warning thresholds raised (turns: 5→20, context: 100KB→800KB) for 1M token windows
- New Session button fixed (3 rounds: tab isolation, sessionStorage cloning, server-side createNew flag)
- Auto-scroll fix in web-chat (scroll-behavior:smooth race condition)
- **Extension load testing** — 3-layer system:
  - Layer 1: `task ext:test` — mock ExtensionAPI proxy tests all 41 extensions
  - Layer 2: quality-hooks auto-check on extension write
  - Layer 3: contextual prompt nudge to run tests after editing extensions
- Fixed `pi.addCommand`/`pi.addTool` → `pi.registerCommand`/`pi.registerTool` in workflow-engine
- Fixed extension commands not working in web-chat (uiContext not passed to bindExtensions)

---

## Quantitative Summary

| Metric | Count |
|--------|-------|
| Git commits | 125 |
| Calendar days | 4 |
| Extensions | 41 |
| Agent roles | 20 |
| Skills | 10 |
| XTDB events | 20,929 |
| Sessions tracked | 29 |
| Decisions logged | 49 |
| Agent delegations | 13 |
| Artifacts tracked | 211 |
| Artifact versions | 7 |
| Session postmortems | 14 |
| Proposals written | 5 (web-chat, session persistence, artifacts, artifact-jsonld, artifact-versions-ui, composable-workflows, extension-testing) |

## Architecture as of Day 4

```
┌─────────────────────────────────────────────────────────┐
│                    pi SDK (npm)                          │
│  createAgentSession() → AgentSession → events           │
└─────────────┬───────────────────────────┬───────────────┘
              │                           │
    ┌─────────▼──────────┐     ┌──────────▼──────────┐
    │  41 Extensions     │     │  Web Chat Server    │
    │  ~/.pi/agent/ext/  │     │  :3334 (Hono + WS)  │
    │  ├── event-logger  │     │  ├── session-pool    │
    │  ├── decision-log  │     │  ├── chat.js/css     │
    │  ├── artifact-track│     │  └── sidebar + cmds  │
    │  ├── agent-spawner │     └─────────────────────┘
    │  ├── quality-hooks │
    │  ├── workflow-engine│
    │  └── 35 more...    │
    └─────────┬──────────┘
              │
    ┌─────────▼──────────┐     ┌─────────────────────┐
    │  XTDB v2           │     │  Event Logger UI    │
    │  :5433 (postgres)  │◄────│  :3333 (Hono SSR)   │
    │  :8081 (HTTP)      │     │  sessions, events,  │
    │  13 tables         │     │  decisions, artifacts│
    └────────────────────┘     │  dashboard, projects │
                               └─────────────────────┘
```

## Key Technical Decisions

1. **XTDB as event store** — bitemporal, SQL + JSON-LD, single source of truth
2. **Extension-per-pattern** — each augmented coding pattern is a separate pi extension
3. **JSON-LD everywhere** — all data has semantic provenance (PROV-O vocabulary)
4. **Standalone web-chat** — separate process from monitoring UI for failure isolation
5. **Mock API testing** — Proxy-based ExtensionAPI stub catches wrong method names at write time
6. **Schema.org Action** for workflows — native agent/status/instrument fields, extends PROV-O
7. **sessionStorage per-tab** — web-chat session isolation without server-side mapping
8. **Postgres pool tuning** — max:1 per extension (was default 10), prevents connection exhaustion
