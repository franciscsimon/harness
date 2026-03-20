# XTDB Schema Reference

All tables in the harness XTDB database. XTDB is schema-on-write — columns are created on first INSERT. Types map to postgres wire protocol OIDs: `text` (25), `bigint` (20), `boolean` (16).

> **Note:** Every table uses `_id text` as the primary key (XTDB requirement).

---

## Core Event Tables

### `events`
Raw pi agent events. One row per event emitted by the pi harness.

**Source:** `xtdb-event-logger/endpoints/xtdb.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Unique event ID |
| `environment` | text | Environment name (e.g. "pi.dev") |
| `event_name` | text | Event type (e.g. "tool_execution_start", "turn_end") |
| `category` | text | Event category (e.g. "tool", "turn", "context") |
| `can_intercept` | boolean | Whether extensions can intercept this event |
| `schema_version` | bigint | Event schema version number |
| `ts` | bigint | Timestamp (epoch ms) |
| `seq` | bigint | Sequence number within session |
| `session_id` | text | Agent session ID |
| `cwd` | text | Working directory |
| `switch_reason` | text | Branch switch reason |
| `switch_target` | text | Branch switch target |
| `switch_previous` | text | Previous branch |
| `fork_entry_id` | text | Fork entry ID |
| `fork_previous` | text | Previous fork |
| `tree_new_leaf` | text | New tree leaf |
| `tree_old_leaf` | text | Old tree leaf |
| `tree_from_ext` | boolean | Whether tree change from extension |
| `event_cwd` | text | Event-specific working directory |
| `compact_tokens` | bigint | Token count at compaction |
| `compact_from_ext` | boolean | Whether compaction triggered by extension |
| `prompt_text` | text | User prompt text |
| `agent_end_msg_count` | bigint | Message count at agent end |
| `turn_index` | bigint | Turn number within session |
| `turn_timestamp` | bigint | Turn timestamp |
| `turn_end_tool_count` | bigint | Tool calls in this turn |
| `message_role` | text | Message role (user/assistant/tool) |
| `stream_delta_type` | text | Streaming delta type |
| `stream_delta_len` | bigint | Streaming delta length |
| `tool_name` | text | Tool name (e.g. "Bash", "Edit", "Read") |
| `tool_call_id` | text | Unique tool call ID |
| `is_error` | boolean | Whether tool execution errored |
| `context_msg_count` | bigint | Context message count |
| `provider_payload_bytes` | bigint | Provider request size in bytes |
| `input_text` | text | User input text |
| `input_source` | text | Input source |
| `input_has_images` | boolean | Whether input contains images |
| `bash_command` | text | Bash command executed |
| `bash_exclude` | boolean | Whether bash output excluded |
| `model_provider` | text | LLM provider (e.g. "anthropic") |
| `model_id` | text | Model ID (e.g. "claude-sonnet-4-20250514") |
| `model_source` | text | Model source |
| `prev_model_provider` | text | Previous model provider |
| `prev_model_id` | text | Previous model ID |
| `payload` | text | Generic payload (JSON string) |
| `handler_error` | text | Extension handler error |
| `message_content` | text | Full message content (may be truncated) |
| `stream_delta` | text | Stream delta content |
| `tool_input` | text | Tool input parameters |
| `tool_content` | text | Tool output content |
| `tool_details` | text | Tool execution details |
| `tool_partial_result` | text | Partial tool result |
| `tool_args` | text | Tool arguments JSON |
| `agent_messages` | text | Agent messages JSON (may be truncated) |
| `system_prompt` | text | System prompt (may be truncated) |
| `images` | text | Images data |
| `context_messages` | text | Context messages JSON (may be truncated) |
| `provider_payload` | text | Provider request payload (may be truncated) |
| `turn_message` | text | Turn message content |
| `turn_tool_results` | text | Turn tool results |
| `compact_branch_entries` | text | Compacted branch entries (may be truncated) |
| `jsonld` | text | JSON-LD provenance document |

### `projections`
Pre-computed views derived from events. Different `type` values have different column subsets.

**Source:** `xtdb-projector/index.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Projection ID |
| `type` | text | Projection type: "task_start", "turn", "task_end", "mutations" |
| `task_id` | text | Task/conversation ID |
| `session_id` | text | Session ID |
| `ts` | bigint | Timestamp |
| `prompt` | text | User prompt (task_start) |
| `input_source` | text | Input source (task_start) |
| `context_msg_count` | bigint | Context message count (task_start) |
| `system_prompt_event_id` | text | System prompt event ref (task_start) |
| `input_event_id` | text | Input event ref (task_start) |
| `turn_index` | bigint | Turn number (turn) |
| `thinking_event_ids` | text | Thinking event IDs JSON (turn) |
| `tool_call_event_ids` | text | Tool call event IDs JSON (turn) |
| `tool_result_event_ids` | text | Tool result event IDs JSON (turn) |
| `provider_payload_bytes` | bigint | Request size (turn) |
| `tool_count` | bigint | Number of tool calls (turn) |
| `tools_summary` | text | Tool call summary (turn) |
| `turn_start_event_id` | text | Turn start event ref (turn) |
| `turn_end_event_id` | text | Turn end event ref (turn) |
| `reasoning_trace_ids` | text | Reasoning trace IDs JSON (task_end) |
| `total_turns` | bigint | Total turns in task (task_end) |
| `total_msg_count` | bigint | Total message count (task_end) |
| `agent_end_event_id` | text | Agent end event ref (task_end) |
| `final_message_event_id` | text | Final message event ref (task_end) |
| `output_summary` | text | Output summary (task_end) |
| `mutations` | text | File mutations JSON (mutations) |
| `mutating_tool_count` | bigint | Count of mutating tool calls (mutations) |

