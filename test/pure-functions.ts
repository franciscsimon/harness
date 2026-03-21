// ─── Pure Function Tests ──────────────────────────────────────
// No DB, no network, no filesystem. Runs in <1s.
// Run: npx jiti test/pure-functions.ts

// ─── Framework ────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures: string[] = [];
function pass(name: string) { passed++; console.log(`  ✅ ${name}`); }
function fail(name: string, reason: string) { failed++; failures.push(`${name}: ${reason}`); console.log(`  ❌ ${name}: ${reason}`); }
function assert(name: string, condition: boolean, detail = "") {
  condition ? pass(name) : fail(name, detail || "assertion failed");
}
function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  a === e ? pass(name) : fail(name, `got ${a}, expected ${e}`);
}

// ─── Imports ──────────────────────────────────────────────────

import { computeHealthScore, healthColor, healthLabel } from "../xtdb-event-logger-ui/lib/health.ts";
import { relativeTime } from "../xtdb-event-logger-ui/lib/format.ts";
import { renderMarkdown } from "../xtdb-event-logger-ui/lib/markdown.ts";
import { computeLineDiff } from "../xtdb-event-logger-ui/lib/diff.ts";
import { normalizeGitUrl } from "../project-registry/normalize.ts";
import { parseClientMessage } from "../web-chat/lib/ws-protocol.ts";
import { uuid, trunc, safeJsonSize } from "../xtdb-event-logger/util.ts";
import { shouldCapture, setSamplingInterval, flushSampler } from "../xtdb-event-logger/sampling.ts";
import { routeEvent, ALL_EVENT_NAMES } from "../xtdb-event-logger/router.ts";
import { buildDecisionJsonLd } from "../decision-log/rdf.ts";

// Batch 1.1 — Utilities & Formatters
import { escapeHtml, formatDate, formatDuration, formatNumber, healthColor as uiHealthColor, relativeTime as uiRelativeTime, truncate } from "../harness-ui/lib/format.ts";
import { computeHealthScore as uiComputeHealthScore, healthColor as uiHealthColor2, healthLabel as uiHealthLabel } from "../harness-ui/lib/health.ts";
import { badge, healthDot } from "../harness-ui/components/badge.ts";
import { renderTable } from "../harness-ui/components/table.ts";
import { b, n, t } from "../lib/db.ts";
import { personAgent, piId, piRef, xsdLong, xsdBool, softwareAgent } from "../lib/jsonld/context.ts";

// Batch 1.2 — Domain Logic
import { compactEvent, getDisplayFields, getPopulatedFields } from "../xtdb-event-logger-ui/lib/format.ts";
import { renderDiffHtml } from "../xtdb-event-logger-ui/lib/diff.ts";
import { generateKnowledgeMarkdown } from "../xtdb-event-logger-ui/lib/knowledge.ts";
import { send } from "../web-chat/lib/ws-protocol.ts";

// Batch 1.3 — Config & Identity
import { loadCanaryConfig } from "../canary-monitor/config.ts";
import { loadHabitConfig } from "../habit-monitor/config.ts";
import { projectId } from "../project-registry/identity.ts";
import { discoverAgents, formatAgentList } from "../agent-spawner/agents.ts";

// Batch 1.4 — Remaining Pure Functions
import { computeToolFailureRate, computeTurnInflation, computeContextBloat, computeDuration, detectRetryStorm, computeToolDensity } from "../canary-monitor/metrics.ts";
import { checkCommitHabit, checkTestHabit, checkErrorStreak, checkScopeCreep, checkFreshStart } from "../habit-monitor/habits.ts";
import { isMutation, inputSummary } from "../xtdb-projector/mutations.ts";
import { projectTask, projectReasoning, projectResult, projectChanges } from "../xtdb-projector/projectors.ts";
import { createRunState, accumulate } from "../xtdb-projector/accumulator.ts";
import { captureError, unflushedErrorCount } from "../lib/errors.ts";

// ─── Health Score ─────────────────────────────────────────────

console.log("\n── Health Score ──");

// Requirement: healthier inputs score higher than unhealthier ones
const perfect = computeHealthScore({ errorRate: 0, turnCount: 1, maxPayloadBytes: 0, durationMs: 0 });
const halfErrors = computeHealthScore({ errorRate: 0.5, turnCount: 1, maxPayloadBytes: 0, durationMs: 0 });
const fullErrors = computeHealthScore({ errorRate: 1, turnCount: 1, maxPayloadBytes: 0, durationMs: 0 });
const manyTurns = computeHealthScore({ errorRate: 0, turnCount: 10, maxPayloadBytes: 0, durationMs: 0 });
const bigPayload = computeHealthScore({ errorRate: 0, turnCount: 1, maxPayloadBytes: 500_000, durationMs: 0 });
const longSession = computeHealthScore({ errorRate: 0, turnCount: 1, maxPayloadBytes: 0, durationMs: 1_000_000 });
const worst = computeHealthScore({ errorRate: 1, turnCount: 50, maxPayloadBytes: 1_000_000, durationMs: 5_000_000 });

