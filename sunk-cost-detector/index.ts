import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── Sunk Cost Detector Extension ─────────────────────────────────
// Detects when the agent is stuck on a failing approach and should
// abandon it. Anti-pattern: continuing because of invested effort.
// Ref: https://lexler.github.io/augmented-coding-patterns/anti-patterns/sunk-cost

interface SunkCostConfig {
  maxFileEdits: number;       // Same file edited N+ times
  maxCommandRetries: number;  // Same command pattern N+ times
  errorRateThreshold: number; // Error rate over last N calls
  maxTurnsNoTest: number;     // Turns without a test run
  windowSize: number;         // Sliding window for error rate
}

const DEFAULTS: SunkCostConfig = {
  maxFileEdits: 5,
  maxCommandRetries: 4,
  errorRateThreshold: 0.5,
  maxTurnsNoTest: 8,
  windowSize: 10,
};

export default function (pi: ExtensionAPI) {
  const config = { ...DEFAULTS };

  let fileEditCounts: Record<string, number> = {};
  let commandCounts: Record<string, number> = {};
  let recentResults: boolean[] = [];  // true = error
  let turnIndex = 0;
  let lastTestTurn = 0;
  let notifiedThisRun = new Set<string>();

  function reset() {
    fileEditCounts = {};
    commandCounts = {};
    recentResults = [];
    turnIndex = 0;
    lastTestTurn = 0;
    notifiedThisRun.clear();
  }

  // ── Session lifecycle ──
  pi.on("session_start", async (_event, ctx) => {
    reset();
    ctx.ui.setStatus("sunk-cost", "");
  });

  pi.on("agent_start", async () => {
    notifiedThisRun.clear();
  });

  pi.on("turn_start", async () => {
    turnIndex++;
  });

  // ── Track file edits ──
  pi.on("tool_call", async (event, ctx) => {
    const e = event as any;

    if ((e.toolName === "write" || e.toolName === "edit") && e.input?.path) {
      const path = e.input.path;
      fileEditCounts[path] = (fileEditCounts[path] ?? 0) + 1;

      if (fileEditCounts[path] >= config.maxFileEdits && !notifiedThisRun.has(`file:${path}`)) {
        ctx.ui.notify(
          `⚠️ Sunk cost: You've edited \`${path.split("/").pop()}\` ${fileEditCounts[path]} times. Consider a different approach.`,
          "warn",
        );
        notifiedThisRun.add(`file:${path}`);
      }
    }

    // Track bash commands
    if (e.toolName === "bash" && e.input?.command) {
      // Normalize command (strip args that change)
      const cmd = e.input.command.split(/\s+/).slice(0, 3).join(" ");
      commandCounts[cmd] = (commandCounts[cmd] ?? 0) + 1;

      if (commandCounts[cmd] >= config.maxCommandRetries && !notifiedThisRun.has(`cmd:${cmd}`)) {
        ctx.ui.notify(
          `⚠️ Sunk cost: Command pattern "${cmd}..." has been tried ${commandCounts[cmd]} times. Step back and reconsider.`,
          "warn",
        );
        notifiedThisRun.add(`cmd:${cmd}`);
      }
    }

    // Track test runs
    if (e.toolName === "bash" && e.input?.command) {
      const cmd = e.input.command.toLowerCase();
      if (cmd.includes("test") || cmd.includes("vitest") || cmd.includes("jest") || cmd.includes("mocha")) {
        lastTestTurn = turnIndex;
      }
    }
  });

  // ── Track errors ──
  pi.on("tool_execution_end", async (event, ctx) => {
    const e = event as any;
    recentResults.push(!!e.isError);

    // Keep sliding window
    if (recentResults.length > config.windowSize) {
      recentResults = recentResults.slice(-config.windowSize);
    }

    // Check error rate
    if (recentResults.length >= config.windowSize) {
      const errorRate = recentResults.filter(Boolean).length / recentResults.length;
      if (errorRate >= config.errorRateThreshold && !notifiedThisRun.has("error-rate")) {
        ctx.ui.notify(
          `🛑 Sunk cost: ${Math.round(errorRate * 100)}% of recent actions are failing. Abandon this approach and try something different.`,
          "warn",
        );
        notifiedThisRun.add("error-rate");
      }
    }
  });

  // ── Check for no-test-run on turn end ──
  pi.on("turn_end", async (_event, ctx) => {
    if (turnIndex - lastTestTurn >= config.maxTurnsNoTest && turnIndex > config.maxTurnsNoTest) {
      if (!notifiedThisRun.has("no-test")) {
        ctx.ui.notify(
          `⚠️ Sunk cost: ${turnIndex - lastTestTurn} turns without running tests. Verify your changes work before investing more effort.`,
          "warn",
        );
        notifiedThisRun.add("no-test");
      }
    }
  });

  // ── Inject prompt when sunk cost detected ──
  pi.on("before_agent_start", async (event) => {
    // Check if any file has been over-edited
    const overEdited = Object.entries(fileEditCounts).filter(([_, c]) => c >= config.maxFileEdits);
    if (overEdited.length === 0) return;

    const files = overEdited.map(([f, c]) => `${f.split("/").pop()} (${c}x)`).join(", ");
    return {
      systemPrompt: (event as any).systemPrompt +
        `\n\nIMPORTANT: Files ${files} have been edited many times. ` +
        `If your current approach isn't working, consider an entirely different strategy. ` +
        `Don't keep trying the same thing.`,
    };
  });

  // ── /abandon command ──
  pi.registerCommand("abandon", {
    description: "Abandon the current approach and start fresh",
    handler: async (_args, ctx) => {
      const files = Object.entries(fileEditCounts)
        .filter(([_, c]) => c >= 3)
        .map(([f, c]) => `  ${f.split("/").pop()}: ${c} edits`);

      const summary = [
        `📊 Current approach stats:`,
        `  Turns: ${turnIndex}`,
        `  Error rate: ${recentResults.length > 0 ? Math.round(recentResults.filter(Boolean).length / recentResults.length * 100) : 0}%`,
        files.length > 0 ? `  Most-edited files:\n${files.join("\n")}` : "",
      ].filter(Boolean).join("\n");

      ctx.ui.notify(summary, "info");

      const ok = await ctx.ui.confirm("Abandon approach?", "Reset tracking and inject fresh-start prompt?");
      if (ok) {
        reset();
        ctx.ui.notify("Approach abandoned. Starting fresh.", "success");
        pi.sendUserMessage(
          "The previous approach wasn't working. Let's start fresh with a completely different strategy. " +
          "What are the alternatives?",
          { deliverAs: "followUp" },
        );
      }
    },
  });
}
