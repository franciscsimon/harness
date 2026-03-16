// ─── Habit Detection Functions ─────────────────────────────────
// Pure functions — no DB or extension dependencies.

import type { HabitThresholds } from "./config.ts";

export interface HabitResult {
  name: string;
  alert: boolean;
  value: number;
  threshold: number;
  prompt: string;
}

/**
 * Check if edits have happened since last commit.
 * editToolNames: array of tool names in execution order
 * bashCommands: array of bash commands in execution order
 */
export function checkCommitHabit(
  editToolNames: string[],
  bashCommands: string[],
  thresholds: HabitThresholds,
): HabitResult {
  // Find last commit index
  let lastCommitIdx = -1;
  for (let i = bashCommands.length - 1; i >= 0; i--) {
    if (bashCommands[i].includes("git commit")) {
      lastCommitIdx = i;
      break;
    }
  }

  // Count write/edit tools after last commit
  // We use a simple approach: count edits in the edit list
  // that occurred after the last commit (by position ratio)
  let editsSinceCommit: number;
  if (lastCommitIdx === -1) {
    // No commits at all
    editsSinceCommit = editToolNames.filter((t) => t === "write" || t === "edit").length;
  } else {
    // Approximate: assume bash commands and tool events are interleaved
    // Count edits that are "after" the commit proportionally
    const commitRatio = (lastCommitIdx + 1) / Math.max(bashCommands.length, 1);
    const editStartIdx = Math.floor(commitRatio * editToolNames.length);
    editsSinceCommit = editToolNames
      .slice(editStartIdx)
      .filter((t) => t === "write" || t === "edit").length;
  }

  return {
    name: "commit-reminder",
    alert: editsSinceCommit >= thresholds.commitReminderEdits,
    value: editsSinceCommit,
    threshold: thresholds.commitReminderEdits,
    prompt: editsSinceCommit >= thresholds.commitReminderEdits
      ? `💾 Consider committing your progress — ${editsSinceCommit} file modifications since last commit`
      : "",
  };
}

/**
 * Check if edits have happened since last test run.
 */
export function checkTestHabit(
  editToolNames: string[],
  bashCommands: string[],
  thresholds: HabitThresholds,
): HabitResult {
  const testPatterns = ["test", "vitest", "jest", "mocha", "npm test", "npm run test", "bun test"];

  let lastTestIdx = -1;
  for (let i = bashCommands.length - 1; i >= 0; i--) {
    if (testPatterns.some((p) => bashCommands[i].includes(p))) {
      lastTestIdx = i;
      break;
    }
  }

  let editsSinceTest: number;
  if (lastTestIdx === -1) {
    editsSinceTest = editToolNames.filter((t) => t === "write" || t === "edit").length;
  } else {
    const testRatio = (lastTestIdx + 1) / Math.max(bashCommands.length, 1);
    const editStartIdx = Math.floor(testRatio * editToolNames.length);
    editsSinceTest = editToolNames
      .slice(editStartIdx)
      .filter((t) => t === "write" || t === "edit").length;
  }

  return {
    name: "test-reminder",
    alert: editsSinceTest >= thresholds.testReminderEdits,
    value: editsSinceTest,
    threshold: thresholds.testReminderEdits,
    prompt: editsSinceTest >= thresholds.testReminderEdits
      ? `🧪 Run tests before continuing — ${editsSinceTest} file modifications since last test run`
      : "",
  };
}

/**
 * Check for consecutive tool errors.
 */
export function checkErrorStreak(
  recentErrors: boolean[],
  thresholds: HabitThresholds,
): HabitResult {
  // Count consecutive errors from the end
  let streak = 0;
  for (let i = recentErrors.length - 1; i >= 0; i--) {
    if (recentErrors[i]) streak++;
    else break;
  }

  return {
    name: "error-streak",
    alert: streak >= thresholds.errorStreakCount,
    value: streak,
    threshold: thresholds.errorStreakCount,
    prompt: streak >= thresholds.errorStreakCount
      ? `🛑 Stop. ${streak} consecutive errors. Re-read the error messages. What assumption is wrong?`
      : "",
  };
}

/**
 * Check for scope creep (too many unique files touched).
 */
export function checkScopeCreep(
  uniqueFiles: string[],
  thresholds: HabitThresholds,
): HabitResult {
  const count = new Set(uniqueFiles).size;
  return {
    name: "scope-creep",
    alert: count > thresholds.scopeCreepFiles,
    value: count,
    threshold: thresholds.scopeCreepFiles,
    prompt: count > thresholds.scopeCreepFiles
      ? `🎯 You're touching ${count} files. Focus on one change at a time.`
      : "",
  };
}

/**
 * Check for fresh start need (context too large).
 */
export function checkFreshStart(
  payloadBytes: number,
  thresholds: HabitThresholds,
): HabitResult {
  const kb = Math.round(payloadBytes / 1024);
  return {
    name: "fresh-start",
    alert: payloadBytes > thresholds.freshStartBytes,
    value: payloadBytes,
    threshold: thresholds.freshStartBytes,
    prompt: payloadBytes > thresholds.freshStartBytes
      ? `🔄 Context is ${kb}KB — consider /compact or starting a new session`
      : "",
  };
}
