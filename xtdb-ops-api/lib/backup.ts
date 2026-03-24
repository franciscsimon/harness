import { randomUUID } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { exec } from "./exec.ts";

let _sql: ReturnType<typeof postgres> | null = null;
function db() {
  if (!_sql) {
    _sql = postgres({
      host: "localhost",
      port: 5433,
      database: "xtdb",
      user: "xtdb",
      password: "xtdb",
      max: 1,
      idle_timeout: 30,
    });
  }
  return _sql;
}

async function recordBackup(job: BackupJob, archivePath: string | null) {
  try {
    const s = db();
    const t = (v: string | null) => s.typed(v as any, 25);
    const n = (v: number | null) => s.typed(v as any, 20);
    const id = `bak:${randomUUID()}`;
    const now = Date.now();
    let sizeBytes: number | null = null;
    if (archivePath) {
      try {
        sizeBytes = statSync(archivePath).size;
      } catch {}
    }
    await s`INSERT INTO backup_records (
      _id, backup_type, archive_path, size_bytes, table_count,
      duration_ms, status, error_summary, started_ts, completed_ts, ts, jsonld
    ) VALUES (
      ${t(id)}, ${t(job.type)}, ${t(archivePath)}, ${n(sizeBytes)},
      ${n(null)}, ${n(job.completedAt && job.startedAt ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime() : null)},
      ${t(job.status)}, ${t(job.status === "failed" ? job.result : null)},
      ${n(new Date(job.startedAt).getTime())}, ${n(job.completedAt ? new Date(job.completedAt).getTime() : null)},
      ${n(now)}, ${t("{}")}
    )`;
  } catch (_err) {}
}

const HARNESS_DIR = process.env.HARNESS_DIR ?? "/Users/opunix/harness";
const BACKUP_BASE = process.env.BACKUP_DIR ?? `${process.env.HOME ?? "/Users/opunix"}/backups/xtdb`;

export interface BackupJob {
  id: string;
  type: "snapshot" | "csv";
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  progress: string[];
  result: string | null;
}

const jobs = new Map<string, BackupJob>();

export function getJob(id: string): BackupJob | undefined {
  return jobs.get(id);
}

