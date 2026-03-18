export type ClientMessage =
  | { type: "init"; sessionFile?: string }
  | { type: "prompt"; text: string }
  | { type: "steer"; text: string }
  | { type: "abort" }
  | { type: "new_session" }
  | { type: "switch_session"; path: string }
  | { type: "list_sessions" }
  | { type: "set_model"; provider: string; modelId: string }
  | { type: "set_thinking"; level: string }
  | { type: "set_cwd"; cwd: string };

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
  | { type: "session_info"; sessionId: string; sessionFile?: string; model: string; thinkingLevel: string; isStreaming: boolean }
  | { type: "session_list"; sessions: Array<{ id: string; path: string; firstMessage: string; messageCount: number }> }
  | { type: "history"; messages: Array<{ role: string; text: string; toolCalls?: Array<{ name: string; input: string; output: string; isError: boolean }> }> }
  | { type: "error"; message: string }
  | { type: "status"; state: "idle" | "streaming" | "initializing" }
  | { type: "cwd"; cwd: string };

export function parseClientMessage(raw: string): ClientMessage | null {
  try { return JSON.parse(raw); } catch { return null; }
}

export function send(ws: { send: (data: string) => void }, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg));
}
