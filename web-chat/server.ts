import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createLogger } from "../lib/logger.ts";
import { requestLogger } from "../lib/request-logger.ts";
import { captureError } from "../lib/errors.ts";
import {
  createPoolSession,
  destroyPoolSession,
  extractHistory,
  getAvailableCommands,
  getContextUsageInfo,
  getForkPoints,
  getPoolSession,
  getSessionInfo,
  getSessionStatsInfo,
  resolveDialog,
  setSessionModel,
  setUnsubscribe,
} from "./lib/session-pool.ts";
import { parseClientMessage, send } from "./lib/ws-protocol.ts";

const PORT = Number(process.env.CHAT_PORT ?? "3334");
const CWD = process.env.CHAT_CWD ?? process.cwd();
const log = createLogger("web-chat");

const app = new Hono();
app.use("/*", cors({ origin: "*" }));
app.use("*", requestLogger(log));
const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });

// Health check (used by harness-ui to detect if chat service is up)
app.get("/", (c) => c.json({ status: "ok", service: "chat-ws" }));

// ─── Helpers ──────────────────────────────────────────────────────

function sendContextUsage(ws: any, session: any) {
  const usage = getContextUsageInfo(session);
  if (usage) send(ws, { type: "context_usage", ...usage });
}

function sendStats(ws: any, session: any) {
  send(ws, { type: "session_stats", ...getSessionStatsInfo(session) });
}

function sendFullState(ws: any, session: any) {
  send(ws, { type: "session_info", ...getSessionInfo(session) });
  sendContextUsage(ws, session);
  sendStats(ws, session);
  send(ws, {
    type: "settings_update",
    autoCompact: session.autoCompactionEnabled,
    autoRetry: session.autoRetryEnabled,
  });
}

// ─── Shared event subscriber ─────────────────────────────────────
// De-duplicated: both init paths use this.

function subscribeSession(ws: any, session: any) {
  return session.subscribe((ev: any) => {
    switch (ev.type) {
      case "message_update":
        if (ev.assistantMessageEvent?.type === "text_delta")
          send(ws, { type: "text_delta", text: ev.assistantMessageEvent.delta });
        if (ev.assistantMessageEvent?.type === "thinking_delta")
          send(ws, { type: "thinking_delta", text: ev.assistantMessageEvent.delta });
        break;
      case "tool_execution_start":
        send(ws, { type: "tool_start", toolName: ev.toolName, toolCallId: ev.toolCallId ?? "", input: ev.args ?? {} });
        break;
      case "tool_execution_update": {
        // partialResult has { content: [{type:"text", text:"..."}], details?: {...}, isError?: bool }
        const updateText =
          ev.partialResult?.content
            ?.filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("") ?? "";
        send(ws, { type: "tool_update", toolCallId: ev.toolCallId ?? "", output: updateText });
        break;
      }
      case "tool_execution_end": {
        // result has { content: [{type:"text", text:"..."}], details?: {...}, isError?: bool }
        const resultText =
          ev.result?.content
            ?.filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("") ?? "";
        send(ws, {
          type: "tool_end",
          toolCallId: ev.toolCallId ?? "",
          isError: ev.isError ?? false,
          output: resultText,
        });
        break;
      }
      case "agent_start":
        send(ws, { type: "agent_start" });
        break;
      case "agent_end":
        send(ws, { type: "agent_end" });
        break;
      case "turn_start":
        send(ws, { type: "turn_start" });
        break;
      case "turn_end":
        send(ws, { type: "turn_end" });
        sendContextUsage(ws, session);
        sendStats(ws, session);
        break;
      case "message_start":
        if (ev.message?.role) send(ws, { type: "message_start", role: ev.message.role });
        break;
      case "message_end":
        send(ws, { type: "message_end" });
        break;

      // P3: Auto-compaction events
      case "auto_compaction_start":
        send(ws, { type: "auto_compact_start", reason: ev.reason ?? "threshold" });
        break;
      case "auto_compaction_end":
        send(ws, {
          type: "auto_compact_end",
          aborted: ev.aborted ?? false,
          summary: ev.result?.summary,
          error: ev.errorMessage,
        });
        sendContextUsage(ws, session);
        break;

      // P3: Auto-retry events
      case "auto_retry_start":
        send(ws, {
          type: "auto_retry_start",
          attempt: ev.attempt,
          maxAttempts: ev.maxAttempts,
          delayMs: ev.delayMs,
          error: ev.errorMessage ?? "",
        });
        break;
      case "auto_retry_end":
        send(ws, { type: "auto_retry_end", success: ev.success, attempt: ev.attempt, error: ev.finalError });
        break;
    }
  });
}