export function startSnapshotBackup(): string {
  const jobId = randomUUID();
  const job: BackupJob = {
    id: jobId,
    type: "snapshot",
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    progress: [],
    result: null,
  };
  jobs.set(jobId, job);

  (async () => {
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);

      job.progress.push("1/5 Flushing primary block...");
      await fetch("http://localhost:8083/system/finish-block", {
        method: "POST",
      }).catch(() => {});
      await new Promise((r) => setTimeout(r, 5000));

      job.progress.push("2/5 Stopping replica...");
      const stop = await exec("docker", ["compose", "stop", "xtdb-replica"], { cwd: HARNESS_DIR, timeout: 30_000 });
      if (stop.exitCode !== 0) throw new Error(`Stop failed: ${stop.stderr.trim()}`);

      job.progress.push("3/5 Exporting snapshot from replica storage...");
      const volResult = await exec("docker", ["volume", "ls", "-q", "--filter", "name=xtdb-replica-data"]);
      const volume = volResult.stdout.trim().split("\n")[0];

      const exportResult = await exec(
        "docker",
        [
          "run",
          "--rm",
          "--network",
          "harness_default",
          "-v",
          `${volume}:/var/lib/xtdb`,
          "-v",
          `${HARNESS_DIR}/xtdb-export.yaml:/usr/local/lib/xtdb/xtdb-export.yaml:ro`,
          "ghcr.io/xtdb/xtdb-aws:2.1.0",
          "export-snapshot",
          "xtdb",
          "-f",
          "xtdb-export.yaml",
        ],
        { timeout: 300_000 },
      );
      if (exportResult.exitCode !== 0) {
        job.progress.push(`Export warning: ${exportResult.stderr.trim()}`);
      } else {
        job.progress.push("Snapshot exported to replica volume.");
      }

      job.progress.push("4/5 Copying snapshot to backup directory...");
      await exec("mkdir", ["-p", BACKUP_BASE]);

      // Find the latest export dir inside the volume
      const findResult = await exec(
        "docker",
        [
          "run",
          "--rm",
          "-v",
          `${volume}:/var/lib/xtdb:ro`,
          "alpine",
          "sh",
          "-c",
          "ls -1t /var/lib/xtdb/buffers/v06/exports/ 2>/dev/null | head -1",
        ],
        { timeout: 10_000 },
      );
      const latestExport = findResult.stdout.trim();

      if (!latestExport) {
        throw new Error("No export directory found in replica volume");
      }

      // Tar the export from inside the volume to the host backup dir
      const archive = `${BACKUP_BASE}/snapshot-${ts}.tar.gz`;
      const tarResult = await exec(
        "docker",
        [
          "run",
          "--rm",
          "-v",
          `${volume}:/var/lib/xtdb:ro`,
          "-v",
          `${BACKUP_BASE}:/backup`,
          "alpine",
          "sh",
          "-c",
          `tar czf /backup/snapshot-${ts}.tar.gz -C /var/lib/xtdb/buffers/v06/exports/${latestExport} .`,
        ],
        { timeout: 120_000 },
      );

      if (tarResult.exitCode !== 0) {
        throw new Error(`Tar failed: ${tarResult.stderr.trim()}`);
      }
      job.progress.push(`Snapshot archived: snapshot-${ts}.tar.gz`);

      job.progress.push("5/5 Restarting replica...");
      await exec("docker", ["compose", "up", "-d", "xtdb-replica"], {
        cwd: HARNESS_DIR,
        timeout: 60_000,
      });

      job.status = "completed";
      job.completedAt = new Date().toISOString();
      job.result = archive;
      job.progress.push("Backup complete.");
      await recordBackup(job, archive);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      job.status = "failed";
      job.completedAt = new Date().toISOString();
      job.result = msg;
      job.progress.push(`Error: ${msg}`);
      await recordBackup(job, null);
      // Best-effort: restart replica
      await exec("docker", ["compose", "up", "-d", "xtdb-replica"], {
        cwd: HARNESS_DIR,
      }).catch(() => {});
    }
  })();

  return jobId;
}

export function startCsvBackup(): string {
  const jobId = randomUUID();
  const job: BackupJob = {
    id: jobId,
    type: "csv",
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    progress: [],
    result: null,
  };
  jobs.set(jobId, job);

  (async () => {
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
      const backupDir = `${BACKUP_BASE}/csv-${ts}`;

      job.progress.push("Creating backup directory...");
      await exec("mkdir", ["-p", backupDir]);

      job.progress.push("Listing tables...");
      const tablesResult = await exec(
        "docker",
        [
          "run",
          "--rm",
          "--network",
          "host",
          "postgres:16-alpine",
          "psql",
          "-h",
          "localhost",
          "-p",
          "5433",
          "-U",
          "xtdb",
          "-d",
          "xtdb",
          "--csv",
          "-t",
          "-A",
          "-c",
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
        ],
        { timeout: 15_000 },
      );
      const tables = tablesResult.stdout
        .trim()
        .split("\n")
        .filter((t) => t);

      for (const table of tables) {
        job.progress.push(`Exporting ${table}...`);
        await exec(
          "docker",
          [
            "run",
            "--rm",
            "--network",
            "host",
            "-v",
            `${backupDir}:/out`,
            "postgres:16-alpine",
            "psql",
            "-h",
            "localhost",
            "-p",
            "5433",
            "-U",
            "xtdb",
            "-d",
            "xtdb",
            "--csv",
            "-c",
            `SELECT * FROM "${table}"`,
            "-o",
            `/out/${table}.csv`,
          ],
          { timeout: 60_000 },
        );
      }

      job.progress.push("Compressing...");
      const archive = `${BACKUP_BASE}/csv-${ts}.tar.gz`;
      await exec("tar", ["czf", archive, "-C", BACKUP_BASE, `csv-${ts}`], { timeout: 120_000 });
      await exec("rm", ["-rf", backupDir]);

      job.status = "completed";
      job.completedAt = new Date().toISOString();
      job.result = archive;
      job.progress.push(`Backup complete: ${archive}`);
      await recordBackup(job, archive);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      job.status = "failed";
      job.completedAt = new Date().toISOString();
      job.result = msg;
      job.progress.push(`Error: ${msg}`);
      await recordBackup(job, null);
    }
  })();

  return jobId;
}