assert("no errors scores higher than 50% errors", perfect > halfErrors);
assert("50% errors scores same or higher than 100% errors", halfErrors >= fullErrors);
assert("few turns scores higher than many turns", perfect > manyTurns);
assert("small payload scores higher than large payload", perfect > bigPayload);
assert("short session scores higher than long session", perfect > longSession);
assert("worst case scores lowest", worst <= fullErrors && worst <= manyTurns);
assert("score range is 0-100", perfect >= 0 && perfect <= 100 && worst >= 0 && worst <= 100);

eq("healthColor green", healthColor(85), "green");
eq("healthColor yellow", healthColor(50), "yellow");
eq("healthColor red", healthColor(30), "red");
eq("healthColor boundary 80", healthColor(80), "green");
eq("healthColor boundary 40", healthColor(40), "yellow");
eq("healthColor boundary 39", healthColor(39), "red");

eq("healthLabel healthy", healthLabel(90), "Healthy");
eq("healthLabel fair", healthLabel(50), "Fair");
eq("healthLabel struggling", healthLabel(20), "Struggling");

// ─── Relative Time ────────────────────────────────────────────

console.log("\n── Relative Time ──");

const now = Date.now();
assert("just now", relativeTime(String(now - 5000)).includes("s ago") || relativeTime(String(now - 5000)).includes("just now"));
assert("minutes ago", relativeTime(String(now - 120_000)).includes("m ago") || relativeTime(String(now - 120_000)).includes("min"));
assert("hours ago", relativeTime(String(now - 7_200_000)).includes("h ago") || relativeTime(String(now - 7_200_000)).includes("hour"));

// ─── Markdown Rendering ──────────────────────────────────────

console.log("\n── Markdown ──");

assert("h1", renderMarkdown("# Hello").includes("<h1>"));
assert("h2", renderMarkdown("## World").includes("<h2>"));
assert("code block", renderMarkdown("```\ncode\n```").includes("<pre") || renderMarkdown("```\ncode\n```").includes("<code"));
assert("bold", renderMarkdown("**bold**").includes("<strong>"));
assert("inline code", renderMarkdown("`code`").includes("<code>"));
assert("link", renderMarkdown("[link](http://x.com)").includes("href="));
assert("list item", renderMarkdown("- item").includes("<li>"));
assert("empty string", renderMarkdown("") !== undefined);

// ─── Diff ─────────────────────────────────────────────────────

console.log("\n── Diff ──");

const diff1 = computeLineDiff("a\nb\nc", "a\nB\nc");
assert("diff has entries for changed input", diff1.length > 0);
assert("diff has non-context entries for different lines", diff1.some(d => d.text === "b" || d.text === "B"));

const diff2 = computeLineDiff("same", "same");
assert("identical input produces single entry", diff2.length >= 1);
assert("identical input has no changed text", diff2.every(d => d.text === "same"));

const diff3 = computeLineDiff("", "new");
assert("adding content produces entries", diff3.length > 0);
assert("new content appears in diff", diff3.some(d => d.text === "new"));

const diff4 = computeLineDiff("old", "");
assert("removing content produces entries", diff4.length > 0);
assert("old content appears in diff", diff4.some(d => d.text === "old"));

// ─── Git URL Normalization ────────────────────────────────────

console.log("\n── Git URL Normalization ──");

eq("ssh shorthand", normalizeGitUrl("git@github.com:user/repo.git"), "github.com/user/repo");
eq("https", normalizeGitUrl("https://github.com/user/repo.git"), "github.com/user/repo");
eq("ssh protocol", normalizeGitUrl("ssh://git@github.com/user/repo.git"), "github.com/user/repo");
eq("git protocol", normalizeGitUrl("git://github.com/user/repo.git"), "github.com/user/repo");
eq("no .git suffix", normalizeGitUrl("git@github.com:user/repo"), "github.com/user/repo");
eq("trailing slash", normalizeGitUrl("https://github.com/user/repo/"), "github.com/user/repo");
eq("host lowercase", normalizeGitUrl("git@GitHub.COM:User/Repo.git"), "github.com/User/Repo");
eq("https with port", normalizeGitUrl("https://gitlab.example.com:8443/group/project.git"), "gitlab.example.com/group/project");

// ─── WS Protocol ──────────────────────────────────────────────

console.log("\n── WS Protocol ──");

eq("parse prompt", parseClientMessage('{"type":"prompt","text":"hello"}')?.type, "prompt");
eq("parse abort", parseClientMessage('{"type":"abort"}')?.type, "abort");
eq("parse compact", parseClientMessage('{"type":"compact"}')?.type, "compact");
eq("parse set_cwd", parseClientMessage('{"type":"set_cwd","cwd":"/tmp"}')?.type, "set_cwd");
eq("parse invalid json", parseClientMessage("not json"), null);
eq("parse empty", parseClientMessage(""), null);
eq("parse set_thinking", parseClientMessage('{"type":"set_thinking","level":"high"}')?.type, "set_thinking");

