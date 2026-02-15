import { isNonEmptyString } from "../utils/strings.ts";
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
  const positionals: string[] = [];

  let cwd: string | undefined;
  let environment: string | undefined;
  let yes = false;
  let help = false;
  let list = false;
  let sensitive = false;
  let mode: BetterEnvLoadMode = "upsert";

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;

    if (!token.startsWith("-")) {
      positionals.push(token);
      continue;
    }

    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }

    if (token === "--yes" || token === "-y") {
      yes = true;
      continue;
    }

    if (token === "--list") {
      list = true;
      continue;
    }

    if (token === "--sensitive") {
      sensitive = true;
      continue;
    }

    if (token.startsWith("--cwd=")) {
      cwd = token.slice("--cwd=".length);
      continue;
    }

    if (token === "--cwd") {
      const value = argv[i + 1];
      if (isNonEmptyString(value)) {
        cwd = value;
        i += 1;
      }
      continue;
    }

    if (token.startsWith("--environment=")) {
      environment = token.slice("--environment=".length);
      continue;
    }

    if (token === "--environment" || token === "-e") {
      const value = argv[i + 1];
      if (isNonEmptyString(value)) {
        environment = value;
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
      continue;
    }

    if (token.startsWith("--mode=")) {
      const value = token.slice("--mode=".length);
      if (
        value === "add" ||
        value === "update" ||
        value === "upsert" ||
        value === "replace"
      ) {
        mode = value;
      }
      continue;
    }

    // Unknown flag -> treat as positional for now so we don't block iteration.
    positionals.push(token);
  }

  return {
    positionals,
    flags: {
      cwd,
      environment,
      yes,
      help,
      list,
      sensitive,
      mode,
    },
  };
}
