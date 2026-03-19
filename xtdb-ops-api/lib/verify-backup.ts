import { exec } from "./exec.ts";
import { mkdtemp, readdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface VerifyResult {
  valid: boolean;
  tables: number;
  details: string[];
}

export async function verifyBackup(archivePath: string): Promise<VerifyResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), "backup-verify-"));
  const details: string[] = [];

  try {
    // Extract archive
    const extract = await exec("tar", ["xzf", archivePath, "-C", tmpDir], {
      timeout: 60_000,
    });

    if (extract.exitCode !== 0) {
      return { valid: false, tables: 0, details: [`Extraction failed: ${extract.stderr.trim()}`] };
    }

    details.push("Archive extracted successfully");

    const isCsv = archivePath.includes("csv-");

    if (isCsv) {
      return await verifyCsvBackup(tmpDir, details);
    } else {
      return await verifySnapshotBackup(tmpDir, details);
    }
  } catch (err: unknown) {
    return { valid: false, tables: 0, details: [`Verification error: ${String(err)}`] };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function verifyCsvBackup(
  dir: string,
  details: string[],
): Promise<VerifyResult> {
  const files = await collectFiles(dir);
  const csvFiles = files.filter((f) => f.endsWith(".csv"));

  if (csvFiles.length === 0) {
    return { valid: false, tables: 0, details: [...details, "No CSV files found in archive"] };
  }

  details.push(`Found ${csvFiles.length} CSV file(s)`);
  let valid = true;

  for (const file of csvFiles) {
    const info = await stat(file);
    const tableName = file.split("/").pop()?.replace(".csv", "") ?? "unknown";

    if (info.size === 0) {
      details.push(`⚠ ${tableName}: empty file (0 bytes)`);
      valid = false;
      continue;
    }

    // Count rows (subtract 1 for header)
    const wc = await exec("wc", ["-l", file], { timeout: 15_000 });
    const lineCount = parseInt(wc.stdout.trim().split(/\s+/)[0], 10) || 0;
    const rowCount = Math.max(0, lineCount - 1);
    details.push(`${tableName}: ${rowCount} row(s), ${info.size} bytes`);
  }

  return { valid, tables: csvFiles.length, details };
}

async function verifySnapshotBackup(
  dir: string,
  details: string[],
): Promise<VerifyResult> {
  const entries = await readdir(dir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);

  details.push(`Contents: ${dirs.length} dir(s), ${files.length} file(s)`);
  if (dirs.length > 0) details.push(`Directories: ${dirs.join(", ")}`);
  if (files.length > 0) details.push(`Files: ${files.join(", ")}`);

  return { valid: true, tables: 0, details };
}

async function collectFiles(dir: string): Promise<string[]> {
  const result: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await collectFiles(full)));
    } else {
      result.push(full);
    }
  }
  return result;
}
