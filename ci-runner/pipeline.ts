// ─── Pipeline Resolver ───────────────────────────────────────────
// Determines what steps to run for a given codebase.
//
// Priority:
//   1. .ci.jsonld in repo root (explicit pipeline — already in the graph)
//   2. Auto-detect from language stack (generates JSON-LD on the fly)
//
// The .ci.jsonld format is native JSON-LD — no YAML, no translation.
// The pipeline config IS a graph node. It links to steps, images,
// and tools. When stored in XTDB, it's queryable: "which repos use
// Biome?", "which repos have no CI?", "what steps does repo X run?"
//
// Example .ci.jsonld:
//
//   {
//     "@context": {
//       "schema": "https://schema.org/",
//       "code": "https://pi.dev/code/"
//     },
//     "@type": "code:Pipeline",
//     "schema:name": "harness CI",
//     "code:steps": [
//       {
//         "@type": "code:PipelineStep",
//         "schema:name": "check",
//         "code:image": "oven/bun:latest",
//         "code:commands": [
//           "bun install --frozen-lockfile",
//           "npx biome ci ."
//         ]
//       },
//       {
//         "@type": "code:PipelineStep",
//         "schema:name": "test",
//         "code:image": "oven/bun:latest",
//         "code:commands": ["bun test"]
//       }
//     ]
//   }

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface PipelineStep {
  name: string;
  image: string;
  commands: string[];
}

// ─── Main resolver ───────────────────────────────────────────────

export async function resolveSteps(workDir: string): Promise<PipelineStep[]> {
  // 1. Check for explicit .ci.jsonld
  const ciFile = findCIConfig(workDir);
  if (ciFile) {
    return parseCIJsonLd(ciFile);
  }

  // 2. Auto-detect from codebase
  return autoDetectSteps(workDir);
}

// Also export the full JSON-LD pipeline (for storing in XTDB)
export function resolvePipelineJsonLd(workDir: string, repo: string): object {
  const ciFile = findCIConfig(workDir);
  if (ciFile) {
    return JSON.parse(readFileSync(ciFile, "utf-8"));
  }

  // Auto-detected: generate JSON-LD
  const steps = autoDetectSteps(workDir);
  return stepsToJsonLd(steps, repo, "auto-detected");
}

// ─── Explicit JSON-LD config ─────────────────────────────────────

function findCIConfig(workDir: string): string | null {
  const candidates = [".ci.jsonld", "ci.jsonld"];
  for (const name of candidates) {
    const path = join(workDir, name);
    if (existsSync(path)) return path;
  }
  return null;
}

function parseCIJsonLd(filePath: string): PipelineStep[] {
  const doc = JSON.parse(readFileSync(filePath, "utf-8"));
  const steps: PipelineStep[] = [];

  // Handle both single pipeline and array of steps
  const rawSteps = doc["code:steps"] ?? doc.steps ?? [];

  for (const step of rawSteps) {
    steps.push({
      name: step["schema:name"] ?? step.name ?? "unnamed",
      image: step["code:image"] ?? step.image ?? "alpine:latest",
      commands: step["code:commands"] ?? step.commands ?? [],
    });
  }

  return steps;
}

// ─── Convert steps to JSON-LD ────────────────────────────────────

export function stepsToJsonLd(steps: PipelineStep[], repo: string, source: string): object {
  return {
    "@context": {
      schema: "https://schema.org/",
      code: "https://pi.dev/code/",
      prov: "http://www.w3.org/ns/prov#",
    },
    "@type": "code:Pipeline",
    "schema:name": `CI: ${repo}`,
    "code:repo": repo,
    "code:source": source,
    "code:steps": steps.map((s) => ({
      "@type": "code:PipelineStep",
      "schema:name": s.name,
      "code:image": s.image,
      "code:commands": s.commands,
    })),
  };
}

// ─── Auto-detection ──────────────────────────────────────────────

