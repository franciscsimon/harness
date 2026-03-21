/**
 * parse-call-graph.ts — Parse TypeScript AST into JSON-LD call graph
 *
 * Walks all .ts files in the harness project, extracts:
 * - Modules (files) as schema:SoftwareSourceCode
 * - Functions/methods as schema:DefinedTerm
 * - Call edges (code:calls) and import edges (schema:requires)
 *
 * Output: data/call-graph.jsonld
 *
 * Run: NODE_PATH=xtdb-projector/node_modules npx jiti scripts/parse-call-graph.ts
 */

import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "data", "call-graph.jsonld");

// Directories to skip
const SKIP_DIRS = new Set(["node_modules", ".git", "data", "dist", ".pi"]);

// ---- Collect all .ts files ----

function collectTsFiles(dir: string, rel = ""): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full, relPath));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      results.push(relPath);
    }
  }
  return results;
}

// ---- Types ----

interface ModuleNode {
  "@id": string;
  "@type": string;
  "schema:name": string;
  "code:filePath": string;
  "code:isTestFile"?: boolean;
  "schema:requires"?: { "@id": string }[];
  "code:exports"?: string[];
  "code:tests"?: { "@id": string }[];
}

interface FunctionNode {
  "@id": string;
  "@type": string;
  "schema:name": string;
  "code:definedIn": { "@id": string };
  "code:filePath": string;
  "code:line": number;
  "code:isAsync": boolean;
  "code:isExported": boolean;
  "code:isTestFunction"?: boolean;
  "code:parameters": number;
  "code:calls"?: { "@id": string }[];
  "code:tests"?: { "@id": string }[];
}

// ---- Resolve import path to relative file path ----

function resolveImport(importPath: string, fromFile: string): string | null {
  // Only handle relative imports
  if (!importPath.startsWith(".")) return null;

  const fromDir = path.dirname(fromFile);
  let resolved = path.posix.join(fromDir, importPath);

  // Strip .ts extension if present, then check variants
  resolved = resolved.replace(/\.ts$/, "");

  // Try: exact.ts, /index.ts
  const candidates = [`${resolved}.ts`, `${resolved}/index.ts`];
  for (const c of candidates) {
    if (allFiles.has(c)) return c;
  }

  // Maybe the import already has the right path
  if (allFiles.has(resolved)) return resolved;

  return null;
}

// ---- Test file detection ----

function isTestFile(filePath: string): boolean {
  return (
    filePath.startsWith("test/") ||
    filePath.endsWith(".test.ts") ||
    filePath.endsWith(".spec.ts") ||
    /\/test[-.]/.test(filePath)
  );
}

// ---- Extract functions and calls from a source file ----

