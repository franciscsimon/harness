# Temporal Integration Architecture for Harness — Revised

> **Revision note:** This replaces the initial proposal after a deep analysis of the pi.dev
> extension API, session lifecycle, and runtime constraints. The first draft incorrectly treated
> extensions as replaceable services. They're not — they're in-process hooks that must stay
> inside the pi runtime. This version respects that boundary.

---

## What the First Proposal Got Wrong

The first draft proposed replacing `orchestrator/index.ts`, `agent-spawner/index.ts`, and
`workflow-engine/index.ts` with Temporal workflows and activities. That can't work because:

1. **Extensions run inside the pi process.** They hook into `before_agent_start` to inject
   system prompts, modify the `context` message array, block `tool_call` events, and render
   custom UI via `ctx.ui`. These are in-process hooks — Temporal can't do that.

2. **`appendEntry` is pi's native state persistence.** Extensions restore state on
   `session_start` by scanning session entries. Temporal workflow state lives in Temporal
   Server, but the extension still needs `appendEntry` for pi-level session restoration.

3. **System prompt injection is the core coordination mechanism.** When a workflow step
   activates, the extension loads the agent role markdown from `~/.pi/agent/agents/explorer.md`
   and injects it into `event.systemPrompt`. This must happen synchronously in the
   `before_agent_start` hook — it can't be delegated to an external process.

4. **The `delegate` tool runs inside the pi tool execution context.** It receives
   `(toolCallId, params, signal, onUpdate, ctx)` and must return a tool result. The tool
   itself can't be a Temporal activity — but what it *calls* can be.

**The correct model: extensions become thin Temporal clients. The orchestration logic moves
to Temporal. The pi-specific hooks stay exactly where they are.**

---

## The Problem Today (unchanged from v1)

| Component | State Storage | Retry | Recovery | Timeout |
|-----------|--------------|-------|----------|---------|
| `orchestrator/` | `appendEntry` (session) | None | Manual `/orchestrate fail` + re-add | None |
| `agent-spawner/` | `appendEntry` (session) | None | Manual check on `session_start` | 5min hard kill |
| `workflow-engine/` | `appendEntry` (session) | None | `/workflow abandon` + restart | None |
| `ci-runner/` | File-based queue (`.json` → `.running`) | None | Cleanup on crash | 5min Docker timeout |

---

## Architecture: Extensions as Temporal Clients

The key insight is the **split-brain model**: pi extensions handle the *pi-specific* concerns
(system prompt injection, tool registration, UI, session state) while Temporal handles the
*orchestration* concerns (durable state, retries, timeouts, fan-out, human-in-the-loop).

```
┌─────────────────────────────────────────────────────────────────┐
│  pi.dev Process (unchanged runtime)                              │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Extensions (40, running in-process)                       │   │
│  │                                                            │   │
│  │  orchestrator/index.ts ──┐                                 │   │
│  │  workflow-engine/index.ts ├── Thin Temporal clients         │   │
│  │  agent-spawner/index.ts ──┘   (start, signal, query)       │   │
│  │          │                                                  │   │
│  │          │ Still do:                                        │   │
│  │          │  • before_agent_start → inject systemPrompt      │   │
│  │          │  • session_start → restore from appendEntry      │   │
│  │          │  • registerCommand → /orchestrate, /workflow      │   │
│  │          │  • registerTool → delegate                       │   │
│  │          │  • ctx.ui → status, widgets, notifications       │   │
│  │                                                            │   │
│  │  xtdb-event-logger (30 handlers) ── unchanged              │   │
│  │  xtdb-projector ── unchanged                               │   │
│  │  slop-detector, habit-monitor, etc. ── unchanged           │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                              │                                    │
│                    @temporalio/client                             │
│                    (npm dependency)                               │
│                              │                                    │
└──────────────────────────────┼────────────────────────────────────┘
                               │ gRPC (localhost:7233)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Temporal Server (new, self-hosted in Docker)                    │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Orchestration │  │ Agent Step   │  │ CI Pipeline  │          │
│  │ Workflows     │  │ Workflows    │  │ Workflows    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
│  ┌──────▼──────────────────▼──────────────────▼───────┐         │
│  │  Task Queues                                        │         │
│  │  • agent-execution (pi --mode json spawns)          │         │
│  │  • ci-pipeline (Docker step execution)              │         │
│  │  • xtdb-persistence (XTDB writes)                   │         │
│  └────────────────────────────────────────────────────┘         │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  Temporal Worker Process (new, runs alongside pi)                │
│                                                                   │
│  Activities:                                                      │
│  • spawnPiAgent()  — spawns pi --mode json, heartbeats stdout    │
│  • recordToXtdb()  — writes to XTDB with retry                  │
│  • executeDocker() — runs Docker steps for CI                    │
│  • loadWorkflow()  — parses JSON-LD workflow definitions         │
│                                                                   │
│  The worker is a separate Node.js process.                        │
│  It does NOT run inside pi.                                       │
│  It has its own package.json, its own lifecycle.                  │
└──────────────────────────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  Existing Infrastructure (unchanged)                              │
│  XTDB Primary/Replica │ Redpanda │ Garage │ Keycloak │ Caddy    │
└─────────────────────────────────────────────────────────────────┘
```

