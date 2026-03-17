import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { Endpoint, EventMeta, NormalizedEvent } from "./types.ts";
import { loadConfig } from "./config.ts";
import { routeEvent, ALL_EVENT_NAMES } from "./router.ts";
import { eventToTriples } from "./rdf/triples.ts";
import { triplesToJsonLd } from "./rdf/serialize.ts";
import { setSamplingInterval, shouldCapture, flushSampler } from "./sampling.ts";
import { XtdbEndpoint } from "./endpoints/xtdb.ts";
import { JsonlEndpoint } from "./endpoints/jsonl.ts";
import { ConsoleEndpoint } from "./endpoints/console.ts";

// ─── Constants ─────────────────────────────────────────────────────

/** Events that fire with NO ctx (no second argument) */
const NO_CTX = new Set(["session_directory", "resources_discover"]);

/** High-frequency events — sampled, not captured every time */
const SAMPLED = new Set(["message_update", "tool_execution_update"]);

// ─── Entry Point ───────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── State ──
  let seq = 0;
  let ready = false;
  const buffer: Array<{ normalized: NormalizedEvent; jsonld: string }> = [];
  const liveEndpoints: Endpoint[] = [];

  // ── Config ──
  const config = loadConfig();
  setSamplingInterval(config.sampling.intervalMs);

  // ── Build candidate endpoints ──
  const candidates: Endpoint[] = [];
  if (config.endpoints.xtdb.enabled) candidates.push(new XtdbEndpoint());
  if (config.endpoints.jsonl.enabled) candidates.push(new JsonlEndpoint());
  if (config.endpoints.console.enabled) candidates.push(new ConsoleEndpoint());

  // ── Helpers ──

  function metaFromCtx(ctx: any): EventMeta {
    return {
      sessionId: ctx?.sessionManager?.getSessionFile?.() ?? null,
      cwd: ctx?.cwd ?? process.cwd(),
      seq: seq++,
    };
  }

  function metaNoCtx(): EventMeta {
    return {
      sessionId: null,
      cwd: process.cwd(),
      seq: seq++,
    };
  }

  /** Full pipeline: route → triples → JSON-LD → emit to endpoints */
  async function capture(eventName: string, rawEvent: unknown, meta: EventMeta): Promise<void> {
    const normalized = routeEvent(eventName, rawEvent, meta);
    if (!normalized) return;

    // Publish real ID for other extensions (event-projector) running in same process
    (globalThis as any).__piLastEvent = { _id: normalized.id, seq: normalized.seq, eventName, sessionId: normalized.sessionId };

    let jsonld: string;
    try {
      const triples = eventToTriples(normalized);
      jsonld = await triplesToJsonLd(triples);
    } catch (err) {
      // RDF serialization failed — store event with empty JSON-LD rather than losing it
      jsonld = `{"error":"JSON-LD serialization failed: ${String(err)}"}`;
    }

    if (!ready) {
      buffer.push({ normalized, jsonld });
    } else {
      emitToAll(normalized, jsonld);
    }
  }

  function emitToAll(normalized: NormalizedEvent, jsonld: string): void {
    for (const ep of liveEndpoints) {
      try {
        ep.emit(normalized, jsonld);
      } catch {
        // Never crash — endpoint errors are silently swallowed
      }
    }
  }

  // ── Eager init: connect endpoints immediately (handles /reload case) ──
  // When loaded mid-session via /reload, session_start already fired.
  // Init endpoints now so events aren't stuck in the buffer forever.
  (async () => {
    for (const ep of candidates) {
      try {
        await ep.init(config);
        liveEndpoints.push(ep);
      } catch (err) {
        console.error(`[xtdb-logger] ${ep.name} eager init failed: ${err}`);
      }
    }
    if (liveEndpoints.length > 0) {
      ready = true;
      // Flush anything buffered during init
      for (const b of buffer) {
        emitToAll(b.normalized, b.jsonld);
      }
      buffer.length = 0;
    }
  })();

  // ── Register all 30 event handlers ──

  for (const eventName of ALL_EVENT_NAMES) {
    // ── session_start: re-init if needed + UI feedback ──
    if (eventName === "session_start") {
      pi.on("session_start", async (_event, ctx) => {
        // If endpoints already initialized eagerly, skip re-init
        if (liveEndpoints.length === 0) {
          for (const ep of candidates) {
            try {
              await ep.init(config);
              liveEndpoints.push(ep);
            } catch (err) {
              console.error(`[xtdb-logger] ${ep.name} init failed: ${err}`);
            }
          }

          if (liveEndpoints.length === 0) {
            ctx.ui.notify("[xtdb-logger] No endpoints available. Event logging DISABLED.", "error");
            return;
          }

          ready = true;

          // Flush pre-connect buffer
          for (const b of buffer) {
            emitToAll(b.normalized, b.jsonld);
          }
          buffer.length = 0;
        }

        // Capture session_start itself
        capture("session_start", _event, metaFromCtx(ctx));

        // UI feedback
        ctx.ui.setStatus("xtdb-logger", `📊 ${liveEndpoints.map((e) => e.name).join("+")}`);
      });
      continue;
    }

    // ── session_shutdown: capture + flush + close ──
    if (eventName === "session_shutdown") {
      pi.on("session_shutdown", async (_event, ctx) => {
        // Capture the shutdown event
        await capture("session_shutdown", _event, metaFromCtx(ctx));
        // Flush and close all endpoints
        for (const ep of liveEndpoints) {
          try {
            await ep.flush();
          } catch {}
          try {
            await ep.close();
          } catch {}
        }
      });
      continue;
    }

    // ── No-ctx events (session_directory, resources_discover): buffer pre-connect ──
    if (NO_CTX.has(eventName)) {
      pi.on(eventName as any, (event: unknown) => {
        capture(eventName, event, metaNoCtx());
        return undefined; // Never interfere with interceptable events
      });
      continue;
    }

    // ── Sampled high-frequency events ──
    if (SAMPLED.has(eventName)) {
      pi.on(eventName as any, (event: unknown, ctx: any) => {
        const e = event as any;
        const deltaLen =
          eventName === "message_update"
            ? (e?.assistantMessageEvent?.delta?.length ?? 0)
            : 0;
        const key =
          eventName === "message_update"
            ? "msg_update"
            : `tool_update_${e?.toolCallId ?? "?"}`;

        const { capture: shouldWrite } = shouldCapture(key, deltaLen);
        if (shouldWrite) {
          capture(eventName, event, metaFromCtx(ctx));
        }
        return undefined;
      });
      continue;
    }

    // ── message_end: also flush message_update sampler ──
    if (eventName === "message_end") {
      pi.on("message_end", (event: unknown, ctx: any) => {
        // Flush any remaining sampled message_update data
        const flushed = flushSampler("msg_update");
        if (flushed.capture) {
          // Write one final message_update sample with accumulated data
          capture("message_update", event, metaFromCtx(ctx));
        }
        // Capture message_end itself
        capture("message_end", event, metaFromCtx(ctx));
        return undefined;
      });
      continue;
    }

    // ── tool_execution_end: also flush tool_execution_update sampler ──
    if (eventName === "tool_execution_end") {
      pi.on("tool_execution_end", (event: unknown, ctx: any) => {
        const e = event as any;
        const key = `tool_update_${e?.toolCallId ?? "?"}`;
        const flushed = flushSampler(key);
        if (flushed.capture) {
          // Write one final tool_execution_update sample
          capture("tool_execution_update", event, metaFromCtx(ctx));
        }
        // Capture tool_execution_end itself
        capture("tool_execution_end", event, metaFromCtx(ctx));
        return undefined;
      });
      continue;
    }

    // ── All other events: standard capture ──
    pi.on(eventName as any, (event: unknown, ctx: any) => {
      capture(eventName, event, metaFromCtx(ctx));
      return undefined; // Never interfere with interceptable events
    });
  }
}
