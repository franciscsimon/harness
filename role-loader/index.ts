import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

// ─── Role Loader + Agent Launcher Extension ───────────────────────
// Loads focused agent templates via /role <name> command.
// Launches pre-configured agent sessions via /agent <name> command.
// Pattern: Focused Agent — "Single, narrow responsibility"

const TEMPLATES_DIR = join(process.env.HOME ?? "~", "harness", "templates");

interface RoleInfo {
  name: string;
  emoji: string;
  description: string;
  content: string;
}

const ROLE_META: Record<string, { emoji: string; description: string }> = {
  // ── Core agents ──
  worker:             { emoji: "🛠️", description: "Implement features, fix bugs, write working code" },
  tester:             { emoji: "🧪", description: "Write tests for existing code, cover edge cases" },
  reviewer:           { emoji: "🔍", description: "Review code, flag issues, never modify files" },
  committer:          { emoji: "✅", description: "Review staged changes and write commit messages" },
  debugger:           { emoji: "🔬", description: "Debug with log-first approach" },
  refactorer:         { emoji: "🌀", description: "Refactor existing code, never add features" },
  // ── Planning & design ──
  planner:            { emoji: "📋", description: "Plan only, never implement" },
  architect:          { emoji: "🏗️", description: "Design system architecture, components, boundaries" },
  researcher:         { emoji: "🔎", description: "Investigate solutions, compare options, report findings" },
  "interface-first":  { emoji: "🔌", description: "Define contracts before implementing" },
  // ── Quality & maintenance ──
  "security-auditor": { emoji: "🔒", description: "Audit code for vulnerabilities, OWASP Top 10" },
  optimizer:          { emoji: "⚡", description: "Find and fix performance bottlenecks with measurements" },
  janitor:            { emoji: "🧹", description: "Remove dead code, reduce tech debt, tidy up" },
  migrator:           { emoji: "🔀", description: "Upgrade dependencies, migrate APIs, modernize code" },
  // ── Workflow specialists ──
  refiner:            { emoji: "🔄", description: "Iterate output step by step with user review" },
  "fixture-tester":   { emoji: "🧪", description: "Verify output against known-good fixtures" },
  documenter:         { emoji: "📝", description: "Document processes for future agents" },
  borrower:           { emoji: "🔄", description: "Grab and adapt patterns from other sources" },
  "softest-prototype":{ emoji: "🧊", description: "Discover needs by building simplest version" },
  explorer:           { emoji: "🔮", description: "Generate multiple alternatives, pick the best" },
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

  // ── Restore active role from session state ──
  pi.on("session_start", async (_event, ctx) => {
    activeRole = null;
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "role-loader-state") {
        activeRole = (entry as any).data?.role ?? null;
      }
    }
    if (activeRole) {
      const meta = ROLE_META[activeRole] ?? { emoji: "📄" };
      ctx.ui.setStatus("role-loader", `${meta.emoji} ${activeRole}`);
    }
  });

  // ── Inject active role into system prompt ──
  pi.on("before_agent_start", async (event) => {
    if (!activeRole) return;
    const roles = discoverRoles();
    const role = roles.find((r) => r.name === activeRole);
    if (!role) return;

    return {
      systemPrompt: event.systemPrompt + "\n\n---\n\n" + role.content,
    };
  });

  // ── /role command — activate a role in the current session ──
  pi.registerCommand("role", {
    description: "Load a focused agent role into the current session",
    getArgumentCompletions: (prefix: string) => {
      const roles = discoverRoles();
      const items = [
        { value: "list", label: "list — Show available roles" },
        { value: "clear", label: "clear — Remove active role" },
        ...roles.map((r) => ({ value: r.name, label: `${r.name} — ${r.emoji} ${r.description}` })),
      ];
      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const arg = args?.trim() ?? "";

      if (arg === "list" || arg === "") {
        const roles = discoverRoles();
        if (roles.length === 0) {
          ctx.ui.notify(`No templates found in ${TEMPLATES_DIR}`, "warn");
          return;
        }
        const lines = roles.map((r) => `  ${r.emoji} ${r.name.padEnd(18)} — ${r.description}`);
        ctx.ui.notify(
          `Available roles:\n${lines.join("\n")}\n\nActive: ${activeRole ? `${ROLE_META[activeRole]?.emoji ?? ""} ${activeRole}` : "none"}\n\nTip: Use /agent <name> to launch a focused agent in a new session.`,
          "info",
        );
        return;
      }

      if (arg === "clear") {
        activeRole = null;
        pi.appendEntry("role-loader-state", { role: null });
        ctx.ui.setStatus("role-loader", "");
        ctx.ui.notify("Role cleared.", "info");
        return;
      }

      const roles = discoverRoles();
      const role = roles.find((r) => r.name === arg);
      if (!role) {
        ctx.ui.notify(`Unknown role: "${arg}". Use /role list.`, "error");
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

  // ── /agent command — launch a focused agent in a NEW session ──
  pi.registerCommand("agent", {
    description: "Launch a focused agent in a new session",
    getArgumentCompletions: (prefix: string) => {
      const roles = discoverRoles();
      const items = [
        { value: "list", label: "list — Show available agents" },
        ...roles.map((r) => ({ value: r.name, label: `${r.name} — ${r.emoji} ${r.description}` })),
      ];
      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/) ?? ["list"];
      const agentName = parts[0] ?? "list";
      const task = parts.slice(1).join(" ");

      if (agentName === "list") {
        const roles = discoverRoles();
        if (roles.length === 0) {
          ctx.ui.notify(`No agent templates found in ${TEMPLATES_DIR}`, "warn");
          return;
        }
        const lines = roles.map((r) => `  ${r.emoji} ${r.name.padEnd(18)} — ${r.description}`);
        ctx.ui.notify(
          `Available agents:\n${lines.join("\n")}\n\nLaunch: /agent <name> [task description]`,
          "info",
        );
        return;
      }

      const roles = discoverRoles();
      const role = roles.find((r) => r.name === agentName);
      if (!role) {
        ctx.ui.notify(`Unknown agent: "${agentName}". Use /agent list.`, "error");
        return;
      }

      // Create a new session pre-configured with this role
      const result = await ctx.newSession({
        parentSession: ctx.sessionManager.getSessionFile() ?? undefined,
        setup: async (sm) => {
          // Persist the role choice so it survives in the new session
          sm.appendEntry({
            type: "custom",
            customType: "role-loader-state",
            data: { role: role.name },
            timestamp: Date.now(),
          });

          // If user provided a task, inject it as the first message
          if (task) {
            sm.appendMessage({
              role: "user",
              content: [
                {
                  type: "text",
                  text: `${role.emoji} Focused Agent: ${role.name}\n\n${task}`,
                },
              ],
              timestamp: Date.now(),
            });
          }
        },
      });

      if (result.cancelled) {
        ctx.ui.notify("Agent launch was cancelled.", "warn");
        return;
      }

      // The new session will pick up the role from session_start handler
      ctx.ui.notify(
        `${role.emoji} Focused agent **${role.name}** launched in a new session.\n` +
          (task ? `Task: ${task}\n` : "Ready for your prompt.\n") +
          `Ground rules and constraints are pre-loaded.`,
        "success",
      );
    },
  });
}
