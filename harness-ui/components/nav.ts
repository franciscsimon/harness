// ─── Navigation Component ──────────────────────────────────────

export interface NavItem {
  label: string;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Stream", href: "/stream" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Sessions", href: "/sessions" },
  { label: "Projects", href: "/projects" },
  { label: "Decisions", href: "/decisions" },
  { label: "Artifacts", href: "/artifacts" },
  { label: "Errors", href: "/errors" },
  { label: "Graph", href: "/graph" },
  { label: "CI", href: "/ci" },
  { label: "Chat", href: "/chat" },
  { label: "Ops", href: "/ops" },
];

export function renderNav(activePath: string = "/"): string {
  const links = NAV_ITEMS.map((item) => {
    const isActive = activePath === item.href ||
      (item.href !== "/" && activePath.startsWith(item.href));
    const cls = isActive ? "nav-link active" : "nav-link";
    return `<a href="${item.href}" class="${cls}">${item.label}</a>`;
  }).join("");

  return `<nav class="main-nav">
  <div class="nav-inner">
    <div class="nav-brand">
      <a href="/">⚡ Harness</a>
    </div>
    <div class="nav-links">${links}</div>
  </div>
</nav>`;
}
