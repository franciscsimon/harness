/**
 * Activity: Spawn a pi agent in JSON mode with heartbeat.
 *
 * Runs `pi --mode json -p <task>` as a subprocess.
 * Heartbeats stdout progress to Temporal so stuck agents get retried.
 * Handles Temporal cancellation (kills subprocess).
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Context } from "@temporalio/activity";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { config } from "../shared/config.js";
import type { AgentDelegationInput, AgentDelegationResult } from "../shared/types.js";

const tracer = trace.getTracer("harness-agent-spawner");

const AGENTS_DIR = process.env.PI_AGENTS_DIR
  ?? join(process.env.HOME ?? "/root", ".pi", "agent", "agents");

function loadAgentRole(role: string): string {
  try {
    const filePath = join(AGENTS_DIR, `${role}.md`);
    const raw = readFileSync(filePath, "utf-8");
    // Strip YAML frontmatter if present
    return raw.replace(/^---\n[\s\S]*?\n---\n/, "");
  } catch {
    return `You are a ${role} agent. Complete the given task.`;
  }
}

export async function spawnPiAgent(input: AgentDelegationInput): Promise<AgentDelegationResult> {
  return tracer.startActiveSpan(`agent.spawn.${input.agentRole}`, async (span) => {
    const { agentRole, task, cwd } = input;

    span.setAttributes({
      "agent.role": agentRole,
      "agent.task": task.slice(0, 200),
      "agent.cwd": cwd,
      "agent.parent_session": input.parentSessionId,
    });

    const systemPrompt = loadAgentRole(agentRole);

    try {
      const result = await new Promise<AgentDelegationResult>((resolve, reject) => {
        const proc = spawn("pi", [
          "--mode", "json",
          "-p", task,
          "--system-prompt", systemPrompt,
        ], { cwd });

        let stdout = "";
        let sessionId = "";
        let heartbeatCount = 0;

        proc.stdout.on("data", (chunk) => {
          const text = chunk.toString();
          stdout += text;
          heartbeatCount++;

          // Parse JSON-LD events for session ID
          for (const line of text.split("\n")) {
            try {
              const event = JSON.parse(line);
              if (event.type === "session" && event.id) sessionId = event.id;
            } catch { /* not JSON */ }
          }

          // Heartbeat — if this stops for heartbeatTimeout, Temporal retries
          Context.current().heartbeat({
            bytesReceived: stdout.length,
            agentRole,
            heartbeatCount,
            lastLine: text.slice(-200),
          });

          // Periodic span events
          if (heartbeatCount % 10 === 0) {
            span.addEvent("agent.heartbeat", {
              "heartbeat.count": heartbeatCount,
              "output.bytes": stdout.length,
            });
          }
        });

        proc.stderr.on("data", (chunk) => {
          stdout += chunk.toString(); // capture stderr too
        });

        proc.on("close", (code) => {
          const output = stdout.slice(-config.agent.maxOutputBytes);
          resolve({ output, exitCode: code ?? 1, sessionId });
        });

        proc.on("error", (err) => reject(err));

        // Handle Temporal cancellation (workflow abandoned or timed out)
        Context.current().cancelled.catch(() => {
          proc.kill("SIGTERM");
          // Give 5s for graceful shutdown, then SIGKILL
          setTimeout(() => proc.kill("SIGKILL"), 5000);
        });
      });

      span.setAttributes({
        "agent.exit_code": result.exitCode,
        "agent.output_bytes": result.output.length,
        "agent.session_id": result.sessionId,
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
