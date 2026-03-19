import { exec } from "./exec.ts";

export interface Topic {
  name: string;
  partitions: number;
  replicas: number;
}

export async function listTopics(): Promise<{
  topics: Topic[];
  raw: string;
}> {
  const result = await exec(
    "docker",
    ["exec", "redpanda", "rpk", "topic", "list"],
    { timeout: 10_000 },
  );
  const raw = result.stdout.trim();
  const lines = raw.split("\n").slice(1); // skip header
  const topics: Topic[] = lines
    .filter((l) => l.trim())
    .map((line) => {
      const parts = line.split(/\s+/);
      return {
        name: parts[0] ?? "",
        partitions: parseInt(parts[1] ?? "0", 10),
        replicas: parseInt(parts[2] ?? "0", 10),
      };
    });
  return { topics, raw };
}

export async function deleteTopic(
  name: string,
): Promise<{ success: boolean; message: string }> {
  const result = await exec(
    "docker",
    ["exec", "redpanda", "rpk", "topic", "delete", name],
    { timeout: 10_000 },
  );
  return {
    success: result.exitCode === 0,
    message: result.stdout.trim() || result.stderr.trim(),
  };
}

export async function describeTopic(
  name: string,
): Promise<{ name: string; raw: string }> {
  const result = await exec(
    "docker",
    ["exec", "redpanda", "rpk", "topic", "describe", name],
    { timeout: 10_000 },
  );
  return { name, raw: result.stdout.trim() };
}
