// ─── Mutation Record ───────────────────────────────────────────────

export interface MutationRecord {
  toolName: string;
  toolCallEventId: string;
  toolResultEventId: string | null;
  inputSummary: string;
}

// ─── Current Turn ──────────────────────────────────────────────────

export interface CurrentTurn {
  thinkingEventIds: string[];
  toolCallEventIds: string[];
  toolResultEventIds: string[];
  providerPayloadBytes: number | null;
  turnStartEventId: string | null;
}

// ─── Run State ─────────────────────────────────────────────────────

export interface RunState {
  // Identity
  sessionId: string;
  taskId: string;

  // Task capture (input + before_agent_start)
  prompt: string | null;
  inputSource: string | null;
  inputEventId: string | null;
  systemPromptEventId: string | null;
  contextMsgCount: number | null;
  inputTs: number | null;

  // Turn tracking (reset per turn)
  turnIndex: number;
  currentTurn: CurrentTurn;

  // Run-level accumulators
  reasoningTraceIds: string[];
  mutations: MutationRecord[];
  totalTurns: number;
  agentEndEventId: string | null;
  finalMessageEventId: string | null;
  agentEndMsgCount: number | null;
  outputSummary: string | null;
}

// ─── Projection Types ──────────────────────────────────────────────

export type ProjectionType =
  | "AgentTaskRequested"
  | "AgentReasoningTrace"
  | "AgentResultProduced"
  | "ProjectStateChanged";

// ─── Projection Rows ──────────────────────────────────────────────
// Each row type contains only its own columns + common columns.
// XTDB is schema-on-write — no NULLs for inapplicable columns.

interface ProjectionBase {
  _id: string;
  type: ProjectionType;
  task_id: string;
  session_id: string;
  ts: number;
}

export interface AgentTaskRequestedRow extends ProjectionBase {
  type: "AgentTaskRequested";
  prompt: string | null;
  input_source: string | null;
  context_msg_count: number | null;
  system_prompt_event_id: string | null;
  input_event_id: string | null;
}

export interface AgentReasoningTraceRow extends ProjectionBase {
  type: "AgentReasoningTrace";
  turn_index: number;
  thinking_event_ids: string;   // JSON array
  tool_call_event_ids: string;  // JSON array
  tool_result_event_ids: string; // JSON array
  provider_payload_bytes: number | null;
  tool_count: number;
  turn_start_event_id: string | null;
  turn_end_event_id: string | null;
}

export interface AgentResultProducedRow extends ProjectionBase {
  type: "AgentResultProduced";
  reasoning_trace_ids: string;  // JSON array
  total_turns: number;
  total_msg_count: number | null;
  agent_end_event_id: string | null;
  final_message_event_id: string | null;
  output_summary: string | null;
}

export interface ProjectStateChangedRow extends ProjectionBase {
  type: "ProjectStateChanged";
  mutations: string;            // JSON array of MutationRecord
  mutating_tool_count: number;
}

export type ProjectionRow =
  | AgentTaskRequestedRow
  | AgentReasoningTraceRow
  | AgentResultProducedRow
  | ProjectStateChangedRow;
