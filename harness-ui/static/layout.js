// ─── Shared Layout & Navigation ──────────────────────────────
// Injects nav bar into any page that includes this script.

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/monitoring/health", label: "Health" },
  { href: "/monitoring/errors", label: "Errors" },
  { href: "/monitoring/metrics", label: "Metrics" },
  { href: "/security/scans", label: "Scans" },
  { href: "/security/leaks", label: "Leaks" },
  { href: "/security/audit", label: "Audit" },
  { href: "/quality/complexity", label: "Complexity" },
  { href: "/quality/reviews", label: "Reviews" },
  { href: "/tickets", label: "Tickets" },
  { href: "/tickets/list", label: "Ticket List" },
  { href: "/tickets/burndown", label: "Burndown" },
  { href: "/graph/explore", label: "Graph" },
  { href: "/graph/timeline", label: "Timeline" },
];

function injectNav() {
  const nav = document.createElement("nav");
  nav.id = "harness-nav";
  nav.style.cssText = "background:#1a1a2e;padding:8px 16px;display:flex;gap:12px;flex-wrap:wrap;font-family:system-ui;font-size:13px;";
  for (const link of NAV_LINKS) {
    const a = document.createElement("a");
    a.href = link.href;
    a.textContent = link.label;
    a.style.cssText = "color:#8be9fd;text-decoration:none;padding:4px 8px;border-radius:4px;";
    if (window.location.pathname === link.href) a.style.background = "#44475a";
    a.addEventListener("mouseenter", () => (a.style.background = "#44475a"));
    a.addEventListener("mouseleave", () => { if (window.location.pathname !== link.href) a.style.background = ""; });
    nav.appendChild(a);
  }
  document.body.prepend(nav);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectNav);
else injectNav();
