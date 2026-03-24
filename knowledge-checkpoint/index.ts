import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

// ─── Knowledge Checkpoint Extension ───────────────────────────────
// Periodically saves context snapshots so you can restore from
// a known-good point if the session goes off track.
// Pattern: Knowledge Checkpoint — "Save periodic snapshots"
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/knowledge-checkpoint

const CHECKPOINT_DIR = join(process.env.HOME ?? "~", ".pi", "agent", "checkpoints");
const DEFAULT_INTERVAL = 5; // turns between auto-checkpoints

export default function (pi: ExtensionAPI) {
  let turnIndex = 0;
  let checkpointCount = 0;
  const interval = DEFAULT_INTERVAL;
  let filesModified: string[] = [];
  let toolUsage: Record<string, number> = {};
  let errorCount = 0;
  let lastCheckpointTurn = 0;
  let sessionName = "session";

  function reset() {
    turnIndex = 0;
    checkpointCount = 0;
    filesModified = [];
    toolUsage = {};
    errorCount = 0;
    lastCheckpointTurn = 0;
  }

  function getSessionSlug(): string {
    return sessionName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  }

  function saveCheckpoint(label: string, ctx: any, entryId?: string): string {
    checkpointCount++;
    mkdirSync(CHECKPOINT_DIR, { recursive: true });

    const slug = getSessionSlug();
    const filename = `${slug}-cp${checkpointCount}-${label}.md`;
    const filepath = join(CHECKPOINT_DIR, filename);

    const uniqueFiles = [...new Set(filesModified)];
    const sortedTools = Object.entries(toolUsage).sort((a, b) => b[1] - a[1]);

    const md = [
      `# Checkpoint ${checkpointCount}: ${label}`,
      ``,
      `**Session:** \`${sessionName}\``,
      `**Turn:** ${turnIndex} · **Errors:** ${errorCount}`,
      `**Files modified:** ${uniqueFiles.length}`,
      ``,
      `## Files Modified`,
      ...uniqueFiles.map((f) => `- \`${f}\``),
      ``,
      `## Tool Usage`,
      ...sortedTools.map(([t, c]) => `- ${t}: ${c}`),
      ``,
      `## State`,
      `Checkpoint saved at turn ${turnIndex}.`,
      ``,
    ].join("\n");

    writeFileSync(filepath, md, "utf-8");

    // Mark in session tree if we have an entry ID
    if (entryId) {
      try {
        pi.setLabel(entryId, `checkpoint-${checkpointCount}`);
      } catch {}
    }

    ctx.ui.setStatus("checkpoint", `📍 ${checkpointCount} checkpoints`);
    return filepath;
  }

  // ── Session lifecycle ──
  pi.on("session_start", async (_event, ctx) => {
    reset();
    const name = pi.getSessionName();
    if (name) sessionName = name;
    ctx.ui.setStatus("checkpoint", "📍 0 checkpoints");
  });

  // ── Track turns ──
  pi.on("turn_start", async (_event) => {
    turnIndex++;
  });

  pi.on("turn_end", async (_event, ctx) => {
    // Auto-checkpoint every N turns
    if (turnIndex - lastCheckpointTurn >= interval && turnIndex > 0) {
      lastCheckpointTurn = turnIndex;
      const path = saveCheckpoint(`auto-turn${turnIndex}`, ctx);
      ctx.ui.notify(`📍 Auto-checkpoint saved: ${path}`, "info");
    }
  });

  // ── Track tool usage ──
  pi.on("tool_execution_end", async (event) => {
    const e = event as any;
    const name = e.toolName ?? "unknown";
    toolUsage[name] = (toolUsage[name] ?? 0) + 1;
    if (e.isError) errorCount++;
  });

  // ── Track file modifications ──
  pi.on("tool_call", async (event) => {
    const e = event as any;
    if ((e.toolName === "write" || e.toolName === "edit") && e.input?.path) {
      filesModified.push(e.input.path);
    }
  });

  // ── Final checkpoint on shutdown ──
  pi.on("session_shutdown", async (_event, ctx) => {
    if (turnIndex > 0) {
      saveCheckpoint("final", ctx);
    }
  });

  // ── /checkpoint command ──
  pi.registerCommand("checkpoint", {
    description: "Manage knowledge checkpoints",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "save", label: "save [label] — Save a checkpoint now" },
        { value: "list", label: "list — Show checkpoints for this session" },
        { value: "info", label: "info — Show checkpoint stats" },
      ];
      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/) ?? ["info"];
      const cmd = parts[0] ?? "info";

      if (cmd === "save") {
        const label = parts.slice(1).join("-") || `manual-turn${turnIndex}`;
        const path = saveCheckpoint(label, ctx);
        ctx.ui.notify(`📍 Checkpoint saved: ${path}`, "success");
        return;
      }

      if (cmd === "list") {
        mkdirSync(CHECKPOINT_DIR, { recursive: true });
        const slug = getSessionSlug();
        const files = readdirSync(CHECKPOINT_DIR)
          .filter((f) => f.startsWith(slug) && f.endsWith(".md"))
          .sort();

        if (files.length === 0) {
          ctx.ui.notify("No checkpoints for this session.", "info");
          return;
        }

        const lines = files.map((f, i) => `  ${i + 1}. ${f}`);
        ctx.ui.notify(`📍 Checkpoints:\n${lines.join("\n")}\n\nDir: ${CHECKPOINT_DIR}`, "info");
        return;
      }

      if (cmd === "info") {
        const uniqueFiles = [...new Set(filesModified)];
        ctx.ui.notify(
          `📍 Checkpoint Info:\n` +
            `  Turn: ${turnIndex}\n` +
            `  Checkpoints: ${checkpointCount}\n` +
            `  Auto-interval: every ${interval} turns\n` +
            `  Files modified: ${uniqueFiles.length}\n` +
            `  Errors: ${errorCount}\n` +
            `  Next auto-checkpoint: turn ${lastCheckpointTurn + interval}`,
          "info",
        );
        return;
      }

      ctx.ui.notify("Usage: /checkpoint save [label] | list | info", "error");
    },
  });

  // ── Tool: save_checkpoint — LLM-callable ──
  pi.registerTool({
    name: "save_checkpoint",
    label: "Save Checkpoint",
    description: "Save a knowledge checkpoint with current session state — files modified, tool usage, decisions made.",
    promptSnippet: "Save a checkpoint of current session progress and decisions",
    promptGuidelines: ["Use save_checkpoint before major refactoring or risky changes."],
    parameters: Type.Object({ label: Type.Optional(Type.String({ description: "Checkpoint label" })) }),
    async execute(_tid: any, params: any, _s: any, _u: any, ctx: any) {
      const label = params.label || `agent-checkpoint-turn${turnIndex}`;
      const path = saveCheckpoint(label, ctx);
      return { content: [{ type: "text", text: `📍 Checkpoint saved: ${path}` }], details: { path } };
    },
  });
}
