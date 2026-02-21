import path from "node:path";
import { pathToFileURL } from "node:url";

type JitiLoader = (id: string) => unknown;

let cachedJitiLoader: JitiLoader | undefined;

export async function loadModuleFromPath(modulePath: string): Promise<unknown> {
  if (shouldUseJiti(modulePath)) {
    const loadWithJiti = await getJitiLoader();
    return loadWithJiti(modulePath);
  }

  return import(pathToFileURL(modulePath).toString());
}

async function getJitiLoader(): Promise<JitiLoader> {
  if (cachedJitiLoader) {
    return cachedJitiLoader;
  }

  const mod = await import("jiti");
  const createJiti = coerceJitiFactory(mod);
  cachedJitiLoader = createJiti(import.meta.url, { interopDefault: true });
  return cachedJitiLoader;
}

function shouldUseJiti(modulePath: string): boolean {
  return !isBunRuntime() && isTypeScriptFile(modulePath);
}

function isBunRuntime(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
}

function isTypeScriptFile(modulePath: string): boolean {
  const extension = path.extname(modulePath).toLowerCase();
  return (
    extension === ".ts" ||
    extension === ".mts" ||
    extension === ".cts" ||
    extension === ".tsx"
  );
}

function coerceJitiFactory(
  value: unknown,
): (filename: string, options?: { interopDefault?: boolean }) => JitiLoader {
  const maybeFactory =
    isObject(value) && "default" in value ? value.default : value;

  if (typeof maybeFactory !== "function") {
    throw new Error("Failed to load jiti runtime loader.");
  }

  return maybeFactory as (
    filename: string,
    options?: { interopDefault?: boolean },
  ) => JitiLoader;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
