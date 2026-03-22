// ─── Shared Layout ─────────────────────────────────────────────
// Wraps page content in a full HTML shell with nav, theme, htmx.

import { renderNav, renderProjectSubNav } from "./nav.ts";

export interface LayoutOptions {
  title: string;
  activePath?: string;
  extraHead?: string;
  projectId?: string;
  activeSection?: string;
}

export function layout(content: string, opts: LayoutOptions): string {
  const { title, activePath = "/", extraHead = "", projectId, activeSection } = opts;

  const projectNav = projectId
    ? renderProjectSubNav(projectId, activeSection ?? "overview")
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Harness</title>
  <link rel="stylesheet" href="/static/style.css">
  <script src="/static/htmx.min.js"></script>
  <script src="/static/sse.js"></script>
  ${extraHead}
</head>
<body>
  ${renderNav(activePath)}
  ${projectNav}
  <div class="container${projectId ? " project-container" : ""}">
    ${content}
  </div>
</body>
</html>`;
}
