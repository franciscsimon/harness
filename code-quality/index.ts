import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { detectStack, type StackReport } from "./detect.ts";
import { REGISTRY } from "./registry.ts";
import { existsSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";

// ─── Code Quality Extension ──────────────────────────────────────
// Detects the project's language stack and enforces code quality
// standards appropriate for that language.
//
// Pattern: Habit Hooks — "deterministic scripts that detect triggers"
//
// Lifecycle:
//   session_start → detect stack → cache report → set status
//   tool_execution_end (write/edit) → check if quality tool should run
//   registered commands → /quality scan, /quality fix, /quality setup

export default function (pi: ExtensionAPI) {
  let cachedReport: StackReport | null = null;
  let projectRoot = process.cwd();
  let enabled = true;

  // ── Flag: --quality to disable ──
  pi.registerFlag("code-quality", {
    description: "Enable code quality detection and enforcement (default: true)",
    type: "boolean",
    default: true,
  });

  // ── Session start: detect the stack ──
  pi.on("session_start", async (_event, ctx) => {
    enabled = pi.getFlag("code-quality") !== false;
    if (!enabled) return;

    projectRoot = process.cwd();
    try {
      cachedReport = await detectStack(projectRoot);
      const langs = cachedReport.languages
        .filter((l) => l.fileCount > 0)
        .map((l) => l.language)
        .join(", ");

      const missingRequired = cachedReport.missing.filter((m) => m.priority === "required");

      if (missingRequired.length > 0) {
        const tools = missingRequired.map((m) => `${m.language}/${m.tool.name}`).join(", ");
        ctx.ui.setStatus("code-quality", `⚠️ Missing: ${tools}`);
        ctx.ui.notify(
          `Code quality: ${langs} detected. Missing required tools: ${tools}. Run /quality setup to install.`,
          "warn",
        );
      } else {
        ctx.ui.setStatus("code-quality", `✅ ${langs}`);
      }
    } catch (err) {
      ctx.ui.setStatus("code-quality", "❌ detection failed");
    }
  });

  // ── After file write: remind about quality checks ──
  pi.on("tool_execution_end", async (event, ctx) => {
    if (!enabled || !cachedReport) return;
    const e = event as any;
    if (e.toolName !== "write" && e.toolName !== "edit") return;

    const filePath = e.args?.file_path ?? e.args?.path ?? "";
    if (!filePath) return;

    const ext = extname(filePath).toLowerCase();
    const lang = cachedReport.languages.find((l) =>
      l.toolchain.extensions.some((e) => e === ext),
    );
    if (!lang) return;

    const fmtTool = lang.toolchain.tools.find(
      (t) => t.role === "fmt" || t.role === "all-in-one",
    );
    if (!fmtTool) return;

    // Check if the fmt/lint tool config exists (meaning it's set up)
    const hasToolConfig = fmtTool.config && existsSync(join(projectRoot, fmtTool.config));
    if (!hasToolConfig) return;

    // Don't nag on every write — only after accumulating edits
    // (Handled by contextual prompts cooldown system)
  });

  // ── Command: /quality scan ──
  pi.registerCommand({
    name: "quality",
    description: "Code quality tools: scan | fix | setup | report",
    schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["scan", "fix", "setup", "report"],
          description: "scan=detect stack, fix=run auto-fix, setup=install tools, report=show status",
        },
      },
      required: ["action"],
    },
    execute: async (args, ctx) => {
      const action = (args as any).action;

      if (action === "scan" || action === "report") {
        cachedReport = await detectStack(projectRoot);
        const lines: string[] = ["# Code Quality Report\n"];

        if (cachedReport.languages.length === 0) {
          lines.push("No recognized source files found in project.");
          return lines.join("\n");
        }

        lines.push("## Detected Languages\n");
        for (const lang of cachedReport.languages) {
          if (lang.fileCount === 0) continue;
          lines.push(`- **${lang.language}**: ${lang.fileCount} files (${lang.percentage}%)`);
        }

        if (cachedReport.installed.length > 0) {
          lines.push("\n## Installed Tools\n");
          for (const t of cachedReport.installed) {
            const cfg = t.configFound ? ` ✅ config found` : " ⚠️ no config";
            lines.push(`- ${t.language}/**${t.tool}** [${t.role}]${cfg}`);
          }
        }

        if (cachedReport.missing.length > 0) {
          lines.push("\n## Missing Tools\n");
          for (const m of cachedReport.missing) {
            const icon = m.priority === "required" ? "🔴" : "🟡";
            lines.push(`- ${icon} ${m.language}/**${m.tool.name}** [${m.tool.role}] — ${m.priority}`);
            lines.push(`  Install: \`${m.tool.install}\``);
          }
        }

        if (cachedReport.recommendations.length > 0) {
          lines.push("\n## Recommendations\n");
          for (const r of cachedReport.recommendations) {
            lines.push(`- ${r}`);
          }
        }

        return lines.join("\n");
      }

      if (action === "setup") {
        if (!cachedReport) cachedReport = await detectStack(projectRoot);
        const required = cachedReport.missing.filter((m) => m.priority === "required");
        if (required.length === 0) {
          return "All required quality tools are already installed.";
        }

        const lines = ["# Setup Commands\n", "Run these to install missing quality tools:\n"];
        for (const m of required) {
          lines.push(`## ${m.language} — ${m.tool.name}\n`);
          lines.push("```bash");
          lines.push(m.tool.install);
          lines.push("```\n");
          if (m.tool.config) {
            lines.push(`Config file: \`${m.tool.config}\`\n`);
          }
        }
        return lines.join("\n");
      }

      if (action === "fix") {
        if (!cachedReport) cachedReport = await detectStack(projectRoot);
        const fixCmds: string[] = [];
        for (const t of cachedReport.installed) {
          const tc = REGISTRY.find((r) => r.language === t.language);
          const tool = tc?.tools.find((tt) => tt.name === t.tool);
          if (tool && tool.fix !== tool.check) {
            fixCmds.push(`# ${t.language} — ${t.tool}`);
            fixCmds.push(tool.fix);
          }
        }
        if (fixCmds.length === 0) {
          return "No auto-fix tools available. Run `/quality setup` first.";
        }
        return `# Auto-fix commands\n\n\`\`\`bash\n${fixCmds.join("\n")}\n\`\`\``;
      }

      return "Unknown action. Use: scan | fix | setup | report";
    },
  });
}
