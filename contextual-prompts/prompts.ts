// ─── Contextual Prompt Definitions ────────────────────────────────
// Each prompt has a name, trigger condition, text, and cooldown.

export interface ContextualPrompt {
  name: string;
  enabled: boolean;
  cooldownTurns: number;     // Minimum turns between firings
  text: string;
}

export const DEFAULT_PROMPTS: ContextualPrompt[] = [
  {
    name: "verify-after-edits",
    enabled: true,
    cooldownTurns: 3,
    text: "You've made several consecutive edits. Step back and verify your approach before continuing.",
  },
  {
    name: "test-after-write",
    enabled: true,
    cooldownTurns: 5,
    text: "Run tests after writing test files to verify they pass.",
  },
  {
    name: "concise-in-large-context",
    enabled: true,
    cooldownTurns: 3,
    text: "Context is very large. Be concise in your responses. Avoid repeating code already in context.",
  },
  {
    name: "progress-check",
    enabled: true,
    cooldownTurns: 5,
    text: "Many turns have elapsed. Are you making progress toward the original goal? If stuck, consider a different approach.",
  },
  {
    name: "check-exit-code",
    enabled: true,
    cooldownTurns: 2,
    text: "Always check command exit codes and output before proceeding. Don't assume success.",
  },
  {
    name: "commit-progress",
    enabled: true,
    cooldownTurns: 8,
    text: "Consider committing working changes before moving to the next task. Small commits are easier to review.",
  },
  {
    name: "test-after-extension-edit",
    enabled: true,
    cooldownTurns: 5,
    text: "You edited an extension. Run `task ext:test` or delegate to the tester agent to verify it loads correctly against the ExtensionAPI.",
  },
];
