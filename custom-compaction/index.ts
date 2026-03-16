import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { complete, getModel } from "@mariozechner/pi-ai";

// ─── Custom Compaction Extension ──────────────────────────────────
// Replaces default compaction with a full summary that preserves
// key decisions, file changes, and discovered gotchas.
// Pattern: Context Management — preserve structured knowledge.

export default function (pi: ExtensionAPI) {
  let filesModified: string[] = [];
  let decisions: string[] = [];

  pi.on("session_start", async () => {
    filesModified = [];
    decisions = [];
  });

  // Track file modifications
  pi.on("tool_execution_end", async (event) => {
    const e = event as any;
    if ((e.toolName === "write" || e.toolName === "edit") && !e.isError) {
      const path = e.input?.path;
      if (path && !filesModified.includes(path)) filesModified.push(path);
    }
  });

  // Intercept compaction to produce structured summary
  pi.on("session_before_compact", async (event, ctx) => {
    const e = event as any;
    const allMessages = [...(e.turnPrefixMessages ?? []), ...(e.messagesToSummarize ?? [])];

    // Extract text from all messages
    const textParts: string[] = [];
    for (const msg of allMessages) {
      if (!msg.content) continue;
      for (const part of msg.content) {
        if (part.type === "text" && part.text) {
          textParts.push(`[${msg.role}]: ${part.text.slice(0, 500)}`);
        }
      }
    }
    const conversationText = textParts.join("\n\n").slice(0, 30000);

    // Use a fast model to summarize
    const model = getModel("google:gemini-2.0-flash") ?? getModel("anthropic:claude-sonnet-4-20250514");
    if (!model) {
      // Fall back to default compaction
      return;
    }

    try {
      const filesSection = filesModified.length > 0
        ? `\nFiles modified this session: ${filesModified.join(", ")}`
        : "";

      const result = await complete({
        model,
        messages: [
          {
            role: "user",
            content: [{
              type: "text",
              text: `Summarize this coding session conversation into a structured compaction summary. Preserve:
1. What the user asked for (goal)
2. Key decisions made and their rationale
3. Files created/modified and why
4. Any gotchas, errors, or important discoveries
5. Current state — what's done and what remains

Be concise but complete. This summary replaces the conversation history.
${filesSection}

Conversation:
${conversationText}`,
            }],
          },
        ],
        maxTokens: 2000,
      });

      const summaryText = result.message.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");

      if (!summaryText) return;

      ctx.ui.notify("📝 Custom compaction: structured summary generated.", "info");

      return {
        summary: summaryText,
        dropMessages: true,
      };
    } catch (e) {
      // Fall back to default compaction on error
      ctx.ui.notify(`Compaction fallback: ${e}`, "warn");
      return;
    }
  });
}
