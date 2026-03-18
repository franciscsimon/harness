export type ClientMessage =
  | { type: "init"; sessionFile?: string }
  | { type: "prompt"; text: string }
  | { type: "steer"; text: string }
  | { type: "followUp"; text: string }
  | { type: "compact"; instructions?: string }
  | { type: "abort" }
  | { type: "new_session" }
  | { type: "switch_session"; path: string }
  | { type: "list_sessions" }
  | { type: "set_model"; provider: string; modelId: string }
  | { type: "set_thinking"; level: string }
  | { type: "set_cwd"; cwd: string }
  // P2: Session info
  | { type: "get_stats" }
  | { type: "set_name"; name: string }
  // P4: Branching
  | { type: "fork"; entryId: string }
  | { type: "get_fork_points" }
  // P5: Slash commands
  | { type: "command"; name: string; args?: string }
  // P5: Commands
  | { type: "list_commands" }
  // P6: Extras
  | { type: "export_html" }
  | { type: "copy_last" }
  | { type: "reload" }
  | { type: "set_auto_compact"; enabled: boolean }
  | { type: "set_auto_retry"; enabled: boolean }
  // UI dialog responses
  | { type: "ui:response"; id: string; value: any };

export type ServerMessage =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "tool_start"; toolName: string; toolCallId: string; input: Record<string, unknown> }
  | { type: "tool_update"; toolCallId: string; output: string }
  | { type: "tool_end"; toolCallId: string; isError: boolean }
  | { type: "message_start"; role: string }
  | { type: "message_end" }
  | { type: "agent_start" }
  | { type: "agent_end" }
  | { type: "turn_start" }
  | { type: "turn_end" }
  | { type: "session_info"; sessionId: string; sessionFile?: string; model: string; provider?: string; thinkingLevel: string; isStreaming: boolean; sessionName?: string }
  | { type: "session_list"; sessions: Array<{ id: string; path: string; firstMessage: string; messageCount: number }> }
  | { type: "history"; messages: Array<{ role: string; text: string; toolCalls?: Array<{ name: string; input: string; output: string; isError: boolean }> }> }
  | { type: "error"; message: string }
  | { type: "status"; state: "idle" | "streaming" | "initializing" | "compacting" }
  | { type: "cwd"; cwd: string }
  | { type: "ui:notify"; message: string; level: string }
  | { type: "ui:status"; key: string; text: string }
  | { type: "ui:confirm"; id: string; title: string; message: string }
  | { type: "ui:select"; id: string; title: string; options: string[] }
  | { type: "ui:input"; id: string; title: string; placeholder?: string }
  | { type: "compact_done"; summary: string }
  | { type: "context_usage"; tokens: number | null; contextWindow: number; percent: number | null }
  // P2: Session stats
  | { type: "session_stats"; userMessages: number; assistantMessages: number; toolCalls: number; totalMessages: number; tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }; cost: number }
  // P3: Auto-compaction/retry events
  | { type: "auto_compact_start"; reason: string }
  | { type: "auto_compact_end"; aborted: boolean; summary?: string; error?: string }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number; delayMs: number; error: string }
  | { type: "auto_retry_end"; success: boolean; attempt: number; error?: string }
  // P4: Branching
  | { type: "fork_points"; points: Array<{ id: string; text: string }> }
  | { type: "forked"; sessionFile: string }
  // P5: Commands
  | { type: "command_list"; commands: Array<{ name: string; description: string; source: string }> }
  // P6: Extras
  | { type: "exported_html"; path: string }
  | { type: "copied_text"; text: string }
  | { type: "settings_update"; autoCompact: boolean; autoRetry: boolean };

export function parseClientMessage(raw: string): ClientMessage | null {
  try { return JSON.parse(raw); } catch { return null; }
}

export function send(ws: { send: (data: string) => void }, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg));
}
