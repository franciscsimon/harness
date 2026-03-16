import type {
  EventHandler,
  EventMeta,
  NormalizedEvent,
  EventCategory,
  EventFields,
} from "./types.ts";
import { SCHEMA_VERSION } from "./types.ts";
import { uuid } from "./util.ts";

// ── 30 handler imports (one per file) ──────────────────────────────

import { handler as handleSessionDirectory }     from "./handlers/session-directory.ts";
import { handler as handleSessionStart }         from "./handlers/session-start.ts";
import { handler as handleSessionBeforeSwitch }  from "./handlers/session-before-switch.ts";
import { handler as handleSessionSwitch }        from "./handlers/session-switch.ts";
import { handler as handleSessionBeforeFork }    from "./handlers/session-before-fork.ts";
import { handler as handleSessionFork }          from "./handlers/session-fork.ts";
import { handler as handleSessionBeforeTree }    from "./handlers/session-before-tree.ts";
import { handler as handleSessionTree }          from "./handlers/session-tree.ts";
import { handler as handleSessionShutdown }      from "./handlers/session-shutdown.ts";
import { handler as handleSessionBeforeCompact } from "./handlers/session-before-compact.ts";
import { handler as handleSessionCompact }       from "./handlers/session-compact.ts";
import { handler as handleBeforeAgentStart }     from "./handlers/before-agent-start.ts";
import { handler as handleAgentStart }           from "./handlers/agent-start.ts";
import { handler as handleAgentEnd }             from "./handlers/agent-end.ts";
import { handler as handleTurnStart }            from "./handlers/turn-start.ts";
import { handler as handleTurnEnd }              from "./handlers/turn-end.ts";
import { handler as handleMessageStart }         from "./handlers/message-start.ts";
import { handler as handleMessageUpdate }        from "./handlers/message-update.ts";
import { handler as handleMessageEnd }           from "./handlers/message-end.ts";
import { handler as handleToolCall }             from "./handlers/tool-call.ts";
import { handler as handleToolResult }           from "./handlers/tool-result.ts";
import { handler as handleToolExecutionStart }   from "./handlers/tool-execution-start.ts";
import { handler as handleToolExecutionUpdate }  from "./handlers/tool-execution-update.ts";
import { handler as handleToolExecutionEnd }     from "./handlers/tool-execution-end.ts";
import { handler as handleContext }              from "./handlers/context.ts";
import { handler as handleBeforeProviderRequest } from "./handlers/before-provider-request.ts";
import { handler as handleInput }                from "./handlers/input.ts";
import { handler as handleUserBash }             from "./handlers/user-bash.ts";
import { handler as handleModelSelect }          from "./handlers/model-select.ts";
import { handler as handleResourcesDiscover }    from "./handlers/resources-discover.ts";

// ── Route entry ────────────────────────────────────────────────────

interface RouteEntry {
  handler: EventHandler;
  category: EventCategory;
  canIntercept: boolean;
}

// ── Dispatch table (30 entries) ────────────────────────────────────

const ROUTES: Record<string, RouteEntry> = {
  "session_directory":      { handler: handleSessionDirectory,     category: "session",    canIntercept: true  },
  "session_start":          { handler: handleSessionStart,         category: "session",    canIntercept: false },
  "session_before_switch":  { handler: handleSessionBeforeSwitch,  category: "session",    canIntercept: true  },
  "session_switch":         { handler: handleSessionSwitch,        category: "session",    canIntercept: false },
  "session_before_fork":    { handler: handleSessionBeforeFork,    category: "session",    canIntercept: true  },
  "session_fork":           { handler: handleSessionFork,          category: "session",    canIntercept: false },
  "session_before_tree":    { handler: handleSessionBeforeTree,    category: "session",    canIntercept: true  },
  "session_tree":           { handler: handleSessionTree,          category: "session",    canIntercept: false },
  "session_shutdown":       { handler: handleSessionShutdown,      category: "session",    canIntercept: false },
  "session_before_compact": { handler: handleSessionBeforeCompact, category: "compaction", canIntercept: true  },
  "session_compact":        { handler: handleSessionCompact,       category: "compaction", canIntercept: false },
  "before_agent_start":     { handler: handleBeforeAgentStart,     category: "agent",      canIntercept: true  },
  "agent_start":            { handler: handleAgentStart,           category: "agent",      canIntercept: false },
  "agent_end":              { handler: handleAgentEnd,             category: "agent",      canIntercept: false },
  "turn_start":             { handler: handleTurnStart,            category: "agent",      canIntercept: false },
  "turn_end":               { handler: handleTurnEnd,              category: "agent",      canIntercept: false },
  "message_start":          { handler: handleMessageStart,         category: "message",    canIntercept: false },
  "message_update":         { handler: handleMessageUpdate,        category: "message",    canIntercept: false },
  "message_end":            { handler: handleMessageEnd,           category: "message",    canIntercept: false },
  "tool_call":              { handler: handleToolCall,             category: "tool",       canIntercept: true  },
  "tool_result":            { handler: handleToolResult,           category: "tool",       canIntercept: true  },
  "tool_execution_start":   { handler: handleToolExecutionStart,   category: "tool",       canIntercept: false },
  "tool_execution_update":  { handler: handleToolExecutionUpdate,  category: "tool",       canIntercept: false },
  "tool_execution_end":     { handler: handleToolExecutionEnd,     category: "tool",       canIntercept: false },
  "context":                { handler: handleContext,              category: "tool",       canIntercept: true  },
  "before_provider_request": { handler: handleBeforeProviderRequest, category: "tool",     canIntercept: true  },
  "input":                  { handler: handleInput,                category: "input",      canIntercept: true  },
  "user_bash":              { handler: handleUserBash,             category: "input",      canIntercept: true  },
  "model_select":           { handler: handleModelSelect,          category: "model",      canIntercept: false },
  "resources_discover":     { handler: handleResourcesDiscover,    category: "resource",   canIntercept: true  },
};

// ── Public API ─────────────────────────────────────────────────────

/**
 * Route a raw pi event through its handler and produce a NormalizedEvent.
 *
 * - Looks up the handler by event name
 * - Calls it (sync, no I/O)
 * - Wraps the returned fields into a full NormalizedEvent
 * - On handler error, writes an error row (decision 10.6)
 *
 * Returns null only if the event name is unknown (should never happen
 * since we register exactly the names in ALL_EVENT_NAMES).
 */
export function routeEvent(
  eventName: string,
  rawEvent: unknown,
  meta: EventMeta,
): NormalizedEvent | null {
  const route = ROUTES[eventName];
  if (!route) return null;

  let fields: EventFields;
  try {
    fields = route.handler(rawEvent, meta);
  } catch (err) {
    // Decision 10.6: handler crash → write error row, don't lose the event
    fields = { handlerError: String(err) };
  }

  return {
    id: uuid(),
    eventName,
    category: route.category,
    canIntercept: route.canIntercept,
    schemaVersion: SCHEMA_VERSION,
    ts: Date.now(),
    seq: meta.seq,
    sessionId: meta.sessionId,
    cwd: meta.cwd,
    fields,
  };
}

/**
 * All 30 event names this extension handles.
 * Used by index.ts to register pi.on() listeners.
 */
export const ALL_EVENT_NAMES = Object.keys(ROUTES);
