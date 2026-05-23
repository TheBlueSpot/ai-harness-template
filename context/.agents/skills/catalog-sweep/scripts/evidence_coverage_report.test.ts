import { describe, expect, test } from "bun:test";
import { classifyLaneCoverage } from "./evidence_coverage_report";

describe("evidence coverage classification", () => {
  test("marks lane missing when no reusable playtest exists", () => {
    const result = classifyLaneCoverage({
      playtestStatus: { kind: "missing" },
      starterFresh: false,
      findingFresh: false,
    });

    expect(result.status).toBe("missing");
  });

  test("marks lane stale when shared playtest is older than smoke", () => {
    const result = classifyLaneCoverage({
      playtestStatus: {
        kind: "present",
        artifacts: ["sample-playtest.json"],
        latestPlaytestAt: 10,
        latestPlaytestName: "sample-playtest.json",
        staleAgainstContent: false,
        staleAgainstSmoke: true,
      },
      starterFresh: true,
      findingFresh: true,
    });

    expect(result.status).toBe("stale");
    expect(result.reasons[0]).toContain("smoke");
  });

  test("marks lane inference-only when finding is missing but starter is fresh", () => {
    const result = classifyLaneCoverage({
      playtestStatus: {
        kind: "present",
        artifacts: ["sample-playtest.json"],
        latestPlaytestAt: 10,
        latestPlaytestName: "sample-playtest.json",
        staleAgainstContent: false,
        staleAgainstSmoke: false,
      },
      starterCoverage: { status: "ready", reasons: ["starter coverage ready"] },
      starterPath: "./local/playtest-starters/sample/hud-readability-audit.json",
      starterFresh: true,
      findingFresh: false,
    });

    expect(result.status).toBe("inference-only");
  });

  test("marks lane inference-only when finding exists but starter coverage is partial", () => {
    const result = classifyLaneCoverage({
      playtestStatus: {
        kind: "present",
        artifacts: ["sample-playtest.json"],
        latestPlaytestAt: 10,
        latestPlaytestName: "sample-playtest.json",
        staleAgainstContent: false,
        staleAgainstSmoke: false,
      },
      starterCoverage: { status: "partial", reasons: ["busy frame sample missing"] },
      starterPath: "./local/playtest-starters/sample/hud-readability-audit.json",
      starterFresh: true,
      findingPath: "./sample/hud-readability-audit.md",
      findingFresh: true,
    });

    expect(result.status).toBe("inference-only");
  });

  test("marks lane ready when finding is fresh and starter coverage is ready", () => {
    const result = classifyLaneCoverage({
      playtestStatus: {
        kind: "present",
        artifacts: ["sample-playtest.json"],
        latestPlaytestAt: 10,
        latestPlaytestName: "sample-playtest.json",
        staleAgainstContent: false,
        staleAgainstSmoke: false,
      },
      starterCoverage: { status: "ready", reasons: ["starter coverage ready"] },
      starterPath: "./local/playtest-starters/sample/hud-readability-audit.json",
      starterFresh: true,
      findingPath: "./sample/hud-readability-audit.md",
      findingFresh: true,
    });

    expect(result.status).toBe("ready");
  });
});
