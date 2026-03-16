import os from "node:os";
import type { EnvironmentMeta } from "./types.ts";

let cached: EnvironmentMeta | null = null;

/**
 * Collect environment metadata once, cache for the session lifetime.
 * This data enriches every JSON-LD event with machine context.
 */
export function getEnvironmentMeta(): EnvironmentMeta {
  if (!cached) {
    cached = {
      piVersion: "unknown", // TODO: extract from pi if runtime exposes it
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      nodeVersion: process.version,
      hostname: os.hostname(),
      username: os.userInfo().username,
    };
  }
  return cached;
}
