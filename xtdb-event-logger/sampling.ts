/**
 * Debounce/sampling logic for high-frequency events:
 * - message_update (fires per token, hundreds per response)
 * - tool_execution_update (fires per streaming chunk)
 *
 * Groups events by a key and allows at most one capture per intervalMs.
 * Accumulates delta lengths between captures so no data is silently lost.
 */

interface SamplerState {
  lastFlush: number; // timestamp of last capture
  accumulated: number; // accumulated delta bytes since last capture
  pending: boolean; // has uncaptured data
  lastEvent: unknown; // last raw event object for accurate flush
}

const samplers = new Map<string, SamplerState>();
let intervalMs = 2000; // default, overridden by config

/**
 * Set the sampling interval. Called once from index.ts after config loads.
 */
export function setSamplingInterval(ms: number): void {
  intervalMs = ms;
}

/**
 * Check whether a high-frequency event should be captured now.
 *
 * @param key   Grouping key (e.g. "msg_update" or "tool_update_<callId>")
 * @param deltaLen  Size of this individual delta (bytes of text, 0 if unknown)
 * @returns  capture=true if enough time has passed; accumulatedLen is the total since last capture
 */
export function shouldCapture(
  key: string,
  deltaLen: number,
  rawEvent?: unknown,
): { capture: boolean; accumulatedLen: number } {
  let s = samplers.get(key);
  if (!s) {
    s = { lastFlush: 0, accumulated: 0, pending: false, lastEvent: null };
    samplers.set(key, s);
  }

  s.accumulated += deltaLen;
  s.pending = true;
  if (rawEvent !== undefined) s.lastEvent = rawEvent;

  const now = Date.now();
  if (now - s.lastFlush >= intervalMs) {
    const total = s.accumulated;
    s.accumulated = 0;
    s.lastFlush = now;
    s.pending = false;
    return { capture: true, accumulatedLen: total };
  }

  return { capture: false, accumulatedLen: 0 };
}

/**
 * Force-flush a sampler and return any remaining accumulated data.
 * Call this when the corresponding "end" event fires (message_end, tool_execution_end)
 * so that accumulated data from the last interval is not lost.
 *
 * @param key  Same key used in shouldCapture()
 */
export function flushSampler(key: string): { capture: boolean; accumulatedLen: number; lastEvent: unknown } {
  const s = samplers.get(key);
  if (s?.pending && s.accumulated > 0) {
    const total = s.accumulated;
    const event = s.lastEvent;
    s.accumulated = 0;
    s.lastFlush = Date.now();
    s.pending = false;
    s.lastEvent = null;
    samplers.delete(key);
    return { capture: true, accumulatedLen: total, lastEvent: event };
  }
  samplers.delete(key);
  return { capture: false, accumulatedLen: 0, lastEvent: null };
}
