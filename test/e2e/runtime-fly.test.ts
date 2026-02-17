import { describe, it, expect, beforeAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const packageRoot = path.resolve(import.meta.dir, "..", "..");
const cliPath = path.join(packageRoot, "src", "cli.ts");
const pkgIndexPath = path.join(packageRoot, "src", "index.ts");
const fakeFlyBin = path.join(packageRoot, "test", "bin", "fly");

beforeAll(async () => {
  await fs.promises.chmod(fakeFlyBin, 0o755);
});

describe("better-env runtime with Fly adapter (e2e)", () => {
  it("init succeeds and add blocks duplicate keys", async () => {
    const projectDir = await makeTempProject();
    await writeConfig(projectDir);

    const init = await runCli(projectDir, ["init"]);
    expect(init.exitCode).toBe(0);

    const firstAdd = await runCli(projectDir, [
      "add",
      "API_URL",
      "https://example.com",
      "--environment",
      "preview",
    ]);
    expect(firstAdd.exitCode).toBe(0);

    const duplicateAdd = await runCli(projectDir, [
      "add",
      "API_URL",
      "https://duplicate.example.com",
      "--environment",
      "preview",
    ]);
    expect(duplicateAdd.exitCode).toBe(1);
    expect(duplicateAdd.stderr).toContain("already exists");
  });

  it("load --replace removes keys not present in source file", async () => {
    const projectDir = await makeTempProject();
    await writeConfig(projectDir);

    await runCli(projectDir, ["init"]);
    await runCli(projectDir, [
      "upsert",
      "A",
      "1",
      "--environment",
      "production",
    ]);
    await runCli(projectDir, [
      "upsert",
      "B",
      "2",
      "--environment",
      "production",
    ]);

    const loadFile = path.join(projectDir, "to-load.env");
    await fs.promises.writeFile(loadFile, "B=22\nC=3\n", "utf8");

    const load = await runCli(projectDir, [
      "load",
      "to-load.env",
      "--environment",
      "production",
      "--replace",
    ]);
    expect(load.exitCode).toBe(0);

    const store = await readStore(projectDir);
    const appSecrets = store.apps["better-env-fly-test"]?.secrets ?? {};

    expect(appSecrets.A).toBeUndefined();
    expect(appSecrets.B).toBe("22");
    expect(appSecrets.C).toBe("3");
  });

  it("pull fails because Fly does not expose secret values", async () => {
    const projectDir = await makeTempProject();
    await writeConfig(projectDir);

    await runCli(projectDir, ["init"]);
    const pull = await runCli(projectDir, ["pull", "--environment", "preview"]);

    expect(pull.exitCode).toBe(1);
    expect(pull.stderr).toContain("cannot pull secret values");
  });
});

async function makeTempProject(): Promise<string> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "better-env-"));
  await fs.promises.writeFile(path.join(dir, ".gitignore"), "", "utf8");
  return dir;
}

async function writeConfig(projectDir: string): Promise<void> {
  const pkgIndexUrl = pathToFileURL(pkgIndexPath).toString();
  const config = [
    `import { defineBetterEnv, flyAdapter } from ${JSON.stringify(pkgIndexUrl)};`,
    "",
    "export default defineBetterEnv({",
    `  adapter: flyAdapter({ flyBin: ${JSON.stringify(fakeFlyBin)}, app: "better-env-fly-test" }),`,
    "});",
    "",
  ].join("\n");

  await fs.promises.writeFile(
    path.join(projectDir, "better-env.ts"),
    config,
    "utf8",
  );
}

async function runCli(
  projectDir: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", cliPath, ...args], {
    cwd: projectDir,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stdout, stderr };
}

type Store = {
  apps: Record<string, { secrets: Record<string, string> }>;
};

async function readStore(projectDir: string): Promise<Store> {
  const p = path.join(projectDir, ".better-env-test", "fly-store.json");
  const raw = await fs.promises.readFile(p, "utf8");
  const parsed = JSON.parse(raw);
  if (!isStore(parsed)) {
    throw new Error("Invalid fake fly store format.");
  }
  return parsed;
}

function isStore(value: unknown): value is Store {
  if (typeof value !== "object" || value === null) return false;
  if (!("apps" in value)) return false;
  return true;
}
