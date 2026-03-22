/**
 * XTDB Schema Seed Script
 *
 * XTDB is schema-on-write — tables and columns only exist after first INSERT.
 * This script inserts a seed row into every table with all columns, then deletes it.
 * Run after a fresh database or wipe to eliminate "Column not found" warnings.
 *
 * Usage: npx jiti scripts/seed-schema.ts
 */

import postgres from "postgres";

const XTDB_HOST = process.env.XTDB_HOST ?? "localhost";
const XTDB_PORT = Number(process.env.XTDB_PORT ?? 5433);

// Type helpers matching the codebase convention
// text = OID 25, bigint = OID 20, boolean = OID 16
type ColType = "text" | "bigint" | "boolean";

interface TableDef {
  table: string;
  columns: Record<string, ColType>;
}

// ─── Full schema from docs/XTDB_SCHEMA.md ──────────────────────────

const schema: TableDef[] = [
  // ── Core Events ──────────────────────────────────────────────────
  {
    table: "events",
    columns: {
      _id: "text",
      environment: "text",
      event_name: "text",
      category: "text",
      can_intercept: "boolean",
      schema_version: "bigint",
      ts: "bigint",
      seq: "bigint",
      session_id: "text",
      cwd: "text",
      switch_reason: "text",
      switch_target: "text",
      switch_previous: "text",
      fork_entry_id: "text",
      fork_previous: "text",
      tree_new_leaf: "text",
      tree_old_leaf: "text",
      tree_from_ext: "boolean",
      event_cwd: "text",
      compact_tokens: "bigint",
      compact_from_ext: "boolean",
      prompt_text: "text",
      agent_end_msg_count: "bigint",
      turn_index: "bigint",
      turn_timestamp: "bigint",
      turn_end_tool_count: "bigint",
      message_role: "text",
      stream_delta_type: "text",
      stream_delta_len: "bigint",
      tool_name: "text",
      tool_call_id: "text",
      is_error: "boolean",
      context_msg_count: "bigint",
      provider_payload_bytes: "bigint",
      input_text: "text",
      input_source: "text",
      input_has_images: "boolean",
      bash_command: "text",
      bash_exclude: "boolean",
      model_provider: "text",
      model_id: "text",
      model_source: "text",
      prev_model_provider: "text",
      prev_model_id: "text",
      payload: "text",
      handler_error: "text",
      message_content: "text",
      stream_delta: "text",
      tool_input: "text",
      tool_content: "text",
      tool_details: "text",
      tool_partial_result: "text",
      tool_args: "text",
      agent_messages: "text",
      system_prompt: "text",
      images: "text",
      context_messages: "text",
      provider_payload: "text",
      turn_message: "text",
      turn_tool_results: "text",
      compact_branch_entries: "text",
      jsonld: "text",
    },
  },
  {
    table: "projections",
    columns: {
      _id: "text",
      type: "text",
      task_id: "text",
      session_id: "text",
      ts: "bigint",
      prompt: "text",
      input_source: "text",
      context_msg_count: "bigint",
      system_prompt_event_id: "text",
      input_event_id: "text",
      turn_index: "bigint",
      thinking_event_ids: "text",
      tool_call_event_ids: "text",
      tool_result_event_ids: "text",
      provider_payload_bytes: "bigint",
      tool_count: "bigint",
      tools_summary: "text",
      turn_start_event_id: "text",
      turn_end_event_id: "text",
      reasoning_trace_ids: "text",
      total_turns: "bigint",
      total_msg_count: "bigint",
      agent_end_event_id: "text",
      final_message_event_id: "text",
      output_summary: "text",
      mutations: "text",
      mutating_tool_count: "bigint",
    },
  },

  // ── Projects ─────────────────────────────────────────────────────
  {
    table: "projects",
    columns: {
      _id: "text",
      canonical_id: "text",
      name: "text",
      identity_type: "text",
      git_remote_url: "text",
      git_root_path: "text",
      first_seen_ts: "bigint",
      last_seen_ts: "bigint",
      session_count: "bigint",
      lifecycle_phase: "text",
      config_json: "text",
      jsonld: "text",
    },
  },
  {
    table: "session_projects",
    columns: {
      _id: "text",
      session_id: "text",
      project_id: "text",
      canonical_id: "text",
      cwd: "text",
      git_root_path: "text",
      ts: "bigint",
      is_first_session: "boolean",
      jsonld: "text",
    },
  },
  {
    table: "project_dependencies",
    columns: {
      _id: "text",
      project_id: "text",
      name: "text",
      version: "text",
      dep_type: "text",
      ts: "bigint",
      jsonld: "text",
    },
  },
  {
    table: "project_tags",
    columns: {
      _id: "text",
      project_id: "text",
      tag: "text",
      ts: "bigint",
    },
  },
  {
    table: "decommission_records",
    columns: {
      _id: "text",
      project_id: "text",
      reason: "text",
      decommissioned_by: "text",
      checklist_json: "text",
      ts: "bigint",
      jsonld: "text",
    },
  },

  // ── Decisions & Knowledge ────────────────────────────────────────
  {
    table: "decisions",
    columns: {
      _id: "text",
      project_id: "text",
      session_id: "text",
      ts: "bigint",
      task: "text",
      what: "text",
      outcome: "text",
      why: "text",
      files: "text",
      alternatives: "text",
      agent: "text",
      tags: "text",
      jsonld: "text",
    },
  },
  {
    table: "session_postmortems",
    columns: {
      _id: "text",
      project_id: "text",
      session_id: "text",
      goal: "text",
      what_worked: "text",
      what_failed: "text",
      files_changed: "text",
      error_count: "bigint",
      turn_count: "bigint",
      ts: "bigint",
      jsonld: "text",
    },
  },
  {
    table: "delegations",
    columns: {
      _id: "text",
      parent_session_id: "text",
      child_session_id: "text",
      project_id: "text",
      agent_name: "text",
      task: "text",
      status: "text",
      exit_code: "bigint",
      ts: "bigint",
      jsonld: "text",
    },
  },
  {
    table: "file_metrics",
    columns: {
      _id: "text",
      project_id: "text",
      session_id: "text",
      file_path: "text",
      edit_count: "bigint",
      error_count: "bigint",
      ts: "bigint",
    },
  },

  // ── Artifacts ────────────────────────────────────────────────────
  {
    table: "artifacts",
    columns: {
      _id: "text",
      project_id: "text",
      session_id: "text",
      path: "text",
      content_hash: "text",
      kind: "text",
      operation: "text",
      tool_call_id: "text",
      ts: "bigint",
      jsonld: "text",
    },
  },
  {
    table: "artifact_versions",
    columns: {
      _id: "text",
      session_id: "text",
      path: "text",
      relative_path: "text",
      version: "bigint",
      content_hash: "text",
      content: "text",
      size_bytes: "bigint",
      operation: "text",
      tool_call_id: "text",
      ts: "bigint",
      jsonld: "text",
    },
  },
  {
    table: "artifact_reads",
    columns: {
      _id: "text",
      session_id: "text",
      path: "text",
      tool_call_id: "text",
      ts: "bigint",
    },
  },
  {
    table: "artifact_cleanup",
    columns: {
      _id: "text",
      session_id: "text",
      path: "text",
      relative_path: "text",
      created_at: "bigint",
    },
  },

  // ── Workflows & Requirements ─────────────────────────────────────
  {
    table: "workflow_runs",
    columns: {
      _id: "text",
      project_id: "text",
      session_id: "text",
      workflow_name: "text",
      task_description: "text",
      status: "text",
      current_step: "bigint",
      total_steps: "bigint",
      ts: "bigint",
      jsonld: "text",
    },
  },
  {
    table: "workflow_step_runs",
    columns: {
      _id: "text",
      workflow_run_id: "text",
      step_name: "text",
      agent_role: "text",
      position: "bigint",
      status: "text",
      ts: "bigint",
      jsonld: "text",
    },
  },
  {
    table: "requirements",
    columns: {
      _id: "text",
      project_id: "text",
      title: "text",
      description: "text",
      priority: "text",
      status: "text",
      source: "text",
      linked_decision_id: "text",
      linked_artifact_id: "text",
      ts: "bigint",
      jsonld: "text",
    },
  },
  {
    table: "requirement_links",
    columns: {
      _id: "text",
      requirement_id: "text",
      entity_type: "text",
      entity_id: "text",
      ts: "bigint",
    },
  },

  // ── CI/CD ────────────────────────────────────────────────────────
  {
    table: "releases",
    columns: {
      _id: "text",
      project_id: "text",
      session_id: "text",
      version: "text",
      name: "text",
      changelog: "text",
      git_tag: "text",
      git_commit: "text",
      previous_release_id: "text",
      status: "text",
      ts: "bigint",
      jsonld: "text",
    },
  },
  {
    table: "deployments",
    columns: {
      _id: "text",
      project_id: "text",
      environment_id: "text",
      release_id: "text",
      session_id: "text",
      deployed_by: "text",
      status: "text",
      rollback_of_id: "text",
      notes: "text",
      started_ts: "bigint",
      completed_ts: "bigint",
      ts: "bigint",
      jsonld: "text",
    },
  },
  {
    table: "test_runs",
    columns: {
      _id: "text",
      project_id: "text",
      session_id: "text",
      release_id: "text",
      deployment_id: "text",
      suite_name: "text",
      runner: "text",
      passed: "bigint",
      failed: "bigint",
      skipped: "bigint",
      coverage: "text",
      duration_ms: "bigint",
      status: "text",
      error_summary: "text",
      git_commit: "text",
      ts: "bigint",
      jsonld: "text",
    },
  },
  {
    table: "environments",
    columns: {
      _id: "text",
      project_id: "text",
      name: "text",
      url: "text",
      env_type: "text",
      status: "text",
      ts: "bigint",
      jsonld: "text",
    },
  },

  // ── Operations ───────────────────────────────────────────────────
  {
    table: "backup_records",
    columns: {
      _id: "text",
      backup_type: "text",
      archive_path: "text",
      size_bytes: "bigint",
      table_count: "bigint",
      duration_ms: "bigint",
      status: "text",
      error_summary: "text",
      started_ts: "bigint",
      completed_ts: "bigint",
      ts: "bigint",
      jsonld: "text",
    },
  },
  {
    table: "incidents",
    columns: {
      _id: "text",
      project_id: "text",
      severity: "text",
      title: "text",
      description: "text",
      status: "text",
      started_ts: "bigint",
      resolved_ts: "bigint",
      notes: "text",
      ts: "bigint",
      jsonld: "text",
    },
  },
  {
    table: "errors",
    columns: {
      _id: "text",
      component: "text",
      operation: "text",
      error_message: "text",
      error_stack: "text",
      error_type: "text",
      severity: "text",
      session_id: "text",
      project_id: "text",
      input_summary: "text",
      context_json: "text",
      ts: "bigint",
      flushed: "boolean",
      jsonld: "text",
    },
  },
  {
    table: "lifecycle_events",
    columns: {
      _id: "text",
      event_type: "text",
      entity_id: "text",
      entity_type: "text",
      project_id: "text",
      summary: "text",
      ts: "bigint",
    },
  },
  {
    table: "ci_runs",
    columns: {
      _id: "text",
      repo: "text",
      ref: "text",
      commit_hash: "text",
      commit_message: "text",
      pusher: "text",
      status: "text",
      steps_passed: "bigint",
      steps_failed: "bigint",
      duration_ms: "bigint",
      ts: "bigint",
      step_results: "text",
      jsonld: "text",
    },
  },
  {
    table: "docker_events",
    columns: {
      _id: "text",
      event_type: "text",
      action: "text",
      container_id: "text",
      container_name: "text",
      service_name: "text",
      compose_project: "text",
      image: "text",
      exit_code: "bigint",
      severity: "text",
      attributes: "text",
      ts: "bigint",
      ts_nano: "bigint",
      jsonld: "text",
    },
  },
];

