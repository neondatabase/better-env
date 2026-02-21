import nextEnv from "@next/env";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { ValidateEnvOptions } from "./types.ts";
import { loadModuleFromPath } from "../runtime/load-module.ts";

// ANSI colors
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

const BUILT_IN_IGNORED_UNUSED_ENV_VARS = [
  // System
  "NODE_ENV",
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "TERM",
  "LANG",
  "PWD",
  "OLDPWD",
  "HOSTNAME",
  "LOGNAME",
  "TMPDIR",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "CI",
  "TZ",
  // Vercel
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_REGION",
  "VERCEL_TARGET_ENV",
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_GIT_COMMIT_MESSAGE",
  "VERCEL_GIT_COMMIT_AUTHOR_LOGIN",
  "VERCEL_GIT_COMMIT_AUTHOR_NAME",
  "VERCEL_GIT_PREVIOUS_SHA",
  "VERCEL_GIT_PROVIDER",
  "VERCEL_GIT_REPO_ID",
  "VERCEL_GIT_REPO_OWNER",
  "VERCEL_GIT_REPO_SLUG",
  "VERCEL_GIT_COMMIT_REF",
  "VERCEL_GIT_PULL_REQUEST_ID",
  // Build tools (Turbo, NX)
  "TURBO_CACHE",
  "TURBO_REMOTE_ONLY",
  "TURBO_RUN_SUMMARY",
  "TURBO_DOWNLOAD_LOCAL_ENABLED",
  "NX_DAEMON",
] as const;

export async function validateEnv(
  options: ValidateEnvOptions = {},
): Promise<{ exitCode: number }> {
  const projectDir = options.projectDir ?? process.cwd();
  const environment =
    options.environment ?? process.env.NODE_ENV ?? "development";
  // Node's ProcessEnv type may mark NODE_ENV as readonly in newer typings.
  (process.env as Record<string, string | undefined>).NODE_ENV = environment;

  console.log(bold("\n🔍 Environment Configuration Validator\n"));
  console.log(dim(`  Environment: ${environment}\n`));

  // Load env files using Next.js semantics.
  const isDev = environment === "development";
  console.log(dim("  Loading environment files..."));

  const loadedEnvFiles: string[] = [];
  const { loadedEnvFiles: files } = nextEnv.loadEnvConfig(projectDir, isDev);

  for (const file of files) {
    loadedEnvFiles.push(file.path);
    console.log(dim(`    ✓ ${path.relative(projectDir, file.path)}`));
  }

  if (loadedEnvFiles.length === 0) {
    console.log(dim("    No .env files found"));
  }

  console.log("");

  // Track which env vars are referenced by configs
  const referencedEnvVars = new Set<string>();
  trackEnvAccess(referencedEnvVars);

  // Find all config.ts files in src/lib/*/
  const configFiles = await findConfigFiles(projectDir);

  if (configFiles.length === 0) {
    console.log(yellow("  ⚠ No config.ts files found in src/lib/*/\n"));
    return { exitCode: 0 };
  }

  console.log(dim(`  Found ${configFiles.length} config files:\n`));

  // Validate each config by importing it (triggers configSchema validation)
  const errors: { file: string; error: Error }[] = [];
  const validated: string[] = [];

  for (const configFile of configFiles) {
    const relativePath = configFile;
    const absolutePath = path.join(projectDir, configFile);

    try {
      await loadModuleFromPath(absolutePath);
      console.log(green(`  ✓ ${relativePath}`));
      validated.push(relativePath);
    } catch (err) {
      const error = coerceError(err);
      console.log(red(`  ✗ ${relativePath}`));
      errors.push({ file: relativePath, error });
    }
  }

  console.log("");

  if (errors.length > 0) {
    console.log(red(bold("Validation Errors:\n")));
    for (const { file, error } of errors) {
      console.log(red(`  ${file}:`));
      const message = error.message.split("\n").slice(0, 3).join("\n    ");
      console.log(red(`    ${message}\n`));
    }
  }

  const unused = await findUnusedEnvVars({
    projectDir,
    loadedEnvFiles,
    referencedEnvVars,
    ignoredUnusedEnvVars: options.ignoredUnusedEnvVars,
  });

  if (unused.length > 0) {
    console.log(yellow(bold("Unused Environment Variables:\n")));
    console.log(
      dim(
        "  These variables are defined in .env files but not used by any config:\n",
      ),
    );

    for (const { name, files: defs } of unused) {
      console.log(yellow(`  ⚠ ${name}`));
      console.log(dim(`    defined in: ${defs.join(", ")}`));
    }

    console.log("");
  }

  console.log(bold("Summary:\n"));
  console.log(`  Configs validated: ${green(String(validated.length))}`);
  console.log(
    `  Validation errors: ${errors.length > 0 ? red(String(errors.length)) : green("0")}`,
  );
  console.log(
    `  Unused env vars:   ${unused.length > 0 ? yellow(String(unused.length)) : green("0")}`,
  );
  console.log("");

  return { exitCode: errors.length > 0 ? 1 : 0 };
}

function trackEnvAccess(referencedEnvVars: Set<string>): void {
  const originalEnv = process.env;
  process.env = new Proxy(originalEnv, {
    get(target, prop) {
      if (typeof prop === "string" && !prop.startsWith("_")) {
        referencedEnvVars.add(prop);
      }
      return Reflect.get(target, prop);
    },
  });
}

function coerceError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(typeof err === "string" ? err : "Unknown error");
}

async function findUnusedEnvVars(options: {
  projectDir: string;
  loadedEnvFiles: string[];
  referencedEnvVars: ReadonlySet<string>;
  ignoredUnusedEnvVars?: readonly string[];
}): Promise<{ name: string; files: string[] }[]> {
  const envVarsInFiles = new Set<string>();

  for (const envFile of options.loadedEnvFiles) {
    try {
      const content = await readFile(envFile, "utf8");
      const lines = content.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
        if (match) {
          const envVarName = match[1];
          if (envVarName) {
            envVarsInFiles.add(envVarName);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const ignoredVars = new Set<string>([
    ...BUILT_IN_IGNORED_UNUSED_ENV_VARS,
    ...(options.ignoredUnusedEnvVars ?? []),
  ]);

  const unused: { name: string; files: string[] }[] = [];

  for (const envVar of envVarsInFiles) {
    if (ignoredVars.has(envVar)) continue;
    if (options.referencedEnvVars.has(envVar)) continue;

    const definingFiles: string[] = [];
    for (const envFile of options.loadedEnvFiles) {
      try {
        const content = await readFile(envFile, "utf8");
        if (new RegExp(`^${envVar}\\s*=`, "m").test(content)) {
          definingFiles.push(path.relative(options.projectDir, envFile));
        }
      } catch {
        // ignore
      }
    }

    if (definingFiles.length > 0) {
      unused.push({ name: envVar, files: definingFiles });
    }
  }

  return unused.sort((a, b) => a.name.localeCompare(b.name));
}

async function findConfigFiles(projectDir: string): Promise<string[]> {
  const configFiles: string[] = [];
  const libDir = path.join(projectDir, "src/lib");

  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = (await readdir(libDir, {
      withFileTypes: true,
    })) as Array<{ name: string; isDirectory(): boolean }>;
  } catch {
    return configFiles;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const absoluteConfigPath = path.join(libDir, entry.name, "config.ts");
    try {
      await access(absoluteConfigPath);
      configFiles.push(path.join("src/lib", entry.name, "config.ts"));
    } catch {
      // ignore
    }
  }

  return configFiles.sort();
}