function extractFromFile(filePath: string, source: ts.SourceFile) {
  const moduleId = `urn:pi:mod:${filePath}`;
  const imports: { "@id": string }[] = [];
  const exports: string[] = [];
  const functions: FunctionNode[] = [];

  // Track import name → module mapping for call resolution
  const importMap = new Map<string, string>(); // localName → moduleFilePath

  function visitNode(node: ts.Node) {
    // Import declarations
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const importPath = node.moduleSpecifier.text;
      const resolved = resolveImport(importPath, filePath);
      if (resolved) {
        const targetModId = `urn:pi:mod:${resolved}`;
        if (!imports.find((i) => i["@id"] === targetModId)) {
          imports.push({ "@id": targetModId });
        }
        // Map imported names to their source module
        if (node.importClause) {
          if (node.importClause.name) {
            importMap.set(node.importClause.name.text, resolved);
          }
          if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
            for (const spec of node.importClause.namedBindings.elements) {
              const localName = spec.name.text;
              const origName = spec.propertyName?.text ?? localName;
              importMap.set(localName, resolved + "#" + origName);
            }
          }
          if (node.importClause.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)) {
            importMap.set(node.importClause.namedBindings.name.text, resolved);
          }
        }
      }
    }

    // Function declarations
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const isExported = hasExportModifier(node);
      if (isExported) exports.push(name);

      const calls = collectCalls(node, filePath, importMap);
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

      functions.push({
        "@id": `urn:pi:fn:${filePath}#${name}`,
        "@type": "schema:DefinedTerm",
        "schema:name": name,
        "code:definedIn": { "@id": moduleId },
        "code:filePath": filePath,
        "code:line": line,
        "code:isAsync": hasAsyncModifier(node),
        "code:isExported": isExported,
        "code:parameters": node.parameters.length,
        ...(calls.length > 0 ? { "code:calls": calls } : {}),
      });
    }

    // Arrow functions assigned to const/let/var
    if (ts.isVariableStatement(node)) {
      const isExported = hasExportModifier(node);
      for (const decl of node.declarationList.declarations) {
        if (decl.name && ts.isIdentifier(decl.name) && decl.initializer) {
          const init = unwrapArrow(decl.initializer);
          if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
            const name = decl.name.text;
            if (isExported) exports.push(name);

            const calls = collectCalls(init, filePath, importMap);
            const line = source.getLineAndCharacterOfPosition(decl.getStart(source)).line + 1;

            functions.push({
              "@id": `urn:pi:fn:${filePath}#${name}`,
              "@type": "schema:DefinedTerm",
              "schema:name": name,
              "code:definedIn": { "@id": moduleId },
              "code:filePath": filePath,
              "code:line": line,
              "code:isAsync": hasAsyncModifier(init),
              "code:isExported": isExported,
              "code:parameters": init.parameters.length,
              ...(calls.length > 0 ? { "code:calls": calls } : {}),
            });
          }
        }
      }
    }

    // Export declarations (re-exports)
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const resolved = resolveImport(node.moduleSpecifier.text, filePath);
      if (resolved) {
        const targetModId = `urn:pi:mod:${resolved}`;
        if (!imports.find((i) => i["@id"] === targetModId)) {
          imports.push({ "@id": targetModId });
        }
      }
    }

    ts.forEachChild(node, visitNode);
  }

  ts.forEachChild(source, visitNode);

  const testFile = isTestFile(filePath);

  // For test files: collect module-level calls to imported source functions
  // Test files typically call imported functions at top level (not inside function bodies)
  const testEdges: { "@id": string }[] = [];
  if (testFile) {
    // Collect all calls at module level (not inside function bodies)
    const moduleLevelCalls = collectCalls(source, filePath, importMap);
    for (const call of moduleLevelCalls) {
      // Only keep calls that resolve to imported source functions (not local helpers)
      const id = call["@id"];
      if (id.includes("#") && !id.includes(filePath + "#")) {
        testEdges.push(call);
      }
    }

    // Also: any named import from a source file is a test edge
    // (the test file imports it to test it)
    for (const [localName, mapped] of importMap.entries()) {
      if (mapped.includes("#")) {
        const fnId = `urn:pi:fn:${mapped}`;
        if (!testEdges.find((e) => e["@id"] === fnId)) {
          testEdges.push({ "@id": fnId });
        }
      }
    }

    // Handle dynamic import() — e.g. await import("../handlers/x.ts")
    function findDynamicImports(n: ts.Node) {
      if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = n.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          const resolved = resolveImport(arg.text.replace(/\?.*$/, ""), filePath);
          if (resolved && !isTestFile(resolved)) {
            // Add import edge if not already present
            const modId = `urn:pi:mod:${resolved}`;
            if (!imports.find((i) => i["@id"] === modId)) {
              imports.push({ "@id": modId });
            }
            // Add test edge to all exported functions in that module
            // We'll resolve this by adding a module-level test edge
            if (!testEdges.find((e) => e["@id"] === modId)) {
              testEdges.push({ "@id": modId });
            }
          }
        }
      }
      ts.forEachChild(n, findDynamicImports);
    }
    ts.forEachChild(source, findDynamicImports);

    // Mark all functions in test files as test functions
    for (const fn of functions) {
      fn["code:isTestFunction"] = true;
    }
  }

  const moduleNode: ModuleNode = {
    "@id": moduleId,
    "@type": "schema:SoftwareSourceCode",
    "schema:name": path.basename(filePath),
    "code:filePath": filePath,
    ...(testFile ? { "code:isTestFile": true } : {}),
    ...(imports.length > 0 ? { "schema:requires": imports } : {}),
    ...(exports.length > 0 ? { "code:exports": exports } : {}),
    ...(testEdges.length > 0 ? { "code:tests": testEdges } : {}),
  };

  return { moduleNode, functions };
}

