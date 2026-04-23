import { describe, expect, test } from "bun:test";
import { classifyToolFailure } from "./tool-activity-state";

describe("tool activity failure classification", () => {
  test("classifies missing skill paths as missing-path", () => {
    expect(
      classifyToolFailure({
        toolName: "shell",
        command: "Get-Content .agents/skills/.system/caveman/SKILL.md",
        outputPreview: "Get-Content : Cannot find path 'C:\\repo\\.agents\\skills\\.system\\caveman\\SKILL.md' because it does not exist."
      })
    ).toBe("missing-path");
  });

  test("classifies absent ffmpeg as missing-tool", () => {
    expect(
      classifyToolFailure({
        toolName: "shell",
        command: "ffmpeg -version",
        outputPreview: "ffmpeg : The term 'ffmpeg' is not recognized as the name of a cmdlet, function, script file, or operable program."
      })
    ).toBe("missing-tool");
  });

  test("classifies malformed rg quoting as bad-shell-quoting", () => {
    expect(
      classifyToolFailure({
        toolName: "shell",
        command: "rg --files .. | rg \"tower-hologram/src/main\\.js\"'$|tower-hologram/.*'\"\\.js\"'$"
      })
    ).toBe("bad-shell-quoting");

    expect(
      classifyToolFailure({
        toolName: "shell",
        command: "rg -n \"asset\" . -g '\"'!**/node_modules/**'\"'"
      })
    ).toBe("bad-shell-quoting");
  });

  test("classifies rg exit 1 without output as search-no-match", () => {
    expect(
      classifyToolFailure({
        toolName: "shell",
        command: "rg -n \"missing\" .",
        exitCode: 1
      })
    ).toBe("search-no-match");
  });
});
