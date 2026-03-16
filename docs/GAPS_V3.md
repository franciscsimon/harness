# Pi Extension Gaps — Implementation Plan

## Status: 10 gaps identified, prioritized by impact

---

### Gap 1: Subagent Tool (HIGH — replaces broken agent-spawner)
**Problem:** `agent-spawner` uses `ctx.newSession()` which just switches sessions. Real subagents need separate pi processes with isolated context.
**Solution:** Replace `agent-spawner` with proper subagent extension based on pi's subagent example. Spawns `pi` child processes, captures JSON output, supports single/parallel/chain modes.
**Files:**
- Rewrite `~/.pi/agent/extensions/agent-spawner/index.ts`
- Add `~/.pi/agent/extensions/agent-spawner/agents.ts` (discovery from `~/.pi/agent/agents/`)
**Key APIs:** `registerTool`, `spawn("pi", ...)`, `renderCall`, `renderResult`
**Replaces:** Old agent-spawner + orchestrator + parallel-impl (consolidate 3→1)

### Gap 2: Custom Tools in Extensions (HIGH — LLM can't call most features)
**Problem:** 30 of 32 extensions have zero `registerTool()`. The LLM can only use features via commands (user-initiated), not autonomously.
**Solution:** Add `registerTool()` to extensions where the LLM should be able to call the feature itself.
**Extensions that need tools:**
| Extension | Tool Name | Purpose |
|-----------|-----------|---------|
| chunker | `plan_chunks` | Break a task into ordered steps |
| alignment-monitor | `check_alignment` | Verify current work matches stated goal |
| knowledge-checkpoint | `save_checkpoint` | Save key decisions/context to file |
| semantic-zoom | `zoom_code` | Show code at different abstraction levels |
| jit-docs | `lookup_docs` | Find relevant docs for a topic |
| reference-docs | `load_reference` | Load a reference doc into context |
| slop-detector | `check_antipatterns` | Scan text for AI slop patterns |

### Gap 3: Keyboard Shortcuts (MEDIUM)
**Problem:** Zero `registerShortcut()` calls. No quick-access keys.
**Solution:** Add shortcuts to high-frequency extensions.
| Shortcut | Action | Extension |
|----------|--------|-----------|
| `Ctrl+Alt+Q` | Toggle quality hooks | quality-hooks |
| `Ctrl+Alt+G` | Git checkpoint now | git-checkpoint |
| `Ctrl+Alt+K` | Knowledge checkpoint | knowledge-checkpoint |
**Key API:** `pi.registerShortcut(key, callback)`

### Gap 4: Mode Flags (MEDIUM)
**Problem:** Zero `registerFlag()` calls. No CLI flags for modes.
**Solution:** Add flags for key modes.
| Flag | Default | Extension |
|------|---------|-----------|
| `--safe` | false | permission-gate (auto-block without confirm) |
| `--quality` | true | quality-hooks (enable/disable) |
| `--checkpoints` | true | git-checkpoint (enable/disable) |
**Key API:** `pi.registerFlag(name, { description, type, default })`

### Gap 5: setActiveTools for Focused Agents (MEDIUM)
**Problem:** Read-only agents (reviewer, planner, architect) have `tools:` in frontmatter but nothing enforces it at runtime.
**Solution:** In `role-loader`, when loading an agent with restricted tools, call `pi.setActiveTools()` to enforce it.
**File:** `~/.pi/agent/extensions/role-loader/index.ts`
**Key API:** `pi.setActiveTools(["read", "bash", "grep", "find", "ls"])`

### Gap 6: Custom TUI — ctx.ui.select (LOW)
**Problem:** Zero `ctx.ui.select()` calls. No selection dialogs.
**Solution:** Use `select()` where it makes sense:
- `role-loader`: `/agent` with no args → show agent picker
- `reference-docs`: `/ref` with no args → show doc picker
- `semantic-zoom`: `/zoom` with no args → show zoom level picker
**Key API:** `ctx.ui.select("Pick:", options)`

### Gap 7: Custom Rendering — renderCall/renderResult (LOW)
**Problem:** Zero custom rendering. Tool outputs look generic.
**Solution:** Add rendering to the subagent tool (Gap 1 already covers this — show agent name, task, progress, output).
**Key API:** `renderCall(args, theme)`, `renderResult(result, options, theme)`

### Gap 8: Custom Compaction — session_before_compact (MEDIUM)
**Problem:** No custom compaction. When context compacts, we lose structured knowledge.
**Solution:** New `custom-compaction` extension that extracts key decisions and file changes before compaction, preserves them in the summary.
**File:** `~/.pi/agent/extensions/custom-compaction/index.ts`
**Key API:** `pi.on("session_before_compact", async (event, ctx) => { return { summary } })`

### Gap 9: Handoff Extension (LOW)
**Problem:** No intelligent session transfer. When context is full, user must manually restart.
**Solution:** `/handoff` command that extracts what matters, generates a prompt for a new session, puts it in the editor.
**File:** `~/.pi/agent/extensions/handoff/index.ts`
**Key API:** `pi.registerCommand`, `ctx.ui.editor`, `complete()` from pi-ai

### Gap 10: spawnHook (LOW)
**Problem:** No bash command modification before execution.
**Solution:** Not needed as standalone extension. The permission-gate already intercepts bash. Could add env injection (e.g., `CI=1`) if needed later. **SKIP for now.**

---

## Implementation Order
1. **Gap 2** — Add tools to 7 extensions (highest leverage, quick wins)
2. **Gap 1** — Subagent tool (biggest architectural fix, replaces 3 extensions)
3. **Gap 5** — setActiveTools in role-loader (small change, high value)
4. **Gap 3** — Keyboard shortcuts (small additions)
5. **Gap 4** — Mode flags (small additions)
6. **Gap 8** — Custom compaction (new extension)
7. **Gap 6** — ctx.ui.select dialogs (polish)
8. **Gap 9** — Handoff extension (new extension)
9. **Gap 7** — Custom rendering (covered by Gap 1)
10. ~~Gap 10~~ — SKIP

## Estimated: ~9 files modified, ~3 files created, ~400 lines added
