import { exec } from "./exec.ts";

const HARNESS_DIR = process.env.HARNESS_DIR ?? "/Users/opunix/harness";

export async function stopReplica(): Promise<{
  success: boolean;
  message: string;
}> {
  const result = await exec(
    "docker",
    ["compose", "stop", "xtdb-replica"],
    { cwd: HARNESS_DIR, timeout: 30_000 },
  );
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? "Replica stopped" : result.stderr.trim(),
  };
}

export async function startReplica(): Promise<{
  success: boolean;
  message: string;
}> {
  const result = await exec(
    "docker",
    ["compose", "up", "-d", "xtdb-replica"],
    { cwd: HARNESS_DIR, timeout: 60_000 },
  );
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? "Replica started" : result.stderr.trim(),
  };
}

export async function stopPrimary(): Promise<{
  success: boolean;
  message: string;
}> {
  const result = await exec(
    "docker",
    ["compose", "stop", "xtdb-primary"],
    { cwd: HARNESS_DIR, timeout: 30_000 },
  );
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? "Primary stopped" : result.stderr.trim(),
  };
}

export async function startPrimary(): Promise<{
  success: boolean;
  message: string;
}> {
  const result = await exec(
    "docker",
    ["compose", "up", "-d", "xtdb-primary"],
    { cwd: HARNESS_DIR, timeout: 60_000 },
  );
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? "Primary started" : result.stderr.trim(),
  };
}

export async function replicaStatus(): Promise<{
  running: boolean;
  containerState: string;
}> {
  const result = await exec(
    "docker",
    ["inspect", "--format", "{{.State.Status}}", "xtdb-replica"],
    { timeout: 5_000 },
  );
  const state = result.stdout.trim() || "not found";
  return { running: state === "running", containerState: state };
}
