import { describe, expect, test } from "bun:test";
import { CliUsageError, parseCliOptions } from "./cli-options";

describe("CLI option parser", () => {
  test("accepts known flags and values", () => {
    const parsed = parseCliOptions(["--doctor", "--json"], {
      flags: ["--doctor", "--json"]
    });

    expect(parsed.flags.has("--doctor")).toBe(true);
    expect(parsed.flags.has("--json")).toBe(true);
  });

  test("rejects unknown flags and conflicts as usage errors", () => {
    expect(() =>
      parseCliOptions(["--wat"], {
        flags: ["--help"]
      })
    ).toThrow(CliUsageError);

    expect(() =>
      parseCliOptions(["--open", "--no-open"], {
        flags: ["--open", "--no-open"],
        conflicts: [["--open", "--no-open"]]
      })
    ).toThrow(CliUsageError);
  });

  test("rejects missing values", () => {
    expect(() =>
      parseCliOptions(["--target"], {
        flags: ["--target"],
        valueFlags: ["--target"]
      })
    ).toThrow(CliUsageError);
  });
});
