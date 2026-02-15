import type {
  BetterEnvAdapter,
  BetterEnvAdapterContext,
  ExecResult,
} from "../runtime/types.ts";

export type CloudflareAdapterOptions = {
  wranglerBin?: string;
  config?: string;
};

export function cloudflareAdapter(
  options: CloudflareAdapterOptions = {},
): BetterEnvAdapter {
  const wranglerBin = options.wranglerBin ?? "wrangler";

  const withGlobals = (args: string[]): string[] => {
    const out = [wranglerBin, ...args];
    if (options.config) out.push("--config", options.config);
    return out;
  };

  async function run(
    ctx: BetterEnvAdapterContext,
    args: string[],
    runOptions?: { stdin?: string },
  ): Promise<ExecResult> {
    return ctx.exec(withGlobals(args), {
      cwd: ctx.projectDir,
      stdin: runOptions?.stdin,
    });
  }

  async function listKeys(
    ctx: BetterEnvAdapterContext,
    environment: string,
  ): Promise<string[]> {
    const args = ["secret", "list", ...toEnvironmentArgs(environment)];
    const results = await Promise.all([
      run(ctx, [...args, "--format", "json"]),
      run(ctx, [...args, "--json"]),
    ]);

    for (const res of results) {
      if (res.exitCode !== 0) continue;
      const keys = tryParseWranglerSecretList(res.stdout);
      if (keys) return keys;
    }

    const [formatJsonResult, jsonResult] = results;
    throw new Error(
      [
        `Failed to list env vars from Cloudflare (${environment}).`,
        formatJsonResult.stderr,
        jsonResult.stderr,
      ]
        .filter((line) => line.trim().length > 0)
        .join("\n"),
    );
  }

  return {
    name: "cloudflare",
    defaultEnvironments() {
      return {
        development: { envFile: ".env.development", remote: "development" },
        preview: { envFile: ".env.preview", remote: "preview" },
        production: { envFile: ".env.production", remote: "production" },
        test: { envFile: ".env.test", remote: null },
      };
    },

    async init(ctx) {
      const version = await run(ctx, ["--version"]);
      if (version.exitCode !== 0) {
        throw new Error(
          `Failed to run Wrangler CLI. Is \`${wranglerBin}\` installed?\n${version.stderr}`.trim(),
        );
      }
    },

    async pull(_ctx, { environment }) {
      throw new Error(
        [
          `Cloudflare adapter cannot pull secret values for "${environment}".`,
          "Wrangler does not expose secret values after upload.",
          "Use local dotenv files as source of truth and push with `better-env load`.",
        ].join("\n"),
      );
    },

    async add(ctx, { environment, key, value, sensitive: _sensitive }) {
      const exists = await envVarExists(ctx, listKeys, { environment, key });
      if (exists) {
        throw new Error(
          `Env var ${key} already exists in ${environment}. Use \`better-env update\` or \`better-env upsert\`.`,
        );
      }

      await this.upsert(ctx, {
        environment,
        key,
        value,
        sensitive: false,
      });
    },

    async upsert(ctx, { environment, key, value, sensitive: _sensitive }) {
      const res = await run(
        ctx,
        ["secret", "put", key, ...toEnvironmentArgs(environment)],
        { stdin: `${value}\n` },
      );
      if (res.exitCode !== 0) {
        throw new Error(
          `Failed to upsert env var ${key} (${environment}).\n${res.stderr}`.trim(),
        );
      }
    },

    async update(ctx, { environment, key, value, sensitive: _sensitive }) {
      const exists = await envVarExists(ctx, listKeys, { environment, key });
      if (!exists) {
        throw new Error(
          `Env var ${key} does not exist in ${environment}. Use \`better-env add\` or \`better-env upsert\`.`,
        );
      }

      await this.upsert(ctx, {
        environment,
        key,
        value,
        sensitive: false,
      });
    },

    async delete(ctx, { environment, key }) {
      const res = await run(ctx, [
        "secret",
        "delete",
        key,
        ...toEnvironmentArgs(environment),
      ]);
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
      return listKeys(ctx, environment);
    },
  };
}

async function envVarExists(
  ctx: BetterEnvAdapterContext,
  listKeys: (
    ctx: BetterEnvAdapterContext,
    environment: string,
  ) => Promise<string[]>,
  options: { environment: string; key: string },
): Promise<boolean> {
  const keys = await listKeys(ctx, options.environment);
  return keys.includes(options.key);
}

function toEnvironmentArgs(environment: string): string[] {
  if (environment === "production") return [];
  return ["--env", environment];
}

function tryParseWranglerSecretList(stdout: string): string[] | null {
  const parsed = tryParseJson(stdout);
  if (!Array.isArray(parsed)) return null;

  const keys = new Set<string>();
  for (const item of parsed) {
    if (!isRecord(item)) continue;
    const name = item.name;
    if (isEnvVarName(name)) {
      keys.add(name);
    }
  }

  return Array.from(keys);
}

function tryParseJson(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    // Wrangler can occasionally prefix logs before JSON output.
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start === -1 || end === -1 || start > end) return null;
    const possibleJson = trimmed.slice(start, end + 1);
    try {
      return JSON.parse(possibleJson);
    } catch {
      return null;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEnvVarName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}
