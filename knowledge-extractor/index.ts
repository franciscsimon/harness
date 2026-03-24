import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── Knowledge Extractor Extension ────────────────────────────────
// On session_shutdown, generates a summary markdown file from
// the session's tool usage, files touched, errors, and commands.

export default function (pi: ExtensionAPI) {
  // ── In-memory state ──
  let toolUsage: Record<string, number> = {};
  let filesModified: string[] = [];
  let bashCommands: string[] = [];
  let errorCount = 0;
  let turnCount = 0;
  let startTs = 0;

  function reset() {
    toolUsage = {};
    filesModified = [];
    bashCommands = [];
    errorCount = 0;
    turnCount = 0;
    startTs = Date.now();
  }

  pi.on("session_start", async () => {
    reset();
  });

  pi.on("turn_start", async () => {
    turnCount++;
  });

  pi.on("tool_execution_end", async (event) => {
    const e = event as any;
    const name = e.toolName ?? "unknown";
    toolUsage[name] = (toolUsage[name] ?? 0) + 1;
    if (e.isError) errorCount++;
  });

  pi.on("tool_call", async (event) => {
    const e = event as any;
    if ((e.toolName === "write" || e.toolName === "edit") && e.input?.path) {
      filesModified.push(e.input.path);
    }
    if (e.toolName === "bash" && e.input?.command) {
      bashCommands.push(e.input.command);
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    const sessionFile = ctx.sessionManager.getSessionFile?.();
    if (!sessionFile) return;

    const durationMs = Date.now() - startTs;
    const eventCount = Object.values(toolUsage).reduce((s, n) => s + n, 0) + turnCount;

    if (eventCount === 0) return; // Nothing to report

    // Generate markdown
    const durationStr =
      durationMs < 60_000 ? `${Math.round(durationMs / 1000)}s` : `${Math.round(durationMs / 60_000)}m`;

    const uniqueFiles = [...new Set(filesModified)];
    const uniqueCmds = [...new Set(bashCommands)];

    const lines: string[] = [
      `# Session Summary`,
      ``,
      `**Session:** \`${sessionFile.split("/").pop()}\``,
      `**Duration:** ${durationStr} · **Turns:** ${turnCount} · **Events:** ~${eventCount}`,
      `**${uniqueFiles.length} files modified** · **${errorCount} errors**`,
      ``,
      `## Files Modified`,
    ];

    if (uniqueFiles.length > 0) {
      for (const f of uniqueFiles) lines.push(`- \`${f}\``);
    } else {
      lines.push(`_No file modifications detected._`);
    }
    lines.push(``);

    lines.push(`## Tools Used`);
    const sortedTools = Object.entries(toolUsage).sort((a, b) => b[1] - a[1]);
    if (sortedTools.length > 0) {
      lines.push(`| Tool | Count |`);
      lines.push(`|------|-------|`);
      for (const [tool, count] of sortedTools) lines.push(`| ${tool} | ${count} |`);
    }
    lines.push(``);

    lines.push(`## Errors`);
    lines.push(`Total errors: **${errorCount}**`);
    lines.push(``);

    lines.push(`## Key Commands`);
    if (uniqueCmds.length > 0) {
      for (const cmd of uniqueCmds.slice(0, 20)) lines.push(`- \`${cmd}\``);
    } else {
      lines.push(`_No bash commands recorded._`);
    }

    const md = `${lines.join("\n")}\n`;

    // Write .knowledge.md next to session file
    try {
      const outPath = sessionFile.replace(/\.jsonl$/, ".knowledge.md");
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, md, "utf-8");
    } catch {
      // Silently fail — don't break shutdown
    }
  });
}
