import {
  createAgentSession, SessionManager, AuthStorage, ModelRegistry,
  DefaultResourceLoader,
  type AgentSession, type ExtensionAPI, type SessionStats,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { randomUUID } from "node:crypto";

// emitSessionShutdownEvent is not re-exported from the main index
import { emitSessionShutdownEvent } from "@mariozechner/pi-coding-agent/dist/core/extensions/runner.js";

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
      timer = setTimeout(() => { pendingDialogs.delete(id); resolve(undefined); }, timeoutMs);
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

function patchUi(ctx: any, wsSend: WsSend) {
  if (!ctx?.ui) return;
  const ui = ctx.ui;

  // notify
  if (!ui.notify?.__patched) {
    const orig = ui.notify?.bind(ui);
    ui.notify = Object.assign((message: string, level?: string) => {
      wsSend({ type: "ui:notify", message, level: level ?? "info" });
      return orig?.(message, level);
    }, { __patched: true });
  }

  // setStatus
  if (!ui.setStatus?.__patched) {
    const orig = ui.setStatus?.bind(ui);
    ui.setStatus = Object.assign((key: string, text: string) => {
      wsSend({ type: "ui:status", key, text });
      return orig?.(key, text);
    }, { __patched: true });
  }

  // confirm → async round-trip to client
  if (!ui.confirm?.__patched) {
    ui.confirm = Object.assign(
      (title: string, message: string, opts?: { timeout?: number }) => {
        return requestDialog(wsSend, { type: "ui:confirm", title, message }, opts?.timeout);
      },
      { __patched: true },
    );
  }

  // select → async round-trip to client
  if (!ui.select?.__patched) {
    ui.select = Object.assign(
      (title: string, options: string[], opts?: { timeout?: number }) => {
        return requestDialog(wsSend, { type: "ui:select", title, options }, opts?.timeout);
      },
      { __patched: true },
    );
  }

  // input → async round-trip to client
  if (!ui.input?.__patched) {
    ui.input = Object.assign(
      (title: string, placeholder?: string, opts?: { timeout?: number }) => {
        return requestDialog(wsSend, { type: "ui:input", title, placeholder }, opts?.timeout);
      },
      { __patched: true },
    );
  }
}

function createUiBridge(wsSend: WsSend): (pi: ExtensionAPI) => void {
  return (pi: ExtensionAPI) => {
    pi.on("session_start", async (_event, ctx) => patchUi(ctx, wsSend));
    pi.on("agent_start", async (_event, ctx) => patchUi(ctx, wsSend));
  };
}

// ─── Session Creation ─────────────────────────────────────────────

export async function createPoolSession(
  connectionId: string,
  cwd: string,
  wsSend: WsSend,
  sessionFile?: string,
): Promise<AgentSession> {
  if (pool.size >= MAX_SESSIONS) {
    const oldest = [...pool.entries()].sort((a, b) => a[1].lastActivity - b[1].lastActivity)[0];
    if (oldest) await destroyPoolSession(oldest[0]);
  }

  let sessionManager;
  if (sessionFile) {
    try { sessionManager = SessionManager.open(sessionFile); }
    catch { sessionManager = SessionManager.continueRecent(cwd); }
  } else {
    sessionManager = SessionManager.continueRecent(cwd);
  }

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    extensionFactories: [createUiBridge(wsSend)],
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    sessionManager,
    authStorage,
    modelRegistry,
    resourceLoader,
  });

  // P1 FIX: Bind extensions so session_start fires and tools register
  await session.bindExtensions({
    shutdownHandler: async () => {
      // Called when session is shutting down
    },
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
  } catch { /* best-effort cleanup */ }

  entry.session.dispose();
  pool.delete(connectionId);
}

export function poolSize(): number { return pool.size; }

export async function setSessionModel(session: AgentSession, provider: string, modelId: string): Promise<boolean> {
  const model = getModel(provider, modelId);
  if (!model) return false;
  await session.setModel(model);
  return true;
}

// ─── Context & Stats ──────────────────────────────────────────────

export function getContextUsageInfo(session: AgentSession): {
  tokens: number | null; contextWindow: number; percent: number | null;
} | null {
  const usage = session.getContextUsage();
  if (!usage) return null;
  return { tokens: usage.tokens, contextWindow: usage.contextWindow, percent: usage.percent };
}

// P2: Session stats for sidebar
export function getSessionStatsInfo(session: AgentSession): {
  userMessages: number; assistantMessages: number; toolCalls: number; totalMessages: number;
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
  sessionId: string; sessionFile?: string; model: string; provider?: string;
  thinkingLevel: string; isStreaming: boolean; sessionName?: string;
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
  role: string; text: string;
  toolCalls?: Array<{ name: string; input: string; output: string; isError: boolean }>;
}> {
  const msgs: Array<{
    role: string; text: string;
    toolCalls?: Array<{ name: string; input: string; output: string; isError: boolean }>;
  }> = [];

  for (const m of session.messages) {
    if (m.role === "user") {
      const text = m.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      if (text) msgs.push({ role: "user", text });
    } else if (m.role === "assistant") {
      const text = m.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      const toolCalls = m.content
        .filter((b: any) => b.type === "tool_use")
        .map((b: any) => ({ name: b.name, input: JSON.stringify(b.input ?? {}, null, 2), output: "", isError: false }));
      if (text || toolCalls.length) msgs.push({ role: "assistant", text, toolCalls: toolCalls.length ? toolCalls : undefined });
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
  } catch { return []; }
}

// Evict idle sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pool) {
    if (now - entry.lastActivity > IDLE_TIMEOUT_MS) destroyPoolSession(id);
  }
}, 60_000);
