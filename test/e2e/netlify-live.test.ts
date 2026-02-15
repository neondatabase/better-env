import { describe, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

type CommandResult = {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
};

type NetlifyAccount = {
  slug?: string;
  default?: boolean;
};

type NetlifySite = {
  id?: string;
};

const packageRoot = path.resolve(import.meta.dir, "..", "..");
const demoSourceDir = path.join(packageRoot, "examples", "netlify-react-router");
const testAppsRoot = path.join(packageRoot, "e2e", "test-apps");
const testAppDir = path.join(testAppsRoot, "netlify-react-router");

const runLiveNetlifyE2E = process.env.BETTER_ENV_REAL_NETLIFY_E2E === "1";
const liveIt = runLiveNetlifyE2E ? it : it.skip;

describe("better-env live Netlify e2e (react-router demo)", () => {
  liveIt(
    "copies the demo app, runs env command matrix against a fresh Netlify project, and cleans up",
    async () => {
      const whoami = await runCommand(packageRoot, ["netlify", "api", "getCurrentUser"]);
      assertOk(whoami, "netlify api getCurrentUser");

      await cleanupTestApp();
      await copyDemoToTestApp();

      const linkLocalPackage = await runCommand(packageRoot, ["bun", "link"]);
      assertOk(linkLocalPackage, "bun link");

      const install = await runCommand(testAppDir, ["bun", "install"]);
      assertOk(install, "bun install (test app)");

      const accountSlug = await resolveNetlifyAccountSlug();
      const projectName = createProjectName();

      let createdSiteId: string | null = null;

      try {
        createdSiteId = await createNetlifySite(accountSlug, projectName);

        const linkProject = await runCommand(testAppDir, [
          "netlify",
          "link",
          "--id",
          createdSiteId,
        ]);
        assertOk(linkProject, `netlify link --id ${createdSiteId}`);

        const stateJsonPath = path.join(testAppDir, ".netlify", "state.json");
        if (!fs.existsSync(stateJsonPath)) {
          throw new Error(
            `Expected linked project file at ${stateJsonPath}, but it was not found.`,
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
        if (createdSiteId) {
          const removeSite = await runCommand(packageRoot, [
            "netlify",
            "api",
            "deleteSite",
            "--data",
            JSON.stringify({ site_id: createdSiteId }),
          ]);

          if (removeSite.exitCode !== 0) {
            console.error(
              `Failed to remove Netlify site "${createdSiteId}".\n${formatCommandOutput(removeSite)}`,
            );
          }
        }

        await cleanupTestApp();
      }
    },
    20 * 60_000,
  );
});

async function resolveNetlifyAccountSlug(): Promise<string> {
  const listAccounts = await runCommand(packageRoot, [
    "netlify",
    "api",
    "listAccountsForUser",
  ]);
  assertOk(listAccounts, "netlify api listAccountsForUser");

  const accounts = safeJsonParse<NetlifyAccount[]>(listAccounts.stdout);
  if (!Array.isArray(accounts)) {
    throw new Error(
      "Unexpected response shape from netlify api listAccountsForUser.\n" +
        formatCommandOutput(listAccounts),
    );
  }

  const defaultAccount = accounts.find(
    (entry): entry is NetlifyAccount & { slug: string } =>
      typeof entry?.slug === "string" && entry.default === true,
  );
  if (defaultAccount) {
    return defaultAccount.slug;
  }

  const firstAccount = accounts.find(
    (entry): entry is NetlifyAccount & { slug: string } =>
      typeof entry?.slug === "string",
  );
  if (firstAccount) {
    return firstAccount.slug;
  }

  throw new Error(
    "Could not determine a Netlify account slug from listAccountsForUser output.",
  );
}

async function createNetlifySite(
  accountSlug: string,
  projectName: string,
): Promise<string> {
  const create = await runCommand(packageRoot, [
    "netlify",
    "api",
    "createSiteInTeam",
    "--data",
    JSON.stringify({
      account_slug: accountSlug,
      body: { name: projectName },
    }),
  ]);
  assertOk(create, `netlify api createSiteInTeam (${projectName})`);

  const site = safeJsonParse<NetlifySite>(create.stdout);
  if (!site || typeof site.id !== "string" || site.id.length === 0) {
    throw new Error(
      "Netlify createSiteInTeam response did not include a site id.\n" +
        formatCommandOutput(create),
    );
  }

  return site.id;
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

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
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

  const ignoredRoots = new Set([
    "node_modules",
    ".netlify",
    ".react-router",
    "build",
  ]);

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
  return `better-env-e2e-netlify-react-router-${Date.now()}-${nonce}`;
}
