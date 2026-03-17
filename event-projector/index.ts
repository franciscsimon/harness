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

  // ── Helper to extract event as record ──

  function asRecord(event: unknown): Record<string, unknown> {
    return (event ?? {}) as Record<string, unknown>;
  }

  // ── 9 Event Hooks ──

  pi.on("input", (event: any, ctx: any) => {
    const sessionId = ctx?.sessionManager?.getSessionFile?.() ?? "unknown";
    const taskId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    state = createRunState(sessionId, taskId, eventId, asRecord(event));
  });

  pi.on("before_agent_start" as any, (event: unknown) => {
    const eventId = crypto.randomUUID();
    state = accumulate(state, "before_agent_start", eventId, asRecord(event));
  });

  pi.on("agent_start" as any, (event: unknown) => {
    const eventId = crypto.randomUUID();
    state = accumulate(state, "agent_start", eventId, asRecord(event));
    if (state) {
      emit(projectTask(crypto.randomUUID(), state));
    }
  });

  pi.on("turn_start" as any, (event: unknown) => {
    const eventId = crypto.randomUUID();
    state = accumulate(state, "turn_start", eventId, asRecord(event));
  });

  pi.on("message_update", (event: any) => {
    const eventId = crypto.randomUUID();
    state = accumulate(state, "message_update", eventId, asRecord(event));
  });

  pi.on("tool_call" as any, (event: unknown) => {
    const eventId = crypto.randomUUID();
    state = accumulate(state, "tool_call", eventId, asRecord(event));
  });

  pi.on("tool_result" as any, (event: unknown) => {
    const eventId = crypto.randomUUID();
    state = accumulate(state, "tool_result", eventId, asRecord(event));
  });

  pi.on("turn_end" as any, (event: unknown) => {
    const turnEndEventId = crypto.randomUUID();
    state = accumulate(state, "turn_end", turnEndEventId, asRecord(event));
    if (state) {
      const traceId = crypto.randomUUID();
      const row = projectReasoning(traceId, state, turnEndEventId);
      emit(row);
      // Push trace ID into run-level accumulator for AgentResultProduced
      state = { ...state, reasoningTraceIds: [...state.reasoningTraceIds, traceId] };
    }
  });

  pi.on("agent_end" as any, (event: unknown) => {
    const eventId = crypto.randomUUID();
    state = accumulate(state, "agent_end", eventId, asRecord(event));
    if (state) {
      emit(projectChanges(crypto.randomUUID(), state));
      emit(projectResult(crypto.randomUUID(), state));
      state = null; // Run complete
    }
  });
}
