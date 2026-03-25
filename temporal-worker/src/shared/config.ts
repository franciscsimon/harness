/** Environment-based configuration for the Temporal worker. */

export const config = {
  temporal: {
    address: process.env.TEMPORAL_ADDRESS || "temporal:7233",
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
    taskQueues: {
      agentExecution: "agent-execution",
      ciPipeline: "ci-pipeline",
      xtdbPersistence: "xtdb-persistence",
    },
  },
  xtdb: {
    host: process.env.XTDB_HOST || "xtdb-primary",
    port: Number(process.env.XTDB_PORT || "5433"),
    user: process.env.XTDB_USER || "xtdb",
    password: process.env.XTDB_PASSWORD || "",
    database: process.env.XTDB_DATABASE || "xtdb",
  },
  agent: {
    /** Max time an agent activity can run before Temporal cancels it */
    maxDurationMs: Number(process.env.AGENT_MAX_DURATION_MS || String(15 * 60_000)),
    /** If heartbeat stops for this long, Temporal assumes stuck & retries */
    heartbeatTimeoutMs: Number(process.env.AGENT_HEARTBEAT_TIMEOUT_MS || String(90_000)),
    /** Max output bytes to capture from agent stdout */
    maxOutputBytes: Number(process.env.AGENT_MAX_OUTPUT_BYTES || String(10_000)),
    /** Default retry attempts for agent spawning */
    maxRetries: Number(process.env.AGENT_MAX_RETRIES || "3"),
  },
  ci: {
    /** Docker step timeout */
    stepTimeoutMs: Number(process.env.CI_STEP_TIMEOUT_MS || String(5 * 60_000)),
    /** Work directory for CI checkouts */
    workDir: process.env.CI_WORK_DIR || "/work",
  },
  otel: {
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://otel-collector:4317",
    serviceName: process.env.OTEL_SERVICE_NAME || "harness-temporal-worker",
  },
} as const;
