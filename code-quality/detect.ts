// ─── Codebase Stack Detection ────────────────────────────────────
// Scans a project directory to determine:
//   1. Which languages are used (by file extension)
//   2. Which build systems / package managers exist (by manifest files)
//   3. Which quality tools are already installed
//   4. Which quality tools are missing and should be added
//
// Usage:
//   import { detectStack } from "./detect.ts";
//   const report = await detectStack("/path/to/project");
//   console.log(report.languages);       // ["typescript", "shell"]
//   console.log(report.missing);         // [{ tool: "biome", ... }]
//   console.log(report.installed);       // [{ tool: "tsc", ... }]

import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { type LanguageToolchain, type QualityTool, REGISTRY } from "./registry.ts";

export interface StackReport {
  projectRoot: string;
  languages: DetectedLanguage[];
  manifests: string[];
  installed: InstalledTool[];
  missing: MissingTool[];
  recommendations: string[];
}

export interface DetectedLanguage {
  language: string;
  fileCount: number;
  percentage: number;
  toolchain: LanguageToolchain;
}

export interface InstalledTool {
  language: string;
  tool: string;
  role: string;
  configFound: boolean;
  configPath?: string;
}

export interface MissingTool {
  language: string;
  tool: QualityTool;
  priority: "required" | "recommended" | "optional";
}

// Files/dirs to skip during scanning
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  ".next",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  "vendor",
  ".gradle",
  "bin",
  "obj",
  ".terraform",
  ".zig-cache",
  "_build",
  "deps",
  "coverage",
  ".nyc_output",
  ".cache",
]);

const SKIP_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "Cargo.lock",
  "go.sum",
  "mix.lock",
  "Gemfile.lock",
  "composer.lock",
  "poetry.lock",
  "uv.lock",
]);

export async function detectStack(projectRoot: string): Promise<StackReport> {
  const extCounts = new Map<string, number>();
  const foundManifests: string[] = [];
  let totalFiles = 0;

  // ── 1. Walk the tree, count file extensions and find manifests ──
  walkDir(projectRoot, (_filePath, fileName) => {
    // Check for manifest files
    for (const tc of REGISTRY) {
      for (const manifest of tc.manifestFiles) {
        if (manifest.startsWith("*")) {
          if (fileName.endsWith(manifest.slice(1))) foundManifests.push(fileName);
        } else if (fileName === manifest) {
          foundManifests.push(fileName);
        }
      }
    }

    const ext = extname(fileName).toLowerCase();
    if (!ext && fileName === "Dockerfile") {
      extCounts.set("Dockerfile", (extCounts.get("Dockerfile") || 0) + 1);
      totalFiles++;
      return;
    }
    if (ext) {
      extCounts.set(ext, (extCounts.get(ext) || 0) + 1);
      totalFiles++;
    }
  });

  // ── 2. Map extensions to languages ─────────────────────────────
  const languageScores = new Map<string, { count: number; tc: LanguageToolchain }>();

  for (const [ext, count] of extCounts) {
    for (const tc of REGISTRY) {
      if (tc.extensions.some((e) => e === ext || e === ext.replace(".", ""))) {
        const existing = languageScores.get(tc.language);
        if (existing) {
          existing.count += count;
        } else {
          languageScores.set(tc.language, { count, tc });
        }
      }
    }
  }

  // Also detect from manifests (even if no source files yet)
  for (const manifest of foundManifests) {
    for (const tc of REGISTRY) {
      if (
        tc.manifestFiles.some((m) => {
          if (m.startsWith("*")) return manifest.endsWith(m.slice(1));
          return manifest === m;
        })
      ) {
        if (!languageScores.has(tc.language)) {
          languageScores.set(tc.language, { count: 0, tc });
        }
      }
    }
  }

  const languages: DetectedLanguage[] = [...languageScores.entries()]
    .map(([lang, { count, tc }]) => ({
      language: lang,
      fileCount: count,
      percentage: totalFiles > 0 ? Math.round((count / totalFiles) * 100) : 0,
      toolchain: tc,
    }))
    .sort((a, b) => b.fileCount - a.fileCount);

  // ── 3. Check which tools are already installed ─────────────────
  const installed: InstalledTool[] = [];
  const missing: MissingTool[] = [];

  for (const lang of languages) {
    for (const tool of lang.toolchain.tools) {
      const configPath = tool.config ? findConfig(projectRoot, tool.config) : undefined;
      const isInstalled = checkToolInstalled(tool, projectRoot);

      if (isInstalled || configPath) {
        installed.push({
          language: lang.language,
          tool: tool.name,
          role: tool.role,
          configFound: !!configPath,
          configPath,
        });
      } else {
        const priority = getPriority(tool, lang);
        missing.push({ language: lang.language, tool, priority });
      }
    }
  }

  // ── 4. Generate recommendations ────────────────────────────────
  const recommendations: string[] = [];

  // No quality tools at all?
  if (installed.length === 0 && languages.length > 0) {
    recommendations.push("No code quality tools detected. This codebase has zero automated quality enforcement.");
  }

  // Has source but no formatter?
  for (const lang of languages) {
    if (lang.fileCount === 0) continue;
    const hasFmt = installed.some((t) => t.language === lang.language && (t.role === "fmt" || t.role === "all-in-one"));
    if (!hasFmt) {
      const fmtTool = lang.toolchain.tools.find((t) => t.role === "fmt" || t.role === "all-in-one");
      if (fmtTool) {
        recommendations.push(`${lang.language}: No formatter. Install ${fmtTool.name}: ${fmtTool.install}`);
      }
    }

    // Has source but no linter?
    const hasLint = installed.some(
      (t) => t.language === lang.language && ["lint", "vet", "all-in-one"].includes(t.role),
    );
    if (!hasLint) {
      const lintTool = lang.toolchain.tools.find((t) => t.role === "lint" || t.role === "all-in-one");
      if (lintTool) {
        recommendations.push(`${lang.language}: No linter. Install ${lintTool.name}: ${lintTool.install}`);
      }
    }
  }

  // Missing required tools
  for (const m of missing.filter((m) => m.priority === "required")) {
    recommendations.push(`${m.language}: Missing ${m.tool.role} tool '${m.tool.name}'. ${m.tool.description}`);
  }

  return { projectRoot, languages, manifests: foundManifests, installed, missing, recommendations };
}

