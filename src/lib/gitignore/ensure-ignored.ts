import fs from "node:fs";
import path from "node:path";

export async function ensureGitIgnored(options: {
  projectDir: string;
  paths: string[];
}): Promise<{ changed: boolean; gitignorePath: string }> {
  const gitignorePath = path.join(options.projectDir, ".gitignore");

  const existing = fs.existsSync(gitignorePath)
    ? await fs.promises.readFile(gitignorePath, "utf8")
    : "";

  const lines = existing.split(/\r?\n/);
  const trimmed = new Set(
    lines.map((l) => l.trim()).filter((l) => l.length > 0),
  );

  const additions: string[] = [];

  for (const p of options.paths) {
    const rel = normalizeGitignorePath(p);
    if (isCoveredByGitignore(trimmed, rel)) continue;
    additions.push(rel);
  }

  if (additions.length === 0) {
    return { changed: false, gitignorePath };
  }

  const next = appendGitignore(existing, additions);
  await fs.promises.writeFile(gitignorePath, next, "utf8");
  return { changed: true, gitignorePath };
}

function normalizeGitignorePath(p: string): string {
  // Keep it relative/portable. If callers pass an absolute path, reduce to basename.
  if (path.isAbsolute(p)) {
    return path.basename(p);
  }
  return p.replaceAll("\\", "/");
}

function isCoveredByGitignore(
  existing: ReadonlySet<string>,
  target: string,
): boolean {
  if (existing.has(target)) return true;
  if (existing.has(`/${target}`)) return true;

  if (target.startsWith(".env")) {
    if (existing.has(".env*")) return true;
    if (existing.has(".env.*")) return true;
  }

  return false;
}

function appendGitignore(existing: string, additions: string[]): string {
  const header = "# better-env (generated)";
  const hasTrailingNewline = existing.endsWith("\n") || existing.length === 0;
  const prefix = hasTrailingNewline ? existing : `${existing}\n`;

  const block = [header, ...dedupe(additions)].join("\n");

  if (prefix.length === 0) {
    return `${block}\n`;
  }

  // Ensure there is an empty line between blocks for readability.
  const separator = prefix.endsWith("\n\n") ? "" : "\n";
  return `${prefix}${separator}${block}\n`;
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}
