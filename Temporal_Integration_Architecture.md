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

---

## Observability: OpenTelemetry Integration

Reliability without transparency is useless — if an agent workflow fails on retry 2 of 3 at
step 4, you need to see *why*. OTEL is not an afterthought; it's the reason Temporal is worth
adopting. The entire point is to make the agentic system legible.

### Three Telemetry Layers

The harness currently has one observability layer (XTDB events). With Temporal + OTEL we get
three complementary layers:

```
Layer 1: XTDB Event Store (existing — unchanged)
├── What the agent DID: tool calls, reasoning traces, mutations, results
├── 30 event types via xtdb-event-logger
├── Projections via xtdb-projector (Task → Reasoning → Result)
└── Bitemporal: query as-of any point in time

Layer 2: Temporal Workflow History (new — built into Temporal)
├── What the ORCHESTRATION did: workflow starts, signals, queries, completions
├── Activity attempts, retries, timeouts, heartbeats
├── Child workflow hierarchies (orchestrator → step workflow → agent delegation)
└── Queryable via Temporal Web UI and gRPC API

Layer 3: OpenTelemetry Distributed Traces (new — connects everything)
├── End-to-end latency: /workflow start → agent spawn → agent completion → XTDB write
├── Cross-process correlation: pi extension → Temporal server → worker → pi subprocess
├── Metrics: workflow duration, activity failure rate, retry counts, queue latency
└── Exported to Grafana/Jaeger/Prometheus for dashboards and alerting
```

### How OTEL Traces Flow Through the System

```
pi extension                    Temporal Server              Temporal Worker
─────────────                   ───────────────              ───────────────

client.workflow.start()         ┌─────────────┐
  │                             │ WorkflowTask │
  │  trace context propagated ──▶  dispatched  │
  │  via Temporal headers       └──────┬──────┘
  │                                    │
  │                                    ▼
  │                             ┌─────────────┐    ┌────────────────────┐
  │                             │ ActivityTask │───▶│ spawnPiAgent()     │
  │                             │  dispatched  │    │                    │
  │                             └─────────────┘    │ pi --mode json     │
  │                                                │   ├─ heartbeat #1  │
  │                                                │   ├─ heartbeat #2  │
  │                                                │   └─ exit(0)       │
  │                                                │                    │
  │                                                │ recordToXtdb()     │
  │                                                │   └─ INSERT INTO   │
  │                                                └────────────────────┘
  │                                                         │
  │                    trace context returned                │
  ◀─────────────────────────────────────────────────────────┘

Result: ONE trace spanning all three processes, with spans for:
  • workflow.start (pi extension)
  • WorkflowTaskScheduled → WorkflowTaskCompleted (Temporal server)
  • ActivityTaskScheduled → ActivityTaskStarted → ActivityTaskCompleted
  • spawnPiAgent (worker — custom span)
  • pi.subprocess.stdout.heartbeat (worker — custom span)
  • xtdb.insert.delegations (worker — custom span)
```

### Temporal Worker OTEL Setup

```typescript
// temporal-worker/src/instrumentation.ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const resource = new Resource({
  [ATTR_SERVICE_NAME]: "harness-temporal-worker",
  "harness.component": "temporal-worker",
});

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://otel-collector:4317",
});

const metricExporter = new OTLPMetricExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://otel-collector:4317",
});

const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 10_000,
  }),
});

sdk.start();
export { sdk };
```

```typescript
// temporal-worker/src/worker.ts
import "./instrumentation"; // must be first import
import { NativeConnection, Worker, Runtime } from "@temporalio/worker";
import {
  makeWorkflowExporter,
  OpenTelemetryActivityInboundInterceptor,
} from "@temporalio/interceptors-opentelemetry";
import { trace } from "@opentelemetry/api";
import * as activities from "./activities";

const tracer = trace.getTracer("harness-temporal-worker");

async function main() {
  // Configure Temporal runtime with OTEL metrics
  Runtime.install({
    telemetryOptions: {
      metrics: {
        otel: {
          url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://otel-collector:4317",
          metricsExportInterval: 10_000,
        },
      },
    },
  });

  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS || "temporal:7233",
  });

  const worker = await Worker.create({
    connection,
    namespace: "default",
    taskQueue: "agent-execution",
    workflowsPath: require.resolve("./workflows"),
    activities,
    interceptors: {
      // Propagate OTEL context into workflows
      workflowModules: [require.resolve("./workflows/otel-interceptors")],
      // Propagate OTEL context into activities
      activity: [
        (ctx) => ({
          inbound: new OpenTelemetryActivityInboundInterceptor(ctx),
        }),
      ],
    },
  });

  await worker.run();
}

main().catch(console.error);
```

```typescript
// temporal-worker/src/workflows/otel-interceptors.ts
import { makeWorkflowExporter } from "@temporalio/interceptors-opentelemetry/workflow";

// This module runs in the Workflow sandbox — it exports the OTEL interceptors
// that create spans for workflow task execution
export const interceptors = makeWorkflowExporter();
```

### Custom Spans in Activities

The Temporal OTEL interceptors handle workflow-level and activity-level spans automatically.
For finer-grained visibility into *what's happening inside* each activity, add custom spans:

