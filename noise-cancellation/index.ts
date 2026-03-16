import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── Noise Cancellation Extension ─────────────────────────────────
// Filter/truncate verbose tool results to keep context lean.
// Pattern: Noise Cancellation — "Filter verbose AI output"
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/noise-cancellation

type NoiseLevel = "verbose" | "normal" | "quiet";

interface NoiseLimits {
  maxBashLines: number;
  maxReadLines: number;
  maxToolResultChars: number;
}

const LIMITS: Record<NoiseLevel, NoiseLimits> = {
  verbose: { maxBashLines: 500, maxReadLines: 500, maxToolResultChars: 50_000 },
  normal: { maxBashLines: 100, maxReadLines: 200, maxToolResultChars: 20_000 },
  quiet: { maxBashLines: 30, maxReadLines: 50, maxToolResultChars: 5_000 },
};

export default function (pi: ExtensionAPI) {
  let level: NoiseLevel = "normal";
  let trimmedCount = 0;
  let savedBytes = 0;

  pi.on("session_start", async (_event, ctx) => {
    trimmedCount = 0;
    savedBytes = 0;

    // Restore from session
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "noise-level") {
        level = (entry as any).data?.level ?? "normal";
      }
    }
    ctx.ui.setStatus("noise", `🔇 ${level}`);
  });

  // ── Trim tool results ──
  pi.on("tool_result", async (event) => {
    const limits = LIMITS[level];
    if (!event.content || !Array.isArray(event.content)) return;

    let modified = false;
    const newContent = event.content.map((item: any) => {
      if (item.type !== "text" || !item.text) return item;

      let text = item.text;
      const originalLen = text.length;

      // Apply character limit
      if (text.length > limits.maxToolResultChars) {
        const half = Math.floor(limits.maxToolResultChars / 2);
        text = text.slice(0, half) +
          `\n\n... [${text.length - limits.maxToolResultChars} chars trimmed by noise-cancellation] ...\n\n` +
          text.slice(-half);
        modified = true;
      }

      // Apply line limit for bash results
      if (event.toolName === "bash") {
        const lines = text.split("\n");
        if (lines.length > limits.maxBashLines) {
          const keep = Math.floor(limits.maxBashLines / 2);
          text = lines.slice(0, keep).join("\n") +
            `\n... [${lines.length - limits.maxBashLines} lines trimmed] ...\n` +
            lines.slice(-keep).join("\n");
          modified = true;
        }
      }

      // Apply line limit for read results
      if (event.toolName === "read") {
        const lines = text.split("\n");
        if (lines.length > limits.maxReadLines) {
          text = lines.slice(0, limits.maxReadLines).join("\n") +
            `\n... [${lines.length - limits.maxReadLines} more lines trimmed] ...`;
          modified = true;
        }
      }

      if (modified) {
        savedBytes += originalLen - text.length;
        trimmedCount++;
      }

      return { ...item, text };
    });

    if (modified) {
      return { content: newContent };
    }
  });

  // ── /noise command ──
  pi.registerCommand("noise", {
    description: "Set noise cancellation level",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "verbose", label: "verbose — No filtering (500 lines, 50KB)" },
        { value: "normal", label: "normal — Moderate filtering (100 lines, 20KB)" },
        { value: "quiet", label: "quiet — Aggressive filtering (30 lines, 5KB)" },
        { value: "status", label: "status — Show current level and stats" },
      ];
      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const cmd = args?.trim() ?? "status";

      if (cmd === "verbose" || cmd === "normal" || cmd === "quiet") {
        level = cmd;
        pi.appendEntry("noise-level", { level });
        ctx.ui.setStatus("noise", `🔇 ${level}`);

        const limits = LIMITS[level];
        ctx.ui.notify(
          `🔇 Noise level: ${level}\n` +
            `  Bash: max ${limits.maxBashLines} lines\n` +
            `  Read: max ${limits.maxReadLines} lines\n` +
            `  Total: max ${Math.round(limits.maxToolResultChars / 1024)}KB per result`,
          "success",
        );
        return;
      }

      if (cmd === "status") {
        const limits = LIMITS[level];
        const savedKb = Math.round(savedBytes / 1024);
        ctx.ui.notify(
          `🔇 Noise Cancellation:\n` +
            `  Level: ${level}\n` +
            `  Limits: ${limits.maxBashLines} bash lines, ${limits.maxReadLines} read lines, ${Math.round(limits.maxToolResultChars / 1024)}KB\n` +
            `  Trimmed: ${trimmedCount} results (saved ~${savedKb}KB)`,
          "info",
        );
        return;
      }

      ctx.ui.notify("Usage: /noise verbose | normal | quiet | status", "error");
    },
  });
}
