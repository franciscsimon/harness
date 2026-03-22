// ─── Project-scoped URL helpers ────────────────────────────────
// All internal links should use these to respect project scoping.

export function projectUrl(projectId: string | undefined, section: string, ...rest: string[]): string {
  const suffix = rest.length ? "/" + rest.join("/") : "";
  if (projectId) {
    return `/projects/${encodeURIComponent(projectId)}/${section}${suffix}`;
  }
  return `/${section}${suffix}`;
}

export function sessionsUrl(projectId?: string): string {
  return projectUrl(projectId, "sessions");
}

export function sessionUrl(projectId: string | undefined, sessionId: string): string {
  return projectUrl(projectId, "sessions", encodeURIComponent(sessionId));
}

export function sessionFlowUrl(projectId: string | undefined, sessionId: string): string {
  return projectUrl(projectId, "sessions", encodeURIComponent(sessionId), "flow");
}

export function sessionKnowledgeUrl(projectId: string | undefined, sessionId: string): string {
  return projectUrl(projectId, "sessions", encodeURIComponent(sessionId), "knowledge");
}

export function ciUrl(projectId?: string): string {
  return projectUrl(projectId, "ci");
}

export function ciRunUrl(projectId: string | undefined, runId: string): string {
  return projectUrl(projectId, "ci", encodeURIComponent(runId));
}

export function errorsUrl(projectId?: string, params?: string): string {
  const base = projectUrl(projectId, "errors");
  return params ? `${base}?${params}` : base;
}

export function graphUrl(projectId?: string, params?: string): string {
  const base = projectUrl(projectId, "graph");
  return params ? `${base}?${params}` : base;
}

export function eventUrl(projectId: string | undefined, eventId: string): string {
  return projectUrl(projectId, "events", encodeURIComponent(eventId));
}

export function artifactsUrl(projectId?: string): string {
  return projectUrl(projectId, "artifacts");
}

export function artifactVersionsUrl(projectId: string | undefined, path: string): string {
  return `${projectUrl(projectId, "artifacts", "versions")}?path=${encodeURIComponent(path)}`;
}
