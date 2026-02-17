import { describe, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

type CommandResult = {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
};

const packageRoot = path.resolve(import.meta.dir, "..", "..");
const demoSourceDir = path.join(packageRoot, "examples", "fly-node");
const testAppsRoot = path.join(packageRoot, "e2e", "test-apps");
const testAppDir = path.join(testAppsRoot, "fly-node");

const runLiveFlyE2E = process.env.BETTER_ENV_REAL_FLY_E2E === "1";
const liveIt = runLiveFlyE2E ? it : it.skip;

describe("better-env live Fly e2e (node demo)", () => {
  liveIt(
    "copies the demo app, runs env command matrix against a fresh Fly app, and cleans up",
    async () => {
      const whoami = await runCommand(packageRoot, ["fly", "auth", "whoami"]);
      assertOk(whoami, "fly auth whoami");

      await cleanupTestApp();
      await copyDemoToTestApp();

      const linkLocalPackage = await runCommand(packageRoot, ["bun", "link"]);
      assertOk(linkLocalPackage, "bun link");

      const install = await runCommand(testAppDir, ["bun", "install"]);
      assertOk(install, "bun install (test app)");

      const appName = createAppName();
      let createdApp = false;

      try {
        const createApp = await runCommand(packageRoot, ["fly", "apps", "create", appName]);
        assertOk(createApp, `fly apps create ${appName}`);
        createdApp = true;

        const verify = await runCommand(
          testAppDir,
          ["bash", "./scripts/verify-cli.sh"],
          { BETTER_ENV_FLY_APP: appName },
        );
        assertOk(verify, "scripts/verify-cli.sh");

        if (!verify.stdout.includes("Verification complete.")) {
          throw new Error(
            "verify-cli.sh did not reach completion marker.\n" +
              formatCommandOutput(verify),
          );
        }
      } finally {
        if (createdApp) {
          const removeApp = await runCommand(packageRoot, [
            "fly",
            "apps",
            "destroy",
            appName,
            "--yes",
          ]);

          if (removeApp.exitCode !== 0) {
            console.error(
              `Failed to remove Fly app "${appName}".\n${formatCommandOutput(removeApp)}`,
            );
          }
        }

        await cleanupTestApp();
      }
    },
    20 * 60_000,
  );
});

async function runCommand(
  cwd: string,
  command: string[],
  extraEnv?: Record<string, string>,
): Promise<CommandResult> {
  const proc = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...extraEnv },
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { command, exitCode, stdout, stderr };
}

function assertOk(result: CommandResult, label: string): void {
  if (result.exitCode === 0) return;
  throw new Error(`${label} failed.\n${formatCommandOutput(result)}`);
}

function formatCommandOutput(result: CommandResult): string {
  return [
    `Command: ${result.command.join(" ")}`,
    `Exit code: ${result.exitCode}`,
    "",
    "STDOUT:",
    result.stdout || "(empty)",
    "",
    "STDERR:",
    result.stderr || "(empty)",
  ].join("\n");
}

async function copyDemoToTestApp(): Promise<void> {
  await fs.promises.mkdir(testAppsRoot, { recursive: true });

  const ignoredRoots = new Set(["node_modules"]);

  await fs.promises.cp(demoSourceDir, testAppDir, {
    recursive: true,
    force: true,
    filter: (src) => {
      const rel = path.relative(demoSourceDir, src);
      if (rel.length === 0) return true;
      const root = rel.split(path.sep)[0];
      if (!root) return true;
      return !ignoredRoots.has(root);
    },
  });
}

async function cleanupTestApp(): Promise<void> {
  await fs.promises.rm(testAppDir, { recursive: true, force: true });
}

function createAppName(): string {
  const nonce = Math.random().toString(36).slice(2, 8);
  return `be2e-fly-${Date.now()}-${nonce}`;
}
