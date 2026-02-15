import fs from "node:fs";
import path from "node:path";
import type {
  BetterEnvAdapter,
  BetterEnvAdapterContext,
  ExecResult,
} from "../runtime/types.ts";

export type RailwayAdapterOptions = {
  railwayBin?: string;
  token?: string;
  apiToken?: string;
  service?: string;
};

export function railwayAdapter(
  options: RailwayAdapterOptions = {},
): BetterEnvAdapter {
  const railwayBin = options.railwayBin ?? "railway";

  async function run(
    ctx: BetterEnvAdapterContext,
    args: string[],
    runOptions?: { interactive?: boolean; includeService?: boolean },
  ): Promise<ExecResult> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string") {
        env[key] = value;
      }
    }
    if (options.token) env.RAILWAY_TOKEN = options.token;
    if (options.apiToken) env.RAILWAY_API_TOKEN = options.apiToken;

    const cmd = [railwayBin, ...args];
    if (runOptions?.includeService && options.service) {
      cmd.push("--service", options.service);
    }

    return ctx.exec(cmd, {
      cwd: ctx.projectDir,
      env,
      interactive: runOptions?.interactive,
    });
  }

  async function listVariables(
    ctx: BetterEnvAdapterContext,
    environment: string,
  ): Promise<Record<string, string>> {
    const attempts = await Promise.all([
      run(ctx, ["variable", "list", "--environment", environment, "--json"], {
        includeService: true,
      }),
      run(ctx, ["variables", "--environment", environment, "--json"], {
        includeService: true,
      }),
    ]);

    for (const res of attempts) {
      if (res.exitCode !== 0) continue;
      const parsed = parseRailwayVariables(res.stdout);
      if (parsed) return parsed;
    }

    const plainAttempt = await run(
      ctx,
      ["variable", "list", "--environment", environment],
      { includeService: true },
    );
    if (plainAttempt.exitCode === 0) {
      return parseRailwayPlainVariables(plainAttempt.stdout);
    }

    const [first, second] = attempts;
    throw new Error(
      [
        `Failed to list env vars from Railway (${environment}).`,
        first.stderr,
        second.stderr,
        plainAttempt.stderr,
      ]
        .filter((line) => line.trim().length > 0)
        .join("\n"),
    );
  }

  return {
    name: "railway",
    defaultEnvironments() {
      return {
        development: { envFile: ".env.development", remote: "development" },
        preview: { envFile: ".env.preview", remote: "preview" },
        production: { envFile: ".env.production", remote: "production" },
        test: { envFile: ".env.test", remote: null },
      };
    },

    async init(ctx, { yes: _yes }) {
      const whoami = await run(ctx, ["whoami"]);
      if (whoami.exitCode !== 0) {
        throw new Error(
          `Failed to run Railway CLI. Is \`${railwayBin}\` installed and authenticated?\n${whoami.stderr}`.trim(),
        );
      }

      const status = await run(ctx, ["status", "--json"]);
      if (status.exitCode === 0) {
        return;
      }

      const link = await run(ctx, ["link"], { interactive: true });
      if (link.exitCode !== 0) {
        throw new Error("`railway link` failed.");
      }
    },

    async pull(ctx, { environment, envFile }) {
      const vars = await listVariables(ctx, environment);
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
      const vars = await listVariables(ctx, environment);
      if (Object.hasOwn(vars, key)) {
        throw new Error(
          `Env var ${key} already exists in ${environment}. Use \`better-env update\` or \`better-env upsert\`.`,
        );
      }

      await this.upsert(ctx, { environment, key, value, sensitive: false });
    },

    async upsert(ctx, { environment, key, value }) {
      const res = await run(
        ctx,
        ["variable", "set", `${key}=${value}`, "--environment", environment],
        { includeService: true },
      );
      if (res.exitCode !== 0) {
        throw new Error(
          `Failed to upsert env var ${key} (${environment}).\n${res.stderr}`.trim(),
        );
      }
    },

    async update(ctx, { environment, key, value }) {
      const vars = await listVariables(ctx, environment);
      if (!Object.hasOwn(vars, key)) {
        throw new Error(
          `Env var ${key} does not exist in ${environment}. Use \`better-env add\` or \`better-env upsert\`.`,
        );
      }

      await this.upsert(ctx, { environment, key, value, sensitive: false });
    },

    async delete(ctx, { environment, key }) {
      const res = await run(
        ctx,
        ["variable", "delete", key, "--environment", environment],
        { includeService: true },
      );
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
      return Object.keys(await listVariables(ctx, environment));
    },
  };
}

function parseRailwayVariables(stdout: string): Record<string, string> | null {
  const parsed = safeJsonParse(stdout);
  if (!parsed) return null;

  if (Array.isArray(parsed)) {
    return arrayToVars(parsed);
  }

  if (isRecord(parsed)) {
    if (Array.isArray(parsed.variables)) {
      return arrayToVars(parsed.variables);
    }

    const direct = objectToStringMap(parsed);
    if (direct) return direct;
  }

  return null;
}

function parseRailwayPlainVariables(stdout: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = stdout.replace(/\r\n?/g, "\n").split("\n");

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq !== -1) {
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (isEnvVarName(key)) {
        out[key] = value;
      }
      continue;
    }

    const parts = line.split(/\s+/);
    const first = parts[0];
    if (isEnvVarName(first)) {
      out[first] = parts.slice(1).join(" ").trim();
    }
  }

  return out;
}

function safeJsonParse(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function arrayToVars(values: unknown[]): Record<string, string> {
  const out: Record<string, string> = {};

  for (const item of values) {
    if (!isRecord(item)) continue;
    const key = readString(item, ["name", "key"]);
    const value = readString(item, ["value", "string"]);
    if (!isEnvVarName(key) || value === undefined) continue;
    out[key] = value;
  }

  return out;
}

function objectToStringMap(
  value: Record<string, unknown>,
): Record<string, string> | null {
  const out: Record<string, string> = {};
  let seen = false;

  for (const [key, rawValue] of Object.entries(value)) {
    if (!isEnvVarName(key)) return null;
    if (typeof rawValue !== "string") return null;
    out[key] = rawValue;
    seen = true;
  }

  return seen ? out : null;
}

function readString(
  value: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const maybe = value[key];
    if (typeof maybe === "string") return maybe;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEnvVarName(value: string | undefined): value is string {
  if (!value) return false;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}