---

## How Each Extension Changes

### 1. `orchestrator/index.ts` → Temporal Client + Unchanged Hooks

**What stays in the extension (pi-specific):**
```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Client, Connection } from "@temporalio/client";

let temporalClient: Client | null = null;
let activeWorkflowId: string | null = null;

export default function (pi: ExtensionAPI) {

  // ── Connect to Temporal on session start ──
  pi.on("session_start", async (_event, ctx) => {
    try {
      const connection = await Connection.connect({ address: "localhost:7233" });
      temporalClient = new Client({ connection });
    } catch (e) {
      // Temporal not available — fall back to current behavior
      ctx.ui.notify("Temporal unavailable, orchestration in local mode", "warning");
    }

    // Restore active workflow ID from session state (pi-native)
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "orchestrator-temporal") {
        activeWorkflowId = (entry as any).workflowId;
      }
    }
  });

  pi.on("session_shutdown", async () => {
    // Don't close the Temporal client — workflow keeps running
    // The whole point is that orchestration outlives the pi session
    temporalClient = null;
  });

  // ── System prompt injection stays exactly the same ──
  pi.on("before_agent_start", async (event, ctx) => {
    if (!activeWorkflowId || !temporalClient) return;

    // Query Temporal for current workflow state (replaces in-memory array)
    const handle = temporalClient.workflow.getHandle(activeWorkflowId);
    const status = await handle.query("status");

    // Build the same task list injection the current extension does
    const taskList = status.tasks.map(t =>
      `${t.status === 'done' ? '✅' : t.status === 'active' ? '🔄' : '⬜'} ${t.description}`
    ).join('\n');

    return {
      systemPrompt: event.systemPrompt + `\n\n## Active Orchestration\n${taskList}`,
    };
  });

  // ── Commands become thin Temporal wrappers ──
  pi.registerCommand("orchestrate", {
    description: "Manage orchestrated tasks via Temporal",
    handler: async (args, ctx) => {
      if (!temporalClient) {
        ctx.ui.notify("Temporal not connected", "error");
        return;
      }

      const [action, ...rest] = args.split(" ");

      switch (action) {
        case "plan": {
          const tasks = rest.join(" ").split("|").map(t => t.trim());
          const workflowId = `orch-${Date.now()}`;

          // Start a Temporal workflow — this is now DURABLE
          await temporalClient.workflow.start("orchestrationWorkflow", {
            workflowId,
            taskQueue: "agent-execution",
            args: [{
              tasks,
              cwd: ctx.cwd,
              sessionId: ctx.sessionManager.getSessionFile(),
            }],
          });

          activeWorkflowId = workflowId;
          pi.appendEntry("orchestrator-temporal", { workflowId });
          ctx.ui.notify(`Orchestration started: ${workflowId}`, "success");
          break;
        }

        case "status": {
          if (!activeWorkflowId) {
            ctx.ui.notify("No active orchestration", "warning");
            return;
          }
          const handle = temporalClient.workflow.getHandle(activeWorkflowId);
          const status = await handle.query("status");
          // Display in pi UI widget
          ctx.ui.setWidget("orchestrator", [
            `Workflow: ${status.workflowName}`,
            `Progress: ${status.completedSteps}/${status.totalSteps}`,
            ...status.tasks.map(t => `  ${t.status} — ${t.description}`),
          ]);
          break;
        }

        case "done": {
          const taskId = parseInt(rest[0]);
          const handle = temporalClient.workflow.getHandle(activeWorkflowId!);
          await handle.signal("taskDone", taskId);
          break;
        }

        case "fail": {
          const taskId = parseInt(rest[0]);
          const handle = temporalClient.workflow.getHandle(activeWorkflowId!);
          await handle.signal("taskFailed", taskId);
          // Temporal handles retry automatically based on policy
          break;
        }

        case "stop": {
          const handle = temporalClient.workflow.getHandle(activeWorkflowId!);
          await handle.signal("abandon");
          activeWorkflowId = null;
          break;
        }
      }
    },
  });
}
```

**What this changes vs current:**
- Task state lives in Temporal (durable, survives pi crashes)
- `/orchestrate plan` starts a Temporal workflow instead of populating an array
- `/orchestrate status` queries Temporal instead of reading in-memory state
- `/orchestrate fail` signals Temporal, which handles retry automatically
- `before_agent_start` queries Temporal for the task list to inject
- `appendEntry` only stores the `workflowId` reference, not the full task state

**What this preserves:**
- Same `/orchestrate` command interface
- Same system prompt injection pattern
- Same UI widget rendering
- Same `session_start` / `session_shutdown` lifecycle
- Graceful fallback if Temporal is down (local mode)

---

### 2. `agent-spawner/index.ts` → Temporal-Backed Delegation

**The `delegate` tool stays as a pi-registered tool.** The LLM calls it the same way.
What changes is what happens *inside* the tool execution.

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Client, Connection } from "@temporalio/client";

let temporalClient: Client | null = null;

export default function (pi: ExtensionAPI) {

  pi.on("session_start", async () => {
    try {
      const connection = await Connection.connect({ address: "localhost:7233" });
      temporalClient = new Client({ connection });
    } catch {
      temporalClient = null; // fall back to direct spawn
    }
  });

  pi.registerTool({
    name: "delegate",
    description: "Delegate a task to a specialized agent",
    parameters: Type.Object({
      agent: Type.String({ description: "Agent role name" }),
      task: Type.String({ description: "Task description" }),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { agent, task } = params;
      const cwd = ctx.cwd;
      const parentSession = ctx.sessionManager.getSessionFile();

      if (temporalClient) {
        // ── TEMPORAL PATH: durable execution with retry ──
        const workflowId = `delegate-${agent}-${Date.now()}`;

        const handle = await temporalClient.workflow.start("agentDelegation", {
          workflowId,
          taskQueue: "agent-execution",
          args: [{
            agentRole: agent,
            task,
            cwd,
            parentSessionId: parentSession,
          }],
        });

        // Poll for completion with progress updates back to pi
        // (The tool must return synchronously from pi's perspective)
        let result;
        try {
          result = await handle.result();
        } catch (e) {
          // Workflow failed after all retries
          return {
            content: [{ type: "text", text: `❌ Agent "${agent}" failed after retries: ${e.message}` }],
            details: { agent, status: "failed", workflowId },
          };
        }

        return {
          content: [{ type: "text", text: `✅ Agent "${agent}" completed:\n${result.output}` }],
          details: { agent, status: "completed", workflowId, exitCode: result.exitCode },
        };

      } else {
        // ── FALLBACK: current direct spawn (no Temporal) ──
        const result = await runSubagent(agent, task, cwd, 300_000);
        return {
          content: [{ type: "text", text: result.output }],
          details: { agent, exitCode: result.exitCode },
        };
      }
    },
  });
}
```

