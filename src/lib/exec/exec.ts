import type { Exec, ExecOptions, ExecResult } from "../runtime/types.ts";

export const exec: Exec = async (
  cmd: string[],
  options: ExecOptions,
): Promise<ExecResult> => {
  const env = options.env ? mergeEnv(process.env, options.env) : undefined;

  if (options.interactive) {
    const proc = Bun.spawn(cmd, {
      cwd: options.cwd,
      env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;
    return { exitCode, stdout: "", stderr: "" };
  }

  const stdin = options.stdin ? new Blob([options.stdin]) : undefined;

  const proc = Bun.spawn(cmd, {
    cwd: options.cwd,
    env,
    stdin,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
};

function mergeEnv(
  base: NodeJS.ProcessEnv,
  overrides: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(base)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    result[key] = value;
  }

  return result;
}
