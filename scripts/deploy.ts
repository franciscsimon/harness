#!/usr/bin/env npx jiti
// ─── Container Deploy Script ─────────────────────────────────────
// Deploy-only: pulls images from Zot registry, recreates containers,
// runs health checks, rolls back on failure.
//
// Images are built by build-service (:3339) — this script never builds.
//
// Usage:
//   npx jiti scripts/deploy.ts                  # deploy all services
//   npx jiti scripts/deploy.ts --service ops-api # deploy one service
//   npx jiti scripts/deploy.ts --rollback        # rollback to previous tag

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const DEPLOY_HISTORY = join(ROOT, "data", "deploy-history.json");
const HARNESS_UI = process.env.HARNESS_UI_URL ?? "http://localhost:3336";

interface ServiceDef {
  "schema:name": string;
  "oci:image": string;
  "code:port": number;
  "code:healthPath": string;
}

interface DeployResult {
  name: string;
  success: boolean;
  phase: "deploy" | "health";
  durationMs: number;
  error?: string;
}

// ── Helpers ──

function run(cmd: string, cwd = ROOT): string {
  return execSync(cmd, { cwd, encoding: "utf-8", timeout: 300_000, stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function runSafe(cmd: string, cwd = ROOT): { ok: boolean; out: string } {
  try {
    return { ok: true, out: run(cmd, cwd) };
  } catch (e: any) {
    return { ok: false, out: e.stderr?.toString().slice(0, 200) ?? String(e).slice(0, 200) };
  }
}

async function healthCheck(port: number, path: string, timeoutMs = 30_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`http://localhost:${port}${path}`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return true;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

function loadHistory(): { deploys: any[] } {
  try {
    if (existsSync(DEPLOY_HISTORY)) return JSON.parse(readFileSync(DEPLOY_HISTORY, "utf-8"));
  } catch { /* fresh start */ }
  return { deploys: [] };
}

function saveHistory(entry: any) {
  const h = loadHistory();
  h.deploys.unshift(entry);
  if (h.deploys.length > 50) h.deploys = h.deploys.slice(0, 50);
  try { execSync(`mkdir -p ${join(ROOT, "data")}`, { stdio: "pipe" }); } catch { /* exists */ }
  writeFileSync(DEPLOY_HISTORY, JSON.stringify(h, null, 2));
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const isRollback = args.includes("--rollback");
  const singleService = args.includes("--service") ? args[args.indexOf("--service") + 1] : null;
  const startTime = Date.now();

  console.log("🚀 Deploy started (pull from registry → recreate → health check)");

  const commitHash = run("git rev-parse --short HEAD");
  const commitMsg = run("git log -1 --pretty=%s");
  console.log(`   Current commit: ${commitHash} — ${commitMsg}`);

  // Load config
  const config = JSON.parse(readFileSync(join(ROOT, ".cd.jsonld"), "utf-8"));
  let services: ServiceDef[] = config["code:services"];

  if (singleService) {
    services = services.filter(s => s["schema:name"] === singleService);
    if (services.length === 0) {
      console.error(`❌ Service "${singleService}" not found in .cd.jsonld`);
      process.exit(1);
    }
  }

  // For rollback, find previous successful deploy tag
  let imageTag = "latest";
  if (isRollback) {
    const history = loadHistory();
    const prev = history.deploys.find((d: any) => d.status === "success" && d.commitHash !== commitHash);
    if (!prev) {
      console.error("❌ No previous successful deploy to rollback to");
      process.exit(1);
    }
    imageTag = prev.commitHash;
    console.log(`\n⏪ Rolling back to ${imageTag}`);
  }

  const results: DeployResult[] = [];

  // Rolling deploy: pull + recreate + health check
  console.log(`\n🔄 Deploying ${services.length} services`);
  for (const svc of services) {
    const name = svc["schema:name"];
    const port = svc["code:port"];
    const healthPath = svc["code:healthPath"];
    const t = Date.now();

    console.log(`   ${name}: pulling & recreating...`);

    // Pull latest from registry and recreate
    const deploy = runSafe(
      `docker compose -p harness up -d --no-deps --pull always ${name}`
    );
    if (!deploy.ok) {
      console.log(`   ❌ ${name}: deploy failed — ${deploy.out.slice(0, 80)}`);
      results.push({ name, success: false, phase: "deploy", durationMs: Date.now() - t, error: deploy.out });
      continue;
    }

    // Health check
    const healthy = await healthCheck(port, healthPath);
    const dur = Date.now() - t;
    if (healthy) {
      console.log(`   ✅ ${name}: healthy (${(dur / 1000).toFixed(1)}s)`);
      results.push({ name, success: true, phase: "health", durationMs: dur });
    } else {
      console.log(`   ❌ ${name}: unhealthy after 30s`);
      results.push({ name, success: false, phase: "health", durationMs: dur });

      // Attempt rollback of this service
      const history = loadHistory();
      const prev = history.deploys.find((d: any) => d.status === "success");
      if (prev) {
        console.log(`   ⏪ Rolling back ${name}...`);
        runSafe(`docker compose -p harness up -d --no-deps ${name}`);
      }
    }
  }

  // Summary
  const totalDuration = Date.now() - startTime;
  const allGood = results.length > 0 && results.every(r => r.success);
  const status = isRollback ? "rollback" : allGood ? "success" : "partial";

  console.log(`\n${allGood ? "✅" : "⚠️"} Deploy ${status}`);
  console.log(`   Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  results.forEach(r => {
    console.log(`   ${r.success ? "✅" : "❌"} ${r.name} (${(r.durationMs / 1000).toFixed(1)}s)`);
  });

  // Save history
  saveHistory({
    commitHash,
    commitMessage: commitMsg,
    status,
    services: results,
    durationMs: totalDuration,
    ts: Date.now(),
  });

  // Notify harness-ui
  try {
    await fetch(`${HARNESS_UI}/api/ci/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "deploy",
        status,
        commitHash,
        services: results.length,
        durationMs: totalDuration,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* intentionally silent — notification is best-effort */ }
}

main().catch(err => {
  console.error("❌ Deploy failed:", err);
  process.exit(1);
});