**On the Temporal Worker side** (separate process, NOT in pi):

```typescript
// temporal-worker/activities/spawn-agent.ts
import { Context } from "@temporalio/activity";
import { spawn } from "child_process";

export async function spawnPiAgent(input: {
  agentRole: string;
  task: string;
  cwd: string;
  parentSessionId: string;
}): Promise<{ output: string; exitCode: number; sessionId: string }> {
  const { agentRole, task, cwd } = input;

  return new Promise((resolve, reject) => {
    // Spawn pi in JSON mode — same as current agent-spawner
    const proc = spawn("pi", [
      "--mode", "json",
      "-p", task,
      "--system-prompt", loadAgentRole(agentRole),
    ], { cwd });

    let stdout = "";
    let sessionId = "";

    proc.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;

      // Parse JSON-LD events for session ID
      for (const line of text.split("\n")) {
        try {
          const event = JSON.parse(line);
          if (event.type === "session" && event.id) sessionId = event.id;
        } catch {}
      }

      // HEARTBEAT: Temporal knows this activity is alive
      // If heartbeat stops for 60s, Temporal cancels and retries
      Context.current().heartbeat({
        bytesReceived: stdout.length,
        agentRole,
        lastLine: text.slice(-200),
      });
    });

    proc.on("close", (code) => {
      // Cap output same as current harness (10KB)
      const output = stdout.slice(-10_000);
      resolve({ output, exitCode: code ?? 1, sessionId });
    });

    proc.on("error", (err) => reject(err));

    // Handle Temporal cancellation (e.g., workflow abandoned)
    Context.current().cancelled.catch(() => {
      proc.kill("SIGTERM");
    });
  });
}
```