```typescript
// temporal-worker/src/activities/spawn-agent.ts
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { Context as TemporalContext } from "@temporalio/activity";

const tracer = trace.getTracer("harness-agent-spawner");

export async function spawnPiAgent(input: {
  agentRole: string;
  task: string;
  cwd: string;
  parentSessionId: string;
}) {
  return tracer.startActiveSpan(`agent.spawn.${input.agentRole}`, async (span) => {
    span.setAttributes({
      "agent.role": input.agentRole,
      "agent.task": input.task.slice(0, 200),
      "agent.cwd": input.cwd,
      "agent.parent_session": input.parentSessionId,
    });

    try {
      const proc = spawn("pi", ["--mode", "json", "-p", input.task, ...], { cwd: input.cwd });

      let stdout = "";
      let heartbeatCount = 0;

      proc.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
        heartbeatCount++;

        // Heartbeat Temporal
        TemporalContext.current().heartbeat({ bytes: stdout.length, heartbeatCount });

        // Add span event for each significant output chunk
        if (heartbeatCount % 10 === 0) {
          span.addEvent("agent.heartbeat", {
            "heartbeat.count": heartbeatCount,
            "output.bytes": stdout.length,
          });
        }
      });

      const result = await waitForExit(proc);

      span.setAttributes({
        "agent.exit_code": result.exitCode,
        "agent.output_bytes": result.output.length,
        "agent.session_id": result.sessionId,
        "agent.heartbeat_count": heartbeatCount,
      });

      if (result.exitCode !== 0) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: `Exit code ${result.exitCode}` });
      }

      return result;

    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
```

### Pi Extension OTEL Spans (Optional, Phase 5)

The pi extensions can also emit OTEL spans to bridge the gap between "pi sent a gRPC call
to Temporal" and "Temporal dispatched the workflow." This is optional but gives you the full
picture:

```typescript
// In any pi extension that uses Temporal
import { trace, context, propagation } from "@opentelemetry/api";

const tracer = trace.getTracer("harness-pi-extension");

// When starting a workflow from the extension:
const span = tracer.startSpan("orchestrate.plan", {
  attributes: {
    "pi.session": ctx.sessionManager.getSessionFile(),
    "workflow.tasks": tasks.length,
  },
});

try {
  // Propagate trace context to Temporal
  await temporalClient.workflow.start("orchestrationWorkflow", {
    workflowId,
    taskQueue: "agent-execution",
    args: [{ tasks, cwd, sessionId }],
  });
  span.setStatus({ code: SpanStatusCode.OK });
} catch (err) {
  span.setStatus({ code: SpanStatusCode.ERROR });
  span.recordException(err);
  throw err;
} finally {
  span.end();
}
```

**Note:** Adding OTEL to pi extensions requires `@opentelemetry/api` and
`@opentelemetry/sdk-node` as dependencies in the harness package.json. The pi runtime
doesn't restrict this — extensions have full Node.js network access.

### Metrics Worth Tracking

| Metric | Source | What it tells you |
|--------|--------|------------------|
| `temporal_workflow_task_schedule_to_start_latency` | Temporal SDK (auto) | How long workflows wait in the task queue |
| `temporal_activity_schedule_to_start_latency` | Temporal SDK (auto) | How long activities wait for a worker |
| `temporal_activity_execution_latency` | Temporal SDK (auto) | How long each activity takes |
| `agent.spawn.duration` | Custom span | Time from pi spawn to exit |
| `agent.spawn.exit_code` | Custom attribute | Success/failure rate per agent role |
| `agent.spawn.heartbeat_count` | Custom attribute | How active the agent was |
| `agent.spawn.output_bytes` | Custom attribute | Output volume per agent |
| `workflow.step.duration` | Custom span | Time per workflow step |
| `workflow.step.retries` | Temporal SDK (auto) | How often steps need retrying |
| `xtdb.insert.duration` | Custom span | XTDB write latency |
| `delegate.e2e.duration` | Custom span (pi ext) | Full round-trip: pi → Temporal → worker → pi subprocess → XTDB |

### OTEL ↔ XTDB Correlation

The key to making all three layers work together is a shared correlation ID. Every XTDB
event already carries a `session_id`. Every Temporal workflow has a `workflowId`. Bridge them:

```typescript
// When starting a Temporal workflow from pi extension:
const workflowId = `wf-${name}-${Date.now()}`;
const sessionId = ctx.sessionManager.getSessionFile();

// Store both IDs in Temporal workflow input
await temporalClient.workflow.start("agentWorkflow", {
  workflowId,
  args: [{ ..., sessionId }],
});

// In the Temporal activity, pass sessionId into XTDB records:
await recordToXtdb({
  table: "delegations",
  data: {
    temporal_workflow_id: workflowId,  // ← NEW: links XTDB row to Temporal
    parent_session_id: sessionId,
    // ... existing fields
  },
});

// In OTEL spans, set both as attributes:
span.setAttributes({
  "temporal.workflow_id": workflowId,
  "pi.session_id": sessionId,
});
```

Now you can:
1. See a failed workflow step in Temporal Web UI → get `workflowId`
2. Query XTDB: `SELECT * FROM delegations WHERE temporal_workflow_id = ?`
3. See the agent's tool calls, reasoning traces, and mutations in XTDB
4. Cross-reference with the OTEL trace in Grafana/Jaeger for timing and retry info

