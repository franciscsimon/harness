import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ─── Parallel Implementations Extension ───────────────────────────
// Run multiple implementations from same checkpoint, pick the best.
// Pattern: Parallel Implementations — "Roll five dice, not one"
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/parallel-implementations
// Builds on: agent-spawner (background-agent)

interface Attempt {
  id: number;
  branch: string;
  status: "running" | "done" | "failed" | "picked";
  description: string;
}

export default function (pi: ExtensionAPI) {
  let attempts: Attempt[] = [];
  let nextId = 1;
  let task = "";

  pi.on("session_start", async () => { attempts = []; nextId = 1; task = ""; });

  pi.registerCommand("parallel", {
    description: "Run parallel implementations of the same task",
    getArgumentCompletions: (prefix: string) => [
      { value: "start", label: "start <n> <task> — Spawn N parallel attempts" },
      { value: "status", label: "status — Show all attempts" },
      { value: "pick", label: "pick <id> — Pick the winning attempt" },
      { value: "compare", label: "compare — Ask AI to compare attempts" },
    ].filter((i) => i.value.startsWith(prefix)),
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/) ?? ["status"];
      const cmd = parts[0] ?? "status";

      if (cmd === "start") {
        const n = Number(parts[1]) || 3;
        task = parts.slice(2).join(" ");
        if (!task) { ctx.ui.notify("Usage: /parallel start <count> <task description>", "error"); return; }

        for (let i = 0; i < n; i++) {
          const id = nextId++;
          const branch = `parallel-${id}`;
          attempts.push({ id, branch, status: "running", description: task });

          // Create worktree directory for each attempt
          const worktreeDir = join(ctx.cwd, `.parallel-${id}`);
          if (!existsSync(worktreeDir)) {
            mkdirSync(worktreeDir, { recursive: true });
          }
        }

        ctx.ui.setStatus("parallel", `🎲 ${n} attempts`);
        ctx.ui.notify(
          `🎲 Spawned ${n} parallel attempts for: ${task}\n` +
            `Each will try a different approach.\n` +
            `Use /parallel status to check progress, /parallel pick <id> to choose winner.\n\n` +
            `To delegate to background agents, use:\n` +
            attempts.map((a) => `  /spawn Attempt #${a.id}: ${task} (try a different approach)`).join("\n"),
          "success",
        );
        return;
      }

      if (cmd === "pick") {
        const id = Number(parts[1]);
        const attempt = attempts.find((a) => a.id === id);
        if (!attempt) { ctx.ui.notify(`Attempt #${id} not found.`, "error"); return; }
        attempt.status = "picked";
        ctx.ui.notify(`🏆 Picked attempt #${id}. Merge its changes into main.`, "success");
        return;
      }

      if (cmd === "compare") {
        if (attempts.length === 0) { ctx.ui.notify("No attempts. Use /parallel start.", "info"); return; }
        pi.sendUserMessage(
          `Compare the ${attempts.length} parallel attempts for: "${task}"\n` +
            `Rate each on: correctness, simplicity, performance, maintainability.\n` +
            `Recommend which to pick or which elements to combine.`,
          { deliverAs: "followUp" },
        );
        return;
      }

      // Default: status
      if (attempts.length === 0) { ctx.ui.notify("No parallel attempts. Use /parallel start <n> <task>.", "info"); return; }
      const lines = attempts.map((a) => {
        const icon = { running: "🔄", done: "✅", failed: "❌", picked: "🏆" }[a.status];
        return `  ${icon} #${a.id} [${a.status}] ${a.branch}`;
      });
      ctx.ui.notify(`🎲 Parallel Attempts:\n  Task: ${task}\n${lines.join("\n")}`, "info");
    },
  });
}