**Temporal Workflow for delegation:**

```typescript
// temporal-worker/workflows/agent-delegation.ts
import { proxyActivities, ApplicationFailure } from "@temporalio/workflow";
import type * as activities from "../activities/spawn-agent";

const { spawnPiAgent } = proxyActivities<typeof activities>({
  startToCloseTimeout: "15 minutes",
  heartbeatTimeout: "90 seconds",     // Agent must heartbeat every 90s
  retry: {
    initialInterval: "10s",
    backoffCoefficient: 2,
    maximumInterval: "3m",
    maximumAttempts: 3,
    nonRetryableErrorTypes: ["AgentRoleNotFound"],
  },
});

const { recordToXtdb } = proxyActivities<typeof xtdbActivities>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 5 },
});

export async function agentDelegation(input: {
  agentRole: string;
  task: string;
  cwd: string;
  parentSessionId: string;
}) {
  // Activity runs with full retry policy
  const result = await spawnPiAgent(input);

  // Record to XTDB (also retryable)
  await recordToXtdb({
    table: "delegations",
    data: {
      parent_session_id: input.parentSessionId,
      child_session_id: result.sessionId,
      agent_name: input.agentRole,
      task: input.task,
      status: result.exitCode === 0 ? "completed" : "failed",
      exit_code: result.exitCode,
    },
  });

  if (result.exitCode !== 0) {
    throw ApplicationFailure.create({
      type: "AgentFailed",
      message: `Agent ${input.agentRole} exited with code ${result.exitCode}`,
      details: [result.output],
      nonRetryable: false, // let retry policy handle it
    });
  }

  return result;
}
```

**What retry actually means for agents:**

| Attempt | What happens | Wait before next |
|---------|-------------|-----------------|
| 1 | pi --mode json spawns, agent works, crashes at minute 3 | 10 seconds |
| 2 | Fresh pi --mode json spawn, new session, agent starts from scratch | 20 seconds |
| 3 | Fresh pi --mode json spawn, last chance | — |
| All fail | Workflow reports failure to parent; parent can escalate or route to human | — |

Each retry is a **fresh agent session** — pi doesn't resume mid-session. This is correct
because pi sessions are self-contained. The retry gives the agent another chance to complete
the same task, potentially with a different model or different context window state.

---

### 3. `workflow-engine/index.ts` → Temporal Workflow + pi Prompt Injection

This is the most nuanced integration because the workflow engine does two things:
1. **Orchestration** (step sequencing, advancement, state tracking) → moves to Temporal
2. **Prompt injection** (loading agent role markdown, injecting into systemPrompt) → stays in pi

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Client, Connection } from "@temporalio/client";

let temporalClient: Client | null = null;
let activeWorkflowId: string | null = null;
let currentStepInfo: StepInfo | null = null; // cached from Temporal query

