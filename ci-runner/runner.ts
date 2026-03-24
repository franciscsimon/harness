// ─── Harness CI Runner ───────────────────────────────────────────
// A minimal, harness-native CI runner that:
//   1. Watches a job queue (file-based or XTDB)
//   2. Checks out code at the pushed commit
//   3. Detects language → picks quality tools (via code-quality/registry)
//   4. Runs each step in a Docker container
//   5. Stores results in XTDB as JSON-LD
//
// Triggered by: Soft Serve post-receive hook → writes job file
// Runs as: background process (systemd, docker, or `task ci:runner`)
//
// Usage:
//   bun run ci-runner/runner.ts                  # run the queue watcher
//   bun run ci-runner/runner.ts --once <jobfile> # run a single job

import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolvePipelineJsonLd, resolveSteps } from "./pipeline.ts";
import { type CIRunInput, recordCIRun } from "./recorder.ts";

// ─── Configuration ───────────────────────────────────────────────

const QUEUE_DIR = process.env.CI_QUEUE_DIR ?? join(process.env.HOME ?? "/tmp", ".ci-runner", "queue");
const WORK_DIR = process.env.CI_WORK_DIR ?? join(process.env.HOME ?? "/tmp", ".ci-runner", "work");
const REPOS_DIR = process.env.SOFT_SERVE_DATA_PATH
  ? join(process.env.SOFT_SERVE_DATA_PATH, "repos")
  : (process.env.CI_REPOS_DIR ?? "");
const SOFT_SERVE_SSH = process.env.SOFT_SERVE_SSH ?? "ssh://localhost:23231";
const POLL_INTERVAL_MS = Number(process.env.CI_POLL_MS ?? "2000");
const DOCKER_TIMEOUT = Number(process.env.CI_DOCKER_TIMEOUT ?? "300"); // 5 min default

// ─── Job types ───────────────────────────────────────────────────

export interface CIJob {
  id: string;
  repo: string; // repo name/path in Soft Serve
  ref: string; // refs/heads/main
  commitHash: string; // full SHA
  commitMessage?: string;
  pusher?: string;
  timestamp: number;
}

