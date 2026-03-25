/**
 * Workflow: Fully automated multi-agent workflow.
 *
 * Each step spawns a REAL pi agent (via agentDelegation child workflow).
 * The output of each step feeds into the next step's task.
 * No human intervention needed — Temporal orchestrates everything.
 *
 * Example: "feature" workflow
 *   Step 1: planner agent → produces implementation plan
 *   Step 2: architect agent → produces architecture (using plan from step 1)
 *   Step 3: worker agent → implements code (using architecture from step 2)
 *   Step 4: tester agent → writes tests (using code from step 3)
 *   Step 5: reviewer agent → reviews (using code + tests from steps 3-4)
 *   Step 6: committer agent → commits (using reviewed code from step 5)
 */
import {
  defineSignal, defineQuery, setHandler,
  executeChild, proxyActivities, condition,
} from "@temporalio/workflow";
import type { WorkflowStep, StepResult, StepInfo, WorkflowStatus } from "../shared/types.js";

const { recordToXtdb } = proxyActivities<
  typeof import("../activities/xtdb-persistence.js")
>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 5 },
});

// ── Signals ──
const cancelSignal = defineSignal("cancel");
const skipSignal = defineSignal<[number]>("skip");

// ── Queries ──
const currentStepQuery = defineQuery<StepInfo | null>("currentStep");
const fullStatusQuery = defineQuery<WorkflowStatus>("fullStatus");

export interface AutomatedWorkflowInput {
  workflowName: string;
  task: string;
  steps: WorkflowStep[];
  cwd: string;
  sessionId: string;
}

export async function automatedWorkflow(input: AutomatedWorkflowInput) {
  const { workflowName, task, steps, cwd, sessionId } = input;

  let currentStepIdx = 0;
  let cancelled = false;
  const stepResults: (StepResult | null)[] = new Array(steps.length).fill(null);

  // ── Signal handlers ──
  setHandler(cancelSignal, () => { cancelled = true; });
  setHandler(skipSignal, (pos: number) => {
    stepResults[pos - 1] = { status: "skipped", output: "" };
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
      stepsCompleted: stepResults.filter(r => r?.status === "done").length,
      totalSteps: steps.length,
    };
  });

  setHandler(fullStatusQuery, (): WorkflowStatus => ({
    workflowName, task,
    currentStep: currentStepIdx,
    totalSteps: steps.length,
    steps, stepResults, abandoned: cancelled,
  }));

  // ── Build the chain: each step's output feeds into the next ──
  let previousOutput = "";
  const allOutputs: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    if (cancelled) break;
    const step = steps[i];
    currentStepIdx = i;

    if (stepResults[i]?.status === "skipped") continue;

    // Build task for this step — include context from previous steps
    const stepTask = buildStepTask(step, task, previousOutput, allOutputs);
    const childWorkflowId = `${workflowName}-step${step.position}-${Date.now()}`;

    try {
      // Spawn a real pi agent via child workflow
      const result = await executeChild("agentDelegation", {
        workflowId: childWorkflowId,
        taskQueue: "agent-execution",
        args: [{
          agentRole: step.agentRole,
          task: stepTask,
          cwd,
          parentSessionId: sessionId,
        }],
      });

      previousOutput = result.output ?? "";
      allOutputs.push(`[Step ${step.position}: ${step.name}]\n${previousOutput}`);
      stepResults[i] = {
        status: result.exitCode === 0 ? "done" : "failed",
        output: previousOutput.slice(0, 5000),
      };

      // Record step to XTDB
      await recordToXtdb({
        table: "workflow_steps",
        data: {
          workflow_name: workflowName,
          step_name: step.name,
          agent_role: step.agentRole,
          position: step.position,
          status: stepResults[i]!.status,
          output: previousOutput.slice(0, 2000),
          session_id: sessionId,
          child_workflow_id: childWorkflowId,
        },
      }).catch(() => {});

      // Stop on failure
      if (result.exitCode !== 0) {
        break;
      }

    } catch (err: any) {
      stepResults[i] = { status: "failed", output: err.message };
      break;
    }
  }

  // Record workflow completion
  const completedCount = stepResults.filter(r => r?.status === "done").length;
  const failedCount = stepResults.filter(r => r?.status === "failed").length;

  await recordToXtdb({
    table: "workflow_runs",
    data: {
      workflow_name: workflowName,
      task,
      status: cancelled ? "cancelled" : failedCount > 0 ? "failed" : "completed",
      total_steps: steps.length,
      completed_steps: completedCount,
      failed_steps: failedCount,
      session_id: sessionId,
    },
  }).catch(() => {});

  return {
    workflowName,
    task,
    status: cancelled ? "cancelled" : failedCount > 0 ? "failed" : "completed",
    completedSteps: completedCount,
    totalSteps: steps.length,
    stepResults,
  };
}

/**
 * Build the task prompt for a step, chaining context from previous outputs.
 */
function buildStepTask(
  step: WorkflowStep,
  originalTask: string,
  previousOutput: string,
  allOutputs: string[],
): string {
  let prompt = step.promptTemplate
    ? step.promptTemplate
        .replace("{task}", originalTask)
        .replace("{cwd}", "the current working directory")
    : `${step.name}: ${originalTask}`;

  // Add context from previous steps
  if (previousOutput) {
    prompt += `\n\n--- Previous step output ---\n${previousOutput.slice(0, 3000)}`;
  }

  // For later steps, include all prior context
  if (allOutputs.length > 1) {
    prompt += `\n\n--- Full workflow context ---\n${allOutputs.slice(-3).join("\n\n").slice(0, 5000)}`;
  }

  return prompt;
}
