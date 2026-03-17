import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import postgres from "postgres";
import { createRunState, accumulate } from "./accumulator.ts";
import { projectTask, projectReasoning, projectResult, projectChanges } from "./projectors.ts";
import type { RunState, ProjectionRow } from "./types.ts";

// ─── Entry Point ───────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let state: RunState | null = null;
  let sql: ReturnType<typeof postgres> | null = null;

  // ── Lazy postgres connection ──

  function getSql(): ReturnType<typeof postgres> {
    if (!sql) {
      sql = postgres({
        host: process.env.XTDB_HOST ?? "localhost",
        port: Number(process.env.XTDB_PORT ?? 5433),
        database: "xtdb",
        user: "xtdb",
        password: "xtdb",
      });
    }
    return sql;
  }

  // ── INSERT helper ──

  async function emit(row: ProjectionRow | null): Promise<void> {
    if (!row) return;
    try {
      const db = getSql();
      const t = (v: string | null) => db.typed(v as any, 25);   // OID 25 = text
      const n = (v: number | null) => db.typed(v as any, 20);   // OID 20 = int8

      switch (row.type) {
        case "AgentTaskRequested":
          await db`INSERT INTO projections (
            _id, type, task_id, session_id, ts,
            prompt, input_source, context_msg_count,
            system_prompt_event_id, input_event_id
          ) VALUES (
            ${t(row._id)}, ${t(row.type)}, ${t(row.task_id)}, ${t(row.session_id)}, ${n(row.ts)},
            ${t(row.prompt)}, ${t(row.input_source)}, ${n(row.context_msg_count)},
            ${t(row.system_prompt_event_id)}, ${t(row.input_event_id)}
          )`;
          break;

        case "AgentReasoningTrace":
          await db`INSERT INTO projections (
            _id, type, task_id, session_id, ts,
            turn_index, thinking_event_ids, tool_call_event_ids,
            tool_result_event_ids, provider_payload_bytes, tool_count,
            turn_start_event_id, turn_end_event_id
          ) VALUES (
            ${t(row._id)}, ${t(row.type)}, ${t(row.task_id)}, ${t(row.session_id)}, ${n(row.ts)},
            ${n(row.turn_index)}, ${t(row.thinking_event_ids)}, ${t(row.tool_call_event_ids)},
            ${t(row.tool_result_event_ids)}, ${n(row.provider_payload_bytes)}, ${n(row.tool_count)},
            ${t(row.turn_start_event_id)}, ${t(row.turn_end_event_id)}
          )`;
          break;

        case "AgentResultProduced":
          await db`INSERT INTO projections (
            _id, type, task_id, session_id, ts,
            reasoning_trace_ids, total_turns, total_msg_count,
            agent_end_event_id, final_message_event_id, output_summary
          ) VALUES (
            ${t(row._id)}, ${t(row.type)}, ${t(row.task_id)}, ${t(row.session_id)}, ${n(row.ts)},
            ${t(row.reasoning_trace_ids)}, ${n(row.total_turns)}, ${n(row.total_msg_count)},
            ${t(row.agent_end_event_id)}, ${t(row.final_message_event_id)}, ${t(row.output_summary)}
          )`;
          break;

        case "ProjectStateChanged":
          await db`INSERT INTO projections (
            _id, type, task_id, session_id, ts,
            mutations, mutating_tool_count
          ) VALUES (
            ${t(row._id)}, ${t(row.type)}, ${t(row.task_id)}, ${t(row.session_id)}, ${n(row.ts)},
            ${t(row.mutations)}, ${n(row.mutating_tool_count)}
          )`;
          break;
      }
    } catch (err) {
      console.error(`[event-projector] INSERT failed for ${row.type}: ${err}`);
    }
  }

  // ── Helpers ──

  function asRecord(event: unknown): Record<string, unknown> {
    return (event ?? {}) as Record<string, unknown>;
  }

  /** Read the real XTDB _id published by xtdb-event-logger for the current event.
   *  Requires xtdb-event-logger to load first (alphabetical: xtdb-event-logger < xtdb-projector). */
  let lastEventName = "";
  function realId(expectedEvent: string): string {
    const last = (globalThis as any).__piLastEvent;
    if (last && last.eventName === expectedEvent) {
      lastEventName = expectedEvent;
      return last._id;
    }
    return crypto.randomUUID();
  }

  // ── 9 Event Hooks ──

  pi.on("input", (event: any, ctx: any) => {
    const sessionId = ctx?.sessionManager?.getSessionFile?.() ?? "unknown";
    const taskId = crypto.randomUUID();
    state = createRunState(sessionId, taskId, realId("input"), asRecord(event));
  });

  pi.on("before_agent_start" as any, (event: unknown) => {
    state = accumulate(state, "before_agent_start", realId("before_agent_start"), asRecord(event));
  });

  pi.on("agent_start" as any, () => {
    state = accumulate(state, "agent_start", realId("agent_start"), asRecord({}));
    if (state) {
      emit(projectTask(crypto.randomUUID(), state));
    }
  });

  pi.on("turn_start" as any, (event: unknown) => {
    state = accumulate(state, "turn_start", realId("turn_start"), asRecord(event));
  });

  pi.on("message_update", (event: any) => {
    state = accumulate(state, "message_update", realId("message_update"), asRecord(event));
  });

  pi.on("tool_call" as any, (event: unknown) => {
    state = accumulate(state, "tool_call", realId("tool_call"), asRecord(event));
  });

  pi.on("tool_result" as any, (event: unknown) => {
    state = accumulate(state, "tool_result", realId("tool_result"), asRecord(event));
  });

  // Stable IDs for result/changes projections — reused across turn_end (provisional)
  // and agent_end (final) so XTDB upserts instead of duplicating.
  let resultProjectionId = "";
  let changesProjectionId = "";

  pi.on("turn_end" as any, (event: unknown) => {
    const id = realId("turn_end");
    state = accumulate(state, "turn_end", id, asRecord(event));
    if (state) {
      const traceId = crypto.randomUUID();
      const row = projectReasoning(traceId, state, id);
      emit(row);
      state = { ...state, reasoningTraceIds: [...state.reasoningTraceIds, traceId] };

      // Provisional result + changes — in case agent_end never fires (subagent exit)
      if (!resultProjectionId) resultProjectionId = crypto.randomUUID();
      if (!changesProjectionId) changesProjectionId = crypto.randomUUID();
      emit(projectResult(resultProjectionId, state));
      emit(projectChanges(changesProjectionId, state));
    }
  });

  pi.on("agent_end" as any, (event: unknown) => {
    state = accumulate(state, "agent_end", realId("agent_end"), asRecord(event));
    if (state) {
      // Final versions — same IDs overwrite provisional rows in XTDB
      if (!changesProjectionId) changesProjectionId = crypto.randomUUID();
      if (!resultProjectionId) resultProjectionId = crypto.randomUUID();
      emit(projectChanges(changesProjectionId, state));
      emit(projectResult(resultProjectionId, state));
      state = null;
      resultProjectionId = "";
      changesProjectionId = "";
    }
  });
}
