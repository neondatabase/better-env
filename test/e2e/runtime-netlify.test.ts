import { describe, it, expect, beforeAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const packageRoot = path.resolve(import.meta.dir, "..", "..");
const cliPath = path.join(packageRoot, "src", "cli.ts");
const pkgIndexPath = path.join(packageRoot, "src", "index.ts");
const fakeNetlifyBin = path.join(packageRoot, "test", "bin", "netlify");

beforeAll(async () => {
  await fs.promises.chmod(fakeNetlifyBin, 0o755);
});

describe("better-env runtime with Netlify adapter (e2e)", () => {
  it("init links project, upserts, and pulls preview context", async () => {
    const projectDir = await makeTempProject();
    await writeConfig(projectDir);

    const init = await runCli(projectDir, ["init"]);
    expect(init.exitCode).toBe(0);
    expect(fs.existsSync(path.join(projectDir, ".netlify", "state.json"))).toBe(
      true,
    );

    const upsert = await runCli(projectDir, [
      "upsert",
      "API_URL",
      "https://example.com",
      "--environment",
      "preview",
    ]);
    expect(upsert.exitCode).toBe(0);

    const pull = await runCli(projectDir, ["pull", "--environment", "preview"]);
    expect(pull.exitCode).toBe(0);

    const envPreview = await fs.promises.readFile(
      path.join(projectDir, ".env.preview"),
      "utf8",
    );
    expect(envPreview).toContain("API_URL=https://example.com");
  });

  it("update fails when key does not exist", async () => {
    const projectDir = await makeTempProject();
    await writeConfig(projectDir);

    await runCli(projectDir, ["init"]);

    const res = await runCli(projectDir, [
      "update",
      "DOES_NOT_EXIST",
      "value",
      "--environment",
      "development",
    ]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("does not exist");
  });

  it("load --replace deletes keys not present in file", async () => {
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

    await runCli(projectDir, ["pull", "--environment", "production"]);
    const envProduction = await fs.promises.readFile(
      path.join(projectDir, ".env.production"),
      "utf8",
    );
    expect(envProduction).not.toContain("A=1");
    expect(envProduction).toContain("B=22");
    expect(envProduction).toContain("C=3");
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
    `import { defineBetterEnv, netlifyAdapter } from ${JSON.stringify(pkgIndexUrl)};`,
    "",
    "export default defineBetterEnv({",
    `  adapter: netlifyAdapter({ netlifyBin: ${JSON.stringify(fakeNetlifyBin)} }),`,
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
