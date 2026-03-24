import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

// ─── JIT Docs Extension ──────────────────────────────────────────
// Load documentation on-demand based on current task context.
// Pattern: JIT Docs — "Search current docs, don't rely on training data"
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/jit-docs

const DOCS_DIR = join(process.env.HOME ?? "~", ".pi", "agent", "docs");

export default function (pi: ExtensionAPI) {
  const loadedDocs: Map<string, string> = new Map();

  pi.on("session_start", async () => {
    loadedDocs.clear();
  });

  // ── Inject loaded docs into context ──
  pi.on("context", async (event) => {
    if (loadedDocs.size === 0) return;

    const docText = [...loadedDocs.entries()]
      .map(([name, content]) => `### 📄 ${name}\n\n${content}`)
      .join("\n\n---\n\n");

    const messages = [...event.messages];
    messages.push({
      role: "user" as any,
      content: [{ type: "text", text: `📚 JIT DOCS (loaded on demand):\n\n${docText}` }],
      timestamp: Date.now(),
    });
    return { messages };
  });

  // ── /docs command ──
  pi.registerCommand("docs", {
    description: "Load documentation on demand (JIT Docs)",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "load", label: "load <file> — Load a doc into context" },
        { value: "unload", label: "unload <file> — Remove a doc from context" },
        { value: "list", label: "list — Show available docs" },
        { value: "loaded", label: "loaded — Show currently loaded docs" },
        { value: "search", label: "search <term> — Search docs for a term" },
      ];

      // Also add available doc files
      if (existsSync(DOCS_DIR)) {
        const files = readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md"));
        for (const f of files) {
          items.push({ value: `load ${f}`, label: `load ${f}` });
        }
      }

      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/) ?? ["list"];
      const cmd = parts[0] ?? "list";

      if (cmd === "load") {
        const name = parts.slice(1).join(" ");
        if (!name) {
          ctx.ui.notify("Usage: /docs load <filename>", "error");
          return;
        }

        // Try multiple paths
        const candidates = [
          join(DOCS_DIR, name),
          join(DOCS_DIR, `${name}.md`),
          name, // absolute path
        ];

        let content = "";
        let resolvedPath = "";
        for (const p of candidates) {
          if (existsSync(p)) {
            content = readFileSync(p, "utf-8");
            resolvedPath = p;
            break;
          }
        }

        if (!content) {
          ctx.ui.notify(`Doc not found: ${name}\nLooked in: ${DOCS_DIR}\nUse /docs list to see available.`, "error");
          return;
        }

        const key = basename(resolvedPath);
        loadedDocs.set(key, content);
        ctx.ui.setStatus("jit-docs", `📚 ${loadedDocs.size} docs`);
        ctx.ui.notify(`📚 Loaded: ${key} (${content.length} chars)`, "success");
        return;
      }

      if (cmd === "unload") {
        const name = parts.slice(1).join(" ");
        if (loadedDocs.delete(name) || loadedDocs.delete(`${name}.md`)) {
          ctx.ui.setStatus("jit-docs", loadedDocs.size > 0 ? `📚 ${loadedDocs.size} docs` : "");
          ctx.ui.notify(`Unloaded: ${name}`, "info");
        } else {
          ctx.ui.notify(`Not loaded: ${name}`, "error");
        }
        return;
      }

      if (cmd === "loaded") {
        if (loadedDocs.size === 0) {
          ctx.ui.notify("No docs loaded. Use /docs load <file>.", "info");
          return;
        }
        const lines = [...loadedDocs.entries()].map(([k, v]) => `  📄 ${k} (${v.length} chars)`);
        ctx.ui.notify(`📚 Loaded docs:\n${lines.join("\n")}`, "info");
        return;
      }

      if (cmd === "search") {
        const term = parts.slice(1).join(" ").toLowerCase();
        if (!term) {
          ctx.ui.notify("Usage: /docs search <term>", "error");
          return;
        }
        if (!existsSync(DOCS_DIR)) {
          ctx.ui.notify(`No docs dir: ${DOCS_DIR}`, "error");
          return;
        }

        const files = readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md"));
        const hits: string[] = [];
        for (const f of files) {
          const content = readFileSync(join(DOCS_DIR, f), "utf-8");
          if (content.toLowerCase().includes(term)) {
            hits.push(`  📄 ${f}`);
          }
        }
        ctx.ui.notify(
          hits.length > 0 ? `🔍 Docs matching "${term}":\n${hits.join("\n")}` : `No docs match "${term}".`,
          "info",
        );
        return;
      }

      // Default: list
      if (!existsSync(DOCS_DIR)) {
        ctx.ui.notify(`No docs directory. Create ${DOCS_DIR} and add .md files.`, "info");
        return;
      }
      const files = readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md"));
      if (files.length === 0) {
        ctx.ui.notify(`No .md files in ${DOCS_DIR}`, "info");
        return;
      }
      const lines = files.map((f) => `  ${loadedDocs.has(f) ? "✅" : "  "} ${f}`);
      ctx.ui.notify(`📚 Available docs (${DOCS_DIR}):\n${lines.join("\n")}\n\nUse /docs load <file>`, "info");
    },
  });

  // ── Tool: lookup_docs — LLM-callable ──
  pi.registerTool({
    name: "lookup_docs",
    label: "Lookup Docs",
    description: "Search available documentation files for a keyword and load matching docs into context.",
    promptSnippet: "Search and load documentation files matching a keyword",
    promptGuidelines: ["Use lookup_docs instead of guessing API details — find the actual docs first."],
    parameters: Type.Object({ keyword: Type.String({ description: "Search term to find in docs" }) }),
    async execute(_tid: any, params: any, _s: any, _u: any, _ctx: any) {
      const term = params.keyword.toLowerCase();
      if (!existsSync(DOCS_DIR)) throw new Error(`No docs directory: ${DOCS_DIR}`);
      const files = readdirSync(DOCS_DIR).filter((f: string) => f.endsWith(".md"));
      const hits: string[] = [];
      for (const f of files) {
        const content = readFileSync(join(DOCS_DIR, f), "utf-8");
        if (content.toLowerCase().includes(term)) {
          hits.push(f);
          if (!loadedDocs.has(f)) {
            loadedDocs.set(f, content);
          }
        }
      }
      if (hits.length === 0) return { content: [{ type: "text", text: `No docs match: ${term}` }], details: {} };
      return {
        content: [{ type: "text", text: `📚 Found and loaded ${hits.length} doc(s): ${hits.join(", ")}` }],
        details: { loaded: hits },
      };
    },
  });
}
