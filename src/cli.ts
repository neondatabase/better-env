#!/usr/bin/env bun
import { runCli } from "./lib/cli/run-cli.ts";

try {
  await runCli(process.argv.slice(2));
} catch (err) {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Unknown error";
  console.error(message);
  process.exit(1);
}
