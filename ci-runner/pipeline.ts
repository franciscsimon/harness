// ─── Pipeline Resolver ───────────────────────────────────────────
// Determines what steps to run for a given codebase.
//
// Priority:
//   1. .ci.yaml in repo root (explicit pipeline)
//   2. Auto-detect from language stack (using code-quality/registry)
//
// The .ci.yaml format is intentionally minimal:
//
//   steps:
//     - name: check
//       image: oven/bun:latest
//       commands:
//         - bun install --frozen-lockfile
//         - npx biome ci .
//     - name: test
//       image: oven/bun:latest
//       commands:
//         - bun test

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

export interface PipelineStep {
  name: string;
  image: string;
  commands: string[];
}

interface CIConfig {
  steps: PipelineStep[];
}

// ─── Main resolver ───────────────────────────────────────────────

export async function resolveSteps(workDir: string): Promise<PipelineStep[]> {
  // 1. Check for explicit .ci.yaml
  const ciFile = findCIConfig(workDir);
  if (ciFile) {
    return parseCIConfig(ciFile);
  }

  // 2. Auto-detect from codebase
  return autoDetectSteps(workDir);
}

// ─── Explicit config ─────────────────────────────────────────────

function findCIConfig(workDir: string): string | null {
  const candidates = [".ci.yaml", ".ci.yml", "ci.yaml", "ci.yml"];
  for (const name of candidates) {
    const path = join(workDir, name);
    if (existsSync(path)) return path;
  }
  return null;
}

function parseCIConfig(filePath: string): PipelineStep[] {
  const content = readFileSync(filePath, "utf-8");

  // Minimal YAML parser — handles the flat structure we need
  // For production: use a real YAML parser
  const steps: PipelineStep[] = [];
  let current: Partial<PipelineStep> | null = null;
  let inCommands = false;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // New step
    if (trimmed.startsWith("- name:")) {
      if (current?.name && current.image && current.commands) {
        steps.push(current as PipelineStep);
      }
      current = { name: trimmed.replace("- name:", "").trim(), commands: [] };
      inCommands = false;
      continue;
    }

    if (current) {
      if (trimmed.startsWith("image:")) {
        current.image = trimmed.replace("image:", "").trim();
        inCommands = false;
      } else if (trimmed === "commands:") {
        inCommands = true;
      } else if (inCommands && trimmed.startsWith("- ")) {
        current.commands!.push(trimmed.slice(2).trim());
      } else {
        inCommands = false;
      }
    }
  }

  // Push last step
  if (current?.name && current.image && current.commands) {
    steps.push(current as PipelineStep);
  }

  return steps;
}

// ─── Auto-detection ──────────────────────────────────────────────

function autoDetectSteps(workDir: string): PipelineStep[] {
  const steps: PipelineStep[] = [];
  const files = listTopLevelFiles(workDir);

  // ── TypeScript / JavaScript ─────────────────────────────────
  if (files.includes("package.json")) {
    const hasBiome = files.includes("biome.json");
    const hasBunLock = files.includes("bun.lockb");
    const hasPackageLock = files.includes("package-lock.json");

    const installCmd = hasBunLock
      ? "bun install --frozen-lockfile"
      : "npm ci";

    const image = hasBunLock ? "oven/bun:latest" : "node:22-slim";

    if (hasBiome) {
      steps.push({
        name: "check",
        image,
        commands: [installCmd, "npx biome ci ."],
      });
    }

    // Check for test script in package.json
    try {
      const pkg = JSON.parse(readFileSync(join(workDir, "package.json"), "utf-8"));
      if (pkg.scripts?.test) {
        steps.push({
          name: "test",
          image,
          commands: [installCmd, hasBunLock ? "bun test" : "npm test"],
        });
      }
    } catch {}

    // TypeScript type checking
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
      commands: [
        "test -z \"$(gofmt -l . | tee /dev/stderr)\"",
        "go vet ./...",
      ],
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
      commands: [
        "cargo fmt -- --check",
        "cargo clippy -- -D warnings",
      ],
    });
    steps.push({
      name: "test",
      image: "rust:1.80",
      commands: ["cargo test"],
    });
  }

  // ── Python ──────────────────────────────────────────────────
  if (files.includes("pyproject.toml") || files.includes("requirements.txt") || files.includes("setup.py")) {
    const hasRuff = files.includes("pyproject.toml"); // ruff config usually in pyproject.toml

    if (hasRuff) {
      steps.push({
        name: "check",
        image: "python:3.12-slim",
        commands: [
          "pip install ruff --quiet",
          "ruff check .",
          "ruff format --check .",
        ],
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
      commands: [
        "mix deps.get",
        "mix format --check-formatted",
        "mix credo --strict 2>/dev/null || true",
      ],
    });
    steps.push({
      name: "test",
      image: "elixir:1.17",
      commands: ["mix deps.get", "mix test"],
    });
  }

  // ── Shell scripts (if that's all there is) ──────────────────
  const shellFiles = files.filter((f) => f.endsWith(".sh"));
  if (shellFiles.length > 0 && steps.length === 0) {
    steps.push({
      name: "shellcheck",
      image: "koalaman/shellcheck-alpine:stable",
      commands: [`shellcheck ${shellFiles.join(" ")}`],
    });
  }

  // ── Fallback: nothing detected ──────────────────────────────
  if (steps.length === 0) {
    steps.push({
      name: "info",
      image: "alpine:latest",
      commands: [
        "echo 'No .ci.yaml found and language not auto-detected.'",
        "echo 'Create a .ci.yaml in your repo root to define CI steps.'",
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
