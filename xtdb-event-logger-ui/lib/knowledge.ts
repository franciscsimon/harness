// ─── Knowledge Document Generator ──────────────────────────────
// Pure function — takes aggregated data, produces markdown.

import type { SessionKnowledge } from "./db.ts";

export function generateKnowledgeMarkdown(sessionId: string, k: SessionKnowledge): string {
  const name = sessionId.split("/").pop() ?? sessionId;
  const durationStr =
    k.durationMs < 60_000 ? `${Math.round(k.durationMs / 1000)}s` : `${Math.round(k.durationMs / 60_000)}m`;

  const lines: string[] = [
    `# Session Summary`,
    ``,
    `**Session:** \`${name}\``,
    `**Duration:** ${durationStr} · **Turns:** ${k.turnCount} · **Events:** ${k.eventCount}`,
    `**${k.filesModified.length} files modified** · **${k.errorCount} errors**`,
    ``,
  ];

  // Files Modified
  lines.push(`## Files Modified`);
  if (k.filesModified.length > 0) {
    for (const f of k.filesModified) {
      lines.push(`- \`${f}\``);
    }
  } else {
    lines.push(`_No file modifications detected._`);
  }
  lines.push(``);

  // Tools Used
  lines.push(`## Tools Used`);
  const sortedTools = Object.entries(k.toolUsage).sort((a, b) => b[1] - a[1]);
  if (sortedTools.length > 0) {
    lines.push(`| Tool | Count |`);
    lines.push(`|------|-------|`);
    for (const [tool, count] of sortedTools) {
      lines.push(`| ${tool} | ${count} |`);
    }
  } else {
    lines.push(`_No tool usage recorded._`);
  }
  lines.push(``);

  // Errors
  lines.push(`## Errors`);
  lines.push(`Total errors: **${k.errorCount}**`);
  lines.push(``);

  // Key Commands
  lines.push(`## Key Commands`);
  if (k.bashCommands.length > 0) {
    const unique = [...new Set(k.bashCommands)];
    for (const cmd of unique.slice(0, 20)) {
      lines.push(`- \`${cmd}\``);
    }
    if (unique.length > 20) lines.push(`_... and ${unique.length - 20} more_`);
  } else {
    lines.push(`_No bash commands recorded._`);
  }
  lines.push(``);

  return lines.join("\n");
}