---

## Project Management Tables

### `projects`
Registered projects tracked by the harness.

**Source:** `project-registry/index.ts`, `project-lifecycle/index.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Project ID (e.g. "proj:harness") |
| `canonical_id` | text | Canonical project identifier |
| `name` | text | Human-readable project name |
| `identity_type` | text | How project was identified ("git_remote", "cwd", etc.) |
| `git_remote_url` | text | Git remote URL |
| `git_root_path` | text | Local git root path |
| `first_seen_ts` | bigint | First seen timestamp |
| `last_seen_ts` | bigint | Last seen timestamp |
| `session_count` | bigint | Number of sessions for this project |
| `lifecycle_phase` | text | Lifecycle phase: "active", "maintenance", "decommissioned" |
| `config_json` | text | Project configuration JSON |
| `jsonld` | text | JSON-LD provenance document |

### `session_projects`
Maps sessions to projects.

**Source:** `project-registry/index.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Mapping ID |
| `session_id` | text | Agent session ID |
| `project_id` | text | Project ID |
| `canonical_id` | text | Canonical project ID |
| `cwd` | text | Working directory |
| `git_root_path` | text | Git root path |
| `ts` | bigint | Timestamp |
| `is_first_session` | boolean | Whether this is the project's first session |
| `jsonld` | text | JSON-LD provenance document |

### `project_dependencies`
Project dependency tracking.

**Source:** `project-lifecycle/index.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Dependency record ID |
| `project_id` | text | Project ID |
| `name` | text | Dependency name |
| `version` | text | Dependency version |
| `dep_type` | text | Dependency type (e.g. "npm", "pip") |
| `ts` | bigint | Timestamp |
| `jsonld` | text | JSON-LD provenance document |

### `project_tags`
Project tags/labels.

**Source:** `project-lifecycle/index.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Tag record ID |
| `project_id` | text | Project ID |
| `tag` | text | Tag value |
| `ts` | bigint | Timestamp |

### `decommission_records`
Records of project decommissioning.

