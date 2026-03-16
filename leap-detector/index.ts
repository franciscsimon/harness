import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── Unvalidated Leaps Detector ───────────────────────────────────
// Detects large changes without test/verification steps.
// Anti-pattern: making big jumps without checking results.
// Ref: https://lexler.github.io/augmented-coding-patterns/anti-patterns/unvalidated-leaps

const MAX_EDITS_WITHOUT_VERIFY = 5;
const MAX_FILES_WITHOUT_TEST = 3;

export default function (pi: ExtensionAPI) {
  let editsSinceVerify = 0;
  let filesSinceTest = new Set<string>();
  let notified = new Set<string>();

  function reset() {
    editsSinceVerify = 0;
    filesSinceTest.clear();
    notified.clear();
  }

  pi.on("session_start", async () => { reset(); });
  pi.on("agent_start", async () => { notified.clear(); });

  pi.on("tool_call", async (event, ctx) => {
    const e = event as any;

    // Track write/edit calls
    if (e.toolName === "write" || e.toolName === "edit") {
      editsSinceVerify++;
      if (e.input?.path) filesSinceTest.add(e.input.path);

      if (editsSinceVerify >= MAX_EDITS_WITHOUT_VERIFY && !notified.has("edits")) {
        ctx.ui.notify(
          `⚠️ Unvalidated leap: ${editsSinceVerify} edits without running any verification (test/lint/build). Run tests now.`,
          "warn",
        );
        notified.add("edits");
      }

      if (filesSinceTest.size >= MAX_FILES_WITHOUT_TEST && !notified.has("files")) {
        ctx.ui.notify(
          `⚠️ Unvalidated leap: ${filesSinceTest.size} files modified without testing. Verify changes before continuing.`,
          "warn",
        );
        notified.add("files");
      }
    }

    // Reset counter on verification commands
    if (e.toolName === "bash" && e.input?.command) {
      const cmd = e.input.command.toLowerCase();
      if (cmd.includes("test") || cmd.includes("lint") || cmd.includes("build") ||
          cmd.includes("tsc") || cmd.includes("check") || cmd.includes("vitest") ||
          cmd.includes("jest") || cmd.includes("npm run")) {
        editsSinceVerify = 0;
        filesSinceTest.clear();
        notified.clear();
      }
    }
  });

  // Inject prompt when many unverified edits
  pi.on("before_agent_start", async (event) => {
    if (editsSinceVerify >= MAX_EDITS_WITHOUT_VERIFY) {
      return {
        systemPrompt: (event as any).systemPrompt +
          "\n\nIMPORTANT: You have made multiple file changes without verification. " +
          "Run tests, linting, or build before making more changes.",
      };
    }
  });
}
