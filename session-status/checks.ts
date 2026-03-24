// ─── Infrastructure & Service Health Checks ───────────────────
// Pure check functions — no pi dependencies, easily testable.

import { execSync } from "node:child_process";
import { createConnection } from "node:net";
import { get } from "node:http";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

// ── Types ─────────────────────────────────────────────────────

export type Status = "ok" | "warn" | "fail" | "skip";

export interface CheckResult {
  name: string;
  status: Status;
  detail: string;
}

export interface StatusReport {
  timestamp: string;
  docker: CheckResult;
  infrastructure: CheckResult[];
  appServices: CheckResult[];
  localDev: CheckResult[];
  xtdb: CheckResult[];
  piResources: CheckResult[];
  extensions: CheckResult[];
}

// ── Helpers ───────────────────────────────────────────────────

function exec(cmd: string): string | null {
  try {
    return execSync(cmd, { timeout: 3000, encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

function checkTcp(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port, timeout: timeoutMs });
    sock.on("connect", () => { sock.destroy(); resolve(true); });
    sock.on("timeout", () => { sock.destroy(); resolve(false); });
    sock.on("error", () => { sock.destroy(); resolve(false); });
  });
}

function checkHttp(url: string, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const req = get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}

// ── Docker container check ────────────────────────────────────

function checkContainer(container: string, label: string): CheckResult {
  const state = exec(`docker inspect -f '{{.State.Status}}' ${container} 2>/dev/null`);
  if (!state) return { name: label, status: "fail", detail: "not found" };
  if (state !== "running") return { name: label, status: "fail", detail: state };

  const health = exec(
    `docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' ${container} 2>/dev/null`,
  );

  if (health === "healthy") return { name: label, status: "ok", detail: "healthy" };
  if (health === "none") return { name: label, status: "ok", detail: "running" };
  if (health === "starting") return { name: label, status: "warn", detail: "starting" };
  return { name: label, status: "warn", detail: health ?? "unknown" };
}

// ── Pi resources check ────────────────────────────────────────

function countDir(path: string): number {
  try {
    return readdirSync(path).length;
  } catch {
    return -1;
  }
}

function checkPiDir(subdir: string, label: string): CheckResult {
  const dir = join(homedir(), ".pi", "agent", subdir);
  const count = countDir(dir);
  if (count < 0) return { name: label, status: "fail", detail: "not found" };
  return { name: label, status: "ok", detail: `${count} items` };
}

function checkExtensions(): CheckResult[] {
  const extDir = join(homedir(), ".pi", "agent", "extensions");
  if (!existsSync(extDir)) return [];

  const results: CheckResult[] = [];
  for (const entry of readdirSync(extDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const pkgPath = join(extDir, name, "package.json");
    if (!existsSync(pkgPath)) {
      results.push({ name, status: "warn", detail: "no package.json" });
      continue;
    }
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.pi?.extensions) {
        results.push({ name, status: "ok", detail: "extension" });
      } else {
        results.push({ name, status: "skip", detail: "lib" });
      }
    } catch {
      results.push({ name, status: "warn", detail: "bad package.json" });
    }
  }
  return results;
}

const INFRA_CONTAINERS: [string, string][] = [
  ["caddy", "Caddy"],
  ["redpanda", "Redpanda"],
  ["garage", "Garage"],
  ["xtdb-events", "XTDB Primary"],
  ["xtdb-replica", "XTDB Replica"],
  ["keycloak", "Keycloak"],
  ["qlever", "QLever"],
  ["soft-serve", "Soft Serve"],
  ["zot", "Zot"],
];

const APP_CONTAINERS: [string, string][] = [
  ["event-api", "Event API"],
  ["chat-ws", "Chat WS"],
  ["ops-api", "Ops API"],
  ["harness-ui", "Harness UI"],
  ["ci-runner", "CI Runner"],
  ["docker-event-collector", "Collector"],
  ["build-service", "Build Service"],
];

const LOCAL_ENDPOINTS: [string, string][] = [
  ["http://localhost:3333/api/stats", "Event API"],
  ["http://localhost:3334/", "Chat WS"],
  ["http://localhost:3335/api/health", "Ops API"],
  ["http://localhost:3336/", "Harness UI"],
  ["http://localhost:3337/api/health", "CI Runner"],
];

function checkContainerGroup(defs: [string, string][], dockerOk: boolean): CheckResult[] {
  return dockerOk
    ? defs.map(([c, l]) => checkContainer(c, l))
    : defs.map(([, l]) => ({ name: l, status: "skip" as Status, detail: "docker down" }));
}

async function checkLocalEndpoints(): Promise<CheckResult[]> {
  return Promise.all(
    LOCAL_ENDPOINTS.map(async ([url, label]) => {
      const ok = await checkHttp(url);
      return { name: label, status: ok ? "ok" as Status : "fail" as Status, detail: ok ? "reachable" : "unreachable" };
    }),
  );
}

async function checkXtdbConnectivity(): Promise<CheckResult[]> {
  const [pgPrimary, pgReplica, httpPrimary, httpReplica] = await Promise.all([
    checkTcp("localhost", 5433),
    checkTcp("localhost", 5434),
    checkHttp("http://localhost:8083/healthz/alive"),
    checkHttp("http://localhost:8084/healthz/alive"),
  ]);
  return [
    { name: "Primary pgwire", status: pgPrimary ? "ok" : "fail", detail: pgPrimary ? ":5433" : "unreachable" },
    { name: "Replica pgwire", status: pgReplica ? "ok" : "fail", detail: pgReplica ? ":5434" : "unreachable" },
    { name: "Primary HTTP", status: httpPrimary ? "ok" : "fail", detail: httpPrimary ? ":8083" : "unreachable" },
    { name: "Replica HTTP", status: httpReplica ? "ok" : "fail", detail: httpReplica ? ":8084" : "unreachable" },
  ];
}

function checkPiResources(): CheckResult[] {
  return [
    checkPiDir("extensions", "Extensions"),
    checkPiDir("agents", "Agents"),
    checkPiDir("skills", "Skills"),
    checkPiDir("prompts", "Prompts"),
  ];
}

export async function collectStatus(): Promise<StatusReport> {
  const dockerOk = exec("docker info") !== null;
  const [localDev, xtdb] = await Promise.all([checkLocalEndpoints(), checkXtdbConnectivity()]);

  return {
    timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
    docker: dockerOk
      ? { name: "Docker", status: "ok", detail: "running" }
      : { name: "Docker", status: "fail", detail: "not running" },
    infrastructure: checkContainerGroup(INFRA_CONTAINERS, dockerOk),
    appServices: checkContainerGroup(APP_CONTAINERS, dockerOk),
    localDev,
    xtdb,
    piResources: checkPiResources(),
    extensions: checkExtensions(),
  };
}
