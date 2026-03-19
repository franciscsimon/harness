import { html } from "hono/html";

export function Layout({ title, children }: { title: string; children: any }) {
  return html`<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Harness</title>
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, system-ui, sans-serif; background: #0d1117; color: #c9d1d9; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 1rem; }
    nav { background: #161b22; border-bottom: 1px solid #30363d; padding: 0.75rem 1rem; }
    nav a { color: #58a6ff; text-decoration: none; margin-right: 1.5rem; }
    nav a:hover { text-decoration: underline; }
    h1, h2, h3 { color: #e6edf3; margin-bottom: 0.5rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #30363d; }
    th { color: #8b949e; font-weight: 600; font-size: 0.85rem; }
    .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 1rem; font-size: 0.75rem; font-weight: 600; }
    .badge-active { background: #238636; color: #fff; }
    .badge-maintenance { background: #d29922; color: #000; }
    .badge-deprecated { background: #da3633; color: #fff; }
    .badge-planning { background: #1f6feb; color: #fff; }
    .badge-decommissioned { background: #484f58; color: #c9d1d9; }
    .badge-open { background: #da3633; color: #fff; }
    .badge-resolved { background: #238636; color: #fff; }
    .badge-succeeded { background: #238636; color: #fff; }
    .badge-failed { background: #da3633; color: #fff; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 1rem; margin-bottom: 1rem; }
    .card a { color: #e6edf3; text-decoration: none; }
    .card a:hover { color: #58a6ff; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
    .stats { display: flex; gap: 2rem; margin: 1rem 0; }
    .stat { text-align: center; }
    .stat-value { font-size: 2rem; font-weight: 700; color: #58a6ff; }
    .stat-label { font-size: 0.8rem; color: #8b949e; }
    #events { max-height: 300px; overflow-y: auto; }
    .event-item { padding: 0.4rem 0; border-bottom: 1px solid #21262d; font-size: 0.85rem; }
    .event-time { color: #8b949e; margin-right: 0.5rem; }
    .section { margin-top: 2rem; }
    .tag { display: inline-block; background: #30363d; color: #c9d1d9; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.75rem; margin-right: 0.3rem; }
  </style>
</head><body>
  <nav><a href="/dashboard">🏠 Portfolio</a><a href="/api/health">Health</a><a href="/api/backups">Backups</a></nav>
  <div class="container">${children}</div>
</body></html>`;
}
