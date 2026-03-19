import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { readFileSync, existsSync } from "node:fs";
import { runFileChecks, checkDiffSize, type Violation } from "./checks.ts";
import { createMockPi } from "./mock-pi.ts";

// ─── Quality Hooks Extension ──────────────────────────────────────
// Deterministic code quality checks that fire on write/edit.
// Pattern: Habit Hooks — "deterministic scripts that detect triggers"
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/habit-hooks
//
// Also registers custom tools the LLM can call.

export default function (pi: ExtensionAPI) {
  let enabled = true;
  let snoozedChecks = new Set<string>();
  let violationCount = 0;
  let totalChecked = 0;
  const pendingArgs = new Map<string, any>();

  // ── Flag: --quality to disable quality hooks ──
  pi.registerFlag("quality", {
    description: "Enable quality hooks (default: true)",
    type: "boolean",
    default: true,
  });

  // ── Shortcut: Ctrl+Alt+Q to toggle quality hooks ──
  pi.registerShortcut("C-M-q", async (ctx) => {
    enabled = !enabled;
    ctx.ui.setStatus("quality", enabled ? "🪝 Quality hooks active" : "");
    ctx.ui.notify(`Quality hooks ${enabled ? "enabled" : "disabled"}.`, "info");
  });

  pi.on("session_start", async (_event, ctx) => {
    enabled = pi.getFlag("quality") !== false;
    snoozedChecks.clear();
    violationCount = 0;
    totalChecked = 0;
    ctx.ui.setStatus("quality", "🪝 Quality hooks active");
  });

  // ── Cache args from tool_execution_start (end event doesn't carry them) ──
  pi.on("tool_execution_start", async (event, _ctx) => {
    const e = event as any;
    if (e.toolName === "write" || e.toolName === "edit" || e.toolName === "bash") {
      pendingArgs.set(e.toolCallId, e.args);
    }
  });

  // ── Hook: check file quality after write/edit ──
  pi.on("tool_execution_end", async (event, ctx) => {
    if (!enabled) return;
    const e = event as any;
    const args = pendingArgs.get(e.toolCallId);
    pendingArgs.delete(e.toolCallId);
    if (e.toolName !== "write" && e.toolName !== "edit") return;
    if (e.isError) return;

    const path = args?.path;
    if (!path) return;
    if (!existsSync(path)) return;

    // Only check code files
    const ext = String(path).split(".").pop() ?? "";
    if (!["ts", "js", "tsx", "jsx", "py", "java", "go", "rs"].includes(ext)) return;

    try {
      const content = readFileSync(path, "utf-8");
      totalChecked++;
      const violations = runFileChecks(path, content);

      // Filter out snoozed checks
      const active = violations.filter((v) => !snoozedChecks.has(v.check));
      if (active.length === 0) return;

      violationCount += active.length;

      // Format as actionable prompt (the habit-hooks pattern)
      const prompt = active.map((v) => {
        const loc = v.line ? ` (line ${v.line})` : "";
        return `🙂💬 [${v.check}]${loc}: ${v.message}`;
      }).join("\n");

      ctx.ui.notify(`🪝 Quality check on ${path.split("/").pop()}:\n${prompt}`, "warn");
    } catch {}

    // Extension load check — verify extension can load against mock API
    if (path.includes("/extensions/") && path.endsWith("/index.ts")) {
      try {
        const mod = await import(path + "?t=" + Date.now());
        const factory = mod.default;
        if (typeof factory !== "function") {
          ctx.ui.notify(`🪝 [ext-load] ${path.split("/").pop()}: default export is ${typeof factory}, expected function`, "warn");
        } else {
          const { pi: mockPi } = createMockPi();
          await Promise.resolve(factory(mockPi));
        }
      } catch (err: any) {
        const msg = err.message?.split("\n")[0] ?? String(err);
        if (msg.includes("Unknown ExtensionAPI method") || msg.includes("is not a function") || msg.includes("is not defined")) {
          violationCount++;
          ctx.ui.notify(`🪝 [ext-load] 🔴 API ERROR: ${msg}`, "warn");
        }
      }
    }
  });

  // ── Hook: check diff size before commit ──
  pi.on("tool_call", async (event, ctx) => {
    if (!enabled) return;
    const e = event as any;
    if (e.toolName !== "bash") return;
    const cmd = String(e.input?.command ?? "");
    if (!cmd.startsWith("git commit")) return;

    try {
      const result = await pi.exec("git", ["diff", "--cached", "--stat"], {});
      if (result.stdout) {
        const violations = checkDiffSize(result.stdout);
        if (violations.length > 0) {
          const prompt = violations.map((v) => `🙂💬 [${v.check}]: ${v.message}`).join("\n");
          ctx.ui.notify(`🪝 Pre-commit check:\n${prompt}`, "warn");
        }
      }
    } catch {}
  });

  // ── Tool: quality_check — LLM can call this directly ──
  pi.registerTool({
    name: "quality_check",
    label: "Quality Check",
    description: "Run deterministic quality checks on a file: comments, file size, function size, duplication, dead code",
    promptSnippet: "Run code quality checks (comments, size, duplication) on a file",
    promptGuidelines: [
      "Use quality_check after writing or editing code files to verify quality.",
      "Fix any violations found before moving on.",
    ],
    parameters: Type.Object({
      path: Type.String({ description: "Path to the file to check" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const path = params.path.replace(/^@/, "");
      if (!existsSync(path)) {
        throw new Error(`File not found: ${path}`);
      }
      const content = readFileSync(path, "utf-8");
      const violations = runFileChecks(path, content);

      if (violations.length === 0) {
        return {
          content: [{ type: "text", text: `✅ No quality issues found in ${path}` }],
          details: { violations: [] },
        };
      }

      const report = violations.map((v) => {
        const loc = v.line ? `:${v.line}` : "";
        return `[${v.severity}] ${v.check}${loc}: ${v.message}`;
      }).join("\n");

      return {
        content: [{ type: "text", text: `🪝 Found ${violations.length} issue(s) in ${path}:\n\n${report}` }],
        details: { violations },
      };
    },
  });

  // ── Tool: diff_check — LLM can check staging area size ──
  pi.registerTool({
    name: "diff_check",
    label: "Diff Size Check",
    description: "Check if staged git changes are too large for a single commit",
    promptSnippet: "Check if git staged changes are small enough to commit",
    promptGuidelines: [
      "Use diff_check before committing to verify the change is appropriately sized.",
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const result = await pi.exec("git", ["diff", "--cached", "--stat"], {});
      if (!result.stdout?.trim()) {
        return {
          content: [{ type: "text", text: "No staged changes." }],
          details: {},
        };
      }

      const violations = checkDiffSize(result.stdout);
      if (violations.length === 0) {
        return {
          content: [{ type: "text", text: `✅ Staged changes look good:\n${result.stdout}` }],
          details: {},
        };
      }

      const warnings = violations.map((v) => `⚠️ ${v.message}`).join("\n");
      return {
        content: [{ type: "text", text: `${warnings}\n\n${result.stdout}` }],
        details: { violations },
      };
    },
  });

  // ── /quality command ──
  pi.registerCommand("quality", {
    description: "Manage quality hooks",
    getArgumentCompletions: (prefix: string) => [
      { value: "status", label: "status — Show quality hook stats" },
      { value: "on", label: "on — Enable quality hooks" },
      { value: "off", label: "off — Disable quality hooks" },
      { value: "snooze", label: "snooze <check> — Snooze a check type" },
      { value: "unsnooze", label: "unsnooze <check> — Re-enable a check type" },
    ].filter((i) => i.value.startsWith(prefix)),
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/) ?? ["status"];
      const cmd = parts[0] ?? "status";

      if (cmd === "on") {
        enabled = true;
        ctx.ui.setStatus("quality", "🪝 Quality hooks active");
        ctx.ui.notify("🪝 Quality hooks enabled.", "success");
        return;
      }
      if (cmd === "off") {
        enabled = false;
        ctx.ui.setStatus("quality", "");
        ctx.ui.notify("Quality hooks disabled.", "info");
        return;
      }
      if (cmd === "snooze") {
        const check = parts[1];
        if (!check) { ctx.ui.notify("Usage: /quality snooze <check-name>", "error"); return; }
        snoozedChecks.add(check);
        ctx.ui.notify(`Snoozed: ${check}`, "info");
        return;
      }
      if (cmd === "unsnooze") {
        const check = parts[1];
        if (check) snoozedChecks.delete(check);
        else snoozedChecks.clear();
        ctx.ui.notify("Un-snoozed.", "info");
        return;
      }

      // status
      const snoozed = snoozedChecks.size > 0 ? `\n  Snoozed: ${[...snoozedChecks].join(", ")}` : "";
      ctx.ui.notify(
        `🪝 Quality Hooks:\n` +
        `  Enabled: ${enabled}\n` +
        `  Files checked: ${totalChecked}\n` +
        `  Violations found: ${violationCount}\n` +
        `  Checks: comments, file-size, function-size, duplication, dead-code, diff-size${snoozed}`,
        "info",
      );
    },
  });
}
