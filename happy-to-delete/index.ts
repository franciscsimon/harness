import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

// ─── Happy to Delete Extension ────────────────────────────────────
// Tracks all files created/modified by the agent in a session.
// Makes it easy to see what AI generated (safe to delete/regenerate).
// Pattern: Happy to Delete — "AI code is cheap to regenerate"
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/happy-to-delete

export default function (pi: ExtensionAPI) {
  let createdFiles: Set<string> = new Set();
  let modifiedFiles: Set<string> = new Set();
  let sessionCwd = "";

  function reset() {
    createdFiles.clear();
    modifiedFiles.clear();
  }

  pi.on("session_start", async (_event, ctx) => {
    reset();
    sessionCwd = ctx.cwd;
  });

  pi.on("tool_call", async (event) => {
    const e = event as any;
    if (e.toolName === "write" && e.input?.path) {
      createdFiles.add(e.input.path);
    }
    if (e.toolName === "edit" && e.input?.path) {
      modifiedFiles.add(e.input.path);
    }
  });

  pi.on("session_shutdown", async () => {
    if (createdFiles.size === 0 && modifiedFiles.size === 0) return;

    try {
      const outDir = join(sessionCwd, ".pi");
      mkdirSync(outDir, { recursive: true });

      const lines = [
        "# AI-Generated Files",
        "",
        `Session: ${new Date().toISOString()}`,
        "",
        "## Created (safe to delete and regenerate)",
        ...([...createdFiles].sort().map((f) => `- \`${f}\``)),
        "",
        "## Modified (review before deleting)",
        ...([...modifiedFiles].filter((f) => !createdFiles.has(f)).sort().map((f) => `- \`${f}\``)),
        "",
        `Total: ${createdFiles.size} created, ${modifiedFiles.size - createdFiles.size} modified`,
        "",
      ];

      writeFileSync(join(outDir, "ai-files.md"), lines.join("\n"), "utf-8");
    } catch {}
  });

  // ── /ai-files command ──
  pi.registerCommand("ai-files", {
    description: "List files created/modified by the AI in this session",
    handler: async (_args, ctx) => {
      if (createdFiles.size === 0 && modifiedFiles.size === 0) {
        ctx.ui.notify("No files created or modified by the AI yet.", "info");
        return;
      }

      const created = [...createdFiles].sort();
      const modified = [...modifiedFiles].filter((f) => !createdFiles.has(f)).sort();

      const lines = [
        `🗑 AI-Generated Files:`,
        "",
        `Created (${created.length} — safe to delete):`,
        ...created.map((f) => `  ✨ ${f}`),
      ];

      if (modified.length > 0) {
        lines.push("", `Modified (${modified.length} — review before deleting):`);
        lines.push(...modified.map((f) => `  ✏️ ${f}`));
      }

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
