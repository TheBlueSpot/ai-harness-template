import { describe, expect, test } from "bun:test";
import { buildCliProcessEnv } from "./cli-process-manager";

describe("cli process manager", () => {
  test("injects pseudo-terminal environment defaults", () => {
    const env = buildCliProcessEnv({
      cols: 120,
      rows: 40,
      extraEnv: {
        FOO: "bar"
      }
    });

    expect(env.TERM).toBe("xterm-256color");
    expect(env.COLORTERM).toBe("truecolor");
    expect(env.FORCE_COLOR).toBe("1");
    expect(env.LINES).toBe("40");
    expect(env.COLUMNS).toBe("120");
    expect(env.CI).toBe("true");
    expect(env.PYTHONUNBUFFERED).toBe("1");
    expect(env.EDITOR).toBe("cat");
    expect(env.PAGER).toBe("cat");
    const envRecord: Record<string, string | undefined> = env;
    expect(envRecord["FOO"]).toBe("bar");
  });
});
