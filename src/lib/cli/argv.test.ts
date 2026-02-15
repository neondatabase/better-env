import { describe, expect, it } from "bun:test";
import { parseCliArgs } from "./argv.ts";

describe("parseCliArgs", () => {
  it("parses command and options", () => {
    const parsed = parseCliArgs(["pull", "--environment", "preview"]);

    expect(parsed.commandPath).toEqual(["pull"]);
    expect(parsed.positionals).toEqual([]);
    expect(parsed.flags.environment).toBe("preview");
  });

  it("keeps unknown flags as positionals", () => {
    const parsed = parseCliArgs(["update", "API_URL", "v2", "--unknown", "x"]);

    expect(parsed.commandPath).toEqual(["update"]);
    expect(parsed.positionals).toEqual(["API_URL", "v2", "--unknown", "x"]);
  });

  it("resolves load mode by left-to-right precedence", () => {
    const first = parseCliArgs(["load", ".env", "--mode=add", "--replace"]);
    expect(first.flags.mode).toBe("replace");

    const second = parseCliArgs(["load", ".env", "--replace", "--mode=update"]);
    expect(second.flags.mode).toBe("update");

    const third = parseCliArgs(["load", ".env", "--mode", "add", "--upsert"]);
    expect(third.flags.mode).toBe("upsert");
  });
});
