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

// :3333 Event Logger API — all accept optional projectId for scoping
function pq(projectId?: string): string {
  return projectId ? `project_id=${encodeURIComponent(projectId)}` : "";
}
function pqs(projectId?: string, extra?: string): string {
  const parts = [pq(projectId), extra].filter(Boolean);
  return parts.length ? "?" + parts.join("&") : "";
}

export const fetchSessionList = (projectId?: string) => get<any[]>(`${EVENT_API}/api/sessions/list${pqs(projectId)}`);
export const fetchSessionEvents = (id: string) => get<any[]>(`${EVENT_API}/api/sessions/${encodeURIComponent(id)}/events`);
export const fetchStats = (projectId?: string) => get<any>(`${EVENT_API}/api/stats${pqs(projectId)}`);
export const fetchDashboard = (projectId?: string) => get<any>(`${EVENT_API}/api/dashboard${pqs(projectId)}`);
export const fetchDecisions = (limit = 50, projectId?: string) => get<any[]>(`${EVENT_API}/api/decisions${pqs(projectId, `limit=${limit}`)}`);
export const fetchArtifacts = (projectId?: string) => get<any[]>(`${EVENT_API}/api/artifacts${pqs(projectId)}`);
export const fetchEvent = (id: string) => get<any>(`${EVENT_API}/api/events/${encodeURIComponent(id)}`);
export const fetchArtifactVersions = (path: string) => get<any[]>(`${EVENT_API}/api/artifact-versions?path=${encodeURIComponent(path)}`);

// Errors
export const fetchErrors = (opts?: { severity?: string; component?: string; limit?: number; projectId?: string }) => {
  const params = new URLSearchParams();
  if (opts?.projectId) params.set("project_id", opts.projectId);
  if (opts?.severity) params.set("severity", opts.severity);
  if (opts?.component) params.set("component", opts.component);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return get<any[]>(`${EVENT_API}/api/errors${qs ? "?" + qs : ""}`);
};
export const fetchErrorSummary = (projectId?: string) => get<any>(`${EVENT_API}/api/errors/summary${pqs(projectId)}`);

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
    const params = new URLSearchParams({ query: "SELECT * WHERE { ?s ?p ?o } LIMIT 1" });
    const r = await fetch(QLEVER_URL, {
      method: "POST",
      body: params.toString(),
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
  const params = new URLSearchParams({ query });
  const r = await fetch(QLEVER_URL, {
    method: "POST",
    body: params.toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    signal: c.signal,
  });
  clearTimeout(t);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`SPARQL error ${r.status}: ${text.slice(0, 200)}`);
  }
  return r.json();
}

// Docker container health probes
async function probeHttp(url: string, timeout = 3000): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeout);
    const r = await fetch(url, { signal: c.signal });
    clearTimeout(t);
    return r.ok || r.status < 500; // 401/403 means service is up
  } catch { return false; }
}

async function probeTcp(host: string, port: number, timeout = 2000): Promise<boolean> {
  try {
    const { createConnection } = await import("node:net");
    return new Promise((resolve) => {
      const sock = createConnection({ host, port, timeout }, () => { sock.destroy(); resolve(true); });
      sock.on("error", () => resolve(false));
      sock.on("timeout", () => { sock.destroy(); resolve(false); });
    });
  } catch { return false; }
}

export interface ContainerStatus {
  name: string;
  port: string;
  role: string;
  ok: boolean;
}

export async function checkAllContainers(): Promise<ContainerStatus[]> {
  const checks: Array<{ name: string; port: string; role: string; check: Promise<boolean> }> = [
    { name: "Redpanda", port: "9092", role: "Kafka broker", check: probeTcp(process.env.REDPANDA_HOST ?? "localhost", Number(process.env.REDPANDA_PORT ?? "19092")) },
    { name: "Garage S3", port: "3900", role: "Object store", check: probeHttp(`${process.env.GARAGE_URL ?? "http://localhost:3900"}/health`) },
    { name: "XTDB Primary", port: "5432", role: "Database (write)", check: probeHttp(`${process.env.XTDB_PRIMARY_HEALTH ?? "http://localhost:8083"}/healthz/alive`) },
    { name: "XTDB Replica", port: "5432", role: "Database (read)", check: probeHttp(`${process.env.XTDB_REPLICA_HEALTH ?? "http://localhost:8084"}/healthz/alive`) },
    { name: "Keycloak", port: "8180", role: "Auth server", check: probeHttp(`${process.env.KEYCLOAK_URL ?? "http://localhost:8180"}/health/ready`) },
    { name: "QLever", port: "7001", role: "SPARQL endpoint", check: checkQleverHealth() },
    { name: "Soft Serve", port: "23232", role: "Git server", check: probeHttp(process.env.SOFT_SERVE_HTTP ?? "http://localhost:23232") },
    { name: "Zot Registry", port: "5000", role: "OCI registry", check: probeHttp(`${process.env.ZOT_URL ?? "http://localhost:5050"}/v2/`) },
  ];

  const results = await Promise.all(checks.map(async (c) => ({
    name: c.name,
    port: c.port,
    role: c.role,
    ok: await c.check,
  })));

  return results;
}

// :3335 Ops API
export const fetchHealth = () => get<any>(`${OPS_API}/api/health`);
export const fetchBackups = () => get<any[]>(`${OPS_API}/api/backups`);
export const fetchIncidents = (q = "") => get<any[]>(`${OPS_API}/api/incidents${q ? "?" + q : ""}`);
export const fetchScheduler = () => get<any>(`${OPS_API}/api/scheduler/status`);
export const fetchReplication = () => get<any>(`${OPS_API}/api/replication`);
export const fetchLifecycleEvents = (n = 20) => get<any[]>(`${OPS_API}/api/lifecycle/events?limit=${n}`);
