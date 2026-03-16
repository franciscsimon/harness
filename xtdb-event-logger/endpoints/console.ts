import type { Endpoint, NormalizedEvent, ResolvedConfig } from "../types.ts";

/**
 * ConsoleEndpoint — debug logging to stderr.
 * Prints a compact one-line summary for each event.
 */
export class ConsoleEndpoint implements Endpoint {
  readonly name = "console";

  async init(config: ResolvedConfig): Promise<void> {
    if (!config.endpoints.console.enabled) {
      throw new Error("Console endpoint disabled");
    }
    console.error("[xtdb-logger][console] Endpoint initialized");
  }

  emit(event: NormalizedEvent, _jsonld: string): void {
    const f = event.fields;
    const detail = f.toolName
      ? ` tool=${f.toolName}`
      : f.messageRole
        ? ` role=${f.messageRole}`
        : f.modelId
          ? ` model=${f.modelId}`
          : f.handlerError
            ? ` ERROR=${f.handlerError}`
            : "";
    console.error(
      `[xtdb-logger][console] #${event.seq} ${event.eventName} [${event.category}]${detail}`,
    );
  }

  async flush(): Promise<void> {
    // nothing to flush — console.error is synchronous
  }

  async close(): Promise<void> {
    console.error("[xtdb-logger][console] Endpoint closed");
  }
}