---

## Observability Infrastructure (Docker Compose)

Replace the previous Docker Compose section with this expanded version that includes the
full OTEL stack:

```yaml
  # ════════════════════════════════════════════════════════════════
  # Temporal Server
  # ════════════════════════════════════════════════════════════════
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

  # ════════════════════════════════════════════════════════════════
  # Temporal Worker (your harness code)
  # ════════════════════════════════════════════════════════════════
  temporal-worker:
    build:
      context: ./temporal-worker
      dockerfile: Dockerfile
    container_name: temporal-worker
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
      - XTDB_HOST=xtdb-primary
      - XTDB_PORT=5433
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
      - OTEL_SERVICE_NAME=harness-temporal-worker
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - temporal
      - xtdb-primary
      - otel-collector
    networks:
      - harness

  # ════════════════════════════════════════════════════════════════
  # OpenTelemetry Collector
  # Central hub: receives traces + metrics from worker and pi,
  # exports to Tempo (traces), Prometheus (metrics), Loki (logs)
  # ════════════════════════════════════════════════════════════════
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.102.0
    container_name: otel-collector
    ports:
      - "4317:4317"     # OTLP gRPC receiver
      - "4318:4318"     # OTLP HTTP receiver
      - "8888:8888"     # Collector metrics
      - "8889:8889"     # Prometheus exporter
    volumes:
      - ./observability/otel-collector-config.yaml:/etc/otelcol-contrib/config.yaml
    depends_on:
      - tempo
      - prometheus
    networks:
      - harness

  # ════════════════════════════════════════════════════════════════
  # Grafana Tempo — Distributed trace storage
  # ════════════════════════════════════════════════════════════════
  tempo:
    image: grafana/tempo:2.5
    container_name: tempo
    ports:
      - "3200:3200"     # Tempo API
      - "9095:9095"     # Tempo gRPC
    volumes:
      - ./observability/tempo-config.yaml:/etc/tempo/config.yaml
      - tempo-data:/var/tempo
    command: ["-config.file=/etc/tempo/config.yaml"]
    networks:
      - harness

  # ════════════════════════════════════════════════════════════════
  # Prometheus — Metrics storage
  # ════════════════════════════════════════════════════════════════
  prometheus:
    image: prom/prometheus:v2.53.0
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./observability/prometheus.yaml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    networks:
      - harness

  # ════════════════════════════════════════════════════════════════
  # Grafana — Unified dashboard for traces, metrics, logs
  # ════════════════════════════════════════════════════════════════
  grafana:
    image: grafana/grafana:11.1.0
    container_name: grafana
    ports:
      - "3001:3000"     # 3001 to avoid conflict with harness services on 3333-3339
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=harness
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer
    volumes:
      - ./observability/grafana/provisioning:/etc/grafana/provisioning
      - ./observability/grafana/dashboards:/var/lib/grafana/dashboards
      - grafana-data:/var/lib/grafana
    depends_on:
      - prometheus
      - tempo
    networks:
      - harness

volumes:
  temporal-db-data:
  tempo-data:
  prometheus-data:
  grafana-data:
```

### OTEL Collector Configuration

```yaml
# observability/otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: "0.0.0.0:4317"
      http:
        endpoint: "0.0.0.0:4318"

processors:
  batch:
    timeout: 5s
    send_batch_size: 1024

  # Add harness-specific attributes to all telemetry
  attributes:
    actions:
      - key: "harness.environment"
        value: "development"
        action: upsert

exporters:
  # Traces → Tempo
  otlp/tempo:
    endpoint: "tempo:4317"
    tls:
      insecure: true

  # Metrics → Prometheus
  prometheusremotewrite:
    endpoint: "http://prometheus:9090/api/v1/write"
    tls:
      insecure: true

  # Debug: log to stdout (disable in production)
  debug:
    verbosity: basic

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch, attributes]
      exporters: [otlp/tempo, debug]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheusremotewrite, debug]
```

### Tempo Configuration

```yaml
# observability/tempo-config.yaml
server:
  http_listen_port: 3200

distributor:
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: "0.0.0.0:4317"

storage:
  trace:
    backend: local
    local:
      path: /var/tempo/traces
    wal:
      path: /var/tempo/wal

metrics_generator:
  registry:
    external_labels:
      source: tempo
      cluster: harness
  storage:
    path: /var/tempo/generator/wal
```

### Prometheus Configuration

```yaml
# observability/prometheus.yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  # Scrape OTEL Collector's own metrics
  - job_name: "otel-collector"
    static_configs:
      - targets: ["otel-collector:8888"]

  # Scrape Prometheus exporter from OTEL Collector
  - job_name: "otel-metrics"
    static_configs:
      - targets: ["otel-collector:8889"]

  # Scrape Temporal Server metrics (if exposed)
  - job_name: "temporal-server"
    static_configs:
      - targets: ["temporal:8000"]

# Enable remote write receiver for OTEL Collector
remote_write: []
```

### Grafana Datasource Provisioning

```yaml
# observability/grafana/provisioning/datasources/datasources.yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true

  - name: Tempo
    type: tempo
    access: proxy
    url: http://tempo:3200
    jsonData:
      tracesToMetrics:
        datasourceUid: prometheus
      nodeGraph:
        enabled: true
      traceQuery:
        timeShiftEnabled: true
        spanStartTimeShift: "1h"
        spanEndTimeShift: "1h"
      search:
        hide: false
```

