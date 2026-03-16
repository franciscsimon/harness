import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── Permission Gate Extension ────────────────────────────────────
// Block dangerous operations until user confirms.

const DANGEROUS = [
  { re: /\brm\s+(-rf?|--recursive)/i, label: "rm -rf" },
  { re: /\bsudo\b/i, label: "sudo" },
  { re: /\b(chmod|chown)\b.*777/i, label: "chmod/chown 777" },
  { re: /\bdrop\s+(table|database)\b/i, label: "DROP TABLE/DATABASE" },
  { re: /\btruncate\s+table\b/i, label: "TRUNCATE TABLE" },
  { re: /\bgit\s+push\s+.*--force\b/i, label: "git push --force" },
  { re: /\bgit\s+reset\s+--hard\b/i, label: "git reset --hard" },
  { re: /\bcurl\b.*\|\s*sh\b/i, label: "curl | sh (pipe to shell)" },
  { re: /\bformat\b|\bmkfs\b/i, label: "format/mkfs" },
  { re: /\bkill\s+-9\b/i, label: "kill -9" },
];

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const cmd = String(event.input?.command ?? "");

    for (const { re, label } of DANGEROUS) {
      if (re.test(cmd)) {
        const ok = await ctx.ui.confirm(
          `⚠️ Dangerous: ${label}`,
          `Allow: ${cmd.slice(0, 100)}${cmd.length > 100 ? "..." : ""}?`,
        );
        if (!ok) return { block: true, reason: `Blocked by permission gate: ${label}` };
        break;
      }
    }
  });
}
