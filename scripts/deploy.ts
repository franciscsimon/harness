#!/usr/bin/env npx jiti
// ─── Container Deploy Script ─────────────────────────────────────
// Image-based rolling deploy: build → push → deploy → health → rollback
//
// Usage:
//   npx jiti scripts/deploy.ts                  # deploy all services
//   npx jiti scripts/deploy.ts --service ops-api # deploy one service
//   npx jiti scripts/deploy.ts --rollback        # rollback to previous tag
//
// Pipeline: git pull → build images → push to Zot → rolling docker compose up → health check → rollback on failure

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const DEPLOY_HISTORY = join(ROOT, "data", "deploy-history.json");
const HARNESS_UI = process.env.HARNESS_UI_URL ?? "http://localhost:3336";

interface ServiceDef {
  "schema:name": string;
  "oci:image": string;
  "code:dockerfile": string;
  "code:port": number;
  "code:healthPath": string;
}

interface DeployResult {
  name: string;
  success: boolean;
  phase: "build" | "push" | "deploy" | "health";
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

  console.log("🚀 Container deploy started");

  // 1. Git pull
  console.log("\n📥 Step 1: git pull");
  const pull = runSafe("git pull soft-serve main");
  console.log(`   ${pull.ok ? pull.out.split("\n")[0] : "⚠️ " + pull.out.slice(0, 80)}`);

  const commitHash = run("git rev-parse --short HEAD");
  const commitFull = run("git rev-parse HEAD");
  const commitMsg = run("git log -1 --pretty=%s");
  console.log(`   Commit: ${commitHash} — ${commitMsg}`);

  // 2. Load config
  const config = JSON.parse(readFileSync(join(ROOT, ".cd.jsonld"), "utf-8"));
  const registry = config["code:registry"];
  let services: ServiceDef[] = config["code:services"];

  if (singleService) {
    services = services.filter(s => s["schema:name"] === singleService);
    if (services.length === 0) {
      console.error(`❌ Service "${singleService}" not found in .cd.jsonld`);
      process.exit(1);
    }
  }

  // For rollback, find previous tag
  let imageTag = commitHash;
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

  // 3. Build & push (skip for rollback — images already in registry)
  if (!isRollback) {
    console.log(`\n🔨 Step 2: build & push to ${registry}`);
    for (const svc of services) {
      const name = svc["schema:name"];
      const image = svc["oci:image"];
      const dockerfile = svc["code:dockerfile"];
      const fullTag = `${registry}/${image}:${imageTag}`;
      const latestTag = `${registry}/${image}:latest`;
      const t = Date.now();

      // Build
      console.log(`   Building ${name}...`);
      const build = runSafe(`docker build -t ${fullTag} -t ${latestTag} -f ${dockerfile} .`);
      if (!build.ok) {
        console.log(`   ❌ ${name}: build failed`);
        results.push({ name, success: false, phase: "build", durationMs: Date.now() - t, error: build.out });
        continue;
      }

      // Push
      console.log(`   Pushing ${name}...`);
      const push1 = runSafe(`docker push ${fullTag}`);
      const push2 = runSafe(`docker push ${latestTag}`);
      if (!push1.ok) {
        console.log(`   ❌ ${name}: push failed`);
        results.push({ name, success: false, phase: "push", durationMs: Date.now() - t, error: push1.out });
        continue;
      }
      console.log(`   ✅ ${name}: built & pushed (${((Date.now() - t) / 1000).toFixed(1)}s)`);
    }
  }

  // 4. Rolling deploy via docker compose
  console.log("\n🔄 Step 3: rolling deploy");
  for (const svc of services) {
    const name = svc["schema:name"];
    const port = svc["code:port"];
    const healthPath = svc["code:healthPath"];

    // Skip if build/push failed
    if (results.some(r => r.name === name && !r.success)) {
      console.log(`   ⏭️  ${name}: skipped (build/push failed)`);
      continue;
    }

    const t = Date.now();
    console.log(`   Deploying ${name}...`);

    // Pull latest image and recreate container
    const deploy = runSafe(`docker compose up -d --no-deps --pull always ${name}`);
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
      console.log(`   ❌ ${name}: not healthy after 30s — triggering rollback`);
      results.push({ name, success: false, phase: "health", durationMs: dur });

      // Rollback this service to previous image
      const history = loadHistory();
      const prev = history.deploys.find((d: any) => d.status === "success");
      if (prev) {
        console.log(`   ⏪ Rolling back ${name} to ${prev.commitHash}...`);
        runSafe(`docker compose up -d --no-deps ${name}`);
      }
    }
  }

  // 5. Summary
  const totalDuration = Date.now() - startTime;
  const allGood = results.length > 0 && results.every(r => r.success);
  const status = isRollback ? "rollback" : allGood ? "success" : "partial";

  console.log(`\n${allGood ? "✅" : "⚠️"} Deploy ${status}`);
  console.log(`   Commit: ${imageTag}`);
  console.log(`   Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`   Services: ${results.filter(r => r.success).length}/${results.length} healthy`);

  // Save to deploy history
  const entry = {
    timestamp: new Date().toISOString(),
    commitHash: imageTag,
    commitFull,
    commitMessage: commitMsg,
    status,
    services: results,
    durationMs: totalDuration,
  };
  saveHistory(entry);

  // Notify harness-ui
  try {
    await fetch(`${HARNESS_UI}/api/ci/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "deployment", ...entry }),
    });
  } catch { /* best-effort notification */ }

  // Catalog check
  const catalog = runSafe(`curl -s http://localhost:5050/v2/_catalog`);
  if (catalog.ok) console.log(`\n📦 Registry: ${catalog.out}`);

  process.exit(allGood ? 0 : 1);
}

main().catch((e) => {
  console.error("Deploy failed:", e);
  process.exit(1);
});