// ─── Helpers ──────────────────────────────────────────────────────

function walkDir(dir: string, callback: (filePath: string, fileName: string) => void) {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
    if (SKIP_FILES.has(entry)) continue;

    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      walkDir(fullPath, callback);
    } else if (stat.isFile()) {
      callback(fullPath, entry);
    }
  }
}

function findConfig(projectRoot: string, configName: string): string | undefined {
  const path = join(projectRoot, configName);
  if (existsSync(path)) return path;
  return undefined;
}

function checkToolInstalled(tool: QualityTool, projectRoot: string): boolean {
  // Check for config file presence
  if (tool.config && existsSync(join(projectRoot, tool.config))) return true;

  // Check for binary on PATH or in node_modules
  const binaryName = tool.name.split(" ")[0]; // "go vet" → "go", "cargo test" → "cargo"
  try {
    execSync(`which ${binaryName} 2>/dev/null || command -v ${binaryName} 2>/dev/null`, {
      stdio: "pipe",
      timeout: 3000,
    });
    return true;
  } catch {
    // Not on PATH
  }

  // Check node_modules/.bin for JS tools
  if (existsSync(join(projectRoot, "node_modules", ".bin", binaryName))) return true;

  return false;
}

function getPriority(tool: QualityTool, lang: DetectedLanguage): "required" | "recommended" | "optional" {
  // Formatter is always required — non-negotiable
  if (tool.role === "fmt" || tool.role === "all-in-one") return "required";
  // Linter is required for any language with >5 source files
  if ((tool.role === "lint" || tool.role === "vet") && lang.fileCount > 5) return "required";
  // Type checker is recommended
  if (tool.role === "typecheck") return "recommended";
  // Test runner is recommended
  if (tool.role === "test") return "recommended";
  return "optional";
}

// ─── CLI entry point ─────────────────────────────────────────────
// Run: bun run code-quality/detect.ts [path]

if (import.meta.main || process.argv[1]?.endsWith("detect.ts")) {
  const target = process.argv[2] || process.cwd();
  detectStack(target).then((report) => {
    if (report.languages.length === 0) {
      return;
    }
    for (const _lang of report.languages) {
    }

    if (report.installed.length > 0) {
      for (const t of report.installed) {
        const _cfg = t.configFound ? ` (config: ${t.configPath})` : "";
      }
    }

    if (report.missing.length > 0) {
      for (const m of report.missing) {
        const _icon = m.priority === "required" ? "🔴" : m.priority === "recommended" ? "🟡" : "⚪";
      }
    }

    if (report.recommendations.length > 0) {
      for (const _r of report.recommendations) {
      }
    }
  });
}
