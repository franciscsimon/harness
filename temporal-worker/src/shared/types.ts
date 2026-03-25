/** Shared types used across workflows, activities, and the pi extensions. */

// ── Workflow Step (from JSON-LD workflow definitions) ────────────

export interface WorkflowStep {
  position: number;
  name: string;
  actionType: "agent" | "human" | "automated";
  agentRole: string;
  promptTemplate?: string;
  transitionMode: "auto" | "user";
  timeoutMs?: number;
}

export interface StepResult {
  status: "done" | "failed" | "skipped" | "timeout";
  output: string;
}

export interface StepInfo {
  workflowName: string;
  task: string;
  position: number;
  name: string;
  actionType: string;
  agentRole: string;
  promptTemplate?: string;
  stepsCompleted: number;
  totalSteps: number;
}

// ── Agent Delegation ────────────────────────────────────────────

export interface AgentDelegationInput {
  agentRole: string;
  task: string;
  cwd: string;
  parentSessionId: string;
}

export interface AgentDelegationResult {
  output: string;
  exitCode: number;
  sessionId: string;
}

// ── CI Pipeline ─────────────────────────────────────────────────

export interface CIPipelineInput {
  repoPath: string;
  commitSha: string;
  branch: string;
}

export interface CIStepResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  exitCode: number;
  output: string;
  durationMs: number;
}

export interface CIPipelineResult {
  repoPath: string;
  commitSha: string;
  branch: string;
  status: "passed" | "failed";
  steps: CIStepResult[];
  totalDurationMs: number;
}

// ── Orchestration ───────────────────────────────────────────────

export interface OrchestrationTaskStatus {
  description: string;
  status: "pending" | "active" | "done" | "failed";
  workflowId?: string;
  output?: string;
}

export interface OrchestrationStatus {
  workflowName: string;
  completedSteps: number;
  totalSteps: number;
  tasks: OrchestrationTaskStatus[];
}

// ── Workflow Run Status ─────────────────────────────────────────

export interface WorkflowStatus {
  workflowName: string;
  task: string;
  currentStep: number;
  totalSteps: number;
  steps: WorkflowStep[];
  stepResults: (StepResult | null)[];
  abandoned: boolean;
}

// ── XTDB Persistence ────────────────────────────────────────────

export interface XtdbRecord {
  table: string;
  data: Record<string, unknown>;
}