**Source:** `project-lifecycle/index.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Decommission record ID |
| `project_id` | text | Project ID |
| `reason` | text | Reason for decommissioning |
| `decommissioned_by` | text | Who decommissioned (e.g. "pi-agent") |
| `checklist_json` | text | Decommission checklist JSON |
| `ts` | bigint | Timestamp |
| `jsonld` | text | JSON-LD provenance document |

---

## Decision & Knowledge Tables

### `decisions`
Architectural and implementation decisions logged during sessions.

**Source:** `decision-log/index.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Decision ID |
| `project_id` | text | Project ID |
| `session_id` | text | Session ID |
| `ts` | bigint | Timestamp |
| `task` | text | What the agent was working on |
| `what` | text | What was decided or tried |
| `outcome` | text | "success", "failure", or "deferred" |
| `why` | text | Reasoning behind the decision |
| `files` | text | Related file paths (comma-separated) |
| `alternatives` | text | Alternatives considered |
| `agent` | text | Agent name that made the decision |
| `tags` | text | Categorization tags (comma-separated) |
| `jsonld` | text | JSON-LD provenance document |

### `session_postmortems`
Post-session analysis summaries.

**Source:** `session-postmortem/index.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Postmortem ID |
| `project_id` | text | Project ID |
| `session_id` | text | Session ID |
| `goal` | text | Session goal (from first user prompt) |
| `what_worked` | text | What went well |
| `what_failed` | text | What went wrong |
| `files_changed` | text | Files modified (comma-separated) |
| `error_count` | bigint | Number of errors encountered |
| `turn_count` | bigint | Number of turns in session |
| `ts` | bigint | Timestamp |
| `jsonld` | text | JSON-LD provenance document |

### `delegations`
Agent delegation tracking (parent → child agent spawns).

**Source:** `agent-spawner/index.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Delegation ID |
| `parent_session_id` | text | Parent session ID |
| `child_session_id` | text | Child agent session ID |
| `project_id` | text | Project ID |
| `agent_name` | text | Delegated agent name |
| `task` | text | Task description given to agent |
| `status` | text | Completion status |
| `exit_code` | bigint | Process exit code |
| `ts` | bigint | Timestamp |
| `jsonld` | text | JSON-LD provenance document |

### `file_metrics`
Per-file edit and error counts for sunk-cost detection.

**Source:** `sunk-cost-detector/index.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Metric ID |
| `project_id` | text | Project ID |
| `session_id` | text | Session ID |
| `file_path` | text | Absolute file path |
| `edit_count` | bigint | Number of edits to this file |
| `error_count` | bigint | Number of errors involving this file |
| `ts` | bigint | Timestamp |

---

## Artifact Tables

### `artifacts`
Tracked file artifacts (created/modified files).

**Source:** `artifact-tracker/index.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Artifact ID |
| `project_id` | text | Project ID |
| `session_id` | text | Session ID |
| `path` | text | Absolute file path |
| `content_hash` | text | SHA-256 hash of content |
| `kind` | text | Artifact kind ("code", "config", "doc", etc.) |
| `operation` | text | Tool that created it (e.g. "Write", "Edit") |
| `tool_call_id` | text | Tool call ID that produced it |
| `ts` | bigint | Timestamp |
| `jsonld` | text | JSON-LD provenance document |

### `artifact_versions`
Versioned snapshots of artifact content.

**Source:** `artifact-tracker/versioning.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Version ID |
| `session_id` | text | Session ID |
| `path` | text | Absolute file path |
| `relative_path` | text | Path relative to project root |
| `version` | bigint | Version number (monotonically increasing) |
| `content_hash` | text | SHA-256 hash of content |
| `content` | text | Full file content |
| `size_bytes` | bigint | Content size in bytes |
| `operation` | text | Tool that produced this version |
| `tool_call_id` | text | Tool call ID |
| `ts` | bigint | Timestamp |
| `jsonld` | text | JSON-LD provenance document |

### `artifact_reads`
Tracks when files are read by the agent.

**Source:** `artifact-tracker/index.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Read record ID |
| `session_id` | text | Session ID |
| `path` | text | Absolute file path |
| `tool_call_id` | text | Tool call ID |
| `ts` | bigint | Timestamp |

