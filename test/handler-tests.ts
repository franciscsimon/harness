#!/usr/bin/env npx jiti
/**
 * E2E handler tests — verify each handler extracts full content.
 * Run: cd xtdb-event-logger && npx jiti ../test/handler-tests.ts
 */

type TestResult = { handler: string; pass: boolean; detail: string };
const results: TestResult[] = [];

function test(handler: string, pass: boolean, detail: string) {
  results.push({ handler, pass, detail });
  console.log(`  ${pass ? "✅" : "❌"} ${handler}: ${detail}`);
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v); } catch { return ""; }
}

async function run() {
  console.log("═══ Handler E2E Tests ═══\n");

  // ── message_update ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/message-update.ts");
    const raw = { message: { role: "assistant", content: [{ type: "text", text: "hello world" }] }, assistantMessageEvent: { type: "text", delta: "hello world" } };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 1 });
    test("message_update", fields.streamDelta === "hello world", `streamDelta=${fields.streamDelta?.slice(0, 30)}`);
    test("message_update.messageContent", !!fields.messageContent && fields.messageContent.includes("hello world"), `messageContent present=${!!fields.messageContent}`);
  }

  // ── message_start ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/message-start.ts");
    const raw = { message: { role: "assistant", content: [{ type: "text", text: "start msg" }] } };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 2 });
    test("message_start", !!fields.messageContent && fields.messageContent.includes("start msg"), `messageContent present=${!!fields.messageContent}`);
    test("message_start.role", fields.messageRole === "assistant", `role=${fields.messageRole}`);
  }

  // ── message_end ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/message-end.ts");
    const raw = { message: { role: "assistant", content: [{ type: "text", text: "end msg" }] } };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 3 });
    test("message_end", !!fields.messageContent && fields.messageContent.includes("end msg"), `messageContent present=${!!fields.messageContent}`);
  }

  // ── tool_result ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/tool-result.ts");
    const raw = {
      toolName: "read", toolCallId: "tc1", isError: false,
      input: { path: "/tmp/foo.ts" },
      content: [{ type: "text", text: "file contents here" }],
      details: { lineCount: 42 },
    };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 4 });
    test("tool_result.toolContent", !!fields.toolContent && fields.toolContent.includes("file contents"), `toolContent present=${!!fields.toolContent}`);
    test("tool_result.toolDetails", !!fields.toolDetails && fields.toolDetails.includes("lineCount"), `toolDetails present=${!!fields.toolDetails}`);
    test("tool_result.toolInput", !!fields.toolInput && fields.toolInput.includes("/tmp/foo.ts"), `toolInput present=${!!fields.toolInput}`);
  }

  // ── tool_execution_end ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/tool-execution-end.ts");
    const raw = {
      toolName: "bash", toolCallId: "tc2", isError: false,
      result: { content: [{ type: "text", text: "cmd output" }], details: { exitCode: 0 } },
    };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 5 });
    test("tool_execution_end.toolContent", !!fields.toolContent && fields.toolContent.includes("cmd output"), `toolContent present=${!!fields.toolContent}`);
    test("tool_execution_end.toolDetails", !!fields.toolDetails && fields.toolDetails.includes("exitCode"), `toolDetails present=${!!fields.toolDetails}`);
  }

  // ── turn_end ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/turn-end.ts");
    const raw = {
      turnIndex: 3,
      message: { role: "assistant", content: [{ type: "text", text: "turn response" }] },
      toolResults: [{ toolName: "read", content: [{ type: "text", text: "result1" }] }],
    };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 6 });
    test("turn_end.turnMessage", !!fields.turnMessage && fields.turnMessage.includes("turn response"), `turnMessage present=${!!fields.turnMessage}`);
    test("turn_end.turnToolResults", !!fields.turnToolResults && fields.turnToolResults.includes("result1"), `turnToolResults present=${!!fields.turnToolResults}`);
  }

  // ── agent_end ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/agent-end.ts");
    const raw = { messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }, { role: "assistant", content: [{ type: "text", text: "world" }] }] };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 7 });
    test("agent_end.agentMessages", !!fields.agentMessages && fields.agentMessages.includes("world"), `agentMessages present=${!!fields.agentMessages}`);
    test("agent_end.count", fields.agentEndMsgCount === 2, `count=${fields.agentEndMsgCount}`);
  }

  // ── tool_call ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/tool-call.ts");
    const bigInput = { command: "x".repeat(10000) };
    const raw = { toolName: "bash", toolCallId: "tc3", input: bigInput };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 8 });
    test("tool_call.toolInput", !!fields.toolInput && fields.toolInput.length > 5000, `toolInput length=${fields.toolInput?.length} (no truncation)`);
  }

  // ── tool_execution_start ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/tool-execution-start.ts");
    const raw = { toolName: "write", toolCallId: "tc4", args: { path: "/tmp/out.ts", content: "code here" } };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 9 });
    test("tool_execution_start.toolArgs", !!fields.toolArgs && fields.toolArgs.includes("code here"), `toolArgs present=${!!fields.toolArgs}`);
  }

  // ── before_agent_start ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/before-agent-start.ts");
    const raw = { prompt: "a".repeat(5000), systemPrompt: "You are helpful", images: [{ data: "base64..." }] };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 10 });
    test("before_agent_start.promptText", !!fields.promptText && fields.promptText.length > 3000, `promptText length=${fields.promptText?.length} (no truncation)`);
    test("before_agent_start.systemPrompt", !!fields.systemPrompt && fields.systemPrompt.includes("helpful"), `systemPrompt present=${!!fields.systemPrompt}`);
    test("before_agent_start.images", !!fields.images, `images present=${!!fields.images}`);
  }

  // ── session_before_compact ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/session-before-compact.ts");
    const raw = { preparation: { tokensBefore: 50000 }, branchEntries: [{ id: "e1" }, { id: "e2" }], signal: {} };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 11 });
    test("session_before_compact.compactBranchEntries", !!fields.compactBranchEntries && fields.compactBranchEntries.includes("e1"), `entries present=${!!fields.compactBranchEntries}`);
  }

  // ── tool_execution_update ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/tool-execution-update.ts");
    const raw = { toolName: "bash", toolCallId: "tc5", args: { command: "ls" }, partialResult: { content: [{ type: "text", text: "partial" }] } };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 12 });
    test("tool_execution_update.toolArgs", !!fields.toolArgs && fields.toolArgs.includes("ls"), `toolArgs present=${!!fields.toolArgs}`);
    test("tool_execution_update.toolPartialResult", !!fields.toolPartialResult && fields.toolPartialResult.includes("partial"), `partialResult present=${!!fields.toolPartialResult}`);
  }

  // ── context ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/context.ts");
    const raw = { messages: [{ role: "user", content: [{ type: "text", text: "ctx msg" }] }] };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 13 });
    test("context.contextMessages", !!fields.contextMessages && fields.contextMessages.includes("ctx msg"), `contextMessages present=${!!fields.contextMessages}`);
  }

  // ── before_provider_request ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/before-provider-request.ts");
    const raw = { payload: { model: "claude-3", messages: [{ role: "user", content: "test" }], max_tokens: 4096 } };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 14 });
    test("before_provider_request.providerPayload", !!fields.providerPayload && fields.providerPayload.includes("claude-3"), `providerPayload present=${!!fields.providerPayload}`);
  }

  // ── session_start ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/session-start.ts");
    const fields = handler({}, { sessionId: "s1", cwd: "/tmp", seq: 15 });
    test("session_start", typeof fields === "object", `returns object=${typeof fields === "object"}`);
  }

  // ── session_shutdown ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/session-shutdown.ts");
    const fields = handler({}, { sessionId: "s1", cwd: "/tmp", seq: 16 });
    test("session_shutdown", typeof fields === "object", `returns object=${typeof fields === "object"}`);
  }

  // ── session_compact ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/session-compact.ts");
    const raw = { fromExtension: true };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 17 });
    test("session_compact.compactFromExt", fields.compactFromExt === true, `compactFromExt=${fields.compactFromExt}`);
    const fields2 = handler({}, { sessionId: "s1", cwd: "/tmp", seq: 18 });
    test("session_compact.null_default", fields2.compactFromExt === null, `compactFromExt=${fields2.compactFromExt}`);
  }

  // ── session_directory ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/session-directory.ts");
    const raw = { cwd: "/home/user/project" };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 19 });
    test("session_directory.eventCwd", fields.eventCwd === "/home/user/project", `eventCwd=${fields.eventCwd}`);
    const fields2 = handler({}, { sessionId: "s1", cwd: "/tmp", seq: 20 });
    test("session_directory.null_default", fields2.eventCwd === null, `eventCwd=${fields2.eventCwd}`);
  }

  // ── session_fork ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/session-fork.ts");
    const raw = { previousSessionFile: "/tmp/old-session.json" };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 21 });
    test("session_fork.forkPrevious", fields.forkPrevious === "/tmp/old-session.json", `forkPrevious=${fields.forkPrevious}`);
  }

  // ── session_switch ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/session-switch.ts");
    const raw = { reason: "user_request", previousSessionFile: "/tmp/prev.json" };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 22 });
    test("session_switch.switchReason", fields.switchReason === "user_request", `switchReason=${fields.switchReason}`);
    test("session_switch.switchPrevious", fields.switchPrevious === "/tmp/prev.json", `switchPrevious=${fields.switchPrevious}`);
  }

  // ── session_tree ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/session-tree.ts");
    const raw = { newLeafId: "leaf-new", oldLeafId: "leaf-old", fromExtension: false };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 23 });
    test("session_tree.treeNewLeaf", fields.treeNewLeaf === "leaf-new", `treeNewLeaf=${fields.treeNewLeaf}`);
    test("session_tree.treeOldLeaf", fields.treeOldLeaf === "leaf-old", `treeOldLeaf=${fields.treeOldLeaf}`);
    test("session_tree.treeFromExt", fields.treeFromExt === false, `treeFromExt=${fields.treeFromExt}`);
  }

  // ── turn_start ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/turn-start.ts");
    const raw = { turnIndex: 3, timestamp: 1700000000000 };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 24 });
    test("turn_start.turnIndex", fields.turnIndex === 3, `turnIndex=${fields.turnIndex}`);
    test("turn_start.turnTimestamp", fields.turnTimestamp === 1700000000000, `turnTimestamp=${fields.turnTimestamp}`);
  }

  // ── user_bash ──
  {
    const { handler } = await import("../xtdb-event-logger/handlers/user-bash.ts");
    const raw = { command: "npm test", excludeFromContext: true };
    const fields = handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 25 });
    test("user_bash.bashCommand", !!fields.bashCommand && fields.bashCommand.includes("npm test"), `bashCommand=${fields.bashCommand}`);
    test("user_bash.bashExclude", fields.bashExclude === true, `bashExclude=${fields.bashExclude}`);
    const fields2 = handler({}, { sessionId: "s1", cwd: "/tmp", seq: 26 });
    test("user_bash.null_default", fields2.bashCommand === null, `bashCommand=${fields2.bashCommand}`);
  }

  // ── Summary ──
  console.log("\n═══ Summary ═══");
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`${passed} passed, ${failed} failed out of ${results.length} tests`);

  if (failed > 0) {
    console.log("\nFailed:");
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  ❌ ${r.handler}: ${r.detail}`);
    }
    process.exit(1);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
