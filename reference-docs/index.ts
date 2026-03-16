import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";

// ─── Reference Docs Extension ─────────────────────────────────────
// On-demand knowledge documents loaded only when relevant.
// Pattern: Reference Docs — "Load docs only when you need them"
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/reference-docs
// Unlike ground-rules (always loaded), references are pulled in explicitly.

export default function (pi: ExtensionAPI) {
  let loaded: Map<string, string> = new Map();
  let cwd = "";

  // Directories to scan for reference docs (in priority order)
  function docPaths(): string[] {
    return [
      join(cwd, "docs"),
      join(cwd, ".docs"),
      join(cwd, "references"),
      join(process.env.HOME ?? "~", ".pi", "agent", "references"),
    ];
  }

  function findAllDocs(): { name: string; path: string; size: number }[] {
    const docs: { name: string; path: string; size: number }[] = [];
    for (const dir of docPaths()) {
      if (!existsSync(dir)) continue;
      try {
        for (const f of readdirSync(dir)) {
          if (extname(f) === ".md") {
            const p = join(dir, f);
            const s = statSync(p);
            docs.push({ name: f, path: p, size: s.size });
          }
        }
      } catch {}
    }
    return docs;
  }

  pi.on("session_start", async (_event, ctx) => {
    loaded.clear();
    cwd = ctx.cwd;
  });

  // ── Auto-detect relevant docs based on tool usage ──
  pi.on("tool_call", async (event, ctx) => {
    const e = event as any;
    if (e.toolName !== "bash" || !e.input?.command) return;
    const cmd = String(e.input.command).toLowerCase();

    // Auto-suggest relevant docs based on commands being run
    const suggestions: Record<string, string[]> = {
      "git": ["git-workflow.md", "git-standards.md"],
      "docker": ["docker.md", "deployment.md"],
      "npm test": ["testing.md", "tdd.md", "test-standards.md"],
      "vitest": ["testing.md", "vitest.md"],
      "curl": ["api-docs.md", "api.md"],
      "psql": ["database.md", "db.md", "sql.md"],
      "kubectl": ["kubernetes.md", "k8s.md", "deployment.md"],
    };

    const allDocs = findAllDocs();
    for (const [pattern, docNames] of Object.entries(suggestions)) {
      if (cmd.includes(pattern)) {
        for (const docName of docNames) {
          const doc = allDocs.find((d) => d.name === docName);
          if (doc && !loaded.has(doc.name)) {
            ctx.ui.notify(
              `📄 Reference doc available: ${doc.name}\n` +
                `  Use /ref load ${doc.name} to add it to context.`,
              "info",
            );
            break; // One suggestion per command
          }
        }
        break;
      }
    }
  });

  // ── Inject loaded refs into context ──
  pi.on("context", async (event) => {
    if (loaded.size === 0) return;
    const text = [...loaded.entries()]
      .map(([name, content]) => `### 📄 ${name}\n\n${content}`)
      .join("\n\n---\n\n");

    const messages = [...event.messages];
    messages.push({
      role: "user" as any,
      content: [{ type: "text", text: `📄 REFERENCE DOCS:\n\n${text}` }],
      timestamp: Date.now(),
    });
    return { messages };
  });

  // ── /ref command ──
  pi.registerCommand("ref", {
    description: "Load reference documentation on demand",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "load", label: "load <file> — Load a reference doc" },
        { value: "unload", label: "unload <file> — Remove from context" },
        { value: "list", label: "list — Show available reference docs" },
        { value: "loaded", label: "loaded — Show currently loaded refs" },
      ];
      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/) ?? ["list"];
      const cmd = parts[0] ?? "list";

      if (cmd === "load") {
        const name = parts.slice(1).join(" ");
        if (!name) { ctx.ui.notify("Usage: /ref load <filename>", "error"); return; }

        const allDocs = findAllDocs();
        const doc = allDocs.find((d) => d.name === name || d.name === name + ".md");
        if (!doc) {
          // Try as absolute path
          if (existsSync(name)) {
            const content = readFileSync(name, "utf-8");
            loaded.set(basename(name), content);
            ctx.ui.setStatus("ref-docs", `📄 ${loaded.size} refs`);
            ctx.ui.notify(`📄 Loaded: ${basename(name)}`, "success");
            return;
          }
          ctx.ui.notify(`Not found: ${name}. Use /ref list.`, "error");
          return;
        }

        const content = readFileSync(doc.path, "utf-8");
        loaded.set(doc.name, content);
        ctx.ui.setStatus("ref-docs", `📄 ${loaded.size} refs`);
        ctx.ui.notify(`📄 Loaded: ${doc.name} (${Math.round(doc.size / 1024)}KB)`, "success");
        return;
      }

      if (cmd === "unload") {
        const name = parts[1];
        if (loaded.delete(name ?? "") || loaded.delete((name ?? "") + ".md")) {
          ctx.ui.setStatus("ref-docs", loaded.size > 0 ? `📄 ${loaded.size} refs` : "");
          ctx.ui.notify(`Unloaded: ${name}`, "info");
        } else {
          ctx.ui.notify(`Not loaded: ${name}`, "error");
        }
        return;
      }

      if (cmd === "loaded") {
        if (loaded.size === 0) { ctx.ui.notify("No refs loaded. Use /ref load <file>.", "info"); return; }
        const lines = [...loaded.entries()].map(([k, v]) => `  📄 ${k} (${v.length} chars)`);
        ctx.ui.notify(`📄 Loaded refs:\n${lines.join("\n")}`, "info");
        return;
      }

      // Default: list
      const allDocs = findAllDocs();
      if (allDocs.length === 0) {
        ctx.ui.notify(`No .md files found in:\n${docPaths().map((d) => `  ${d}`).join("\n")}`, "info");
        return;
      }
      const lines = allDocs.map((d) => `  ${loaded.has(d.name) ? "✅" : "  "} ${d.name} (${Math.round(d.size / 1024)}KB)`);
      ctx.ui.notify(`📄 Available reference docs:\n${lines.join("\n")}`, "info");
    },
  });

  // ── Tool: load_reference — LLM-callable ──
  pi.registerTool({
    name: "load_reference",
    label: "Load Reference",
    description: "Load a reference document into context by name. Search project docs/, .docs/, references/ directories.",
    promptSnippet: "Load a reference doc into context by filename",
    promptGuidelines: ["Use load_reference when you need API docs, standards, or guidelines for the current task."],
    parameters: Type.Object({ name: Type.String({ description: "Doc filename (e.g. 'api.md')" }) }),
    async execute(_tid: any, params: any, _s: any, _u: any, ctx: any) {
      const allDocs = findAllDocs();
      const doc = allDocs.find((d: any) => d.name === params.name || d.name === params.name + ".md");
      if (!doc) {
        const available = allDocs.map((d: any) => d.name).join(", ");
        throw new Error("Not found: " + params.name + ". Available: " + available);
      }
      const content = readFileSync(doc.path, "utf-8");
      loaded.set(doc.name, content);
      ctx.ui.setStatus("ref-docs", "📄 " + loaded.size + " refs");
      return { content: [{ type: "text", text: "📄 Loaded: " + doc.name + " (" + Math.round(doc.size / 1024) + "KB)" }], details: { name: doc.name } };
    },
  });

}