---

## Observability Stack Summary

| Service | Port | Purpose | Storage |
|---------|------|---------|---------|
| OTEL Collector | 4317 (gRPC), 4318 (HTTP) | Receives all telemetry, routes to backends | None (passthrough) |
| Tempo | 3200 | Distributed trace storage | Local disk |
| Prometheus | 9090 | Metrics storage and querying | Local disk |
| Grafana | 3001 | Unified dashboards | Local disk |
| Temporal UI | 8233 | Workflow-specific visibility | Temporal DB |

**Total additional RAM:** ~800MB (OTEL Collector ~100MB, Tempo ~200MB, Prometheus ~200MB,
Grafana ~150MB, plus Temporal infra from before ~400MB). Total new infrastructure: ~1.2GB RAM.

### What You Can See in Grafana

1. **Trace view:** Click any workflow execution → see the full span tree from pi extension
   → Temporal server → worker → pi subprocess → XTDB write. See exactly where time was spent
   and where failures occurred.

2. **Agent dashboard:** Success/failure rate by agent role. Average execution time. Retry
   frequency. Heartbeat patterns. Output volume trends.

3. **Workflow dashboard:** Step completion rates. Human-in-the-loop wait times. Parallel
   fan-out visualization. End-to-end workflow duration.

4. **Infrastructure dashboard:** Temporal task queue depth. Worker utilization. XTDB write
   latency. OTEL Collector throughput.

---

## Revised Migration Path (with OTEL)

### Phase 1: Infrastructure (~1 week)
- Add Temporal + OTEL stack to docker-compose.yml
- Create `observability/` config directory
- Migrate ci-runner to Temporal worker with OTEL instrumentation
- Set up basic Grafana dashboards
- **Validates:** Full stack connectivity, OTEL pipeline, basic traces

### Phase 2: Agent Spawner + Observability (~2 weeks)
- Modify `agent-spawner/index.ts` to use Temporal client
- Add custom spans in `spawnPiAgent` activity
- Create agent performance dashboard in Grafana
- Add XTDB ↔ Temporal correlation IDs
- **Validates:** Cross-process traces, retry visibility, heartbeat monitoring

### Phase 3: Workflow Engine + Observability (~2-3 weeks)
- Modify `workflow-engine/index.ts` to be a Temporal client
- Add workflow step spans and metrics
- Create workflow progress dashboard in Grafana
- Wire OTEL traces to XTDB projection queries
- **Validates:** End-to-end trace from `/workflow start` to completion

### Phase 4: Orchestrator + Full Dashboard (~1-2 weeks)
- Modify `orchestrator/index.ts` to start parent workflows
- Create orchestration overview dashboard
- Add alerting rules (e.g., >3 retries, workflow stuck >1hr)
- **Validates:** Full system observability

### Phase 5 (Optional): Pi Extension OTEL Spans (~1 week)
- Add `@opentelemetry/api` to harness package.json
- Emit spans from pi extensions for client-side tracing
- Bridge pi session → Temporal → worker in single trace view
- **Validates:** True end-to-end distributed tracing

### Total: ~7-9 weeks

---

## Corrections from GPT and Gemini Reviews

Both reviews validated the core architecture (split-brain model, extensions as Temporal
clients, dual-mode fallback) but identified real gaps. This section addresses every
legitimate finding. Items are tagged with who found them.

### Correction 1: Observability Baseline Was Understated [GPT]

The proposal claimed "the harness has one observability layer (XTDB events)." That's wrong.
The harness already has:

- `lib/logger.ts` — Pino structured logging across all services
- `lib/request-logger.ts` — HTTP request logging middleware
- `lib/api-metrics.ts` — API endpoint timing and counters
- `lib/rate-limiter.ts` — Request rate limiting
- `lib/query-timer.ts` — XTDB query performance tracking
- `lib/error-groups.ts` — Error classification and grouping
- `health-prober/` — Service health monitoring
- XTDB schema with 42 tables (not 27), including `service_health_checks`,
  `container_metrics`, `slow_queries`, `api_metrics`, `error_groups`,
  `review_reports`, `complexity_scores`, `graph_edges`

**Correction:** OTEL doesn't replace this existing observability — it adds distributed
tracing *across* process boundaries (pi → Temporal → worker → pi subprocess). The existing
Pino logging, API metrics, and health checks remain. OTEL complements them with cross-process
span correlation that the existing per-service logging can't provide.

---

### Correction 2: Payload Encryption Is Not Optional [Gemini, GPT]

Temporal stores all workflow/activity inputs and outputs in its PostgreSQL database as
plaintext. This means task prompts, agent code output, reasoning traces, and potentially
sensitive code snippets are readable via Temporal UI and API.

**Solution: Temporal Payload Codec (Data Converter)**

