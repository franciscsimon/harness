import postgres from "postgres";
import { startErrorCollector, stopErrorCollector } from "../../lib/errors.ts";
import type { Endpoint, NormalizedEvent, ResolvedConfig } from "../types.ts";

/**
 * XtdbEndpoint — persists events into XTDB v2 via Postgres wire protocol.
 *
 * - Uses typed params (OID 25=text, 16=bool, 20=int8) as required by XTDB
 * - Async write queue with configurable flush interval + batch size
 * - Stores flat columns AND full JSON-LD string
 * - Never throws from emit() — errors are logged and events dropped
 */
export class XtdbEndpoint implements Endpoint {
  readonly name = "xtdb";

  private sql: ReturnType<typeof postgres> | null = null;
  private queue: Array<{ event: NormalizedEvent; jsonld: string }> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushIntervalMs = 500;
  private batchSize = 20;
  private closing = false;

  async init(config: ResolvedConfig): Promise<void> {
    if (!config.endpoints.xtdb.enabled) {
      throw new Error("XTDB endpoint disabled");
    }

    this.flushIntervalMs = config.flush.intervalMs;
    this.batchSize = config.flush.batchSize;

    const { host, port } = config.endpoints.xtdb;
    this.sql = postgres({
      host,
      port,
      database: "xtdb",
      user: process.env.XTDB_USER ?? "xtdb",
      password: process.env.XTDB_PASSWORD ?? "xtdb",
      max: 2,
      idle_timeout: 30,
      connect_timeout: 10,
    });

    // Verify connectivity
    const rows = await this.sql`SELECT 1 AS ok`;
    if (!rows?.[0]?.ok) {
      throw new Error(`XTDB health check failed on ${host}:${port}`);
    }

    // Start flushing captured errors to XTDB (disk → DB)
    startErrorCollector(this.sql);
  }

