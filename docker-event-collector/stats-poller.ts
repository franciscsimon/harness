// ─── Docker Stats Poller ─────────────────────────────────────
// Polls Docker /containers/json + /stats for CPU, memory, network I/O.
// Runs on a timer alongside the event stream collector.

import * as http from "node:http";

const DOCKER_SOCKET = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";
const POLL_INTERVAL_MS = Number(process.env.STATS_POLL_MS ?? "60000");

export interface ContainerStats {
  containerId: string;
  name: string;
  cpuPercent: number;
  memoryUsageMb: number;
  memoryLimitMb: number;
  memoryPercent: number;
  netRxMb: number;
  netTxMb: number;
  timestamp: number;
}

let latestStats: ContainerStats[] = [];

export function getLatestStats(): ContainerStats[] {
  return latestStats;
}

export function startStatsPoller(): void {
  poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

async function poll(): Promise<void> {
  try {
    const containers = await dockerGet<any[]>("/v1.46/containers/json");
    const results: ContainerStats[] = [];

    for (const c of containers) {
      try {
        const stats = await dockerGet<any>(`/v1.46/containers/${c.Id}/stats?stream=false`);
        results.push(parseStats(c, stats));
      } catch { /* skip unreachable containers */ }
    }

    latestStats = results;
  } catch { /* Docker socket unavailable */ }
}

function parseStats(container: any, stats: any): ContainerStats {
  const cpuDelta = (stats.cpu_stats?.cpu_usage?.total_usage ?? 0) - (stats.precpu_stats?.cpu_usage?.total_usage ?? 0);
  const systemDelta = (stats.cpu_stats?.system_cpu_usage ?? 0) - (stats.precpu_stats?.system_cpu_usage ?? 0);
  const cpuCount = stats.cpu_stats?.online_cpus ?? 1;
  const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;

  const memUsage = stats.memory_stats?.usage ?? 0;
  const memLimit = stats.memory_stats?.limit ?? 1;
  const memCache = stats.memory_stats?.stats?.cache ?? 0;

  const networks = stats.networks ?? {};
  let rxBytes = 0;
  let txBytes = 0;
  for (const iface of Object.values(networks) as any[]) {
    rxBytes += iface.rx_bytes ?? 0;
    txBytes += iface.tx_bytes ?? 0;
  }

  const name = (container.Names?.[0] ?? container.Id).replace(/^\//, "");

  return {
    containerId: container.Id?.slice(0, 12) ?? "unknown",
    name,
    cpuPercent: Math.round(cpuPercent * 100) / 100,
    memoryUsageMb: Math.round((memUsage - memCache) / 1048576),
    memoryLimitMb: Math.round(memLimit / 1048576),
    memoryPercent: Math.round(((memUsage - memCache) / memLimit) * 10000) / 100,
    netRxMb: Math.round(rxBytes / 1048576),
    netTxMb: Math.round(txBytes / 1048576),
    timestamp: Date.now(),
  };
}

function dockerGet<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: DOCKER_SOCKET, path, method: "GET" }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}
