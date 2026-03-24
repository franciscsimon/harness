import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Endpoint, NormalizedEvent, ResolvedConfig } from "../types.ts";

/**
 * JsonlEndpoint — append-only JSONL file.
 * Each line is a JSON object containing the NormalizedEvent + jsonld.
 * No batching needed — appendFileSync is atomic for reasonable sizes.
 */
export class JsonlEndpoint implements Endpoint {
  readonly name = "jsonl";
  private path = "";

  async init(config: ResolvedConfig): Promise<void> {
    if (!config.endpoints.jsonl.enabled) {
      throw new Error("JSONL endpoint disabled");
    }
    this.path = config.endpoints.jsonl.path;
    // Ensure parent directory exists
    mkdirSync(dirname(this.path), { recursive: true });
    // Write a startup marker
    const marker = JSON.stringify({
      _marker: "init",
      ts: Date.now(),
      endpoint: "jsonl",
    });
    appendFileSync(this.path, `${marker}\n`, "utf-8");
  }

  emit(event: NormalizedEvent, jsonld: string): void {
    try {
      const line = JSON.stringify({
        id: event.id,
        eventName: event.eventName,
        category: event.category,
        canIntercept: event.canIntercept,
        schemaVersion: event.schemaVersion,
        ts: event.ts,
        seq: event.seq,
        sessionId: event.sessionId,
        cwd: event.cwd,
        fields: event.fields,
        jsonld,
      });
      appendFileSync(this.path, `${line}\n`, "utf-8");
    } catch {
      // Never crash — silently drop on write failure
    }
  }

  async flush(): Promise<void> {
    // appendFileSync is synchronous — nothing to flush
  }

  async close(): Promise<void> {
    // Write a shutdown marker
    try {
      const marker = JSON.stringify({
        _marker: "close",
        ts: Date.now(),
        endpoint: "jsonl",
      });
      appendFileSync(this.path, `${marker}\n`, "utf-8");
    } catch {
      // ignore
    }
  }
}
