// ─── Session Detail Page ───────────────────────────────────────
// Ported from xtdb-event-logger-ui/pages/session-detail.ts
// Changes: data via API fetch, layout() wrapper.
// Note: Sparkline and context-health logic preserved.

import { layout } from "../components/layout.ts";
import { fetchSessionEvents } from "../lib/api.ts";
import { CATEGORY_COLORS, relativeTime, escapeHtml } from "../lib/format.ts";

// ─── Context Health Thresholds ─────────────────────────────────

const CTX_GREEN_MAX = 50_000;
const CTX_YELLOW_MAX = 100_000;
const CTX_ROT_THRESHOLD = 100_000;

function ctxHealthColor(bytes: number): string {
  if (bytes < CTX_GREEN_MAX) return "green";
  if (bytes < CTX_YELLOW_MAX) return "yellow";
  return "red";
}

// ─── Context Sparkline (server-rendered SVG) ───────────────────

function renderSparkline(events: any[]): string {
  const points: { seq: number; bytes: number }[] = [];
  const compactSeqs: number[] = [];

  for (const ev of events) {
    if (ev.provider_payload_bytes != null && ev.provider_payload_bytes !== "") {
      points.push({ seq: Number(ev.seq), bytes: Number(ev.provider_payload_bytes) });
    }
    if (ev.event_name === "session_compact") {
      compactSeqs.push(Number(ev.seq));
    }
  }

  if (points.length < 2) return "";

  const W = 600, H = 60, PAD = 4;
  const maxBytes = Math.max(...points.map((p) => p.bytes), 1);
  const minSeq = points[0].seq;
  const maxSeq = points[points.length - 1].seq;
  const seqRange = maxSeq - minSeq || 1;

  const coords = points.map((p) => {
    const x = PAD + ((p.seq - minSeq) / seqRange) * (W - 2 * PAD);
    const y = H - PAD - ((p.bytes / maxBytes) * (H - 2 * PAD));
    return { x, y, bytes: p.bytes };
  });

  const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const fillPath =
    `M${coords[0].x.toFixed(1)},${H} ` +
    coords.map((c) => `L${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ") +
    ` L${coords[coords.length - 1].x.toFixed(1)},${H} Z`;

  const greenY = H - PAD - ((CTX_GREEN_MAX / maxBytes) * (H - 2 * PAD));
  const redY = H - PAD - ((CTX_ROT_THRESHOLD / maxBytes) * (H - 2 * PAD));

  const compactLines = compactSeqs
    .map((s) => {
      const x = PAD + ((s - minSeq) / seqRange) * (W - 2 * PAD);
      return `<line class="ctx-compact-reset" x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${H}" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="4,3" opacity="0.7"/>`;
    }).join("\n    ");

  return `<div class="ctx-sparkline-wrap">
  <svg class="ctx-sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs>
      <linearGradient id="ctx-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f97316" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#f97316" stop-opacity="0.05"/>
      </linearGradient>
    </defs>
    ${maxBytes > CTX_GREEN_MAX ? `<line x1="${PAD}" y1="${greenY.toFixed(1)}" x2="${W - PAD}" y2="${greenY.toFixed(1)}" stroke="#22c55e" stroke-width="1" stroke-dasharray="3,3" opacity="0.4"/>` : ""}
    ${maxBytes > CTX_ROT_THRESHOLD ? `<line x1="${PAD}" y1="${redY.toFixed(1)}" x2="${W - PAD}" y2="${redY.toFixed(1)}" stroke="#ef4444" stroke-width="1" stroke-dasharray="3,3" opacity="0.4"/>` : ""}
    ${compactLines}
    <path d="${fillPath}" fill="url(#ctx-grad)"/>
    <polyline class="ctx-spark-line" points="${polyline}" fill="none" stroke="#f97316" stroke-width="2"/>
    ${coords.map((c) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="2.5" fill="${ctxHealthColor(c.bytes) === "green" ? "#22c55e" : ctxHealthColor(c.bytes) === "yellow" ? "#eab308" : "#ef4444"}"/>`).join("\n    ")}
  </svg>
  <div class="ctx-sparkline-labels">
    <span>0 KB</span>
    <span class="ctx-sparkline-max">${Math.round(maxBytes / 1024)} KB</span>
  </div>
