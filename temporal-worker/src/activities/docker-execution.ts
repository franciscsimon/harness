/**
 * Activity: Execute a single CI step inside a Docker container.
 * Extracted from ci-runner/runner.ts executeStep().
 */
import { spawn } from "node:child_process";
import { Context } from "@temporalio/activity";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { config } from "../shared/config.js";
import type { CIStepResult } from "../shared/types.js";

const tracer = trace.getTracer("harness-ci-pipeline");

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
  return tracer.startActiveSpan(`ci.step.${input.name}`, async (span) => {
    const {
      name, image, commands, jobId, repo, commitSha, ref,
      timeoutMs = config.ci.stepTimeoutMs,
    } = input;

    span.setAttributes({
      "ci.step.name": name,
      "ci.step.image": image,
      "ci.repo": repo,
      "ci.commit": commitSha,
      "ci.job_id": jobId,
    });

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

    try {
      const result = await new Promise<CIStepResult>((resolve) => {
        let stdout = "";
        let stderr = "";
        const proc = spawn("docker", args, { stdio: "pipe" });

        proc.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
          Context.current().heartbeat({ step: name, bytes: stdout.length });
          if (stdout.length % 5000 < 100) {
            span.addEvent("docker.output", { "output.bytes": stdout.length });
          }
        });

        proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

        const timer = setTimeout(() => {
          proc.kill("SIGTERM");
          stderr += `\n[temporal-worker] Step timed out after ${timeoutSec}s`;
        }, timeoutMs);

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
            name, status: "failed", exitCode: 1,
            output: `Docker error: ${err.message}`,
            durationMs: Date.now() - start,
          });
        });
      });

      span.setAttributes({
        "ci.step.exit_code": result.exitCode,
        "ci.step.duration_ms": result.durationMs,
        "ci.step.output_bytes": result.output.length,
      });

      if (result.exitCode !== 0) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: `Exit code ${result.exitCode}` });
      }

      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