// ─── Util ─────────────────────────────────────────────────────

console.log("\n── Util ──");

assert("uuid format", /^[0-9a-f-]{36}$/.test(uuid()));
assert("uuid unique", uuid() !== uuid());
eq("trunc short", trunc("hello", 10), "hello");
assert("trunc long ends with truncated", trunc("hello world this is long", 20).endsWith("…[truncated]"));
assert("trunc exact length", trunc("12345", 5) === "12345");
assert("safeJsonSize number", safeJsonSize(42) > 0);
assert("safeJsonSize object", safeJsonSize({ a: 1, b: "hello" }) > 5);
assert("safeJsonSize null", safeJsonSize(null) >= 0);

// ─── Sampling ─────────────────────────────────────────────────

console.log("\n── Sampling ──");

// shouldCapture requires (key, deltaLen, rawEvent) — test the return shape
const sc1 = shouldCapture("message_update", 10);
assert("shouldCapture returns object", sc1 !== null && typeof sc1 === "object");
assert("shouldCapture has capture field", "capture" in sc1);
assert("shouldCapture has accumulatedLen", "accumulatedLen" in sc1);

const sc2 = shouldCapture("session_start", 0);
assert("session_start is captured", sc2.capture === true);

const flushed = flushSampler("message_update");
assert("flush returns object", flushed !== undefined);

// ─── Router ───────────────────────────────────────────────────

console.log("\n── Router ──");

// routeEvent requires (name, rawEvent, meta) — test with minimal args
const meta = { sessionId: "s1", seq: 1, ts: Date.now() };
assert("routes session_start", routeEvent("session_start", {}, meta) !== undefined);
assert("routes tool_call", routeEvent("tool_call", { toolName: "read", input: {} }, meta) !== undefined);
assert("unknown returns null", routeEvent("nonexistent_event_xyz", {}, meta) === null);
assert("ALL_EVENT_NAMES has entries", ALL_EVENT_NAMES.length > 10);

// ─── Decision JSON-LD ─────────────────────────────────────────

console.log("\n── Decision JSON-LD ──");

const dec = {
  _id: "dec:test-123",
  project_id: "proj:abc",
  session_id: "sess:xyz",
  ts: 1700000000000,
  task: "fix bug",
  what: "used retry",
  outcome: "failure" as const,
  why: "retry storm",
  files: '["src/a.ts"]',
  alternatives: "rewrite from scratch",
  agent: "worker",
  tags: '["architecture"]',
  jsonld: "",
};
const ld = buildDecisionJsonLd(dec);
const ldStr = JSON.stringify(ld);

assert("jsonld has @context", ldStr.includes("@context"));
assert("jsonld has @type", ldStr.includes("@type"));
assert("jsonld contains task value", ldStr.includes("fix bug"));
assert("jsonld contains outcome value", ldStr.includes("failure"));
assert("jsonld contains why value", ldStr.includes("retry storm"));
assert("jsonld contains file path", ldStr.includes("src/a.ts"));
assert("jsonld contains alternatives value", ldStr.includes("rewrite from scratch"));
assert("jsonld contains tag value", ldStr.includes("architecture"));
assert("jsonld contains agent name", ldStr.includes("worker"));
assert("jsonld is valid JSON object", typeof ld === "object" && ld !== null);

// Null optional fields should not appear in output
const dec2 = { ...dec, files: null, alternatives: null, tags: null, agent: null };
const ld2Str = JSON.stringify(buildDecisionJsonLd(dec2));
assert("null files excluded from output", !ld2Str.includes("src/a.ts"));
assert("null alternatives excluded from output", !ld2Str.includes("rewrite from scratch"));
assert("null tags excluded from output", !ld2Str.includes("architecture"));
assert("default agent used when null", ld2Str.includes("pi-agent"));

// ─── harness-ui Format Helpers ─────────────────────────────────

console.log("\n── harness-ui Format Helpers ──");

// escapeHtml
eq("escapeHtml basic", escapeHtml("<b>hi</b>"), "&lt;b&gt;hi&lt;/b&gt;");
eq("escapeHtml ampersand", escapeHtml("a & b"), "a &amp; b");
eq("escapeHtml quotes", escapeHtml('"hello"'), "&quot;hello&quot;");
eq("escapeHtml null", escapeHtml(null), "");
eq("escapeHtml undefined", escapeHtml(undefined), "");

// formatDate
assert("formatDate valid timestamp", formatDate(1700000000000) !== "—");
eq("formatDate invalid", formatDate("garbage"), "—");
eq("formatDate zero", formatDate(0), "—");

