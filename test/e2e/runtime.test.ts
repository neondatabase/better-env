import { describe, it, expect, beforeAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const packageRoot = path.resolve(import.meta.dir, "..", "..");
const cliPath = path.join(packageRoot, "src", "cli.ts");
const pkgIndexPath = path.join(packageRoot, "src", "index.ts");
const fakeVercelBin = path.join(packageRoot, "test", "bin", "vercel");

beforeAll(async () => {
  await fs.promises.chmod(fakeVercelBin, 0o755);
});

describe("better-env runtime (e2e)", () => {
  it("init -y creates better-env.ts using inferred provider", async () => {
    const projectDir = await makeTempProject();
    await fs.promises.mkdir(path.join(projectDir, ".vercel"), {
      recursive: true,
    });

    const init = await runCli(projectDir, ["init", "--yes"]);
    expect(init.exitCode).toBe(0);

    const configText = await fs.promises.readFile(
      path.join(projectDir, "better-env.ts"),
      "utf8",
    );
    expect(configText).toContain("vercelAdapter");
    expect(configText).toContain('from "better-env"');
  });

  it("init -y infers Convex when convex markers are present", async () => {
    const projectDir = await makeTempProject();
    await fs.promises.mkdir(path.join(projectDir, "convex"), {
      recursive: true,
    });

    const init = await runCli(projectDir, ["init", "--yes"]);
    expect(init.exitCode).toBe(0);

    const configText = await fs.promises.readFile(
      path.join(projectDir, "better-env.ts"),
      "utf8",
    );
    expect(configText).toContain("convexAdapter");
    expect(configText).toContain('from "better-env"');
  });

  it("init links project, upserts, pulls, and ensures gitignore", async () => {
    const projectDir = await makeTempProject();
    await writeConfig(projectDir);

    const init = await runCli(projectDir, ["init"]);
    expect(init.exitCode).toBe(0);

    expect(
      fs.existsSync(path.join(projectDir, ".vercel", "project.json")),
    ).toBe(true);

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

    const gitignore = await fs.promises.readFile(
      path.join(projectDir, ".gitignore"),
      "utf8",
    );
    expect(gitignore).toContain(".env.preview");
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

    await runCli(projectDir, ["upsert", "A", "1", "--environment", "preview"]);
    await runCli(projectDir, ["upsert", "B", "2", "--environment", "preview"]);

    const loadFile = path.join(projectDir, "to-load.env");
    await fs.promises.writeFile(loadFile, "B=22\nC=3\n", "utf8");

    const load = await runCli(projectDir, [
      "load",
      "to-load.env",
      "--environment",
      "preview",
      "--replace",
    ]);
    expect(load.exitCode).toBe(0);

    await runCli(projectDir, ["pull", "--environment", "preview"]);
    const envPreview = await fs.promises.readFile(
      path.join(projectDir, ".env.preview"),
      "utf8",
    );
    expect(envPreview).not.toContain("A=1");
    expect(envPreview).toContain("B=22");
    expect(envPreview).toContain("C=3");
  });

  it("validate ignores adapter defaults and per-env ignoreUnused keys", async () => {
    const projectDir = await makeTempProject();
    await writeConfig(projectDir, {
      environmentsBlock:
        '{ development: { envFile: ".env.development", remote: "development", ignoreUnused: ["MANUAL_IGNORE"] } }',
    });
    await writeValidationConfigModule(projectDir);
    await fs.promises.writeFile(
      path.join(projectDir, ".env.development"),
      [
        "REFERENCED_KEY=ok",
        "VERCEL_OIDC_TOKEN=token",
        "MANUAL_IGNORE=1",
        "UNUSED_SHOULD_WARN=1",
        "",
      ].join("\n"),
      "utf8",
    );

    const validate = await runCli(projectDir, [
      "validate",
      "--environment",
      "development",
    ]);
    expect(validate.exitCode).toBe(0);
    expect(validate.stdout).toContain("UNUSED_SHOULD_WARN");
    expect(validate.stdout).not.toContain("VERCEL_OIDC_TOKEN");
    expect(validate.stdout).not.toContain("MANUAL_IGNORE");
  });

  it("validate applies ignoreUnused only for the active environment", async () => {
    const projectDir = await makeTempProject();
    await writeConfig(projectDir, {
      environmentsBlock:
        '{ preview: { envFile: ".env.preview", remote: "preview", ignoreUnused: ["PREVIEW_ONLY_IGNORE"] } }',
    });
    await writeValidationConfigModule(projectDir);
    await fs.promises.writeFile(
      path.join(projectDir, ".env.development"),
      ["REFERENCED_KEY=ok", "PREVIEW_ONLY_IGNORE=1", ""].join("\n"),
      "utf8",
    );

    const validate = await runCli(projectDir, [
      "validate",
      "--environment",
      "development",
    ]);
    expect(validate.exitCode).toBe(0);
    expect(validate.stdout).toContain("PREVIEW_ONLY_IGNORE");
  });
});

async function makeTempProject(): Promise<string> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "better-env-"));
  await fs.promises.writeFile(path.join(dir, ".gitignore"), "", "utf8");
  return dir;
}

async function writeConfig(
  projectDir: string,
  options: { environmentsBlock?: string } = {},
): Promise<void> {
  const pkgIndexUrl = pathToFileURL(pkgIndexPath).toString();
  const config = [
    `import { defineBetterEnv, vercelAdapter } from ${JSON.stringify(pkgIndexUrl)};`,
    "",
    "export default defineBetterEnv({",
    `  adapter: vercelAdapter({ vercelBin: ${JSON.stringify(fakeVercelBin)} }),`,
    ...(options.environmentsBlock
      ? [`  environments: ${options.environmentsBlock},`]
      : []),
    "});",
    "",
  ].join("\n");

  await fs.promises.writeFile(
    path.join(projectDir, "better-env.ts"),
    config,
    "utf8",
  );
}

async function writeValidationConfigModule(projectDir: string): Promise<void> {
  const configDir = path.join(projectDir, "src", "lib", "app");
  await fs.promises.mkdir(configDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(configDir, "config.ts"),
    ["process.env.REFERENCED_KEY;", "export {};", ""].join("\n"),
    "utf8",
  );
}

async function runCli(
  projectDir: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const pathEntries = process.env.PATH?.split(path.delimiter) ?? [];
  const envPath = [path.join(packageRoot, "test", "bin"), ...pathEntries].join(
    path.delimiter,
  );

  const proc = Bun.spawn(["bun", cliPath, ...args], {
    cwd: projectDir,
    env: {
      ...process.env,
      PATH: envPath,
    },
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
