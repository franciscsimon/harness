import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { parseClientMessage, send } from "./lib/ws-protocol.ts";
import {
  createPoolSession, getPoolSession, destroyPoolSession, setUnsubscribe,
  setSessionModel, getSessionInfo, extractHistory, poolSize,
} from "./lib/session-pool.ts";
import { renderChat } from "./pages/chat.ts";

const PORT = Number(process.env.CHAT_PORT ?? "3334");
const CWD = process.env.CHAT_CWD ?? process.cwd();
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = new Hono();
const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });

app.get("/static/:file", (c) => {
  const file = c.req.param("file");
  const types: Record<string, string> = {
    "chat.js": "application/javascript",
    "chat.css": "text/css",
    "style.css": "text/css",
  };
  const ct = types[file];
  if (!ct) return c.text("Not found", 404);
  try {
    let path = join(__dirname, "static", file);
    if (file === "style.css") path = join(__dirname, "..", "xtdb-event-logger-ui", "static", "style.css");
    const content = readFileSync(path, "utf-8");
    return c.body(content, 200, { "Content-Type": ct + "; charset=utf-8" });
  } catch { return c.text("Not found", 404); }
});

app.get("/", (c) => c.html(renderChat()));

app.get("/ws", upgradeWebSocket((c) => {
  const connId = randomUUID();
  let initialized = false;
  let connCwd = CWD;

  return {
    onOpen(_event, ws) {
      send(ws, { type: "status", state: "idle" });
      send(ws, { type: "cwd", cwd: connCwd });
    },

    async onMessage(event, ws) {
      const raw = typeof event.data === "string" ? event.data : event.data?.toString?.() ?? "";
      const msg = parseClientMessage(raw);
      if (!msg) return;

      try {
        if (msg.type === "set_cwd") {
          connCwd = msg.cwd;
          // If already initialized, destroy old session so next prompt creates a new one
          if (initialized) {
            await destroyPoolSession(connId);
            initialized = false;
          }
          send(ws, { type: "cwd", cwd: connCwd });
          send(ws, { type: "history", messages: [] });
          send(ws, { type: "status", state: "idle" });
          return;
        }

        if (msg.type === "init" && !initialized) {
          send(ws, { type: "status", state: "initializing" });
          const session = await createPoolSession(connId, connCwd, msg.sessionFile);

          const unsub = session.subscribe((ev: any) => {
            switch (ev.type) {
              case "message_update":
                if (ev.assistantMessageEvent?.type === "text_delta")
                  send(ws, { type: "text_delta", text: ev.assistantMessageEvent.delta });
                if (ev.assistantMessageEvent?.type === "thinking_delta")
                  send(ws, { type: "thinking_delta", text: ev.assistantMessageEvent.delta });
                break;
              case "tool_execution_start":
                send(ws, { type: "tool_start", toolName: ev.toolName, toolCallId: ev.toolCallId ?? "", input: ev.input ?? {} });
                break;
              case "tool_execution_update":
                send(ws, { type: "tool_update", toolCallId: ev.toolCallId ?? "", output: ev.text ?? "" });
                break;
              case "tool_execution_end":
                send(ws, { type: "tool_end", toolCallId: ev.toolCallId ?? "", isError: ev.isError ?? false });
                break;
              case "agent_start": send(ws, { type: "agent_start" }); break;
              case "agent_end": send(ws, { type: "agent_end" }); break;
              case "turn_start": send(ws, { type: "turn_start" }); break;
              case "turn_end": send(ws, { type: "turn_end" }); break;
              case "message_start":
                if (ev.message?.role) send(ws, { type: "message_start", role: ev.message.role });
                break;
              case "message_end": send(ws, { type: "message_end" }); break;
            }
          });
          setUnsubscribe(connId, unsub);
          initialized = true;

          send(ws, { type: "session_info", ...getSessionInfo(session) });
          const history = extractHistory(session);
          if (history.length) send(ws, { type: "history", messages: history });
          send(ws, { type: "status", state: "idle" });
          return;
        }

        if (!initialized && msg.type !== "list_sessions") {
          send(ws, { type: "status", state: "initializing" });
          const session = await createPoolSession(connId, connCwd);

          const unsub = session.subscribe((ev: any) => {
            switch (ev.type) {
              case "message_update":
                if (ev.assistantMessageEvent?.type === "text_delta")
                  send(ws, { type: "text_delta", text: ev.assistantMessageEvent.delta });
                if (ev.assistantMessageEvent?.type === "thinking_delta")
                  send(ws, { type: "thinking_delta", text: ev.assistantMessageEvent.delta });
                break;
              case "tool_execution_start":
                send(ws, { type: "tool_start", toolName: ev.toolName, toolCallId: ev.toolCallId ?? "", input: ev.input ?? {} });
                break;
              case "tool_execution_update":
                send(ws, { type: "tool_update", toolCallId: ev.toolCallId ?? "", output: ev.text ?? "" });
                break;
              case "tool_execution_end":
                send(ws, { type: "tool_end", toolCallId: ev.toolCallId ?? "", isError: ev.isError ?? false });
                break;
              case "agent_start": send(ws, { type: "agent_start" }); break;
              case "agent_end": send(ws, { type: "agent_end" }); break;
              case "turn_start": send(ws, { type: "turn_start" }); break;
              case "turn_end": send(ws, { type: "turn_end" }); break;
              case "message_start":
                if (ev.message?.role) send(ws, { type: "message_start", role: ev.message.role });
                break;
              case "message_end": send(ws, { type: "message_end" }); break;
            }
          });
          setUnsubscribe(connId, unsub);
          initialized = true;

          send(ws, { type: "session_info", ...getSessionInfo(session) });
          const history = extractHistory(session);
          if (history.length) send(ws, { type: "history", messages: history });
          send(ws, { type: "status", state: "idle" });
        }

        const session = getPoolSession(connId);
        if (!session && msg.type !== "list_sessions") {
          send(ws, { type: "error", message: "No session — send a message first" });
          return;
        }

        switch (msg.type) {
          case "prompt":
            send(ws, { type: "status", state: "streaming" });
            try {
              await session!.prompt(msg.text);
            } catch (err: any) {
              send(ws, { type: "error", message: err.message ?? "Prompt failed" });
            }
            send(ws, { type: "status", state: "idle" });
            break;

          case "steer":
            try { await session!.steer(msg.text); } catch {}
            break;

          case "abort":
            try { await session!.abort(); } catch {}
            send(ws, { type: "status", state: "idle" });
            break;

          case "new_session":
            try {
              await session!.newSession();
              send(ws, { type: "session_info", ...getSessionInfo(session!) });
              send(ws, { type: "history", messages: [] });
            } catch (err: any) { send(ws, { type: "error", message: err.message }); }
            break;

          case "switch_session":
            try {
              await session!.switchSession(msg.path);
              send(ws, { type: "session_info", ...getSessionInfo(session!) });
              send(ws, { type: "history", messages: extractHistory(session!) });
            } catch (err: any) { send(ws, { type: "error", message: err.message }); }
            break;

          case "list_sessions":
            try {
              const list = await SessionManager.list(connCwd);
              send(ws, { type: "session_list", sessions: list.map(s => ({ id: s.id, path: (s as any).path ?? "", firstMessage: s.firstMessage ?? "", messageCount: s.messageCount })) });
            } catch (err: any) { send(ws, { type: "error", message: err.message }); }
            break;

          case "set_model":
            if (session) {
              const ok = await setSessionModel(session, msg.provider, msg.modelId);
              if (ok) send(ws, { type: "session_info", ...getSessionInfo(session) });
              else send(ws, { type: "error", message: `Model not found: ${msg.provider}/${msg.modelId}` });
            }
            break;

          case "set_thinking":
            if (session) {
              session.setThinkingLevel(msg.level as any);
              send(ws, { type: "session_info", ...getSessionInfo(session) });
            }
            break;
        }
      } catch (err: any) {
        send(ws, { type: "error", message: err.message ?? "Unknown error" });
      }
    },

    onClose() {
      destroyPoolSession(connId);
    },
  };
}));

const server = serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`\n  💬 pi Chat UI\n  → http://localhost:${PORT}\n  → Pool: ${poolSize()} sessions\n`);
});
injectWebSocket(server);