### `artifact_cleanup`
Tracks artifacts needing cleanup at session end.

**Source:** `artifact-tracker/versioning.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Cleanup record ID |
| `session_id` | text | Session ID |
| `path` | text | Absolute file path |
| `relative_path` | text | Path relative to project root |
| `created_at` | bigint | When the artifact was created |

---

## Workflow & Requirements Tables

### `workflow_runs`
Workflow execution tracking.

**Source:** `workflow-engine/index.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Workflow run ID |
| `project_id` | text | Project ID |
| `session_id` | text | Session ID |
| `workflow_name` | text | Workflow template name |
| `task_description` | text | Task description |
| `status` | text | "running", "completed", "failed" |
| `current_step` | bigint | Current step index |
| `total_steps` | bigint | Total number of steps |
| `ts` | bigint | Timestamp |
| `jsonld` | text | JSON-LD provenance document |

### `workflow_step_runs`
Individual step execution within workflows.

**Source:** `workflow-engine/index.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Step run ID |
| `workflow_run_id` | text | Parent workflow run ID |
| `step_name` | text | Step name |
| `agent_role` | text | Agent role for this step |
| `position` | bigint | Step position (1-indexed) |
| `status` | text | "running", "completed", "failed", "skipped" |
| `ts` | bigint | Timestamp |
| `jsonld` | text | JSON-LD provenance document |

### `requirements`
Project requirements tracking.

**Source:** `requirements-tracker/index.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Requirement ID |
| `project_id` | text | Project ID |
| `title` | text | Requirement title |
| `description` | text | Detailed description |
| `priority` | text | Priority level ("high", "medium", "low") |
| `status` | text | Status ("open", "in_progress", "done", "blocked") |
| `source` | text | Where the requirement came from |
| `linked_decision_id` | text | Linked decision ID |
| `linked_artifact_id` | text | Linked artifact ID |
| `ts` | bigint | Timestamp |
| `jsonld` | text | JSON-LD provenance document |

### `requirement_links`
Links between requirements and other entities.

**Source:** `requirements-tracker/index.ts`, `decision-log/index.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Link ID |
| `requirement_id` | text | Requirement ID |
| `entity_type` | text | Linked entity type ("decision", "artifact", etc.) |
| `entity_id` | text | Linked entity ID |
| `ts` | bigint | Timestamp |

---

## CI/CD & Deployment Tables

### `releases`
Software release records.

**Source:** `deployment-tracker/index.ts`, `xtdb-ops-api/lib/ci-webhook.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Release ID |
| `project_id` | text | Project ID |
| `session_id` | text | Session ID that created the release |
| `version` | text | Version string (e.g. "1.2.0") |
| `name` | text | Release name |
| `changelog` | text | Changelog text |
| `git_tag` | text | Git tag |
| `git_commit` | text | Git commit SHA |
| `previous_release_id` | text | Previous release ID |
| `status` | text | "draft", "published", "yanked" |
| `ts` | bigint | Timestamp |
| `jsonld` | text | JSON-LD provenance document |

### `deployments`
Deployment records.

