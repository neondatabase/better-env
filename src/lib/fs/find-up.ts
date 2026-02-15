import fs from "node:fs";
import path from "node:path";

export function findUp(startDir: string, fileNames: string[]): string | null {
  let current = path.resolve(startDir);

  while (true) {
    for (const fileName of fileNames) {
      const candidate = path.join(current, fileName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}
