import { spawn } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function exec(
  cmd: string,
  args: string[],
  opts?: { timeout?: number; cwd?: string },
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: opts?.cwd,
      timeout: opts?.timeout ?? 30_000,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => (stdout += d));
    proc.stderr.on("data", (d: Buffer) => (stderr += d));
    proc.on("close", (code) =>
      resolve({ stdout, stderr, exitCode: code ?? 1 }),
    );
    proc.on("error", reject);
  });
}
