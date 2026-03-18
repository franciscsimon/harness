export function renderMarkdown(src: string): string {
  const lines = src.split("\n");
  const out: string[] = [];
  let inCode = false;
  let inList = false;

  for (const raw of lines) {
    if (raw.startsWith("```")) {
      if (inList) { out.push("</ul>"); inList = false; }
      if (inCode) { out.push("</code></pre>"); inCode = false; }
      else { out.push(`<pre><code>`); inCode = true; }
      continue;
    }
    if (inCode) { out.push(esc(raw)); continue; }

    const trimmed = raw.trimStart();

    if (trimmed.startsWith("# "))      { closeList(); out.push(`<h1>${inline(trimmed.slice(2))}</h1>`); continue; }
    if (trimmed.startsWith("## "))     { closeList(); out.push(`<h2>${inline(trimmed.slice(3))}</h2>`); continue; }
    if (trimmed.startsWith("### "))    { closeList(); out.push(`<h3>${inline(trimmed.slice(4))}</h3>`); continue; }
    if (trimmed.startsWith("#### "))   { closeList(); out.push(`<h4>${inline(trimmed.slice(5))}</h4>`); continue; }
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(trimmed.slice(2))}</li>`);
      continue;
    }
    if (/^\d+\.\s/.test(trimmed)) {
      if (!inList) { out.push("<ol>"); inList = true; }
      out.push(`<li>${inline(trimmed.replace(/^\d+\.\s/, ""))}</li>`);
      continue;
    }
    if (trimmed === "") { closeList(); out.push(""); continue; }

    closeList();
    out.push(`<p>${inline(trimmed)}</p>`);
  }
  if (inCode) out.push("</code></pre>");
  if (inList) out.push("</ul>");
  return `<div class="artv-md">${out.join("\n")}</div>`;

  function closeList() {
    if (inList) { out.push("</ul>"); inList = false; }
  }
}

function inline(s: string): string {
  let h = esc(s);
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return h;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
