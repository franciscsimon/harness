// ─── Deterministic Quality Checks (Pure Functions) ────────────────
// Each check takes code/file content and returns violations.
// Pattern: Habit Hooks — "deterministic scripts that detect triggers"

export interface Violation {
  check: string;
  severity: "block" | "warn";
  message: string;
  file?: string;
  line?: number;
}

// ── Comment Detector ──────────────────────────────────────────────
// "Almost impossible to get AI to stop commenting code"
export function detectComments(filename: string, content: string): Violation[] {
  const violations: Violation[] = [];
  const lines = content.split("\n");
  const ext = filename.split(".").pop() ?? "";

  if (!["ts", "js", "tsx", "jsx", "py", "java", "go", "rs"].includes(ext)) return [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip shebang, eslint directives, type annotations, TODOs
    if (line.startsWith("#!")) continue;
    if (/eslint-disable|@ts-|prettier-ignore|istanbul ignore|c8 ignore/.test(line)) continue;
    if (/^\s*\/\/\s*(TODO|FIXME|HACK|NOTE|XXX|WARN):/.test(lines[i])) continue;
    // Skip JSDoc
    if (line.startsWith("/**") || line.startsWith("*") || line.startsWith("*/")) continue;

    // Detect inline comments that explain what code does (not why)
    if (/^\s*\/\/\s*[A-Z]/.test(lines[i]) && !/^\s*\/\/\s*(TODO|FIXME|NOTE)/.test(lines[i])) {
      violations.push({
        check: "comments",
        severity: "warn",
        message: `Code comment detected. Prefer expressive self-documenting names. Remove or convert to a meaningful function/variable name.`,
        file: filename,
        line: i + 1,
      });
    }
  }
  return violations;
}

// ── File Size Check ───────────────────────────────────────────────
export function detectLargeFile(filename: string, content: string, maxLines = 300): Violation[] {
  const lines = content.split("\n").length;
  if (lines > maxLines) {
    return [{
      check: "file-size",
      severity: "warn",
      message: `File has ${lines} lines (max ${maxLines}). Split into smaller, focused modules.`,
      file: filename,
    }];
  }
  return [];
}

// ── Function Size Check ───────────────────────────────────────────
export function detectLargeFunctions(filename: string, content: string, maxLines = 50): Violation[] {
  const violations: Violation[] = [];
  const lines = content.split("\n");
  let funcStart = -1;
  let funcName = "";
  let braceDepth = 0;
  let inFunc = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect function declarations
    const funcMatch = line.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*\(.*\)\s*(?::\s*\w+)?\s*\{)/);
    if (funcMatch && !inFunc) {
      funcName = funcMatch[1] ?? funcMatch[2] ?? funcMatch[3] ?? "anonymous";
      funcStart = i;
      braceDepth = 0;
      inFunc = true;
    }

    if (inFunc) {
      for (const ch of line) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }

      if (braceDepth <= 0 && funcStart >= 0) {
        const funcLines = i - funcStart + 1;
        if (funcLines > maxLines) {
          violations.push({
            check: "function-size",
            severity: "warn",
            message: `Function "${funcName}" is ${funcLines} lines (max ${maxLines}). Analyze responsibilities and split.`,
            file: filename,
            line: funcStart + 1,
          });
        }
        inFunc = false;
        funcStart = -1;
      }
    }
  }
  return violations;
}

// ── Duplication Detector ──────────────────────────────────────────
export function detectDuplication(filename: string, content: string, minBlockSize = 4): Violation[] {
  const lines = content.split("\n").map((l) => l.trim()).filter((l) => l.length > 5);
  const seen = new Map<string, number>();
  const violations: Violation[] = [];

  for (let i = 0; i <= lines.length - minBlockSize; i++) {
    const block = lines.slice(i, i + minBlockSize).join("\n");
    const prev = seen.get(block);
    if (prev !== undefined && Math.abs(i - prev) >= minBlockSize) {
      violations.push({
        check: "duplication",
        severity: "warn",
        message: `Duplicate code block (${minBlockSize} lines) found at lines ~${prev + 1} and ~${i + 1}. Extract common logic.`,
        file: filename,
        line: i + 1,
      });
      // Skip ahead to avoid reporting overlapping blocks
      i += minBlockSize - 1;
    } else {
      seen.set(block, i);
    }
  }
  return violations;
}

// ── Dead Export Detector (simple) ─────────────────────────────────
export function detectUnusedExports(filename: string, content: string, allContent: string): Violation[] {
  const violations: Violation[] = [];
  const exportMatches = content.matchAll(/export\s+(?:function|const|let|var|class|type|interface)\s+(\w+)/g);

  for (const match of exportMatches) {
    const name = match[1];
    // Count occurrences in all content (excluding the definition itself)
    const regex = new RegExp(`\\b${name}\\b`, "g");
    const allOccurrences = (allContent.match(regex) ?? []).length;
    const selfOccurrences = (content.match(regex) ?? []).length;

    if (allOccurrences <= selfOccurrences) {
      violations.push({
        check: "dead-code",
        severity: "warn",
        message: `Exported "${name}" appears unused outside this file. Remove if dead code.`,
        file: filename,
      });
    }
  }
  return violations;
}

// ── Git Diff Size Check ──────────────────────────────────────────
export function checkDiffSize(diffStat: string, maxChangedFiles = 10, maxChangedLines = 300): Violation[] {
  const fileMatch = diffStat.match(/(\d+) files? changed/);
  const insertMatch = diffStat.match(/(\d+) insertions?\(\+\)/);
  const deleteMatch = diffStat.match(/(\d+) deletions?\(-\)/);

  const files = Number(fileMatch?.[1] ?? 0);
  const inserts = Number(insertMatch?.[1] ?? 0);
  const deletes = Number(deleteMatch?.[1] ?? 0);
  const totalLines = inserts + deletes;

  const violations: Violation[] = [];
  if (files > maxChangedFiles) {
    violations.push({
      check: "diff-size",
      severity: "warn",
      message: `${files} files changed (max ${maxChangedFiles}). Commit smaller incremental changes.`,
    });
  }
  if (totalLines > maxChangedLines) {
    violations.push({
      check: "diff-size",
      severity: "warn",
      message: `${totalLines} lines changed (max ${maxChangedLines}). Break into smaller commits with passing tests.`,
    });
  }
  return violations;
}

// ── Run all checks on a file ─────────────────────────────────────
export function runFileChecks(filename: string, content: string, allContent = ""): Violation[] {
  return [
    ...detectComments(filename, content),
    ...detectLargeFile(filename, content),
    ...detectLargeFunctions(filename, content),
    ...detectDuplication(filename, content),
    ...(allContent ? detectUnusedExports(filename, content, allContent) : []),
  ];
}
