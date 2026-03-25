/**
 * Workflow: Single agent delegation with retry.
 * Started by the pi `delegate` tool via Temporal client.
 */
import { proxyActivities, ApplicationFailure } from "@temporalio/workflow";
import type { AgentDelegationInput, AgentDelegationResult } from "../shared/types.js";

const { spawnPiAgent } = proxyActivities<
  typeof import("../activities/spawn-agent.js")
>({
  startToCloseTimeout: "15 minutes",
  heartbeatTimeout: "90 seconds",
  retry: {
    initialInterval: "10s",
    backoffCoefficient: 2,
    maximumInterval: "3m",
    maximumAttempts: 3,
    nonRetryableErrorTypes: ["AgentRoleNotFound"],
  },
});

const { recordToXtdb } = proxyActivities<
  typeof import("../activities/xtdb-persistence.js")
>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 5 },
});

export async function agentDelegation(input: AgentDelegationInput): Promise<AgentDelegationResult> {
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
      nonRetryable: false,
    });
  }

  return result;
}
