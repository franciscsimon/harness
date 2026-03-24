import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── Yak Shave Delegation Extension ──────────────────────────────
// Auto-detect environment/tooling errors and offer to spawn a
// background agent to fix them while the main agent continues.
// Pattern: Yak Shave Delegation — "Delegate tangential issues"
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/yak-shave-delegation

// Error patterns that signal environment/tooling issues (not app bugs)
const YAK_SHAVE_PATTERNS = [
  { re: /command not found/i, label: "missing command" },
  { re: /ENOENT.*no such file or directory/i, label: "missing file/dependency" },
  { re: /MODULE_NOT_FOUND/i, label: "missing module" },
  { re: /Cannot find module/i, label: "missing module" },
  { re: /permission denied/i, label: "permission issue" },
  { re: /EACCES/i, label: "permission issue" },
  { re: /Could not resolve.*dependency/i, label: "dependency resolution" },
  { re: /peer dep.*not installed/i, label: "missing peer dependency" },
  { re: /version.*not compatible/i, label: "version mismatch" },
  { re: /No such image|docker.*not found/i, label: "Docker issue" },
  { re: /CERT_HAS_EXPIRED|certificate/i, label: "certificate issue" },
  { re: /ECONNREFUSED|ETIMEDOUT/i, label: "connection issue" },
  { re: /out of disk space|ENOSPC/i, label: "disk space" },
  { re: /brew.*not found|apt.*not found/i, label: "missing package manager" },
];

export default function (pi: ExtensionAPI) {
  let recentErrors: string[] = [];
  const offeredThisSession = new Set<string>();
  let _yakShaveCount = 0;

  pi.on("session_start", async (_event, _ctx) => {
    recentErrors = [];
    offeredThisSession.clear();
    _yakShaveCount = 0;
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    const e = event as any;
    if (!e.isError) return;

    // Extract error text from result
    let errorText = "";
    if (e.result?.content) {
      for (const item of e.result.content) {
        if (item.type === "text") errorText += `${item.text}\n`;
      }
    }
    if (!errorText && e.result) {
      errorText = typeof e.result === "string" ? e.result : JSON.stringify(e.result);
    }

    if (!errorText) return;

    // Check against yak shave patterns
    for (const pattern of YAK_SHAVE_PATTERNS) {
      if (pattern.re.test(errorText)) {
        const key = pattern.label;

        // Don't re-offer the same type in one session
        if (offeredThisSession.has(key)) continue;
        offeredThisSession.add(key);

        _yakShaveCount++;
        ctx.ui.notify(
          `🐃 Yak shave detected: **${pattern.label}**\n` +
            `This looks like an environment/tooling issue, not an application bug.\n` +
            `Consider spawning a background agent: /spawn Fix ${pattern.label}: ${errorText.slice(0, 100)}`,
          "warn",
        );

        // Store the error context for potential spawning
        recentErrors.push(`${pattern.label}: ${errorText.slice(0, 200)}`);
        break;
      }
    }
  });

  // ── /yak command ──
  pi.registerCommand("yak", {
    description: "Manage yak shave detections",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "list", label: "list — Show detected yak shaves" },
        { value: "delegate", label: "delegate — Spawn agent for latest yak shave" },
        { value: "ignore", label: "ignore — Dismiss all yak shave warnings" },
      ];
      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const cmd = args?.trim().split(/\s+/)[0] ?? "list";

      if (cmd === "list") {
        if (recentErrors.length === 0) {
          ctx.ui.notify("🐃 No yak shaves detected this session.", "info");
          return;
        }
        const lines = recentErrors.map((e, i) => `  ${i + 1}. ${e}`);
        ctx.ui.notify(`🐃 Detected Yak Shaves:\n\n${lines.join("\n")}`, "info");
        return;
      }

      if (cmd === "delegate") {
        if (recentErrors.length === 0) {
          ctx.ui.notify("No yak shaves to delegate.", "info");
          return;
        }
        const latest = recentErrors[recentErrors.length - 1];
        ctx.ui.notify(
          `🐃 To delegate the latest yak shave, run:\n` + `/spawn Fix environment issue: ${latest.slice(0, 80)}`,
          "info",
        );
        return;
      }

      if (cmd === "ignore") {
        recentErrors = [];
        offeredThisSession.clear();
        ctx.ui.notify("Yak shave warnings dismissed.", "info");
        return;
      }

      ctx.ui.notify("Usage: /yak list | delegate | ignore", "error");
    },
  });
}