export async function restoreFromArchive(archivePath: string): Promise<{ success: boolean; message: string }> {
  const result = await exec(
    "bash",
    [
      "-c",
      `set -euo pipefail
TMP=$(mktemp -d)
tar xzf "${archivePath}" -C "$TMP"
DIR=$(ls "$TMP")
for csv in "$TMP/$DIR"/*.csv; do
  table=$(basename "$csv" .csv)
  echo "Restoring $table"
  HEADER=$(head -1 "$csv")
  COLS=$(echo "$HEADER" | sed 's/,/","/g; s/^/"/; s/$/"/')
  tail -n +2 "$csv" | docker run --rm -i --network host postgres:16-alpine \\
    psql -h localhost -p 5433 -U xtdb -d xtdb \\
    -c "COPY \\"$table\\" ($COLS) FROM STDIN WITH (FORMAT csv)" 2>/dev/null || \\
    echo "Warning: COPY failed for $table"
done
rm -rf "$TMP"
echo "Restore complete"`,
    ],
    { timeout: 300_000 },
  );
  return {
    success: result.exitCode === 0,
    message: result.stdout.trim() || result.stderr.trim(),
  };
}

function incrementEpoch(): number {
  const configs = ["xtdb-primary.yaml", "xtdb-replica.yaml"];
  let newEpoch = 1;

  for (const name of configs) {
    const path = join(HARNESS_DIR, name);
    const content = readFileSync(path, "utf8");

    // Find current epoch
    const match = content.match(/epoch:\s*(\d+)/);
    if (match) {
      const current = parseInt(match[1], 10);
      newEpoch = Math.max(newEpoch, current + 1);
    }
  }

  // Write new epoch to both configs
  for (const name of configs) {
    const path = join(HARNESS_DIR, name);
    let content = readFileSync(path, "utf8");

    if (content.match(/epoch:\s*\d+/)) {
      content = content.replace(/epoch:\s*\d+/, `epoch: ${newEpoch}`);
    } else {
      // Add epoch after autoCreateTopic line
      content = content.replace(/(autoCreateTopic:\s*true)/, `$1\n  epoch: ${newEpoch}`);
    }
    writeFileSync(path, content, "utf8");
  }

  return newEpoch;
}

