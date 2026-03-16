import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

// ─── Chunker Extension ────────────────────────────────────────────
// Break complex tasks into manageable steps with tracked progress.
// Pattern: Chunking — "Auto-split large tasks into smaller chunks"
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/chunking

interface Step {
  text: string;
  done: boolean;
}

export default function (pi: ExtensionAPI) {
  let steps: Step[] = [];
  let currentStep = 0;
  let active = false;

  function reset() {
    steps = [];
    currentStep = 0;
    active = false;
  }

  function progressBar(): string {
    if (steps.length === 0) return "";
    const done = steps.filter((s) => s.done).length;
    const total = steps.length;
    const filled = Math.round((done / total) * 5);
    const bar = "■".repeat(filled) + "□".repeat(5 - filled);
    return `[${bar}] ${done}/${total}`;
  }

  function findNextUndone(): number {
    return steps.findIndex((s) => !s.done);
  }

  // ── Restore state ──
  pi.on("session_start", async (_event, ctx) => {
    reset();
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "chunker-steps") {
        const data = (entry as any).data;
        steps = data?.steps ?? [];
        currentStep = data?.currentStep ?? 0;
        active = data?.active ?? false;
      }
    }
    if (active && steps.length > 0) {
      ctx.ui.setStatus("chunker", `📦 ${progressBar()}`);
    }
  });

  // ── Inject focus prompt when chunking active ──
  pi.on("before_agent_start", async (event) => {
    if (!active || steps.length === 0) return;

    const idx = findNextUndone();
    if (idx === -1) return; // All done

    const step = steps[idx];
    const progress = progressBar();

    return {
      systemPrompt: (event as any).systemPrompt +
        `\n\n---\n\n` +
        `📦 CHUNKING MODE — ${progress}\n` +
        `Focus ONLY on step ${idx + 1}: ${step.text}\n` +
        `Do NOT work on other steps until this one is complete.\n` +
        `When done, say "Step ${idx + 1} complete" so the user can mark it done.`,
    };
  });

  // ── Persist state helper ──
  function saveState() {
    pi.appendEntry("chunker-steps", { steps, currentStep, active });
  }

  // ── /chunk command ──
  pi.registerCommand("chunk", {
    description: "Break tasks into tracked steps",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "add", label: "add <step> — Add a step" },
        { value: "list", label: "list — Show all steps" },
        { value: "done", label: "done <n> — Mark step N as complete" },
        { value: "next", label: "next — Focus on next undone step" },
        { value: "reset", label: "reset — Clear all steps" },
        { value: "start", label: "start — Activate chunking mode" },
        { value: "stop", label: "stop — Deactivate chunking mode" },
      ];
      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/) ?? ["list"];
      const cmd = parts[0] ?? "list";

      if (cmd === "add") {
        const text = parts.slice(1).join(" ").trim();
        if (!text) {
          ctx.ui.notify("Usage: /chunk add <step description>", "error");
          return;
        }
        steps.push({ text, done: false });
        active = true;
        saveState();
        ctx.ui.setStatus("chunker", `📦 ${progressBar()}`);
        ctx.ui.notify(`📦 Added step ${steps.length}: ${text}`, "success");
        return;
      }

      if (cmd === "list") {
        if (steps.length === 0) {
          ctx.ui.notify("No steps defined. Use /chunk add <step>.", "info");
          return;
        }
        const lines = steps.map((s, i) => {
          const icon = s.done ? "✅" : i === findNextUndone() ? "👉" : "⬜";
          return `  ${icon} ${i + 1}. ${s.text}`;
        });
        ctx.ui.notify(
          `📦 Steps ${progressBar()}:\n\n${lines.join("\n")}\n\n` +
            `Active: ${active ? "yes" : "no"}`,
          "info",
        );
        return;
      }

      if (cmd === "done") {
        const n = Number(parts[1]);
        if (!n || n < 1 || n > steps.length) {
          ctx.ui.notify(`Usage: /chunk done <1-${steps.length}>`, "error");
          return;
        }
        steps[n - 1].done = true;
        saveState();
        ctx.ui.setStatus("chunker", `📦 ${progressBar()}`);

        const next = findNextUndone();
        if (next === -1) {
          ctx.ui.notify(`✅ All ${steps.length} steps complete!`, "success");
          active = false;
          ctx.ui.setStatus("chunker", "");
        } else {
          ctx.ui.notify(`✅ Step ${n} done. Next: step ${next + 1} — ${steps[next].text}`, "success");
        }
        return;
      }

      if (cmd === "next") {
        const idx = findNextUndone();
        if (idx === -1) {
          ctx.ui.notify("All steps complete!", "success");
          return;
        }
        currentStep = idx;
        saveState();
        ctx.ui.notify(`👉 Focus on step ${idx + 1}: ${steps[idx].text}`, "info");
        pi.sendUserMessage(
          `Please work on step ${idx + 1}: ${steps[idx].text}`,
          { deliverAs: "followUp" },
        );
        return;
      }

      if (cmd === "start") {
        if (steps.length === 0) {
          ctx.ui.notify("No steps to work on. Use /chunk add <step> first.", "error");
          return;
        }
        active = true;
        saveState();
        ctx.ui.setStatus("chunker", `📦 ${progressBar()}`);
        ctx.ui.notify("📦 Chunking mode activated. Agent will focus on one step at a time.", "success");
        return;
      }

      if (cmd === "stop") {
        active = false;
        saveState();
        ctx.ui.setStatus("chunker", "");
        ctx.ui.notify("Chunking mode deactivated.", "info");
        return;
      }

      if (cmd === "reset") {
        reset();
        saveState();
        ctx.ui.setStatus("chunker", "");
        ctx.ui.notify("All steps cleared.", "info");
        return;
      }

      ctx.ui.notify("Usage: /chunk add <step> | list | done <n> | next | start | stop | reset", "error");
    },
  });

  // ── Tool: plan_chunks — LLM can break tasks into steps ──
  pi.registerTool({
    name: "plan_chunks",
    label: "Plan Chunks",
    description: "Break a complex task into ordered implementation steps and activate chunking mode",
    promptSnippet: "Break a task into ordered steps for focused implementation",
    promptGuidelines: [
      "Use plan_chunks when the user gives a complex task with multiple parts.",
      "Each step should be independently completable and testable.",
    ],
    parameters: Type.Object({
      action: StringEnum(["set", "done", "next", "list"] as const),
      steps: Type.Optional(Type.Array(Type.String(), { description: "Steps to set (for 'set' action)" })),
      step_number: Type.Optional(Type.Number({ description: "Step number to mark done (for 'done' action)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (params.action === "set" && params.steps) {
        steps = params.steps.map((text) => ({ text, done: false }));
        currentStep = 0;
        active = true;
        saveState();
        ctx.ui.setStatus("chunker", `📦 ${progressBar()}`);
        const list = steps.map((s, i) => `  ${i + 1}. ${s.text}`).join("\n");
        return { content: [{ type: "text", text: `📦 Created ${steps.length} steps:\n${list}\n\nFocus on step 1: ${steps[0].text}` }], details: { steps } };
      }
      if (params.action === "done") {
        const n = params.step_number ?? (findNextUndone() + 1);
        if (n < 1 || n > steps.length) throw new Error(`Invalid step: ${n}`);
        steps[n - 1].done = true;
        saveState();
        ctx.ui.setStatus("chunker", `📦 ${progressBar()}`);
        const next = findNextUndone();
        const msg = next === -1 ? `✅ All ${steps.length} steps complete!` : `✅ Step ${n} done. Next: step ${next + 1} — ${steps[next].text}`;
        return { content: [{ type: "text", text: msg }], details: { progress: progressBar() } };
      }
      if (params.action === "next") {
        const idx = findNextUndone();
        if (idx === -1) return { content: [{ type: "text", text: "All steps complete!" }], details: {} };
        return { content: [{ type: "text", text: `👉 Step ${idx + 1}: ${steps[idx].text}` }], details: { step: idx + 1 } };
      }
      // list
      if (steps.length === 0) return { content: [{ type: "text", text: "No steps defined." }], details: {} };
      const list = steps.map((s, i) => `  ${s.done ? "✅" : "⬜"} ${i + 1}. ${s.text}`).join("\n");
      return { content: [{ type: "text", text: `📦 ${progressBar()}\n${list}` }], details: { steps } };
    },
  });
}
