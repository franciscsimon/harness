import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ResolvedConfig } from "./types.ts";

// ─── Defaults ──────────────────────────────────────────────────────

function defaults(): ResolvedConfig {
  return {
    enabled: false,
    endpoints: {
      xtdb: {
        enabled: true,
        host: "localhost",
        port: 5433,
      },
      jsonl: {
        enabled: false,
        path: join(homedir(), ".pi", "agent", "event-log.jsonl"),
      },
      console: {
        enabled: false,
      },
    },
    sampling: {
      intervalMs: 2000,
    },
    flush: {
      intervalMs: 500,
      batchSize: 20,
    },
  };
}

// ─── Config File Path ──────────────────────────────────────────────

const CONFIG_FILE = join(homedir(), ".pi", "agent", "xtdb-event-logger.json");

// ─── Loader ────────────────────────────────────────────────────────

/**
 * Load configuration from file, then apply env var overrides.
 * Missing file is fine — defaults are used.
 * Env vars always win over file values.
 */
export function loadConfig(): ResolvedConfig {
  const config = defaults();

  // 1. Read config file (optional)
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    const file = JSON.parse(raw);

    // Merge top-level enabled
    if (typeof file?.enabled === "boolean") config.enabled = file.enabled;

    // Merge endpoints.xtdb
    if (file?.endpoints?.xtdb) {
      if (typeof file.endpoints.xtdb.enabled === "boolean") config.endpoints.xtdb.enabled = file.endpoints.xtdb.enabled;
      if (typeof file.endpoints.xtdb.host === "string") config.endpoints.xtdb.host = file.endpoints.xtdb.host;
      if (typeof file.endpoints.xtdb.port === "number") config.endpoints.xtdb.port = file.endpoints.xtdb.port;
    }

    // Merge endpoints.jsonl
    if (file?.endpoints?.jsonl) {
      if (typeof file.endpoints.jsonl.enabled === "boolean") config.endpoints.jsonl.enabled = file.endpoints.jsonl.enabled;
      if (typeof file.endpoints.jsonl.path === "string") config.endpoints.jsonl.path = file.endpoints.jsonl.path;
    }

    // Merge endpoints.console
    if (file?.endpoints?.console) {
      if (typeof file.endpoints.console.enabled === "boolean") config.endpoints.console.enabled = file.endpoints.console.enabled;
    }

    // Merge sampling
    if (typeof file?.sampling?.intervalMs === "number") config.sampling.intervalMs = file.sampling.intervalMs;

    // Merge flush
    if (typeof file?.flush?.intervalMs === "number") config.flush.intervalMs = file.flush.intervalMs;
    if (typeof file?.flush?.batchSize === "number") config.flush.batchSize = file.flush.batchSize;
  } catch {
    // File missing or invalid — use defaults, no error
  }

  // 2. Env var overrides (highest priority)
  if (process.env.XTDB_EVENT_LOGGING) {
    config.enabled = process.env.XTDB_EVENT_LOGGING === "true";
  }
  if (process.env.XTDB_EVENT_HOST) {
    config.endpoints.xtdb.host = process.env.XTDB_EVENT_HOST;
  }
  if (process.env.XTDB_EVENT_PORT) {
    const port = Number(process.env.XTDB_EVENT_PORT);
    if (!Number.isNaN(port) && port > 0) config.endpoints.xtdb.port = port;
  }
  if (process.env.XTDB_EVENT_XTDB_ENABLED) {
    config.endpoints.xtdb.enabled = process.env.XTDB_EVENT_XTDB_ENABLED === "true";
  }
  if (process.env.XTDB_EVENT_JSONL_PATH) {
    config.endpoints.jsonl.path = process.env.XTDB_EVENT_JSONL_PATH;
    config.endpoints.jsonl.enabled = true; // enabling path implies enabled
  }
  if (process.env.XTDB_EVENT_JSONL_ENABLED) {
    config.endpoints.jsonl.enabled = process.env.XTDB_EVENT_JSONL_ENABLED === "true";
  }
  if (process.env.XTDB_EVENT_CONSOLE_ENABLED) {
    config.endpoints.console.enabled = process.env.XTDB_EVENT_CONSOLE_ENABLED === "true";
  }
  if (process.env.XTDB_EVENT_SAMPLING_MS) {
    const ms = Number(process.env.XTDB_EVENT_SAMPLING_MS);
    if (!Number.isNaN(ms) && ms > 0) config.sampling.intervalMs = ms;
  }
  if (process.env.XTDB_EVENT_FLUSH_MS) {
    const ms = Number(process.env.XTDB_EVENT_FLUSH_MS);
    if (!Number.isNaN(ms) && ms > 0) config.flush.intervalMs = ms;
  }
  if (process.env.XTDB_EVENT_FLUSH_BATCH) {
    const batch = Number(process.env.XTDB_EVENT_FLUSH_BATCH);
    if (!Number.isNaN(batch) && batch > 0) config.flush.batchSize = batch;
  }

  return config;
}
