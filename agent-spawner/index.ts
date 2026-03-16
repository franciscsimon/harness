import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

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
  let agents: SpawnedAgent[] = [];
  let nextId = 1;

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

  // ── Notify about agents on shutdown ──
  pi.on("session_shutdown", async (_event, ctx) => {
    const running = agents.filter((a) => a.status === "running");
    if (running.length > 0) {
      ctx.ui.notify(
        `⚠️ ${running.length} background agent(s) may still be running.`,
        "warn",
      );
    }
  });
}

function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}
