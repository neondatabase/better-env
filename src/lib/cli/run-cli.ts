import { formatHelp } from "./usage.ts";
import { parseCliArgs } from "./argv.ts";
import { exec } from "../exec/exec.ts";
import {
  loadBetterEnvConfig,
  resolveProjectDir,
} from "../runtime/load-config.ts";
import {
  addEnvVar,
  deleteEnvVar,
  initProject,
  loadEnvFileToRemote,
  pullEnv,
  runWithEnv,
} from "../runtime/runtime.ts";
import { validateEnv } from "../validate-env/validate-env.ts";

export async function runCli(argv: string[]): Promise<void> {
  const parsed = parseCliArgs(argv);

  if (parsed.commandPath.length === 0) {
    console.log(formatHelp());
    process.exit(0);
  }

  const [cmd, subcmd] = parsed.commandPath;

  if (cmd === "help" || parsed.flags.help) {
    console.log(formatHelp());
    process.exit(0);
  }

  const cwd = parsed.flags.cwd ?? process.cwd();
  if (cmd === "validate") {
    const res = await validateEnv({
      environment: parsed.flags.environment,
      projectDir: cwd,
    });
    process.exit(res.exitCode);
  }

  const configModule = await loadBetterEnvConfig({ cwd });
  const projectDir = resolveProjectDir(configModule);

  const ctx = { projectDir, exec };

  if (cmd === "init") {
    await initProject({
      ctx,
      config: configModule.config,
      yes: parsed.flags.yes,
    });
    return;
  }

  if (cmd === "pull") {
    await pullEnv({
      ctx,
      config: configModule.config,
      environmentName: parsed.flags.environment,
    });
    return;
  }

  if (cmd === "dev") {
    const devCommand = configModule.config.runtime?.devCommand;
    if (!devCommand || devCommand.length === 0) {
      console.error(
        'Missing `runtime.devCommand` in better-env.ts. Example: { runtime: { devCommand: ["next", "dev"] } }',
      );
      process.exit(1);
    }

    const res = await runWithEnv({
      ctx,
      config: configModule.config,
      environmentName: parsed.flags.environment,
      command: devCommand,
    });
    process.exit(res.exitCode);
  }

  if (cmd === "run") {
    const res = await runWithEnv({
      ctx,
      config: configModule.config,
      environmentName: parsed.flags.environment,
      command: parsed.dashDash,
    });
    process.exit(res.exitCode);
  }

  if (cmd === "add" || cmd === "upsert" || cmd === "update") {
    const key = parsed.positionals[0];
    const value = parsed.positionals[1];
    if (!key || value === undefined) {
      console.error(`Missing arguments: ${cmd} <key> <value>`);
      process.exit(1);
    }
    await addEnvVar({
      ctx,
      config: configModule.config,
      mode: cmd,
      environmentName: parsed.flags.environment,
      key,
      value,
      sensitive: parsed.flags.sensitive,
    });
    return;
  }

  if (cmd === "delete") {
    const key = parsed.positionals[0];
    if (!key) {
      console.error("Missing arguments: delete <key>");
      process.exit(1);
    }
    await deleteEnvVar({
      ctx,
      config: configModule.config,
      environmentName: parsed.flags.environment,
      key,
    });
    return;
  }

  if (cmd === "load") {
    const filePath = parsed.positionals[0];
    if (!filePath) {
      console.error("Missing arguments: load <file>");
      process.exit(1);
    }
    await loadEnvFileToRemote({
      ctx,
      config: configModule.config,
      environmentName: parsed.flags.environment,
      filePath,
      mode: parsed.flags.mode,
      sensitive: parsed.flags.sensitive,
    });
    return;
  }

  if (cmd === "environments" || cmd === "envs") {
    if (subcmd === "list" || parsed.flags.list) {
      const envs = await configModule.config.adapter.listEnvironments(ctx);
      for (const env of envs) {
        console.log(env);
      }
      return;
    }
    if (subcmd === "create") {
      console.error(
        `Adapter "${configModule.config.adapter.name}" does not support creating environments.`,
      );
      process.exit(1);
    }
    if (subcmd === "delete") {
      console.error(
        `Adapter "${configModule.config.adapter.name}" does not support deleting environments.`,
      );
      process.exit(1);
    }
    console.error(
      "Unsupported environments subcommand (v1 supports only: environments list)",
    );
    process.exit(1);
  }

  console.error(`Unknown command: ${cmd}`);
  console.log(formatHelp());
  process.exit(1);
}
