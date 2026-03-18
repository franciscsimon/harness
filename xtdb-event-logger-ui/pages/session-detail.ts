import type { EventRow } from "../lib/db.ts";
import { CATEGORY_COLORS, relativeTime, getDisplayFields } from "../lib/format.ts";

// ─── Context Health Thresholds ─────────────────────────────────────

const CTX_GREEN_MAX = 50_000;   // < 50KB = green
const CTX_YELLOW_MAX = 100_000; // 50–100KB = yellow, > 100KB = red
const CTX_ROT_THRESHOLD = 100_000;

function ctxHealthColor(bytes: number): string {
  if (bytes < CTX_GREEN_MAX) return "green";
  if (bytes < CTX_YELLOW_MAX) return "yellow";
  return "red";
}

// ─── Context Sparkline (server-rendered SVG) ───────────────────────

function renderSparkline(events: EventRow[]): string {
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

  // Gradient fill under line
  const fillPath =
    `M${coords[0].x.toFixed(1)},${H} ` +
    coords.map((c) => `L${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ") +
    ` L${coords[coords.length - 1].x.toFixed(1)},${H} Z`;

  // Threshold lines
  const greenY = H - PAD - ((CTX_GREEN_MAX / maxBytes) * (H - 2 * PAD));
  const redY = H - PAD - ((CTX_ROT_THRESHOLD / maxBytes) * (H - 2 * PAD));

  // Compaction reset lines
  const compactLines = compactSeqs
    .map((s) => {
      const x = PAD + ((s - minSeq) / seqRange) * (W - 2 * PAD);
      return `<line class="ctx-compact-reset" x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${H}" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="4,3" opacity="0.7"/>`;
    })
    .join("\n    ");

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

// ─── Session Detail Page ───────────────────────────────────────────
// Renders a flat list of event rows with data-attributes.
// Client-side session.js handles the nested grouping + collapse/expand.

export function renderSessionDetail(sessionId: string, events: EventRow[]): string {
  const name = sessionId.split("/").pop() ?? sessionId;
  const firstTs = events.length > 0 ? events[0].ts : "0";
  const lastTs = events.length > 0 ? events[events.length - 1].ts : "0";
  const durationMs = Number(lastTs) - Number(firstTs);
  const cwd = events.find((e) => e.cwd)?.cwd ?? "—";

  // Track if we've entered context rot zone
  let inRotZone = false;
  let prevInRotZone = false;

  // Render each event as a timeline row
  const rows = events.map((ev) => {
    const color = CATEGORY_COLORS[ev.category] ?? "#999";
    const fields = getDisplayFields(ev);
    const fieldHtml = Object.entries(fields)
      .map(([k, v]) => `<span class="field-pair"><span class="field-k">${esc(k)}:</span> ${esc(v)}</span>`)
      .join(" ");

    // Context health data attributes
    const ctxMsgs = ev.context_msg_count != null && ev.context_msg_count !== "" ? Number(ev.context_msg_count) : null;
    const ctxBytes = ev.provider_payload_bytes != null && ev.provider_payload_bytes !== "" ? Number(ev.provider_payload_bytes) : null;

    let ctxAttrs = "";
    let ctxClasses = "";

    let ctxBadgeHtml = "";
    if (ctxMsgs != null) ctxAttrs += ` data-ctx-msgs="${ctxMsgs}"`;
    if (ctxBytes != null) {
      ctxAttrs += ` data-ctx-bytes="${ctxBytes}"`;
      const health = ctxHealthColor(ctxBytes);
      ctxClasses += ` ctx-health-${health}`;
      if (ctxBytes >= CTX_ROT_THRESHOLD) inRotZone = true;

      // Visible context badge with tooltip
      const kbStr = Math.round(ctxBytes / 1024);
      const msgsStr = ctxMsgs != null ? `${ctxMsgs} msgs, ` : "";
      ctxBadgeHtml = `<span class="ctx-badge ctx-badge-${health}" title="Context: ${msgsStr}${kbStr}KB payload">${kbStr}KB</span>`;
    }

    // Mark events in rot zone
    let rotBannerHtml = "";
    if (inRotZone) {
      ctxClasses += " ctx-rot-zone";
      // Show rot zone label on the first event that crosses the threshold
      if (ctxBytes != null && ctxBytes >= CTX_ROT_THRESHOLD && !prevInRotZone) {
        rotBannerHtml = `<div class="ctx-rot-banner">⚠️ Context rot zone — consider compacting or starting fresh</div>`;
      }
    }
    const prevInRotZoneFlag = inRotZone;

    // Compaction resets the rot zone
    if (ev.event_name === "session_compact") inRotZone = false;

    prevInRotZone = prevInRotZoneFlag;

    return `${rotBannerHtml}<div class="tl-event${ctxClasses}"
      data-event-name="${esc(ev.event_name)}"
      data-category="${esc(ev.category)}"
      data-seq="${ev.seq}"
      data-id="${esc(ev._id)}"
      data-tool-name="${esc(ev.tool_name ?? "")}"
      data-tool-call-id="${esc(ev.tool_call_id ?? "")}"
      data-turn-index="${ev.turn_index ?? ""}"
      data-ts="${ev.ts}"${ctxAttrs}
      style="--cat-color:${color}">
      <span class="tl-seq">#${ev.seq}</span>
      <span class="cat-dot" style="background:${color}"></span>
      <span class="tl-name">${esc(ev.event_name)}</span>
      <span class="cat-badge" style="background:${color}">${esc(ev.category)}</span>
      ${ctxBadgeHtml}
      <span class="tl-fields">${fieldHtml}</span>
      <span class="tl-time">${relativeTime(ev.ts)}</span>
      <a class="tl-detail-link" href="/event/${encodeURIComponent(ev._id)}">detail →</a>
    </div>`;
  }).join("\n    ");

  const sparkline = renderSparkline(events);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)} — Session</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <header>
    <div class="header-top">
      <h1>
        <a href="/" class="back-link">← Stream</a>
        <span class="header-sep">·</span>
        <a href="/sessions" class="back-link">Sessions</a>
        <span class="header-sep">·</span>
        <a href="/artifacts" class="back-link">📦 Artifacts</a>
        <span class="header-sep">·</span>
        <a href="http://localhost:3334" class="back-link">💬 Chat</a>
        <span class="header-sep">·</span>
        📂 ${esc(name)}
      </h1>
      <span class="total-badge">${events.length} events</span>
    </div>
    <div class="ses-detail-meta">
      <span>Started: ${relativeTime(firstTs)}</span>
      <span>Duration: ${formatDuration(durationMs)}</span>
      <span>cwd: <code>${esc(cwd)}</code></span>
    </div>
    <div class="ses-detail-actions">
      <button class="btn" id="btn-expand-all">Expand All</button>
      <button class="btn" id="btn-collapse-all">Collapse All</button>
      <a class="btn" href="/sessions/${encodeURIComponent(sessionId)}/flow">🔀 Flow</a>
      <a class="btn" href="/sessions/${encodeURIComponent(sessionId)}/knowledge">📝 Knowledge</a>
    </div>
    ${sparkline}
  </header>

  <main class="timeline" id="timeline">
    ${rows}
  </main>

  <script src="/static/session.js"></script>
</body>
</html>`;
}

// ─── Helpers ───────────────────────────────────────────────────────

function formatDuration(ms: number): string {
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

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
