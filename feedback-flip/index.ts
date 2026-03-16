import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── Feedback Flip Extension ──────────────────────────────────────
// Flip from producing to evaluating: AI implements, then AI critiques.
// Pattern: Feedback Flip — "First output is rarely optimal"
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/feedback-flip

export default function (pi: ExtensionAPI) {
  let flipActive = false;
  let lastOutput = "";
  let flipCount = 0;

  pi.on("session_start", async () => {
    flipActive = false;
    lastOutput = "";
    flipCount = 0;
  });

  // ── Inject critique prompt when flip is active ──
  pi.on("before_agent_start", async (event) => {
    if (!flipActive) return;
    return {
      systemPrompt: (event as any).systemPrompt +
        "\n\n---\n\n" +
        "🔄 FEEDBACK FLIP MODE: You are now in CRITIQUE mode.\n" +
        "Your task is to EVALUATE, not implement. Find problems and suggest improvements.\n" +
        "Look for: bugs, edge cases, missing error handling, performance issues,\n" +
        "code style, security concerns, unnecessary complexity.\n" +
        "Be specific and actionable. Don't just say 'could be better' — say how.",
    };
  });

  // ── /flip command ──
  pi.registerCommand("flip", {
    description: "Toggle feedback flip mode (produce → evaluate)",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "on", label: "on — Switch to critique/evaluation mode" },
        { value: "off", label: "off — Switch back to implementation mode" },
        { value: "status", label: "status — Show current mode" },
      ];
      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const cmd = args?.trim() ?? "status";

      if (cmd === "on") {
        flipActive = true;
        flipCount++;
        ctx.ui.setStatus("flip", "🔄 Critique mode");
        ctx.ui.notify(
          "🔄 Feedback Flip: CRITIQUE mode active.\n" +
            "Agent will focus on finding problems and suggesting improvements.\n" +
            "Use /flip off to return to implementation mode.",
          "success",
        );
        pi.sendUserMessage(
          "Switch to critique mode. Review what was just implemented. " +
            "Find problems, suggest improvements. Be specific and actionable.",
          { deliverAs: "followUp" },
        );
        return;
      }

      if (cmd === "off") {
        flipActive = false;
        ctx.ui.setStatus("flip", "");
        ctx.ui.notify("🔄 Feedback Flip: Back to implementation mode.", "info");
        return;
      }

      ctx.ui.notify(
        `🔄 Feedback Flip:\n  Mode: ${flipActive ? "CRITIQUE" : "IMPLEMENT"}\n  Flips: ${flipCount}`,
        "info",
      );
    },
  });
}
