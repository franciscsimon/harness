import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

// ─── Role Loader Extension ────────────────────────────────────────
// Loads focused agent templates via /role <name> command.

const TEMPLATES_DIR = join(process.env.HOME ?? "~", "harness", "templates");

interface RoleInfo {
  name: string;
  emoji: string;
  description: string;
  content: string;
}

const ROLE_META: Record<string, { emoji: string; description: string }> = {
  committer: { emoji: "✅", description: "Review staged changes and write commit messages" },
  reviewer: { emoji: "🔍", description: "Review code, flag issues, never modify files" },
  refactorer: { emoji: "🌀", description: "Refactor existing code, never add features" },
  debugger: { emoji: "🔬", description: "Debug with log-first approach" },
  planner: { emoji: "📋", description: "Plan only, never implement" },
};

export default function (pi: ExtensionAPI) {
  let activeRole: string | null = null;

  // ── Discover available roles ──
  function discoverRoles(): RoleInfo[] {
    if (!existsSync(TEMPLATES_DIR)) return [];
    const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".md"));
    return files.map((f) => {
      const name = basename(f, ".md");
      const content = readFileSync(join(TEMPLATES_DIR, f), "utf-8");
      const meta = ROLE_META[name] ?? { emoji: "📄", description: name };
      return { name, emoji: meta.emoji, description: meta.description, content };
    });
  }

  // ── Inject active role into system prompt ──
  pi.on("before_agent_start", async (event, ctx) => {
    if (!activeRole) return;

    const roles = discoverRoles();
    const role = roles.find((r) => r.name === activeRole);
    if (!role) return;

    return {
      systemPrompt: event.systemPrompt + "\n\n---\n\n" + role.content,
      message: {
        customType: "role-loader",
        content: `🎭 Active role: **${role.emoji} ${role.name}** — ${role.description}`,
        display: true,
      },
    };
  });

  // ── Restore active role from session entries ──
  pi.on("session_start", async (_event, ctx) => {
    activeRole = null;
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "role-loader-state") {
        activeRole = (entry as any).data?.role ?? null;
      }
    }
    if (activeRole) {
      const meta = ROLE_META[activeRole];
      ctx.ui.setStatus("role-loader", `${meta?.emoji ?? "📄"} ${activeRole}`);
    }
  });

  // ── /role command ──
  pi.registerCommand("role", {
    description: "Load a focused agent role template",
    getArgumentCompletions: (prefix: string) => {
      const roles = discoverRoles();
      const items = [
        { value: "list", label: "list — Show available roles" },
        { value: "clear", label: "clear — Deactivate current role" },
        ...roles.map((r) => ({ value: r.name, label: `${r.name} — ${r.emoji} ${r.description}` })),
      ];
      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const arg = args?.trim() ?? "";

      // /role list
      if (arg === "list" || arg === "") {
        const roles = discoverRoles();
        if (roles.length === 0) {
          ctx.ui.notify(`No templates found in ${TEMPLATES_DIR}`, "warn");
          return;
        }
        const lines = roles.map((r) => `  ${r.emoji} ${r.name.padEnd(12)} — ${r.description}`);
        ctx.ui.notify(
          `Available roles:\n${lines.join("\n")}\n\nActive: ${activeRole ? `${ROLE_META[activeRole]?.emoji ?? ""} ${activeRole}` : "none"}`,
          "info",
        );
        return;
      }

      // /role clear
      if (arg === "clear") {
        activeRole = null;
        pi.appendEntry("role-loader-state", { role: null });
        ctx.ui.setStatus("role-loader", "");
        ctx.ui.notify("Role cleared. Agent returns to default behavior.", "info");
        return;
      }

      // /role <name>
      const roles = discoverRoles();
      const role = roles.find((r) => r.name === arg);
      if (!role) {
        ctx.ui.notify(`Unknown role: "${arg}". Use /role list to see options.`, "error");
        return;
      }

      activeRole = role.name;
      pi.appendEntry("role-loader-state", { role: role.name });
      ctx.ui.setStatus("role-loader", `${role.emoji} ${role.name}`);
      ctx.ui.notify(
        `${role.emoji} Role activated: **${role.name}**\n${role.description}\n\nRole will be injected into the next agent turn.`,
        "success",
      );
    },
  });
}