// formatDuration
assert("formatDuration ms", formatDuration(500).includes("ms"));
assert("formatDuration seconds", formatDuration(5000).includes("s"));
assert("formatDuration minutes", formatDuration(120000).includes("m"));
assert("formatDuration hours", formatDuration(7200000).includes("h"));
eq("formatDuration null", formatDuration(null), "—");
eq("formatDuration negative", formatDuration(-100), "—");
eq("formatDuration string", formatDuration("5000").includes("s"), true);

// formatNumber
assert("formatNumber millions", formatNumber(1500000).includes("M"));
assert("formatNumber thousands", formatNumber(5000).includes("K"));
eq("formatNumber small", formatNumber(42), "42");

// healthColor (harness-ui version — boolean)
eq("uiHealthColor ok", uiHealthColor(true), "#238636");
eq("uiHealthColor down", uiHealthColor(false), "#da3633");

// relativeTime (harness-ui version)
const nowTs = Date.now();
assert("uiRelativeTime recent", uiRelativeTime(nowTs - 5000).includes("s ago") || uiRelativeTime(nowTs - 5000).includes("just now"));
eq("uiRelativeTime invalid", uiRelativeTime("garbage"), "—");

// truncate
eq("truncate short", truncate("hello", 80), "hello");
assert("truncate long", truncate("a".repeat(100), 50).endsWith("..."));
assert("truncate long length", truncate("a".repeat(100), 50).length <= 50);

// ─── harness-ui Health ────────────────────────────────────────

console.log("\n── harness-ui Health ──");

const uiPerfect = uiComputeHealthScore({ errorRate: 0, turnCount: 1, maxPayloadBytes: 0, durationMs: 0 });
const uiWorst = uiComputeHealthScore({ errorRate: 1, turnCount: 50, maxPayloadBytes: 1_000_000, durationMs: 5_000_000 });
assert("ui health perfect > worst", uiPerfect > uiWorst);
assert("ui health range 0-100", uiPerfect >= 0 && uiPerfect <= 100);
eq("ui healthColor2 high", uiHealthColor2(85), "green");
eq("ui healthColor2 mid", uiHealthColor2(50), "yellow");
eq("ui healthColor2 low", uiHealthColor2(30), "red");
eq("ui healthLabel high", uiHealthLabel(90), "Healthy");
eq("ui healthLabel mid", uiHealthLabel(50), "Fair");
eq("ui healthLabel low", uiHealthLabel(20), "Struggling");

// ─── Badge Component ──────────────────────────────────────────

console.log("\n── Badge Component ──");

assert("badge contains status text", badge("active").includes("active"));
assert("badge has span", badge("active").includes("<span"));
assert("badge unknown status has fallback", badge("xyz_unknown").includes("xyz_unknown"));
assert("badge escapes html", badge("<script>").includes("&lt;script&gt;"));

assert("healthDot ok green", healthDot(true).includes("#238636"));
assert("healthDot down red", healthDot(false).includes("#da3633"));
assert("healthDot custom label", healthDot(true, "UP").includes("UP"));
assert("healthDot default label ok", healthDot(true).includes("healthy"));
assert("healthDot default label down", healthDot(false).includes("down"));

// ─── Table Component ─────────────────────────────────────────

console.log("\n── Table Component ──");

const cols = [{ key: "name", label: "Name" }, { key: "val", label: "Value" }];
const tableOut = renderTable(cols, [{ name: "Alice", val: 42 }]);
assert("table has thead", tableOut.includes("<thead>"));
assert("table has tbody", tableOut.includes("<tbody>"));
assert("table contains data", tableOut.includes("Alice"));
assert("table contains header", tableOut.includes("Name"));

const emptyTable = renderTable(cols, []);
assert("empty table shows message", emptyTable.includes("No data"));

const customEmpty = renderTable(cols, [], { emptyMessage: "Nothing here" });
assert("custom empty message", customEmpty.includes("Nothing here"));

const withRender = renderTable(
  [{ key: "x", label: "X", render: (v: any) => `<b>${v}</b>` }],
  [{ x: "bold" }]
);
assert("custom render function", withRender.includes("<b>bold</b>"));

// ─── SQL Helpers (existence) ──────────────────────────────────

console.log("\n── SQL Helpers ──");

assert("t is a function", typeof t === "function");
assert("n is a function", typeof n === "function");
assert("b is a function", typeof b === "function");

// ─── JSON-LD Context ─────────────────────────────────────────

console.log("\n── JSON-LD Context ──");

const pa = personAgent("Alice");
assert("personAgent has @type", "@type" in pa);
assert("personAgent has foaf:name", "foaf:name" in pa);
eq("personAgent name value", pa["foaf:name"], "Alice");

const sa = softwareAgent("bot");
assert("softwareAgent has @type", "@type" in sa);

