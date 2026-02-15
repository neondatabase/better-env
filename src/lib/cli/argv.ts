import { Command } from "commander";
import type { BetterEnvLoadMode } from "../runtime/types.ts";

type ParsedCliArgs = {
  commandPath: string[];
  positionals: string[];
  dashDash: string[];
  flags: {
    cwd?: string;
    environment?: string;
    yes: boolean;
    help: boolean;
    list: boolean;
    sensitive: boolean;
    mode: BetterEnvLoadMode;
  };
};

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const dashDashIndex = argv.indexOf("--");
  const beforeDashDash =
    dashDashIndex === -1 ? argv : argv.slice(0, dashDashIndex);
  const dashDash = dashDashIndex === -1 ? [] : argv.slice(dashDashIndex + 1);

  const { positionals, flags } = parseFlags(beforeDashDash);

  const cmd = positionals[0];
  const supportsSubcommand = cmd === "environments" || cmd === "envs";

  const commandPath = supportsSubcommand
    ? positionals.slice(0, 2)
    : positionals.slice(0, 1);

  const rest = positionals.slice(commandPath.length);

  return {
    commandPath,
    positionals: rest,
    dashDash,
    flags,
  };
}

function parseFlags(argv: string[]): {
  positionals: string[];
  flags: ParsedCliArgs["flags"];
} {
  const parser = createFlagParser();
  const parsed = parser.parseOptions(argv);
  const opts = parser.opts<{
    cwd?: string;
    environment?: string;
    yes?: boolean;
    help?: boolean;
    list?: boolean;
    sensitive?: boolean;
  }>();

  const positionals = [...parsed.operands, ...parsed.unknown];
  const mode = resolveLoadMode(argv);

  return {
    positionals,
    flags: {
      cwd: opts.cwd,
      environment: opts.environment,
      yes: opts.yes ?? false,
      help: opts.help ?? false,
      list: opts.list ?? false,
      sensitive: opts.sensitive ?? false,
      mode,
    },
  };
}

function createFlagParser(): Command {
  return new Command()
    .storeOptionsAsProperties(false)
    .helpOption(false)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .option("--cwd <path>")
    .option("-e, --environment <name>")
    .option("-y, --yes")
    .option("-h, --help")
    .option("--list")
    .option("--sensitive")
    .option("--mode <mode>");
}

function resolveLoadMode(argv: string[]): BetterEnvLoadMode {
  let mode: BetterEnvLoadMode = "upsert";

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;

    if (token.startsWith("--mode=")) {
      const value = token.slice("--mode=".length);
      if (isLoadMode(value)) {
        mode = value;
      }
      continue;
    }

    if (token === "--mode") {
      const value = argv[i + 1];
      if (isLoadMode(value)) {
        mode = value;
        i += 1;
      }
      continue;
    }

    if (token === "--add") {
      mode = "add";
      continue;
    }
    if (token === "--update") {
      mode = "update";
      continue;
    }
    if (token === "--upsert") {
      mode = "upsert";
      continue;
    }
    if (token === "--replace") {
      mode = "replace";
    }
  }

  return mode;
}

function isLoadMode(value: string | undefined): value is BetterEnvLoadMode {
  return (
    value === "add" ||
    value === "update" ||
    value === "upsert" ||
    value === "replace"
  );
}
