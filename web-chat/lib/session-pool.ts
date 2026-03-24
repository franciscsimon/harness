import { randomUUID } from "node:crypto";
import { getModel } from "@mariozechner/pi-ai";
import {
  type AgentSession,
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
} from "@mariozechner/pi-coding-agent";

const MAX_SESSIONS = 5;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

type WsSend = (msg: Record<string, unknown>) => void;

// ─── UI Dialog Round-Trip ─────────────────────────────────────────
// Extensions call ctx.ui.confirm/select/input → we send a WS message,
// wait for the client to respond, then resolve the promise.

const pendingDialogs = new Map<string, { resolve: (value: any) => void; timer?: ReturnType<typeof setTimeout> }>();

export function resolveDialog(id: string, value: any): void {
  const entry = pendingDialogs.get(id);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  pendingDialogs.delete(id);
  entry.resolve(value);
}

function requestDialog(wsSend: WsSend, msg: Record<string, unknown>, timeoutMs?: number): Promise<any> {
  const id = randomUUID();
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        pendingDialogs.delete(id);
        resolve(undefined);
      }, timeoutMs);
    }
    pendingDialogs.set(id, { resolve, timer });
    wsSend({ ...msg, id });
  });
}

interface PoolEntry {
  session: AgentSession;
  lastActivity: number;
  unsubscribe?: () => void;
}

const pool = new Map<string, PoolEntry>();
const authStorage = AuthStorage.create();
const modelRegistry = new ModelRegistry(authStorage);

// ─── UI Bridge Extension Factory ─────────────────────────────────

// Build a UIContext that forwards all operations to the WebSocket client.
// This is passed to bindExtensions so ALL extension contexts (commands, tools,
// event handlers) get the same working UI — not just those patched in event hooks.
function buildUiContext(wsSend: WsSend): any {
  return {
    notify: (message: string, type?: string) => {
      wsSend({ type: "ui:notify", message, level: type ?? "info" });
    },
    setStatus: (key: string, text: string | undefined) => {
      wsSend({ type: "ui:status", key, text: text ?? "" });
    },
    setWorkingMessage: (_message?: string) => {
      /* no-op for web */
    },
    setWidget: (_key: string, _content: any, _options?: any) => {
      /* no-op for web */
    },
    setFooter: (_factory: any) => {
      /* no-op for web */
    },
    setHeader: (_factory: any) => {
      /* no-op for web */
    },
    setTitle: (_title: string) => {
      /* no-op for web */
    },
    onTerminalInput: (_handler: any) => () => {},
    select: (title: string, options: string[], opts?: { timeout?: number }) => {
      return requestDialog(wsSend, { type: "ui:select", title, options }, opts?.timeout);
    },
    confirm: (title: string, message: string, opts?: { timeout?: number }) => {
      return requestDialog(wsSend, { type: "ui:confirm", title, message }, opts?.timeout);
    },
    input: (title: string, placeholder?: string, opts?: { timeout?: number }) => {
      return requestDialog(wsSend, { type: "ui:input", title, placeholder }, opts?.timeout);
    },
    custom: async () => undefined,
    pasteToEditor: () => {},
    setEditorText: () => {},
    getEditorText: () => "",
    editor: async () => undefined,
    setEditorComponent: () => {},
    get theme() {
      return undefined;
    },
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: false, error: "UI not available" }),
    getToolsExpanded: () => false,
    setToolsExpanded: () => {},
  };
}

// ─── Session Creation ─────────────────────────────────────────────

export async function createPoolSession(
  connectionId: string,
  cwd: string,
  wsSend: WsSend,
  sessionFile?: string,
  createNew?: boolean,
): Promise<AgentSession> {
  if (pool.size >= MAX_SESSIONS) {
    const oldest = [...pool.entries()].sort((a, b) => a[1].lastActivity - b[1].lastActivity)[0];
    if (oldest) await destroyPoolSession(oldest[0]);
  }

  let sessionManager;
  if (createNew) {
    sessionManager = SessionManager.create(cwd);
  } else if (sessionFile) {
    try {
      sessionManager = SessionManager.open(sessionFile);
    } catch {
      sessionManager = SessionManager.continueRecent(cwd);
    }
  } else {
    sessionManager = SessionManager.continueRecent(cwd);
  }

  const resourceLoader = new DefaultResourceLoader({ cwd });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    sessionManager,
    authStorage,
    modelRegistry,
    resourceLoader,
  });

  // Bind extensions with a real uiContext so commands/tools/hooks all have working UI
  await session.bindExtensions({
    uiContext: buildUiContext(wsSend),
    shutdownHandler: async () => {},
    onError: (err) => {
      wsSend({ type: "error", message: `Extension error: ${err?.message ?? err}` });
    },
  });

  pool.set(connectionId, { session, lastActivity: Date.now() });
  return session;
}

// ─── Pool Operations ──────────────────────────────────────────────

export function getPoolSession(connectionId: string): AgentSession | undefined {
  const entry = pool.get(connectionId);
  if (entry) entry.lastActivity = Date.now();
  return entry?.session;
}

export function setUnsubscribe(connectionId: string, unsub: () => void): void {
  const entry = pool.get(connectionId);
  if (entry) entry.unsubscribe = unsub;
}

