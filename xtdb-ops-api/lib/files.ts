import { createReadStream, type ReadStream } from "node:fs";
import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

const BACKUP_DIR = process.env.BACKUP_DIR ?? join(process.env.HOME ?? "/Users/opunix", "backups", "xtdb");

export interface BackupFile {
  filename: string;
  sizeBytes: number;
  sizeHuman: string;
  modifiedAt: string;
  type: "snapshot" | "csv" | "unknown";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

export async function listBackups(): Promise<BackupFile[]> {
  let entries: string[];
  try {
    entries = await readdir(BACKUP_DIR);
  } catch {
    return [];
  }
  const files: BackupFile[] = [];
  for (const name of entries) {
    if (!name.endsWith(".tar.gz")) continue;
    const fullPath = join(BACKUP_DIR, name);
    try {
      const info = await stat(fullPath);
      if (!info.isFile()) continue;
      files.push({
        filename: name,
        sizeBytes: info.size,
        sizeHuman: formatSize(info.size),
        modifiedAt: info.mtime.toISOString(),
        type: name.startsWith("csv-") ? "csv" : name.startsWith("snapshot-") ? "snapshot" : "unknown",
      });
    } catch {}
  }
  return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export function getBackupPath(filename: string): string | null {
  if (filename.includes("/") || filename.includes("..")) return null;
  if (!filename.endsWith(".tar.gz")) return null;
  return join(BACKUP_DIR, filename);
}

export async function deleteBackup(filename: string): Promise<boolean> {
  const path = getBackupPath(filename);
  if (!path) return false;
  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}

export function createDownloadStream(filename: string): { stream: ReadStream; path: string } | null {
  const path = getBackupPath(filename);
  if (!path) return null;
  return { stream: createReadStream(path), path };
}

export function getBackupDir(): string {
  return BACKUP_DIR;
}
