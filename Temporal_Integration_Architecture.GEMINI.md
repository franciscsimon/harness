# Temporal Integration Architecture - Review & Gap Analysis

## 1. Executive Summary
The revised Temporal Integration Architecture for the Harness provides a well-thought-out, split-brain model. It acknowledges the strict in-process requirements of pi extensions (such as system prompt injection and tool execution boundaries) while delegating long-running, durable orchestration (retries, timeouts, distributed state) to Temporal. The addition of OpenTelemetry (OTEL) for observability greatly enhances the legibility of agentic actions.

## 2. Strengths & Good Architectural Decisions
- **Respecting Pi Boundaries:** Moving from a "replace pi" to a "pi as Temporal client" model is correct. Retaining `appendEntry` for native session restoration and `before_agent_start` for prompt injection ensures the pi agent's runtime is undisturbed.
- **Observability Triad:** Combining XTDB event logging, Temporal Workflow History, and OTEL Distributed Tracing provides a robust auditing and debugging environment.
- **Idempotency & Clean Slates:** Deciding that retries should spawn a *fresh* pi session rather than attempting to resume a corrupted in-memory state is an excellent design choice for LLM agents.
- **Graceful Degradation:** The dual-mode architecture (falling back to direct spawn without Temporal) ensures high availability during infrastructure outages.

## 3. Gap Analysis & Risks Identified

Despite the strong foundation, several critical gaps and edge cases were identified in the proposed architecture:

### 3.1. Resource Constraints & Worker Scaling
**Gap:** The architecture proposes a single `temporal-worker` Docker container which spins up `pi --mode json` as subprocesses (`spawnPiAgent`). Node.js and LLM orchestration processes can be CPU and memory-intensive. 
**Impact:** If a workflow fans out to 10 agents, the single worker container will spawn 10 concurrent `pi` processes. This will rapidly exhaust container resources (CPU/RAM/File Descriptors), leading to OOM kills and cascading activity timeouts.
**Missing:** A scaling strategy for the `temporal-worker` (e.g., Kubernetes, swarm, or multiple compose replicas) and concurrency limits defined on the Temporal Worker configuration.

### 3.2. Data Privacy & Temporal Payload Encryption
**Gap:** Temporal records all workflow arguments, activity inputs, and outputs in its persistence layer (accessible via the Temporal UI and API). The `delegate` tool passes `task` strings and agent summaries which likely contain sensitive code, API keys, or proprietary logic.
**Impact:** Sensitive user data and proprietary codebase snippets will be stored in plaintext in the Temporal PostgreSQL database and visible to anyone with access to the Temporal UI.
**Missing:** Implementation of a Temporal **Data Converter** (Payload Codec) to encrypt workflow/activity inputs and outputs before they leave the pi extension, ensuring Temporal Server only stores encrypted blobs.

### 3.3. Trace Correlation Missing Context in Sub-Agents
**Gap:** Section "OTEL ↔ XTDB Correlation" mentions linking XTDB events to Temporal via `temporal_workflow_id`. However, the architecture does not show how the spawned sub-agent (`pi --mode json`) knows the `workflowId` to inject it into its own internal XTDB events. 
**Impact:** The spawned pi agent will log its own XTDB events, but those events will be orphaned from the parent Temporal Workflow ID. The only linkage is the parent inferring the sub-session ID by parsing stdout, which is fragile.
**Missing:** The `spawnPiAgent` activity should explicitly pass the `workflowId` and OTEL trace context to the child pi process, likely via environment variables (e.g., `TEMPORAL_WORKFLOW_ID=... TRACEPARENT=... pi --mode json`).

### 3.4. State Desync & Dangling References
**Gap:** The pi extension stores the `workflowId` in `appendEntry`. 
**Impact:** If the Temporal Server's database is wiped, data retention limits are reached, or a workflow is manually terminated on the server, the pi session will still load the `workflowId` from `appendEntry` and attempt to query Temporal for state, potentially throwing 'NotFound' errors or deadlocking the session.
**Missing:** Explicit error handling in the extensions' `session_start` to catch missing workflows and provide a recovery mechanism (e.g., prompting the user: "Workflow X was lost on the server, marking as abandoned locally").

### 3.5. Lifecycle & Zombie Processes
**Gap:** The `spawnPiAgent` handles Temporal cancellation by sending `SIGTERM` to the child `pi` process.
**Impact:** While `pi` is stopped, it may have spawned its own subprocesses (e.g., compilers, docker containers via tools, servers). A simple `SIGTERM` to the Node process might leave orphaned zombie processes or running Docker containers on the host.
**Missing:** Process group termination (e.g., `kill(-pid, 'SIGTERM')` on Unix) or explicit cleanup hooks in the `ci-runner`/agent sub-processes to tear down nested resources reliably upon cancellation.

### 3.6. Fallback Re-synchronization
**Gap:** The "Fallback Strategy" mentions that if Temporal is down, extensions fall back to local mode. 
**Impact:** If a workflow was *already running* in Temporal and the server goes offline, the local session continues in blind mode. When Temporal comes back online, the workflow state might mismatch the pi session's expected state.
**Missing:** A reconciliation mechanism. How do piecemeal local updates sync back to Temporal when connection is restored, or does the system completely partition local vs. Temporal tasks?

## 4. Recommendations
1. **Implement Payload Codecs:** Before shipping Temporal to production, add a Custom Data Converter in both the pi extension client and the Temporal worker to encrypt sensitive task prompts and agent outputs.
2. **Propagate Context deeply:** Pass `TEMPORAL_WORKFLOW_ID` and `TRACEPARENT` as environment variables into the `pi --mode json` subprocess in `spawnPiAgent`. Update the pi core to tag its XTDB events with these variables if present.
3. **Set Worker Concurrency Limits:** Explicitly define `maxConcurrentActivityTaskExecutions` on the Temporal Worker to prevent a single Docker container from spawning too many `pi` subprocesses simultaneously.
4. **Use Process Group Kills:** Ensure activity cancellation kills the entire process group spawned by `spawn()`, so nested child processes (compilers/linters/docker commands) are properly terminating.
