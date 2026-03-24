import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── Orchestrator Extension ───────────────────────────────────────
// Coordinate multiple background agents: monitor, integrate, verify.
// Pattern: Orchestrator — "Dedicated agent for integration work"
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/orchestrator
// Builds on: agent-spawner (background-agent pattern)

interface OrcTask {
  id: number;
  description: string;
  status: "pending" | "active" | "done" | "failed";
  assignedAgent: string | null;
  result: string | null;
  createdAt: number;
}

export default function (pi: ExtensionAPI) {
  let tasks: OrcTask[] = [];
  let nextId = 1;
  let orchestrating = false;

  pi.on("session_start", async (_event, _ctx) => {
    tasks = [];
    nextId = 1;
    orchestrating = false;
  });

  // ── Inject orchestrator prompt when active ──
  pi.on("before_agent_start", async (event) => {
    if (!orchestrating) return;

    const pending = tasks.filter((t) => t.status === "pending");
    const active = tasks.filter((t) => t.status === "active");
    const done = tasks.filter((t) => t.status === "done");

    return {
      systemPrompt:
        (event as any).systemPrompt +
        "\n\n---\n\n" +
        "🎭 ORCHESTRATOR MODE\n" +
        "You are coordinating multiple tasks. Your job:\n" +
        "1. Monitor task progress\n" +
        "2. Integrate completed work\n" +
        "3. Resolve conflicts between tasks\n" +
        "4. Verify integration (run tests)\n" +
        "5. Keep the main trunk healthy\n\n" +
        `Tasks: ${pending.length} pending, ${active.length} active, ${done.length} done\n` +
        tasks.map((t) => `  [${t.status}] #${t.id}: ${t.description}`).join("\n"),
    };
  });

  // ── /orchestrate command ──
  pi.registerCommand("orchestrate", {
    description: "Manage orchestrated tasks",
    getArgumentCompletions: (prefix: string) =>
      [
        { value: "plan", label: "plan <task1> | <task2> | ... — Plan tasks from pipe-separated list" },
        { value: "add", label: "add <description> — Add a task" },
        { value: "status", label: "status — Show all tasks" },
        { value: "start", label: "start — Begin orchestration mode" },
        { value: "done", label: "done <id> — Mark task complete" },
        { value: "fail", label: "fail <id> — Mark task failed" },
        { value: "stop", label: "stop — End orchestration mode" },
      ].filter((i) => i.value.startsWith(prefix)),
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/) ?? ["status"];
      const cmd = parts[0] ?? "status";

      if (cmd === "plan") {
        const descriptions = parts
          .slice(1)
          .join(" ")
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean);
        if (descriptions.length === 0) {
          ctx.ui.notify("Usage: /orchestrate plan task1 | task2 | task3", "error");
          return;
        }
        for (const desc of descriptions) {
          tasks.push({
            id: nextId++,
            description: desc,
            status: "pending",
            assignedAgent: null,
            result: null,
            createdAt: Date.now(),
          });
        }
        orchestrating = true;
        ctx.ui.setStatus("orchestrator", `🎭 ${tasks.length} tasks`);
        ctx.ui.notify(`🎭 Planned ${descriptions.length} tasks. Use /orchestrate status to view.`, "success");
        return;
      }

      if (cmd === "add") {
        const desc = parts.slice(1).join(" ");
        if (!desc) {
          ctx.ui.notify("Usage: /orchestrate add <description>", "error");
          return;
        }
        tasks.push({
          id: nextId++,
          description: desc,
          status: "pending",
          assignedAgent: null,
          result: null,
          createdAt: Date.now(),
        });
        ctx.ui.setStatus("orchestrator", `🎭 ${tasks.length} tasks`);
        ctx.ui.notify(`🎭 Added task #${nextId - 1}: ${desc}`, "success");
        return;
      }

      if (cmd === "done" || cmd === "fail") {
        const id = Number(parts[1]);
        const task = tasks.find((t) => t.id === id);
        if (!task) {
          ctx.ui.notify(`Task #${id} not found.`, "error");
          return;
        }
        task.status = cmd === "done" ? "done" : "failed";
        const remaining = tasks.filter((t) => t.status === "pending" || t.status === "active").length;
        ctx.ui.setStatus("orchestrator", remaining > 0 ? `🎭 ${remaining} remaining` : "🎭 All done!");
        ctx.ui.notify(
          `${cmd === "done" ? "✅" : "❌"} Task #${id}: ${task.description}`,
          cmd === "done" ? "success" : "warn",
        );
        return;
      }

      if (cmd === "start") {
        orchestrating = true;
        ctx.ui.setStatus("orchestrator", `🎭 ${tasks.length} tasks`);
        ctx.ui.notify("🎭 Orchestration mode active.", "success");

        if (tasks.filter((t) => t.status === "pending").length > 0) {
          pi.sendUserMessage(
            "Orchestration mode active. Here are the pending tasks:\n" +
              tasks
                .filter((t) => t.status === "pending")
                .map((t) => `- #${t.id}: ${t.description}`)
                .join("\n") +
              "\n\nWork through them in order. After each, verify integration.",
            { deliverAs: "followUp" },
          );
        }
        return;
      }

      if (cmd === "stop") {
        orchestrating = false;
        ctx.ui.setStatus("orchestrator", "");
        const done = tasks.filter((t) => t.status === "done").length;
        ctx.ui.notify(`🎭 Orchestration stopped. ${done}/${tasks.length} tasks completed.`, "info");
        return;
      }

      // Default: status
      if (tasks.length === 0) {
        ctx.ui.notify("No tasks. Use /orchestrate plan or /orchestrate add.", "info");
        return;
      }
      const lines = tasks.map((t) => {
        const icon = { pending: "⬜", active: "🔄", done: "✅", failed: "❌" }[t.status];
        return `  ${icon} #${t.id} [${t.status}] ${t.description}`;
      });
      ctx.ui.notify(`🎭 Orchestrator:\n${lines.join("\n")}`, "info");
    },
  });
}