export async function destroyPoolSession(connectionId: string): Promise<void> {
  const entry = pool.get(connectionId);
  if (!entry) return;
  entry.unsubscribe?.();

  // P1 FIX: Fire session_shutdown so extensions clean up (close DB connections, flush writes)
  try {
    // dispose() handles extension cleanup including session_shutdown events
  } catch {
    /* best-effort cleanup */
  }

  entry.session.dispose();
  pool.delete(connectionId);
}

export function poolSize(): number {
  return pool.size;
}

export async function setSessionModel(session: AgentSession, provider: string, modelId: string): Promise<boolean> {
  const model = getModel(provider, modelId);
  if (!model) return false;
  await session.setModel(model);
  return true;
}

// ─── Context & Stats ──────────────────────────────────────────────

export function getContextUsageInfo(session: AgentSession): {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
} | null {
  const usage = session.getContextUsage();
  if (!usage) return null;
  return { tokens: usage.tokens, contextWindow: usage.contextWindow, percent: usage.percent };
}

// P2: Session stats for sidebar
export function getSessionStatsInfo(session: AgentSession): {
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  totalMessages: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost: number;
} {
  const stats = session.getSessionStats();
  return {
    userMessages: stats.userMessages,
    assistantMessages: stats.assistantMessages,
    toolCalls: stats.toolCalls,
    totalMessages: stats.totalMessages,
    tokens: stats.tokens,
    cost: stats.cost,
  };
}

export function getSessionInfo(session: AgentSession): {
  sessionId: string;
  sessionFile?: string;
  model: string;
  provider?: string;
  thinkingLevel: string;
  isStreaming: boolean;
  sessionName?: string;
} {
  return {
    sessionId: session.sessionId,
    sessionFile: session.sessionFile ?? undefined,
    model: session.model?.id ?? "unknown",
    provider: session.model?.provider ?? undefined,
    thinkingLevel: session.thinkingLevel,
    isStreaming: session.isStreaming,
    sessionName: session.sessionName ?? undefined,
  };
}

export function extractHistory(session: AgentSession): Array<{
  role: string;
  text: string;
  toolCalls?: Array<{ name: string; input: string; output: string; isError: boolean }>;
}> {
  const msgs: Array<{
    role: string;
    text: string;
    toolCalls?: Array<{ name: string; input: string; output: string; isError: boolean }>;
  }> = [];

  // Build a map of tool results from toolResult messages
  // Format: { role: "toolResult", toolCallId: "...", content: [{type:"text", text:"..."}], isError: bool }
  const toolResults = new Map<string, { output: string; isError: boolean }>();
  for (const m of session.messages) {
    if (m.role === "toolResult") {
      const mr = m as any;
      const text = (mr.content ?? [])
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");
      if (mr.toolCallId) toolResults.set(mr.toolCallId, { output: text, isError: mr.isError ?? false });
    }
  }

  for (const m of session.messages) {
    if (m.role === "user") {
      const text = m.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n");
      if (text) msgs.push({ role: "user", text });
    } else if (m.role === "assistant") {
      const text = m.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n");
      const toolCalls = m.content
        .filter((b: any) => b.type === "tool_use" || b.type === "toolCall")
        .map((b: any) => {
          const result = toolResults.get(b.id);
          const input = b.input ?? b.arguments ?? {};
          return {
            name: b.name,
            input: JSON.stringify(input, null, 2),
            output: result?.output ?? "",
            isError: result?.isError ?? false,
          };
        });
      if (text || toolCalls.length)
        msgs.push({ role: "assistant", text, toolCalls: toolCalls.length ? toolCalls : undefined });
    }
  }
  return msgs;
}

// P2: Get fork points for branching UI
export function getForkPoints(session: AgentSession): Array<{ id: string; text: string }> {
  try {
    return session.getUserMessagesForForking().map((m) => ({
      id: m.id,
      text: (m.text ?? "").slice(0, 100),
    }));
  } catch {
    return [];
  }
}

// P5: List all available slash commands (built-in + extension)
export function getAvailableCommands(
  session: AgentSession,
): Array<{ name: string; description: string; source: string }> {
  const cmds: Array<{ name: string; description: string; source: string }> = [];

  // Built-in web-chat commands
  for (const [name, desc] of Object.entries({
    compact: "Compact session context",
    copy: "Copy last assistant reply",
    export: "Export session to HTML",
    reload: "Reload extensions/skills/prompts",
    stats: "Show session stats",
    name: "Set session display name",
    followup: "Queue a follow-up message",
    new: "Start new session (button)",
    help: "Show available commands",
  })) {
    cmds.push({ name, description: desc, source: "web-chat" });
  }

  // Extension-registered commands
  const runner = session.extensionRunner;
  if (runner) {
    const reserved = new Set(cmds.map((c) => c.name));
    for (const cmd of runner.getRegisteredCommands(reserved)) {
      cmds.push({ name: cmd.name, description: cmd.description ?? "", source: "extension" });
    }
  }

  return cmds.sort((a, b) => a.name.localeCompare(b.name));
}

// Evict idle sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pool) {
    if (now - entry.lastActivity > IDLE_TIMEOUT_MS) destroyPoolSession(id);
  }
}, 60_000);