// ─── Initialize a connection ─────────────────────────────────────

async function initConnection(
  ws: any,
  wsSend: Function,
  connId: string,
  connCwd: string,
  sessionFile?: string,
  createNew?: boolean,
) {
  send(ws, { type: "status", state: "initializing" });
  const session = await createPoolSession(connId, connCwd, wsSend as any, sessionFile, createNew);
  const unsub = subscribeSession(ws, session);
  setUnsubscribe(connId, unsub);
  sendFullState(ws, session);
  const history = extractHistory(session);
  if (history.length) send(ws, { type: "history", messages: history });
  send(ws, { type: "status", state: "idle" });
  return true;
}

// ─── WebSocket ────────────────────────────────────────────────────

app.get(
  "/ws",
  upgradeWebSocket((_c) => {
    const connId = randomUUID();
    let initialized = false;
    let connCwd = CWD;

    return {
      onOpen(_event, ws) {
        send(ws, { type: "status", state: "idle" });
        send(ws, { type: "cwd", cwd: connCwd });
      },

      async onMessage(event, ws) {
        const raw = typeof event.data === "string" ? event.data : (event.data?.toString?.() ?? "");
        const msg = parseClientMessage(raw);
        if (!msg) return;

        const wsSend = (m: Record<string, unknown>) => send(ws, m as any);

        try {
          // ─── CWD change ──────────────────────────────────
          if (msg.type === "set_cwd") {
            connCwd = msg.cwd;
            if (initialized) {
              await destroyPoolSession(connId);
              initialized = false;
            }
            send(ws, { type: "cwd", cwd: connCwd });
            send(ws, { type: "history", messages: [] });
            send(ws, { type: "status", state: "idle" });
            return;
          }

          // ─── UI dialog responses (no session needed) ─────
          if (msg.type === "ui:response") {
            resolveDialog(msg.id, msg.value);
            return;
          }

          // ─── Explicit init ───────────────────────────────
          if (msg.type === "init" && !initialized) {
            initialized = await initConnection(ws, wsSend, connId, connCwd, msg.sessionFile, msg.createNew);
            return;
          }

          // ─── Auto-init on first message ──────────────────
          if (!initialized && msg.type !== "list_sessions") {
            initialized = await initConnection(ws, wsSend, connId, connCwd);
          }

          const session = getPoolSession(connId);
          if (!session && msg.type !== "list_sessions") {
            send(ws, { type: "error", message: "No session — send a message first" });
            return;
          }

          // ─── Message handlers ────────────────────────────
          switch (msg.type) {
            case "prompt":
              send(ws, { type: "status", state: "streaming" });
              try {
                await session?.prompt(msg.text);
              } catch (err: any) {
                send(ws, { type: "error", message: err.message ?? "Prompt failed" });
              }
              send(ws, { type: "status", state: "idle" });
              break;

            case "steer":
              try {
                await session?.steer(msg.text);
              } catch (err) {
                captureError({ component: "web-chat", operation: "session.steer", error: err, severity: "degraded" });
              }
              break;

            case "followUp":
              try {
                await session?.followUp(msg.text);
              } catch (err) {
                captureError({
                  component: "web-chat",
                  operation: "session.followUp",
                  error: err,
                  severity: "degraded",
                });
              }
              break;

            case "compact":
              send(ws, { type: "status", state: "compacting" });
              try {
                const result = await session?.compact(msg.instructions);
                send(ws, { type: "compact_done", summary: result?.summary ?? "Compacted" });
                sendContextUsage(ws, session!);
                sendStats(ws, session!);
              } catch (err: any) {
                send(ws, { type: "error", message: `Compact failed: ${err.message}` });
              }
              send(ws, { type: "status", state: "idle" });
              break;

            case "abort":
              try {
                await session?.abort();
              } catch (err) {
                captureError({ component: "web-chat", operation: "session.abort", error: err, severity: "degraded" });
              }
              send(ws, { type: "status", state: "idle" });
              break;

            // ─── Session management ──────────────────────────
            case "new_session":
              try {
                await session?.newSession();
                sendFullState(ws, session!);
                send(ws, { type: "history", messages: [] });
              } catch (err: any) {
                send(ws, { type: "error", message: err.message });
              }
              break;

            case "switch_session":
              try {
                await session?.switchSession(msg.path);
                sendFullState(ws, session!);
                send(ws, { type: "history", messages: extractHistory(session!) });
              } catch (err: any) {
                send(ws, { type: "error", message: err.message });
              }
              break;

            case "list_sessions":
              try {
                const list = await SessionManager.list(connCwd);
                send(ws, {
                  type: "session_list",
                  sessions: list.map((s) => ({
                    id: s.id,
                    path: (s as any).path ?? "",
                    firstMessage: s.firstMessage ?? "",
                    messageCount: s.messageCount,
                  })),
                });
              } catch (err: any) {
                send(ws, { type: "error", message: err.message });
              }
              break;

            // ─── Model & thinking ────────────────────────────
            case "set_model":
              if (session) {
                const ok = await setSessionModel(session, msg.provider, msg.modelId);
                if (ok) sendFullState(ws, session);
                else send(ws, { type: "error", message: `Model not found: ${msg.provider}/${msg.modelId}` });
              }
              break;

            case "set_thinking":
              if (session) {
                session.setThinkingLevel(msg.level as any);
                send(ws, { type: "session_info", ...getSessionInfo(session) });
              }
              break;

            // ─── P2: Session stats & name ────────────────────
            case "get_stats":
              if (session) sendStats(ws, session);
              break;

            case "set_name":
              if (session) {
                session.setSessionName(msg.name);
                send(ws, { type: "session_info", ...getSessionInfo(session) });
              }
              break;

            // ─── P3: Auto-compaction/retry toggles ───────────
            case "set_auto_compact":
              if (session) {
                session.setAutoCompactionEnabled(msg.enabled);
                send(ws, {
                  type: "settings_update",
                  autoCompact: session.autoCompactionEnabled,
                  autoRetry: session.autoRetryEnabled,
                });
              }
              break;

            case "set_auto_retry":
              if (session) {
                session.setAutoRetryEnabled(msg.enabled);
                send(ws, {
                  type: "settings_update",
                  autoCompact: session.autoCompactionEnabled,
                  autoRetry: session.autoRetryEnabled,
                });
              }
              break;

            // ─── P4: Branching ───────────────────────────────
            case "fork":
              if (session) {
                try {
                  const result = await session.fork(msg.entryId);
                  send(ws, { type: "forked", sessionFile: result.sessionFile ?? "" });
                  sendFullState(ws, session);
                  send(ws, { type: "history", messages: extractHistory(session) });
                } catch (err: any) {
                  send(ws, { type: "error", message: `Fork failed: ${err.message}` });
                }
              }
              break;

            case "get_fork_points":
              if (session) {
                send(ws, { type: "fork_points", points: getForkPoints(session) });
              }
              break;

            // ─── P5: List commands ──────────────────────────
            case "list_commands":
              if (session) {
                send(ws, { type: "command_list", commands: getAvailableCommands(session) });
              }
              break;

            // ─── P6: Export, copy, reload ────────────────────
            case "export_html":
              if (session) {
                try {
                  const path = await session.exportToHtml();
                  send(ws, { type: "exported_html", path });
                } catch (err: any) {
                  send(ws, { type: "error", message: `Export failed: ${err.message}` });
                }
              }
              break;

            case "copy_last":
              if (session) {
                const text = session.getLastAssistantText();
                send(ws, { type: "copied_text", text: text ?? "" });
              }
              break;

            case "reload":
              if (session) {
                try {
                  await session.reload();
                  send(ws, { type: "session_info", ...getSessionInfo(session) });
                } catch (err: any) {
                  send(ws, { type: "error", message: `Reload failed: ${err.message}` });
                }
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
  }),
);

// ─── Start ────────────────────────────────────────────────────────

const server = serve({ fetch: app.fetch, port: PORT }, () => {
  log.info({ port: PORT }, "web-chat listening");
});
injectWebSocket(server);

// ── Graceful shutdown ────────────────────────────────────────────
process.on("SIGTERM", () => { log.info("SIGTERM received, shutting down"); process.exit(0); });
process.on("SIGINT", () => { log.info("SIGINT received, shutting down"); process.exit(0); });
