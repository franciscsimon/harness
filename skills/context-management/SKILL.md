---
name: context-management
description: Manage AI context health — prevent context rot, extract knowledge before compaction, compose reference docs. Use when sessions get long or context feels degraded.
---

# Context Management

## When to Use

- Session has been running for 15+ turns
- Agent starts forgetting earlier instructions
- Payload size exceeds 80KB (check with `/noise status`)
- Before compacting a session

## Workflow

1. **Check context health**
   - How many turns have elapsed?
   - Is the agent following ground rules from the start of the session?
   - Use `/antipatterns` to check for Perfect Recall Fallacy

2. **Extract knowledge before it's lost**
   - `/checkpoint save pre-compact` — save a knowledge checkpoint
   - Summarize key decisions made so far
   - Note any discoveries or gotchas

3. **Reduce noise**
   - `/noise quiet` — trim verbose tool output
   - `/zoom out` — get concise responses

4. **Compose only what's needed**
   - `/ref list` — see available reference docs
   - `/ref load <relevant-doc>` — load only what's needed now
   - `/compose add <knowledge-file>` — add relevant knowledge

5. **Compact if needed**
   - `/compact` — with knowledge already extracted

6. **Re-inject critical context**
   - `/reminders list` — verify reminders are still active
   - `/role <name>` — re-activate role if needed
   - Re-state the current task explicitly