export default function (pi: ExtensionAPI) {

  pi.on("session_start", async (_event, ctx) => {
    try {
      const connection = await Connection.connect({ address: "localhost:7233" });
      temporalClient = new Client({ connection });
    } catch { temporalClient = null; }

    // Restore workflow reference
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "workflow-temporal") {
        activeWorkflowId = (entry as any).workflowId;
        // Immediately query Temporal for current step
        if (temporalClient && activeWorkflowId) {
          const handle = temporalClient.workflow.getHandle(activeWorkflowId);
          currentStepInfo = await handle.query("currentStep");
        }
      }
    }
  });

  // ── THIS IS THE CRITICAL PI-SPECIFIC PART ──
  // System prompt injection MUST happen in-process
  pi.on("before_agent_start", async (event, ctx) => {
    if (!currentStepInfo || !activeWorkflowId) return;

    // Load agent role markdown — same as current workflow-engine
    const rolePath = path.join(AGENTS_DIR, `${currentStepInfo.agentRole}.md`);
    let rolePrompt = "";
    try {
      const raw = await fs.readFile(rolePath, "utf-8");
      rolePrompt = stripYamlFrontmatter(raw);
    } catch {}

    const progress = currentStepInfo.stepsCompleted;
    const total = currentStepInfo.totalSteps;
    const bar = "■".repeat(progress) + "□".repeat(total - progress);

    return {
      systemPrompt: event.systemPrompt + `

## Active Workflow: ${currentStepInfo.workflowName}
Progress: [${bar}] ${progress}/${total}
Current Step: ${currentStepInfo.position}. ${currentStepInfo.name} (${currentStepInfo.actionType})
Agent Role: ${currentStepInfo.agentRole}
Task: ${currentStepInfo.task}

${rolePrompt}`,

      message: {
        customType: "workflow-engine",
        content: `Workflow step ${currentStepInfo.position}/${total}: ${currentStepInfo.name}`,
        display: true,
        details: currentStepInfo,
      },
    };
  });

  // ── On agent_end, signal Temporal that step completed ──
  pi.on("agent_end", async (event, ctx) => {
    if (!temporalClient || !activeWorkflowId || !currentStepInfo) return;

    const handle = temporalClient.workflow.getHandle(activeWorkflowId);

    // Signal step completion with the agent's output
    const lastMessage = event.messages?.findLast(m => m.role === "assistant");
    await handle.signal("stepCompleted", {
      stepPosition: currentStepInfo.position,
      output: lastMessage?.content?.slice(0, 5000) || "",
    });

    // Refresh current step info for next agent turn
    currentStepInfo = await handle.query("currentStep");

    if (!currentStepInfo) {
      // Workflow is complete
      activeWorkflowId = null;
      ctx.ui.setStatus("workflow", undefined);
      ctx.ui.notify("Workflow completed!", "success");
    }
  });

  // ── Commands ──
  pi.registerCommand("workflow", {
    description: "Manage agent workflows via Temporal",
    handler: async (args, ctx) => {
      const [action, ...rest] = args.split(" ");

      switch (action) {
        case "start": {
          const [name, ...taskParts] = rest;
          const task = taskParts.join(" ");

          // Load JSON-LD workflow definition (stays in pi — it's a file read)
          const workflowDef = await loadWorkflowFile(
            path.join(WORKFLOWS_DIR, `${name}.jsonld`)
          );

          const workflowId = `wf-${name}-${Date.now()}`;

          await temporalClient!.workflow.start("agentWorkflow", {
            workflowId,
            taskQueue: "agent-execution",
            args: [{
              workflowName: name,
              task,
              steps: workflowDef.steps, // JSON-LD parsed steps
              cwd: ctx.cwd,
              sessionId: ctx.sessionManager.getSessionFile(),
            }],
          });

          activeWorkflowId = workflowId;
          pi.appendEntry("workflow-temporal", { workflowId });

          // Cache first step info
          const handle = temporalClient!.workflow.getHandle(workflowId);
          currentStepInfo = await handle.query("currentStep");

          ctx.ui.notify(`Workflow "${name}" started`, "success");
          break;
        }

        case "advance": {
          const handle = temporalClient!.workflow.getHandle(activeWorkflowId!);
          await handle.signal("advance");
          currentStepInfo = await handle.query("currentStep");
          break;
        }

        case "skip": {
          const handle = temporalClient!.workflow.getHandle(activeWorkflowId!);
          await handle.signal("skip", currentStepInfo!.position);
          currentStepInfo = await handle.query("currentStep");
          break;
        }

        case "abandon": {
          const handle = temporalClient!.workflow.getHandle(activeWorkflowId!);
          await handle.signal("abandon");
          activeWorkflowId = null;
          currentStepInfo = null;
          break;
        }

        case "status": {
          const handle = temporalClient!.workflow.getHandle(activeWorkflowId!);
          const status = await handle.query("fullStatus");
          // Render in pi's TUI
          ctx.ui.setWidget("workflow", [
            `Workflow: ${status.workflowName} [${status.currentStep}/${status.totalSteps}]`,
            ...status.stepResults.map((s, i) =>
              `  ${s?.status === 'done' ? '✅' : s?.status === 'skipped' ? '⊘' : i === status.currentStep ? '🔄' : '⬜'} Step ${i+1}: ${status.steps[i].name}`
            ),
          ]);
          break;
        }
      }
    },
  });
}
```

**The Temporal Workflow** (in the separate worker process):

```typescript
// temporal-worker/workflows/agent-workflow.ts
import {
  defineSignal, defineQuery, setHandler,
  condition, proxyActivities, sleep
} from "@temporalio/workflow";

