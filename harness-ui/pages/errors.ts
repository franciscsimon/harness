// ─── Errors Page ───────────────────────────────────────────────
import { layout } from "../components/layout.ts";
import { fetchErrors, fetchErrorSummary } from "../lib/api.ts";
import { relativeTime, escapeHtml, formatDate } from "../lib/format.ts";

const SEVERITY_COLORS: Record<string, string> = { data_loss: "#ef4444", degraded: "#f97316", transient: "#eab308", cosmetic: "#3b82f6" };
const SEVERITY_ICONS: Record<string, string> = { data_loss: "🔴", degraded: "🟠", transient: "🟡", cosmetic: "🔵" };
const SEVERITY_ORDER = ["data_loss", "degraded", "transient", "cosmetic"];

export async function renderErrors(query?: { severity?: string; component?: string }, projectId?: string): Promise<string> {
  const [errors, summary] = await Promise.all([
    // Note: errors don't have project_id yet — show all errors regardless of project
    fetchErrors({ severity: query?.severity, component: query?.component, limit: 200 }),
    fetchErrorSummary(),
  ]);
  const errorList = errors ?? [];
  const sum = summary ?? { total: 0, bySeverity: {}, byComponent: {} };

  const summaryCards = SEVERITY_ORDER.map((sev) => {
    const count = sum.bySeverity[sev] ?? 0;
    const icon = SEVERITY_ICONS[sev] ?? "•";
    const color = SEVERITY_COLORS[sev] ?? "#6b7280";
    const isActive = query?.severity === sev;
    return `<a href="${projectId ? `/projects/${projectId}/errors` : `/errors`}${sev === query?.severity ? "" : "?severity=" + sev}" class="err-summary-card${isActive ? " active" : ""}" style="--sev-color:${color}">
      <span class="err-summary-icon">${icon}</span>
      <span class="err-summary-count">${count}</span>
      <span class="err-summary-label">${sev.replace("_", " ")}</span>
    </a>`;
  }).join("\n");

  const components = Object.keys(sum.byComponent).sort();
  const componentChips = components.map((comp) => {
    const count = sum.byComponent[comp];
    const isActive = query?.component === comp;
    const params = new URLSearchParams();
    if (query?.severity) params.set("severity", query.severity);
    if (!isActive) params.set("component", comp);
    const qs = params.toString();
    return `<a href="${projectId ? `/projects/${projectId}/errors` : `/errors`}${qs ? "?" + qs : ""}" class="err-chip${isActive ? " active" : ""}">${escapeHtml(comp)} <span class="err-chip-count">${count}</span></a>`;
  }).join("\n");

  const rows = errorList.map((e: any) => {
    const icon = SEVERITY_ICONS[e.severity] ?? "•";
    const color = SEVERITY_COLORS[e.severity] ?? "#6b7280";
    const sessionLink = e.session_id ? `<a class="err-session-link" href="/sessions/${encodeURIComponent(e.session_id)}">${escapeHtml(e.session_id.split("/").pop())}</a>` : "";
    const hasStack = e.error_stack && e.error_stack.length > 0;
    const hasInput = e.input_summary && e.input_summary.length > 0;
    const hasContext = e.context_json && e.context_json !== "{}";

    return `<div class="err-card">
      <div class="err-card-top">
        <span class="err-severity-badge" style="--sev-color:${color}">${icon} ${escapeHtml(e.severity)}</span>
        <span class="err-component">${escapeHtml(e.component)}</span>
        <span class="err-type">${escapeHtml(e.error_type)}</span>
        <span class="err-date">${formatDate(e.ts)}</span>
        <span class="err-ago">${relativeTime(e.ts)}</span>
      </div>
      <div class="err-operation">${escapeHtml(e.operation)}</div>
      <div class="err-message">${escapeHtml(e.error_message)}</div>
      <div class="err-meta">${sessionLink}${e.project_id ? `<span class="err-project">${escapeHtml(e.project_id)}</span>` : ""}</div>
      ${hasStack || hasInput || hasContext ? `<details class="err-details"><summary>Details</summary>
        ${hasStack ? `<div class="err-detail-section"><span class="err-detail-label">Stack trace</span><pre class="err-stack">${escapeHtml(e.error_stack)}</pre></div>` : ""}
        ${hasInput ? `<div class="err-detail-section"><span class="err-detail-label">Input</span><pre class="err-input">${escapeHtml(e.input_summary)}</pre></div>` : ""}
        ${hasContext ? `<div class="err-detail-section"><span class="err-detail-label">Context</span><pre class="err-context">${escapeHtml(e.context_json)}</pre></div>` : ""}
      </details>` : ""}
    </div>`;
  }).join("\n");

  const activeFilters: string[] = [];
  if (query?.severity) activeFilters.push(`severity: ${query.severity}`);
  if (query?.component) activeFilters.push(`component: ${query.component}`);
  const filterBanner = activeFilters.length > 0
    ? `<div class="err-active-filters">Filtered by ${activeFilters.join(", ")} · <a href="${projectId ? `/projects/${projectId}/errors` : `/errors`}">Clear filters</a></div>` : "";

  const content = `
    <div class="page-header"><h1>🚨 Errors</h1><span class="total-badge">${sum.total} error${sum.total !== 1 ? "s" : ""}</span></div>
    <div class="err-summary-row">${summaryCards}</div>
    ${components.length > 0 ? `<div class="err-chips-row">${componentChips}</div>` : ""}
    ${filterBanner}
    <main class="err-list">
      ${errorList.length === 0 ? '<p class="empty-msg">No errors captured yet.</p>' : rows}
    </main>
  `;
  return layout(content, { title: "Errors", activePath: projectId ? `/projects/${projectId}/errors` : "/errors", projectId, activeSection: "errors" });
}
