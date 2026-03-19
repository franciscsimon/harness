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

// :3335 Ops API
export const fetchHealth = () => get<any>(`${OPS_API}/api/health`);
export const fetchBackups = () => get<any[]>(`${OPS_API}/api/backups`);
export const fetchIncidents = (q = "") => get<any[]>(`${OPS_API}/api/incidents${q ? "?" + q : ""}`);
export const fetchScheduler = () => get<any>(`${OPS_API}/api/scheduler/status`);
export const fetchReplication = () => get<any>(`${OPS_API}/api/replication`);
export const fetchLifecycleEvents = (n = 20) => get<any[]>(`${OPS_API}/api/lifecycle/events?limit=${n}`);
