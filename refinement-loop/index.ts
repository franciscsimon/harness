import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── Refinement Loop Extension ────────────────────────────────────
// Structured iterative refinement: generate → review → refine → repeat.
// Pattern: Refinement Loop — "Iterate over imperfect output"
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/refinement-loop

export default function (pi: ExtensionAPI) {
  let active = false;
  let iteration = 0;
  let task = "";

  function reset() {
    active = false;
    iteration = 0;
    task = "";
  }

  // ── Inject refinement prompt when active ──
  pi.on("before_agent_start", async (event, ctx) => {
    if (!active) return;

    const refinementPrompt = [
      "",
      "---",
      "",
      `🔄 REFINEMENT LOOP (iteration ${iteration})`,
      "",
      "You are in refinement mode. Follow these rules:",
      "1. Complete the current step of the task.",
      "2. STOP and present your output clearly.",
      "3. Ask the user: 'Does this match your intent? What should I change?'",
      "4. Do NOT proceed to the next step until the user approves.",
      "5. Be concise — show what changed, not everything.",
      "",
      task ? `Original task: ${task}` : "",
    ].join("\n");

    return {
      systemPrompt: (event as any).systemPrompt + refinementPrompt,
    };
  });

  // ── Track iterations ──
  pi.on("agent_end", async (_event, ctx) => {
    if (active) {
      iteration++;
      ctx.ui.setStatus("refine", `🔄 Refining (iter ${iteration})`);
    }
  });

  // ── Reset on session ──
  pi.on("session_start", async (_event, ctx) => {
    // Restore from session entries
    active = false;
    iteration = 0;
    task = "";
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "refinement-state") {
        const data = (entry as any).data;
        active = data?.active ?? false;
        iteration = data?.iteration ?? 0;
        task = data?.task ?? "";
      }
    }
    if (active) {
      ctx.ui.setStatus("refine", `🔄 Refining (iter ${iteration})`);
    }
  });

  // ── /refine command ──
  pi.registerCommand("refine", {
    description: "Start/manage a refinement loop",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "start", label: "start [task] — Begin refinement mode" },
        { value: "approve", label: "approve — Approve current iteration" },
        { value: "done", label: "done — End refinement mode" },
        { value: "status", label: "status — Show refinement status" },
      ];
      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/) ?? ["status"];
      const cmd = parts[0] ?? "status";

      if (cmd === "start") {
        task = parts.slice(1).join(" ") || "";
        active = true;
        iteration = 0;
        pi.appendEntry("refinement-state", { active: true, iteration: 0, task });
        ctx.ui.setStatus("refine", "🔄 Refining (iter 0)");
        ctx.ui.notify(
          `🔄 Refinement loop started.\n` +
          (task ? `Task: ${task}\n` : "") +
          `The agent will now pause after each step for your review.\n` +
          `Commands: /refine approve | done`,
          "success",
        );
        return;
      }

      if (cmd === "approve") {
        if (!active) {
          ctx.ui.notify("No active refinement. Use /refine start.", "error");
          return;
        }
        ctx.ui.notify(`✅ Iteration ${iteration} approved. Agent will continue.`, "success");
        pi.sendUserMessage("Approved. Continue to the next step.", { deliverAs: "followUp" });
        return;
      }

      if (cmd === "done") {
        active = false;
        pi.appendEntry("refinement-state", { active: false, iteration, task });
        ctx.ui.setStatus("refine", "");
        ctx.ui.notify(`🔄 Refinement loop ended after ${iteration} iterations.`, "info");
        return;
      }

      if (cmd === "status") {
        if (!active) {
          ctx.ui.notify("No active refinement loop. Use /refine start [task].", "info");
          return;
        }
        ctx.ui.notify(
          `🔄 Refinement Loop:\n` +
          `  Active: yes\n` +
          `  Iteration: ${iteration}\n` +
          `  Task: ${task || "(none)"}`,
          "info",
        );
        return;
      }

      ctx.ui.notify("Usage: /refine start [task] | approve | done | status", "error");
    },
  });
}
