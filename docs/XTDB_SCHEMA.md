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

### `errors`
Enriched error records. Written to disk first (errors.jsonl), then flushed to XTDB by a collector.
Survives DB outages — disk is the source of truth, XTDB is the queryable copy.

**Source:** `lib/errors.ts` (shared error capture library)

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Error ID (e.g. "err:artifact-tracker:1711234567890:a1b2c3") |
| `component` | text | Which component/extension (e.g. "artifact-tracker", "xtdb-ops-api") |
| `operation` | text | What was being attempted (e.g. "INSERT artifact_reads", "session.steer") |
| `error_message` | text | Error message string |
| `error_stack` | text | Stack trace (truncated to 4KB) |
| `error_type` | text | Error class name (e.g. "PostgresError", "TypeError", "ConnectionRefused") |
| `severity` | text | "data_loss" / "degraded" / "transient" / "cosmetic" |
| `session_id` | text | Agent session ID (if available) |
| `project_id` | text | Project ID (if available) |
| `input_summary` | text | Truncated summary of input data being processed (max 1KB) |
| `context_json` | text | Additional context as JSON (table name, endpoint, event_name, etc.) |
| `ts` | bigint | Timestamp (epoch ms) |
| `flushed` | boolean | Whether this error has been written to XTDB (used by collector) |
| `jsonld` | text | JSON-LD provenance document (see below) |

**JSON-LD vocabulary:**
```json
{
  "@context": {
    "ev": "https://pi.dev/events/",
    "prov": "http://www.w3.org/ns/prov#",
    "schema": "https://schema.org/",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@id": "urn:pi:err:artifact-tracker:1711234567890:a1b2c3",
  "@type": "schema:Action",
  "schema:actionStatus": "schema:FailedActionStatus",
  "schema:name": "INSERT artifact_reads",
  "schema:agent": {
    "@type": "prov:SoftwareAgent",
    "schema:name": "artifact-tracker"
  },
  "schema:error": {
    "@type": "schema:Thing",
    "schema:name": "PostgresError",
    "schema:description": "connection refused"
  },
  "ev:severity": "data_loss",
  "ev:inputSummary": "path=/Users/x/foo.ts, session=abc123",
  "prov:wasAssociatedWith": { "@id": "urn:pi:session:abc123" },
  "prov:atLocation": { "@id": "urn:pi:proj:harness" },
  "prov:generatedAtTime": { "@value": "2026-03-20T06:30:00Z", "@type": "xsd:dateTime" }
}
```

Vocabulary mapping rationale:
- `schema:Action` + `schema:FailedActionStatus` — it's a failed action (standard Schema.org)
- `schema:agent` → the component that failed (maps to `prov:SoftwareAgent`)
- `schema:error` → the error itself with type + message
- `ev:severity` — custom (no standard equivalent for data_loss/degraded/transient/cosmetic)
- `prov:wasAssociatedWith` → links to session (existing pattern)
- `prov:atLocation` → links to project (existing pattern)

**Error flow:**
```
1. catch block → call captureError({ component, operation, error, severity, ... })
2. captureError() → appendFileSync("errors.jsonl", JSON.stringify(enrichedError))
3. Collector (interval) → read errors.jsonl → INSERT INTO errors → mark flushed
4. XTDB replicates via Kafka → replica has full error history
```

**Why disk-first:** If XTDB is down (the most common cause of errors), writing the error
to XTDB would also fail. The JSONL file on local disk is the safety net that never fails.

**Severity levels:**
- `data_loss` — a DB write failed silently, data is missing
- `degraded` — a feature is broken but the agent continues
- `transient` — temporary failure (connection timeout, retry likely to succeed)
- `cosmetic` — non-functional issue (UI rendering, formatting)

---

## Ticket Management Tables

### `tickets`
Project tickets / work items.

**Source:** `ticket-manager/queries.ts`, `scripts/seed-tickets.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Ticket ID (e.g. "tkt:harness:42") |
| `project_id` | text | Project ID |
| `title` | text | Ticket title |
| `description` | text | Detailed description |
| `status` | text | "backlog", "ready", "in_progress", "review", "done", "cancelled" |
| `priority` | text | "critical", "high", "medium", "low" |
| `kind` | text | "bug", "feature", "debt", "security", "task" |
| `assignee` | text | Assigned agent or person |
| `labels` | text | Comma-separated labels |
| `source` | text | Origin: "manual", "auto:error", "auto:quality", "auto:ci", "auto:security" |
| `parent_ticket_id` | text | Parent ticket ID (for sub-tasks) |
| `blocked_by` | text | Blocking ticket IDs (comma-separated) |
| `created_by` | text | Creator (e.g. "pi-agent", "ci-runner") |
| `session_id` | text | Session that created the ticket |
| `estimate_hours` | bigint | Estimated hours |
| `actual_hours` | bigint | Actual hours spent |
| `due_ts` | bigint | Due date timestamp |
| `started_ts` | bigint | When work started |
| `completed_ts` | bigint | When work completed |
| `ts` | bigint | Created timestamp |
| `jsonld` | text | JSON-LD provenance document |

### `ticket_links`
Links between tickets and other entities (decisions, artifacts, errors, CI runs).

**Source:** `ticket-manager/queries.ts`, `scripts/seed-tickets.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Link ID |
| `ticket_id` | text | Ticket ID |
| `entity_type` | text | Linked entity type ("decision", "artifact", "error", "test_run", etc.) |
| `entity_id` | text | Linked entity ID |
| `relation` | text | Relation type ("blocks", "caused_by", "implements", "tests") |
| `ts` | bigint | Timestamp |

### `ticket_events`
Ticket activity log (status changes, comments, reassignments).

**Source:** `ticket-manager/transitions.ts`, `scripts/seed-tickets.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Event ID |
| `ticket_id` | text | Ticket ID |
| `event_type` | text | "status_change", "comment", "reassign", "priority_change", "link_added" |
| `old_value` | text | Previous value |
| `new_value` | text | New value |
| `comment` | text | Comment text |
| `actor` | text | Who performed the action |
| `ts` | bigint | Timestamp |

---

## Knowledge Graph Tables

### `graph_edges`
Materialized edges between entities. Rebuilt by scanning FK columns across all entity tables.

**Source:** `knowledge-graph/materialized-edges.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Edge ID (hash of source + target + relation) |
| `source_id` | text | Source entity ID |
| `source_type` | text | Source entity type (table name) |
| `target_id` | text | Target entity ID |
| `target_type` | text | Target entity type (table name) |
| `relation` | text | Edge relation (e.g. "session_id", "project_id", "release_id") |
| `ts` | bigint | When the edge was materialized |

---

## Quality Tracking Tables

### `complexity_scores`
Per-function cyclomatic complexity scores, stored on every CI run.

**Source:** `review-gate/checks/complexity-tracker.ts`

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | Score ID (e.g. "cx-module-funcName-ts") |
| `module` | text | Module/file path |
| `function_name` | text | Function name |
| `complexity` | bigint | Cyclomatic complexity score |
| `commit_hash` | text | Git commit SHA |
| `repo` | text | Repository name |
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
| Operations | backup_records, incidents, lifecycle_events, errors | 4 |
| Tickets | tickets, ticket_links, ticket_events | 3 |
| Knowledge Graph | graph_edges | 1 |
| Quality | complexity_scores | 1 |
| **Total** | | **32** |
