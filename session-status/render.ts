// ─── Status Widget Renderer ───────────────────────────────────
// Formats a StatusReport into themed lines for ctx.ui.setWidget().

import type { Theme } from "@mariozechner/pi-coding-agent";
import type { CheckResult, Status, StatusReport } from "./checks.ts";

// ── Icon mapping ──────────────────────────────────────────────

function icon(status: Status, theme: Theme): string {
  switch (status) {
    case "ok":
      return theme.fg("success", "✓");
    case "warn":
      return theme.fg("warning", "~");
    case "fail":
      return theme.fg("error", "✗");
    case "skip":
      return theme.fg("dim", "·");
  }
}

// ── Compact group render ──────────────────────────────────────
// Renders a group as a single line: "Label: ✓A ✓B ✗C"

function compactGroup(label: string, items: CheckResult[], theme: Theme): string {
  if (items.length === 0) return "";
  const parts = items.map((r) => `${icon(r.status, theme)}${theme.fg("dim", r.name)}`);
  return `  ${theme.fg("text", label)}  ${parts.join("  ")}`;
}

// ── Summary counts ────────────────────────────────────────────

function summaryCounts(report: StatusReport, theme: Theme): string {
  const all = [
    report.docker,
    ...report.infrastructure,
    ...report.appServices,
    ...report.localDev,
    ...report.xtdb,
    ...report.piResources,
  ];
  const ok = all.filter((r) => r.status === "ok").length;
  const fail = all.filter((r) => r.status === "fail").length;
  const warn = all.filter((r) => r.status === "warn").length;
  const total = all.length;

  const parts: string[] = [];
  parts.push(theme.fg("success", `${ok}/${total} ok`));
  if (fail > 0) parts.push(theme.fg("error", `${fail} down`));
  if (warn > 0) parts.push(theme.fg("warning", `${warn} degraded`));

  return parts.join(theme.fg("dim", " · "));
}

// ── Pi resources compact ──────────────────────────────────────

function piResourceLine(items: CheckResult[], theme: Theme): string {
  const parts = items.map((r) => {
    const val = r.status === "ok" ? r.detail : "–";
    return `${icon(r.status, theme)}${theme.fg("dim", `${r.name}(${val})`)}`;
  });
  return `  ${theme.fg("text", "Pi")}  ${parts.join("  ")}`;
}

// ── Public API ────────────────────────────────────────────────

export function renderWidget(report: StatusReport, theme: Theme): string[] {
  const lines: string[] = [];

  // Header
  const header = `${theme.fg("text", "Harness")} ${theme.fg("dim", report.timestamp)}  ${summaryCounts(report, theme)}`;
  lines.push(header);

  // Docker status
  if (report.docker.status !== "ok") {
    lines.push(
      `  ${icon(report.docker.status, theme)} ${theme.fg("error", "Docker not running")} ${theme.fg("dim", "— infra checks skipped")}`,
    );
  } else {
    lines.push(compactGroup("Infra", report.infrastructure, theme));
    lines.push(compactGroup("Apps", report.appServices, theme));
  }

  // XTDB
  lines.push(compactGroup("XTDB", report.xtdb, theme));

  // Local dev
  lines.push(compactGroup("Local", report.localDev, theme));

  // Pi resources
  lines.push(piResourceLine(report.piResources, theme));

  return lines.filter(Boolean);
}