```typescript
// temporal-worker/src/encryption/codec.ts
import { PayloadCodec } from "@temporalio/common";
import { METADATA_ENCODING_KEY } from "@temporalio/common/lib/encoding";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ENCRYPTION_KEY = Buffer.from(
  process.env.TEMPORAL_ENCRYPTION_KEY || "",
  "base64"
);

export class EncryptionCodec implements PayloadCodec {
  async encode(payloads: Payload[]): Promise<Payload[]> {
    return payloads.map((payload) => {
      const iv = randomBytes(16);
      const cipher = createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
      const encrypted = Buffer.concat([
        cipher.update(payload.data!),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      return {
        metadata: {
          [METADATA_ENCODING_KEY]: Buffer.from("binary/encrypted"),
          "encryption-iv": iv,
          "encryption-auth-tag": authTag,
        },
        data: encrypted,
      };
    });
  }

  async decode(payloads: Payload[]): Promise<Payload[]> {
    return payloads.map((payload) => {
      if (
        Buffer.from(payload.metadata![METADATA_ENCODING_KEY]).toString() !==
        "binary/encrypted"
      ) {
        return payload; // not encrypted, pass through
      }

      const iv = Buffer.from(payload.metadata!["encryption-iv"]);
      const authTag = Buffer.from(payload.metadata!["encryption-auth-tag"]);
      const decipher = createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(payload.data!),
        decipher.final(),
      ]);

      return { metadata: payload.metadata, data: decrypted };
    });
  }
}
```

**Apply to both client (in pi extensions) and worker:**

```typescript
// In pi extension Temporal client setup:
import { EncryptionCodec } from "../shared/encryption/codec";

const client = new Client({
  connection,
  dataConverter: {
    payloadCodecs: [new EncryptionCodec()],
  },
});

// In temporal-worker/src/worker.ts:
const worker = await Worker.create({
  // ... existing config
  dataConverter: {
    payloadCodecs: [new EncryptionCodec()],
  },
});
```

**For Temporal UI visibility:** Deploy the Temporal Codec Server — a small HTTP service
that decrypts payloads on-the-fly for authorized users viewing the Temporal UI. Without it,
the UI shows encrypted blobs. With it, authorized viewers see plaintext. Add to docker-compose:

```yaml
  temporal-codec-server:
    build:
      context: ./temporal-worker
      dockerfile: Dockerfile.codec-server
    container_name: temporal-codec-server
    ports:
      - "8888:8888"
    environment:
      - TEMPORAL_ENCRYPTION_KEY=${TEMPORAL_ENCRYPTION_KEY}
    networks:
      - harness
```

---

### Correction 3: Worker Concurrency Limits [Gemini, GPT]

A single temporal-worker container with no concurrency limits could spawn 50+ pi
subprocesses simultaneously during a fan-out orchestration, exhausting CPU and RAM.

**Solution: Explicit concurrency caps per task queue**

```typescript
// temporal-worker/src/worker.ts

// Agent execution worker — limit concurrent pi subprocesses
const agentWorker = await Worker.create({
  connection,
  taskQueue: "agent-execution",
  workflowsPath: require.resolve("./workflows"),
  activities: agentActivities,
  maxConcurrentActivityTaskExecutions: 4,    // max 4 pi subprocesses at once
  maxConcurrentWorkflowTaskExecutions: 10,   // max 10 workflow tasks at once
  maxTaskQueueActivitiesPerSecond: 2,        // rate limit: 2 new agents/sec
  interceptors: { /* otel interceptors */ },
});

// CI pipeline worker — separate limits for Docker steps
const ciWorker = await Worker.create({
  connection,
  taskQueue: "ci-pipeline",
  activities: ciActivities,
  maxConcurrentActivityTaskExecutions: 2,    // max 2 Docker builds at once
  maxTaskQueueActivitiesPerSecond: 1,
});

// XTDB persistence worker — high throughput, low resource
const xtdbWorker = await Worker.create({
  connection,
  taskQueue: "xtdb-persistence",
  activities: xtdbActivities,
  maxConcurrentActivityTaskExecutions: 20,   // DB writes are cheap
  maxTaskQueueActivitiesPerSecond: 50,
});

// Run all three workers in parallel
await Promise.all([
  agentWorker.run(),
  ciWorker.run(),
  xtdbWorker.run(),
]);
```

**Scaling beyond a single machine:** When 4 concurrent agents isn't enough, add replicas:

```yaml
  temporal-worker:
    # ...existing config...
    deploy:
      replicas: 3    # 3 containers × 4 concurrent = 12 max parallel agents
```

Each replica polls the same task queue. Temporal distributes work across all replicas
automatically. No code changes needed — just scaling.

---

### Correction 4: Hot Path Query Timeout in `before_agent_start` [GPT]

The `before_agent_start` hook runs synchronously before every agent turn. If Temporal is
slow to respond to a query, agent startup blocks. This is unacceptable.

**Solution: Fail-open with timeout and cached fallback**

```typescript
// In workflow-engine/index.ts before_agent_start hook:

pi.on("before_agent_start", async (event, ctx) => {
  if (!activeWorkflowId) return;

  let stepInfo = currentStepInfo; // use cache first

  if (temporalClient) {
    try {
      // Hard timeout: 2 seconds. If Temporal can't answer in 2s, use cache.
      const handle = temporalClient.workflow.getHandle(activeWorkflowId);
      stepInfo = await Promise.race([
        handle.query("currentStep"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("query_timeout")), 2000)
        ),
      ]);
      currentStepInfo = stepInfo; // update cache on success
    } catch (e) {
      // FAIL-OPEN: use last known step info, don't block the agent
      // Log the failure for observability but don't halt
      console.warn(`Temporal query failed (${e.message}), using cached step info`);
    }
  }

  if (!stepInfo) return; // no cached info either — don't inject anything

  // ... rest of prompt injection logic unchanged
});
```