// ---- Helpers ----

function hasExportModifier(node: ts.Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function hasAsyncModifier(node: ts.Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return mods?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
}

function unwrapArrow(node: ts.Expression): ts.Expression {
  // Unwrap: const x = someWrapper(() => {}) — just return the expression as-is
  return node;
}

function collectCalls(
  node: ts.Node,
  filePath: string,
  importMap: Map<string, string>
): { "@id": string }[] {
  const calls: { "@id": string }[] = [];
  const seen = new Set<string>();

  function walk(n: ts.Node) {
    if (ts.isCallExpression(n)) {
      const callId = resolveCallTarget(n.expression, filePath, importMap);
      if (callId && !seen.has(callId)) {
        seen.add(callId);
        calls.push({ "@id": callId });
      }
    }
    ts.forEachChild(n, walk);
  }

  ts.forEachChild(node, walk);
  return calls;
}

function resolveCallTarget(
  expr: ts.Expression,
  filePath: string,
  importMap: Map<string, string>
): string | null {
  // Direct call: foo()
  if (ts.isIdentifier(expr)) {
    const name = expr.text;
    // Check if it's an imported name
    const mapped = importMap.get(name);
    if (mapped) {
      if (mapped.includes("#")) {
        return `urn:pi:fn:${mapped}`;
      }
      return `urn:pi:fn:${mapped}#${name}`;
    }
    // Local function in same file
    return `urn:pi:fn:${filePath}#${name}`;
  }

  // Property access: obj.method() or Module.fn()
  if (ts.isPropertyAccessExpression(expr)) {
    const methodName = expr.name.text;
    // Check if the object is an imported namespace
    if (ts.isIdentifier(expr.expression)) {
      const objName = expr.expression.text;
      const mapped = importMap.get(objName);
      if (mapped && !mapped.includes("#")) {
        return `urn:pi:fn:${mapped}#${methodName}`;
      }
    }
    // Can't resolve further — skip property access on unknown objects
    return null;
  }

  return null;
}

// ---- Main ----

const files = collectTsFiles(ROOT);
const allFiles = new Set(files);

console.log(`Parsing ${files.length} TypeScript files...`);

const graph: (ModuleNode | FunctionNode)[] = [];
let fnCount = 0;
let callEdgeCount = 0;
let importEdgeCount = 0;

for (const file of files) {
  const fullPath = path.join(ROOT, file);
  const content = fs.readFileSync(fullPath, "utf-8");
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

  const { moduleNode, functions } = extractFromFile(file, source);
  graph.push(moduleNode);
  importEdgeCount += moduleNode["schema:requires"]?.length ?? 0;

  for (const fn of functions) {
    graph.push(fn);
    fnCount++;
    callEdgeCount += fn["code:calls"]?.length ?? 0;
  }
}

const now = new Date().toISOString();

const jsonld = {
  "@context": {
    schema: "https://schema.org/",
    code: "https://pi.dev/code/",
    doap: "http://usefulinc.com/ns/doap#",
    prov: "http://www.w3.org/ns/prov#",
    xsd: "http://www.w3.org/2001/XMLSchema#",
    "code:calls": { "@type": "@id" },
    "code:tests": { "@type": "@id" },
    "code:definedIn": { "@type": "@id" },
    "schema:requires": { "@type": "@id" },
  },
  "@id": `urn:pi:graph:harness:${now.replace(/[:.]/g, "-")}`,
  "@type": "prov:Entity",
  "prov:generatedAtTime": now,
  "schema:about": { "@id": "urn:pi:proj:harness" },
  "@graph": graph,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(jsonld, null, 2), "utf-8");

console.log(`✅ Written to ${OUT}`);
console.log(`   Modules: ${files.length}`);
console.log(`   Functions: ${fnCount}`);
console.log(`   Call edges: ${callEdgeCount}`);
console.log(`   Import edges: ${importEdgeCount}`);
console.log(`   Graph nodes: ${graph.length}`);