assert("piId returns urn", piId("test:123").startsWith("urn:pi:"));
assert("piRef returns @id object", piRef("test:123")["@id"].startsWith("urn:pi:"));
assert("xsdLong has @value", xsdLong(42)["@value"] === "42");
assert("xsdBool has @value", xsdBool(true)["@value"] === "true");

// ─── Event Logger Format ─────────────────────────────────────

console.log("\n── Event Logger Format ──");

const fakeRow: any = {
  _id: "ev:test-1",
  event_name: "tool_call",
  category: "tool",
  can_intercept: false,
  seq: "5",
  ts: "1700000000000",
  session_id: "sess:abc",
  cwd: "/tmp",
  tool_name: "read",
  tool_input: '{"path":"/tmp/foo.ts"}',
};

const compact = compactEvent(fakeRow);
assert("compactEvent has eventName", "eventName" in compact);
assert("compactEvent has fields", "fields" in compact);

const displayFields = getDisplayFields(fakeRow);
assert("getDisplayFields returns object", typeof displayFields === "object");
// tool_call should have tool_name in display
assert("getDisplayFields tool_call has tool_name", Object.keys(displayFields).some(k => k.includes("tool") || k.includes("name") || displayFields[k]?.includes("read")));

const populated = getPopulatedFields(fakeRow);
assert("getPopulatedFields excludes core keys", !("_id" in populated));
assert("getPopulatedFields excludes event_name", !("event_name" in populated));
assert("getPopulatedFields includes custom fields", "tool_name" in populated);

const emptyRow: any = { _id: "ev:x", event_name: "unknown_event", category: "misc", can_intercept: false, seq: "1", ts: "0", session_id: null, cwd: null };
const emptyFields = getDisplayFields(emptyRow);
assert("getDisplayFields unknown event returns empty", Object.keys(emptyFields).length === 0);

const popEmpty = getPopulatedFields({ _id: "ev:x", event_name: "x", category: "a", can_intercept: false, seq: "1", ts: "0", session_id: null, cwd: null } as any);
assert("getPopulatedFields all-null returns empty", Object.keys(popEmpty).length === 0);

// ─── Diff Rendering ──────────────────────────────────────────

console.log("\n── Diff Rendering ──");

const diffLines = computeLineDiff("a\nb", "a\nB");
const diffHtml = renderDiffHtml(diffLines);
assert("renderDiffHtml has summary", diffHtml.includes("diff-summary"));
assert("renderDiffHtml has add class", diffHtml.includes("diff-add") || diffHtml.includes("diff-remove"));
assert("renderDiffHtml escapes html", renderDiffHtml([{ type: "add", text: "<script>" }]).includes("&lt;script&gt;"));

const emptyDiffHtml = renderDiffHtml([]);
assert("renderDiffHtml empty has summary", emptyDiffHtml.includes("+0 / -0"));

// ─── Knowledge Markdown ──────────────────────────────────────

console.log("\n── Knowledge Markdown ──");

const knowledge = {
  filesModified: ["src/a.ts", "src/b.ts"],
  toolUsage: { read: 5, write: 3 },
  errorCount: 2,
  turnCount: 4,
  bashCommands: ["npm test", "git status"],
  durationMs: 120_000,
  eventCount: 50,
};
const md = generateKnowledgeMarkdown("user/session-abc", knowledge);
assert("knowledge md has title", md.includes("# Session Summary"));
assert("knowledge md has session name", md.includes("session-abc"));
assert("knowledge md has files", md.includes("src/a.ts"));
assert("knowledge md has tools table", md.includes("read") && md.includes("write"));
assert("knowledge md has bash commands", md.includes("npm test"));
assert("knowledge md has error count", md.includes("2"));

const emptyKnowledge = {
  filesModified: [],
  toolUsage: {},
  errorCount: 0,
  turnCount: 0,
  bashCommands: [],
  durationMs: 5000,
  eventCount: 0,
};
const emptyMd = generateKnowledgeMarkdown("sess:empty", emptyKnowledge);
assert("empty knowledge has no file mods message", emptyMd.includes("No file modifications"));
assert("empty knowledge has no bash message", emptyMd.includes("No bash commands"));

// ─── WS Protocol (send) ──────────────────────────────────────

console.log("\n── WS Protocol (send) ──");

assert("send is a function", typeof send === "function");
let sentData = "";
const mockWs = { send: (d: string) => { sentData = d; } };
send(mockWs, { type: "text_delta", text: "hello" });
assert("send serializes to JSON", sentData.includes("text_delta"));
assert("send includes payload", sentData.includes("hello"));
const parsed = JSON.parse(sentData);
eq("send type field", parsed.type, "text_delta");

// ─── Canary Config ────────────────────────────────────────────

console.log("\n── Canary Config ──");

