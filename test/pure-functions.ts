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

// ─── Health Score ─────────────────────────────────────────────

console.log("\n── Health Score ──");

eq("perfect health", computeHealthScore({ errorRate: 0, turnCount: 1, maxPayloadBytes: 0, durationMs: 0 }), 100);
eq("50% errors halves error pts", computeHealthScore({ errorRate: 0.5, turnCount: 1, maxPayloadBytes: 0, durationMs: 0 }), 60);
assert("100% errors reduces significantly", computeHealthScore({ errorRate: 1, turnCount: 1, maxPayloadBytes: 0, durationMs: 0 }) <= 65);
assert("10+ turns reduces turn pts", computeHealthScore({ errorRate: 0, turnCount: 10, maxPayloadBytes: 0, durationMs: 0 }) <= 75);
assert("huge payload reduces context pts", computeHealthScore({ errorRate: 0, turnCount: 1, maxPayloadBytes: 500_000, durationMs: 0 }) <= 80);
assert("long session reduces duration pts", computeHealthScore({ errorRate: 0, turnCount: 1, maxPayloadBytes: 0, durationMs: 1_000_000 }) <= 85);
assert("worst case is 0", computeHealthScore({ errorRate: 1, turnCount: 50, maxPayloadBytes: 1_000_000, durationMs: 5_000_000 }) === 0);

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
assert("diff has changes", diff1.length > 0);
assert("diff detects modified line", diff1.some(d => d.type === "remove" || d.type === "add"));

const diff2 = computeLineDiff("same", "same");
assert("identical has no changes", diff2.every(d => d.type === "context"));

const diff3 = computeLineDiff("", "new");
assert("empty to content", diff3.some(d => d.type === "add"));

const diff4 = computeLineDiff("old", "");
assert("content to empty", diff4.some(d => d.type === "remove"));

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
const ld = buildDecisionJsonLd(dec) as any;

assert("jsonld has @context", ld["@context"] !== undefined);
assert("jsonld has @type", ld["@type"] === "prov:Activity");
eq("jsonld task", ld["ev:task"], "fix bug");
eq("jsonld outcome", ld["ev:outcome"], "failure");
assert("jsonld has files", Array.isArray(ld["ev:files"]));
eq("jsonld alternatives", ld["ev:alternatives"], "rewrite from scratch");
assert("jsonld has tags", Array.isArray(ld["ev:tags"]));
eq("jsonld agent", ld["prov:wasAssociatedWith"]["foaf:name"], "worker");

// No files/alternatives/tags → fields absent
const dec2 = { ...dec, files: null, alternatives: null, tags: null, agent: null };
const ld2 = buildDecisionJsonLd(dec2) as any;
assert("jsonld no files when null", ld2["ev:files"] === undefined);
assert("jsonld no alternatives when null", ld2["ev:alternatives"] === undefined);
assert("jsonld no tags when null", ld2["ev:tags"] === undefined);
eq("jsonld default agent", ld2["prov:wasAssociatedWith"]["foaf:name"], "pi-agent");

// ─── Summary ──────────────────────────────────────────────────

console.log(`\n━━━ Results: ${passed} passed, ${failed} failed ━━━`);
if (failures.length) { console.log("\nFailures:"); failures.forEach(f => console.log(`  • ${f}`)); }
process.exit(failed > 0 ? 1 : 0);
