// ─── Projectors ────────────────────────────────────────────────────
// 4 pure functions: state → ProjectionRow | null. No I/O.

import type {
  RunState,
  AgentTaskRequestedRow,
  AgentReasoningTraceRow,
  AgentResultProducedRow,
  ProjectStateChangedRow,
} from "./types.ts";

/**
 * Emitted at agent_start. Captures what the agent was asked to do.
 */
export function projectTask(id: string, state: RunState): AgentTaskRequestedRow {
  return {
    _id: id,
    type: "AgentTaskRequested",
    task_id: state.taskId,
    session_id: state.sessionId,
    ts: Date.now(),
    prompt: state.prompt,
    input_source: state.inputSource,
    context_msg_count: state.contextMsgCount,
    system_prompt_event_id: state.systemPromptEventId,
    input_event_id: state.inputEventId,
  };
}

/**
 * Emitted at turn_end. One per turn — captures reasoning + tool use.
 */
export function projectReasoning(
  id: string,
  state: RunState,
  turnEndEventId: string,
): AgentReasoningTraceRow {
  const turn = state.currentTurn;
  return {
    _id: id,
    type: "AgentReasoningTrace",
    task_id: state.taskId,
    session_id: state.sessionId,
    ts: Date.now(),
    turn_index: state.turnIndex,
    thinking_event_ids: JSON.stringify(turn.thinkingEventIds),
    tool_call_event_ids: JSON.stringify(turn.toolCallEventIds),
    tool_result_event_ids: JSON.stringify(turn.toolResultEventIds),
    provider_payload_bytes: turn.providerPayloadBytes,
    tool_count: turn.toolCallEventIds.length,
    turn_start_event_id: turn.turnStartEventId,
    turn_end_event_id: turnEndEventId,
  };
}

/**
 * Emitted at agent_end. Captures the final result + links to all traces.
 */
export function projectResult(id: string, state: RunState): AgentResultProducedRow {
  return {
    _id: id,
    type: "AgentResultProduced",
    task_id: state.taskId,
    session_id: state.sessionId,
    ts: Date.now(),
    reasoning_trace_ids: JSON.stringify(state.reasoningTraceIds),
    total_turns: state.totalTurns,
    total_msg_count: state.agentEndMsgCount,
    agent_end_event_id: state.agentEndEventId,
    final_message_event_id: state.finalMessageEventId,
    output_summary: state.outputSummary,
  };
}

/**
 * Emitted at agent_end, only if mutations exist. Returns null otherwise.
 */
export function projectChanges(id: string, state: RunState): ProjectStateChangedRow | null {
  if (state.mutations.length === 0) return null;
  return {
    _id: id,
    type: "ProjectStateChanged",
    task_id: state.taskId,
    session_id: state.sessionId,
    ts: Date.now(),
    mutations: JSON.stringify(state.mutations),
    mutating_tool_count: state.mutations.length,
  };
}