const canaryConf = loadCanaryConfig();
assert("canary config has toolFailureRate", "toolFailureRate" in canaryConf);
assert("canary config has maxTurnsPerRun", "maxTurnsPerRun" in canaryConf);
assert("canary config has contextBloatBytes", "contextBloatBytes" in canaryConf);
assert("canary config has maxDurationMs", "maxDurationMs" in canaryConf);
assert("canary config has retryStormCount", "retryStormCount" in canaryConf);
assert("canary config has maxToolsPerTurn", "maxToolsPerTurn" in canaryConf);
assert("canary toolFailureRate is a number", typeof canaryConf.toolFailureRate === "number");
assert("canary maxTurnsPerRun is a number", typeof canaryConf.maxTurnsPerRun === "number");

// ─── Habit Config ─────────────────────────────────────────────

console.log("\n── Habit Config ──");

const habitConf = loadHabitConfig();
assert("habit config has thresholds", "thresholds" in habitConf);
assert("habit config has enabled", "enabled" in habitConf);
assert("habit thresholds has commitReminderEdits", "commitReminderEdits" in habitConf.thresholds);
assert("habit thresholds has testReminderEdits", "testReminderEdits" in habitConf.thresholds);
assert("habit thresholds has errorStreakCount", "errorStreakCount" in habitConf.thresholds);
assert("habit thresholds has freshStartBytes", "freshStartBytes" in habitConf.thresholds);
assert("habit thresholds has scopeCreepFiles", "scopeCreepFiles" in habitConf.thresholds);
assert("habit enabled is an object", typeof habitConf.enabled === "object");

// ─── Project Identity ─────────────────────────────────────────

console.log("\n── Project Identity ──");

const pid1 = projectId("git:github.com/user/repo");
assert("projectId returns non-empty string", typeof pid1 === "string" && pid1.length > 0);
assert("projectId starts with proj:", pid1.startsWith("proj:"));
const pid2 = projectId("git:github.com/user/repo");
eq("projectId is deterministic", pid1, pid2);
const pid3 = projectId("git:github.com/other/repo");
assert("projectId differs for different input", pid1 !== pid3);
assert("projectId hash portion is hex", /^proj:[0-9a-f]+$/.test(pid1));

// ─── Agent Spawner ────────────────────────────────────────────

console.log("\n── Agent Spawner ──");

const agents = discoverAgents();
assert("discoverAgents returns array", Array.isArray(agents));
// agents may be empty if ~/.pi/agent/agents/ doesn't exist — that's fine

const formatted = formatAgentList([]);
assert("formatAgentList empty returns string", typeof formatted === "string");
assert("formatAgentList empty mentions no agents", formatted.toLowerCase().includes("no agent"));

const fakeAgents = [
  { name: "tester", description: "writes tests", systemPrompt: "test" },
  { name: "reviewer", description: "reviews code", systemPrompt: "review" },
];
const formattedList = formatAgentList(fakeAgents as any);
assert("formatAgentList includes agent names", formattedList.includes("tester") && formattedList.includes("reviewer"));
assert("formatAgentList includes descriptions", formattedList.includes("writes tests"));

// ─── Canary Metrics ───────────────────────────────────────────

console.log("\n── Canary Metrics ──");

const thresholds = loadCanaryConfig();

// computeToolFailureRate
const tfr0 = computeToolFailureRate([], thresholds);
assert("tfr empty has value/threshold/alert/message", "value" in tfr0 && "threshold" in tfr0 && "alert" in tfr0 && "message" in tfr0);
eq("tfr empty value is 0", tfr0.value, 0);
eq("tfr empty not alerting", tfr0.alert, false);

const tfrLow = computeToolFailureRate([{ is_error: false }, { is_error: false }, { is_error: true }], thresholds);
assert("tfr low rate is fraction", tfrLow.value > 0 && tfrLow.value < 1);

const tfrHigh = computeToolFailureRate(
  Array(10).fill({ is_error: true }),
  thresholds,
);
eq("tfr all errors rate is 1", tfrHigh.value, 1);
eq("tfr all errors alerts", tfrHigh.alert, true);
assert("tfr all errors has message", tfrHigh.message.length > 0);

// computeTurnInflation
const ti1 = computeTurnInflation(1, thresholds);
assert("turn inflation has fields", "value" in ti1 && "threshold" in ti1 && "alert" in ti1);
eq("turn inflation low not alerting", ti1.alert, false);

const ti100 = computeTurnInflation(100, thresholds);
eq("turn inflation high alerts", ti100.alert, true);
assert("turn inflation high has message", ti100.message.length > 0);

// computeContextBloat
const cb0 = computeContextBloat(0, thresholds);
eq("context bloat zero not alerting", cb0.alert, false);

const cbBig = computeContextBloat(10_000_000, thresholds);
eq("context bloat big alerts", cbBig.alert, true);
assert("context bloat big has message", cbBig.message.length > 0);

// computeDuration
const dur0 = computeDuration(0, thresholds);
eq("duration zero not alerting", dur0.alert, false);

const durLong = computeDuration(999_999_999, thresholds);
eq("duration long alerts", durLong.alert, true);
assert("duration long has message", durLong.message.length > 0);