**Policy: fail-open, not fail-closed.** A missing or stale workflow status injection is
better than blocking the agent entirely. The agent can still work; it just might not have
the latest step context injected into its system prompt.

---

### Correction 5: Child Process Trace Correlation [Gemini, GPT]

When the Temporal worker spawns `pi --mode json`, the child process doesn't know the
`workflowId` or the OTEL trace context. Its XTDB events are orphaned.

**Solution: Pass correlation context via environment variables**

```typescript
// temporal-worker/src/activities/spawn-agent.ts

export async function spawnPiAgent(input: SpawnInput) {
  return tracer.startActiveSpan(`agent.spawn.${input.agentRole}`, async (span) => {
    // Extract OTEL trace context for propagation
    const traceContext: Record<string, string> = {};
    propagation.inject(context.active(), traceContext);

    const proc = spawn("pi", ["--mode", "json", "-p", input.task, ...], {
      cwd: input.cwd,
      env: {
        ...process.env,
        // Pass correlation IDs to child process
        TEMPORAL_WORKFLOW_ID: input.workflowId,
        TEMPORAL_RUN_ID: input.runId,
        PARENT_SESSION_ID: input.parentSessionId,
        // Pass OTEL trace context (W3C Trace Context format)
        TRACEPARENT: traceContext.traceparent || "",
        TRACESTATE: traceContext.tracestate || "",
      },
    });
    // ... rest of spawn logic
  });
}
```

**On the pi side:** The `xtdb-event-logger` extension can read these env vars and attach
them to every XTDB event record:

```typescript
// In xtdb-event-logger, when building NormalizedEvent:
const temporalWorkflowId = process.env.TEMPORAL_WORKFLOW_ID;
const parentSessionId = process.env.PARENT_SESSION_ID;

// Attach to every event if present
if (temporalWorkflowId) {
  event["temporal_workflow_id"] = temporalWorkflowId;
  event["parent_session_id"] = parentSessionId;
}
```

This closes the correlation gap: every XTDB event from a child agent session now links back
to the Temporal workflow that spawned it.

---

### Correction 6: Dangling Workflow References [Gemini]

If Temporal's DB is wiped or a workflow hits its retention limit, the pi session still has a
`workflowId` in `appendEntry` pointing to nothing. Querying it would throw `NotFoundError`.

**Solution: Defensive restoration on `session_start`**

```typescript
pi.on("session_start", async (_event, ctx) => {
  // ... connect to Temporal ...

  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "workflow-temporal") {
      const storedId = (entry as any).workflowId;

      if (temporalClient) {
        try {
          const handle = temporalClient.workflow.getHandle(storedId);
          const desc = await handle.describe();

          if (desc.status.name === "COMPLETED" || desc.status.name === "TERMINATED") {
            // Workflow finished or was terminated — clear reference
            activeWorkflowId = null;
            ctx.ui.notify(`Previous workflow ${storedId} is ${desc.status.name}`, "info");
          } else {
            // Workflow still running — restore
            activeWorkflowId = storedId;
            currentStepInfo = await handle.query("currentStep");
          }
        } catch (e) {
          if (e.name === "WorkflowNotFoundError" || e.message?.includes("not found")) {
            // Workflow no longer exists in Temporal
            activeWorkflowId = null;
            ctx.ui.notify(
              `Previous workflow ${storedId} no longer exists in Temporal. ` +
              `It may have been cleaned up by retention policy.`,
              "warning"
            );
          } else {
            // Some other error — fail open, clear reference
            activeWorkflowId = null;
          }
        }
      }
    }
  }
});
```

---

### Correction 7: Process Group Termination [Gemini]

When Temporal cancels an activity, the current proposal sends `SIGTERM` to the pi child
process. But pi may have spawned its own subprocesses (compilers, Docker containers, test
runners). A single `SIGTERM` to the parent leaves children orphaned.

**Solution: Kill the entire process group**

```typescript
// temporal-worker/src/activities/spawn-agent.ts

const proc = spawn("pi", [...], {
  cwd: input.cwd,
  env: { ...process.env, ...correlationEnv },
  detached: true,  // Create new process group (proc.pid is the group leader)
});

// On cancellation, kill the entire group
TemporalContext.current().cancelled.catch(() => {
  try {
    // Negative PID kills the entire process group
    process.kill(-proc.pid!, "SIGTERM");

    // Grace period, then force kill
    setTimeout(() => {
      try { process.kill(-proc.pid!, "SIGKILL"); } catch {}
    }, 5000);
  } catch {}
});
```

---

### Correction 8: Fallback Reconciliation Policy [GPT, Gemini]

The dual-mode design doesn't specify what happens when a workflow is *already running* in
Temporal and then the server goes offline. Can the local session continue? How does state
reconcile when the server comes back?

**Policy decision: Fallback is for NEW work only.**

