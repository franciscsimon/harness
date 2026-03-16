// ─── Canary Metrics — Pure Computation Functions ───────────────
// These functions take event data and return metric results.
// No DB dependency — testable in isolation.

import type { CanaryThresholds } from "./config.ts";

export interface MetricResult {
  value: number;
  threshold: number;
  alert: boolean;
  message: string;
}

export interface RetryStormResult {
  detected: boolean;
  tool: string;
  consecutiveCount: number;
  message: string;
}

/**
 * Compute tool failure rate from tool_execution_end events.
 */
export function computeToolFailureRate(
  toolEndEvents: { is_error: boolean }[],
  thresholds: CanaryThresholds,
): MetricResult {
  if (toolEndEvents.length === 0) {
    return { value: 0, threshold: thresholds.toolFailureRate, alert: false, message: "" };
  }

  const errors = toolEndEvents.filter((e) => e.is_error).length;
  const rate = errors / toolEndEvents.length;

  return {
    value: rate,
    threshold: thresholds.toolFailureRate,
    alert: rate > thresholds.toolFailureRate,
    message: rate > thresholds.toolFailureRate
      ? `⚠️ Tool failure rate: ${(rate * 100).toFixed(0)}% (${errors}/${toolEndEvents.length}) — agent may be struggling`
      : "",
  };
}

/**
 * Compute turn inflation for a single agent run.
 */
export function computeTurnInflation(
  turnCount: number,
  thresholds: CanaryThresholds,
): MetricResult {
  return {
    value: turnCount,
    threshold: thresholds.maxTurnsPerRun,
    alert: turnCount > thresholds.maxTurnsPerRun,
    message: turnCount > thresholds.maxTurnsPerRun
      ? `⚠️ Agent run took ${turnCount} turns — consider breaking the task down`
      : "",
  };
}

/**
 * Detect context bloat from provider_payload_bytes.
 */
export function computeContextBloat(
  payloadBytes: number,
  thresholds: CanaryThresholds,
): MetricResult {
  const kb = Math.round(payloadBytes / 1024);
  return {
    value: payloadBytes,
    threshold: thresholds.contextBloatBytes,
    alert: payloadBytes > thresholds.contextBloatBytes,
    message: payloadBytes > thresholds.contextBloatBytes
      ? `⚠️ Context is ${kb}KB — consider /compact or fresh session`
      : "",
  };
}

/**
 * Detect retry storm: N+ consecutive calls to the same tool.
 */
export function detectRetryStorm(
  recentToolCalls: { tool_name: string }[],
  thresholds: CanaryThresholds,
): RetryStormResult {
  if (recentToolCalls.length < thresholds.retryStormCount) {
    return { detected: false, tool: "", consecutiveCount: 0, message: "" };
  }

  // Check trailing N calls
  let count = 1;
  const lastTool = recentToolCalls[recentToolCalls.length - 1].tool_name;
  for (let i = recentToolCalls.length - 2; i >= 0; i--) {
    if (recentToolCalls[i].tool_name === lastTool) count++;
    else break;
  }

  const detected = count >= thresholds.retryStormCount;
  return {
    detected,
    tool: lastTool,
    consecutiveCount: count,
    message: detected
      ? `⚠️ Same tool (${lastTool}) called ${count}x — step back and rethink approach`
      : "",
  };
}

/**
 * Compute session duration metric.
 */
export function computeDuration(
  durationMs: number,
  thresholds: CanaryThresholds,
): MetricResult {
  const min = Math.round(durationMs / 60_000);
  return {
    value: durationMs,
    threshold: thresholds.maxDurationMs,
    alert: durationMs > thresholds.maxDurationMs,
    message: durationMs > thresholds.maxDurationMs
      ? `⚠️ Agent running for ${min} min — session may be too long`
      : "",
  };
}

/**
 * Compute tool call density (tools per turn).
 */
export function computeToolDensity(
  toolCountInTurn: number,
  thresholds: CanaryThresholds,
): MetricResult {
  return {
    value: toolCountInTurn,
    threshold: thresholds.maxToolsPerTurn,
    alert: toolCountInTurn > thresholds.maxToolsPerTurn,
    message: toolCountInTurn > thresholds.maxToolsPerTurn
      ? `⚠️ ${toolCountInTurn} tool calls in one turn — distracted agent?`
      : "",
  };
}