// ─── Seed logic ────────────────────────────────────────────────────

const OID: Record<ColType, number> = { text: 25, bigint: 20, boolean: 16 };
const ZERO: Record<ColType, string | number | boolean> = {
  text: "",
  bigint: 0,
  boolean: false,
};

async function seed() {
  const sql = postgres({
    host: XTDB_HOST,
    port: XTDB_PORT,
    user: "xtdb",
    database: "xtdb",
    onnotice: () => {},       // suppress XTDB warnings during seeding
  });

  const SEED_ID = "__schema_seed__";
  let created = 0;
  let failed = 0;

  for (const def of schema) {
    const cols = Object.keys(def.columns);
    const types = Object.values(def.columns);

    // Build typed values: _id always gets the seed marker
    const values = cols.map((col, i) => {
      if (col === "_id") return sql.typed(SEED_ID as any, OID[types[i]]);
      return sql.typed(ZERO[types[i]] as any, OID[types[i]]);
    });

    // Quote reserved words (e.g. "position")
    const RESERVED = new Set(["position", "type", "name", "status", "version", "source", "path", "url", "description", "tag"]);
    const colList = cols.map(c => RESERVED.has(c) ? `"${c}"` : c).join(", ");
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");

    try {
      await sql.unsafe(
        `INSERT INTO ${def.table} (${colList}) VALUES (${placeholders})`,
        values
      );
      await sql.unsafe(
        `DELETE FROM ${def.table} WHERE _id = $1`,
        [sql.typed(SEED_ID as any, 25)]
      );
      created++;
      console.log(`  ✓ ${def.table} (${cols.length} columns)`);
    } catch (err: any) {
      failed++;
      console.error(`  ✗ ${def.table}: ${err.message?.split("\n")[0]}`);
    }
  }

  // Clean up test_sync if it exists from earlier testing
  try {
    await sql.unsafe(`DELETE FROM test_sync WHERE _id = 'sync-test-1'`);
  } catch {}

  await sql.end();
  console.log(`\nDone: ${created} seeded, ${failed} failed, ${schema.length} total tables`);
  process.exit(failed > 0 ? 1 : 0);
}

seed().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
