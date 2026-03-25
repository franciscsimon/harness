/**
 * Activity: Execute a single CI step inside a Docker container.
 * Extracted from ci-runner/runner.ts executeStep().
 */
import { spawn } from "node:child_process";
import { Context } from "@temporalio/activity";
import { config } from "../shared/config.js";
import type { CIStepResult } from "../shared/types.js";

export interface DockerStepInput {
  name: string;
  image: string;
  commands: string[];
  jobId: string;
  repo: string;
  commitSha: string;
  ref: string;
  timeoutMs?: number;
}

export async function executeDockerStep(input: DockerStepInput): Promise<CIStepResult> {
  const {
    name, image, commands, jobId, repo, commitSha, ref,
    timeoutMs = config.ci.stepTimeoutMs,
  } = input;
  const timeoutSec = Math.ceil(timeoutMs / 1000);
  const start = Date.now();
  const script = commands.join(" && ");

  const args = [
    "run", "--rm",
    `--network=${process.env.DOCKER_NETWORK ?? "harness_default"}`,
    "-v", `${process.env.CI_WORK_VOLUME ?? "harness_ci-work"}:/ci-work`,
    "-w", `/ci-work/${jobId}`,
    "-e", "CI=true",
    "-e", `CI_REPO=${repo}`,
    "-e", `CI_COMMIT=${commitSha}`,
    "-e", `CI_REF=${ref}`,
    "-e", `CI_BRANCH=${ref.replace("refs/heads/", "")}`,
    "--stop-timeout", String(timeoutSec),
    image, "sh", "-c", script,
  ];

  return new Promise<CIStepResult>((resolve) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn("docker", args, { stdio: "pipe" });

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      // Heartbeat Temporal so it knows the step is alive
      Context.current().heartbeat({ step: name, bytes: stdout.length });
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      stderr += `\n[temporal-worker] Step timed out after ${timeoutSec}s`;
    }, timeoutMs);

    // Handle Temporal cancellation (workflow abandoned)
    Context.current().cancelled.catch(() => {
      proc.kill("SIGTERM");
      clearTimeout(timer);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        name,
        status: code === 0 ? "passed" : "failed",
        exitCode: code ?? 1,
        output: `${stdout}\n${stderr}`.trim().slice(-10_000),
        durationMs: Date.now() - start,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        name,
        status: "failed",
        exitCode: 1,
        output: `Docker error: ${err.message}`,
        durationMs: Date.now() - start,
      });
    });
  });
}