const advanceSignal = defineSignal("advance");
const skipSignal = defineSignal<[number]>("skip");
const abandonSignal = defineSignal("abandon");
const stepCompletedSignal = defineSignal<[{ stepPosition: number; output: string }]>("stepCompleted");

const currentStepQuery = defineQuery<StepInfo | null>("currentStep");
const fullStatusQuery = defineQuery<WorkflowStatus>("fullStatus");

export async function agentWorkflow(input: {
  workflowName: string;
  task: string;
  steps: WorkflowStep[];
  cwd: string;
  sessionId: string;
}) {
  const { workflowName, task, steps, cwd, sessionId } = input;

  let currentStepIdx = 0;
  let abandoned = false;
  let stepCompleted = false;
  let lastStepOutput = "";
  const stepResults: (StepResult | null)[] = new Array(steps.length).fill(null);

  // ── Signal handlers ──
  setHandler(abandonSignal, () => { abandoned = true; });
  setHandler(skipSignal, (pos) => {
    stepResults[pos - 1] = { status: "skipped", output: "" };
  });
  setHandler(advanceSignal, () => { stepCompleted = true; });
  setHandler(stepCompletedSignal, (info) => {
    stepResults[info.stepPosition - 1] = { status: "done", output: info.output };
    stepCompleted = true;
    lastStepOutput = info.output;
  });

  // ── Queries (callable anytime from pi extension or Web UI) ──
  setHandler(currentStepQuery, () => {
    if (currentStepIdx >= steps.length) return null;
    const step = steps[currentStepIdx];
    return {
      workflowName,
      task,
      position: step.position,
      name: step.name,
      actionType: step.actionType,
      agentRole: step.agentRole,
      promptTemplate: step.promptTemplate,
      stepsCompleted: stepResults.filter(r => r?.status === "done").length,
      totalSteps: steps.length,
    };
  });

  setHandler(fullStatusQuery, () => ({
    workflowName,
    task,
    currentStep: currentStepIdx,
    totalSteps: steps.length,
    steps,
    stepResults,
    abandoned,
  }));

  // ── Main loop ──
  for (let i = 0; i < steps.length; i++) {
    if (abandoned) break;
    currentStepIdx = i;
    const step = steps[i];

    // Skip if already marked
    if (stepResults[i]?.status === "skipped") continue;

    // Human-in-the-loop gate
    if (step.transitionMode === "user") {
      stepCompleted = false;
      // WORKFLOW PAUSES HERE — survives crashes, can wait days
      await condition(() => stepCompleted || abandoned);
      if (abandoned) break;
    }

    // For auto-transition steps: the pi extension's agent_end hook
    // will signal stepCompleted when the agent finishes.
    // We wait for that signal.
    if (step.transitionMode === "auto") {
      stepCompleted = false;
      // Wait for pi to signal that the agent finished this step
      // Timeout after 30 minutes (configurable per step)
      const completed = await condition(
        () => stepCompleted || abandoned,
        "30 minutes"
      );

      if (!completed && !abandoned) {
        // Step timed out — mark as failed, let workflow decide
        stepResults[i] = { status: "failed", output: "Step timed out after 30 minutes" };
        // Record to XTDB
        await xtdbActivities.recordWorkflowStep({
          workflowName, stepName: step.name,
          agentRole: step.agentRole, position: step.position,
          status: "timeout",
        });
        continue;
      }
    }

    // Record step completion to XTDB
    if (stepResults[i]?.status === "done") {
      await xtdbActivities.recordWorkflowStep({
        workflowName, stepName: step.name,
        agentRole: step.agentRole, position: step.position,
        status: "done",
      });
    }
  }

  // Record workflow completion
  await xtdbActivities.recordWorkflowRun({
    workflowName,
    task,
    status: abandoned ? "abandoned" : "completed",
    totalSteps: steps.length,
    completedSteps: stepResults.filter(r => r?.status === "done").length,
  });

  return { stepResults, abandoned };
}
```

**The interaction flow:**

```
User types: /workflow start feature-build "add dark mode"
    │
    ▼
