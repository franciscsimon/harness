import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";

// ─── Knowledge Composer Extension ─────────────────────────────────
// Compose multiple knowledge docs into focused, composable files.
// Pattern: Knowledge Composition — "Split knowledge into composable files"
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/knowledge-composition

const KNOWLEDGE_DIR = join(process.env.HOME ?? "~", ".pi", "agent", "knowledge");

export default function (pi: ExtensionAPI) {
  let composed: Map<string, string> = new Map();

  pi.on("session_start", async () => { composed.clear(); });

  // ── Inject composed knowledge into context ──
  pi.on("context", async (event) => {
    if (composed.size === 0) return;
    const text = [...composed.entries()]
      .map(([name, content]) => `### 📘 ${name}\n\n${content}`)
      .join("\n\n---\n\n");

    const messages = [...event.messages];
    messages.push({
      role: "user" as any,
      content: [{ type: "text", text: `📘 COMPOSED KNOWLEDGE:\n\n${text}` }],
      timestamp: Date.now(),
    });
    return { messages };
  });

  // ── /compose command ──
  pi.registerCommand("compose", {
    description: "Compose knowledge documents into context",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "add", label: "add <file...> — Add knowledge files to composition" },
        { value: "remove", label: "remove <file> — Remove a file from composition" },
        { value: "list", label: "list — Show available knowledge files" },
        { value: "active", label: "active — Show currently composed files" },
        { value: "clear", label: "clear — Clear all composed knowledge" },
        { value: "create", label: "create <name> <content> — Create a new knowledge file" },
      ];
      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/) ?? ["list"];
      const cmd = parts[0] ?? "list";

      if (cmd === "add") {
        const names = parts.slice(1);
        if (names.length === 0) { ctx.ui.notify("Usage: /compose add <file1> [file2...]", "error"); return; }

        let added = 0;
        for (const name of names) {
          const candidates = [
            join(KNOWLEDGE_DIR, name),
            join(KNOWLEDGE_DIR, name + ".md"),
            name,
          ];
          for (const p of candidates) {
            if (existsSync(p)) {
              const content = readFileSync(p, "utf-8");
              composed.set(basename(p), content);
              added++;
              break;
            }
          }
        }

        ctx.ui.setStatus("compose", composed.size > 0 ? `📘 ${composed.size} knowledge` : "");
        ctx.ui.notify(`📘 Added ${added}/${names.length} files. Active: ${composed.size}`, "success");
        return;
      }

      if (cmd === "remove") {
        const name = parts[1];
        if (composed.delete(name ?? "") || composed.delete((name ?? "") + ".md")) {
          ctx.ui.setStatus("compose", composed.size > 0 ? `📘 ${composed.size} knowledge` : "");
          ctx.ui.notify(`Removed: ${name}`, "info");
        } else {
          ctx.ui.notify(`Not in composition: ${name}`, "error");
        }
        return;
      }

      if (cmd === "active") {
        if (composed.size === 0) { ctx.ui.notify("No knowledge composed. Use /compose add <file>.", "info"); return; }
        const lines = [...composed.entries()].map(([k, v]) => `  📘 ${k} (${v.length} chars)`);
        ctx.ui.notify(`📘 Active composition:\n${lines.join("\n")}`, "info");
        return;
      }

      if (cmd === "clear") {
        composed.clear();
        ctx.ui.setStatus("compose", "");
        ctx.ui.notify("Composition cleared.", "info");
        return;
      }

      if (cmd === "create") {
        const name = parts[1];
        const content = parts.slice(2).join(" ");
        if (!name || !content) { ctx.ui.notify("Usage: /compose create <name> <content>", "error"); return; }
        mkdirSync(KNOWLEDGE_DIR, { recursive: true });
        const file = join(KNOWLEDGE_DIR, name.endsWith(".md") ? name : name + ".md");
        writeFileSync(file, `# ${name}\n\n${content}\n`, "utf-8");
        ctx.ui.notify(`📘 Created: ${file}`, "success");
        return;
      }

      // Default: list available
      if (!existsSync(KNOWLEDGE_DIR)) {
        mkdirSync(KNOWLEDGE_DIR, { recursive: true });
        ctx.ui.notify(`📘 Knowledge dir created: ${KNOWLEDGE_DIR}\nAdd .md files there, then /compose add <file>.`, "info");
        return;
      }
      const files = readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith(".md"));
      if (files.length === 0) { ctx.ui.notify(`No .md files in ${KNOWLEDGE_DIR}`, "info"); return; }
      const lines = files.map((f) => `  ${composed.has(f) ? "✅" : "  "} ${f}`);
      ctx.ui.notify(`📘 Knowledge files:\n${lines.join("\n")}\n\nUse /compose add <file>`, "info");
    },
  });
}
