// ─── Image Builder ───────────────────────────────────────────────
// Clones source from Soft Serve, reads .cd.jsonld, builds Docker
// images in parallel, pushes to Zot registry.
//
// Each build produces tagged images: <registry>/<ns>/<svc>:<sha>
// and <registry>/<ns>/<svc>:latest
//
// Requires: docker socket mount, git, SSH access to Soft Serve

import { execSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// ─── Configuration ───────────────────────────────────────────────

const WORK_DIR = process.env.BUILD_WORK_DIR ?? "/tmp/build-service/work";
const SOFT_SERVE_SSH = process.env.SOFT_SERVE_SSH ?? "ssh://soft-serve:23231";
const REGISTRY = process.env.REGISTRY ?? "localhost:5050";

// ─── Types ───────────────────────────────────────────────────────

export interface BuildRequest {
  repo: string;
  commit?: string;       // git SHA — if omitted, uses HEAD
  services?: string[];   // subset of services to build — if omitted, builds all
  trigger: "ci-success" | "manual" | "api";
}

export interface ServiceBuildResult {
  name: string;
  image: string;
  tags: string[];
  status: "success" | "failed";
  durationMs: number;
  error?: string;
}

export interface BuildResult {
  id: string;
  repo: string;
  commit: string;
  trigger: string;
  status: "success" | "partial" | "failed";
  services: ServiceBuildResult[];
  durationMs: number;
}

// ─── In-progress tracking ────────────────────────────────────────

let currentBuild: { id: string; repo: string; startedAt: number } | null = null;

export function getCurrentBuild() { return currentBuild; }

// ─── Main build function ─────────────────────────────────────────

export async function runBuild(req: BuildRequest): Promise<BuildResult> {
  const buildId = `build:${randomUUID()}`;
  const startTime = Date.now();
  const workDir = join(WORK_DIR, buildId.replace("build:", ""));

  currentBuild = { id: buildId, repo: req.repo, startedAt: startTime };

  try {
    // 1. Clone source
    mkdirSync(workDir, { recursive: true });
    const cloneUrl = `${SOFT_SERVE_SSH}/${req.repo}`;
    console.log(`[build] Cloning ${cloneUrl} → ${workDir}`);
    execSync(
      `GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no" git clone --depth 1 ${cloneUrl} ${workDir}`,
      { timeout: 60_000, stdio: "pipe" }
    );

    // Checkout specific commit if provided
    if (req.commit) {
      try {
        execSync(`git fetch origin ${req.commit} && git checkout ${req.commit}`, {
          cwd: workDir, timeout: 30_000, stdio: "pipe"
        });
      } catch {
        // shallow clone may not have the commit — log but continue with HEAD
        console.log(`[build] Could not checkout ${req.commit}, using HEAD`);
      }
    }

    // Get actual commit SHA
    const commit = execSync("git rev-parse HEAD", { cwd: workDir, encoding: "utf-8" }).trim();
    console.log(`[build] Commit: ${commit.slice(0, 8)}`);

    // 2. Read .cd.jsonld
    const cdPath = join(workDir, ".cd.jsonld");
    if (!existsSync(cdPath)) {
      return {
        id: buildId, repo: req.repo, commit, trigger: req.trigger,
        status: "failed", services: [], durationMs: Date.now() - startTime,
      };
    }

    const cdConfig = JSON.parse(readFileSync(cdPath, "utf-8"));
    const registry = cdConfig["code:registry"] ?? REGISTRY;
    let serviceDefs: any[] = cdConfig["code:services"] ?? [];

    // Filter to requested services if specified
    if (req.services?.length) {
      serviceDefs = serviceDefs.filter((s: any) =>
        req.services!.includes(s["schema:name"])
      );
    }

    // 3. Build all services in parallel
    console.log(`[build] Building ${serviceDefs.length} services in parallel`);
    const results = await Promise.all(
      serviceDefs.map((svc: any) => buildService(svc, workDir, registry, commit))
    );

    // 4. Determine overall status
    const allSuccess = results.every(r => r.status === "success");
    const allFailed = results.every(r => r.status === "failed");
    const status = allSuccess ? "success" : allFailed ? "failed" : "partial";

    const result: BuildResult = {
      id: buildId, repo: req.repo, commit, trigger: req.trigger,
      status, services: results, durationMs: Date.now() - startTime,
    };

    console.log(`[build] ${status}: ${results.filter(r => r.status === "success").length}/${results.length} services, ${result.durationMs}ms`);
    return result;

  } finally {
    currentBuild = null;
    // Cleanup work dir
    try { rmSync(workDir, { recursive: true, force: true }); } catch { /* intentionally silent — cleanup is best-effort */ }
  }
}

// ─── Build a single service ──────────────────────────────────────

async function buildService(
  svc: any, workDir: string, registry: string, commit: string
): Promise<ServiceBuildResult> {
  const name: string = svc["schema:name"];
  const image: string = svc["oci:image"];
  const dockerfile: string = svc["code:dockerfile"];
  const startTime = Date.now();

  const fullImage = `${registry}/${image}`;
  const shaTag = `${fullImage}:${commit.slice(0, 12)}`;
  const latestTag = `${fullImage}:latest`;

  try {
    // Build
    console.log(`[build] ${name}: docker build -f ${dockerfile}`);
    execSync(
      `docker build --no-cache -f ${dockerfile} -t ${shaTag} -t ${latestTag} .`,
      { cwd: workDir, timeout: 300_000, stdio: "pipe" }
    );

    // Push SHA tag
    console.log(`[build] ${name}: pushing ${shaTag}`);
    execSync(`docker push ${shaTag}`, { timeout: 120_000, stdio: "pipe" });

    // Push latest tag
    console.log(`[build] ${name}: pushing ${latestTag}`);
    execSync(`docker push ${latestTag}`, { timeout: 120_000, stdio: "pipe" });

    return {
      name, image: fullImage, tags: [shaTag, latestTag],
      status: "success", durationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    const msg = err.stderr?.toString().slice(-500) ?? err.message ?? "unknown error";
    console.error(`[build] ${name}: FAILED — ${msg.slice(0, 200)}`);
    return {
      name, image: fullImage, tags: [],
      status: "failed", durationMs: Date.now() - startTime, error: msg,
    };
  }
}