- If a Temporal workflow is already in flight and the server becomes unreachable:
  - The pi extension *keeps the workflowId reference* but marks it as `stale`
  - `before_agent_start` uses the last cached `currentStepInfo` (fail-open, Correction 4)
  - `/orchestrate` and `/workflow` commands that need to signal Temporal fail with a
    user-visible error: "Temporal unavailable — workflow is paused"
  - The agent can still work (it has cached prompt context), but workflow progression
    (step advancement, task completion signaling) is blocked
  - When Temporal comes back online, the extension reconnects and resumes signaling
  - No local execution of new orchestration work during outage — only the Temporal-free
    fallback mode for entirely new, unmanaged task runs

- The alternative (allowing local execution to continue and then reconciling) was considered
  and rejected because:
  - Temporal's event-sourced state is authoritative — allowing divergent local state creates
    split-brain problems that are harder to solve than the original orchestration problem
  - The whole point of adopting Temporal is that *it* owns the state, not the extensions

---

### Correction 9: Dependency Placement Per Package [GPT]

The proposal said "add `@temporalio/client` to harness package.json" but the repo is
multi-package — each extension and service has its own `package.json`.

**Correct placement:**

| Package | Dependency | Why |
|---------|-----------|-----|
| `orchestrator/package.json` | `@temporalio/client` | Starts/signals/queries workflows |
| `agent-spawner/package.json` | `@temporalio/client` | Starts delegation workflows from `delegate` tool |
| `workflow-engine/package.json` | `@temporalio/client` | Starts/signals/queries step workflows |
| `temporal-worker/package.json` | `@temporalio/worker`, `@temporalio/workflow`, `@temporalio/activity`, `@temporalio/interceptors-opentelemetry`, `@opentelemetry/*` | Worker process |
| `ci-runner/package.json` | (none — ci-runner is *replaced* by temporal-worker) | — |

The `@temporalio/client` package is ~2MB and has minimal transitive dependencies. It's
safe to add per-extension without bloating the pi process.

**Shared types** (WorkflowStep, StepResult, etc.) should go in a shared package:

```
lib/temporal-types/
├── package.json       # { "name": "@harness/temporal-types" }
├── workflows.ts       # Workflow input/output types
├── activities.ts      # Activity input/output types
└── signals.ts         # Signal/query type definitions
```

Both pi extensions and the temporal-worker import from `@harness/temporal-types`.

---

### Correction 10: XTDB Schema Migration [GPT]

Adding `temporal_workflow_id` to existing XTDB tables requires a migration.

XTDB v2 uses schema-on-write — no ALTER TABLE needed. Simply start writing the new field
and it becomes available. Existing rows will have `NULL` for `temporal_workflow_id`.

However, for queries that join on this field, add an index:

```sql
-- Run via psql against XTDB primary (port 5433)
-- XTDB v2 indexes are created implicitly on schema registration
-- Just ensure the field is declared in the schema seed:

-- In scripts/seed-schema.ts, add to relevant table definitions:
ALTER TABLE delegations ADD COLUMN temporal_workflow_id TEXT;
ALTER TABLE workflow_runs ADD COLUMN temporal_workflow_id TEXT;
ALTER TABLE workflow_step_runs ADD COLUMN temporal_workflow_id TEXT;
ALTER TABLE ci_runs ADD COLUMN temporal_workflow_id TEXT;
```

---

### Correction 11: CI Hook Environment [GPT]

The current Soft Serve post-receive hook is a bash script using `wget`. The proposal assumed
Node.js is available in the hook environment, which isn't guaranteed.

**Solution: Keep the hook as bash, just change the target**

Instead of writing a JSON file to the queue directory, the bash hook POSTs to a new HTTP
endpoint on the temporal-worker (or a lightweight trigger service):

```bash
#!/bin/bash
# hooks/post-receive — still bash, no Node.js needed

while read oldrev newrev refname; do
  branch=$(echo "$refname" | sed 's|refs/heads/||')
  repo=$(basename "$PWD" .git)

  # POST to Temporal trigger endpoint instead of writing queue file
  curl -s -X POST "http://temporal-trigger:3340/ci/start" \
    -H "Content-Type: application/json" \
    -d "{\"repo\": \"$repo\", \"commitSha\": \"$newrev\", \"branch\": \"$branch\"}"
done
```

The trigger endpoint is a tiny Hono server in the temporal-worker that starts the Temporal
workflow:

```typescript
// temporal-worker/src/trigger-server.ts
import { Hono } from "hono";
import { Client } from "@temporalio/client";

const app = new Hono();
const client = new Client({ /* connection */ });

app.post("/ci/start", async (c) => {
  const { repo, commitSha, branch } = await c.req.json();
  await client.workflow.start("ciPipeline", {
    workflowId: `ci-${repo}-${commitSha.slice(0, 8)}`,
    taskQueue: "ci-pipeline",
    args: [{ repoPath: `/repos/${repo}`, commitSha, branch }],
  });
  return c.json({ status: "started" });
});

export { app };
```

---

### Correction 12: OTEL Bootstrap in Pi Process [GPT]

Multiple extensions (orchestrator, agent-spawner, workflow-engine) run in the *same* pi
process. If each initializes its own OTEL SDK, you get duplicate exporters and corrupted
traces.

**Solution: Single OTEL bootstrap as a dedicated extension**

Create a new extension that initializes OTEL once for the entire pi process:

