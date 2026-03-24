import { exec } from "./exec.ts";

export interface ComponentHealth {
  name: string;
  status: "healthy" | "unhealthy" | "unknown";
  details: Record<string, unknown>;
  checkedAt: string;
}

const XTDB_PRIMARY_HEALTH = process.env.XTDB_PRIMARY_HEALTH ?? "http://localhost:8083";
const XTDB_REPLICA_HEALTH = process.env.XTDB_REPLICA_HEALTH ?? "http://localhost:8084";
const XTDB_PRIMARY_HOST = process.env.XTDB_EVENT_HOST ?? "localhost";
const XTDB_PRIMARY_PORT = process.env.XTDB_EVENT_PORT ?? "5433";
const XTDB_REPLICA_HOST = process.env.XTDB_REPLICA_HOST ?? XTDB_PRIMARY_HOST;
const XTDB_REPLICA_PORT = process.env.XTDB_REPLICA_PORT ?? "5434";
const DOCKER_NETWORK = process.env.DOCKER_NETWORK ?? "harness_default";

export async function checkPrimary(): Promise<ComponentHealth> {
  const healthz = await fetch(`${XTDB_PRIMARY_HEALTH}/healthz/alive`)
    .then((r) => ({ ok: r.ok, status: r.status }))
    .catch(() => ({ ok: false, status: 0 }));

  const pgwire = await exec(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      DOCKER_NETWORK,
      "postgres:16-alpine",
      "psql",
      "-h",
      XTDB_PRIMARY_HOST,
      "-p",
      XTDB_PRIMARY_PORT,
      "-U",
      "xtdb",
      "-d",
      "xtdb",
      "-Atqc",
      "SELECT 1",
    ],
    { timeout: 10_000 },
  );

  return {
    name: "primary",
    status: healthz.ok && pgwire.exitCode === 0 ? "healthy" : "unhealthy",
    details: {
      healthz: healthz.ok,
      pgwire: pgwire.exitCode === 0,
      port: Number(XTDB_PRIMARY_PORT),
    },
    checkedAt: new Date().toISOString(),
  };
}

export async function checkReplica(): Promise<ComponentHealth> {
  const container = await exec("docker", ["inspect", "--format", "{{.State.Running}}", "xtdb-replica"], {
    timeout: 5_000,
  });
  const running = container.stdout.trim() === "true";

  if (!running) {
    return {
      name: "replica",
      status: "unhealthy",
      details: { running: false, healthz: false, pgwire: false, port: 5434 },
      checkedAt: new Date().toISOString(),
    };
  }

  const healthz = await fetch(`${XTDB_REPLICA_HEALTH}/healthz/alive`)
    .then((r) => ({ ok: r.ok, status: r.status }))
    .catch(() => ({ ok: false, status: 0 }));

  const pgwire = await exec(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      DOCKER_NETWORK,
      "postgres:16-alpine",
      "psql",
      "-h",
      XTDB_REPLICA_HOST,
      "-p",
      XTDB_REPLICA_PORT,
      "-U",
      "xtdb",
      "-d",
      "xtdb",
      "-Atqc",
      "SELECT 1",
    ],
    { timeout: 10_000 },
  );

  return {
    name: "replica",
    status: healthz.ok && pgwire.exitCode === 0 ? "healthy" : "unhealthy",
    details: {
      running: true,
      healthz: healthz.ok,
      pgwire: pgwire.exitCode === 0,
      port: 5434,
    },
    checkedAt: new Date().toISOString(),
  };
}

export async function checkRedpanda(): Promise<ComponentHealth> {
  const result = await exec("docker", ["exec", "redpanda", "rpk", "cluster", "health"], { timeout: 10_000 });
  const healthy = result.stdout.includes("Healthy:") && result.stdout.includes("true");

  return {
    name: "redpanda",
    status: healthy ? "healthy" : "unhealthy",
    details: { healthy, output: result.stdout.trim().split("\n").slice(0, 5) },
    checkedAt: new Date().toISOString(),
  };
}

export async function checkAll(): Promise<{
  overall: "healthy" | "degraded" | "unhealthy";
  components: ComponentHealth[];
}> {
  const [primary, replica, redpanda] = await Promise.all([checkPrimary(), checkReplica(), checkRedpanda()]);
  const components = [redpanda, primary, replica];
  const unhealthyCount = components.filter((c) => c.status !== "healthy").length;
  const overall = unhealthyCount === 0 ? "healthy" : unhealthyCount < 3 ? "degraded" : "unhealthy";
  return { overall, components };
}
