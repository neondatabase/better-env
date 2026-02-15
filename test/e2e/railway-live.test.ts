import { describe, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

type CommandResult = {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
};

type RailwayWhoami = {
  workspaces?: Array<{ id?: string; name?: string }>;
};

type RailwayInitResult = {
  projectId?: string;
  projectName?: string;
};

type RailwayStatus = {
  id?: string;
  project?: {
    id?: string;
    name?: string;
  };
};

const packageRoot = path.resolve(import.meta.dir, "..", "..");
const demoSourceDir = path.join(packageRoot, "examples", "railway-bun");
const testAppsRoot = path.join(packageRoot, "e2e", "test-apps");
const testAppDir = path.join(testAppsRoot, "railway-bun");

const runLiveRailwayE2E = process.env.BETTER_ENV_REAL_RAILWAY_E2E === "1";
const liveIt = runLiveRailwayE2E ? it : it.skip;

describe("better-env live Railway e2e (bun demo)", () => {
  liveIt(
    "copies the demo app, runs env command matrix against a fresh Railway project, and cleans up",
    async () => {
      const whoami = await runCommand(packageRoot, ["railway", "whoami", "--json"]);
      assertOk(whoami, "railway whoami --json");

      const workspaceId = resolveWorkspaceId(whoami);

      await cleanupTestApp();
      await copyDemoToTestApp();

      const linkLocalPackage = await runCommand(packageRoot, ["bun", "link"]);
      assertOk(linkLocalPackage, "bun link");

      const install = await runCommand(testAppDir, ["bun", "install"]);
      assertOk(install, "bun install (test app)");

      const projectName = createProjectName();
      let createdProjectId: string | null = null;

      try {
        const init = await runCommand(testAppDir, [
          "railway",
          "init",
          "--name",
          projectName,
          "--workspace",
          workspaceId,
          "--json",
        ]);
        assertOk(init, `railway init ${projectName}`);

        const initResult = safeJsonParse<RailwayInitResult>(init.stdout);
        createdProjectId =
          initResult?.projectId && initResult.projectId.length > 0
            ? initResult.projectId
            : null;

        const addService = await runCommand(testAppDir, [
          "railway",
          "add",
          "--service",
          "app",
          "--json",
        ]);
        assertOk(addService, "railway add --service app");

        const linkService = await runCommand(testAppDir, [
          "railway",
          "service",
          "link",
          "app",
        ]);
        assertOk(linkService, "railway service link app");

        const status = await runCommand(testAppDir, [
          "railway",
          "status",
          "--json",
        ]);
        assertOk(status, "railway status --json");

        if (!createdProjectId) {
          createdProjectId = resolveProjectId(status);
        }

        const linkProject = await runCommand(testAppDir, [
          "railway",
          "link",
          "--project",
          createdProjectId,
          "--service",
          "app",
          "--environment",
          "production",
          "--json",
        ]);
        assertOk(linkProject, `railway link --project ${createdProjectId}`);

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
        if (createdProjectId) {
          const removeProject = await runCommand(packageRoot, [
            "railway",
            "delete",
            "--project",
            createdProjectId,
            "-y",
            "--json",
          ]);

          if (removeProject.exitCode !== 0) {
            console.error(
              `Failed to remove Railway project "${createdProjectId}".\n${formatCommandOutput(removeProject)}`,
            );
          }
        }

        await cleanupTestApp();
      }
    },
    20 * 60_000,
  );
});

function resolveWorkspaceId(whoami: CommandResult): string {
  const explicitWorkspace = process.env.BETTER_ENV_RAILWAY_WORKSPACE;
  if (typeof explicitWorkspace === "string" && explicitWorkspace.length > 0) {
    return explicitWorkspace;
  }

  const parsed = safeJsonParse<RailwayWhoami>(whoami.stdout);
  const workspaces = parsed?.workspaces;
  if (!Array.isArray(workspaces) || workspaces.length === 0) {
    throw new Error(
      "Could not resolve Railway workspace from `railway whoami --json`.\n" +
        formatCommandOutput(whoami),
    );
  }

  const firstWithId = workspaces.find(
    (workspace): workspace is { id: string; name?: string } =>
      typeof workspace.id === "string" && workspace.id.length > 0,
  );
  if (firstWithId) {
    return firstWithId.id;
  }

  throw new Error("No Railway workspace id found.");
}

function resolveProjectId(status: CommandResult): string {
  const parsed = safeJsonParse<RailwayStatus>(status.stdout);
  const fromTop = parsed?.id;
  if (typeof fromTop === "string" && fromTop.length > 0) {
    return fromTop;
  }
  const fromNested = parsed?.project?.id;
  if (typeof fromNested === "string" && fromNested.length > 0) {
    return fromNested;
  }

  throw new Error(
    "Could not resolve Railway project id from `railway status --json`.\n" +
      formatCommandOutput(status),
  );
}

async function runCommand(
  cwd: string,
  command: string[],
): Promise<CommandResult> {
  const proc = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
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

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function copyDemoToTestApp(): Promise<void> {
  await fs.promises.mkdir(testAppsRoot, { recursive: true });

  const ignoredRoots = new Set(["node_modules", ".railway"]);

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
  return `be2e${Date.now()}${nonce}`;
}
