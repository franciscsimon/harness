import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

// ─── Mind Dump Extension ──────────────────────────────────────────
// Dump unstructured thoughts, let AI extract structure.
// Pattern: Mind Dump — "Speak unfiltered, AI extracts signal"
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/mind-dump

const DUMP_DIR = join(process.env.HOME ?? "~", ".pi", "agent", "dumps");

export default function (pi: ExtensionAPI) {
  let dumps: { text: string; ts: number }[] = [];

  pi.on("session_start", async () => { dumps = []; });

  pi.registerCommand("dump", {
    description: "Dump unstructured thoughts for AI to organize",
    getArgumentCompletions: (prefix: string) => [
      { value: "save", label: "save — Save current dumps to file" },
      { value: "list", label: "list — Show dumps this session" },
      { value: "ask", label: "ask — Have AI ask clarifying questions about your dump" },
    ].filter((i) => i.value.startsWith(prefix)),
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/) ?? [];
      const cmd = parts[0] ?? "";

      if (cmd === "save") {
        if (dumps.length === 0) { ctx.ui.notify("No dumps to save.", "info"); return; }
        mkdirSync(DUMP_DIR, { recursive: true });
        const file = join(DUMP_DIR, `dump-${Date.now()}.md`);
        const content = dumps.map((d, i) => `## Dump ${i + 1}\n\n${d.text}\n`).join("\n");
        writeFileSync(file, `# Mind Dump\n\n${content}`, "utf-8");
        ctx.ui.notify(`Saved ${dumps.length} dumps to ${file}`, "success");
        return;
      }

      if (cmd === "list") {
        if (dumps.length === 0) { ctx.ui.notify("No dumps yet. Use /dump <your thoughts>", "info"); return; }
        const lines = dumps.map((d, i) => `  ${i + 1}. ${d.text.slice(0, 80)}...`);
        ctx.ui.notify(`🧠 Dumps (${dumps.length}):\n${lines.join("\n")}`, "info");
        return;
      }

      if (cmd === "ask") {
        if (dumps.length === 0) { ctx.ui.notify("Dump something first: /dump <thoughts>", "info"); return; }
        const allText = dumps.map((d) => d.text).join("\n\n");
        pi.sendUserMessage(
          `Here's my mind dump. Ask me clarifying questions to surface gaps:\n\n${allText}`,
          { deliverAs: "followUp" },
        );
        return;
      }

      // Default: treat entire args as a dump
      const text = args?.trim();
      if (!text) { ctx.ui.notify("Usage: /dump <your unstructured thoughts> | save | list | ask", "error"); return; }
      dumps.push({ text, ts: Date.now() });
      ctx.ui.notify(`🧠 Dump #${dumps.length} captured (${text.length} chars). Use /dump ask to have AI clarify.`, "success");
    },
  });
}
