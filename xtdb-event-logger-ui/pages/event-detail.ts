import type { EventRow } from "../lib/db.ts";
import { CATEGORY_COLORS, relativeTime, getPopulatedFields } from "../lib/format.ts";

// ─── Event Detail Page HTML ────────────────────────────────────────

export function renderEventDetail(row: EventRow): string {
  const color = CATEGORY_COLORS[row.category] ?? "#999";
  const fields = getPopulatedFields(row);
  const jsonld = row.jsonld ?? "";

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

  const fieldRows = Object.entries(fields).map(([k, v]) => {
    const val = typeof v === "string" && v.length > 120 ? v.slice(0, 117) + "..." : String(v);
    return `<tr><td class="field-key">${esc(k)}</td><td class="field-val">${esc(val)}</td></tr>`;
  }).join("\n");

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
      <h1><a href="/" class="back-link">← Stream</a></h1>
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

    ${fieldRows ? `
    <section class="detail-section">
      <h2>Fields</h2>
      <table class="detail-table">
        ${fieldRows}
      </table>
    </section>` : ""}

    ${jsonld ? `
    <section class="detail-section">
      <h2>JSON-LD <button class="btn btn-sm" onclick="copyJsonLd()">Copy</button></h2>
      <pre class="jsonld-block" id="jsonld-content">${esc(jsonld)}</pre>
    </section>` : ""}
  </main>

  <script>
    function copyJsonLd() {
      const text = document.getElementById("jsonld-content").textContent;
      navigator.clipboard.writeText(text).then(() => {
        const btn = event.target;
        btn.textContent = "Copied!";
        setTimeout(() => btn.textContent = "Copy", 1500);
      });
    }
  </script>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