</div>`;
}

// ─── Display Fields ────────────────────────────────────────────

function getDisplayFields(ev: any): Record<string, string> {
  const fields: Record<string, string> = {};
  // Show the most useful field for each event type
  const name = ev.event_name ?? "";
  if (name.startsWith("tool_") && ev.tool_name) fields.tool = String(ev.tool_name);
  if (name === "input" && ev.input_text) fields.input = trunc(String(ev.input_text), 60);
  if (name === "message_start" || name === "message_end") {
    if (ev.message_role) fields.role = String(ev.message_role);
  }
  if (name === "turn_end" && ev.turn_index != null) fields.turn = String(ev.turn_index);
  if (name === "context" && ev.context_msg_count != null) fields.msgs = String(ev.context_msg_count);
  if (name === "before_provider_request" && ev.provider_payload_bytes != null) {
    fields.payload = Math.round(Number(ev.provider_payload_bytes) / 1024) + "KB";
  }
  if (name === "model_select") {
    if (ev.model_provider && ev.model_id) fields.model = `${ev.model_provider}/${ev.model_id}`;
  }
  if (ev.is_error === true || ev.is_error === "true") fields.error = "⚠️";
  return fields;
}

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ─── Render ────────────────────────────────────────────────────

export async function renderSessionDetail(sessionId: string): Promise<string> {
  const events = (await fetchSessionEvents(sessionId)) ?? [];
  const name = sessionId.split("/").pop() ?? sessionId;
  const firstTs = events.length > 0 ? events[0].ts : "0";
  const lastTs = events.length > 0 ? events[events.length - 1].ts : "0";
  const durationMs = Number(lastTs) - Number(firstTs);
  const cwd = events.find((e: any) => e.cwd)?.cwd ?? "—";

  let inRotZone = false;
  let prevInRotZone = false;

  const rows = events.map((ev: any) => {
    const color = CATEGORY_COLORS[ev.category] ?? "#999";
    const fields = getDisplayFields(ev);
    const fieldHtml = Object.entries(fields)
      .map(([k, v]) => `<span class="field-pair"><span class="field-k">${escapeHtml(k)}:</span> ${escapeHtml(v)}</span>`)
      .join(" ");

    const ctxBytes = ev.provider_payload_bytes != null && ev.provider_payload_bytes !== "" ? Number(ev.provider_payload_bytes) : null;
    let ctxAttrs = "";
    let ctxClasses = "";
    let ctxBadgeHtml = "";

    if (ctxBytes != null) {
      ctxAttrs += ` data-ctx-bytes="${ctxBytes}"`;
      const health = ctxHealthColor(ctxBytes);
      ctxClasses += ` ctx-health-${health}`;
      if (ctxBytes >= CTX_ROT_THRESHOLD) inRotZone = true;
      const kbStr = Math.round(ctxBytes / 1024);
      ctxBadgeHtml = `<span class="ctx-badge ctx-badge-${health}" title="Context: ${kbStr}KB payload">${kbStr}KB</span>`;
    }

    let rotBannerHtml = "";
    if (inRotZone) {
      ctxClasses += " ctx-rot-zone";
      if (ctxBytes != null && ctxBytes >= CTX_ROT_THRESHOLD && !prevInRotZone) {
        rotBannerHtml = `<div class="ctx-rot-banner">⚠️ Context rot zone — consider compacting or starting fresh</div>`;
      }
    }
    const prevFlag = inRotZone;
    if (ev.event_name === "session_compact") inRotZone = false;
    prevInRotZone = prevFlag;

    return `${rotBannerHtml}<div class="tl-event${ctxClasses}"
      data-event-name="${escapeHtml(ev.event_name)}"
      data-category="${escapeHtml(ev.category)}"
      data-seq="${ev.seq}"
      data-id="${escapeHtml(ev._id)}"
      data-ts="${ev.ts}"
      data-turn-index="${ev.turn_index ?? ""}"${ctxAttrs}
      style="--cat-color:${color}">
      <span class="tl-seq">#${ev.seq}</span>
      <span class="cat-dot" style="background:${color}"></span>
      <span class="tl-name">${escapeHtml(ev.event_name)}</span>
      <span class="cat-badge" style="background:${color}">${escapeHtml(ev.category)}</span>
      ${ctxBadgeHtml}
      <span class="tl-fields">${fieldHtml}</span>
      <a class="tl-detail-link" href="/event/${encodeURIComponent(ev._id)}">detail →</a>
      <span class="tl-time">${relativeTime(ev.ts)}</span>
    </div>`;
  }).join("\n    ");

  const sparkline = renderSparkline(events);

  const content = `
    <div class="page-header">
      <h1>
        <a href="/sessions" class="back-link">← Sessions</a>
        <span class="header-sep">·</span>
        📂 ${escapeHtml(name)}
      </h1>
      <span class="total-badge">${events.length} events</span>
    </div>
    <div class="ses-detail-meta">
      <span>Started: ${relativeTime(firstTs)}</span>
      <span>Duration: ${fmtDuration(durationMs)}</span>
      <span>cwd: <code>${escapeHtml(cwd)}</code></span>
    </div>
    ${sparkline}
    <main class="timeline" id="timeline">
      ${rows}
    </main>
  `;

  return layout(content, {
    title: name,
    activePath: "/sessions",
    extraHead: `<script src="/static/session.js" defer></script>`,
  });
}

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
