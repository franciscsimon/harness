#!/usr/bin/env npx jiti
// ─── Log Scanner ─────────────────────────────────────────────
// Scans text for sensitive data patterns (Phase 4.4).
// Can be used as a library or standalone CLI.
//
// Usage: echo "some log output" | npx jiti log-scanner/index.ts
//        or: import { scanForLeaks } from "./log-scanner/index.ts"

export interface LeakFinding {
  pattern: string;
  match: string;
  line: number;
}

const PATTERNS: Array<{ name: string; regex: RegExp; redact: boolean }> = [
  { name: "email", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, redact: true },
  { name: "ipv4", regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, redact: false },
  { name: "jwt", regex: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, redact: true },
  { name: "aws-key", regex: /AKIA[0-9A-Z]{16}/g, redact: true },
  { name: "connection-string", regex: /(?:postgres|mysql|mongodb):\/\/[^\s"']+/g, redact: true },
  { name: "private-key", regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g, redact: true },
  { name: "api-key", regex: /(?:api[_-]?key|apikey)\s*[=:]\s*["']?[a-zA-Z0-9_-]{16,}["']?/gi, redact: true },
  { name: "bearer-token", regex: /Bearer\s+[a-zA-Z0-9_.-]{20,}/g, redact: true },
  { name: "hex-secret", regex: /(?:secret|token|password)\s*[=:]\s*["']?[0-9a-f]{32,}["']?/gi, redact: true },
];

/** Scan text for sensitive data patterns. Returns findings. */
export function scanForLeaks(text: string): LeakFinding[] {
  const findings: LeakFinding[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const p of PATTERNS) {
      const matches = line.matchAll(p.regex);
      for (const m of matches) {
        findings.push({
          pattern: p.name,
          match: p.redact ? m[0].slice(0, 8) + "***REDACTED***" : m[0],
          line: i + 1,
        });
      }
    }
  }

  return findings;
}

/** Redact sensitive data in text. */
export function redactSensitiveData(text: string): string {
  let result = text;
  for (const p of PATTERNS) {
    if (p.redact) {
      result = result.replace(p.regex, (m) => m.slice(0, 4) + "***");
    }
  }
  return result;
}

// CLI mode
if (process.argv[1]?.includes("log-scanner")) {
  let input = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk) => (input += chunk));
  process.stdin.on("end", () => {
    const findings = scanForLeaks(input);
    if (findings.length === 0) {
      console.log("✅ No sensitive data detected");
    } else {
      console.log(`⚠️  ${findings.length} potential leak(s) detected:`);
      // Persist to XTDB if available
      import("../lib/db.ts").then(({ connectXtdb }) => {
        const dbSql = connectXtdb({ max: 1 });
        persistLeakFindings(dbSql, findings, "stdin").then(() => dbSql.end()).catch(() => {});
      }).catch(() => {});
      for (const f of findings) {
        console.log(`  L${f.line}: [${f.pattern}] ${f.match}`);
      }
      process.exit(1);
    }
  });
}

// §2 — Persist log_leak_detections to XTDB
export async function persistLeakFindings(sql: any, findings: LeakFinding[], source: string): Promise<void> {
  for (const f of findings) {
    try {
      await sql`INSERT INTO log_leak_detections
        (_id, pattern_name, line_number, snippet, source, ts, _valid_from)
        VALUES (${`leak:${source}:${f.line}:${Date.now()}`}, ${f.patternName}, ${f.line}, ${f.match.slice(0, 500)}, ${source}, ${Date.now()}, CURRENT_TIMESTAMP)`;
    } catch {}
  }
}
