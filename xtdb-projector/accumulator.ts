// ─── Accumulator ───────────────────────────────────────────────────
// Pure function: (state, eventName, eventData) → state. No I/O.

import type { RunState, CurrentTurn } from "./types.ts";
import { isMutation, inputSummary } from "./mutations.ts";

function freshTurn(): CurrentTurn {
  return {
    thinkingEventIds: [],
    toolCallEventIds: [],
    toolResultEventIds: [],
    providerPayloadBytes: null,
    turnStartEventId: null,
  };
}

/**
 * Create initial RunState from an `input` event.
 * Called once per agent run — subsequent events use accumulate().
 */
export function createRunState(
  sessionId: string,
  taskId: string,
  eventId: string,
  event: Record<string, unknown>,
): RunState {
  return {
    sessionId,
    taskId,
    prompt: typeof event.text === "string" ? event.text : null,
    inputSource: typeof event.source === "string" ? event.source : null,
    inputEventId: eventId,
    systemPromptEventId: null,
    contextMsgCount: null,
    inputTs: Date.now(),
    turnIndex: 0,
    currentTurn: freshTurn(),
    reasoningTraceIds: [],
    mutations: [],
    totalTurns: 0,
    agentEndEventId: null,
    finalMessageEventId: null,
    agentEndMsgCount: null,
    outputSummary: null,
  };
}

/**
 * Accumulate a single event into RunState. Returns a new state object.
 * If state is null (no active run), returns null unchanged.
 */
export function accumulate(
  state: RunState | null,
  eventName: string,
  eventId: string,
  event: Record<string, unknown>,
): RunState | null {
  if (!state) return null;

  // Shallow-copy state so callers can treat it as immutable
  const s = { ...state };

  switch (eventName) {
    case "before_agent_start": {
      s.systemPromptEventId = eventId;
      // context msg count from the event — before_agent_start carries the prompt
      // and system prompt but not msg count directly. We'll capture it if present.
      const messages = event.messages;
      if (Array.isArray(messages)) {
        s.contextMsgCount = messages.length;
      }
      break;
    }

    case "agent_start": {
      // Trigger only — no data to extract. Emit point handled in index.ts.
      break;
    }

    case "turn_start": {
      s.turnIndex = typeof event.turnIndex === "number" ? event.turnIndex : s.turnIndex + 1;
      s.totalTurns = s.turnIndex + 1;
      s.currentTurn = freshTurn();
      s.currentTurn.turnStartEventId = eventId;
      break;
    }

    case "message_update": {
      const ame = event.assistantMessageEvent as { type?: string } | undefined;
      if (ame?.type?.startsWith("thinking")) {
        const prev = s.currentTurn.thinkingEventIds;
        if (prev.length === 0 || prev[prev.length - 1] !== eventId) {
          s.currentTurn = { ...s.currentTurn, thinkingEventIds: [...prev, eventId] };
        }
      }
      break;
    }

    case "tool_call": {
      s.currentTurn = { ...s.currentTurn, toolCallEventIds: [...s.currentTurn.toolCallEventIds, eventId] };

      const toolName = typeof event.toolName === "string" ? event.toolName : "";
      const input = (event.input ?? {}) as Record<string, unknown>;

      if (isMutation(toolName, input)) {
        s.mutations = [
          ...s.mutations,
          {
            toolName,
            toolCallEventId: eventId,
            toolResultEventId: null,
            inputSummary: inputSummary(toolName, input),
          },
        ];
      }
      break;
    }

    case "tool_result": {
      s.currentTurn = { ...s.currentTurn, toolResultEventIds: [...s.currentTurn.toolResultEventIds, eventId] };

      // Patch the matching mutation's toolResultEventId
      const toolCallId = typeof event.toolCallId === "string" ? event.toolCallId : null;
      if (toolCallId) {
        // Match by toolCallId in the tool_call_event_ids — find the mutation
        // whose toolResultEventId is still null (most recent unpatched)
        const toolName = typeof event.toolName === "string" ? event.toolName : "";
        const idx = s.mutations.findIndex(
          (m) => m.toolName === toolName && m.toolResultEventId === null,
        );
        if (idx !== -1) {
          s.mutations = s.mutations.map((m, i) =>
            i === idx ? { ...m, toolResultEventId: eventId } : m,
          );
        }
      }
      break;
    }

    case "turn_end": {
      // Emit point handled in index.ts. No additional state to capture here
      // beyond what turn_start/tool_call/tool_result already accumulated.
      break;
    }

    case "agent_end": {
      s.agentEndEventId = eventId;
      const messages = event.messages;
      if (Array.isArray(messages)) {
        s.agentEndMsgCount = messages.length;
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i] as Record<string, unknown> | undefined;
          if (msg?.role === "assistant") {
            s.finalMessageEventId = eventId;
            const content = msg.content;
            if (Array.isArray(content)) {
              const textBlock = content.find((b: any) => b?.type === "text" && b?.text);
              if (textBlock) {
                const text = (textBlock as any).text as string;
                s.outputSummary = text.length > 500 ? text.slice(0, 497) + "..." : text;
              }
            } else if (typeof content === "string") {
              s.outputSummary = content.length > 500 ? content.slice(0, 497) + "..." : content;
            }
            break;
          }
        }
      }
      break;
    }
  }

  return s;
}
