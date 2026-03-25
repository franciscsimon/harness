/**
 * Activity barrel — re-exports all activities for worker registration.
 * Activities run in the worker process (NOT in the Temporal workflow sandbox).
 */

// Phase 1C: CI pipeline activities
export { executeDockerStep } from "./docker-execution.js";
export { recordToXtdb, recordCIRunToXtdb } from "./xtdb-persistence.js";

// Phase 3A: Agent spawner activities
export { spawnPiAgent } from "./spawn-agent.js";

// Phase 3B: Workflow loader
// export { loadWorkflowDefinition } from "./workflow-loader.js";
