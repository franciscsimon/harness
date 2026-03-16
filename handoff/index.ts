import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { complete, getModel } from "@mariozechner/pi-ai";

// ─── Handoff Extension ────────────────────────────────────────────
// Transfer context to a new session with a generated prompt.
// Instead of compacting (lossy), handoff extracts what matters
// for the next task and puts it in the editor for review.

export default function (pi: ExtensionAPI) {
  pi.registerCommand("handoff", {
    description: "Generate a handoff prompt for a new session",
    handler: async (args, ctx) => {
      const nextTask = args?.trim() ?? "";

      // Gather current session context
      const entries = ctx.sessionManager.getEntries();
      const textParts: string[] = [];
      for (const entry of entries) {
        if (entry.type !== "message") continue;
        const msg = entry as any;
        if (!msg.message?.content) continue;
        for (const part of msg.message.content) {
          if (part.type === "text") {
            textParts.push(`[${msg.message.role}]: ${part.text.slice(0, 400)}`);
          }
        }
      }

      const context = textParts.slice(-30).join("\n\n").slice(0, 15000);

      const model = getModel("google:gemini-2.0-flash") ?? getModel("anthropic:claude-sonnet-4-20250514");
      if (!model) {
        ctx.ui.notify("No model available for handoff generation.", "error");
        return;
      }

      ctx.ui.notify("🤝 Generating handoff prompt...", "info");

      try {
        const result = await complete({
          model,
          messages: [{
            role: "user",
            content: [{
              type: "text",
              text: `Generate a handoff prompt for a new coding session. Extract from this conversation:
1. Project context (what codebase, what we're working on)
2. What was accomplished (key changes, files modified)
3. Current state (what works, what doesn't)
4. Key decisions and their rationale
5. Gotchas discovered
6. Next steps${nextTask ? `: specifically: ${nextTask}` : ""}

Be concise. The output should be a self-contained prompt that a fresh agent can use.

Conversation:
${context}`,
            }],
          }],
          maxTokens: 2000,
        });

        const handoffText = result.message.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("\n");

        // Put the generated prompt in the editor for review
        ctx.ui.setEditorText(handoffText);
        ctx.ui.notify(
          "🤝 Handoff prompt generated and placed in editor.\n" +
          "Review/edit it, then start a new session and paste it.",
          "success",
        );
      } catch (e) {
        ctx.ui.notify(`Handoff failed: ${e}`, "error");
      }
    },
  });
}
