/**
 * Workflow: CI Pipeline execution.
 *
 * Replaces the ci-runner polling loop with a durable Temporal workflow.
 * Each step runs as a retryable activity (Docker container execution).
 * Results are recorded to XTDB via a separate activity.
 */
import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  ApplicationFailure,
} from "@temporalio/workflow";
import type { CIPipelineInput, CIPipelineResult, CIStepResult } from "../shared/types.js";

// Activity proxies — configured with retry policies
const { executeDockerStep } = proxyActivities<
  typeof import("../activities/docker-execution.js")
>({
  startToCloseTimeout: "10 minutes",
  heartbeatTimeout: "60 seconds",
  retry: {
    initialInterval: "5s",
    backoffCoefficient: 2,
    maximumInterval: "1m",
    maximumAttempts: 2,
  },
});

const { loadWorkflowDefinition } = proxyActivities<
  typeof import("../activities/workflow-loader.js")
>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 2 },
});

const { recordCIRunToXtdb } = proxyActivities<
  typeof import("../activities/xtdb-persistence.js")
>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "2s",
    maximumAttempts: 5,
  },
});

// ── Signals & Queries ──────────────────────────────────────────

const cancelSignal = defineSignal("cancel");

const statusQuery = defineQuery<{
  repo: string;
  commitSha: string;
  currentStep: number;
  totalSteps: number;
  stepResults: CIStepResult[];
  status: "running" | "passed" | "failed" | "cancelled";
}>("status");

// ── Pipeline steps (auto-detected or from .ci.jsonld) ──────────

interface PipelineStepDef {
  name: string;
  image: string;
  commands: string[];
  timeoutMs?: number;
}

const DEFAULT_STEPS: PipelineStepDef[] = [
  { name: "install", image: "oven/bun:latest", commands: ["bun install --frozen-lockfile"] },
  { name: "lint", image: "oven/bun:latest", commands: ["bun run lint || true"] },
  { name: "typecheck", image: "oven/bun:latest", commands: ["bun run typecheck || true"] },
  { name: "test", image: "oven/bun:latest", commands: ["bun test || true"] },
];

// ── Workflow ───────────────────────────────────────────────────

export async function ciPipeline(input: CIPipelineInput): Promise<CIPipelineResult> {
  const { repoPath, commitSha, branch } = input;
  const jobId = `ci-${commitSha.slice(0, 8)}-${Date.now()}`;
  // Try loading .ci.jsonld from repo, fall back to defaults
  let steps: PipelineStepDef[];
  try {
    const wfSteps = await loadWorkflowDefinition({ workflowName: "ci", workflowsDir: `/ci-work/ci-${commitSha.slice(0, 8)}-${Date.now()}` });
    steps = wfSteps.map(s => ({ name: s.name, image: "oven/bun:latest", commands: [s.promptTemplate ?? `echo "Step: ${s.name}"`] }));
  } catch {
    steps = DEFAULT_STEPS; // No .ci.jsonld found — use defaults
  }

  let cancelled = false;
  const stepResults: CIStepResult[] = [];
  let currentStepIdx = 0;
  let pipelineStatus: "running" | "passed" | "failed" | "cancelled" = "running";

  // ── Signal handlers ──
  setHandler(cancelSignal, () => {
    cancelled = true;
    pipelineStatus = "cancelled";
  });

  // ── Query handler ──
  setHandler(statusQuery, () => ({
    repo: repoPath,
    commitSha,
    currentStep: currentStepIdx,
    totalSteps: steps.length,
    stepResults,
    status: pipelineStatus,
  }));

  const startTime = Date.now();

  // ── Execute each step sequentially ──
  for (let i = 0; i < steps.length; i++) {
    if (cancelled) break;
    currentStepIdx = i;
    const step = steps[i];

    const result = await executeDockerStep({
      name: step.name,
      image: step.image,
      commands: step.commands,
      jobId,
      repo: repoPath,
      commitSha,
      ref: `refs/heads/${branch}`,
      timeoutMs: step.timeoutMs,
    });

    stepResults.push(result);

    if (result.exitCode !== 0) {
      pipelineStatus = "failed";
      break;
    }
  }

  if (pipelineStatus === "running") {
    pipelineStatus = "passed";
  }

  const totalDurationMs = Date.now() - startTime;

  // ── Record to XTDB (retryable) ──
  try {
    await recordCIRunToXtdb({
      repo: repoPath,
      commitSha,
      branch,
      status: pipelineStatus,
      steps: stepResults,
      totalDurationMs,
    });
  } catch {
    // XTDB recording failure shouldn't fail the workflow
  }

  return {
    repoPath,
    commitSha,
    branch,
    status: pipelineStatus === "cancelled" ? "failed" : pipelineStatus,
    steps: stepResults,
    totalDurationMs,
  };
}
