import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { BetterEnvAdapter, BetterEnvConfig } from "./types.ts";
import { findUp } from "../fs/find-up.ts";

export type LoadedBetterEnvConfig = {
  configPath: string;
  config: BetterEnvConfig;
};

export async function loadBetterEnvConfig(options: {
  cwd: string;
}): Promise<LoadedBetterEnvConfig> {
  const configPath = findUp(options.cwd, ["better-env.ts", "better-env.js"]);
  if (!configPath) {
    throw new Error(
      "No better-env.ts found. Create one in your project root and export a config.",
    );
  }

  const mod = await import(pathToFileURL(configPath).toString());

  const candidate =
    "default" in mod && mod.default !== undefined ? mod.default : mod;

  const config = coerceConfig(candidate);

  return { configPath, config };
}

export function resolveProjectDir(loaded: LoadedBetterEnvConfig): string {
  return path.dirname(loaded.configPath);
}

function coerceConfig(value: unknown): BetterEnvConfig {
  if (isBetterEnvConfig(value)) {
    return withDefaults(value);
  }

  if (isBetterEnvAdapter(value)) {
    return withDefaults({ adapter: value });
  }

  throw new Error(
    "Invalid better-env.ts export. Expected `export default defineBetterEnv({ adapter: ... })` (or default export of an adapter).",
  );
}

function withDefaults(config: BetterEnvConfig): BetterEnvConfig {
  const adapterDefaults = config.adapter.defaultEnvironments?.();
  const envs =
    config.environments ??
    adapterDefaults ??
    ({
      development: {
        envFile: ".env.development",
        remote: "development",
      },
      preview: {
        envFile: ".env.preview",
        remote: "preview",
      },
      production: {
        envFile: ".env.production",
        remote: "production",
      },
      test: {
        envFile: ".env.test",
        remote: null,
      },
    } satisfies Record<string, { envFile: string; remote: string | null }>);

  return {
    ...config,
    environments: envs,
    gitignore: {
      ensure: config.gitignore?.ensure ?? true,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBetterEnvConfig(value: unknown): value is BetterEnvConfig {
  if (!isRecord(value)) return false;
  if (!("adapter" in value)) return false;
  return isBetterEnvAdapter(value.adapter);
}

function isBetterEnvAdapter(value: unknown): value is BetterEnvAdapter {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === "string" &&
    typeof value.init === "function" &&
    typeof value.pull === "function" &&
    typeof value.add === "function" &&
    typeof value.upsert === "function" &&
    typeof value.update === "function" &&
    typeof value.delete === "function" &&
    typeof value.listEnvironments === "function"
  );
}
