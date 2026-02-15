import fs from "node:fs";
import path from "node:path";
import type {
  BetterEnvAdapterContext,
  BetterEnvConfig,
  BetterEnvEnvironmentConfig,
  BetterEnvEnvironmentName,
  BetterEnvLoadMode,
} from "./types.ts";
import { ensureGitIgnored } from "../gitignore/ensure-ignored.ts";
import { parseDotenv } from "../env/dotenv.ts";

export async function initProject(options: {
  ctx: BetterEnvAdapterContext;
  config: BetterEnvConfig;
  yes: boolean;
}): Promise<void> {
  await options.config.adapter.init(options.ctx, { yes: options.yes });
}

export async function pullEnv(options: {
  ctx: BetterEnvAdapterContext;
  config: BetterEnvConfig;
  environmentName?: string;
}): Promise<{ environment: BetterEnvEnvironmentName; envFile: string }> {
  const environment = resolveEnvironmentName(
    options.config,
    options.environmentName,
  );
  const envConfig = getEnvironmentConfig(options.config, environment);

  if (!envConfig.remote) {
    return { environment, envFile: envConfig.envFile };
  }

  await options.config.adapter.pull(options.ctx, {
    environment: envConfig.remote,
    envFile: envConfig.envFile,
  });

  if (options.config.gitignore?.ensure ?? true) {
    await ensureGitIgnored({
      projectDir: options.ctx.projectDir,
      paths: [envConfig.envFile],
    });
  }

  return { environment, envFile: envConfig.envFile };
}

export async function addEnvVar(options: {
  ctx: BetterEnvAdapterContext;
  config: BetterEnvConfig;
  mode: "add" | "upsert" | "update";
  environmentName?: string;
  key: string;
  value: string;
  sensitive: boolean;
}): Promise<void> {
  const environment = resolveEnvironmentName(
    options.config,
    options.environmentName,
  );
  const envConfig = getEnvironmentConfig(options.config, environment);
  if (!envConfig.remote) {
    throw new Error(
      `Environment "${environment}" is local-only (no remote mapping).`,
    );
  }

  if (options.mode === "add") {
    await options.config.adapter.add(options.ctx, {
      environment: envConfig.remote,
      key: options.key,
      value: options.value,
      sensitive: options.sensitive,
    });
    return;
  }

  if (options.mode === "upsert") {
    await options.config.adapter.upsert(options.ctx, {
      environment: envConfig.remote,
      key: options.key,
      value: options.value,
      sensitive: options.sensitive,
    });
    return;
  }

  await options.config.adapter.update(options.ctx, {
    environment: envConfig.remote,
    key: options.key,
    value: options.value,
    sensitive: options.sensitive,
  });
}

export async function deleteEnvVar(options: {
  ctx: BetterEnvAdapterContext;
  config: BetterEnvConfig;
  environmentName?: string;
  key: string;
}): Promise<void> {
  const environment = resolveEnvironmentName(
    options.config,
    options.environmentName,
  );
  const envConfig = getEnvironmentConfig(options.config, environment);
  if (!envConfig.remote) {
    throw new Error(
      `Environment "${environment}" is local-only (no remote mapping).`,
    );
  }

  await options.config.adapter.delete(options.ctx, {
    environment: envConfig.remote,
    key: options.key,
  });
}

export async function loadEnvFileToRemote(options: {
  ctx: BetterEnvAdapterContext;
  config: BetterEnvConfig;
  environmentName?: string;
  filePath: string;
  mode: BetterEnvLoadMode;
  sensitive: boolean;
}): Promise<void> {
  const environment = resolveEnvironmentName(
    options.config,
    options.environmentName,
  );
  const envConfig = getEnvironmentConfig(options.config, environment);
  if (!envConfig.remote) {
    throw new Error(
      `Environment "${environment}" is local-only (no remote mapping).`,
    );
  }

  const absolute = path.isAbsolute(options.filePath)
    ? options.filePath
    : path.join(options.ctx.projectDir, options.filePath);

  const content = await fs.promises.readFile(absolute, "utf8");
  const entries = parseDotenv(content);

  if (options.mode === "replace") {
    const list = options.config.adapter.listEnvVars;
    if (!list) {
      throw new Error(
        `Adapter "${options.config.adapter.name}" does not support --replace yet.`,
      );
    }
    const existingKeys = await list(options.ctx, {
      environment: envConfig.remote,
    });
    const nextKeys = new Set(Object.keys(entries));
    const toDelete = existingKeys.filter((k) => !nextKeys.has(k));

    for (const key of toDelete) {
      await options.config.adapter.delete(options.ctx, {
        environment: envConfig.remote,
        key,
      });
    }
  }

  for (const [key, value] of Object.entries(entries)) {
    if (options.mode === "add") {
      await options.config.adapter.add(options.ctx, {
        environment: envConfig.remote,
        key,
        value,
        sensitive: options.sensitive,
      });
      continue;
    }

    if (options.mode === "update") {
      await options.config.adapter.update(options.ctx, {
        environment: envConfig.remote,
        key,
        value,
        sensitive: options.sensitive,
      });
      continue;
    }

    // Default: upsert
    await options.config.adapter.upsert(options.ctx, {
      environment: envConfig.remote,
      key,
      value,
      sensitive: options.sensitive,
    });
  }
}

function resolveEnvironmentName(
  config: BetterEnvConfig,
  requested: string | undefined,
): BetterEnvEnvironmentName {
  if (!requested) return "development";
  return requested;
}

function getEnvironmentConfig(
  config: BetterEnvConfig,
  name: BetterEnvEnvironmentName,
): BetterEnvEnvironmentConfig {
  const envs = config.environments ?? {};
  const value = envs[name];
  if (!value) {
    const known = Object.keys(envs);
    const hint =
      known.length > 0 ? `Known environments: ${known.join(", ")}` : "";
    throw new Error(`Unknown environment "${name}". ${hint}`.trim());
  }
  return value;
}
