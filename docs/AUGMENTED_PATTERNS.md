# Augmented Coding Patterns — Integration Progress

> Status: **IMPLEMENTED** (91/103 tests passing)
> Source: https://lexler.github.io/augmented-coding-patterns
> Goal: Turn the harness from passive observer into active quality feedback system
> Pattern: `agent events → XTDB → analysis → feedback back into agent`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        pi.dev session                           │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ xtdb-event-  │    │ canary-      │    │ habit-           │  │
│  │ logger       │───▶│ monitor      │───▶│ monitor          │  │
│  │ (capture)    │    │ (analyze)    │    │ (intervene)      │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────────┘  │
│         │                   │                   │               │
│         │            ctx.ui.setWidget()   ctx.ui.notify()       │
│         │            ctx.ui.notify()      prompt injection      │
│         ▼                                                       │
│  ┌──────────────┐                                               │
│  │    XTDB      │◀── queries ──┐                                │
│  │  (events DB) │              │                                │
│  └──────┬───────┘              │                                │
│         │              ┌───────┴──────────────┐                 │
└─────────┼──────────────┤ xtdb-event-logger-ui │─────────────────┘
          │              │ + dashboard          │
          └─────────────▶│ + context markers    │
                         │ + health metrics     │
                         └──────────────────────┘

