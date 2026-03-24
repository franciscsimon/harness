// ─── Seed Data for Augmented Pattern Tests ─────────────────────
// Inserts 12 test sessions with specific event patterns.
// Run: npx jiti test/seed-augmented-patterns.ts

import postgres from "postgres";

const sql = postgres({ host: "localhost", port: 5433, database: "xtdb", username: "xtdb" });

// XTDB requires explicit OID types for all params
const t = (v: string | null) => sql.typed(v as any, 25); // text
const n = (v: number | null) => sql.typed(v as any, 20); // bigint
const b = (v: boolean | null) => sql.typed(v as any, 16); // boolean

let seqCounter = 10000; // Start high to avoid conflicts with real data

function nextSeq() {
  return seqCounter++;
}
function uuid() {
  return crypto.randomUUID();
}
const NOW = Date.now();

async function insert(event: Record<string, any>) {
  const seq = event.seq ?? nextSeq();
  await sql`INSERT INTO events (
    _id, environment, event_name, category, can_intercept,
    ts, seq, session_id, cwd,
    context_msg_count, provider_payload_bytes,
    tool_name, tool_call_id, is_error, turn_index,
    bash_command, agent_end_msg_count, compact_from_ext, compact_tokens
  ) VALUES (
    ${t(uuid())}, ${t("pi.dev")}, ${t(event.event_name)}, ${t(event.category ?? "tool")}, ${b(false)},
    ${n(event.ts ?? NOW)}, ${n(seq)}, ${t(event.session_id)}, ${t("/test/cwd")},
    ${n(event.context_msg_count ?? null)}, ${n(event.provider_payload_bytes ?? null)},
    ${t(event.tool_name ?? null)}, ${t(event.tool_call_id ?? null)}, ${b(event.is_error ?? null)},
    ${n(event.turn_index ?? null)}, ${t(event.bash_command ?? null)},
    ${n(event.agent_end_msg_count ?? null)}, ${b(event.compact_from_ext ?? null)},
    ${n(event.compact_tokens ?? null)}
  )`;
}

// ─── Helper: Generate a sequence of events ─────────────────────

async function seedSession(sessionId: string, events: Array<Record<string, any>>) {
  let baseTs = NOW - 3600_000; // 1 hour ago
  for (const ev of events) {
    baseTs += 1000; // 1 second between events
    await insert({ ...ev, session_id: sessionId, ts: ev.ts ?? baseTs });
  }
}

// ─── Seed Sessions ─────────────────────────────────────────────

