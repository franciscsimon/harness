import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadCanaryConfig } from "./config.ts";
import {
  computeContextBloat,
  computeDuration,
  computeToolDensity,
  computeToolFailureRate,
  computeTurnInflation,
  detectRetryStorm,
} from "./metrics.ts";

// ─── Canary Monitor Extension ─────────────────────────────────────
// Computes quality signals from live session events and surfaces
// warnings via ctx.ui when thresholds are crossed.

export default function (pi: ExtensionAPI) {
  const config = loadCanaryConfig();

  // ── In-memory state for current session ──
  let toolEndEvents: { is_error: boolean; tool_name: string }[] = [];
  let recentToolStarts: { tool_name: string }[] = [];
  let turnCount = 0;
  let toolsInCurrentTurn = 0;
  let agentStartTs = 0;
  let lastPayloadBytes = 0;
  const notifiedThisTurn = new Set<string>();

  function reset() {
    toolEndEvents = [];
    recentToolStarts = [];
    turnCount = 0;
    toolsInCurrentTurn = 0;
    agentStartTs = 0;
    lastPayloadBytes = 0;
    notifiedThisTurn.clear();
  }

  // ── Reset on session start ──
  pi.on("session_start", async (_event, ctx) => {
    reset();
    ctx.ui.setStatus("canary-monitor", "🐤 Canary: ready");
  });

  // ── Track agent run start ──
  pi.on("agent_start", async (_event, _ctx) => {
    turnCount = 0;
    toolsInCurrentTurn = 0;
    agentStartTs = Date.now();
    toolEndEvents = [];
    recentToolStarts = [];
    notifiedThisTurn.clear();
  });

  // ── Track turn boundaries ──
  pi.on("turn_start", async (_event, _ctx) => {
    turnCount++;
    toolsInCurrentTurn = 0;
    notifiedThisTurn.clear();
  });

  // ── Track tool executions ──
  pi.on("tool_execution_start", async (event, _ctx) => {
    const e = event as any;
    recentToolStarts.push({ tool_name: e.toolName ?? "unknown" });
    toolsInCurrentTurn++;
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    const e = event as any;
    toolEndEvents.push({ is_error: !!e.isError, tool_name: e.toolName ?? "unknown" });

    // Check tool failure rate
    const failureResult = computeToolFailureRate(toolEndEvents, config);
    if (failureResult.alert && !notifiedThisTurn.has("failure")) {
      ctx.ui.notify(failureResult.message, "warn");
      notifiedThisTurn.add("failure");
    }

    // Check retry storm
    const stormResult = detectRetryStorm(recentToolStarts, config);
    if (stormResult.detected && !notifiedThisTurn.has("storm")) {
      ctx.ui.notify(stormResult.message, "warn");
      notifiedThisTurn.add("storm");
    }
  });

  // ── Track context size ──
  pi.on("before_provider_request", async (event, ctx) => {
    const e = event as any;
    const payload = e.payload;
    if (payload) {
      const bytes = typeof payload === "string" ? payload.length : JSON.stringify(payload).length;
      lastPayloadBytes = bytes;

      const bloatResult = computeContextBloat(bytes, config);
      if (bloatResult.alert && !notifiedThisTurn.has("bloat")) {
        ctx.ui.notify(bloatResult.message, "warn");
        notifiedThisTurn.add("bloat");
      }
    }
  });

  // ── Check metrics at turn end ──
  pi.on("turn_end", async (_event, ctx) => {
    // Turn inflation
    const turnResult = computeTurnInflation(turnCount, config);
    if (turnResult.alert && !notifiedThisTurn.has("turns")) {
      ctx.ui.notify(turnResult.message, "warn");
      notifiedThisTurn.add("turns");
    }

    // Tool density
    const densityResult = computeToolDensity(toolsInCurrentTurn, config);
    if (densityResult.alert && !notifiedThisTurn.has("density")) {
      ctx.ui.notify(densityResult.message, "warn");
      notifiedThisTurn.add("density");
    }

    // Duration
    if (agentStartTs > 0) {
      const durationResult = computeDuration(Date.now() - agentStartTs, config);
      if (durationResult.alert && !notifiedThisTurn.has("duration")) {
        ctx.ui.notify(durationResult.message, "warn");
        notifiedThisTurn.add("duration");
      }
    }

    // Update status widget
    const errCount = toolEndEvents.filter((e) => e.is_error).length;
    const ctxKb = Math.round(lastPayloadBytes / 1024);
    ctx.ui.setWidget("canary-monitor", [
      `🐤 turns=${turnCount} errors=${errCount}/${toolEndEvents.length} ctx=${ctxKb}KB`,
    ]);
    ctx.ui.setStatus("canary-monitor", `🐤 t${turnCount} e${errCount} ${ctxKb}KB`);
  });

  // ── Agent end: final summary ──
  pi.on("agent_end", async (_event, ctx) => {
    const errCount = toolEndEvents.filter((e) => e.is_error).length;
    const ctxKb = Math.round(lastPayloadBytes / 1024);
    ctx.ui.setWidget("canary-monitor", [
      `🐤 Run complete: ${turnCount} turns, ${errCount}/${toolEndEvents.length} errors, ${ctxKb}KB ctx`,
    ]);
  });
}
