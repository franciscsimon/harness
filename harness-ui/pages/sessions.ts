// ─── Sessions Page ─────────────────────────────────────────────
// Ported from xtdb-event-logger-ui/pages/sessions.ts
// Changes: data via API fetch, layout() wrapper instead of inline HTML.

import { layout } from "../components/layout.ts";
import { fetchSessionList } from "../lib/api.ts";
import { CATEGORY_COLORS, relativeTime, escapeHtml } from "../lib/format.ts";
import { computeHealthScore, healthColor, healthLabel } from "../lib/health.ts";

const CATEGORIES = ["session", "compaction", "agent", "message", "tool", "input", "model", "resource"];

export async function renderSessions(projectId?: string): Promise<string> {
  const sessions = (await fetchSessionList(projectId)) ?? [];

  const cards = sessions.map((s: any) => {
    const name = s.sessionId.split("/").pop() ?? s.sessionId;
    const duration = fmtDuration(s.lastTs - s.firstTs);
    const catBadges = CATEGORIES
      .filter((c) => s.byCategory?.[c])
      .map((c) => {
        const color = CATEGORY_COLORS[c] ?? "#999";
        return `<span class="ses-cat-badge" style="--cat-color:${color}">
          <span class="cat-dot" style="background:${color}"></span>${c}: ${s.byCategory[c]}
        </span>`;
      }).join("");

    const score = computeHealthScore({
      errorRate: s.errorRate ?? 0,
      turnCount: s.turnCount ?? 0,
      maxPayloadBytes: s.maxPayloadBytes ?? 0,
      durationMs: s.durationMs ?? 0,
    });
    const hColor = healthColor(score);
    const hLabel = healthLabel(score);

    return `<a class="ses-card" href="${projectId ? `/projects/${projectId}/sessions/${encodeURIComponent(s.sessionId)}` : `/sessions/${encodeURIComponent(s.sessionId)}`}">
      <div class="ses-card-top">
        <span class="ses-card-name">${escapeHtml(name)}</span>
        <span class="health-badge health-badge-${hColor}">${score} ${hLabel}</span>
        <span class="ses-card-count">${s.eventCount} events</span>
      </div>
      <div class="ses-card-meta">
        <span>Started: ${relativeTime(String(s.firstTs))}</span>
        <span>Duration: ${duration}</span>
      </div>
      <div class="ses-card-cats">${catBadges}</div>
      <div class="ses-card-last">
        Last: <code>${escapeHtml(s.lastEventName ?? "")}</code> #${s.lastSeq ?? ""}
        <span class="ses-card-ago">${relativeTime(String(s.lastTs))}</span>
      </div>
    </a>`;
  }).join("\n");

  const content = `
    <div class="page-header">
      <h1>📂 Sessions</h1>
      <span class="total-badge">${sessions.length} session${sessions.length !== 1 ? "s" : ""}</span>
    </div>
    <main class="ses-list">
      ${sessions.length === 0 ? '<p class="empty-msg">No sessions found.</p>' : cards}
    </main>
  `;

  return layout(content, { title: "Sessions", activePath: projectId ? `/projects/${projectId}/sessions` : "/sessions", projectId, activeSection: "sessions" });
}

// ─── Helpers ───────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  if (ms < 0) ms = 0;
  if (ms < 1000) return "<1s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}
