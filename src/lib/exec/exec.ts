import { spawn } from "node:child_process";
import type { Exec, ExecOptions, ExecResult } from "../runtime/types.ts";

export const exec: Exec = async (
  cmd: string[],
  options: ExecOptions,
): Promise<ExecResult> => {
  const env = options.env ? mergeEnv(process.env, options.env) : undefined;
  const [command, ...args] = cmd;

  if (!command) {
    return { exitCode: 1, stdout: "", stderr: "No command provided" };
  }

  if (options.interactive) {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env,
      stdio: "inherit",
    });

    const exitCode = await waitForExit(proc);
    return { exitCode, stdout: "", stderr: "" };
  }

  const proc = spawn(command, args, {
    cwd: options.cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (proc.stdin) {
    if (options.stdin !== undefined) {
      proc.stdin.write(options.stdin);
    }
    proc.stdin.end();
  }

  let stdout = "";
  let stderr = "";

  proc.stdout?.setEncoding("utf8");
  proc.stderr?.setEncoding("utf8");
  proc.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });
  proc.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exitCode = await waitForExit(proc);
  return { exitCode, stdout, stderr };
};

function waitForExit(proc: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve) => {
    proc.once("error", () => resolve(1));
    proc.once("close", (code) => resolve(code ?? 1));
  });
}

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