  emit(event: NormalizedEvent, jsonld: string): void {
    if (this.closing || !this.sql) return;
    this.queue.push({ event, jsonld });
    if (this.queue.length >= this.batchSize) {
      this.flushNow();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flushNow(), this.flushIntervalMs);
    }
  }

  async flush(): Promise<void> {
    await this.flushNow();
  }

  async close(): Promise<void> {
    this.closing = true;
    // Final flush of captured errors before closing DB connection
    await stopErrorCollector();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flushNow();
    if (this.sql) {
      await this.sql.end();
      this.sql = null;
    }
  }

  // ── Internal ───────────────────────────────────────────────────

  private async flushNow(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.queue.length === 0 || !this.sql) return;

    const batch = this.queue.splice(0, this.batchSize);
    for (const { event, jsonld } of batch) {
      try {
        await this.insertRow(event, jsonld);
      } catch (_err) {}
    }

    // If more items queued during flush, schedule another
    if (this.queue.length > 0 && !this.closing) {
      this.flushTimer = setTimeout(() => this.flushNow(), this.flushIntervalMs);
    }
  }

  /** Hard row-size budget: XTDB Kafka producer has 1MB max.request.size */
  private static readonly MAX_ROW_BYTES = 900_000; // leave headroom for protocol overhead

  /** Truncate a string to maxBytes */
  private static truncate(v: string, max: number): string {
    if (v.length <= max) return v;
    return `${v.slice(0, max)}…[truncated ${v.length}→${max}]`;
  }

  /**
   * Ensure total row size stays under Kafka limit.
   * Strategy: measure all string fields, repeatedly halve the largest until under budget.
   */
  private enforceRowBudget(f: Record<string, any>, jsonld: { value: string }): void {
    // All string field keys that could be large
    const keys = Object.keys(f).filter((k) => typeof f[k] === "string");
    keys.push("__jsonld__"); // track jsonld alongside

    const getSize = () => {
      let total = 0;
      for (const k of keys) {
        const v = k === "__jsonld__" ? jsonld.value : f[k];
        if (typeof v === "string") total += v.length;
      }
      return total;
    };

    let totalSize = getSize();
    let iterations = 0;

    while (totalSize > XtdbEndpoint.MAX_ROW_BYTES && iterations < 20) {
      // Find largest field
      let maxKey = "";
      let maxLen = 0;
      for (const k of keys) {
        const v = k === "__jsonld__" ? jsonld.value : f[k];
        if (typeof v === "string" && v.length > maxLen) {
          maxLen = v.length;
          maxKey = k;
        }
      }
      if (!maxKey || maxLen < 200) break; // nothing left to trim

      // Halve it (minimum 200 chars)
      const newLen = Math.max(200, Math.floor(maxLen / 2));
      if (maxKey === "__jsonld__") {
        jsonld.value = XtdbEndpoint.truncate(jsonld.value, newLen);
      } else {
        f[maxKey] = XtdbEndpoint.truncate(f[maxKey], newLen);
      }

      totalSize = getSize();
      iterations++;
    }
  }

  private async insertRow(event: NormalizedEvent, jsonld: string): Promise<void> {
    const sql = this.sql!;
    const t = (v: string | null) => sql.typed(v as any, 25); // text
    const b = (v: boolean | null) => sql.typed(v as any, 16); // bool
    const n = (v: number | null) => sql.typed(v as any, 20); // int8/bigint

    const f = event.fields;

    // Enforce total row size < 900KB to stay under Kafka 1MB limit
    const jsonldRef = { value: jsonld };
    this.enforceRowBudget(f as Record<string, any>, jsonldRef);
    jsonld = jsonldRef.value;

    await sql`INSERT INTO events (
      _id, environment, event_name, category, can_intercept,
      schema_version, ts, seq, session_id, cwd,
      switch_reason, switch_target, switch_previous,
      fork_entry_id, fork_previous,
      tree_new_leaf, tree_old_leaf, tree_from_ext,
      event_cwd,
      compact_tokens, compact_from_ext,
      prompt_text, agent_end_msg_count,
      turn_index, turn_timestamp, turn_end_tool_count,
      message_role, stream_delta_type, stream_delta_len,
      tool_name, tool_call_id, is_error,
      context_msg_count, provider_payload_bytes,
      input_text, input_source, input_has_images,
      bash_command, bash_exclude,
      model_provider, model_id, model_source,
      prev_model_provider, prev_model_id,
      payload, handler_error,
      message_content, stream_delta,
      tool_input, tool_content, tool_details,
      tool_partial_result, tool_args,
      agent_messages, system_prompt, images,
      context_messages, provider_payload,
      turn_message, turn_tool_results,
      compact_branch_entries,
      jsonld
    ) VALUES (
      ${t(event.id)}, ${t("pi.dev")}, ${t(event.eventName)}, ${t(event.category)}, ${b(event.canIntercept)},
      ${n(event.schemaVersion)}, ${n(event.ts)}, ${n(event.seq)}, ${t(event.sessionId)}, ${t(event.cwd)},
      ${t(f.switchReason ?? null)}, ${t(f.switchTarget ?? null)}, ${t(f.switchPrevious ?? null)},
      ${t(f.forkEntryId ?? null)}, ${t(f.forkPrevious ?? null)},
      ${t(f.treeNewLeaf ?? null)}, ${t(f.treeOldLeaf ?? null)}, ${b(f.treeFromExt ?? null)},
      ${t(f.eventCwd ?? null)},
      ${n(f.compactTokens ?? null)}, ${b(f.compactFromExt ?? null)},
      ${t(f.promptText ?? null)}, ${n(f.agentEndMsgCount ?? null)},
      ${n(f.turnIndex ?? null)}, ${n(f.turnTimestamp ?? null)}, ${n(f.turnEndToolCount ?? null)},
      ${t(f.messageRole ?? null)}, ${t(f.streamDeltaType ?? null)}, ${n(f.streamDeltaLen ?? null)},
      ${t(f.toolName ?? null)}, ${t(f.toolCallId ?? null)}, ${b(f.isError ?? null)},
      ${n(f.contextMsgCount ?? null)}, ${n(f.providerPayloadBytes ?? null)},
      ${t(f.inputText ?? null)}, ${t(f.inputSource ?? null)}, ${b(f.inputHasImages ?? null)},
      ${t(f.bashCommand ?? null)}, ${b(f.bashExclude ?? null)},
      ${t(f.modelProvider ?? null)}, ${t(f.modelId ?? null)}, ${t(f.modelSource ?? null)},
      ${t(f.prevModelProvider ?? null)}, ${t(f.prevModelId ?? null)},
      ${t(f.payload ?? null)}, ${t(f.handlerError ?? null)},
      ${t(f.messageContent ?? null)}, ${t(f.streamDelta ?? null)},
      ${t(f.toolInput ?? null)}, ${t(f.toolContent ?? null)}, ${t(f.toolDetails ?? null)},
      ${t(f.toolPartialResult ?? null)}, ${t(f.toolArgs ?? null)},
      ${t(f.agentMessages ?? null)}, ${t(f.systemPrompt ?? null)}, ${t(f.images ?? null)},
      ${t(f.contextMessages ?? null)}, ${t(f.providerPayload ?? null)},
      ${t(f.turnMessage ?? null)}, ${t(f.turnToolResults ?? null)},
      ${t(f.compactBranchEntries ?? null)},
      ${t(jsonld)}
    )`;
  }
}
