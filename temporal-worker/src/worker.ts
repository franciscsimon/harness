/**
 * Temporal Worker entry point.
 *
 * Registers activities and workflow bundles, connects to Temporal Server,
 * and starts polling task queues. Runs as a standalone Node.js process
 * (NOT inside pi).
 */
import "./instrumentation.js"; // OTEL SDK — must be first import
import { NativeConnection, Worker } from "@temporalio/worker";
import {
  OpenTelemetryActivityInboundInterceptor,
} from "@temporalio/interceptors-opentelemetry";
import { config } from "./shared/config.js";
import * as activities from "./activities/index.js";

async function main(): Promise<void> {
  console.log(`[temporal-worker] Connecting to ${config.temporal.address}...`);

  const connection = await NativeConnection.connect({
    address: config.temporal.address,
  });

  console.log("[temporal-worker] Connected to Temporal Server");

  // Register a worker for each task queue
  // OTEL interceptors for activity context propagation
  const activityInterceptors = {
    activity: [
      (ctx: Parameters<typeof OpenTelemetryActivityInboundInterceptor>[0]) => ({
        inbound: new OpenTelemetryActivityInboundInterceptor(ctx),
      }),
    ],
  };

  const agentWorker = await Worker.create({
    connection,
    namespace: config.temporal.namespace,
    taskQueue: config.temporal.taskQueues.agentExecution,
    workflowsPath: new URL("./workflows/index.js", import.meta.url).pathname,
    activities,
    interceptors: activityInterceptors,
  });

  const ciWorker = await Worker.create({
    connection,
    namespace: config.temporal.namespace,
    taskQueue: config.temporal.taskQueues.ciPipeline,
    workflowsPath: new URL("./workflows/index.js", import.meta.url).pathname,
    activities,
    interceptors: activityInterceptors,
  });

  console.log("[temporal-worker] Workers created, starting poll loops...");
  console.log(`  → agent-execution queue`);
  console.log(`  → ci-pipeline queue`);

  // Run both workers concurrently
  await Promise.all([agentWorker.run(), ciWorker.run()]);
}

main().catch((err) => {
  console.error("[temporal-worker] Fatal error:", err);
  process.exit(1);
});
