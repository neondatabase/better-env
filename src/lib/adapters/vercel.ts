import fs from "node:fs";
import path from "node:path";
import type {
  BetterEnvAdapter,
  BetterEnvAdapterContext,
  ExecResult,
} from "../runtime/types.ts";

export type VercelAdapterOptions = {
  vercelBin?: string;
  scope?: string;
  token?: string;
};

export function vercelAdapter(
  options: VercelAdapterOptions = {},
): BetterEnvAdapter {
  const vercelBin = options.vercelBin ?? "vercel";

  const withGlobals = (args: string[]): string[] => {
    const out = [vercelBin, ...args, "--no-color"];
    if (options.scope) out.push("--scope", options.scope);
    if (options.token) out.push("--token", options.token);
    return out;
  };

  async function run(
    ctx: BetterEnvAdapterContext,
    args: string[],
    runOptions?: { stdin?: string; interactive?: boolean },
  ): Promise<ExecResult> {
    return ctx.exec(withGlobals(args), {
      cwd: ctx.projectDir,
      stdin: runOptions?.stdin,
      interactive: runOptions?.interactive,
    });
  }

  return {
    name: "vercel",

    async init(ctx, { yes }) {
      const version = await run(ctx, ["--version"]);
      if (version.exitCode !== 0) {
        throw new Error(
          `Failed to run Vercel CLI. Is \`${vercelBin}\` installed?\n${version.stderr}`.trim(),
        );
      }

      const projectJsonPath = path.join(
        ctx.projectDir,
        ".vercel",
        "project.json",
      );
      if (fs.existsSync(projectJsonPath)) {
        return;
      }

      const linkArgs = ["link"];
      if (yes) linkArgs.push("--yes");
      const linked = await run(ctx, linkArgs, { interactive: true });

      if (linked.exitCode !== 0) {
        throw new Error("`vercel link` failed.");
      }

      if (!fs.existsSync(projectJsonPath)) {
        throw new Error(
          "Vercel project is still not linked (missing .vercel/project.json).",
        );
      }
    },

    async pull(ctx, { environment, envFile }) {
      const res = await run(ctx, [
        "env",
        "pull",
        envFile,
        "--environment",
        environment,
        "--yes",
      ]);

      if (res.exitCode !== 0) {
        throw new Error(
          `Failed to pull env vars from Vercel (${environment}).\n${res.stderr}`.trim(),
        );
      }
    },

    async add(ctx, { environment, key, value, sensitive }) {
      const res = await run(
        ctx,
        ["env", "add", key, environment, ...(sensitive ? ["--sensitive"] : [])],
        { stdin: `${value}\n` },
      );

      if (res.exitCode !== 0) {
        throw new Error(
          `Failed to add env var ${key} (${environment}).\n${res.stderr}`.trim(),
        );
      }
    },

    async upsert(ctx, { environment, key, value, sensitive }) {
      const res = await run(
        ctx,
        [
          "env",
          "add",
          key,
          environment,
          "--force",
          ...(sensitive ? ["--sensitive"] : []),
        ],
        { stdin: `${value}\n` },
      );

      if (res.exitCode !== 0) {
        throw new Error(
          `Failed to upsert env var ${key} (${environment}).\n${res.stderr}`.trim(),
        );
      }
    },

    async update(ctx, { environment, key, value, sensitive }) {
      const exists = await envVarExists(ctx, run, { environment, key });
      if (!exists) {
        throw new Error(
          `Env var ${key} does not exist in ${environment}. Use \`better-env add\` or \`better-env upsert\`.`,
        );
      }

      await this.upsert(ctx, { environment, key, value, sensitive });
    },

    async delete(ctx, { environment, key }) {
      const res = await run(ctx, ["env", "rm", key, environment, "--yes"]);
      if (res.exitCode !== 0) {
        throw new Error(
          `Failed to delete env var ${key} (${environment}).\n${res.stderr}`.trim(),
        );
      }
    },

    async listEnvironments() {
      return ["development", "preview", "production"];
    },

    async listEnvVars(ctx, { environment }) {
      const res = await run(ctx, ["env", "ls", environment]);
      if (res.exitCode !== 0) {
        throw new Error(`Failed to list env vars.\n${res.stderr}`.trim());
      }
      return parseVercelEnvLs(res.stdout);
    },
  };
}

async function envVarExists(
  ctx: BetterEnvAdapterContext,
  run: (
    ctx: BetterEnvAdapterContext,
    args: string[],
    runOptions?: { stdin?: string; interactive?: boolean },
  ) => Promise<ExecResult>,
  options: { environment: string; key: string },
): Promise<boolean> {
  const res = await run(ctx, ["env", "ls", options.environment]);
  if (res.exitCode !== 0) {
    throw new Error(`Failed to list env vars.\n${res.stderr}`.trim());
  }
  const keys = parseVercelEnvLs(res.stdout);
  return keys.includes(options.key);
}

function parseVercelEnvLs(stdout: string): string[] {
  const keys: string[] = [];
  const lines = stdout.replace(/\r\n?/g, "\n").split("\n");

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;

    const lower = trimmed.toLowerCase();
    if (lower.startsWith("vercel")) continue;
    if (lower.startsWith("environment variables")) continue;
    if (lower.startsWith("name ")) continue;
    if (lower.startsWith("key ")) continue;

    const first = trimmed.split(/\s+/)[0];
    if (isEnvVarName(first)) {
      keys.push(first);
    }
  }

  return Array.from(new Set(keys));
}

function isEnvVarName(value: string | undefined): value is string {
  if (!value) return false;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}
