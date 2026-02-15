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
const demoSourceDir = path.join(packageRoot, "examples", "next-demo");
const testAppsRoot = path.join(packageRoot, "e2e", "test-apps");
const testAppDir = path.join(testAppsRoot, "next");

const runLiveVercelE2E = process.env.BETTER_ENV_REAL_VERCEL_E2E === "1";
const liveIt = runLiveVercelE2E ? it : it.skip;

describe("better-env live Vercel e2e (next demo)", () => {
  liveIt(
    "copies the demo app, runs env command matrix against a fresh Vercel project, and cleans up",
    async () => {
      const whoami = await runCommand(packageRoot, ["vercel", "whoami"]);
      assertOk(whoami, "vercel whoami");

      await cleanupTestApp();
      await copyDemoToTestApp();

      const linkLocalPackage = await runCommand(packageRoot, ["bun", "link"]);
      assertOk(linkLocalPackage, "bun link");

      const install = await runCommand(testAppDir, ["bun", "install"]);
      assertOk(install, "bun install (test app)");

      const projectName = createProjectName();
      let createdProject = false;

      try {
        const addProject = await runCommand(testAppDir, [
          "vercel",
          "project",
          "add",
          projectName,
        ]);
        assertOk(addProject, `vercel project add ${projectName}`);
        createdProject = true;

        const linkProject = await runCommand(testAppDir, [
          "vercel",
          "link",
          "--yes",
          "--project",
          projectName,
        ]);
        assertOk(linkProject, `vercel link --project ${projectName}`);

        const projectJsonPath = path.join(
          testAppDir,
          ".vercel",
          "project.json",
        );
        if (!fs.existsSync(projectJsonPath)) {
          throw new Error(
            `Expected linked project file at ${projectJsonPath}, but it was not found.`,
          );
        }

        const verify = await runCommand(testAppDir, [
          "bash",
          "./scripts/verify-cli.sh",
        ]);
        assertOk(verify, "scripts/verify-cli.sh");

        if (!verify.stdout.includes("Verification complete.")) {
          throw new Error(
            "verify-cli.sh did not reach completion marker.\n" +
              formatCommandOutput(verify),
          );
        }
      } finally {
        if (createdProject) {
          const removeProject = await runCommand(
            testAppDir,
            ["vercel", "project", "remove", projectName],
            { stdin: "y\n" },
          );

          if (removeProject.exitCode !== 0) {
            console.error(
              `Failed to remove Vercel project "${projectName}".\n${formatCommandOutput(removeProject)}`,
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
  options?: { stdin?: string },
): Promise<CommandResult> {
  const proc = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: options?.stdin !== undefined ? "pipe" : "ignore",
    env: process.env,
  });

  if (options?.stdin !== undefined && proc.stdin) {
    proc.stdin.write(options.stdin);
    proc.stdin.end();
  }

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

  const ignoredRoots = new Set(["node_modules", ".next", ".vercel"]);

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

function createProjectName(): string {
  const nonce = Math.random().toString(36).slice(2, 8);
  return `better-env-e2e-next-${Date.now()}-${nonce}`;
}