function autoDetectSteps(workDir: string): PipelineStep[] {
  const steps: PipelineStep[] = [];
  const files = listTopLevelFiles(workDir);

  // ── TypeScript / JavaScript ─────────────────────────────────
  if (files.includes("package.json")) {
    const hasBiome = files.includes("biome.json");
    const hasBunLock = files.includes("bun.lockb");
    const installCmd = hasBunLock ? "bun install --frozen-lockfile" : "npm ci";
    const image = hasBunLock ? "oven/bun:latest" : "node:22-slim";

    if (hasBiome) {
      steps.push({
        name: "check",
        image,
        commands: [installCmd, "npx biome ci ."],
      });
    }

    try {
      const pkg = JSON.parse(readFileSync(join(workDir, "package.json"), "utf-8"));
      if (pkg.scripts?.test) {
        steps.push({
          name: "test",
          image,
          commands: [installCmd, hasBunLock ? "bun test" : "npm test"],
        });
      }
    } catch {
      /* no package.json or parse error */
    }

    if (files.includes("tsconfig.json")) {
      steps.push({
        name: "typecheck",
        image,
        commands: [installCmd, "npx tsc --noEmit"],
      });
    }
  }

  // ── Go ──────────────────────────────────────────────────────
  if (files.includes("go.mod")) {
    steps.push({
      name: "check",
      image: "golang:1.23",
      commands: ['test -z "$(gofmt -l . | tee /dev/stderr)"', "go vet ./..."],
    });
    steps.push({
      name: "test",
      image: "golang:1.23",
      commands: ["go test -race -timeout 120s ./..."],
    });
  }

  // ── Rust ────────────────────────────────────────────────────
  if (files.includes("Cargo.toml")) {
    steps.push({
      name: "check",
      image: "rust:1.80",
      commands: ["cargo fmt -- --check", "cargo clippy -- -D warnings"],
    });
    steps.push({
      name: "test",
      image: "rust:1.80",
      commands: ["cargo test"],
    });
  }

  // ── Python ──────────────────────────────────────────────────
  if (files.includes("pyproject.toml") || files.includes("requirements.txt") || files.includes("setup.py")) {
    if (files.includes("pyproject.toml")) {
      steps.push({
        name: "check",
        image: "python:3.12-slim",
        commands: ["pip install ruff --quiet", "ruff check .", "ruff format --check ."],
      });
    }
    steps.push({
      name: "test",
      image: "python:3.12-slim",
      commands: [
        "pip install -r requirements.txt --quiet 2>/dev/null || pip install -e '.[test]' --quiet 2>/dev/null || true",
        "python -m pytest -x --tb=short 2>/dev/null || python -m unittest discover -s tests 2>/dev/null || echo 'No tests found'",
      ],
    });
  }

  // ── Elixir ──────────────────────────────────────────────────
  if (files.includes("mix.exs")) {
    steps.push({
      name: "check",
      image: "elixir:1.17",
      commands: ["mix deps.get", "mix format --check-formatted", "mix credo --strict 2>/dev/null || true"],
    });
    steps.push({
      name: "test",
      image: "elixir:1.17",
      commands: ["mix deps.get", "mix test"],
    });
  }

  // ── Shell scripts ───────────────────────────────────────────
  const shellFiles = files.filter((f) => f.endsWith(".sh"));
  if (shellFiles.length > 0 && steps.length === 0) {
    steps.push({
      name: "shellcheck",
      image: "koalaman/shellcheck-alpine:stable",
      commands: [`shellcheck ${shellFiles.join(" ")}`],
    });
  }

  // ── Fallback ────────────────────────────────────────────────
  if (steps.length === 0) {
    steps.push({
      name: "info",
      image: "alpine:latest",
      commands: [
        "echo 'No .ci.jsonld found and language not auto-detected.'",
        "echo 'Create a .ci.jsonld in your repo root to define CI steps.'",
        "ls -la",
      ],
    });
  }

  return steps;
}

function listTopLevelFiles(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
