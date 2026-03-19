import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { DEFAULT_PROMPTS, type ContextualPrompt } from "./prompts.ts";

// ─── Contextual Prompts Extension ─────────────────────────────────
// Inject context-aware prompts based on what the agent is doing.
// Pattern: Contextual Prompts — event-driven, not static.
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/contextual-prompts

const CONFIG_PATH = join(process.env.HOME ?? "~", ".pi", "agent", "contextual-prompts.json");

export default function (pi: ExtensionAPI) {
  let prompts: ContextualPrompt[] = [...DEFAULT_PROMPTS];
  let lastFiredTurn: Record<string, number> = {};
  let turnIndex = 0;
  let consecutiveEdits = 0;
  let lastPayloadBytes = 0;
  let pendingInjections: string[] = [];

  // ── Load config ──
  function loadConfig() {
    if (existsSync(CONFIG_PATH)) {
      try {
        const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
        if (Array.isArray(raw)) {
          prompts = raw;
        } else if (raw.prompts) {
          prompts = raw.prompts;
        }
      } catch {}
    }
  }

  function saveConfig() {
    mkdirSync(dirname(CONFIG_PATH), { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(prompts, null, 2), "utf-8");
  }

  function canFire(name: string, cooldown: number): boolean {
    const last = lastFiredTurn[name] ?? -999;
    return turnIndex - last >= cooldown;
  }

  function fire(prompt: ContextualPrompt) {
    if (!prompt.enabled) return;
    if (!canFire(prompt.name, prompt.cooldownTurns)) return;
    lastFiredTurn[prompt.name] = turnIndex;
    pendingInjections.push(prompt.text);
  }

  function findPrompt(name: string): ContextualPrompt | undefined {
    return prompts.find((p) => p.name === name);
  }

  // ── Reset on session ──
  pi.on("session_start", async (_event, ctx) => {
    loadConfig();
    turnIndex = 0;
    consecutiveEdits = 0;
    lastPayloadBytes = 0;
    lastFiredTurn = {};
    pendingInjections = [];
    const enabled = prompts.filter((p) => p.enabled).length;
    ctx.ui.setStatus("ctx-prompts", `💡 ${enabled} prompts`);
  });

  // ── Track turns ──
  pi.on("turn_start", async () => {
    turnIndex++;
    pendingInjections = [];

    // P: progress-check — many turns
    if (turnIndex > 20) {
      const p = findPrompt("progress-check");
      if (p) fire(p);
    }
  });

  // ── Track tool calls ──
  pi.on("tool_execution_start", async (event) => {
    const e = event as any;
    const tool = e.toolName ?? "";

    if (tool === "write" || tool === "edit") {
      consecutiveEdits++;

      // P: verify-after-edits — 3+ consecutive edits
      if (consecutiveEdits >= 3) {
        const p = findPrompt("verify-after-edits");
        if (p) fire(p);
      }
    } else {
      consecutiveEdits = 0;
    }

    // P: test-after-write — writing test files
    if (tool === "write" && e.args?.path) {
      const path = String(e.args.path);
      if (/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(path) || path.includes("__tests__")) {
        const p = findPrompt("test-after-write");
        if (p) fire(p);
      }
    }
  });

  pi.on("tool_execution_end", async (event) => {
    const e = event as any;

    // P: commit-progress — after successful edits
    if ((e.toolName === "write" || e.toolName === "edit") && !e.isError) {
      const p = findPrompt("commit-progress");
      if (p && turnIndex > 3) fire(p);
    }
  });

  // ── Track context size ──
  pi.on("before_provider_request", async (event) => {
    const e = event as any;
    if (e.payload) {
      const bytes = typeof e.payload === "string" ? e.payload.length : JSON.stringify(e.payload).length;
      lastPayloadBytes = bytes;

      // P: concise-in-large-context — payload > 400KB (~20% of context window)
      if (bytes > 400_000) {
        const p = findPrompt("concise-in-large-context");
        if (p) fire(p);
      }
    }
  });

  // ── Inject pending prompts into context ──
  pi.on("context", async (event) => {
    if (pendingInjections.length === 0) return;

    const injectionText = "💡 CONTEXTUAL GUIDANCE:\n" +
      pendingInjections.map((t) => `• ${t}`).join("\n");

    const messages = [...event.messages];
    messages.push({
      role: "user" as any,
      content: [{ type: "text", text: injectionText }],
      timestamp: Date.now(),
    });

    pendingInjections = [];
    return { messages };
  });

  // ── /prompts command ──
  pi.registerCommand("prompts", {
    description: "Manage contextual prompts",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "list", label: "list — Show all prompts" },
        { value: "enable", label: "enable <name> — Enable a prompt" },
        { value: "disable", label: "disable <name> — Disable a prompt" },
        { value: "add", label: "add <name> <cooldown> <text> — Add custom prompt" },
        { value: "reset", label: "reset — Restore defaults" },
      ];
      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/) ?? ["list"];
      const cmd = parts[0] ?? "list";

      if (cmd === "list") {
        const lines = prompts.map((p) => {
          const icon = p.enabled ? "✅" : "⏸";
          const last = lastFiredTurn[p.name];
          const firedStr = last != null ? `(last: turn ${last})` : "(never fired)";
          return `  ${icon} ${p.name.padEnd(25)} cd=${p.cooldownTurns} ${firedStr}\n      ${p.text}`;
        });
        ctx.ui.notify(`💡 Contextual Prompts (turn ${turnIndex}):\n\n${lines.join("\n\n")}`, "info");
        return;
      }

      if (cmd === "enable" || cmd === "disable") {
        const name = parts[1];
        const p = name ? findPrompt(name) : undefined;
        if (!p) {
          ctx.ui.notify(`Unknown prompt: ${name}. Use /prompts list.`, "error");
          return;
        }
        p.enabled = cmd === "enable";
        saveConfig();
        ctx.ui.notify(`${cmd === "enable" ? "✅" : "⏸"} ${name} ${cmd}d`, "info");
        const enabled = prompts.filter((p) => p.enabled).length;
        ctx.ui.setStatus("ctx-prompts", `💡 ${enabled} prompts`);
        return;
      }

      if (cmd === "add") {
        const name = parts[1];
        const cooldown = Number(parts[2]) || 3;
        const text = parts.slice(3).join(" ");
        if (!name || !text) {
          ctx.ui.notify("Usage: /prompts add <name> <cooldown> <text>", "error");
          return;
        }
        prompts.push({ name, enabled: true, cooldownTurns: cooldown, text });
        saveConfig();
        ctx.ui.notify(`Added: ${name} (cd=${cooldown})`, "success");
        return;
      }

      if (cmd === "reset") {
        prompts = [...DEFAULT_PROMPTS];
        saveConfig();
        ctx.ui.notify("Reset to defaults.", "info");
        return;
      }

      ctx.ui.notify("Usage: /prompts list | enable <n> | disable <n> | add <name> <cd> <text> | reset", "error");
    },
  });
}
