#!/usr/bin/env npx jiti
// ─── Post-Deploy Smoke Test ────────────────────────────────────
// Verifies all harness resources are deployed and loadable by pi.
// Run: cd ~/harness/test && npx jiti smoke-test.ts
// No XTDB or UI required — checks filesystem only.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.HOME ?? "~";
const PI_AGENT = join(HOME, ".pi", "agent");
const EXT_DIR = join(PI_AGENT, "extensions");
const AGENTS_DIR = join(PI_AGENT, "agents");
const PROMPTS_DIR = join(PI_AGENT, "prompts");
const SKILLS_DIR = join(PI_AGENT, "skills");
const REPO = join(HOME, "harness");

let _passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(_name: string) {
  _passed++;
}
function fail(name: string, reason: string) {
  failed++;
  failures.push(`${name}: ${reason}`);
}
function assert(cond: boolean, name: string, reason: string) {
  cond ? ok(name) : fail(name, reason);
}

// Build expected list from repo: dirs with index.ts + package.json declaring pi.extensions
const repoExtensions: string[] = [];
for (const name of readdirSync(REPO).sort()) {
  try {
    const dir = join(REPO, name);
    if (!statSync(dir).isDirectory()) continue;
    if (!(existsSync(join(dir, "index.ts")) && existsSync(join(dir, "package.json")))) continue;
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    if (pkg.pi?.extensions) repoExtensions.push(name);
  } catch {}
}

assert(repoExtensions.length >= 40, `Repo declares ${repoExtensions.length} extensions`, "expected >= 40");

const deployedExtensions = existsSync(EXT_DIR)
  ? readdirSync(EXT_DIR)
      .filter((f) => statSync(join(EXT_DIR, f)).isDirectory())
      .sort()
  : [];

assert(deployedExtensions.length >= 40, `Deployed ${deployedExtensions.length} extensions`, "expected >= 40");

// Check each repo extension is deployed with index.ts
const missingExt: string[] = [];
for (const ext of repoExtensions) {
  const idx = join(EXT_DIR, ext, "index.ts");
  if (!existsSync(idx)) missingExt.push(ext);
}
assert(missingExt.length === 0, "All repo extensions deployed", `missing: ${missingExt.join(", ")}`);

// Spot-check key extensions have loadable entry points
const criticalExtensions = [
  "agent-spawner",
  "role-loader",
  "quality-hooks",
  "chunker",
  "alignment-monitor",
  "decision-log",
  "xtdb-event-logger",
  "slop-detector",
  "jit-docs",
  "reference-docs",
  "semantic-zoom",
  "knowledge-checkpoint",
];
for (const ext of criticalExtensions) {
  const idx = join(EXT_DIR, ext, "index.ts");
  if (!existsSync(idx)) {
    fail(`Critical ext: ${ext}`, "index.ts missing");
    continue;
  }
  const content = readFileSync(idx, "utf8");
  assert(content.includes("export default function"), `${ext} has default export`, "missing default export");
}

// Check extensions that need npm deps have node_modules
const extWithDeps = [
  "agent-spawner",
  "decision-log",
  "xtdb-event-logger",
  "xtdb-projector",
  "artifact-tracker",
  "history-retrieval",
  "session-postmortem",
  "sunk-cost-detector",
  "canary-monitor",
];
for (const ext of extWithDeps) {
  const nm = join(EXT_DIR, ext, "node_modules");
  assert(existsSync(nm), `${ext} has node_modules`, "npm install missing");
}

const repoAgents = existsSync(join(REPO, "agents"))
  ? readdirSync(join(REPO, "agents"))
      .filter((f) => f.endsWith(".md"))
      .sort()
  : [];

assert(repoAgents.length >= 20, `Repo has ${repoAgents.length} agents`, "expected >= 20");

