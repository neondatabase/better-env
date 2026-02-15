import fs from "node:fs";
import path from "node:path";
import type {
  BetterEnvAdapter,
  BetterEnvAdapterContext,
  ExecResult,
} from "../runtime/types.ts";

export type NetlifyAdapterOptions = {
  netlifyBin?: string;
  authToken?: string;
  filter?: string;
};

export function netlifyAdapter(
  options: NetlifyAdapterOptions = {},
): BetterEnvAdapter {
  const netlifyBin = options.netlifyBin ?? "netlify";

  const withGlobals = (args: string[]): string[] => {
    const out = [netlifyBin, ...args];
    if (options.authToken) out.push("--auth", options.authToken);
    if (options.filter) out.push("--filter", options.filter);
    return out;
  };

  async function run(
    ctx: BetterEnvAdapterContext,
    args: string[],
  ): Promise<ExecResult> {
    return ctx.exec(withGlobals(args), {
      cwd: ctx.projectDir,
    });
  }

  async function listKeys(
    ctx: BetterEnvAdapterContext,
    environment: string,
  ): Promise<string[]> {
    const res = await run(ctx, [
      "env:list",
      "--plain",
      "--context",
      environment,
    ]);
    if (res.exitCode !== 0) {
      throw new Error(`Failed to list env vars.\n${res.stderr}`.trim());
    }
    return parseNetlifyEnvListPlain(res.stdout);
  }

  return {
    name: "netlify",
    defaultEnvironments() {
      return {
        development: { envFile: ".env.development", remote: "dev" },
        preview: { envFile: ".env.preview", remote: "deploy-preview" },
        production: { envFile: ".env.production", remote: "production" },
        test: { envFile: ".env.test", remote: null },
      };
    },

    async init(ctx) {
      const version = await run(ctx, ["--version"]);
      if (version.exitCode !== 0) {
        throw new Error(
          `Failed to run Netlify CLI. Is \`${netlifyBin}\` installed?\n${version.stderr}`.trim(),
        );
      }

      const stateJsonPath = path.join(ctx.projectDir, ".netlify", "state.json");
      if (fs.existsSync(stateJsonPath)) {
        return;
      }

      const linked = await run(ctx, ["link"]);
      if (linked.exitCode !== 0) {
        throw new Error("`netlify link` failed.");
      }

      if (!fs.existsSync(stateJsonPath)) {
        throw new Error(
          "Netlify project is still not linked (missing .netlify/state.json).",
        );
      }
    },

    async pull(ctx, { environment, envFile }) {
      const res = await run(ctx, [
        "env:list",
        "--plain",
        "--context",
        environment,
      ]);
      if (res.exitCode !== 0) {
        throw new Error(
          `Failed to pull env vars from Netlify (${environment}).\n${res.stderr}`.trim(),
        );
      }

      const normalized = normalizeDotenvContent(res.stdout);
      await fs.promises.writeFile(
        path.join(ctx.projectDir, envFile),
        normalized,
        "utf8",
      );
    },

    async add(ctx, { environment, key, value, sensitive }) {
      const exists = await envVarExists(ctx, listKeys, { environment, key });
      if (exists) {
        throw new Error(
          `Env var ${key} already exists in ${environment}. Use \`better-env update\` or \`better-env upsert\`.`,
        );
      }

      const args = ["env:set", key, value, "--context", environment];
      if (sensitive) args.push("--secret");
      const res = await run(ctx, args);
      if (res.exitCode !== 0) {
        throw new Error(
          `Failed to add env var ${key} (${environment}).\n${res.stderr}`.trim(),
        );
      }
    },

    async upsert(ctx, { environment, key, value, sensitive }) {
      const args = ["env:set", key, value, "--context", environment];
      if (sensitive) args.push("--secret");
      const res = await run(ctx, args);
      if (res.exitCode !== 0) {
        throw new Error(
          `Failed to upsert env var ${key} (${environment}).\n${res.stderr}`.trim(),
        );
      }
    },

    async update(ctx, { environment, key, value, sensitive }) {
      const exists = await envVarExists(ctx, listKeys, { environment, key });
      if (!exists) {
        throw new Error(
          `Env var ${key} does not exist in ${environment}. Use \`better-env add\` or \`better-env upsert\`.`,
        );
      }

      await this.upsert(ctx, { environment, key, value, sensitive });
    },

    async delete(ctx, { environment, key }) {
      const res = await run(ctx, [
        "env:unset",
        key,
        "--context",
        environment,
        "--force",
      ]);
      if (res.exitCode !== 0) {
        throw new Error(
          `Failed to delete env var ${key} (${environment}).\n${res.stderr}`.trim(),
        );
      }
    },

    async listEnvironments() {
      return ["dev", "branch-deploy", "deploy-preview", "production"];
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

function parseNetlifyEnvListPlain(stdout: string): string[] {
  const keys = new Set<string>();
  const lines = stdout.replace(/\r\n?/g, "\n").split("\n");

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();

    if (isEnvVarName(key)) {
      keys.add(key);
    }
  }

  return Array.from(keys);
}

function normalizeDotenvContent(value: string): string {
  const text = value.replace(/\r\n?/g, "\n").trimEnd();
  if (text.length === 0) return "";
  return `${text}\n`;
}

function isEnvVarName(value: string | undefined): value is string {
  if (!value) return false;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}
