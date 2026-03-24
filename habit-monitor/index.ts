import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadHabitConfig } from "./config.ts";
import { checkCommitHabit, checkErrorStreak, checkFreshStart, checkScopeCreep, checkTestHabit } from "./habits.ts";

// ─── Habit Monitor Extension ──────────────────────────────────────
// Detects behavioral patterns and surfaces corrective prompts.

export default function (pi: ExtensionAPI) {
  const config = loadHabitConfig();

  // ── In-memory state for current session ──
  let toolNames: string[] = []; // All tool names in execution order
  let bashCommands: string[] = []; // All bash commands
  let recentErrors: boolean[] = []; // is_error sequence
  let touchedFiles: string[] = []; // File paths from Write/Edit tools
  let lastPayloadBytes = 0;
  let snoozedUntil: Record<string, number> = {};
  const notifiedThisRun = new Set<string>();
  let errorStreakActive = false;
  let freshStartActive = false;

  function reset() {
    toolNames = [];
    bashCommands = [];
    recentErrors = [];
    touchedFiles = [];
    lastPayloadBytes = 0;
    notifiedThisRun.clear();
    errorStreakActive = false;
    freshStartActive = false;
  }

  function isSnoozed(habit: string): boolean {
    const until = snoozedUntil[habit];
    if (!until) return false;
    if (Date.now() < until) return true;
    delete snoozedUntil[habit];
    return false;
  }

  // ── Reset on session start ──
  pi.on("session_start", async (_event, ctx) => {
    reset();
    ctx.ui.setStatus("habit-monitor", "🪝 Habits: active");
  });

  // ── Reset per-run tracking on agent start ──
  pi.on("agent_start", async () => {
    notifiedThisRun.clear();
  });

  // ── Prompt injection for interceptable events ──
  // When error streak or fresh start is active, inject corrective prompt
  pi.on("before_agent_start", async (event, _ctx) => {
    const injections: string[] = [];

    if (errorStreakActive && config.enabled["error-streak"] && !isSnoozed("error-streak")) {
      injections.push(
        "IMPORTANT: Multiple consecutive tool errors were detected. " +
          "Before proceeding, stop and re-read the error messages carefully. " +
          "What assumption is wrong? Consider a different approach.",
      );
      errorStreakActive = false; // Don't inject repeatedly
    }

    if (freshStartActive && config.enabled["fresh-start"] && !isSnoozed("fresh-start")) {
      const kb = Math.round(lastPayloadBytes / 1024);
      injections.push(
        `IMPORTANT: Context is very large (${kb}KB). ` +
          "Consider using /compact to reduce context or starting a fresh session. " +
          "Large contexts reduce output quality and increase latency.",
      );
      freshStartActive = false;
    }

    if (injections.length > 0) {
      return {
        systemPrompt: `${(event as any).systemPrompt}\n\n---\n\n${injections.join("\n\n")}`,
      };
    }
  });

  // ── Track tool executions ──
  pi.on("tool_execution_start", async (event) => {
    const e = event as any;
    const toolName = e.toolName ?? "unknown";
    toolNames.push(toolName);
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    const e = event as any;
    const isError = !!e.isError;
    recentErrors.push(isError);

    // Check error streak
    if (config.enabled["error-streak"] && !isSnoozed("error-streak")) {
      const result = checkErrorStreak(recentErrors, config.thresholds);
      if (result.alert && !notifiedThisRun.has("error-streak")) {
        ctx.ui.notify(result.prompt, "warn");
        notifiedThisRun.add("error-streak");
        errorStreakActive = true;
      }
    }
  });

  // ── Track file touches via tool_call ──
  pi.on("tool_call", async (event) => {
    const e = event as any;
    if ((e.toolName === "write" || e.toolName === "edit") && e.input?.path) {
      touchedFiles.push(e.input.path);
    }
  });

  // ── Track bash commands ──
  pi.on("user_bash", async (event) => {
    const e = event as any;
    if (e.command) bashCommands.push(e.command);
  });

  // ── Track context size ──
  pi.on("before_provider_request", async (event, ctx) => {
    const e = event as any;
    if (e.payload) {
      const bytes = typeof e.payload === "string" ? e.payload.length : JSON.stringify(e.payload).length;
      lastPayloadBytes = bytes;

      // Fresh start hint
      if (config.enabled["fresh-start"] && !isSnoozed("fresh-start")) {
        const result = checkFreshStart(bytes, config.thresholds);
        if (result.alert && !notifiedThisRun.has("fresh-start")) {
          ctx.ui.notify(result.prompt, "warn");
          notifiedThisRun.add("fresh-start");
          freshStartActive = true;
        }
      }
    }
  });

  // ── Check habits at turn end ──
  pi.on("turn_end", async (_event, ctx) => {
    // Commit reminder
    if (config.enabled["commit-reminder"] && !isSnoozed("commit-reminder")) {
      const result = checkCommitHabit(toolNames, bashCommands, config.thresholds);
      if (result.alert && !notifiedThisRun.has("commit-reminder")) {
        ctx.ui.notify(result.prompt, "info");
        notifiedThisRun.add("commit-reminder");
      }
    }

    // Test reminder
    if (config.enabled["test-reminder"] && !isSnoozed("test-reminder")) {
      const result = checkTestHabit(toolNames, bashCommands, config.thresholds);
      if (result.alert && !notifiedThisRun.has("test-reminder")) {
        ctx.ui.notify(result.prompt, "info");
        notifiedThisRun.add("test-reminder");
      }
    }

    // Scope creep
    if (config.enabled["scope-creep"] && !isSnoozed("scope-creep")) {
      const result = checkScopeCreep(touchedFiles, config.thresholds);
      if (result.alert && !notifiedThisRun.has("scope-creep")) {
        ctx.ui.notify(result.prompt, "warn");
        notifiedThisRun.add("scope-creep");
      }
    }
  });

  // ── /habit command ──
  pi.registerCommand("habit", {
    description: "Manage habit monitors",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "list", label: "list — Show all habits and their status" },
        { value: "snooze", label: "snooze <name> <minutes> — Snooze a habit" },
        { value: "reset", label: "reset — Reset all snoozes" },
      ];
      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/) ?? ["list"];
      const cmd = parts[0] ?? "list";

      if (cmd === "list") {
        const habits = [
          { name: "commit-reminder", threshold: `${config.thresholds.commitReminderEdits} edits` },
          { name: "test-reminder", threshold: `${config.thresholds.testReminderEdits} edits` },
          { name: "error-streak", threshold: `${config.thresholds.errorStreakCount} errors` },
          { name: "fresh-start", threshold: `${Math.round(config.thresholds.freshStartBytes / 1024)}KB` },
          { name: "scope-creep", threshold: `${config.thresholds.scopeCreepFiles} files` },
        ];
        const lines = habits.map((h) => {
          const enabled = config.enabled[h.name] !== false;
          const snoozed = isSnoozed(h.name);
          const status = !enabled ? "disabled" : snoozed ? "snoozed" : "active";
          const icon = status === "active" ? "✅" : status === "snoozed" ? "💤" : "⏸";
          return `  ${icon} ${h.name.padEnd(20)} threshold=${h.threshold.padEnd(10)} status=${status}`;
        });
        ctx.ui.notify(`Habits:\n${lines.join("\n")}`, "info");
        return;
      }

      if (cmd === "snooze") {
        const habitName = parts[1];
        const minutes = Number(parts[2]) || 5;
        if (!habitName) {
          ctx.ui.notify("Usage: /habit snooze <name> <minutes>", "error");
          return;
        }
        snoozedUntil[habitName] = Date.now() + minutes * 60_000;
        ctx.ui.notify(`💤 ${habitName} snoozed for ${minutes} minutes`, "info");
        return;
      }

      if (cmd === "reset") {
        snoozedUntil = {};
        notifiedThisRun.clear();
        ctx.ui.notify("All habit snoozes cleared.", "info");
        return;
      }

      ctx.ui.notify("Usage: /habit list | snooze <name> <min> | reset", "error");
    },
  });
}
