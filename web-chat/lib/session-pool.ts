import { createAgentSession, SessionManager, AuthStorage, ModelRegistry, type AgentSession } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";

const MAX_SESSIONS = 5;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

interface PoolEntry {
  session: AgentSession;
  lastActivity: number;
  unsubscribe?: () => void;
}

const pool = new Map<string, PoolEntry>();
const authStorage = AuthStorage.create();
const modelRegistry = new ModelRegistry(authStorage);

export async function createPoolSession(connectionId: string, cwd: string): Promise<AgentSession> {
  if (pool.size >= MAX_SESSIONS) {
    const oldest = [...pool.entries()].sort((a, b) => a[1].lastActivity - b[1].lastActivity)[0];
    if (oldest) await destroyPoolSession(oldest[0]);
  }

  const { session } = await createAgentSession({
    sessionManager: SessionManager.create(cwd),
    authStorage,
    modelRegistry,
  });

  pool.set(connectionId, { session, lastActivity: Date.now() });
  return session;
}

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

export function getSessionInfo(session: AgentSession): { sessionId: string; model: string; thinkingLevel: string; isStreaming: boolean } {
  return {
    sessionId: session.sessionId,
    model: session.model?.id ?? "unknown",
    thinkingLevel: session.thinkingLevel,
    isStreaming: session.isStreaming,
  };
}

export function extractHistory(session: AgentSession): Array<{ role: string; text: string; toolCalls?: Array<{ name: string; input: string; output: string; isError: boolean }> }> {
  const msgs: Array<{ role: string; text: string; toolCalls?: Array<{ name: string; input: string; output: string; isError: boolean }> }> = [];
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

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pool) {
    if (now - entry.lastActivity > IDLE_TIMEOUT_MS) destroyPoolSession(id);
  }
}, 60_000);