async function main() {
  // ─── F1: Context Markers — Bloated Session ──
  await seedSession("/test/ctx-markers-bloated", [
    { event_name: "session_start", category: "session" },
    { event_name: "turn_start", category: "agent", turn_index: 0 },
    { event_name: "context", category: "tool", context_msg_count: 5 },
    { event_name: "before_provider_request", category: "tool", provider_payload_bytes: 30000 },
    { event_name: "tool_execution_start", category: "tool", tool_name: "bash", tool_call_id: "tc-b1" },
    { event_name: "tool_execution_end", category: "tool", tool_name: "bash", tool_call_id: "tc-b1", is_error: false },
    { event_name: "turn_end", category: "agent", turn_index: 0 },
    { event_name: "turn_start", category: "agent", turn_index: 1 },
    { event_name: "context", category: "tool", context_msg_count: 15 },
    { event_name: "before_provider_request", category: "tool", provider_payload_bytes: 65000 },
    { event_name: "turn_end", category: "agent", turn_index: 1 },
    { event_name: "turn_start", category: "agent", turn_index: 2 },
    { event_name: "context", category: "tool", context_msg_count: 30 },
    { event_name: "before_provider_request", category: "tool", provider_payload_bytes: 110000 },
    { event_name: "turn_end", category: "agent", turn_index: 2 },
    { event_name: "turn_start", category: "agent", turn_index: 3 },
    { event_name: "context", category: "tool", context_msg_count: 50 },
    { event_name: "before_provider_request", category: "tool", provider_payload_bytes: 200000 },
    { event_name: "turn_end", category: "agent", turn_index: 3 },
    { event_name: "turn_start", category: "agent", turn_index: 4 },
    { event_name: "context", category: "tool", context_msg_count: 65 },
    { event_name: "before_provider_request", category: "tool", provider_payload_bytes: 350000 },
    { event_name: "turn_end", category: "agent", turn_index: 4 },
    { event_name: "agent_end", category: "agent", agent_end_msg_count: 10 },
  ]);

  // ─── F1: Context Markers — Healthy Session ──
  await seedSession("/test/ctx-markers-healthy", [
    { event_name: "session_start", category: "session" },
    { event_name: "turn_start", category: "agent", turn_index: 0 },
    { event_name: "context", category: "tool", context_msg_count: 3 },
    { event_name: "before_provider_request", category: "tool", provider_payload_bytes: 15000 },
    { event_name: "tool_execution_start", category: "tool", tool_name: "read", tool_call_id: "tc-r1" },
    { event_name: "tool_execution_end", category: "tool", tool_name: "read", tool_call_id: "tc-r1", is_error: false },
    { event_name: "turn_end", category: "agent", turn_index: 0 },
    { event_name: "turn_start", category: "agent", turn_index: 1 },
    { event_name: "context", category: "tool", context_msg_count: 5 },
    { event_name: "before_provider_request", category: "tool", provider_payload_bytes: 25000 },
    { event_name: "turn_end", category: "agent", turn_index: 1 },
    { event_name: "agent_end", category: "agent", agent_end_msg_count: 4 },
  ]);

  // ─── F1: Context Markers — Compacted Session ──
  await seedSession("/test/ctx-markers-compacted", [
    { event_name: "session_start", category: "session" },
    { event_name: "context", category: "tool", context_msg_count: 10 },
    { event_name: "before_provider_request", category: "tool", provider_payload_bytes: 50000 },
    { event_name: "context", category: "tool", context_msg_count: 40 },
    { event_name: "before_provider_request", category: "tool", provider_payload_bytes: 200000 },
    { event_name: "session_before_compact", category: "compaction", compact_tokens: 5000 },
    { event_name: "session_compact", category: "compaction", compact_from_ext: false },
    { event_name: "context", category: "tool", context_msg_count: 5 },
    { event_name: "before_provider_request", category: "tool", provider_payload_bytes: 30000 },
  ]);

  // ─── F3: Canary — High Error Rate (Thrashing) ──
  const thrashEvents: any[] = [
    { event_name: "session_start", category: "session" },
    { event_name: "agent_start", category: "agent" },
    { event_name: "turn_start", category: "agent", turn_index: 0 },
  ];
  const thrashErrors = [false, true, true, false, true, false, true, false, false, false]; // 4/10 = 40%
  for (let i = 0; i < 10; i++) {
    const id = `tc-${String(i + 1).padStart(2, "0")}`;
    const tool = i === 3 ? "read" : "bash";
    thrashEvents.push(
      { event_name: "tool_execution_start", category: "tool", tool_name: tool, tool_call_id: id },
      {
        event_name: "tool_execution_end",
        category: "tool",
        tool_name: tool,
        tool_call_id: id,
        is_error: thrashErrors[i],
      },
    );
  }
  thrashEvents.push(
    { event_name: "turn_end", category: "agent", turn_index: 0 },
    { event_name: "agent_end", category: "agent", agent_end_msg_count: 5 },
  );
  await seedSession("/test/canary-thrashing", thrashEvents);

  // ─── F3: Canary — Healthy Session ──
  const healthyEvents: any[] = [
    { event_name: "session_start", category: "session" },
    { event_name: "agent_start", category: "agent" },
    { event_name: "turn_start", category: "agent", turn_index: 0 },
  ];
  const healthyErrors = [false, false, true, false, false, false, false, false, false, false]; // 1/10 = 10%
  const healthyTools = ["bash", "read", "bash", "read", "bash", "write", "bash", "read", "bash", "write"];
  for (let i = 0; i < 10; i++) {
    const id = `tc-h${String(i + 1).padStart(2, "0")}`;
    healthyEvents.push(
      { event_name: "tool_execution_start", category: "tool", tool_name: healthyTools[i], tool_call_id: id },
      {
        event_name: "tool_execution_end",
        category: "tool",
        tool_name: healthyTools[i],
        tool_call_id: id,
        is_error: healthyErrors[i],
      },
    );
  }
  healthyEvents.push(
    { event_name: "turn_end", category: "agent", turn_index: 0 },
    { event_name: "turn_start", category: "agent", turn_index: 1 },
    { event_name: "turn_end", category: "agent", turn_index: 1 },
    { event_name: "turn_start", category: "agent", turn_index: 2 },
    { event_name: "turn_end", category: "agent", turn_index: 2 },
    { event_name: "agent_end", category: "agent", agent_end_msg_count: 8 },
  );
  await seedSession("/test/canary-healthy", healthyEvents);

  // ─── F3: Canary — Turn Inflation ──
  const inflatedEvents: any[] = [
    { event_name: "session_start", category: "session" },
    { event_name: "agent_start", category: "agent" },
  ];
  for (let t = 0; t < 8; t++) {
    inflatedEvents.push(
      { event_name: "turn_start", category: "agent", turn_index: t },
      { event_name: "turn_end", category: "agent", turn_index: t },
    );
  }
  inflatedEvents.push({ event_name: "agent_end", category: "agent", agent_end_msg_count: 20 });
  await seedSession("/test/canary-inflated", inflatedEvents);

  // ─── F3: Canary — Retry Storm ──
  const stormEvents: any[] = [
    { event_name: "session_start", category: "session" },
    { event_name: "agent_start", category: "agent" },
    { event_name: "turn_start", category: "agent", turn_index: 0 },
  ];
  for (let i = 0; i < 4; i++) {
    stormEvents.push(
      { event_name: "tool_execution_start", category: "tool", tool_name: "bash", tool_call_id: `tc-r${i + 1}` },
      {
        event_name: "tool_execution_end",
        category: "tool",
        tool_name: "bash",
        tool_call_id: `tc-r${i + 1}`,
        is_error: i < 3,
      },
    );
  }
  stormEvents.push(
    { event_name: "turn_end", category: "agent", turn_index: 0 },
    { event_name: "agent_end", category: "agent" },
  );
  await seedSession("/test/canary-retry-storm", stormEvents);

  // ─── F4: Habit — No Commit ──
  const noCommitEvents: any[] = [
    { event_name: "session_start", category: "session" },
    { event_name: "agent_start", category: "agent" },
    { event_name: "turn_start", category: "agent", turn_index: 0 },
  ];
  const editTools = ["write", "edit", "write", "bash", "write", "edit"];
  for (let i = 0; i < editTools.length; i++) {
    noCommitEvents.push(
      { event_name: "tool_execution_start", category: "tool", tool_name: editTools[i], tool_call_id: `tc-nc${i + 1}` },
      {
        event_name: "tool_execution_end",
        category: "tool",
        tool_name: editTools[i],
        tool_call_id: `tc-nc${i + 1}`,
        is_error: false,
      },
    );
  }
  noCommitEvents.push({ event_name: "turn_end", category: "agent", turn_index: 0 });
  await seedSession("/test/habit-no-commit", noCommitEvents);

  // ─── F4: Habit — No Test ──
  const noTestEvents: any[] = [
    { event_name: "session_start", category: "session" },
    { event_name: "agent_start", category: "agent" },
    { event_name: "turn_start", category: "agent", turn_index: 0 },
  ];
  const writeTools = ["write", "write", "edit", "write", "edit", "write"];
  for (let i = 0; i < writeTools.length; i++) {
    noTestEvents.push(
      { event_name: "tool_execution_start", category: "tool", tool_name: writeTools[i], tool_call_id: `tc-nt${i + 1}` },
      {
        event_name: "tool_execution_end",
        category: "tool",
        tool_name: writeTools[i],
        tool_call_id: `tc-nt${i + 1}`,
        is_error: false,
      },
    );
  }
  noTestEvents.push({ event_name: "turn_end", category: "agent", turn_index: 0 });
  await seedSession("/test/habit-no-test", noTestEvents);

  // ─── F4: Habit — Error Streak ──
  await seedSession("/test/habit-error-streak", [
    { event_name: "session_start", category: "session" },
    { event_name: "tool_execution_end", category: "tool", tool_name: "bash", tool_call_id: "tc-e1", is_error: true },
    { event_name: "tool_execution_end", category: "tool", tool_name: "bash", tool_call_id: "tc-e2", is_error: true },
    { event_name: "tool_execution_end", category: "tool", tool_name: "read", tool_call_id: "tc-e3", is_error: true },
  ]);

  // ─── F4: Habit — Scope Creep ──
  const scopeEvents: any[] = [
    { event_name: "session_start", category: "session" },
    { event_name: "agent_start", category: "agent" },
    { event_name: "turn_start", category: "agent", turn_index: 0 },
  ];
  for (let i = 0; i < 12; i++) {
    const tool = i % 3 === 0 ? "write" : i % 3 === 1 ? "edit" : "read";
    scopeEvents.push(
      { event_name: "tool_execution_start", category: "tool", tool_name: tool, tool_call_id: `tc-sc${i + 1}` },
      {
        event_name: "tool_execution_end",
        category: "tool",
        tool_name: tool,
        tool_call_id: `tc-sc${i + 1}`,
        is_error: false,
      },
    );
  }
  scopeEvents.push({ event_name: "turn_end", category: "agent", turn_index: 0 });
  await seedSession("/test/habit-scope-creep", scopeEvents);

  // ─── F6: Knowledge — Rich Session ──
  await seedSession("/test/knowledge-rich", [
    { event_name: "session_start", category: "session" },
    { event_name: "agent_start", category: "agent" },
    { event_name: "turn_start", category: "agent", turn_index: 0 },
    { event_name: "tool_execution_start", category: "tool", tool_name: "write", tool_call_id: "tc-k1" },
    { event_name: "tool_execution_end", category: "tool", tool_name: "write", tool_call_id: "tc-k1", is_error: false },
    { event_name: "tool_execution_start", category: "tool", tool_name: "write", tool_call_id: "tc-k2" },
    { event_name: "tool_execution_end", category: "tool", tool_name: "write", tool_call_id: "tc-k2", is_error: false },
    { event_name: "tool_execution_start", category: "tool", tool_name: "edit", tool_call_id: "tc-k3" },
    { event_name: "tool_execution_end", category: "tool", tool_name: "edit", tool_call_id: "tc-k3", is_error: false },
    {
      event_name: "tool_execution_start",
      category: "tool",
      tool_name: "bash",
      tool_call_id: "tc-k4",
      bash_command: "npm test",
    },
    { event_name: "tool_execution_end", category: "tool", tool_name: "bash", tool_call_id: "tc-k4", is_error: false },
    { event_name: "turn_end", category: "agent", turn_index: 0 },
    { event_name: "turn_start", category: "agent", turn_index: 1 },
    {
      event_name: "tool_execution_start",
      category: "tool",
      tool_name: "bash",
      tool_call_id: "tc-k5",
      bash_command: "git status",
    },
    { event_name: "tool_execution_end", category: "tool", tool_name: "bash", tool_call_id: "tc-k5", is_error: true },
    { event_name: "tool_execution_start", category: "tool", tool_name: "read", tool_call_id: "tc-k6" },
    { event_name: "tool_execution_end", category: "tool", tool_name: "read", tool_call_id: "tc-k6", is_error: false },
    {
      event_name: "tool_execution_start",
      category: "tool",
      tool_name: "bash",
      tool_call_id: "tc-k7",
      bash_command: "ls -la",
    },
    { event_name: "tool_execution_end", category: "tool", tool_name: "bash", tool_call_id: "tc-k7", is_error: true },
    { event_name: "tool_execution_start", category: "tool", tool_name: "write", tool_call_id: "tc-k8" },
    { event_name: "tool_execution_end", category: "tool", tool_name: "write", tool_call_id: "tc-k8", is_error: false },
    { event_name: "tool_execution_start", category: "tool", tool_name: "edit", tool_call_id: "tc-k9" },
    { event_name: "tool_execution_end", category: "tool", tool_name: "edit", tool_call_id: "tc-k9", is_error: false },
    {
      event_name: "tool_execution_start",
      category: "tool",
      tool_name: "bash",
      tool_call_id: "tc-k10",
      bash_command: "grep -r TODO",
    },
    { event_name: "tool_execution_end", category: "tool", tool_name: "bash", tool_call_id: "tc-k10", is_error: false },
    { event_name: "turn_end", category: "agent", turn_index: 1 },
    { event_name: "turn_start", category: "agent", turn_index: 2 },
    { event_name: "turn_end", category: "agent", turn_index: 2 },
    { event_name: "turn_start", category: "agent", turn_index: 3 },
    { event_name: "turn_end", category: "agent", turn_index: 3 },
    { event_name: "turn_start", category: "agent", turn_index: 4 },
    { event_name: "turn_end", category: "agent", turn_index: 4 },
    { event_name: "agent_end", category: "agent", agent_end_msg_count: 15 },
  ]);
  await sql.end();
}

main().catch((_err) => {
  process.exit(1);
});