// Agents in ~/.pi/agent/agents/ (for delegate tool / agent-spawner)
const deployedAgents = existsSync(AGENTS_DIR)
  ? readdirSync(AGENTS_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort()
  : [];
assert(
  deployedAgents.length >= 20,
  `Deployed ${deployedAgents.length} agents to agents/`,
  `expected >= 20, got ${deployedAgents.length}`,
);

const missingAgents = repoAgents.filter((a) => !deployedAgents.includes(a));
assert(missingAgents.length === 0, "All agents deployed to agents/", `missing: ${missingAgents.join(", ")}`);

// Agents as prompt templates in ~/.pi/agent/prompts/ (for pi native discovery)
const deployedPrompts = existsSync(PROMPTS_DIR)
  ? readdirSync(PROMPTS_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort()
  : [];
assert(
  deployedPrompts.length >= 20,
  `Deployed ${deployedPrompts.length} prompt templates`,
  `expected >= 20, got ${deployedPrompts.length}`,
);

const missingPrompts = repoAgents.filter((a) => !deployedPrompts.includes(a));
assert(missingPrompts.length === 0, "All agents deployed as prompts", `missing: ${missingPrompts.join(", ")}`);

// Validate agent frontmatter (agent-spawner requires name + description)
for (const agent of repoAgents.slice(0, 5)) {
  const content = readFileSync(join(AGENTS_DIR, agent), "utf8");
  const hasFm = content.startsWith("---");
  const hasName = /^name:/m.test(content);
  const hasDesc = /^description:/m.test(content);
  const name = agent.replace(".md", "");
  assert(hasFm && hasName && hasDesc, `${name} has valid frontmatter`, "missing name/description");
}

const repoSkills = existsSync(join(REPO, "skills"))
  ? readdirSync(join(REPO, "skills"))
      .filter((f) => {
        try {
          return statSync(join(REPO, "skills", f)).isDirectory();
        } catch {
          return false;
        }
      })
      .sort()
  : [];

assert(repoSkills.length >= 10, `Repo has ${repoSkills.length} skills`, "expected >= 10");

const deployedSkills = existsSync(SKILLS_DIR)
  ? readdirSync(SKILLS_DIR)
      .filter((f) => {
        try {
          return statSync(join(SKILLS_DIR, f)).isDirectory();
        } catch {
          return false;
        }
      })
      .sort()
  : [];

assert(
  deployedSkills.length >= 10,
  `Deployed ${deployedSkills.length} skills`,
  `expected >= 10, got ${deployedSkills.length}`,
);

const missingSkills = repoSkills.filter((s) => !deployedSkills.includes(s));
assert(missingSkills.length === 0, "All skills deployed", `missing: ${missingSkills.join(", ")}`);

// Each skill must have SKILL.md
for (const skill of deployedSkills) {
  const skillMd = join(SKILLS_DIR, skill, "SKILL.md");
  assert(existsSync(skillMd), `${skill} has SKILL.md`, "missing");
}

// Every dir with index.ts should declare pi.extensions
let manifestMissing = 0;
for (const name of readdirSync(REPO).sort()) {
  try {
    const dir = join(REPO, name);
    if (!statSync(dir).isDirectory()) continue;
    if (!(existsSync(join(dir, "index.ts")) && existsSync(join(dir, "package.json")))) continue;
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    if (!pkg.pi?.extensions) {
      fail(`${name}/package.json`, "missing pi.extensions");
      manifestMissing++;
    }
  } catch {}
}
if (manifestMissing === 0) ok("All extension packages declare pi.extensions");

const taskfile = join(REPO, "Taskfile.yml");
if (existsSync(taskfile)) {
  const content = readFileSync(taskfile, "utf8");
  assert(content.includes("agents:deploy"), "Taskfile has agents:deploy", "missing");
  assert(content.includes("skills:deploy"), "Taskfile has skills:deploy", "missing");
  assert(content.includes("resources:deploy:all"), "Taskfile has resources:deploy:all", "missing");
  assert(content.includes("ext:deploy:all"), "Taskfile has ext:deploy:all", "missing");
} else {
  fail("Taskfile.yml", "not found");
}

if (failures.length > 0) {
  for (const _f of failures)
}

process.exit(failed > 0 ? 1 : 0);
