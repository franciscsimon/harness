// ─── Mutation Classification ───────────────────────────────────────
// Pure functions. No I/O.

const ALWAYS_MUTATING = new Set(["write", "edit"]);

const NEVER_MUTATING = new Set(["read", "grep", "glob", "ls", "find"]);

const BASH_MUTATING_PREFIXES = [
  "git commit",
  "git push",
  "git merge",
  "git rebase",
  "git checkout -b",
  "git branch -d",
  "rm ",
  "rm\t",
  "mv ",
  "mv\t",
  "cp ",
  "cp\t",
  "mkdir",
  "rmdir",
  "chmod",
  "chown",
  "npm install",
  "npm uninstall",
  "yarn add",
  "yarn remove",
  "pnpm add",
  "pnpm remove",
  "pip install",
  "pip uninstall",
  "docker run",
  "docker build",
  "docker compose up",
  "brew install",
  "apt install",
  "apt remove",
];

/**
 * Classify whether a tool invocation is a mutation (changes project state).
 */
export function isMutation(toolName: string, input: Record<string, unknown>): boolean {
  if (ALWAYS_MUTATING.has(toolName)) return true;
  if (NEVER_MUTATING.has(toolName)) return false;

  if (toolName === "bash") {
    const cmd = typeof input.command === "string" ? input.command.trimStart() : "";
    return BASH_MUTATING_PREFIXES.some((p) => cmd.startsWith(p));
  }

  return false;
}

/**
 * Produce a short human-readable summary of the tool invocation.
 */
export function inputSummary(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "write" || toolName === "edit") {
    const path = typeof input.path === "string" ? input.path : "?";
    return `${toolName} → ${path}`;
  }
  if (toolName === "bash") {
    const cmd = typeof input.command === "string" ? input.command : "";
    return `bash → ${cmd.slice(0, 80)}`;
  }
  return toolName;
}
