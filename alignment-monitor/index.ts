import { dirname } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

// ─── Alignment Monitor Extension ──────────────────────────────────
// Detects when the agent drifts from the user's original intent.
// Anti-pattern: Silent Misalignment
// Ref: https://lexler.github.io/augmented-coding-patterns/anti-patterns/silent-misalignment

export default function (pi: ExtensionAPI) {
  let originalPrompt = "";
  const mentionedPaths: Set<string> = new Set();
  const touchedPaths: Set<string> = new Set();
  const touchedDirs: Set<string> = new Set();
  let notifiedDrift = false;
  let turnIndex = 0;

  function reset() {
    originalPrompt = "";
    mentionedPaths.clear();
    touchedPaths.clear();
    touchedDirs.clear();
    notifiedDrift = false;
    turnIndex = 0;
  }

  // ── Extract file paths mentioned in text ──
  function extractPaths(text: string): string[] {
    const paths: string[] = [];
    // Match common file path patterns
    const matches = text.match(/[./~][a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,10}/g) ?? [];
    for (const m of matches) {
      paths.push(m);
      paths.push(dirname(m));
    }
    // Also match backtick-quoted paths
    const btMatches = text.match(/`([^`]*\/[^`]+)`/g) ?? [];
    for (const m of btMatches) {
      const clean = m.replace(/`/g, "");
      paths.push(clean);
      paths.push(dirname(clean));
    }
    return paths;
  }

  pi.on("session_start", async () => {
    reset();
  });

  // ── Capture the original prompt ──
  pi.on("before_agent_start", async (event) => {
    const e = event as any;
    if (!originalPrompt && e.prompt) {
      originalPrompt = e.prompt;
      const paths = extractPaths(e.prompt);
      for (const p of paths) mentionedPaths.add(p);
    }
  });

  pi.on("turn_start", async () => {
    turnIndex++;
  });

  // ── Track what the agent touches ──
  pi.on("tool_call", async (event, ctx) => {
    const e = event as any;

    if ((e.toolName === "write" || e.toolName === "edit" || e.toolName === "read") && e.input?.path) {
      const path = String(e.input.path);
      touchedPaths.add(path);
      touchedDirs.add(dirname(path));

      // Check for drift: touching files in directories not mentioned in the original prompt
      if (turnIndex > 2 && mentionedPaths.size > 0 && !notifiedDrift) {
        const dir = dirname(path);
        const relatedToOriginal = [...mentionedPaths].some(
          (mp) => path.includes(mp) || mp.includes(dir) || dir.includes(dirname(mp)),
        );

        if (!relatedToOriginal) {
          // Count how many unrelated paths we've touched
          const unrelated = [...touchedPaths].filter(
            (tp) => ![...mentionedPaths].some((mp) => tp.includes(mp) || mp.includes(dirname(tp))),
          );

          if (unrelated.length >= 3) {
            notifiedDrift = true;
            ctx.ui.notify(
              `⚠️ Possible misalignment: The agent is working on files not mentioned in your original request.\n` +
                `  Original scope: ${[...mentionedPaths].slice(0, 3).join(", ")}\n` +
                `  Unrelated files: ${unrelated.slice(0, 3).join(", ")}\n` +
                `Use /check-alignment to compare.`,
              "warn",
            );
          }
        }
      }
    }

    // Detect unexpected package installs
    if (e.toolName === "bash" && e.input?.command) {
      const cmd = String(e.input.command);
      if (/npm install|yarn add|pip install|brew install/i.test(cmd)) {
        if (turnIndex > 1 && !originalPrompt.toLowerCase().includes("install")) {
          ctx.ui.notify(
            `⚠️ Agent is installing dependencies not mentioned in the original request.\n` +
              `  Command: ${cmd.slice(0, 80)}\n` +
              `  Was this intended?`,
            "warn",
          );
        }
      }
    }
  });

  // ── /check-alignment command ──
  pi.registerCommand("check-alignment", {
    description: "Compare what the agent has done vs what was asked",
    handler: async (_args, ctx) => {
      if (!originalPrompt) {
        ctx.ui.notify("No original prompt captured yet.", "info");
        return;
      }

      const mentioned = [...mentionedPaths].filter((p) => !p.includes(".")).slice(0, 10);
      const touched = [...touchedPaths].slice(0, 15);
      const unrelated = touched.filter(
        (tp) => ![...mentionedPaths].some((mp) => tp.includes(mp) || mp.includes(dirname(tp))),
      );

      const report = [
        `📊 Alignment Report:`,
        ``,
        `Original request (first ${Math.min(200, originalPrompt.length)} chars):`,
        `  "${originalPrompt.slice(0, 200)}${originalPrompt.length > 200 ? "..." : ""}"`,
        ``,
        `Mentioned paths: ${mentioned.length > 0 ? mentioned.join(", ") : "(none detected)"}`,
        ``,
        `Files touched: ${touched.length}`,
        ...touched.map((f) => `  ${mentionedPaths.has(f) || mentionedPaths.has(dirname(f)) ? "✅" : "⚠️"} ${f}`),
        ``,
        unrelated.length > 0
          ? `⚠️ Potentially unrelated (${unrelated.length}): ${unrelated.join(", ")}`
          : "✅ All touched files appear related to the original request.",
        ``,
        `Turns elapsed: ${turnIndex}`,
      ];

      ctx.ui.notify(report.join("\n"), "info");
    },
  });

  // ── Tool: check_alignment — LLM-callable ──
  pi.registerTool({
    name: "check_alignment",
    label: "Check Alignment",
    description:
      "Compare what the agent has done vs the original user request. Reports files touched, drift from scope.",
    promptSnippet: "Check if current work aligns with the user's original request",
    promptGuidelines: [
      "Use check_alignment periodically during complex tasks to verify you haven't drifted from the goal.",
    ],
    parameters: Type.Object({}),
    async execute(_tid: any, _p: any, _s: any, _u: any, _ctx: any) {
      const _mentioned = [...mentionedPaths].filter((p: string) => !p.includes(".")).slice(0, 10);
      const touched = [...touchedPaths].slice(0, 15);
      const unrelated = touched.filter(
        (tp: string) => ![...mentionedPaths].some((mp: string) => tp.includes(mp) || mp.includes(dirname(tp))),
      );
      const status = unrelated.length > 0 ? "⚠️ Possible drift" : "✅ On track";
      const report = `${status}\nOriginal: "${originalPrompt.slice(0, 150)}"\nFiles touched: ${touched.length}\nUnrelated: ${unrelated.length}${unrelated.length > 0 ? `\n  ${unrelated.slice(0, 5).join("\n  ")}` : ""}`;
      return { content: [{ type: "text", text: report }], details: { unrelated: unrelated.length } };
    },
  });
}