```typescript
// otel-bootstrap/index.ts — loads FIRST (alphabetical ordering: "aa-otel-bootstrap")
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";

let sdk: NodeSDK | null = null;

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async () => {
    if (sdk) return; // already initialized

    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (!endpoint) return; // OTEL not configured, skip

    sdk = new NodeSDK({
      resource: new Resource({
        "service.name": "harness-pi-extension",
        "pi.session": "unknown", // updated below
      }),
      traceExporter: new OTLPTraceExporter({ url: endpoint }),
    });

    sdk.start();
  });

  pi.on("session_shutdown", async () => {
    if (sdk) {
      await sdk.shutdown();
      sdk = null;
    }
  });
}
```

All other extensions use `@opentelemetry/api` (which is stateless — it reads from the
global tracer provider that the bootstrap extension registered). They don't need their own
SDK initialization.

---

### Correction 13: Docker Compose Is Additive, Not Replacement [GPT]

The proposal's docker-compose snippet appeared to *replace* the existing file. It should be
additive. The existing services (xtdb-primary, xtdb-replica, redpanda, garage, keycloak,
caddy, soft-serve, qlever, harness-ui, etc.) all stay. The new services get added.

**Recommendation:** Use a `docker-compose.override.yml` or a separate
`docker-compose.temporal.yml` that extends the base:

```bash
# Start everything:
docker compose -f docker-compose.yml -f docker-compose.temporal.yml up -d
```

Or add the Temporal + OTEL services directly to the existing `docker-compose.yml` under a
clear section comment. Either way, no existing services are removed or modified.

**Caddy routing addition** (for Temporal UI and Grafana):

```
# In Caddyfile, add:
:8233 {
    reverse_proxy temporal-ui:8080
}

:3001 {
    reverse_proxy grafana:3000
}
```

---

### Correction 14: Testing Strategy [GPT]

The original proposal had no testing strategy.

**Temporal-specific testing approach:**

1. **Temporal Test Server** — The `@temporalio/testing` package provides an in-process
   Temporal server for unit tests. No Docker needed:

```typescript
// temporal-worker/test/workflows/agent-delegation.test.ts
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { agentDelegation } from "../../src/workflows/agent-delegation";

describe("agentDelegation workflow", () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createLocal();
  });

  afterAll(async () => {
    await env.teardown();
  });

  it("retries on agent failure", async () => {
    let attempts = 0;
    const worker = await env.createWorker({
      taskQueue: "test-queue",
      activities: {
        spawnPiAgent: async () => {
          attempts++;
          if (attempts < 3) throw new Error("Agent crashed");
          return { output: "done", exitCode: 0, sessionId: "test-sess" };
        },
        recordToXtdb: async () => {},
      },
    });

    const result = await worker.execute(agentDelegation, {
      args: [{ agentRole: "worker", task: "test", cwd: "/tmp", parentSessionId: "p1" }],
    });

    expect(attempts).toBe(3);
    expect(result.exitCode).toBe(0);
  });

  it("times out activity with no heartbeat", async () => {
    // Use env.time.skipTime() to fast-forward through timeouts
    // without actually waiting
  });
});
```

2. **Activity unit tests** — Test `spawnPiAgent` independently with a mock pi subprocess.

3. **Integration tests** — Use `docker compose -f docker-compose.temporal.yml up` to start
   Temporal and run end-to-end workflow tests against it. These go in the existing
   `scripts/test-contracts.sh` framework.

4. **Extension tests** — Existing handler-tests.ts pattern: mock the Temporal client and
   verify that extensions call the right methods (start, signal, query) at the right hooks.

---

## Summary: What GPT and Gemini Found That We Missed

| Gap | Who Found | Severity | Status |
|-----|-----------|----------|--------|
| Observability baseline understated (42 tables, Pino, etc.) | GPT | Medium | Corrected (Correction 1) |
| Payload encryption missing | Both | Critical | Corrected (Correction 2) |
| Worker concurrency limits missing | Both | Critical | Corrected (Correction 3) |
| Hot path query timeout in before_agent_start | GPT | High | Corrected (Correction 4) |
| Child process trace correlation broken | Both | High | Corrected (Correction 5) |
| Dangling workflow references | Gemini | Medium | Corrected (Correction 6) |
| Process group termination for zombie prevention | Gemini | Medium | Corrected (Correction 7) |
| Fallback reconciliation undefined | Both | High | Corrected (Correction 8) |
| Dependency placement too coarse | GPT | Medium | Corrected (Correction 9) |
| XTDB schema migration unspecified | GPT | Medium | Corrected (Correction 10) |
| CI hook assumes Node.js environment | GPT | Medium | Corrected (Correction 11) |
| OTEL bootstrap duplication in shared process | GPT | Medium | Corrected (Correction 12) |
| Docker compose replacement vs additive | GPT | Medium | Corrected (Correction 13) |
| No testing strategy | GPT | High | Corrected (Correction 14) |

**What neither review challenged:**
- The split-brain architecture itself (extensions as clients, not replacements)
- The dual-mode fallback design
- The fresh-session retry semantics
- The JSON-LD workflow loading staying in pi
- The three-layer observability model (XTDB + Temporal + OTEL)
- The phased migration approach

These are sound and validated by both external reviews.
