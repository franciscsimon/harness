const EVENT_API = process.env.EVENT_API_URL ?? "http://localhost:3333";
const OPS_API = process.env.OPS_API_URL ?? "http://localhost:3335";

export const CHAT_WS_URL = process.env.CHAT_WS_URL ?? "ws://localhost:3334/ws";
export const EVENT_API_URL = EVENT_API;
export const OPS_API_URL = OPS_API;

async function get<T>(url: string, timeout = 5000): Promise<T | null> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeout);
    const r = await fetch(url, { signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json() as T;
  } catch { return null; }
}

// :3333 Event Logger API
export const fetchSessionList = () => get<any[]>(`${EVENT_API}/api/sessions/list`);
export const fetchSessionEvents = (id: string) => get<any[]>(`${EVENT_API}/api/sessions/${encodeURIComponent(id)}/events`);
export const fetchStats = () => get<any>(`${EVENT_API}/api/stats`);
export const fetchDashboard = () => get<any>(`${EVENT_API}/api/dashboard`);
export const fetchDecisions = (limit = 50) => get<any[]>(`${EVENT_API}/api/decisions?limit=${limit}`);
export const fetchArtifacts = () => get<any[]>(`${EVENT_API}/api/artifacts`);
export const fetchEvent = (id: string) => get<any>(`${EVENT_API}/api/events/${encodeURIComponent(id)}`);
export const fetchArtifactVersions = (path: string) => get<any[]>(`${EVENT_API}/api/artifact-versions?path=${encodeURIComponent(path)}`);

// Errors
export const fetchErrors = (opts?: { severity?: string; component?: string; limit?: number }) => {
  const params = new URLSearchParams();
  if (opts?.severity) params.set("severity", opts.severity);
  if (opts?.component) params.set("component", opts.component);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return get<any[]>(`${EVENT_API}/api/errors${qs ? "?" + qs : ""}`);
};
export const fetchErrorSummary = () => get<any>(`${EVENT_API}/api/errors/summary`);

// Projects
export const fetchProjects = () => get<any[]>(`${EVENT_API}/api/projects`);
export const fetchProjectDetail = (id: string) => get<any>(`${EVENT_API}/api/projects/${encodeURIComponent(id)}`);

// Projections (for flow page)
export const fetchProjections = (sessionId: string) => get<any[]>(`${EVENT_API}/api/projections/${encodeURIComponent(sessionId)}`);

// Knowledge
export const fetchKnowledge = async (sessionId: string): Promise<string | null> => {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 10000);
    const r = await fetch(`${EVENT_API}/api/sessions/${encodeURIComponent(sessionId)}/knowledge`, { signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
};

// Test runs
export const fetchTestRuns = (projectId?: string) => {
  const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
  return get<any[]>(`${EVENT_API}/api/test-runs${qs}`);
};

// :3334 Chat service
const CHAT_HTTP = process.env.CHAT_HTTP_URL ?? "http://localhost:3334";
export async function checkChatHealth(): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 3000);
    const r = await fetch(CHAT_HTTP, { signal: c.signal });
    clearTimeout(t);
    return r.ok;
  } catch { return false; }
}

// :7001 QLever SPARQL
const QLEVER_URL = process.env.QLEVER_URL ?? "http://localhost:7001";
export const QLEVER_API_URL = QLEVER_URL;

export async function checkQleverHealth(): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 3000);
    const r = await fetch(QLEVER_URL, {
      method: "POST",
      body: "query=SELECT * WHERE { ?s ?p ?o } LIMIT 1",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: c.signal,
    });
    clearTimeout(t);
    return r.ok;
  } catch { return false; }
}

export async function sparqlQuery(query: string): Promise<any> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15000);
  const r = await fetch(QLEVER_URL, {
    method: "POST",
    body: `query=${encodeURIComponent(query)}`,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    signal: c.signal,
  });
  clearTimeout(t);
  if (!r.ok) throw new Error(`SPARQL error: ${r.status}`);
  return r.json();
}

// :3335 Ops API
export const fetchHealth = () => get<any>(`${OPS_API}/api/health`);
export const fetchBackups = () => get<any[]>(`${OPS_API}/api/backups`);
export const fetchIncidents = (q = "") => get<any[]>(`${OPS_API}/api/incidents${q ? "?" + q : ""}`);
export const fetchScheduler = () => get<any>(`${OPS_API}/api/scheduler/status`);
export const fetchReplication = () => get<any>(`${OPS_API}/api/replication`);
export const fetchLifecycleEvents = (n = 20) => get<any[]>(`${OPS_API}/api/lifecycle/events?limit=${n}`);
