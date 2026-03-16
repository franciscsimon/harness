import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── Offload Deterministic Extension ──────────────────────────────
// Detect when AI is doing deterministic work that should be a script.
// Pattern: Offload Deterministic — "AI explores, code repeats"
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/offload-deterministic

const DETERMINISTIC_PATTERNS = [
  { re: /\bcount\b.*\blines?\b|\bwc -l\b/i, label: "counting" },
  { re: /\bfind and replace\b|\bsed\b.*\bs\//i, label: "find-replace" },
  { re: /\brename\b.*\bfiles?\b/i, label: "file renaming" },
  { re: /\bformat\b|\bprettier\b|\beslint --fix\b/i, label: "formatting" },
  { re: /\bsort\b.*\b(lines?|list|array)\b/i, label: "sorting" },
  { re: /\bconvert\b.*\b(json|csv|xml|yaml)\b/i, label: "format conversion" },
  { re: /\bgenerate\b.*\b(uuid|id|hash)\b/i, label: "ID generation" },
  { re: /\bcopy\b.*\bfiles?\b|\bcp -r\b/i, label: "file copying" },
];

export default function (pi: ExtensionAPI) {
  let repeatedCommands: Map<string, number> = new Map();
  let notified = new Set<string>();

  pi.on("session_start", async () => { repeatedCommands.clear(); notified.clear(); });
  pi.on("agent_start", async () => { notified.clear(); });

  pi.on("tool_call", async (event, ctx) => {
    const e = event as any;
    if (e.toolName !== "bash" || !e.input?.command) return;
    const cmd = String(e.input.command);

    // Track repeated commands (normalize by removing variable parts)
    const normalized = cmd.replace(/[0-9a-f]{8,}/g, "ID").replace(/"[^"]*"/g, "STR").slice(0, 80);
    const count = (repeatedCommands.get(normalized) ?? 0) + 1;
    repeatedCommands.set(normalized, count);

    if (count >= 3 && !notified.has(normalized)) {
      notified.add(normalized);
      ctx.ui.notify(
        `⚙️ Offload: This command pattern has run ${count} times.\n` +
          `  Pattern: ${normalized.slice(0, 60)}\n` +
          `Consider writing a script instead of repeating it manually.`,
        "warn",
      );
    }

    // Check for deterministic work patterns
    for (const p of DETERMINISTIC_PATTERNS) {
      if (p.re.test(cmd) && !notified.has(p.label)) {
        notified.add(p.label);
        ctx.ui.notify(
          `⚙️ Offload: "${p.label}" is deterministic work.\n` +
            `Consider writing a reusable script instead of doing it inline.`,
          "info",
        );
        break;
      }
    }
  });

  pi.registerCommand("offload", {
    description: "Show repeated commands that should be scripts",
    handler: async (_args, ctx) => {
      const repeated = [...repeatedCommands.entries()]
        .filter(([_, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1]);

      if (repeated.length === 0) {
        ctx.ui.notify("⚙️ No repeated command patterns detected yet.", "info");
        return;
      }

      const lines = repeated.map(([cmd, c]) => `  ${c}x  ${cmd}`);
      ctx.ui.notify(`⚙️ Repeated commands (candidates for scripts):\n${lines.join("\n")}`, "info");
    },
  });
}