// detectRetryStorm
const rsNone = detectRetryStorm([], thresholds);
assert("retry storm has fields", "detected" in rsNone && "tool" in rsNone && "consecutiveCount" in rsNone);
eq("retry storm empty not detected", rsNone.detected, false);

const rsStorm = detectRetryStorm(
  Array(5).fill({ tool_name: "read" }),
  thresholds,
);
eq("retry storm 5x same tool detected", rsStorm.detected, true);
eq("retry storm tool name", rsStorm.tool, "read");
assert("retry storm has message", rsStorm.message.length > 0);

const rsMixed = detectRetryStorm(
  [{ tool_name: "read" }, { tool_name: "write" }, { tool_name: "read" }],
  thresholds,
);
eq("retry storm mixed not detected", rsMixed.detected, false);

// computeToolDensity
const td1 = computeToolDensity(1, thresholds);
eq("tool density 1 not alerting", td1.alert, false);
const td100 = computeToolDensity(100, thresholds);
eq("tool density 100 alerts", td100.alert, true);

// ─── Habit Monitor ────────────────────────────────────────────

console.log("\n── Habit Monitor ──");

const hThresholds = loadHabitConfig().thresholds;

// checkCommitHabit
const ch0 = checkCommitHabit([], [], hThresholds);
assert("commit habit has fields", "name" in ch0 && "alert" in ch0 && "value" in ch0 && "threshold" in ch0 && "prompt" in ch0);
eq("commit habit no edits not alerting", ch0.alert, false);

const chMany = checkCommitHabit(
  Array(20).fill("write"),
  [],
  hThresholds,
);
eq("commit habit many edits alerts", chMany.alert, true);
assert("commit habit has prompt", chMany.prompt.length > 0);

const chAfterCommit = checkCommitHabit(
  ["write", "write"],
  ["git commit -m 'done'"],
  hThresholds,
);
eq("commit habit after commit not alerting", chAfterCommit.alert, false);

// checkTestHabit
const th0 = checkTestHabit([], [], hThresholds);
eq("test habit no edits not alerting", th0.alert, false);

const thMany = checkTestHabit(
  Array(20).fill("edit"),
  [],
  hThresholds,
);
eq("test habit many edits alerts", thMany.alert, true);

// checkErrorStreak
const es0 = checkErrorStreak([], hThresholds);
eq("error streak empty not alerting", es0.alert, false);

const esHigh = checkErrorStreak([true, true, true, true, true], hThresholds);
eq("error streak 5 alerts", esHigh.alert, true);

const esMixed = checkErrorStreak([true, true, false], hThresholds);
eq("error streak broken not alerting", esMixed.alert, false);

// checkScopeCreep
const sc0 = checkScopeCreep([], hThresholds);
eq("scope creep empty not alerting", sc0.alert, false);

const scMany = checkScopeCreep(
  Array(20).fill(0).map((_, i) => `file${i}.ts`),
  hThresholds,
);
eq("scope creep many files alerts", scMany.alert, true);

const scDupes = checkScopeCreep(
  Array(20).fill("same.ts"),
  hThresholds,
);
eq("scope creep duplicates not alerting", scDupes.alert, false);

// checkFreshStart
const fs0 = checkFreshStart(0, hThresholds);
eq("fresh start zero not alerting", fs0.alert, false);

const fsBig = checkFreshStart(10_000_000, hThresholds);
eq("fresh start big alerts", fsBig.alert, true);
assert("fresh start big has prompt", fsBig.prompt.length > 0);

// ─── Mutation Classification ──────────────────────────────────

console.log("\n── Mutation Classification ──");

eq("isMutation write true", isMutation("write", { path: "/a" }), true);
eq("isMutation edit true", isMutation("edit", { path: "/a" }), true);
eq("isMutation read false", isMutation("read", { path: "/a" }), false);
eq("isMutation grep false", isMutation("grep", { pattern: "x" }), false);
eq("isMutation bash rm true", isMutation("bash", { command: "rm -rf /tmp/foo" }), true);
eq("isMutation bash git commit true", isMutation("bash", { command: "git commit -m 'x'" }), true);
eq("isMutation bash ls false", isMutation("bash", { command: "ls -la" }), false);
eq("isMutation bash npm install true", isMutation("bash", { command: "npm install foo" }), true);
eq("isMutation unknown false", isMutation("custom_tool", {}), false);

// inputSummary
const isWrite = inputSummary("write", { path: "/tmp/foo.ts" });
assert("inputSummary write includes path", isWrite.includes("/tmp/foo.ts"));
const isBash = inputSummary("bash", { command: "echo hello world" });
assert("inputSummary bash includes command", isBash.includes("echo hello"));
const isOther = inputSummary("read", { path: "/a" });
assert("inputSummary other returns tool name", isOther === "read");

// ─── Projectors ───────────────────────────────────────────────

console.log("\n── Projectors ──");