pi extension loads feature-build.jsonld from disk
    │  (RDF parsing, step extraction — unchanged)
    ▼
Extension starts Temporal workflow via client.workflow.start()
    │  Passes steps[], task, cwd, sessionId
    ▼
Temporal creates durable workflow, returns handle
    │
    ▼
Extension stores workflowId in appendEntry (for session restore)
Extension queries currentStep — caches StepInfo locally
    │
    ▼
User sends next message → agent turn starts
    │
    ▼
Extension's before_agent_start fires:
    │  - Reads cached currentStepInfo
    │  - Loads agent role .md from disk
    │  - Injects into systemPrompt
    │  (All in-process, no Temporal call needed)
    ▼
Agent works on the step (normal pi agentic loop)
    │  - xtdb-event-logger captures all 30 events (unchanged)
    │  - xtdb-projector builds task/reasoning/result (unchanged)
    ▼
Agent finishes → agent_end fires
    │
    ▼
Extension signals Temporal: handle.signal("stepCompleted", { ... })
    │
    ▼
Temporal workflow receives signal, advances to next step
    │
    ▼
Extension queries Temporal for new currentStep
    │  Updates cached StepInfo
    ▼
Next agent turn uses new step's agent role
```

---

### 4. `ci-runner/` → Temporal Worker (Cleanest Integration)

The CI runner is the simplest case because it's already a separate process — not a pi
extension. It becomes a Temporal worker directly.

**Current:** File-based queue + polling loop
**New:** Temporal task queue + worker

The soft-serve post-receive hook changes from writing a `.json` file to:

```typescript
// hooks/post-receive.ts
import { Client, Connection } from "@temporalio/client";

const connection = await Connection.connect({ address: "localhost:7233" });
const client = new Client({ connection });

await client.workflow.start("ciPipeline", {
  workflowId: `ci-${repo}-${commitSha.slice(0, 8)}`,
  taskQueue: "ci-pipeline",
  args: [{ repoPath, commitSha, branch }],
});
```

The runner.ts polling loop is replaced by a Temporal worker that registers activities.
Everything else (Docker step execution, pipeline resolution, XTDB recording) stays the same
as functions — they just become Temporal activities with retry policies.

---

## Docker Compose Addition

```yaml
  # ── Temporal Server ──
  temporal:
    image: temporalio/auto-setup:1.25
    container_name: temporal
    ports:
      - "7233:7233"
    environment:
      - DB=postgresql
      - DB_PORT=5432
      - POSTGRES_USER=temporal
      - POSTGRES_PWD=temporal
      - POSTGRES_SEEDS=temporal-db
    depends_on:
      temporal-db:
        condition: service_healthy
    networks:
      - harness

  temporal-db:
    image: postgres:16-alpine
    container_name: temporal-db
    ports:
      - "5435:5432"
    environment:
      POSTGRES_USER: temporal
      POSTGRES_PASSWORD: temporal
      POSTGRES_DB: temporal
    volumes:
      - temporal-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U temporal"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - harness

  temporal-ui:
    image: temporalio/ui:2.31
    container_name: temporal-ui
    ports:
      - "8233:8080"
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
      - TEMPORAL_CORS_ORIGINS=http://localhost:3336
    depends_on:
      - temporal
    networks:
      - harness

  temporal-worker:
    build:
      context: ./temporal-worker
      dockerfile: Dockerfile
    container_name: temporal-worker
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
      - XTDB_HOST=xtdb-primary
      - XTDB_PORT=5433
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # for CI Docker steps
    depends_on:
      - temporal
      - xtdb-primary
    networks:
      - harness

volumes:
  temporal-db-data:
