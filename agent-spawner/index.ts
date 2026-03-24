import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { captureError } from "../lib/errors.ts";
import { spawn } from "node:child_process";
import { ids } from "../lib/jsonld/ids.ts";
import { JSONLD_CONTEXT } from "../lib/jsonld/context.ts";
import { connectXtdb, ensureConnected, type Sql } from "../lib/db.ts";
import { discoverAgents, formatAgentList } from "./agents.ts";

// ─── Agent Spawner Extension ──────────────────────────────────────
// Spawn separate pi sessions for parallel/background work.
// Pattern: Background Agent — "Spawn agents for parallel tasks"
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/background-agent

interface SpawnedAgent {
  id: number;
  task: string;
  sessionFile: string | null;
  spawnedAt: number;
  status: "running" | "done" | "unknown";
}

export default function (pi: ExtensionAPI) {
  if (process.env.XTDB_EVENT_LOGGING !== "true") return;

  let agents: SpawnedAgent[] = [];
  let nextId = 1;
  let sql: Sql | null = null;

  async function ensureDb(): Promise<Sql | null> {
    if (sql) return sql;
    try {
      sql = connectXtdb();
      if (!await ensureConnected(sql)) { sql = null; return null; }
      // Seed delegations table
      await sql`INSERT INTO delegations (_id, parent_session_id, child_session_id, agent_name, task, status, exit_code, ts, jsonld)
        VALUES ('_seed', '', '', '', '', '', 0, 0, '')`;
      await sql`DELETE FROM delegations WHERE _id = '_seed'`;
      return sql;
    } catch {
      sql = null;
      return null;
    }
  }

  async function persistDelegation(
    parentSessionId: string,
    childSessionId: string | null,
    agentName: string,
    task: string,
    status: string,
    exitCode: number,
  ): Promise<void> {
    const db = await ensureDb();
    if (!db) return;
    const t = (v: string | null) => db.typed(v as any, 25);
    const n = (v: number | null) => db.typed(v as any, 20);
    const id = ids.delegation();
    const now = Date.now();
    const projectId = (globalThis as any).__piCurrentProject?.projectId ?? null;
    const jsonld = JSON.stringify({
      "@context": JSONLD_CONTEXT,
      "@id": `urn:pi:${id}`,
      "@type": "prov:Activity",
      "prov:wasInformedBy": parentSessionId ? { "@id": `urn:pi:session:${parentSessionId}` } : null,
      "prov:generated": childSessionId ? { "@id": `urn:pi:session:${childSessionId}` } : null,
      "ev:agentName": agentName,
      "ev:task": task,
      "ev:status": status,
      "ev:exitCode": { "@value": String(exitCode), "@type": "xsd:integer" },
      "ev:ts": { "@value": String(now), "@type": "xsd:long" },
    });
    try {
      await db`INSERT INTO delegations (
        _id, parent_session_id, child_session_id, project_id, agent_name, task, status, exit_code, ts, jsonld
      ) VALUES (
        ${t(id)}, ${t(parentSessionId)}, ${t(childSessionId)},
        ${t(projectId)}, ${t(agentName)}, ${t(task.slice(0, 2000))},
        ${t(status)}, ${n(exitCode)}, ${n(now)}, ${t(jsonld)}
      )`;
    } catch (err) {
      console.error(`[agent-spawner] delegation persist failed: ${err}`);
    }
  }

  // ── Restore state ──
  pi.on("session_start", async (_event, ctx) => {
    agents = [];
    nextId = 1;
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "spawned-agents") {
        agents = (entry as any).data?.agents ?? [];
        nextId = agents.length > 0 ? Math.max(...agents.map((a) => a.id)) + 1 : 1;
      }
    }
    if (agents.length > 0) {
      ctx.ui.setStatus("agents", `🔀 ${agents.length} agents`);
    }
  });

  // ── /spawn command ──
  pi.registerCommand("spawn", {
    description: "Spawn a background agent for a subtask",
    handler: async (args, ctx) => {
      const task = args?.trim();
      if (!task) {
        ctx.ui.notify("Usage: /spawn <task description>", "error");
        return;
      }

      const id = nextId++;

      // Create new session with the task as initial context
      const result = await ctx.newSession({
        parentSession: ctx.sessionManager.getSessionFile() ?? undefined,
        setup: async (sm) => {
          sm.appendMessage({
            role: "user",
            content: [
              {
                type: "text",
                text: `Background task from parent session:\n\n${task}\n\nFocus only on this task. Do not modify unrelated files.`,
              },
            ],
            timestamp: Date.now(),
          });
        },
      });

      if (result.cancelled) {
        ctx.ui.notify("Background agent spawn was cancelled.", "warn");
        return;
      }

      const agent: SpawnedAgent = {
        id,
        task: task.slice(0, 100),
        sessionFile: ctx.sessionManager.getSessionFile(),
        spawnedAt: Date.now(),
        status: "running",
      };

      agents.push(agent);
      pi.appendEntry("spawned-agents", { agents });
      pi.setSessionName(`bg-${id}: ${task.slice(0, 40)}`);

      ctx.ui.setStatus("agents", `🔀 ${agents.length} agents`);
      ctx.ui.notify(
        `🔀 Background agent #${id} spawned.\n` +
          `Task: ${task.slice(0, 80)}\n` +
          `Use /agents list to check status.`,
        "success",
      );
    },
  });

  // ── /agents command ──
  pi.registerCommand("agents", {
    description: "Manage spawned background agents",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "list", label: "list — Show all spawned agents" },
        { value: "clear", label: "clear — Clear agent list" },
      ];
      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const cmd = args?.trim().split(/\s+/)[0] ?? "list";

      if (cmd === "list" || cmd === "") {
        if (agents.length === 0) {
          ctx.ui.notify("No background agents spawned.\nUse /spawn <task> to create one.", "info");
          return;
        }

        const lines = agents.map((a) => {
          const ago = formatAge(Date.now() - a.spawnedAt);
          return `  #${a.id} [${a.status}] ${ago} ago\n      ${a.task}`;
        });

        ctx.ui.notify(`🔀 Background Agents:\n\n${lines.join("\n\n")}`, "info");
        return;
      }

      if (cmd === "clear") {
        agents = [];
        pi.appendEntry("spawned-agents", { agents: [] });
        ctx.ui.setStatus("agents", "");
        ctx.ui.notify("Agent list cleared.", "info");
        return;
      }

      ctx.ui.notify("Usage: /agents list | clear", "error");
    },
  });

  // ── Notify about agents on shutdown + close DB ──
  pi.on("session_shutdown", async (_event, ctx) => {
    const running = agents.filter((a) => a.status === "running");
    if (running.length > 0) {
      ctx.ui.notify(
        `⚠️ ${running.length} background agent(s) may still be running.`,
        "warn",
      );
    }
    if (sql) {
      try { await sql.end(); } catch { /* cleanup — safe to ignore */ }
      sql = null;
    }
  });

  // ── Tool: delegate — LLM spawns a subagent process ──
  pi.registerTool({
    name: "delegate",
    label: "Delegate to Agent",
    description: "Delegate a task to a specialized agent running in a separate pi process with isolated context. Returns the agent's output.",
    promptSnippet: "Delegate a task to a specialized agent (separate process, isolated context)",
    promptGuidelines: [
      "Use delegate for tasks that benefit from a focused agent with clean context.",
      "Available agents: " + discoverAgents().map((a) => `${a.name} (${a.description})`).join(", "),
    ],
    parameters: Type.Object({
      agent: Type.Optional(Type.String({ description: "Agent name from ~/.pi/agent/agents/ (omit for default)" })),
      task: Type.String({ description: "Task description for the agent" }),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const agents = discoverAgents();
      let agentPrompt: string | undefined;
      let agentName = params.agent ?? "worker";

      if (params.agent) {
        const found = agents.find((a) => a.name === params.agent);
        if (!found) {
          throw new Error(`Agent "${params.agent}" not found. Available: ${agents.map((a) => a.name).join(", ")}`);
        }
        agentPrompt = found.systemPrompt;
        agentName = found.name;
      }

      onUpdate?.({
        content: [{ type: "text", text: `🔀 Delegating to ${agentName}...` }],
        details: { agent: agentName, status: "running" },
      });

      const result = await runSubagent(params.task, agentPrompt);

      // Persist delegation lineage to XTDB
      const parentSession = ctx.sessionManager?.getSessionFile?.() ?? "unknown";
      const status = result.exitCode === 0 ? "success" : "failure";
      persistDelegation(parentSession, result.childSessionId, agentName, params.task, status, result.exitCode);

      const icon = result.exitCode === 0 ? "✅" : "⚠️";
      return {
        content: [{ type: "text", text: `${icon} ${agentName} (exit ${result.exitCode}):\n\n${result.output}` }],
        details: { agent: agentName, exitCode: result.exitCode, childSessionId: result.childSessionId },
      };
    },
    renderCall(args: any, theme: any) {
      const { Text } = require("@mariozechner/pi-tui");
      const agent = args.agent ?? "worker";
      const task = String(args.task ?? "").slice(0, 60);
      return new Text(`${theme.fg("toolTitle", theme.bold("delegate "))}${theme.fg("accent", agent)} ${theme.fg("dim", task)}`, 0, 0);
    },
  });
}