export function startSnapshotRestore(archivePath: string): string {
  const jobId = randomUUID();
  const job: BackupJob = {
    id: jobId,
    type: "snapshot",
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    progress: [],
    result: null,
  };
  jobs.set(jobId, job);

  (async () => {
    try {
      job.progress.push("1/8 Stopping replica...");
      const stopR = await exec("docker", ["compose", "stop", "xtdb-replica"], {
        cwd: HARNESS_DIR,
        timeout: 30_000,
      });
      if (stopR.exitCode !== 0) throw new Error(`Stop replica failed: ${stopR.stderr.trim()}`);

      job.progress.push("2/8 Stopping primary...");
      const stopP = await exec("docker", ["compose", "stop", "xtdb-primary"], { cwd: HARNESS_DIR, timeout: 30_000 });
      if (stopP.exitCode !== 0) throw new Error(`Stop primary failed: ${stopP.stderr.trim()}`);

      job.progress.push("3/8 Clearing primary storage volume...");
      const primaryVol = await exec("docker", ["volume", "ls", "-q", "--filter", "name=xtdb-primary-data"]);
      const pVol = primaryVol.stdout.trim().split("\n")[0];

      await exec(
        "docker",
        [
          "run",
          "--rm",
          "-v",
          `${pVol}:/var/lib/xtdb`,
          "alpine",
          "sh",
          "-c",
          "rm -rf /var/lib/xtdb/buffers && mkdir -p /var/lib/xtdb/buffers",
        ],
        { timeout: 30_000 },
      );

      job.progress.push("4/8 Extracting snapshot into primary storage...");
      await exec(
        "docker",
        [
          "run",
          "--rm",
          "-v",
          `${pVol}:/var/lib/xtdb`,
          "-v",
          `${archivePath}:/backup.tar.gz:ro`,
          "alpine",
          "sh",
          "-c",
          "tar xzf /backup.tar.gz -C /var/lib/xtdb/buffers/",
        ],
        { timeout: 120_000 },
      );

      job.progress.push("5/8 Clearing replica storage volume...");
      const replicaVol = await exec("docker", ["volume", "ls", "-q", "--filter", "name=xtdb-replica-data"]);
      const rVol = replicaVol.stdout.trim().split("\n")[0];

      await exec(
        "docker",
        [
          "run",
          "--rm",
          "-v",
          `${rVol}:/var/lib/xtdb`,
          "alpine",
          "sh",
          "-c",
          "rm -rf /var/lib/xtdb/buffers && mkdir -p /var/lib/xtdb/buffers",
        ],
        { timeout: 30_000 },
      );

      // Also extract into replica so it doesn't need to rebuild from scratch
      await exec(
        "docker",
        [
          "run",
          "--rm",
          "-v",
          `${rVol}:/var/lib/xtdb`,
          "-v",
          `${archivePath}:/backup.tar.gz:ro`,
          "alpine",
          "sh",
          "-c",
          "tar xzf /backup.tar.gz -C /var/lib/xtdb/buffers/",
        ],
        { timeout: 120_000 },
      );

      job.progress.push("6/8 Clearing Kafka topic and incrementing epoch...");
      await exec("docker", ["exec", "redpanda", "rpk", "topic", "delete", "xtdb-log"], { timeout: 10_000 });

      const newEpoch = incrementEpoch();
      job.progress.push(`Epoch set to ${newEpoch} in both configs.`);

      job.progress.push("7/8 Starting primary...");
      await exec("docker", ["compose", "up", "-d", "xtdb-primary"], {
        cwd: HARNESS_DIR,
        timeout: 60_000,
      });

      // Wait for primary to be healthy
      job.progress.push("Waiting for primary to become healthy...");
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const health = await fetch("http://localhost:8083/healthz/alive")
          .then((r) => r.ok)
          .catch(() => false);
        if (health) break;
      }

      job.progress.push("8/8 Starting replica...");
      await exec("docker", ["compose", "up", "-d", "xtdb-replica"], {
        cwd: HARNESS_DIR,
        timeout: 60_000,
      });

      job.status = "completed";
      job.completedAt = new Date().toISOString();
      job.result = `Restored from snapshot with epoch ${newEpoch}`;
      job.progress.push("Restore complete.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      job.status = "failed";
      job.completedAt = new Date().toISOString();
      job.result = msg;
      job.progress.push(`Error: ${msg}`);
      // Best-effort: restart both nodes
      await exec("docker", ["compose", "up", "-d", "xtdb-primary"], {
        cwd: HARNESS_DIR,
      }).catch(() => {});
      await exec("docker", ["compose", "up", "-d", "xtdb-replica"], {
        cwd: HARNESS_DIR,
      }).catch(() => {});
    }
  })();

  return jobId;
}