export interface StepResult {
  name: string;
  image: string;
  commands: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

// ─── Exported state (for HTTP API) ────────────────────────────────

export const runnerState = {
  started: Date.now(),
  jobsProcessed: 0,
  jobsFailed: 0,
  currentJob: null as string | null,
  lastJobAt: 0,
  queueDir: QUEUE_DIR,
};

// ─── Main loop ───────────────────────────────────────────────────

async function main() {
  // Single job mode
  if (process.argv.includes("--once")) {
    const jobFile = process.argv[process.argv.indexOf("--once") + 1];
    if (!jobFile) {
      process.exit(1);
    }
    const job = JSON.parse(readFileSync(jobFile, "utf-8")) as CIJob;
    await runJob(job);
    return;
  }

  // Queue watcher mode
  mkdirSync(QUEUE_DIR, { recursive: true });
  mkdirSync(WORK_DIR, { recursive: true });

  // Process any existing jobs
  await drainQueue();

  // Watch for new jobs
  const interval = setInterval(drainQueue, POLL_INTERVAL_MS);

  // Also use fs.watch for faster response
  try {
    watch(QUEUE_DIR, async (_eventType, filename) => {
      if (filename?.endsWith(".json")) {
        // Small delay to ensure file is fully written
        setTimeout(drainQueue, 100);
      }
    });
  } catch {
    // fs.watch not available on all platforms, polling is the fallback
  }

  // Graceful shutdown
  process.on("SIGTERM", () => {
    clearInterval(interval);
    process.exit(0);
  });
  process.on("SIGINT", () => {
    clearInterval(interval);
    process.exit(0);
  });
}

async function drainQueue() {
  let files: string[];
  try {
    files = readdirSync(QUEUE_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch {
    return;
  }

  for (const file of files) {
    const filePath = join(QUEUE_DIR, file);
    const runningPath = filePath.replace(".json", ".running");
    try {
      if (!existsSync(filePath)) continue; // race: file already picked up
      const job = JSON.parse(readFileSync(filePath, "utf-8")) as CIJob;
      // Move to .running to prevent double-pickup
      writeFileSync(runningPath, JSON.stringify(job, null, 2));
      unlinkSync(filePath);
      runnerState.currentJob = job.id;
      await runJob(job);
      runnerState.jobsProcessed++;
      runnerState.lastJobAt = Date.now();
      runnerState.currentJob = null;
      unlinkSync(runningPath);
    } catch (err) {
      runnerState.jobsFailed++;
      runnerState.currentJob = null;

      // Record the failure to XTDB so it shows in the CI Runs page
      try {
        if (!existsSync(runningPath)) throw new Error("No .running file to read");
        const job = JSON.parse(readFileSync(runningPath, "utf-8")) as CIJob;
        await recordCIRun({
          repo: job.repo,
          ref: job.ref,
          commitHash: job.commitHash,
          commitMessage: job.commitMessage,
          pusher: job.pusher,
          status: "error",
          steps: [
            {
              name: "runner-error",
              status: "failed",
              durationMs: 0,
              exitCode: 1,
              output: String(err),
            },
          ],
          durationMs: 0,
        });
      } catch (_recErr) {}

      // Clean up .running file
      try {
        if (existsSync(runningPath)) unlinkSync(runningPath);
      } catch {}
    }
  }
}

// ─── Job execution ───────────────────────────────────────────────

async function runJob(job: CIJob): Promise<void> {
  const startTime = Date.now();

  // 1. Prepare working directory
  const workDir = join(WORK_DIR, job.id);
  mkdirSync(workDir, { recursive: true });

  try {
    // 2. Check out the code
    checkout(job, workDir);

    // 3. Resolve pipeline steps (from .ci.jsonld or auto-detect)
    const steps = await resolveSteps(workDir);
    const pipelineJsonLd = resolvePipelineJsonLd(workDir, job.repo);

    // 4. Execute each step
    const results: StepResult[] = [];
    let failed = false;

    for (const step of steps) {
      const result = await executeStep(step, workDir, job);
      results.push(result);

      if (result.exitCode !== 0) {
        failed = true;
        break; // Stop on first failure
      } else {
      }
    }

    // 4b. Post-step: review-gate (runs even if pipeline passed, skipped on failure)
    if (!failed) {
      try {
        const reviewResult = await executeStep(
          { name: "review-gate", image: "oven/bun:latest", commands: ["bun install --frozen-lockfile", "npx jiti review-gate/index.ts ."] },
          workDir,
          job,
        );
        results.push(reviewResult);
        if (reviewResult.exitCode !== 0) {
          log.warn({ step: "review-gate", exitCode: reviewResult.exitCode }, "Review gate flagged issues");
        }
      } catch (err) {
        log.warn({ err }, "Review gate post-step failed (non-blocking)");
      }
    }

    // 5. Record results in XTDB (the run AND the pipeline config are both JSON-LD)
    const totalDuration = Date.now() - startTime;
    const runInput: CIRunInput = {
      repo: job.repo,
      ref: job.ref,
      commitHash: job.commitHash,
      commitMessage: job.commitMessage,
      pusher: job.pusher,
      status: failed ? "failed" : "passed",
      steps: results.map((r) => ({
        name: r.name,
        status: r.exitCode === 0 ? "passed" : "failed",
        durationMs: r.durationMs,
        exitCode: r.exitCode,
        output: `${r.stdout}\n${r.stderr}`.trim().slice(-10000),
      })),
      durationMs: totalDuration,
      pipelineJsonLd,
    };

    try {
      const runId = await recordCIRun(runInput);

      // Notify harness-ui via SSE-compatible event (shows in /stream)
      // Notify harness-ui
      try {
        await fetch(`${process.env.HARNESS_UI_URL ?? "http://localhost:3336"}/api/ci/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "ci_run",
            repo: job.repo,
            commitHash: job.commitHash,
            status: failed ? "failed" : "passed",
            stepsTotal: stepResults.length,
            stepsFailed: stepResults.filter((s) => s.exitCode !== 0).length,
            durationMs: totalDuration,
            runId,
          }),
        });
      } catch {
        /* notification is best-effort */
      }

      // Auto-build on success — build service handles image creation + registry push
      if (!failed) {
        const buildUrl = process.env.BUILD_SERVICE_URL ?? "http://build-service:3339";
        try {
          await fetch(`${buildUrl}/api/build`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ repo: job.repo, commit: job.commitHash, trigger: "ci-success" }),
            signal: AbortSignal.timeout(5000),
          });
        } catch (_buildErr) {}
      }
    } catch (_err) {}
  } finally {
    // 6. Cleanup working directory
    try {
      execSync(`rm -rf ${workDir}`, { stdio: "pipe" });
    } catch {}
  }
}

function checkout(job: CIJob, workDir: string): void {
  if (REPOS_DIR) {
    // Soft Serve bare repo — use git --work-tree to checkout
    const bareRepo = join(REPOS_DIR, `${job.repo}.git`);
    if (!existsSync(bareRepo)) {
      // Try without .git suffix
      const altPath = join(REPOS_DIR, job.repo);
      if (!existsSync(altPath)) {
        throw new Error(`Repo not found: ${bareRepo} or ${altPath}`);
      }
      execSync(`git --git-dir="${altPath}" --work-tree="${workDir}" checkout ${job.commitHash} -f -- .`, {
        stdio: "pipe",
      });
      return;
    }
    execSync(`git --git-dir="${bareRepo}" --work-tree="${workDir}" checkout ${job.commitHash} -f -- .`, {
      stdio: "pipe",
    });
  } else {
    // Clone from Soft Serve via SSH
    const cloneUrl = job.repo.includes("://") ? job.repo : `${SOFT_SERVE_SSH}/${job.repo}`;
    execSync(`GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no" git clone --depth=50 "${cloneUrl}" "${workDir}"`, {
      stdio: "pipe",
    });
    execSync(`git -C "${workDir}" checkout ${job.commitHash}`, { stdio: "pipe" });
  }
}

// ─── Docker execution ────────────────────────────────────────────

interface PipelineStep {
  name: string;
  image: string;
  commands: string[];
}

function executeStep(step: PipelineStep, _workDir: string, job: CIJob): Promise<StepResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const script = step.commands.join(" && ");

    // Build docker run command
    const args = [
      "run",
      "--rm",
      `--network=${process.env.DOCKER_NETWORK ?? "harness_default"}`,
      "-v",
      `${process.env.CI_WORK_VOLUME ?? "harness_ci-work"}:/ci-work`,
      "-w",
      `/ci-work/${job.id}`,
      "-e",
      `CI=true`,
      "-e",
      `CI_REPO=${job.repo}`,
      "-e",
      `CI_COMMIT=${job.commitHash}`,
      "-e",
      `CI_REF=${job.ref}`,
      "-e",
      `CI_BRANCH=${job.ref.replace("refs/heads/", "")}`,
      "--stop-timeout",
      String(DOCKER_TIMEOUT),
      step.image,
      "sh",
      "-c",
      script,
    ];

    let stdout = "";
    let stderr = "";

    const proc = spawn("docker", args, { stdio: "pipe" });

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    // Timeout
    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      stderr += `\n[CI RUNNER] Step timed out after ${DOCKER_TIMEOUT}s`;
    }, DOCKER_TIMEOUT * 1000);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        name: step.name,
        image: step.image,
        commands: step.commands,
        exitCode: code ?? 1,
        stdout: stdout.slice(-10000), // Cap at 10KB
        stderr: stderr.slice(-10000),
        durationMs: Date.now() - startTime,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      resolve({
        name: step.name,
        image: step.image,
        commands: step.commands,
        exitCode: 127,
        stdout: "",
        stderr: `Docker execution error: ${err.message}`,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

// ─── Entry point ─────────────────────────────────────────────────

main().catch((_err) => {
  process.exit(1);
});
