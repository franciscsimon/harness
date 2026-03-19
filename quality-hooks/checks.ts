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

// ── Test Quality Check ────────────────────────────────────────────
// Detect implementation-coupled test patterns.
// Tests should assert on requirements via public interfaces, not internals.
export function detectBadTestPatterns(filename: string, content: string): Violation[] {
  if (!isTestFile(filename)) return [];
  const violations: Violation[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ln = i + 1;

    // Raw SQL in test files — tests should go through the public API, not bypass it
    const prevLine = i > 0 ? lines[i - 1] : "";
    if (/\bsql`\s*(INSERT|SELECT|UPDATE|DELETE)\b/i.test(line) && !/seed|setup|teardown|cleanup|before|after/i.test(line) && !/seed|setup|teardown|cleanup|before|after/i.test(prevLine)) {
      violations.push({
        check: "test-raw-sql",
        severity: "warn",
        message: "Test uses raw SQL instead of the public API. Test through the function that consumers actually call (e.g. tool execute, HTTP endpoint, exported query function).",
        file: filename, line: ln,
      });
    }

    // Exact numeric assertions on computed scores/values — fragile to formula changes
    if (/\beq\(.*Score.*,\s*\d+\)/.test(line) || /toBe\(\d+\).*score/i.test(line) || /===\s*\d+.*score/i.test(line)) {
      violations.push({
        check: "test-exact-score",
        severity: "warn",
        message: "Test asserts an exact computed value. Assert relative behavior instead (e.g. 'healthy > unhealthy') so the test survives formula changes.",
        file: filename, line: ln,
      });
    }

    // Assertions on internal object shape (property names like "ev:", "prov:")
    if (/\["(ev|prov|foaf|xsd|rdf):/.test(line) && /assert|eq\(|expect|toBe|toEqual/.test(line)) {
      violations.push({
        check: "test-internal-schema",
        severity: "warn",
        message: "Test asserts on internal schema property names (JSON-LD namespaces). Assert on the requirement (e.g. 'output contains the task value') not the encoding.",
        file: filename, line: ln,
      });
    }

    // Testing private/unexported function signatures directly
    if (/\.type\s*===\s*["'](remove|add|context)["']/.test(line)) {
      violations.push({
        check: "test-internal-enum",
        severity: "warn",
        message: "Test asserts on internal enum/type values. If these are renamed, the test breaks even though behavior is unchanged. Assert on the observable outcome instead.",
        file: filename, line: ln,
      });
    }
  }

  return violations;
}

function isTestFile(filename: string): boolean {
  const f = filename.toLowerCase();
  return f.includes("test") || f.includes("spec") || f.includes(".test.") || f.includes(".spec.");
}

// ── Run all checks on a file ─────────────────────────────────────
export function runFileChecks(filename: string, content: string, allContent = ""): Violation[] {
  return [
    ...detectComments(filename, content),
    ...detectLargeFile(filename, content),
    ...detectLargeFunctions(filename, content),
    ...detectDuplication(filename, content),
    ...detectBadTestPatterns(filename, content),
    ...(allContent ? detectUnusedExports(filename, content, allContent) : []),
  ];
}
