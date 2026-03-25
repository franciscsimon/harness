/**
 * Workflow barrel — re-exports all workflows.
 * Workflows run in the Temporal deterministic sandbox.
 */

// Phase 1C: CI pipeline workflow
export { ciPipeline } from "./ci-pipeline.js";

// Phase 3A: Agent delegation workflow
// export { agentDelegation } from "./agent-delegation.js";

// Phase 3B: Agent workflow (multi-step)
// export { agentWorkflow } from "./agent-workflow.js";

// Phase 4: Orchestration workflow
// export { orchestrationWorkflow } from "./orchestration.js";
