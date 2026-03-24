#!/usr/bin/env npx jiti
// ─── Health Prober ───────────────────────────────────────────────
// Polls /api/health on every harness service, stores results in XTDB.
// Runs as a lightweight sidecar or standalone process.
//
// Usage: bun run health-prober/index.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { connectXtdb } from "../lib/db.ts";
import { createLogger } from "../lib/logger.ts";

const log = createLogger("health-prober");
const INTERVAL_MS = Number(process.env.PROBE_INTERVAL_MS ?? "30000");
const CD_JSONLD_PATH = process.env.CD_JSONLD ?? join(import.meta.dirname ?? ".", "../.cd.jsonld");

interface ServiceTarget {
  name: string;
  url: string;
}

interface ProbeResult {
  service: string;
  status: "up" | "down" | "timeout";
  statusCode: number | null;
  latencyMs: number;
  timestamp: number;
  error?: string;
}

function loadTargets(): ServiceTarget[] {
  try {
    const cd = JSON.parse(readFileSync(CD_JSONLD_PATH, "utf-8"));
    const services = cd["code:services"] ?? [];
    return services.map((s: any) => ({
      name: s["schema:name"],
      url: `http://${s["schema:name"]}:${s["code:port"]}${s["code:healthPath"]}`,
    }));
  } catch (e: any) {
    log.warn({ err: e.message }, "Failed to load .cd.jsonld, using defaults");
    return [
      { name: "event-api", url: "http://localhost:3333/api/stats" },
      { name: "ops-api", url: "http://localhost:3335/api/health" },
      { name: "harness-ui", url: "http://localhost:3336/" },
      { name: "ci-runner", url: "http://localhost:3337/api/health" },
      { name: "docker-event-collector", url: "http://localhost:3338/api/health" },
      { name: "build-service", url: "http://localhost:3339/api/health" },
    ];
  }
}

async function probe(target: ServiceTarget): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(target.url, { signal: controller.signal });
    clearTimeout(timeout);
    return {
      service: target.name,
      status: res.ok ? "up" : "down",
      statusCode: res.status,
      latencyMs: Date.now() - start,
      timestamp: Date.now(),
    };
  } catch (e: any) {
    return {
      service: target.name,
      status: e.name === "AbortError" ? "timeout" : "down",
      statusCode: null,
      latencyMs: Date.now() - start,
      timestamp: Date.now(),
      error: e.message,
    };
  }
}

async function storeResults(sql: ReturnType<typeof connectXtdb>, results: ProbeResult[]): Promise<void> {
  for (const r of results) {
    try {
      await sql`
        INSERT INTO service_health_checks (_id, service, status, status_code, latency_ms, error, _valid_from)
        VALUES (
          ${`health-${r.service}-${r.timestamp}`},
          ${r.service},
          ${r.status},
          ${r.statusCode},
          ${r.latencyMs},
          ${r.error ?? null},
          CURRENT_TIMESTAMP
        )`;
    } catch (e: any) {
      log.warn({ service: r.service, err: e.message }, "Failed to store health check");
    }
  }
}

async function main(): Promise<void> {
  const targets = loadTargets();
  log.info({ count: targets.length, intervalMs: INTERVAL_MS }, "Health prober starting");

  let sql: ReturnType<typeof connectXtdb> | null = null;
  try {
    sql = connectXtdb({ max: 2 });
  } catch (e: any) {
    log.warn({ err: e.message }, "XTDB not available, will log results only");
  }

  const tick = async () => {
    const results = await Promise.all(targets.map(probe));
    const up = results.filter((r) => r.status === "up").length;
    const down = results.filter((r) => r.status !== "up");

    log.info({ up, down: down.length, total: results.length }, "Probe cycle complete");
    for (const d of down) {
      log.warn({ service: d.service, status: d.status, error: d.error }, "Service unhealthy");
    }

    if (sql) await storeResults(sql, results);
  };

  await tick();
  setInterval(tick, INTERVAL_MS);
}

main();
