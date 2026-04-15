import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildUiBundle } from "./ui-build";

describe("ui build", () => {
  test("emits external source maps in development build", async () => {
    await buildUiBundle();

    const uiOutDir = path.resolve(process.cwd(), "dist/ui");
    const jsPath = path.join(uiOutDir, "main.js");
    const mapPath = path.join(uiOutDir, "main.js.map");
    const sourceMap = JSON.parse(readFileSync(mapPath, "utf8")) as { sources?: string[] };

    expect(existsSync(jsPath)).toBe(true);
    expect(existsSync(mapPath)).toBe(true);
    expect(sourceMap.sources?.some((source) => source.includes("harness\\ui\\src\\app.tsx"))).toBe(true);
  });
});
