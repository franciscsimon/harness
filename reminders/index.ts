import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── Reminders Extension ──────────────────────────────────────────
// Auto-inject user-defined rules into every prompt via context event.
// Pattern: Reminders — "Force attention on what matters through
// repetition and structure. Make compliance structural, not optional."
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/reminders

const DEFAULT_REMINDERS_PATH = join(process.env.HOME ?? "~", ".pi", "agent", "reminders.md");
const MAX_REMINDERS = 10; // Hard cap to prevent context rot

export default function (pi: ExtensionAPI) {
  const remindersPath = DEFAULT_REMINDERS_PATH;
  let turnCounter = 0;

  // ── Helpers ──

  function ensureFile(): void {
    if (!existsSync(remindersPath)) {
      mkdirSync(dirname(remindersPath), { recursive: true });
      writeFileSync(
        remindersPath,
        "# Reminders\n\n<!-- Add one reminder per line. Max 10. These are injected into every prompt. -->\n\n",
        "utf-8",
      );
    }
  }

  function readReminders(): string[] {
    ensureFile();
    const content = readFileSync(remindersPath, "utf-8");
    return content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("<!--"));
  }

  function writeReminders(reminders: string[]): void {
    ensureFile();
    const header =
      "# Reminders\n\n<!-- Add one reminder per line. Max 10. These are injected into every prompt. -->\n\n";
    writeFileSync(remindersPath, `${header + reminders.join("\n")}\n`, "utf-8");
  }

  // ── Inject reminders into context on every turn ──
  pi.on("context", async (event, _ctx) => {
    const reminders = readReminders();
    if (reminders.length === 0) return;

    turnCounter++;

    // Build reminder block — filter by [every-N] tags
    const active: string[] = [];
    for (const r of reminders.slice(0, MAX_REMINDERS)) {
      const match = r.match(/^\[every-(\d+)\]\s*(.*)/);
      if (match) {
        const interval = Number(match[1]);
        if (turnCounter % interval === 0) active.push(match[2]);
      } else {
        active.push(r);
      }
    }

    if (active.length === 0) return;

    const reminderText =
      "⚡ REMINDERS (injected every turn — follow these):\n" + active.map((r, i) => `${i + 1}. ${r}`).join("\n");

    // Prepend as a system-level reminder message
    const messages = [...event.messages];
    messages.push({
      role: "user" as any,
      content: [{ type: "text", text: reminderText }],
      timestamp: Date.now(),
    });

    return { messages };
  });

  // ── Reset turn counter on session start ──
  pi.on("session_start", async (_event, ctx) => {
    turnCounter = 0;
    const reminders = readReminders();
    ctx.ui.setStatus("reminders", reminders.length > 0 ? `📌 ${reminders.length} rules` : "");
  });

  // ── /reminders command ──
  pi.registerCommand("reminders", {
    description: "Manage auto-injected reminder rules",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "list", label: "list — Show current reminders" },
        { value: "add", label: "add <text> — Add a reminder" },
        { value: "remove", label: "remove <n> — Remove reminder by number" },
        { value: "edit", label: "edit — Open reminders file in editor" },
        { value: "clear", label: "clear — Remove all reminders" },
      ];
      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/) ?? ["list"];
      const cmd = parts[0] ?? "list";

      if (cmd === "list" || cmd === "") {
        const reminders = readReminders();
        if (reminders.length === 0) {
          ctx.ui.notify(`No reminders set.\nAdd with: /reminders add <text>\nFile: ${remindersPath}`, "info");
          return;
        }
        const lines = reminders.map((r, i) => `  ${i + 1}. ${r}`);
        ctx.ui.notify(
          `📌 Reminders (${reminders.length}/${MAX_REMINDERS}):\n${lines.join("\n")}\n\nFile: ${remindersPath}`,
          "info",
        );
        return;
      }

      if (cmd === "add") {
        const text = parts.slice(1).join(" ").trim();
        if (!text) {
          ctx.ui.notify("Usage: /reminders add <text>", "error");
          return;
        }
        const reminders = readReminders();
        if (reminders.length >= MAX_REMINDERS) {
          ctx.ui.notify(`Max ${MAX_REMINDERS} reminders. Remove one first.`, "error");
          return;
        }
        reminders.push(text);
        writeReminders(reminders);
        ctx.ui.setStatus("reminders", `📌 ${reminders.length} rules`);
        ctx.ui.notify(`📌 Added reminder #${reminders.length}: ${text}`, "success");
        return;
      }

      if (cmd === "remove") {
        const n = Number(parts[1]);
        const reminders = readReminders();
        if (!n || n < 1 || n > reminders.length) {
          ctx.ui.notify(`Usage: /reminders remove <1-${reminders.length}>`, "error");
          return;
        }
        const removed = reminders.splice(n - 1, 1)[0];
        writeReminders(reminders);
        ctx.ui.setStatus("reminders", reminders.length > 0 ? `📌 ${reminders.length} rules` : "");
        ctx.ui.notify(`Removed: ${removed}`, "info");
        return;
      }

      if (cmd === "edit") {
        ensureFile();
        const content = readFileSync(remindersPath, "utf-8");
        const edited = await ctx.ui.editor("Edit Reminders", content);
        if (edited != null) {
          writeFileSync(remindersPath, edited, "utf-8");
          const reminders = readReminders();
          ctx.ui.setStatus("reminders", reminders.length > 0 ? `📌 ${reminders.length} rules` : "");
          ctx.ui.notify(`Saved ${reminders.length} reminders.`, "success");
        }
        return;
      }

      if (cmd === "clear") {
        const ok = await ctx.ui.confirm("Clear reminders?", "Remove all reminders?");
        if (ok) {
          writeReminders([]);
          ctx.ui.setStatus("reminders", "");
          ctx.ui.notify("All reminders cleared.", "info");
        }
        return;
      }

      ctx.ui.notify("Usage: /reminders list | add <text> | remove <n> | edit | clear", "error");
    },
  });
}
