/**
 * Workflow: Orchestration — parent workflow with child workflow fan-out.
 * Started by /orchestrate plan. Each task runs as a child agentDelegation workflow.
 */
import {
  defineSignal, defineQuery, setHandler,
  executeChild, condition, proxyActivities,
} from "@temporalio/workflow";
import type { OrchestrationStatus, OrchestrationTaskStatus } from "../shared/types.js";

const { recordToXtdb } = proxyActivities<
  typeof import("../activities/xtdb-persistence.js")
>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 5 },
});

// ── Signals ──
const taskDoneSignal = defineSignal<[number]>("taskDone");
const taskFailedSignal = defineSignal<[number]>("taskFailed");
const abandonSignal = defineSignal("abandon");

// ── Queries ──
const statusQuery = defineQuery<OrchestrationStatus>("status");

export async function orchestrationWorkflow(input: {
  tasks: string[];
  cwd: string;
  sessionId: string;
  parallel?: boolean;
}): Promise<{ tasks: OrchestrationTaskStatus[]; abandoned: boolean }> {
  const { tasks: taskDescriptions, cwd, sessionId } = input;

  let abandoned = false;
  const tasks: OrchestrationTaskStatus[] = taskDescriptions.map(desc => ({
    description: desc,
    status: "pending",
  }));

  // ── Signal handlers ──
  setHandler(abandonSignal, () => { abandoned = true; });
  setHandler(taskDoneSignal, (idx: number) => {
    if (tasks[idx]) tasks[idx].status = "done";
  });
  setHandler(taskFailedSignal, (idx: number) => {
    if (tasks[idx]) tasks[idx].status = "failed";
  });

  // ── Query handler ──
  setHandler(statusQuery, (): OrchestrationStatus => ({
    workflowName: "orchestration",
    completedSteps: tasks.filter(t => t.status === "done").length,
    totalSteps: tasks.length,
    tasks,
  }));

  if (input.parallel) {
    // ── Parallel: fan-out all tasks as child workflows ──
    const childPromises = tasks.map(async (task, idx) => {
      if (abandoned) return;
      task.status = "active";
      const childWorkflowId = `orch-child-${idx}-${Date.now()}`;
      task.workflowId = childWorkflowId;

      try {
        const result = await executeChild("agentDelegation", {
          workflowId: childWorkflowId,
          taskQueue: "agent-execution",
          args: [{
            agentRole: "worker",
            task: task.description,
            cwd,
            parentSessionId: sessionId,
          }],
        });
        task.status = "done";
        task.output = result.output?.slice(0, 2000);
      } catch (err: any) {
        task.status = "failed";
        task.output = err.message;
      }
    });

    await Promise.allSettled(childPromises);
  } else {
    // ── Sequential: run tasks one at a time ──
    for (let i = 0; i < tasks.length; i++) {
      if (abandoned) break;
      const task = tasks[i];
      task.status = "active";

      // Wait for signal or start child workflow
      const childWorkflowId = `orch-child-${i}-${Date.now()}`;
      task.workflowId = childWorkflowId;

      try {
        const result = await executeChild("agentDelegation", {
          workflowId: childWorkflowId,
          taskQueue: "agent-execution",
          args: [{
            agentRole: "worker",
            task: task.description,
            cwd,
            parentSessionId: sessionId,
          }],
        });
        task.status = "done";
        task.output = result.output?.slice(0, 2000);
      } catch (err: any) {
        task.status = "failed";
        task.output = err.message;
        // Continue to next task on failure (orchestration doesn't stop)
      }
    }
  }

  // Record orchestration completion
  await recordToXtdb({
    table: "orchestration_runs",
    data: {
      task_count: tasks.length,
      completed: tasks.filter(t => t.status === "done").length,
      failed: tasks.filter(t => t.status === "failed").length,
      abandoned,
      session_id: sessionId,
    },
  }).catch(() => {});

  return { tasks, abandoned };
}