const mockState = createRunState("sess:1", "task:1", "ev:input", { text: "fix the bug", source: "user" });

const taskRow = projectTask("proj:1", mockState);
assert("projectTask has _id", taskRow._id === "proj:1");
assert("projectTask has type", taskRow.type === "AgentTaskRequested");
assert("projectTask has session_id", taskRow.session_id === "sess:1");
assert("projectTask has prompt", taskRow.prompt === "fix the bug");
assert("projectTask has ts", typeof taskRow.ts === "number");

const reasoningRow = projectReasoning("proj:2", mockState, "ev:turn-end");
assert("projectReasoning has type", reasoningRow.type === "AgentReasoningTrace");
assert("projectReasoning has turn_end_event_id", reasoningRow.turn_end_event_id === "ev:turn-end");

const resultRow = projectResult("proj:3", mockState);
assert("projectResult has type", resultRow.type === "AgentResultProduced");
assert("projectResult has total_turns", typeof resultRow.total_turns === "number");

const changesNull = projectChanges("proj:4", mockState);
eq("projectChanges no mutations returns null", changesNull, null);

// With mutations
const stateWithMutation = accumulate(
  accumulate(mockState, "turn_start", "ev:ts", { turnIndex: 0 }),
  "tool_call",
  "ev:tc1",
  { toolName: "write", input: { path: "/a.ts" } },
);
const changesRow = projectChanges("proj:5", stateWithMutation!);
assert("projectChanges with mutations returns object", changesRow !== null);
assert("projectChanges has type", changesRow!.type === "ProjectStateChanged");
assert("projectChanges has mutating_tool_count", changesRow!.mutating_tool_count > 0);

// ─── Accumulator ──────────────────────────────────────────────

console.log("\n── Accumulator ──");

const rs = createRunState("sess:a", "task:a", "ev:in", { text: "hello", source: "cli" });
assert("createRunState has sessionId", rs.sessionId === "sess:a");
assert("createRunState has taskId", rs.taskId === "task:a");
assert("createRunState has prompt", rs.prompt === "hello");
assert("createRunState has inputSource", rs.inputSource === "cli");
assert("createRunState has turnIndex 0", rs.turnIndex === 0);
assert("createRunState has empty mutations", rs.mutations.length === 0);
assert("createRunState has empty reasoningTraceIds", rs.reasoningTraceIds.length === 0);

// accumulate null returns null
eq("accumulate null state returns null", accumulate(null, "turn_start", "ev:1", {}), null);

// accumulate turn_start
const afterTurn = accumulate(rs, "turn_start", "ev:ts1", { turnIndex: 0 });
assert("after turn_start turnIndex updated", afterTurn!.turnIndex === 0);
assert("after turn_start totalTurns updated", afterTurn!.totalTurns >= 1);

// accumulate tool_call
const afterTool = accumulate(afterTurn, "tool_call", "ev:tc1", { toolName: "read", input: { path: "/x" } });
assert("after tool_call has tool event id", afterTool!.currentTurn.toolCallEventIds.length === 1);
assert("after tool_call has tool summary", afterTool!.currentTurn.toolSummaries.length === 1);

// accumulate tool_call with mutation
const afterWrite = accumulate(afterTool, "tool_call", "ev:tc2", { toolName: "write", input: { path: "/y.ts" } });
assert("after write has mutation", afterWrite!.mutations.length === 1);
assert("mutation has toolName", afterWrite!.mutations[0].toolName === "write");

// accumulate tool_result
const afterResult = accumulate(afterWrite, "tool_result", "ev:tr1", { toolName: "write", toolCallId: "tc2" });
assert("after tool_result has result event id", afterResult!.currentTurn.toolResultEventIds.length === 1);

// ─── Error Capture ────────────────────────────────────────────

console.log("\n── Error Capture ──");

// captureError should not throw
let captureThrew = false;
try {
  captureError({
    component: "test-suite",
    operation: "test captureError",
    error: new Error("test error"),
    severity: "cosmetic",
  });
} catch {
  captureThrew = true;
}
eq("captureError does not throw", captureThrew, false);

// captureError with non-Error
let captureThrew2 = false;
try {
  captureError({
    component: "test-suite",
    operation: "test captureError string",
    error: "string error",
    severity: "transient",
  });
} catch {
  captureThrew2 = true;
}
eq("captureError handles string error", captureThrew2, false);

// unflushedErrorCount
const errCount = unflushedErrorCount();
assert("unflushedErrorCount returns number", typeof errCount === "number");
assert("unflushedErrorCount >= 0", errCount >= 0);

// ─── Summary ──────────────────────────────────────────────────

console.log(`\n━━━ Results: ${passed} passed, ${failed} failed ━━━`);
if (failures.length) { console.log("\nFailures:"); failures.forEach(f => console.log(`  • ${f}`)); }
process.exit(failed > 0 ? 1 : 0);