Templates:  harness/templates/*.md  →  /role command  →  CLAUDE.md
```

---

## What Exists Today

| Component | Status | Notes |
|-----------|--------|-------|
| `xtdb-event-logger` extension | ✅ Done | Captures all 30 events → XTDB |
| `xtdb-event-logger-ui` | ✅ Done | Stream view, session list, session detail with nested grouping |
| XTDB Docker | ✅ Running | Port 5433, healthy |
| Event data in DB | ✅ 35 test rows | Need `/reload` for live capture |

---

## Feature 1: Context Markers in UI

> **Patterns:** Context Markers, Flying Blind
> **Priority:** 🔥🔥 | **Effort:** Low
> **What:** Visualize context health on the session timeline — show where context
> bloats, where compaction resets it, and where the agent enters the "rot zone."

### Tasks

- [ ] 1.1 Add context health data to session detail page
  - Query `context_msg_count` and `provider_payload_bytes` from events
  - Compute running totals per event in the session
  - Pass context metrics as `data-ctx-msgs` and `data-ctx-bytes` attrs on `.tl-event` nodes

- [ ] 1.2 Context health sparkline
  - Render a small SVG sparkline at top of session detail showing payload size over time
  - Mark compaction events (`session_compact`) as vertical reset lines
  - Color gradient: green (< 50KB) → yellow (50-100KB) → red (> 100KB)

- [ ] 1.3 Event-level context indicators
  - Add a small context badge on events that have `context_msg_count` or `provider_payload_bytes`
  - Color matches health: green/yellow/red
  - Tooltip: "Context: 42 msgs, 87KB payload"

- [ ] 1.4 Context rot zone marker
  - When `provider_payload_bytes` exceeds threshold (configurable, default 100KB),
    mark all subsequent events with a subtle red left-border or background tint
  - Label: "⚠️ Context rot zone — consider compacting or starting fresh"

- [ ] 1.5 CSS for context markers
  - `.ctx-badge`, `.ctx-sparkline`, `.ctx-rot-zone` styles
  - Consistent with existing color scheme

### Files to Change

| File | Change |
|------|--------|
| `xtdb-event-logger-ui/lib/db.ts` | Add `getSessionContextMetrics(sessionId)` query |
| `xtdb-event-logger-ui/pages/session-detail.ts` | Add context data attrs + sparkline HTML |
| `xtdb-event-logger-ui/static/session.js` | Render sparkline + rot zone overlay |
| `xtdb-event-logger-ui/static/style.css` | Context marker styles |

---

## Feature 2: Focused Agent Templates

> **Patterns:** Focused Agent, Ground Rules, Active Partner, Knowledge Document, Reference Docs, Context Markers
> **Priority:** 🔥🔥 | **Effort:** Low
> **What:** Pre-built CLAUDE.md templates for specialized agent roles, loadable via `/role` command.

### Tasks

- [ ] 2.1 Create template directory
  - `harness/templates/` with one `.md` file per role

- [ ] 2.2 Write `committer.md` template
  - Role: only review staged changes and write commit messages
  - Active Partner: "Push back if the diff is too large to commit atomically"
  - Context Marker: start replies with `✅`
  - Ground Rules: conventional commits, no code generation

- [ ] 2.3 Write `reviewer.md` template
  - Role: only review code, flag issues, never modify files
  - Active Partner: "Challenge assumptions, flag contradictions"
  - Context Marker: start replies with `🔍`
  - Ground Rules: no tool_call to Write/Edit, only Read + Bash(grep/find)

- [ ] 2.4 Write `refactorer.md` template
  - Role: only refactor existing code, never add features
  - Active Partner: "Push back if a request adds new behavior"
  - Context Marker: start replies with `🌀`
  - Ground Rules: all tests must pass before and after, Chain of Small Steps

- [ ] 2.5 Write `debugger.md` template
  - Role: debug with log-first approach (Approved Logs pattern)
  - Active Partner: "Say 'I don't know' rather than guessing"
  - Context Marker: start replies with `🔬`
  - Ground Rules: add console.log first, read output, form hypothesis, verify

- [ ] 2.6 Write `planner.md` template
  - Role: plan only, never implement (Check Alignment pattern)
  - Active Partner: "Ask clarifying questions before planning"
  - Context Marker: start replies with `📋`
  - Ground Rules: output markdown plans, ask "does this match your intent?"

- [ ] 2.7 Create `role-loader` pi extension
  - Register `/role <name>` command
  - On invocation: read `templates/<name>.md`, inject into session context
  - `/role list` shows available roles
  - `/role clear` removes active role
  - Show active role in `ctx.ui.setStatus()`

- [ ] 2.8 Test each template in a pi session

### Files to Create

| File | Purpose |
|------|---------|
| `harness/templates/committer.md` | Commit-focused agent role |
| `harness/templates/reviewer.md` | Code review agent role |
| `harness/templates/refactorer.md` | Refactoring agent role |
| `harness/templates/debugger.md` | Debug agent role |
| `harness/templates/planner.md` | Planning-only agent role |
| `~/.pi/agent/extensions/role-loader/index.ts` | Extension: `/role` command |
| `~/.pi/agent/extensions/role-loader/package.json` | Extension package |

---

## Feature 3: Canary Metrics

> **Patterns:** Canary in the Code Mine, Feedback Loop, Flying Blind
> **Priority:** 🔥🔥🔥 | **Effort:** Medium
> **What:** Compute quality signals from captured events and surface warnings
> when the agent is struggling.

### Metrics to Compute

| Metric | Source Events | Threshold | Signal |
|--------|-------------|-----------|--------|
| Tool failure rate | `tool_execution_end` where `is_error=true` | > 30% in last 10 calls | Agent is thrashing |
| Turn inflation | `turn_end` count per agent run | > 5 turns | Task too complex or agent lost |
| Context bloat | `provider_payload_bytes` | > 100KB | Context rot imminent |
| Retry storm | Same `tool_name` called 3+ times consecutively | 3+ identical tools | Solution fixation |
| Session duration | `agent_end.ts - agent_start.ts` | > 10 minutes | Agent may be struggling |
| Tool call density | tool calls per turn | > 8 per turn | Distracted agent |

### Tasks

- [ ] 3.1 Create `canary-monitor` extension scaffold
  - `~/.pi/agent/extensions/canary-monitor/`
  - `package.json` with `postgres` dependency
  - `index.ts` entry point

- [ ] 3.2 Implement metric: tool failure rate
  - On `tool_execution_end`: query last N tool results for this session
  - If failure rate > threshold: `ctx.ui.notify("⚠️ Tool failure rate: 40% — agent may be struggling", "warn")`

- [ ] 3.3 Implement metric: turn inflation
  - On `agent_end`: count turns for this agent run
  - If > threshold: `ctx.ui.notify("⚠️ Agent run took N turns — consider breaking the task down", "warn")`

- [ ] 3.4 Implement metric: context bloat
  - On `before_provider_request`: check `provider_payload_bytes`
  - If > threshold: `ctx.ui.notify("⚠️ Context is ${size}KB — consider /compact or fresh session", "warn")`

- [ ] 3.5 Implement metric: retry storm detection
  - On `tool_execution_start`: query last 3 tool calls
  - If same tool_name 3+ times: `ctx.ui.notify("⚠️ Same tool called 3x — step back and rethink approach", "warn")`

- [ ] 3.6 Implement metric: session duration
  - On `turn_end`: check elapsed time since `agent_start`
  - If > threshold: surface warning

- [ ] 3.7 Live status widget
  - `ctx.ui.setWidget("canary", [...metrics summary...])` updated on each `turn_end`
  - Shows: turns, tool errors, context size — like a dashboard in the TUI footer

- [ ] 3.8 Configuration
  - `~/.pi/agent/canary-monitor.json` for threshold overrides
  - Sensible defaults that don't spam

- [ ] 3.9 Test with live sessions
  - Trigger each metric threshold deliberately
  - Verify notifications appear and aren't annoying at default thresholds

### Files to Create

| File | Purpose |
|------|---------|
| `~/.pi/agent/extensions/canary-monitor/index.ts` | Extension entry point |
| `~/.pi/agent/extensions/canary-monitor/package.json` | Dependencies |
| `~/.pi/agent/extensions/canary-monitor/metrics.ts` | Metric computation logic |
| `~/.pi/agent/extensions/canary-monitor/config.ts` | Threshold config loader |
| `harness/canary-monitor/` | Repo copy of extension |

---

## Feature 4: Habit Hooks (Event-Driven Prompts)

> **Patterns:** Habit Hooks, Hooks, Selective Hearing, Reminders, Contextual Prompts
> **Priority:** 🔥🔥🔥 | **Effort:** Medium
> **What:** Detect behavioral patterns in event history and inject corrective
> prompts into the agent when thresholds are crossed.

### Habits to Implement

| Habit | Trigger Event | Detection | Prompt Injected |
|-------|--------------|-----------|-----------------|
| Commit reminder | `turn_end` | > N tool calls since last user_bash with `git commit` | "Consider committing your progress" |
| Test reminder | `tool_execution_end` where `tool_name=Write/Edit` | > N file edits without a test run | "Run tests before continuing" |
| Step back | 3+ consecutive `is_error=true` | Query recent tool results | "Stop. Re-read the error. What assumption is wrong?" |
| Fresh start hint | `provider_payload_bytes` > 150KB | From `before_provider_request` | "Context is very large. Consider /compact or new session" |
| Scope creep | Unique file paths in tool calls > N in one agent run | Query tool calls | "You're touching many files. Focus on one change at a time" |

### Tasks

- [ ] 4.1 Create `habit-monitor` extension scaffold
  - `~/.pi/agent/extensions/habit-monitor/`
  - Hooks into interceptable events where prompt injection is possible

- [ ] 4.2 Design prompt injection mechanism
  - For interceptable events (`tool_call`, `before_agent_start`, `input`):
    the handler can return modified content
  - For non-interceptable events: use `ctx.ui.notify()` as a softer signal
  - Decide: blocking prompts vs advisory notifications per habit

- [ ] 4.3 Implement habit: commit reminder
  - On `turn_end`: query tool calls since last `user_bash` containing "git commit"
  - If count > threshold: notify

- [ ] 4.4 Implement habit: test reminder
  - On `tool_execution_end` where tool is Write/Edit: query recent tool history
  - If N+ file modifications without a test-related bash call: notify

- [ ] 4.5 Implement habit: step-back on consecutive errors
  - On `tool_execution_end` where `is_error=true`: query last 3 tool results
  - If all errors: inject strong "stop and rethink" prompt

- [ ] 4.6 Implement habit: fresh start hint
  - On `before_provider_request`: check payload size
  - If > threshold: notify about context rot

- [ ] 4.7 Implement habit: scope creep detection
  - On `turn_end`: count unique file paths touched in current agent run
  - If > threshold: warn about focus

- [ ] 4.8 Snooze mechanism
  - Each habit can be snoozed for N minutes via `/habit snooze <name> <minutes>`
  - Register `/habit` command: `list`, `snooze`, `reset`, `config`

- [ ] 4.9 Configuration
  - `~/.pi/agent/habit-monitor.json` for per-habit thresholds and enable/disable
  - Default: all habits enabled with conservative thresholds

- [ ] 4.10 Test each habit trigger

### Files to Create

| File | Purpose |
|------|---------|
| `~/.pi/agent/extensions/habit-monitor/index.ts` | Extension entry point |
| `~/.pi/agent/extensions/habit-monitor/package.json` | Dependencies |
| `~/.pi/agent/extensions/habit-monitor/habits.ts` | Individual habit implementations |
| `~/.pi/agent/extensions/habit-monitor/config.ts` | Threshold config |
| `harness/habit-monitor/` | Repo copy of extension |

---

## Feature 5: Session Health Dashboard

> **Patterns:** Flying Blind, Canary in the Code Mine, Feedback Loop
> **Priority:** 🔥🔥 | **Effort:** Medium
> **What:** Aggregate page in the UI showing cross-session health metrics.

### Tasks

- [ ] 5.1 Design dashboard layout
  - Top: summary cards (total sessions, avg duration, avg events, overall error rate)
  - Middle: sessions ranked by "health score" (composite of metrics)
  - Bottom: tool usage breakdown, most common errors

- [ ] 5.2 Add aggregate queries to `lib/db.ts`
  - `getDashboardStats()`: overall counts, averages
  - `getSessionHealth()`: per-session health scores
  - `getToolUsageStats()`: tool frequency + error rates
  - `getErrorPatterns()`: most common error sequences

- [ ] 5.3 Create `pages/dashboard.ts`
  - Render dashboard HTML with summary cards, ranked session list, tool charts

- [ ] 5.4 Add `/dashboard` route to `server.ts`
  - `GET /dashboard` — HTML page
  - `GET /api/dashboard` — JSON for programmatic access

- [ ] 5.5 Health score algorithm
  - Inputs: tool error rate, turn count, context size, session duration
  - Output: 0-100 score, color-coded (green/yellow/red)
  - Display in session list and dashboard

- [ ] 5.6 Navigation
  - Add "Dashboard" link to header nav on all pages
  - Dashboard sessions link to session detail pages

- [ ] 5.7 CSS for dashboard
  - Summary cards, health score badges, tool usage bars

### Files to Create/Modify

| File | Change |
|------|--------|
| `xtdb-event-logger-ui/pages/dashboard.ts` | New: dashboard page |
| `xtdb-event-logger-ui/lib/db.ts` | Add aggregate query functions |
| `xtdb-event-logger-ui/server.ts` | Add `/dashboard` + `/api/dashboard` routes |
| `xtdb-event-logger-ui/pages/index.ts` | Add Dashboard nav link |
| `xtdb-event-logger-ui/pages/sessions.ts` | Add health score badges |
| `xtdb-event-logger-ui/static/style.css` | Dashboard styles |

---

## Feature 6: Knowledge Extraction

> **Patterns:** Extract Knowledge, Knowledge Document, Knowledge Checkpoint
> **Priority:** 🔥 | **Effort:** High
> **What:** Auto-generate session summary documents from event data on session end.

### Tasks

- [ ] 6.1 Design knowledge document format
  - Markdown template with sections: files touched, tools used, errors hit, key commands
  - Example output for a real session

- [ ] 6.2 Add `getSessionKnowledge(sessionId)` query to `lib/db.ts`
  - Files modified (from tool_call payloads where tool=Write/Edit)
  - Tool usage frequency
  - Error summary
  - Bash commands run
  - Session duration and turn count

- [ ] 6.3 Create knowledge generator
  - `harness/knowledge-extractor/generate.ts`
  - Takes session events, produces markdown summary
  - No LLM needed — pure data aggregation

- [ ] 6.4 Create `knowledge-extractor` extension
  - On `session_shutdown`: query session events, generate summary
  - Write to `~/.pi/agent/sessions/<session-name>.knowledge.md`
  - Or configurable output path

- [ ] 6.5 Add `/sessions/:id/knowledge` route to UI
  - Render the generated knowledge doc for a session
  - Download as .md file

- [ ] 6.6 Test with real sessions

### Files to Create

| File | Purpose |
|------|---------|
| `harness/knowledge-extractor/generate.ts` | Summary generation logic |
| `~/.pi/agent/extensions/knowledge-extractor/index.ts` | Extension entry |
| `~/.pi/agent/extensions/knowledge-extractor/package.json` | Package |
| `xtdb-event-logger-ui/pages/knowledge.ts` | UI page for knowledge docs |

---

## Implementation Phases

### Phase 1 — Quick Wins (Low Effort, Immediate Value) ✅
- [x] Feature 1: Context Markers in UI (tasks 1.1–1.5)
- [x] Feature 2: Focused Agent Templates (tasks 2.1–2.8)

### Phase 2 — Core Value (Medium Effort, High Impact) ✅
- [x] Feature 3: Canary Metrics extension (tasks 3.1–3.9)
- [x] Feature 5: Session Health Dashboard (tasks 5.1–5.7)

### Phase 3 — Full Loop (Medium Effort, Transformative) ✅
- [x] Feature 4: Habit Hooks extension (tasks 4.1–4.10)

### Phase 4 — Extras ✅
- [x] Feature 6: Knowledge Extraction (tasks 6.1–6.6)

---

## Dependencies

```
Feature 1 (Context Markers)  ← needs event data in XTDB (have it)
Feature 2 (Templates)        ← standalone, no dependencies
Feature 3 (Canary Metrics)   ← needs live event capture (need /reload)
Feature 4 (Habit Hooks)      ← needs Feature 3 patterns + XTDB queries
Feature 5 (Dashboard)        ← needs event data, benefits from Feature 3 metrics
Feature 6 (Knowledge)        ← needs event data, benefits from Feature 5 queries
```

---

## Pattern ↔ Feature Mapping

| Augmented Coding Pattern | Feature(s) |
|--------------------------|------------|
| Approved Logs | xtdb-event-logger (existing) |
| Hooks | xtdb-event-logger (existing), Feature 4 |
| Habit Hooks | Feature 4 |
| Feedback Loop | Features 3, 4 |
| Focused Agent | Feature 2 |
| Context Markers | Feature 1 |
| Canary in the Code Mine | Features 3, 5 |
| Flying Blind | Features 1, 3, 5 |
| Context Management | Features 1, 3, 4 |
| Context Rot (obstacle) | Features 1, 3, 4 |
| Ground Rules | Feature 2 |
| Knowledge Document | Features 2, 6 |
| Reference Docs | Feature 2 |
| Active Partner | Feature 2 |
| Check Alignment | Feature 2 (planner template) |
| Chain of Small Steps | Feature 4 (commit reminder) |
| Constrained Tests | Feature 4 (test reminder) |
| Solution Fixation (obstacle) | Feature 3 (retry storm), Feature 4 (step-back) |
| Distracted Agent (anti-pattern) | Feature 3 (tool density), Feature 4 (scope creep) |
| Selective Hearing (obstacle) | Feature 4 (reminders via hooks) |
| Keeping Up (obstacle) | Feature 5 (dashboard makes sessions reviewable) |
| Extract Knowledge | Feature 6 |

---

## References

- Pattern catalog: https://lexler.github.io/augmented-coding-patterns
- GitHub source: https://github.com/lexler/augmented-coding-patterns
- Pi extensions docs: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- Existing harness: `docs/PROGRESS.md`, `docs/SESSION_GROUPING.md`, `docs/UI.md`
