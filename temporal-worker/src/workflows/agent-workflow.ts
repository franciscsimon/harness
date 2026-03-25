/**
 * Workflow: Multi-step agent workflow with signals, queries, and human-in-the-loop.
 * Driven by JSON-LD workflow definitions. The pi extension signals step completion
 * from agent_end, and queries current step info for before_agent_start injection.
 */
import {
  defineSignal, defineQuery, setHandler,
  condition, proxyActivities,
} from "@temporalio/workflow";
import type { WorkflowStep, StepResult, StepInfo, WorkflowStatus } from "../shared/types.js";

// ── Activity proxies ──
const { recordToXtdb } = proxyActivities<
  typeof import("../activities/xtdb-persistence.js")
>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 5 },
});

// ── Signals ──
const advanceSignal = defineSignal("advance");
const skipSignal = defineSignal<[number]>("skip");
const abandonSignal = defineSignal("abandon");
const stepCompletedSignal = defineSignal<[{ stepPosition: number; output: string }]>("stepCompleted");

// ── Queries ──
const currentStepQuery = defineQuery<StepInfo | null>("currentStep");
const fullStatusQuery = defineQuery<WorkflowStatus>("fullStatus");

// ── Workflow ──
export async function agentWorkflow(input: {
  workflowName: string;
  task: string;
  steps: WorkflowStep[];
  cwd: string;
  sessionId: string;
}): Promise<{ stepResults: (StepResult | null)[]; abandoned: boolean }> {
  const { workflowName, task, steps, cwd, sessionId } = input;

  let currentStepIdx = 0;
  let abandoned = false;
  let stepCompleted = false;
  let lastStepOutput = "";
  const stepResults: (StepResult | null)[] = new Array(steps.length).fill(null);

  // ── Signal handlers ──
  setHandler(abandonSignal, () => { abandoned = true; });
  setHandler(skipSignal, (pos: number) => {
    stepResults[pos - 1] = { status: "skipped", output: "" };
  });
  setHandler(advanceSignal, () => { stepCompleted = true; });
  setHandler(stepCompletedSignal, (info: { stepPosition: number; output: string }) => {
    stepResults[info.stepPosition - 1] = { status: "done", output: info.output };
    stepCompleted = true;
    lastStepOutput = info.output;
  });

  // ── Query handlers ──
  setHandler(currentStepQuery, (): StepInfo | null => {
    if (currentStepIdx >= steps.length) return null;
    const step = steps[currentStepIdx];
    return {
      workflowName, task,
      position: step.position,
      name: step.name,
      actionType: step.actionType,
      agentRole: step.agentRole,
      promptTemplate: step.promptTemplate,
      stepsCompleted: stepResults.filter(r => r?.status === "done").length,
      totalSteps: steps.length,
    };
  });

  setHandler(fullStatusQuery, (): WorkflowStatus => ({
    workflowName, task,
    currentStep: currentStepIdx,
    totalSteps: steps.length,
    steps, stepResults, abandoned,
  }));

  // ── Main step loop ──
  for (let i = 0; i < steps.length; i++) {
    if (abandoned) break;
    currentStepIdx = i;
    const step = steps[i];

    // Skip if already marked
    if (stepResults[i]?.status === "skipped") continue;

    // Wait for step completion (signaled by pi extension's agent_end hook)
    stepCompleted = false;
    const timeoutStr = step.timeoutMs ? `${step.timeoutMs} milliseconds` : "30 minutes";

    const completed = await condition(
      () => stepCompleted || abandoned,
      timeoutStr,
    );

    if (!completed && !abandoned) {
      stepResults[i] = { status: "timeout", output: `Step timed out after ${timeoutStr}` };
      await recordToXtdb({
        table: "workflow_steps",
        data: {
          workflow_name: workflowName, step_name: step.name,
          agent_role: step.agentRole, position: step.position,
          status: "timeout", session_id: sessionId,
        },
      }).catch(() => {});
      continue;
    }

    if (abandoned) break;

    // Record step completion
    if (stepResults[i]?.status === "done") {
      await recordToXtdb({
        table: "workflow_steps",
        data: {
          workflow_name: workflowName, step_name: step.name,
          agent_role: step.agentRole, position: step.position,
          status: "done", output: lastStepOutput.slice(0, 5000),
          session_id: sessionId,
        },
      }).catch(() => {});
    }
  }

  // Record workflow completion
  await recordToXtdb({
    table: "workflow_runs",
    data: {
      workflow_name: workflowName, task,
      status: abandoned ? "abandoned" : "completed",
      total_steps: steps.length,
      completed_steps: stepResults.filter(r => r?.status === "done").length,
      session_id: sessionId,
    },
  }).catch(() => {});

  return { stepResults, abandoned };
}
