import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { type DetectorState, runAllDetectors } from "./detectors.ts";

// ─── Slop Detector Extension ──────────────────────────────────────
// Detect 5 anti-patterns: AI Slop, Answer Injection, Obsess Over Rules,
// Perfect Recall Fallacy, Tell Me a Lie.
// All detectors are pure functions in detectors.ts for testability.

export default function (pi: ExtensionAPI) {
  let state: DetectorState = freshState();
  const firedPatterns = new Set<string>();
  let sessionStart = Date.now();

  function freshState(): DetectorState {
    return {
      turnIndex: 0,
      toolCalls: [],
      writtenFiles: [],
      writtenBytes: 0,
      testRuns: 0,
      reviewSteps: 0,
      userPrompts: [],
      systemRulesCount: 0,
      contextBytes: 0,
      contextMsgCount: 0,
      sessionDurationMs: 0,
    };
  }

  pi.on("session_start", async () => {
    state = freshState();
    firedPatterns.clear();
    sessionStart = Date.now();
  });

  pi.on("agent_start", async () => {
    firedPatterns.clear();
  });

  pi.on("turn_start", async () => {
    state.turnIndex++;
    state.sessionDurationMs = Date.now() - sessionStart;
  });

  // Track user prompts for answer injection / tell-me-a-lie detection
  pi.on("input", async (event) => {
    const e = event as any;
    if (e.text) state.userPrompts.push(String(e.text));
  });

  // Track tool calls
  pi.on("tool_call", async (event) => {
    const e = event as any;
    state.toolCalls.push({ tool: e.toolName, path: e.input?.path, isError: false });

    if (e.toolName === "write" && e.input?.path) {
      state.writtenFiles.push(e.input.path);
      if (e.input?.content) state.writtenBytes += String(e.input.content).length;
    }

    if (e.toolName === "bash" && e.input?.command) {
      const cmd = String(e.input.command).toLowerCase();
      if (/test|vitest|jest|mocha|pytest/i.test(cmd)) state.testRuns++;
    }
  });

  // Track context size
  pi.on("before_provider_request", async (event) => {
    const e = event as any;
    if (e.payload) {
      const bytes = typeof e.payload === "string" ? e.payload.length : JSON.stringify(e.payload).length;
      state.contextBytes = bytes;
    }
    if (e.messages) state.contextMsgCount = e.messages.length;
  });

  // Count system rules (lines starting with - or * or numbered)
  pi.on("context", async (event) => {
    let ruleCount = 0;
    for (const msg of event.messages) {
      if (msg.role === "system" || msg.role === "user") {
        for (const part of msg.content ?? []) {
          if (typeof part === "object" && part.type === "text") {
            const lines = part.text.split("\n");
            for (const line of lines) {
              if (/^\s*[-*•]\s/.test(line) || /^\s*\d+[.)]\s/.test(line)) ruleCount++;
            }
          }
        }
      }
    }
    state.systemRulesCount = ruleCount;
  });

  // ── Run detectors at turn end ──
  pi.on("turn_end", async (_event, ctx) => {
    state.sessionDurationMs = Date.now() - sessionStart;
    const detections = runAllDetectors(state);

    for (const d of detections) {
      if (!firedPatterns.has(d.pattern)) {
        firedPatterns.add(d.pattern);
        ctx.ui.notify(d.message, d.severity === "error" ? "error" : d.severity === "warn" ? "warn" : "info");
      }
    }
  });

  // ── /antipatterns command ──
  pi.registerCommand("antipatterns", {
    description: "Check for anti-patterns in this session",
    handler: async (_args, ctx) => {
      state.sessionDurationMs = Date.now() - sessionStart;
      const detections = runAllDetectors(state);

      if (detections.length === 0) {
        ctx.ui.notify(
          "✅ No anti-patterns detected.\n" +
            `  Turn: ${state.turnIndex} | Files: ${state.writtenFiles.length} | Tests: ${state.testRuns} | Context: ${Math.round(state.contextBytes / 1024)}KB`,
          "success",
        );
        return;
      }

      const lines = detections.map((d) => d.message);
      ctx.ui.notify(`🚨 Anti-patterns detected (${detections.length}):\n\n${lines.join("\n\n")}`, "warn");
    },
  });

  // ── Tool: check_antipatterns — LLM-callable ──
  pi.registerTool({
    name: "check_antipatterns",
    label: "Check Anti-patterns",
    description:
      "Scan text for common AI slop patterns: filler phrases, answer injection, rule obsession, perfect recall fallacy.",
    promptSnippet: "Scan text for AI anti-patterns (slop, answer injection, etc.)",
    promptGuidelines: ["Use check_antipatterns on your own output if the user seems dissatisfied with quality."],
    parameters: Type.Object({ text: Type.String({ description: "Text to analyze for anti-patterns" }) }),
    async execute(_tid: any, params: any) {
      const results: string[] = [];
      const slop = detectAiSlop(params.text);
      if (slop.length > 0) results.push(`AI Slop: ${slop.map((s: any) => s.phrase).join(", ")}`);
      const injection = detectAnswerInjection(params.text);
      if (injection.length > 0) results.push(`Answer Injection: ${injection.map((a: any) => a.indicator).join(", ")}`);
      const rules = detectObsessOverRules(params.text);
      if (rules.length > 0) results.push(`Rule Obsession: ${rules.map((r: any) => r.indicator).join(", ")}`);
      const recall = detectPerfectRecallFallacy(params.text);
      if (recall.length > 0) results.push(`Perfect Recall: ${recall.map((r: any) => r.indicator).join(", ")}`);
      if (results.length === 0)
        return { content: [{ type: "text", text: "✅ No anti-patterns detected." }], details: {} };
      return {
        content: [{ type: "text", text: `⚠️ Anti-patterns found:\n${results.join("\n")}` }],
        details: { count: results.length },
      };
    },
  });
}
