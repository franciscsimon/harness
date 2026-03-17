const LIVE = process.env.HOME + "/.pi/agent/extensions/xtdb-event-logger";

async function testHandler(name: string, raw: unknown, checks: Record<string, (fields: any) => boolean>) {
  const mod = await import(`${LIVE}/handlers/${name}.ts`);
  const fields = mod.handler(raw, { sessionId: "s1", cwd: "/tmp", seq: 1 });
  let allPass = true;
  for (const [label, check] of Object.entries(checks)) {
    const pass = check(fields);
    console.log(`  ${pass ? "✅" : "❌"} ${name}.${label}`);
    if (!pass) allPass = false;
  }
  return allPass;
}

async function main() {
  const handler = process.argv[2];
  if (!handler) { console.log("Usage: npx jiti test-handler.ts <handler-name>"); process.exit(1); }
  
  const tests: Record<string, { raw: unknown; checks: Record<string, (f: any) => boolean> }> = {
    "message-update": {
      raw: { message: { role: "assistant", content: [{ type: "text", text: "hello" }] }, assistantMessageEvent: { type: "text", delta: "hello world" } },
      checks: {
        streamDelta: (f) => f.streamDelta === "hello world",
        messageContent: (f) => !!f.messageContent && f.messageContent.includes("hello"),
      },
    },
    "message-start": {
      raw: { message: { role: "assistant", content: [{ type: "text", text: "start" }] } },
      checks: {
        messageContent: (f) => !!f.messageContent && f.messageContent.includes("start"),
        messageRole: (f) => f.messageRole === "assistant",
      },
    },
    "message-end": {
      raw: { message: { role: "assistant", content: [{ type: "text", text: "end msg" }] } },
      checks: { messageContent: (f) => !!f.messageContent && f.messageContent.includes("end msg") },
    },
    "tool-result": {
      raw: { toolName: "read", toolCallId: "tc1", isError: false, input: { path: "/foo" }, content: [{ type: "text", text: "file" }], details: { n: 1 } },
      checks: {
        toolContent: (f) => !!f.toolContent && f.toolContent.includes("file"),
        toolDetails: (f) => !!f.toolDetails,
        toolInput: (f) => !!f.toolInput && f.toolInput.includes("/foo"),
      },
    },
    "tool-execution-end": {
      raw: { toolName: "bash", toolCallId: "tc2", isError: false, result: { content: [{ type: "text", text: "out" }], details: { exitCode: 0 } } },
      checks: {
        toolContent: (f) => !!f.toolContent && f.toolContent.includes("out"),
        toolDetails: (f) => !!f.toolDetails && f.toolDetails.includes("exitCode"),
      },
    },
    "turn-end": {
      raw: { turnIndex: 3, message: { role: "assistant", content: [{ type: "text", text: "resp" }] }, toolResults: [{ toolName: "read", content: "r" }] },
      checks: {
        turnMessage: (f) => !!f.turnMessage && f.turnMessage.includes("resp"),
        turnToolResults: (f) => !!f.turnToolResults && f.turnToolResults.includes("read"),
      },
    },
    "agent-end": {
      raw: { messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "bye" }] },
      checks: {
        agentMessages: (f) => !!f.agentMessages && f.agentMessages.includes("bye"),
        count: (f) => f.agentEndMsgCount === 2,
      },
    },
    "tool-call": {
      raw: { toolName: "bash", toolCallId: "tc3", input: { command: "x".repeat(10000) } },
      checks: { toolInput: (f) => !!f.toolInput && f.toolInput.length > 5000 },
    },
    "tool-execution-start": {
      raw: { toolName: "write", toolCallId: "tc4", args: { path: "/out", content: "code" } },
      checks: { toolArgs: (f) => !!f.toolArgs && f.toolArgs.includes("code") },
    },
    "before-agent-start": {
      raw: { prompt: "a".repeat(5000), systemPrompt: "You are helpful", images: [{ data: "b64" }] },
      checks: {
        promptText: (f) => !!f.promptText && f.promptText.length > 3000,
        systemPrompt: (f) => !!f.systemPrompt && f.systemPrompt.includes("helpful"),
        images: (f) => !!f.images,
      },
    },
    "session-before-compact": {
      raw: { preparation: { tokensBefore: 50000 }, branchEntries: [{ id: "e1" }], signal: {} },
      checks: { compactBranchEntries: (f) => !!f.compactBranchEntries && f.compactBranchEntries.includes("e1") },
    },
    "tool-execution-update": {
      raw: { toolName: "bash", toolCallId: "tc5", args: { command: "ls" }, partialResult: { content: [{ type: "text", text: "partial" }] } },
      checks: {
        toolArgs: (f) => !!f.toolArgs && f.toolArgs.includes("ls"),
        toolPartialResult: (f) => !!f.toolPartialResult && f.toolPartialResult.includes("partial"),
      },
    },
    "context": {
      raw: { messages: [{ role: "user", content: [{ type: "text", text: "ctx" }] }] },
      checks: { contextMessages: (f) => !!f.contextMessages && f.contextMessages.includes("ctx") },
    },
    "before-provider-request": {
      raw: { payload: { model: "claude", messages: [{ role: "user", content: "test" }] } },
      checks: { providerPayload: (f) => !!f.providerPayload && f.providerPayload.includes("claude") },
    },
  };

  if (handler === "all") {
    let total = 0, passed = 0;
    for (const [name, t] of Object.entries(tests)) {
      const ok = await testHandler(name, t.raw, t.checks);
      total += Object.keys(t.checks).length;
      if (ok) passed += Object.keys(t.checks).length;
    }
    console.log(`\n${passed}/${total} passed`);
    if (passed < total) process.exit(1);
  } else {
    const t = tests[handler];
    if (!t) { console.log("Unknown handler:", handler, "\nAvailable:", Object.keys(tests).join(", ")); process.exit(1); }
    const ok = await testHandler(handler, t.raw, t.checks);
    if (!ok) process.exit(1);
  }
}

main();
