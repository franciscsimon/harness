// ─── Session Status Extension ─────────────────────────────────
// Displays infrastructure and service availability as a widget
// when a pi session starts. Replaces the bash status.sh with a
// native TUI widget that stays visible above the editor.
//
// Checks: Docker containers, HTTP endpoints, TCP ports, pi resources.
// Auto-hides after 30s or dismiss with /status-clear.
// Re-check anytime with /status.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { collectStatus } from "./checks.ts";
import { renderWidget } from "./render.ts";

const WIDGET_ID = "harness-status";
const AUTO_HIDE_MS = 30_000;

export default function (pi: ExtensionAPI) {
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  async function showStatus(ctx: { hasUI: boolean; ui: any }) {
    if (!ctx.hasUI) return;

    ctx.ui.setWidget(WIDGET_ID, [ctx.ui.theme.fg("dim", "Checking services…")]);

    const report = await collectStatus();
    const lines = renderWidget(report, ctx.ui.theme);
    ctx.ui.setWidget(WIDGET_ID, lines);

    // Auto-hide after timeout
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      ctx.ui.setWidget(WIDGET_ID, undefined);
      hideTimer = null;
    }, AUTO_HIDE_MS);
  }

  // Show on session start
  pi.on("session_start", async (_event, ctx) => {
    await showStatus(ctx);
  });

  // Show again after session switch
  pi.on("session_switch", async (_event, ctx) => {
    await showStatus(ctx);
  });

  // Manual refresh
  pi.registerCommand("status", {
    description: "Show infrastructure & service status",
    handler: async (_args, ctx) => {
      await showStatus(ctx);
    },
  });

  // Manual dismiss
  pi.registerCommand("status-clear", {
    description: "Hide the status widget",
    handler: async (_args, ctx) => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      ctx.ui.setWidget(WIDGET_ID, undefined);
    },
  });
}
