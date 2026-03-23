// ─── Navigation Component ──────────────────────────────────────

export interface NavItem {
  label: string;
  href: string;
}

const MAIN_NAV: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Chat", href: "/chat" },
  { label: "🔐 Auth", href: "/auth" },
];

export function renderNav(activePath: string = "/"): string {
  const links = MAIN_NAV.map((item) => {
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

// ─── Project Sub-Navigation ────────────────────────────────────

export interface ProjectSubNavItem {
  label: string;
  section: string;
}

const PROJECT_SUB_NAV: ProjectSubNavItem[] = [
  { label: "Sessions", section: "sessions" },
  { label: "Stream", section: "stream" },
  { label: "Dashboard", section: "dashboard" },
  { label: "Decisions", section: "decisions" },
  { label: "Artifacts", section: "artifacts" },
  { label: "Errors", section: "errors" },
  { label: "CI", section: "ci" },
  { label: "Builds", section: "builds" },
  { label: "Git", section: "git" },
  { label: "Graph", section: "graph" },
  { label: "Deploys", section: "deploys" },
  { label: "Docker", section: "docker-events" },
  { label: "Ops", section: "ops" },
];

export function renderProjectSubNav(projectId: string, activeSection: string = "overview"): string {
  const links = PROJECT_SUB_NAV.map((item) => {
    const href = `/projects/${encodeURIComponent(projectId)}/${item.section}`;
    const isActive = activeSection === item.section;
    const cls = isActive ? "project-nav-link active" : "project-nav-link";
    return `<a href="${href}" class="${cls}">${item.label}</a>`;
  }).join("");

  return `<div class="project-sub-nav">
  <div class="project-nav-header">
    <span class="project-nav-name">📂 ${projectId}</span>
  </div>
  <div class="project-nav-links">${links}</div>
</div>`;
}
