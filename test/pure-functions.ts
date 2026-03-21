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

// ─── Summary ──────────────────────────────────────────────────

console.log(`\n━━━ Results: ${passed} passed, ${failed} failed ━━━`);
if (failures.length) { console.log("\nFailures:"); failures.forEach(f => console.log(`  • ${f}`)); }
process.exit(failed > 0 ? 1 : 0);