function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}

interface SubagentResult {
  output: string;
  exitCode: number;
  childSessionId: string | null;
}

function runSubagent(task: string, agentPrompt?: string, cwd?: string): Promise<SubagentResult> {
  return new Promise((resolve) => {
    const args = ["--mode", "json", "-p", task];
    if (agentPrompt) args.push("--system-prompt", agentPrompt);

    const proc = spawn("pi", args, {
      cwd: cwd ?? process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

    const timeout = setTimeout(() => { proc.kill(); resolve({ output: "Timed out after 5 minutes", exitCode: 1, childSessionId: null }); }, 300_000);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      let finalOutput = stdout;
      let childSessionId: string | null = null;
      try {
        const lines = stdout.split("\n").filter((l) => l.trim());
        // Extract child session ID from the session line
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === "session" && parsed.id) {
              childSessionId = parsed.id;
            }
          } catch (err) {
            captureError({ component: "agent-spawner", operation: "parse agent stdout", error: err, severity: "degraded" });
          }
        }
        // Extract final assistant text
        for (let i = lines.length - 1; i >= 0; i--) {
          const parsed = JSON.parse(lines[i]);
          if (parsed.type === "message" && parsed.message?.role === "assistant") {
            const text = parsed.message.content?.find((c: any) => c.type === "text");
            if (text) { finalOutput = text.text; break; }
          }
        }
      } catch { /* use raw stdout */ }
      resolve({ output: finalOutput.slice(0, 10000), exitCode: code ?? 1, childSessionId });
    });

    proc.on("error", () => {
      clearTimeout(timeout);
      resolve({ output: `Failed to spawn pi: ${stderr}`, exitCode: 1, childSessionId: null });
    });
  });
}
