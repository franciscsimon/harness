import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

// ─── Semantic Zoom Extension ──────────────────────────────────────
// Control the level of detail in AI responses — zoom in or out.
// Pattern: Semantic Zoom — "Text becomes elastic with AI"
// Ref: https://lexler.github.io/augmented-coding-patterns/patterns/semantic-zoom

type ZoomLevel = "overview" | "normal" | "detailed";

const ZOOM_PROMPTS: Record<ZoomLevel, string> = {
  overview:
    "ZOOM LEVEL: OVERVIEW. Be extremely concise. " +
    "Give high-level architecture, main components, and how they interact. " +
    "No implementation details. Use bullet points and ASCII diagrams. " +
    "Collapse details — the user can zoom in later.",
  normal: "",
  detailed:
    "ZOOM LEVEL: DETAILED. Be thorough and specific. " +
    "Show implementation details, edge cases, error handling. " +
    "Explain the 'why' behind decisions. Include code examples. " +
    "The user wants to understand deeply.",
};

export default function (pi: ExtensionAPI) {
  let level: ZoomLevel = "normal";

  pi.on("session_start", async (_event, ctx) => {
    level = "normal";
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "zoom-level") {
        level = (entry as any).data?.level ?? "normal";
      }
    }
    if (level !== "normal") ctx.ui.setStatus("zoom", `🔎 ${level}`);
  });

  pi.on("before_agent_start", async (event) => {
    const prompt = ZOOM_PROMPTS[level];
    if (!prompt) return;
    return {
      systemPrompt: (event as any).systemPrompt + "\n\n" + prompt,
    };
  });

  pi.registerCommand("zoom", {
    description: "Set semantic zoom level for AI responses",
    getArgumentCompletions: (prefix: string) => [
      { value: "in", label: "in — Zoom in (detailed, thorough)" },
      { value: "out", label: "out — Zoom out (overview, concise)" },
      { value: "normal", label: "normal — Default detail level" },
      { value: "status", label: "status — Show current zoom level" },
    ].filter((i) => i.value.startsWith(prefix)),
    handler: async (args, ctx) => {
      const cmd = args?.trim() ?? "status";

      if (cmd === "in") { level = "detailed"; }
      else if (cmd === "out") { level = "overview"; }
      else if (cmd === "normal") { level = "normal"; }
      else {
        ctx.ui.notify(`🔎 Zoom level: ${level}`, "info");
        return;
      }

      pi.appendEntry("zoom-level", { level });
      ctx.ui.setStatus("zoom", level !== "normal" ? `🔎 ${level}` : "");
      ctx.ui.notify(`🔎 Zoom: ${level}${level !== "normal" ? ` — ${ZOOM_PROMPTS[level].slice(0, 60)}...` : ""}`, "success");
    },
  });

  // ── Tool: set_zoom — LLM-callable ──
  pi.registerTool({
    name: "set_zoom",
    label: "Set Zoom Level",
    description: "Set the semantic zoom level for responses: overview (concise), normal, or detailed (thorough).",
    promptSnippet: "Set response detail level: overview, normal, or detailed",
    promptGuidelines: ["Use set_zoom overview for architecture questions, detailed for implementation."],
    parameters: Type.Object({ level: StringEnum(["overview", "normal", "detailed"] as const) }),
    async execute(_tid: any, params: any, _s: any, _u: any, ctx: any) {
      level = params.level;
      pi.appendEntry("zoom-level", { level });
      ctx.ui.setStatus("zoom", level !== "normal" ? "🔎 " + level : "");
      return { content: [{ type: "text", text: "🔎 Zoom set to: " + level }], details: {} };
    },
  });

}