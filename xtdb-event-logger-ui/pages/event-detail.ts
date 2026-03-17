import type { EventRow } from "../lib/db.ts";
import { CATEGORY_COLORS, relativeTime, getPopulatedFields } from "../lib/format.ts";

// ─── Content keys — large JSON blobs that get expandable <pre> blocks ──

const CONTENT_KEYS = new Set([
  "message_content", "stream_delta",
  "tool_input", "tool_content", "tool_details",
  "tool_partial_result", "tool_args",
  "agent_messages", "system_prompt", "images",
  "context_messages", "provider_payload",
  "turn_message", "turn_tool_results",
  "compact_branch_entries",
  "jsonld", "payload",
]);

function isContentField(key: string): boolean {
  return CONTENT_KEYS.has(key);
}

// ─── Pretty-print JSON or return raw ───────────────────────────────

function prettyPrint(val: string): string {
  try {
    const parsed = JSON.parse(val);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return val;
  }
}

// ─── Event Detail Page HTML ────────────────────────────────────────

export function renderEventDetail(row: EventRow): string {
  const color = CATEGORY_COLORS[row.category] ?? "#999";
  const fields = getPopulatedFields(row);

  const coreRows = [
    ["id", row._id],
    ["environment", row.environment],
    ["event_name", row.event_name],
    ["category", row.category],
    ["can_intercept", String(row.can_intercept)],
    ["schema_version", row.schema_version],
    ["timestamp", `${row.ts} (${relativeTime(row.ts)})`],
    ["seq", row.seq],
    ["session_id", row.session_id ?? "—"],
    ["cwd", row.cwd ?? "—"],
  ];

  // Split fields into scalar (table rows) and content (expandable blocks)
  const scalarEntries: [string, string][] = [];
  const contentEntries: [string, string][] = [];

  for (const [k, v] of Object.entries(fields)) {
    const val = String(v);
    if (isContentField(k) && val.length > 120) {
      contentEntries.push([k, val]);
    } else {
      scalarEntries.push([k, val]);
    }
  }

  const scalarRows = scalarEntries.map(([k, v]) =>
    `<tr><td class="field-key">${esc(k)}</td><td class="field-val">${esc(v)}</td></tr>`
  ).join("\n        ");

  const contentBlocks = contentEntries.map(([k, v], i) => {
    const pretty = prettyPrint(v);
    const sizeKb = (v.length / 1024).toFixed(1);
    return `
    <div class="content-block" id="cb-${i}">
      <div class="content-block-header" onclick="toggleBlock(${i})">
        <span class="content-block-toggle" id="cbt-${i}">▶</span>
        <span class="content-block-key">${esc(k)}</span>
        <span class="content-block-size">${sizeKb} KB</span>
        <button class="btn btn-sm" onclick="event.stopPropagation(); copyBlock(${i})">Copy</button>
      </div>
      <pre class="content-block-body collapsed" id="cbb-${i}">${esc(pretty)}</pre>
    </div>`;
  }).join("\n");

  // JSON-LD block (separate from fields, always at bottom)
  const jsonld = row.jsonld ?? "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(row.event_name)} #${row.seq} — XTDB Event</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <header>
    <div class="header-top">
      <h1>
        <a href="/" class="back-link">← Stream</a>
        ${row.session_id ? `<span class="header-sep">·</span> <a href="/sessions/${encodeURIComponent(row.session_id)}" class="back-link">📂 Session</a>` : ""}
      </h1>
    </div>
  </header>

  <main class="detail-page">
    <div class="detail-header" style="--cat-color:${color}">
      <span class="cat-dot" style="background:${color}"></span>
      <span class="detail-name">${esc(row.event_name)}</span>
      <span class="cat-badge" style="background:${color}">${esc(row.category)}</span>
      <span class="detail-seq">#${row.seq}</span>
      <span class="detail-time">${relativeTime(row.ts)}</span>
    </div>

    <section class="detail-section">
      <h2>Core</h2>
      <table class="detail-table">
        ${coreRows.map(([k, v]) => `<tr><td class="field-key">${esc(k!)}</td><td class="field-val">${esc(v ?? "—")}</td></tr>`).join("\n        ")}
      </table>
    </section>

    ${scalarRows ? `
    <section class="detail-section">
      <h2>Fields</h2>
      <table class="detail-table">
        ${scalarRows}
      </table>
    </section>` : ""}

    ${contentBlocks ? `
    <section class="detail-section">
      <h2>Content <button class="btn btn-sm" onclick="expandAll()">Expand All</button></h2>
      ${contentBlocks}
    </section>` : ""}

    ${jsonld ? `
    <section class="detail-section">
      <h2>JSON-LD <button class="btn btn-sm" onclick="copyJsonLd()">Copy</button></h2>
      <pre class="jsonld-block" id="jsonld-content">${esc(jsonld)}</pre>
    </section>` : ""}
  </main>

  <script>
    function toggleBlock(i) {
      var body = document.getElementById("cbb-" + i);
      var toggle = document.getElementById("cbt-" + i);
      body.classList.toggle("collapsed");
      toggle.textContent = body.classList.contains("collapsed") ? "▶" : "▼";
    }
    function expandAll() {
      document.querySelectorAll(".content-block-body").forEach(function(el) {
        el.classList.remove("collapsed");
      });
      document.querySelectorAll(".content-block-toggle").forEach(function(el) {
        el.textContent = "▼";
      });
    }
    function copyBlock(i) {
      var text = document.getElementById("cbb-" + i).textContent;
      navigator.clipboard.writeText(text).then(function() {
        var btns = document.querySelectorAll("#cb-" + i + " .btn");
        if (btns.length) { btns[0].textContent = "Copied!"; setTimeout(function() { btns[0].textContent = "Copy"; }, 1500); }
      });
    }
    function copyJsonLd() {
      var text = document.getElementById("jsonld-content").textContent;
      navigator.clipboard.writeText(text).then(function() {
        var btn = event.target;
        btn.textContent = "Copied!";
        setTimeout(function() { btn.textContent = "Copy"; }, 1500);
      });
    }
  </script>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
