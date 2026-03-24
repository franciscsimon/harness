/**
 * Insert test events with full content into XTDB to verify new columns work.
 */
import postgres from "postgres";

const LIVE = `${process.env.HOME}/.pi/agent/extensions/xtdb-event-logger`;

async function main() {
  // Import handler + serialization from live extension
  const { eventToTriples } = await import(`${LIVE}/rdf/triples.ts`);
  const { triplesToJsonLd } = await import(`${LIVE}/rdf/serialize.ts`);

  const sql = postgres({ host: "localhost", port: 5433, database: "xtdb", user: "xtdb", password: "xtdb" });
  const t = (v: string | null) => sql.typed(v as any, 25);
  const b = (v: boolean | null) => sql.typed(v as any, 16);
  const n = (v: number | null) => sql.typed(v as any, 20);

  // Test handlers and insert results
  const handlers = [
    {
      name: "message-update",
      raw: {
        message: { role: "assistant", content: [{ type: "text", text: "Hello from schema v2 test" }] },
        assistantMessageEvent: { type: "text", delta: "Hello from schema v2 test" },
      },
    },
    {
      name: "tool-call",
      raw: { toolName: "bash", toolCallId: "test-tc1", input: { command: "echo schema v2 full content" } },
    },
    {
      name: "tool-result",
      raw: {
        toolName: "bash",
        toolCallId: "test-tc1",
        isError: false,
        input: { command: "echo test" },
        content: [{ type: "text", text: "schema v2 full output" }],
        details: { exitCode: 0, stdout: "test output" },
      },
    },
    {
      name: "tool-execution-end",
      raw: {
        toolName: "bash",
        toolCallId: "test-tc1",
        isError: false,
        result: { content: [{ type: "text", text: "exec end output" }], details: { exitCode: 0 } },
      },
    },
    {
      name: "turn-end",
      raw: {
        turnIndex: 99,
        message: { role: "assistant", content: [{ type: "text", text: "Turn response text" }] },
        toolResults: [{ toolName: "bash", content: [{ type: "text", text: "tool result in turn" }] }],
      },
    },
    {
      name: "before-agent-start",
      raw: { prompt: "User prompt here", systemPrompt: "You are a test system prompt for schema v2", images: [] },
    },
    {
      name: "context",
      raw: {
        messages: [
          { role: "user", content: [{ type: "text", text: "context message" }] },
          { role: "assistant", content: [{ type: "text", text: "response" }] },
        ],
      },
    },
  ];

  for (const { name, raw } of handlers) {
    const mod = await import(`${LIVE}/handlers/${name}.ts`);
    const fields = mod.handler(raw, { sessionId: "test-v2", cwd: "/tmp", seq: 0 });

    const id = `test-v2-${name}-${Date.now()}`;
    const eventName = name.replace(/-/g, "_");

    const event = {
      id,
      eventName,
      category: "tool" as any,
      canIntercept: false,
      schemaVersion: 2,
      ts: Date.now(),
      seq: 0,
      sessionId: "test-v2",
      cwd: "/tmp",
      fields,
    };

    // Generate JSON-LD
    const triples = eventToTriples(event);
    const jsonld = await triplesToJsonLd(triples);

    const f = fields;
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
      ${t(id)}, ${t("pi.dev")}, ${t(eventName)}, ${t("tool")}, ${b(false)},
      ${n(2)}, ${n(Date.now())}, ${n(0)}, ${t("test-v2")}, ${t("/tmp")},
      ${t(null)}, ${t(null)}, ${t(null)},
      ${t(null)}, ${t(null)},
      ${t(null)}, ${t(null)}, ${b(null)},
      ${t(null)},
      ${n(null)}, ${b(null)},
      ${t(f.promptText ?? null)}, ${n(f.agentEndMsgCount ?? null)},
      ${n(f.turnIndex ?? null)}, ${n(f.turnTimestamp ?? null)}, ${n(f.turnEndToolCount ?? null)},
      ${t(f.messageRole ?? null)}, ${t(f.streamDeltaType ?? null)}, ${n(f.streamDeltaLen ?? null)},
      ${t(f.toolName ?? null)}, ${t(f.toolCallId ?? null)}, ${b(f.isError ?? null)},
      ${n(f.contextMsgCount ?? null)}, ${n(f.providerPayloadBytes ?? null)},
      ${t(f.inputText ?? null)}, ${t(f.inputSource ?? null)}, ${b(f.inputHasImages ?? null)},
      ${t(f.bashCommand ?? null)}, ${b(f.bashExclude ?? null)},
      ${t(null)}, ${t(null)}, ${t(null)},
      ${t(null)}, ${t(null)},
      ${t(f.payload ?? null)}, ${t(null)},
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

  const rows = await sql`
    SELECT event_name, schema_version,
      stream_delta, message_content, tool_input, tool_content, tool_details,
      system_prompt, context_messages, turn_message, turn_tool_results
    FROM events
    WHERE session_id = 'test-v2'
    ORDER BY event_name
  `;

  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (k === "event_name" || k === "schema_version") continue;
      if (v !== null) {
        const _val = String(v);
      }
    }
  }

  await sql.end();
}

main().catch((_e) => {
  process.exit(1);
});
