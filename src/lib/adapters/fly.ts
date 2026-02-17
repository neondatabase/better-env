import fs from "node:fs";
import path from "node:path";
import type {
  BetterEnvAdapter,
  BetterEnvAdapterContext,
  ExecResult,
} from "../runtime/types.ts";

export type FlyAdapterOptions = {
  flyBin?: string;
  app?: string;
  config?: string;
};

export function flyAdapter(options: FlyAdapterOptions = {}): BetterEnvAdapter {
  const flyBin = options.flyBin ?? "fly";

  async function run(
    ctx: BetterEnvAdapterContext,
    args: string[],
    runOptions?: { includeApp?: boolean },
  ): Promise<ExecResult> {
    const cmd = [flyBin, ...args];

    if (options.config) {
      cmd.push("--config", options.config);
    }

    if (runOptions?.includeApp !== false) {
      const app = resolveAppName(ctx, options.app, options.config);
      if (app) {
        cmd.push("--app", app);
      }
    }

    return ctx.exec(cmd, {
      cwd: ctx.projectDir,
    });
  }

  async function listKeys(ctx: BetterEnvAdapterContext): Promise<string[]> {
    const res = await run(ctx, ["secrets", "list", "--json"]);
    if (res.exitCode !== 0) {
      throw new Error(
        `Failed to list env vars from Fly.\n${res.stderr}`.trim(),
      );
    }

    const parsed = tryParseFlySecretsList(res.stdout);
    if (!parsed) {
      throw new Error("Failed to parse Fly secrets list output.");
    }

    return parsed;
  }

  return {
    name: "fly",
    defaultEnvironments() {
      return {
        development: { envFile: ".env.development", remote: "production" },
        preview: { envFile: ".env.preview", remote: "production" },
        production: { envFile: ".env.production", remote: "production" },
        test: { envFile: ".env.test", remote: null },
      };
    },

    async init(ctx) {
      const version = await run(ctx, ["version"], { includeApp: false });
      if (version.exitCode !== 0) {
        throw new Error(
          `Failed to run Fly CLI. Is \`${flyBin}\` installed?\n${version.stderr}`.trim(),
        );
      }

      const whoami = await run(ctx, ["auth", "whoami"], { includeApp: false });
      if (whoami.exitCode !== 0) {
        throw new Error(
          `Failed to authenticate with Fly CLI.\n${whoami.stderr}`.trim(),
        );
      }

      const app = resolveAppName(ctx, options.app, options.config);
      if (!app) {
        throw new Error(
          [
            "Fly adapter requires an app name.",
            "Set `app` in `flyAdapter({ app: ... })`, set `BETTER_ENV_FLY_APP`,",
            'or add `app = "your-app-name"` to fly.toml.',
          ].join("\n"),
        );
      }

      const verifyApp = await run(ctx, ["secrets", "list", "--json"]);
      if (verifyApp.exitCode !== 0) {
        throw new Error(
          `Fly app "${app}" is not accessible.\n${verifyApp.stderr}`.trim(),
        );
      }
    },

    async pull(_ctx, { environment }) {
      throw new Error(
        [
          `Fly adapter cannot pull secret values for "${environment}".`,
          "Fly does not expose secret values after upload.",
          "Use local dotenv files as source of truth and push with `better-env load`.",
        ].join("\n"),
      );
    },

    async add(
      ctx,
      { environment: _environment, key, value, sensitive: _sensitive },
    ) {
      const exists = await envVarExists(ctx, listKeys, { key });
      if (exists) {
        throw new Error(
          `Env var ${key} already exists. Use \`better-env update\` or \`better-env upsert\`.`,
        );
      }

      await this.upsert(ctx, {
        environment: "production",
        key,
        value,
        sensitive: false,
      });
    },

    async upsert(
      ctx,
      { environment: _environment, key, value, sensitive: _sensitive },
    ) {
      const res = await run(ctx, [
        "secrets",
        "set",
        `${key}=${value}`,
        "--stage",
      ]);
      if (res.exitCode !== 0) {
        throw new Error(
          `Failed to upsert env var ${key}.\n${res.stderr}`.trim(),
        );
      }
    },

    async update(
      ctx,
      { environment: _environment, key, value, sensitive: _sensitive },
    ) {
      const exists = await envVarExists(ctx, listKeys, { key });
      if (!exists) {
        throw new Error(
          `Env var ${key} does not exist. Use \`better-env add\` or \`better-env upsert\`.`,
        );
      }

      await this.upsert(ctx, {
        environment: "production",
        key,
        value,
        sensitive: false,
      });
    },

    async delete(ctx, { environment: _environment, key }) {
      const res = await run(ctx, ["secrets", "unset", key, "--stage"]);
      if (res.exitCode !== 0) {
        throw new Error(
          `Failed to delete env var ${key}.\n${res.stderr}`.trim(),
        );
      }
    },

    async listEnvironments() {
      return ["production"];
    },

    async listEnvVars(ctx) {
      return listKeys(ctx);
    },
  };
}

async function envVarExists(
  ctx: BetterEnvAdapterContext,
  listKeys: (ctx: BetterEnvAdapterContext) => Promise<string[]>,
  options: { key: string },
): Promise<boolean> {
  const keys = await listKeys(ctx);
  return keys.includes(options.key);
}

function resolveAppName(
  ctx: BetterEnvAdapterContext,
  explicitApp: string | undefined,
  configPath: string | undefined,
): string | undefined {
  if (explicitApp && explicitApp.length > 0) return explicitApp;

  const fromEnv = process.env.BETTER_ENV_FLY_APP;
  if (typeof fromEnv === "string" && fromEnv.length > 0) {
    return fromEnv;
  }

  const flyTomlPath = configPath
    ? path.resolve(ctx.projectDir, configPath)
    : path.join(ctx.projectDir, "fly.toml");
  if (!fs.existsSync(flyTomlPath)) return undefined;

  const raw = fs.readFileSync(flyTomlPath, "utf8");
  const match = raw.match(/^\s*app\s*=\s*"([^"]+)"\s*$/m);
  if (!match) return undefined;
  const app = match[1]?.trim();
  return app && app.length > 0 ? app : undefined;
}

function tryParseFlySecretsList(stdout: string): string[] | null {
  const parsed = tryParseJson(stdout);
  if (!Array.isArray(parsed)) return null;

  const keys = new Set<string>();
  for (const item of parsed) {
    if (!isRecord(item)) continue;
    const name = readString(item, ["name", "Name", "key", "Key"]);
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

function isEnvVarName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}
