import fs from "node:fs";
import path from "node:path";
import type {
  BetterEnvAdapter,
  BetterEnvAdapterContext,
  ExecResult,
} from "../runtime/types.ts";

export type ConvexAdapterOptions = {
  convexBin?: string;
};

export function convexAdapter(
  options: ConvexAdapterOptions = {},
): BetterEnvAdapter {
  const convexBin = options.convexBin ?? "convex";

  async function run(
    ctx: BetterEnvAdapterContext,
    args: string[],
    runOptions?: { environment?: string },
  ): Promise<ExecResult> {
    const cmd = [
      convexBin,
      ...args,
      ...toEnvironmentArgs(runOptions?.environment),
    ];
    return ctx.exec(cmd, {
      cwd: ctx.projectDir,
    });
  }

  async function listVars(
    ctx: BetterEnvAdapterContext,
    environment: string,
  ): Promise<Record<string, string>> {
    const res = await run(ctx, ["env", "list"], { environment });
    if (res.exitCode !== 0) {
      throw new Error(
        `Failed to list env vars from Convex (${environment}).\n${res.stderr}`.trim(),
      );
    }
    return parseConvexEnvList(res.stdout);
  }

  return {
    name: "convex",
    defaultEnvironments() {
      return {
        development: { envFile: ".env.development", remote: "development" },
        production: { envFile: ".env.production", remote: "production" },
        preview: { envFile: ".env.preview", remote: null },
        test: { envFile: ".env.test", remote: null },
      };
    },

    async init(ctx) {
      const version = await run(ctx, ["--version"]);
      if (version.exitCode !== 0) {
        throw new Error(
          `Failed to run Convex CLI. Is \`${convexBin}\` installed?\n${version.stderr}`.trim(),
        );
      }

      const devList = await run(ctx, ["env", "list"], {
        environment: "development",
      });
      if (devList.exitCode !== 0) {
        throw new Error(
          `Failed to access Convex development deployment.\n${devList.stderr}`.trim(),
        );
      }
    },

    async pull(ctx, { environment, envFile }) {
      const vars = await listVars(ctx, environment);
      const content = Object.entries(vars)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");

      await fs.promises.writeFile(
        path.join(ctx.projectDir, envFile),
        content.length > 0 ? `${content}\n` : "",
        "utf8",
      );
    },

    async add(ctx, { environment, key, value }) {
      const vars = await listVars(ctx, environment);
      if (Object.hasOwn(vars, key)) {
        throw new Error(
          `Env var ${key} already exists in ${environment}. Use \`better-env update\` or \`better-env upsert\`.`,
        );
      }

      await this.upsert(ctx, { environment, key, value, sensitive: false });
    },

    async upsert(ctx, { environment, key, value }) {
      const res = await run(ctx, ["env", "set", key, value], { environment });
      if (res.exitCode !== 0) {
        throw new Error(
          `Failed to upsert env var ${key} (${environment}).\n${res.stderr}`.trim(),
        );
      }
    },

    async update(ctx, { environment, key, value }) {
      const vars = await listVars(ctx, environment);
      if (!Object.hasOwn(vars, key)) {
        throw new Error(
          `Env var ${key} does not exist in ${environment}. Use \`better-env add\` or \`better-env upsert\`.`,
        );
      }

      await this.upsert(ctx, { environment, key, value, sensitive: false });
    },

    async delete(ctx, { environment, key }) {
      const res = await run(ctx, ["env", "remove", key], { environment });
      if (res.exitCode !== 0) {
        throw new Error(
          `Failed to delete env var ${key} (${environment}).\n${res.stderr}`.trim(),
        );
      }
    },

    async listEnvironments() {
      return ["development", "production"];
    },

    async listEnvVars(ctx, { environment }) {
      return Object.keys(await listVars(ctx, environment));
    },
  };
}

function toEnvironmentArgs(environment: string | undefined): string[] {
  if (!environment || environment === "development") return [];
  if (environment === "production") return ["--prod"];
  throw new Error(
    `Unsupported Convex environment "${environment}". Configure a remote mapping to "development" or "production".`,
  );
}

function parseConvexEnvList(stdout: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const lines = stdout.replace(/\r\n?/g, "\n").split("\n");

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (line.startsWith("#")) continue;

    const lower = line.toLowerCase();
    if (lower.startsWith("name ")) continue;
    if (lower.startsWith("environment variable")) continue;
    if (lower.startsWith("convex")) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx !== -1) {
      const key = line.slice(0, eqIdx).trim();
      const value = line.slice(eqIdx + 1).trim();
      if (isEnvVarName(key)) {
        vars[key] = value;
      }
      continue;
    }

    const parts = line.split(/\s+/);
    const first = parts[0];
    if (!isEnvVarName(first) || parts.length < 2) continue;
    vars[first] = parts.slice(1).join(" ").trim();
  }

  return vars;
}

function isEnvVarName(value: string | undefined): value is string {
  if (!value) return false;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}