**Source:** `deployment-tracker/index.ts`, `xtdb-ops-api/lib/ci-webhook.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Deployment ID |
| `project_id` | text | Project ID |
| `environment_id` | text | Target environment ID |
| `release_id` | text | Release being deployed |
| `session_id` | text | Session ID |
| `deployed_by` | text | Who deployed (e.g. "pi-agent", "ci") |
| `status` | text | "pending", "succeeded", "failed", "rolled_back" |
| `rollback_of_id` | text | ID of deployment being rolled back |
| `notes` | text | Deployment notes |
| `started_ts` | bigint | Deployment start time |
| `completed_ts` | bigint | Deployment completion time |
| `ts` | bigint | Record timestamp |
| `jsonld` | text | JSON-LD provenance document |

### `test_runs`
Test execution results (from CI webhook).

**Source:** `xtdb-ops-api/lib/ci-webhook.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Test run ID |
| `project_id` | text | Project ID |
| `session_id` | text | Session ID |
| `release_id` | text | Associated release ID |
| `deployment_id` | text | Associated deployment ID |
| `suite_name` | text | Test suite name |
| `runner` | text | Test runner (e.g. "jest", "vitest") |
| `passed` | bigint | Number of passing tests |
| `failed` | bigint | Number of failing tests |
| `skipped` | bigint | Number of skipped tests |
| `coverage` | text | Code coverage percentage |
| `duration_ms` | bigint | Test duration in milliseconds |
| `status` | text | "passed", "failed" |
| `error_summary` | text | Error summary if failed |
| `git_commit` | text | Git commit SHA |
| `ts` | bigint | Timestamp |
| `jsonld` | text | JSON-LD provenance document |

### `environments`
Deployment environments.

**Source:** `deployment-tracker/index.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Environment ID |
| `project_id` | text | Project ID |
| `name` | text | Environment name (e.g. "production", "staging") |
| `url` | text | Environment URL |
| `env_type` | text | Type (e.g. "production", "staging", "dev") |
| `status` | text | "active", "inactive" |
| `ts` | bigint | Timestamp |
| `jsonld` | text | JSON-LD provenance document |

---

## Operations Tables

### `backup_records`
XTDB backup execution records.

**Source:** `xtdb-ops-api/lib/backup.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Backup record ID |
| `backup_type` | text | Backup type ("snapshot", "incremental") |
| `archive_path` | text | Path to backup archive |
| `size_bytes` | bigint | Archive size in bytes |
| `table_count` | bigint | Number of tables backed up |
| `duration_ms` | bigint | Backup duration in milliseconds |
| `status` | text | "completed", "failed" |
| `error_summary` | text | Error message if failed |
| `started_ts` | bigint | Backup start time |
| `completed_ts` | bigint | Backup completion time |
| `ts` | bigint | Record timestamp |
| `jsonld` | text | JSON-LD provenance document |

### `incidents`
Operational incidents.

**Source:** `xtdb-ops-api/lib/incidents.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Incident ID |
| `project_id` | text | Project ID |
| `severity` | text | "critical", "high", "medium", "low" |
| `title` | text | Incident title |
| `description` | text | Incident description |
| `status` | text | "open", "investigating", "resolved", "closed" |
| `started_ts` | bigint | When incident started |
| `resolved_ts` | bigint | When incident was resolved |
| `notes` | text | Resolution notes |
| `ts` | bigint | Record timestamp |
| `jsonld` | text | JSON-LD provenance document |

### `lifecycle_events`
Event feed for lifecycle state changes (phase changes, CI events, etc.).

**Source:** `project-lifecycle/index.ts`, `xtdb-ops-api/lib/ci-webhook.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Event ID |
| `event_type` | text | Event type (e.g. "phase_changed", "test.finished") |
| `entity_id` | text | ID of the affected entity |
| `entity_type` | text | Entity type (e.g. "projects", "test_runs") |
| `project_id` | text | Project ID |
| `summary` | text | Human-readable summary |
| `ts` | bigint | Timestamp |

---

## Table Count Summary

| Category | Tables | Count |
|----------|--------|-------|
| Core Events | events, projections | 2 |
| Projects | projects, session_projects, project_dependencies, project_tags, decommission_records | 5 |
| Decisions & Knowledge | decisions, session_postmortems, delegations, file_metrics | 4 |
| Artifacts | artifacts, artifact_versions, artifact_reads, artifact_cleanup | 4 |
| Workflows & Requirements | workflow_runs, workflow_step_runs, requirements, requirement_links | 4 |
| CI/CD | releases, deployments, test_runs, environments | 4 |
| Operations | backup_records, incidents, lifecycle_events | 3 |
| **Total** | | **26** |
