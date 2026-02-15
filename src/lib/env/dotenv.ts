const lineRegex =
  /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(.*)?\s*(?:#.*)?(?:$|$)/;

export function parseDotenv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.replace(/\r\n?/g, "\n").split("\n");

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith("#")) continue;

    const match = trimmed.match(lineRegex);
    if (!match) continue;

    const key = match[1];
    const rawValue = (match[2] ?? "").trim();
    result[key] = normalizeValue(rawValue);
  }

  return result;
}

function normalizeValue(value: string): string {
  if (value.length === 0) return "";

  const first = value[0];
  const last = value[value.length - 1];

  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    const inner = value.slice(1, -1);
    if (first === '"') {
      return inner.replaceAll("\\n", "\n").replaceAll("\\r", "\r");
    }
    return inner;
  }

  return value;
}
