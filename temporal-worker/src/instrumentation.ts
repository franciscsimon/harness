/**
 * OpenTelemetry SDK initialization for the Temporal worker.
 * MUST be imported before any other modules.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { config } from "./shared/config.js";

const resource = new Resource({
  [ATTR_SERVICE_NAME]: config.otel.serviceName,
  "harness.component": "temporal-worker",
});

const traceExporter = new OTLPTraceExporter({
  url: config.otel.endpoint,
});

const metricReader = new PeriodicExportingMetricReader({
  exporter: new OTLPMetricExporter({ url: config.otel.endpoint }),
  exportIntervalMillis: 10_000,
});

export const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader: metricReader as any,
});

sdk.start();
console.log(`[otel] SDK initialized → ${config.otel.endpoint}`);

process.on("SIGTERM", () => {
  sdk.shutdown().catch(console.error);
});