```

---

## Temporal Worker Project Structure

```
temporal-worker/
├── package.json              # @temporalio/worker, @temporalio/workflow, @temporalio/activity
├── tsconfig.json
├── Dockerfile
├── src/
│   ├── worker.ts             # Worker entry point — registers activities, connects to server
│   ├── workflows/
│   │   ├── agent-delegation.ts    # Single agent execution with retry
│   │   ├── agent-workflow.ts      # Multi-step workflow (JSON-LD steps)
│   │   ├── orchestration.ts       # Parent workflow with fan-out
│   │   └── ci-pipeline.ts         # CI pipeline execution
│   ├── activities/
│   │   ├── spawn-agent.ts         # pi --mode json subprocess with heartbeat
│   │   ├── xtdb-persistence.ts    # XTDB writes with retry
│   │   ├── docker-execution.ts    # Docker step runner (from ci-runner)
│   │   └── workflow-loader.ts     # JSON-LD workflow parsing
│   └── shared/
│       ├── types.ts               # Shared types (WorkflowStep, StepResult, etc.)
│       └── config.ts              # Environment-based configuration
```

---

## What Retry Means for Pi Agents

A critical clarification: pi agent sessions are **not resumable mid-session**. When Temporal
retries an agent activity, it starts a **fresh pi session** for the same task. This is actually
the right behavior because:

1. The agent may have corrupted its own context (wrong assumptions, hallucinated state)
2. A fresh session gets a clean context window
3. The task description is the contract — not the session state

However, this means:
- **Idempotency matters.** If an agent partially completed work (wrote some files) before
  crashing, the retry starts with those files on disk. The agent needs to handle existing state.
- **Heartbeat = progress indicator**, not checkpoint. Temporal uses heartbeats to detect stuck
  agents, not to resume from a checkpoint.
- **XTDB records all attempts.** Each spawn creates a delegation record, so you have full
  lineage of retried attempts.

---

## Migration Path (Revised)

### Phase 1: Temporal Infrastructure + CI Runner (~1 week)
- Add Temporal to docker-compose.yml
- Create temporal-worker project scaffold
- Migrate ci-runner to Temporal worker
- No pi extension changes yet
- **Validates:** Temporal setup, Docker networking, activity basics

### Phase 2: Agent Spawner Integration (~1-2 weeks)
- Add `@temporalio/client` to harness package.json
- Modify `agent-spawner/index.ts` to use Temporal client in `delegate` tool
- Create `spawnPiAgent` activity in temporal-worker
- Keep fallback to direct spawn when Temporal is unavailable
- **Validates:** Temporal ↔ pi extension communication, heartbeat patterns

### Phase 3: Workflow Engine Integration (~2-3 weeks)
- Modify `workflow-engine/index.ts` to be a Temporal client
- Create `agentWorkflow` in temporal-worker
- Wire `agent_end` hook to signal Temporal
- Keep `before_agent_start` injection unchanged (just reads from Temporal query)
- **Validates:** Signal/query patterns, human-in-the-loop, step sequencing

### Phase 4: Orchestrator Integration (~1 week)
- Modify `orchestrator/index.ts` to start parent workflows
- Create `orchestrationWorkflow` with child workflow fan-out
- **Validates:** Workflow composition, parallel execution

### Total: ~5-7 weeks

---

## Fallback Strategy

Every extension maintains a **dual-mode** design:

```typescript
if (temporalClient) {
  // Temporal path: durable, retryable, observable
  await temporalClient.workflow.start(...);
} else {
  // Local path: current behavior, no retry, in-memory state
  await runSubagent(...);
}
```

This means:
- Temporal is an **enhancement**, not a hard dependency
- Development/testing can happen without Temporal running
- If Temporal Server goes down, pi sessions continue working (with reduced reliability)
- Migration is gradual — each extension can be converted independently

---

## Key Difference from v1

| Aspect | v1 (Wrong) | v2 (Correct) |
|--------|-----------|-------------|
| Extensions | Replaced by Temporal workflows | Remain as pi in-process hooks |
| System prompt injection | Moved to Temporal | Stays in `before_agent_start` (queries Temporal for data) |
| Tool registration | Moved to Temporal | Stays in pi (`registerTool`) |
| UI interaction | Temporal Web UI only | pi TUI widgets + Temporal Web UI |
| State persistence | Temporal only | `appendEntry` for workflowId + Temporal for workflow state |
| Agent spawning | Temporal activity replaces pi | `delegate` tool stays in pi, calls Temporal client internally |
| Session lifecycle | Ignored | Fully respected (`session_start`, `session_shutdown`) |
| Graceful degradation | None (hard Temporal dependency) | Dual-mode with local fallback |
| JSON-LD parsing | Moved to Temporal | Stays in pi extension (file read) |
| XTDB event logging | Replaced | Unchanged (30 handlers + router) |
