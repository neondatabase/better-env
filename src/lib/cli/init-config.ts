import fs from "node:fs";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import type { BetterEnvConfig } from "../runtime/types.ts";
import {
  loadBetterEnvConfig,
  resolveProjectDir,
} from "../runtime/load-config.ts";
import { vercelAdapter } from "../adapters/vercel.ts";
import { netlifyAdapter } from "../adapters/netlify.ts";
import { railwayAdapter } from "../adapters/railway.ts";
import { cloudflareAdapter } from "../adapters/cloudflare.ts";
import { flyAdapter } from "../adapters/fly.ts";
import { convexAdapter } from "../adapters/convex.ts";

type AdapterChoice =
  | "vercel"
  | "netlify"
  | "railway"
  | "cloudflare"
  | "fly"
  | "convex";

const ADAPTERS: ReadonlyArray<{
  id: AdapterChoice;
  label: string;
  importName:
    | "vercelAdapter"
    | "netlifyAdapter"
    | "railwayAdapter"
    | "cloudflareAdapter"
    | "flyAdapter"
    | "convexAdapter";
}> = [
  { id: "vercel", label: "Vercel", importName: "vercelAdapter" },
  { id: "netlify", label: "Netlify", importName: "netlifyAdapter" },
  { id: "railway", label: "Railway", importName: "railwayAdapter" },
  {
    id: "cloudflare",
    label: "Cloudflare Workers",
    importName: "cloudflareAdapter",
  },
  { id: "fly", label: "Fly.io", importName: "flyAdapter" },
  { id: "convex", label: "Convex", importName: "convexAdapter" },
];

const NO_CONFIG_ERROR = "No better-env.ts found";

export async function loadOrCreateConfigForInit(options: {
  cwd: string;
  yes: boolean;
}): Promise<{
  createdConfig: boolean;
  config: BetterEnvConfig;
  projectDir: string;
}> {
  try {
    const loaded = await loadBetterEnvConfig({ cwd: options.cwd });
    return {
      createdConfig: false,
      config: loaded.config,
      projectDir: resolveProjectDir(loaded),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(NO_CONFIG_ERROR)) {
      throw error;
    }

    const adapter = await pickAdapter({
      projectDir: options.cwd,
      yes: options.yes,
    });

    const configPath = path.join(options.cwd, "better-env.ts");
    await fs.promises.writeFile(
      configPath,
      buildConfigContent(adapter),
      "utf8",
    );
    console.log(
      `Created better-env.ts with ${renderAdapter(adapter)} adapter at ${configPath}.`,
    );

    return {
      createdConfig: true,
      config: createConfigForAdapter(adapter),
      projectDir: options.cwd,
    };
  }
}

async function pickAdapter(options: {
  projectDir: string;
  yes: boolean;
}): Promise<AdapterChoice> {
  const inferred = inferAdapterFromProject(options.projectDir);

  if (options.yes) {
    if (inferred) {
      console.log(
        `No better-env.ts found. Using inferred provider: ${renderAdapter(inferred)}.`,
      );
      return inferred;
    }
    console.log(
      `No better-env.ts found. Using default provider: ${renderAdapter("vercel")}.`,
    );
    return "vercel";
  }

  console.log("No better-env.ts found. Let's create one.");
  if (inferred) {
    console.log(`Detected project markers for ${renderAdapter(inferred)}.`);
  }
  console.log("");
  for (let i = 0; i < ADAPTERS.length; i += 1) {
    const adapter = ADAPTERS[i];
    if (!adapter) continue;
    const marker = inferred === adapter.id ? " (detected)" : "";
    console.log(`  ${i + 1}) ${adapter.label}${marker}`);
  }
  console.log("");

  const rl = createInterface({ input, output });
  try {
    const defaultIndex = Math.max(
      0,
      ADAPTERS.findIndex((item) => item.id === (inferred ?? "vercel")),
    );
    const answer = await rl.question(`Select provider [${defaultIndex + 1}]: `);
    const trimmed = answer.trim();
    if (trimmed.length === 0) {
      const fallback = ADAPTERS[defaultIndex];
      if (!fallback) return "vercel";
      return fallback.id;
    }

    const numeric = Number.parseInt(trimmed, 10);
    if (Number.isNaN(numeric) || numeric < 1 || numeric > ADAPTERS.length) {
      throw new Error(
        `Invalid provider selection "${trimmed}". Expected a number from 1 to ${ADAPTERS.length}.`,
      );
    }
    const selected = ADAPTERS[numeric - 1];
    if (!selected) {
      throw new Error("Selected provider is not available.");
    }
    return selected.id;
  } finally {
    rl.close();
  }
}

function inferAdapterFromProject(
  projectDir: string,
): AdapterChoice | undefined {
  const checks: ReadonlyArray<{
    adapter: AdapterChoice;
    markers: ReadonlyArray<string>;
  }> = [
    { adapter: "vercel", markers: [".vercel"] },
    { adapter: "netlify", markers: [".netlify"] },
    { adapter: "railway", markers: [".railway"] },
    { adapter: "cloudflare", markers: [".wrangler", "wrangler.toml"] },
    { adapter: "fly", markers: ["fly.toml"] },
    { adapter: "convex", markers: ["convex", "convex.json"] },
  ];

  for (const check of checks) {
    const matched = check.markers.some((marker) =>
      fs.existsSync(path.join(projectDir, marker)),
    );
    if (matched) {
      return check.adapter;
    }
  }

  return undefined;
}

function renderAdapter(adapter: AdapterChoice): string {
  const found = ADAPTERS.find((item) => item.id === adapter);
  if (!found) return adapter;
  return found.label;
}

function buildConfigContent(adapter: AdapterChoice): string {
  const def = ADAPTERS.find((item) => item.id === adapter);
  if (!def) {
    throw new Error(`Unsupported adapter "${adapter}".`);
  }

  const adapterExpression =
    adapter === "fly"
      ? `${def.importName}({ app: process.env.BETTER_ENV_FLY_APP })`
      : `${def.importName}()`;

  return [
    `import { defineBetterEnv, ${def.importName} } from "better-env";`,
    "",
    "export default defineBetterEnv({",
    `  adapter: ${adapterExpression},`,
    "});",
    "",
  ].join("\n");
}

function createConfigForAdapter(adapter: AdapterChoice): BetterEnvConfig {
  if (adapter === "vercel") {
    return { adapter: vercelAdapter() };
  }
  if (adapter === "netlify") {
    return { adapter: netlifyAdapter() };
  }
  if (adapter === "railway") {
    return { adapter: railwayAdapter() };
  }
  if (adapter === "cloudflare") {
    return { adapter: cloudflareAdapter() };
  }
  if (adapter === "fly") {
    return { adapter: flyAdapter() };
  }
  return { adapter: convexAdapter() };
}
