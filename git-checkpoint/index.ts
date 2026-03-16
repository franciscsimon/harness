import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── Git Checkpoint Extension ─────────────────────────────────────
// Stash code state at each turn so /fork can restore code.
// Pattern: Knowledge Checkpoint + Playgrounds safety net.

export default function (pi: ExtensionAPI) {
  const stashes = new Map<string, string>();
  let turnCount = 0;
  let enabled = true;

  pi.registerFlag("checkpoints", {
    description: "Enable git checkpoints (default: true)",
    type: "boolean",
    default: true,
  });

  pi.registerShortcut("C-M-g", async (ctx) => {
    if (!(await isGitRepo())) { ctx.ui.notify("Not a git repo.", "error"); return; }
    const ref = await stash(`manual-shortcut-turn${turnCount}`);
    ctx.ui.notify(ref ? `📌 Quick checkpoint: ${ref}` : "Nothing to stash.", ref ? "success" : "info");
  });

  async function isGitRepo(): Promise<boolean> {
    try {
      const r = await pi.exec("git", ["rev-parse", "--is-inside-work-tree"], {});
      return r.stdout?.trim() === "true";
    } catch { return false; }
  }

  async function stash(label: string): Promise<string | null> {
    try {
      const msg = `pi-checkpoint: ${label}`;
      await pi.exec("git", ["stash", "push", "-m", msg, "--include-untracked"], {});
      const r = await pi.exec("git", ["stash", "list", "--max-count=1"], {});
      const ref = r.stdout?.trim().split(":")[0];
      if (ref) {
        // Pop it back — we just want the ref for later
        await pi.exec("git", ["stash", "pop"], {});
        return ref;
      }
    } catch {}
    return null;
  }

  pi.on("session_start", async (_event, ctx) => {
    stashes.clear();
    turnCount = 0;
    enabled = pi.getFlag("checkpoints") !== false;
    if (enabled && await isGitRepo()) {
      ctx.ui.setStatus("git-cp", "📌 Git checkpoints on");
    }
  });

  pi.on("turn_end", async (event, ctx) => {
    if (!enabled) return;
    if (!(await isGitRepo())) return;
    turnCount++;

    const entryId = (event as any).entryId;
    const label = `turn-${turnCount}`;
    const ref = await stash(label);
    if (ref && entryId) {
      stashes.set(entryId, ref);
    }
  });

  // On fork, offer to restore code state
  pi.on("session_fork", async (event, ctx) => {
    const entryId = (event as any).entryId;
    const ref = stashes.get(entryId);
    if (!ref) return;

    const ok = await ctx.ui.confirm(
      "📌 Restore code?",
      `Restore code to the state at this checkpoint (${ref})?`,
    );
    if (ok) {
      try {
        await pi.exec("git", ["stash", "apply", ref], {});
        ctx.ui.notify(`📌 Code restored from ${ref}`, "success");
      } catch (e) {
        ctx.ui.notify(`Failed to restore: ${e}`, "error");
      }
    }
  });

  pi.registerCommand("git-cp", {
    description: "Manage git checkpoints",
    getArgumentCompletions: (prefix: string) => [
      { value: "on", label: "on — Enable auto-checkpoints" },
      { value: "off", label: "off — Disable auto-checkpoints" },
      { value: "save", label: "save — Manual checkpoint now" },
      { value: "status", label: "status — Show checkpoint info" },
    ].filter((i) => i.value.startsWith(prefix)),
    handler: async (args, ctx) => {
      const cmd = args?.trim() ?? "status";
      if (cmd === "on") { enabled = true; ctx.ui.setStatus("git-cp", "📌 Git checkpoints on"); ctx.ui.notify("Git checkpoints enabled.", "success"); return; }
      if (cmd === "off") { enabled = false; ctx.ui.setStatus("git-cp", ""); ctx.ui.notify("Git checkpoints disabled.", "info"); return; }
      if (cmd === "save") {
        const ref = await stash(`manual-turn${turnCount}`);
        ctx.ui.notify(ref ? `📌 Saved: ${ref}` : "Nothing to stash.", ref ? "success" : "info");
        return;
      }
      ctx.ui.notify(`📌 Git Checkpoints:\n  Enabled: ${enabled}\n  Turns: ${turnCount}\n  Stashes: ${stashes.size}`, "info");
    },
  });
}
