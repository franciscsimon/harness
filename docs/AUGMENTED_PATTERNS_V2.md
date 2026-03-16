# Augmented Coding Patterns V2 — Missing Patterns Implementation

> Status: **PLANNING**
> Scope: 23 implementable patterns not yet covered
> Prerequisite: V1 features (context markers, templates, canary, habits, dashboard, knowledge)

---

## Priority Tiers

### Tier 1 — High Value, Low Effort (implement first)
These are small extensions or additions that deliver immediate value.

| # | Pattern | Type | What to Build |
|---|---------|------|---------------|
| P1 | **Reminders** | Extension | Auto-inject user rules on every prompt |
| P2 | **Contextual Prompts** | Extension | Event-driven prompt injection |
| P3 | **Knowledge Checkpoint** | Extension | Periodic context snapshots |
| P4 | **Refinement Loop** | Extension + Template | Iterate output with user checking each round |
| P5 | **Sunk Cost Detection** | Extension | Detect when agent should abandon approach |

### Tier 2 — High Value, Medium Effort
These require more code but are core to the pattern catalog.

| # | Pattern | Type | What to Build |
|---|---------|------|---------------|
| P6 | **Background Agent** | Extension + Command | Spawn separate pi sessions for parallel work |
| P7 | **Yak Shave Delegation** | Extension | Auto-detect yak shaves, offer to spawn side agent |
| P8 | **Chunking** | Extension + Template | Auto-split large tasks into smaller chunks |
| P9 | **Silent Misalignment Detection** | Extension | Detect when agent stops following instructions |
| P10 | **Unvalidated Leaps Detection** | Extension | Detect large changes without verification |

### Tier 3 — Medium Value, Low Effort
These are mostly templates or small UI additions.

| # | Pattern | Type | What to Build |
|---|---------|------|---------------|
| P11 | **Approved Fixtures** | Template | Visual/fixture-based test workflow |
| P12 | **Noise Cancellation** | Extension | Filter verbose AI output |
| P13 | **Knowledge Composition** | Extension + UI | Compose multiple knowledge docs |
| P14 | **Happy to Delete** | Extension | Track AI code deletability |
| P15 | **Show the Agent, Let it Repeat** | Template | Document processes for automation |

### Tier 4 — Lower Priority / Conceptual
These are harder to automate or more conceptual.

| # | Pattern | Type | What to Build |
|---|---------|------|---------------|
| P16 | **Semantic Zoom** | UI Feature | Multi-level detail views |
| P17 | **Parallel Implementations** | Extension | Try N approaches, pick best |
| P18 | **Playgrounds** | Extension | Isolated sandbox environments |
| P19 | **Take All Paths** | Template | Explore all solutions pattern |
| P20 | **Offload Deterministic** | Extension | Route deterministic tasks to scripts |
| P21 | **Obsess Over Rules Detection** | Extension | Detect rule overload |
| P22 | **Tell Me a Lie Detection** | Extension | Detect forced constraints |
| P23 | **Perfect Recall Fallacy** | Extension | Warn about old context reliance |

---

## Tier 1 Detailed Tasks

### P1: Reminders Extension
> Source: https://lexler.github.io/augmented-coding-patterns/patterns/reminders
> "Force attention on what matters through repetition and structure"
> Reference: https://github.com/lexler/claude-code-user-reminders

**What:** Auto-inject user-defined rules into every prompt via `context` event.
Solves: Context Rot, Selective Hearing.

