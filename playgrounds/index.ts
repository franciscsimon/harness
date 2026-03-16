import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ─── Playgrounds Extension ────────────────────────────────────────
// Isolated sandbox for experimentation without affecting production.
// Pattern: Playgrounds — "Safe space for AI to experiment"
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/playgrounds

export default function (pi: ExtensionAPI) {
  let playgroundDir = "";
  let playgroundCount = 0;
  let cwd = "";

  pi.on("session_start", async (_event, ctx) => {
    cwd = ctx.cwd;
    playgroundDir = join(cwd, ".playground");
    playgroundCount = 0;
  });

  pi.registerCommand("playground", {
    description: "Create isolated sandbox for experimentation",
    getArgumentCompletions: (prefix: string) => [
      { value: "new", label: "new [name] — Create a new playground" },
      { value: "list", label: "list — Show existing playgrounds" },
      { value: "clean", label: "clean — Delete all playgrounds" },
      { value: "use", label: "use <name> — Tell agent to work in a playground" },
    ].filter((i) => i.value.startsWith(prefix)),
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/) ?? ["new"];
      const cmd = parts[0] ?? "new";

      if (cmd === "new") {
        playgroundCount++;
        const name = parts[1] ?? `pg-${playgroundCount}`;
        const dir = join(playgroundDir, name);
        mkdirSync(dir, { recursive: true });

        ctx.ui.setStatus("playground", `🏖️ ${name}`);
        ctx.ui.notify(
          `🏖️ Playground created: ${dir}\n` +
            `This directory is .gitignored. Experiment freely.\n` +
            `Use /playground clean to delete when done.`,
          "success",
        );

        // Tell the agent to use this playground
        pi.sendUserMessage(
          `A playground directory has been created at: ${dir}\n` +
            `Use this directory for experimentation. Write test scripts, try library APIs, ` +
            `validate assumptions here — NOT in the main codebase.\n` +
            `When you've learned what you need, apply the knowledge to the real code.`,
          { deliverAs: "followUp" },
        );
        return;
      }

      if (cmd === "use") {
        const name = parts[1];
        if (!name) { ctx.ui.notify("Usage: /playground use <name>", "error"); return; }
        const dir = join(playgroundDir, name);
        if (!existsSync(dir)) { ctx.ui.notify(`Playground "${name}" doesn't exist. Use /playground new.`, "error"); return; }
        ctx.ui.setStatus("playground", `🏖️ ${name}`);
        pi.sendUserMessage(
          `Switch to playground: ${dir}\nExperiment here. Don't modify the main codebase.`,
          { deliverAs: "followUp" },
        );
        return;
      }

      if (cmd === "list") {
        if (!existsSync(playgroundDir)) { ctx.ui.notify("No playgrounds. Use /playground new.", "info"); return; }
        const dirs = readdirSync(playgroundDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => `  🏖️ ${d.name}`);
        if (dirs.length === 0) { ctx.ui.notify("No playgrounds.", "info"); return; }
        ctx.ui.notify(`🏖️ Playgrounds:\n${dirs.join("\n")}\n\nDir: ${playgroundDir}`, "info");
        return;
      }

      if (cmd === "clean") {
        if (existsSync(playgroundDir)) {
          rmSync(playgroundDir, { recursive: true, force: true });
          ctx.ui.setStatus("playground", "");
          ctx.ui.notify("🏖️ All playgrounds deleted.", "info");
        } else {
          ctx.ui.notify("No playgrounds to clean.", "info");
        }
        return;
      }

      ctx.ui.notify("Usage: /playground new [name] | list | use <name> | clean", "error");
    },
  });
}