**Files:**
- `~/.pi/agent/extensions/reminders/index.ts`
- `~/.pi/agent/extensions/reminders/package.json`
- `harness/reminders/` (repo copy)
- `~/.pi/agent/reminders.md` (user's reminder file)

**Tasks:**
- [ ] P1.1 Create extension scaffold
- [ ] P1.2 On `context` event: read `~/.pi/agent/reminders.md` (or configurable path)
- [ ] P1.3 Inject reminders as a system-level message prepended to context
  - Use `pi.on("context", ...)` to add reminders to messages
  - Max 5 reminders to avoid context rot (per pattern guidance)
- [ ] P1.4 `/reminders` command: `list`, `add <text>`, `remove <n>`, `edit`
  - `list` — show current reminders
  - `add` — append a reminder to the file
  - `remove` — remove by number
  - `edit` — open in `ctx.ui.editor()`
- [ ] P1.5 Show reminder count in status: `ctx.ui.setStatus("reminders", "📌 3 rules")`
- [ ] P1.6 Support instruction sandwich: if reminder starts with `[every-N]`, inject only every N turns

---

### P2: Contextual Prompts Extension
> Source: https://lexler.github.io/augmented-coding-patterns/patterns/contextual-prompts
> "Inject context-aware prompts based on what agent is doing"
> Similar to Reminders but event-driven, not static.

**What:** Inject relevant prompts based on the current tool/event context.
Solves: Context Rot, Selective Hearing.

**Files:**
- `~/.pi/agent/extensions/contextual-prompts/index.ts`
- `~/.pi/agent/extensions/contextual-prompts/prompts.ts`
- `~/.pi/agent/extensions/contextual-prompts/package.json`
- `harness/contextual-prompts/` (repo copy)

**Tasks:**
- [ ] P2.1 Create extension scaffold
- [ ] P2.2 Define contextual prompt triggers:
  - `tool_call` where `toolName=bash` → inject "Check exit code before proceeding"
  - `tool_call` where `toolName=write` and path matches `*.test.*` → inject "Run tests after writing test files"
  - `tool_call` where `toolName=edit` and > 3 edits in a row → inject "Step back and verify your approach"
  - `before_provider_request` where payload > 100KB → inject "Context is large. Be concise."
  - `turn_start` where turnIndex > 5 → inject "Many turns elapsed. Are you making progress?"
- [ ] P2.3 Implement via `context` event: append contextual messages to the message list
- [ ] P2.4 Configurable via `~/.pi/agent/contextual-prompts.json`
  - Enable/disable individual prompts
  - Custom prompt text per trigger
- [ ] P2.5 `/prompts` command: `list`, `enable <name>`, `disable <name>`
- [ ] P2.6 Rate limiting: each prompt fires at most once per N turns (default 3)

---

### P3: Knowledge Checkpoint Extension
> Source: https://lexler.github.io/augmented-coding-patterns/patterns/knowledge-checkpoint
> "Periodic context snapshots saved to files"
> Solves: Non-Determinism.

**What:** Periodically save a snapshot of the session's progress to a file,
so if the session goes off track, you can restore from a known-good point.

**Files:**
- `~/.pi/agent/extensions/knowledge-checkpoint/index.ts`
- `~/.pi/agent/extensions/knowledge-checkpoint/package.json`
- `harness/knowledge-checkpoint/` (repo copy)

**Tasks:**
- [ ] P3.1 Create extension scaffold
- [ ] P3.2 On every N turns (configurable, default 5): auto-generate a checkpoint
  - Uses `pi.setLabel(entryId, "checkpoint-N")` to mark the turn
  - Writes summary to `.pi/checkpoints/<session>-<N>.md`
- [ ] P3.3 Summary includes: files modified since last checkpoint, tool usage, current task
- [ ] P3.4 `/checkpoint` command:
  - `save [label]` — manual checkpoint now
  - `list` — show all checkpoints for this session
  - `restore <n>` — navigate tree to checkpoint N via `ctx.navigateTree()`
- [ ] P3.5 Status widget showing checkpoint count: `ctx.ui.setStatus("checkpoint", "📍 3 checkpoints")`
- [ ] P3.6 On `session_shutdown`: final checkpoint with session summary

---

### P4: Refinement Loop Extension
> Source: https://lexler.github.io/augmented-coding-patterns/patterns/refinement-loop
> "Iterate over imperfect output and improve it"
> Solves: Obsess Over Rules.

**What:** Structured iterative refinement — generate, review, refine, repeat.
Agent produces output, pauses for user review, user gives feedback, agent refines.

**Files:**
- `~/.pi/agent/extensions/refinement-loop/index.ts`
- `~/.pi/agent/extensions/refinement-loop/package.json`
- `harness/refinement-loop/` (repo copy)
- `harness/templates/refiner.md` (template)

**Tasks:**
- [ ] P4.1 Create extension scaffold
- [ ] P4.2 `/refine` command to start a refinement loop:
  - `/refine start` — tell agent: "After completing this task, pause and present your output for review. Do not proceed until I approve."
  - `/refine approve` — continue to next step
  - `/refine feedback <text>` — send refinement feedback
  - `/refine done` — end refinement mode
- [ ] P4.3 Inject refinement prompt via `before_agent_start`:
  - When active: append "Present your work for review before proceeding. Ask: 'Does this match your intent?'"
- [ ] P4.4 Track iteration count, show in status
- [ ] P4.5 Create `templates/refiner.md` with Check Alignment pattern

---

### P5: Sunk Cost Detection Extension
> Source: https://lexler.github.io/augmented-coding-patterns/patterns/sunk-cost
> "Detect when agent should abandon approach"
> Anti-pattern: continuing a failing approach because of invested effort.

**What:** Detect when the agent is stuck on a failing approach and suggest starting fresh.

**Files:**
- `~/.pi/agent/extensions/sunk-cost-detector/index.ts`
- `~/.pi/agent/extensions/sunk-cost-detector/package.json`
- `harness/sunk-cost-detector/` (repo copy)

**Tasks:**
- [ ] P5.1 Create extension scaffold
- [ ] P5.2 Detection signals (tracked in memory):
  - Same file edited > N times (default 5) → "You've edited this file 6 times. Consider a different approach."
  - Same bash command pattern repeated > N times → "This command has failed 4 times. Step back."
  - Error rate > 50% over last 10 tool calls → "Most recent actions are failing. Abandon this approach?"
  - Turn count > 8 with no successful test run → "8 turns without a passing test. Reconsider the approach."
- [ ] P5.3 Notify via `ctx.ui.notify()` and offer to inject prompt
- [ ] P5.4 On detection: offer `/abandon` command that:
  - Saves current state as checkpoint
  - Injects "The current approach isn't working. Start fresh with a different strategy."
- [ ] P5.5 Configurable thresholds via `~/.pi/agent/sunk-cost.json`

---

## Tier 2 Detailed Tasks

### P6: Background Agent Extension
> Source: https://lexler.github.io/augmented-coding-patterns/patterns/background-agent
> "Spawn separate agents for parallel work"

**What:** `/spawn` command to create a new pi session in the background for a subtask.

**Files:**
- `~/.pi/agent/extensions/agent-spawner/index.ts`
- `~/.pi/agent/extensions/agent-spawner/package.json`
- `harness/agent-spawner/` (repo copy)

**Tasks:**
- [ ] P6.1 Create extension scaffold
- [ ] P6.2 `/spawn <task description>` command:
  - Creates a new session via `ctx.newSession()`
  - Injects the task description as the initial prompt
  - Sets session name to "bg: <task>"
  - Records spawned session file in parent state
- [ ] P6.3 `/agents` command:
  - `list` — show spawned background agents and their status
  - `check <n>` — show the latest output from agent N
  - `kill <n>` — terminate agent N
- [ ] P6.4 Status widget: `ctx.ui.setWidget("agents", ["🔀 2 background agents"])`
- [ ] P6.5 On parent `session_shutdown`: notify about running background agents

---

### P7: Yak Shave Delegation Extension
> Source: https://lexler.github.io/augmented-coding-patterns/patterns/yak-shave-delegation
> "Auto-detect yak shaves, offer to spawn side agent"

**What:** When the agent hits environment/tooling errors, offer to spawn a background
agent to fix the issue while the main agent continues.

**Files:**
- `~/.pi/agent/extensions/yak-shave/index.ts`
- `~/.pi/agent/extensions/yak-shave/package.json`
- `harness/yak-shave/` (repo copy)

**Tasks:**
- [ ] P7.1 Create extension scaffold
- [ ] P7.2 Detection on `tool_execution_end` where `is_error=true`:
  - Parse error for environment signals: "command not found", "No such file",
    "permission denied", "ENOENT", "MODULE_NOT_FOUND", dependency errors
  - If detected: `ctx.ui.confirm("Yak shave detected", "Spawn a background agent to fix this?")`
- [ ] P7.3 If confirmed: spawn background agent (uses P6's infrastructure) with:
  - Error message as context
  - Focused task: "Fix this environment issue. Do not modify application code."
- [ ] P7.4 Track yak shave sessions, notify when resolved

---

### P8: Chunking Extension
> Source: https://lexler.github.io/augmented-coding-patterns/patterns/chunking
> "Auto-split large tasks into smaller chunks"
> Solves: Limited Focus, Limited Context Window, Degrades Under Complexity.

**What:** Help break complex tasks into manageable steps with tracked progress.

**Files:**
- `~/.pi/agent/extensions/chunker/index.ts`
- `~/.pi/agent/extensions/chunker/package.json`
- `harness/chunker/` (repo copy)

**Tasks:**
- [ ] P8.1 Create extension scaffold
- [ ] P8.2 `/chunk` command:
  - `/chunk <task>` — ask agent to break task into numbered steps, parse the response
  - `/chunk list` — show current steps with ✅/⬜ status
  - `/chunk next` — advance to next uncompleted step
  - `/chunk done <n>` — mark step N as complete
  - `/chunk reset` — clear all steps
- [ ] P8.3 Persist steps via `pi.appendEntry("chunker-steps", steps)`
- [ ] P8.4 On `turn_end` when chunking active: inject "Focus only on step N: <description>"
- [ ] P8.5 Status widget showing progress: `[■■■□□] 3/5 steps`

---

### P9: Silent Misalignment Detection
> Source: https://lexler.github.io/augmented-coding-patterns/anti-patterns/silent-misalignment
> "Detect when agent stops following instructions"

**What:** Monitor for signs the agent is drifting from the user's intent.

**Files:**
- `~/.pi/agent/extensions/alignment-monitor/index.ts`
- `~/.pi/agent/extensions/alignment-monitor/package.json`
- `harness/alignment-monitor/` (repo copy)

**Tasks:**
- [ ] P9.1 Create extension scaffold
- [ ] P9.2 Track user's original task from first prompt
- [ ] P9.3 Detection signals:
  - Tool calls on files not mentioned in original prompt
  - New dependencies added without being requested
  - Agent working in directories unrelated to the task
  - Large refactors when only small changes were requested
- [ ] P9.4 On detection: `ctx.ui.notify("⚠️ The agent may be drifting from your original request", "warn")`
- [ ] P9.5 `/check-alignment` command: summarize what agent has done vs what was asked

---

### P10: Unvalidated Leaps Detection
> Source: https://lexler.github.io/augmented-coding-patterns/anti-patterns/unvalidated-leaps
> "Detect large changes without verification"

**What:** Detect when the agent makes large changes without running tests or verification.

**Files:**
- `~/.pi/agent/extensions/leap-detector/index.ts`
- `~/.pi/agent/extensions/leap-detector/package.json`
- `harness/leap-detector/` (repo copy)

**Tasks:**
- [ ] P10.1 Create extension scaffold
- [ ] P10.2 Track on `tool_call`:
  - Count consecutive write/edit calls without a bash call containing test/lint/build
  - If > N edits (default 5) without verification: warn
  - If > N files modified (default 3) without test: warn
- [ ] P10.3 Inject via `before_agent_start`: "IMPORTANT: Run tests after every significant change."
- [ ] P10.4 Configurable thresholds

---

## Tier 3 Detailed Tasks

### P11: Approved Fixtures Template
- [ ] Create `templates/fixture-tester.md`
  - Role: verify visual output against known-good fixtures
  - Ground Rules: generate screenshots/output, compare against baseline

### P12: Noise Cancellation Extension
- [ ] Create extension that uses `context` event to summarize/trim verbose tool results
- [ ] Configure max output length per tool type
- [ ] `/noise` command to toggle levels: `verbose`, `normal`, `quiet`

### P13: Knowledge Composition
- [ ] Add `/knowledge compose` command to knowledge-extractor
- [ ] Merges multiple session knowledge docs into one project-level doc
- [ ] Writes to `~/.pi/agent/knowledge/<project>.md`

### P14: Happy to Delete Extension
- [ ] Track all files written by the agent in a session
- [ ] On `session_shutdown`: write list of AI-generated files
- [ ] `/ai-files` command: list files the agent created (safe to delete/regenerate)

### P15: Show the Agent, Let it Repeat Template
- [ ] Create `templates/documenter.md`
  - Role: document what was done as a repeatable process
  - Output: `process-<name>.md` with steps for future agents

---

## Tier 4 Tasks (Deferred)

### P16–P23
These patterns are either:
- **Semantic Zoom** (P16): Would need deep UI work (multi-level event detail views)
- **Parallel Implementations** (P17): Would need pi's fork capability + comparison tool
- **Playgrounds** (P18): Would need sandboxed execution environments
- **Take All Paths** (P19): Template only — "explore multiple solutions before committing"
- **Offload Deterministic** (P20): Would need tool routing based on task type
- **Obsess Over Rules** (P21): Detect system prompt > N tokens
- **Tell Me a Lie** (P22): Hard to detect forced constraints automatically
- **Perfect Recall Fallacy** (P23): Detect references to old/stale context

These can be added incrementally after Tiers 1–3 are done.

---

## Implementation Order

```
Phase 1 (Tier 1 — 5 extensions):
  P1: Reminders           ← highest value, simplest
  P2: Contextual Prompts  ← builds on P1 pattern
  P3: Knowledge Checkpoint ← uses pi.setLabel + navigateTree
  P4: Refinement Loop     ← command + prompt injection
  P5: Sunk Cost Detection ← builds on canary-monitor patterns

Phase 2 (Tier 2 — 5 extensions):
  P6: Background Agent    ← uses ctx.newSession()
  P7: Yak Shave Delegation ← builds on P6
  P8: Chunking            ← command + state management
  P9: Silent Misalignment ← analysis of tool call patterns
  P10: Unvalidated Leaps  ← simple counter-based detection

Phase 3 (Tier 3 — 5 items, mostly templates):
  P11: Approved Fixtures template
  P12: Noise Cancellation extension
  P13: Knowledge Composition (extends existing)
  P14: Happy to Delete extension
  P15: Show the Agent template
```

---

## Files to Create Summary

| Extension / File | Location |
|------------------|----------|
| `reminders/` | `~/.pi/agent/extensions/reminders/` + `harness/reminders/` |
| `contextual-prompts/` | `~/.pi/agent/extensions/contextual-prompts/` + `harness/contextual-prompts/` |
| `knowledge-checkpoint/` | `~/.pi/agent/extensions/knowledge-checkpoint/` + `harness/knowledge-checkpoint/` |
| `refinement-loop/` | `~/.pi/agent/extensions/refinement-loop/` + `harness/refinement-loop/` |
| `sunk-cost-detector/` | `~/.pi/agent/extensions/sunk-cost-detector/` + `harness/sunk-cost-detector/` |
| `agent-spawner/` | `~/.pi/agent/extensions/agent-spawner/` + `harness/agent-spawner/` |
| `yak-shave/` | `~/.pi/agent/extensions/yak-shave/` + `harness/yak-shave/` |
| `chunker/` | `~/.pi/agent/extensions/chunker/` + `harness/chunker/` |
| `alignment-monitor/` | `~/.pi/agent/extensions/alignment-monitor/` + `harness/alignment-monitor/` |
| `leap-detector/` | `~/.pi/agent/extensions/leap-detector/` + `harness/leap-detector/` |
| `noise-cancellation/` | `~/.pi/agent/extensions/noise-cancellation/` + `harness/noise-cancellation/` |
| `happy-to-delete/` | `~/.pi/agent/extensions/happy-to-delete/` + `harness/happy-to-delete/` |
| `templates/fixture-tester.md` | `harness/templates/` |
| `templates/documenter.md` | `harness/templates/` |
| `templates/refiner.md` | `harness/templates/` |
| `~/.pi/agent/reminders.md` | User's reminder file (created with defaults) |
