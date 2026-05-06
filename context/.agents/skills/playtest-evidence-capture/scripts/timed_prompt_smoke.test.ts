import { describe, expect, test } from "bun:test";
import { buildSummary } from "./timed_prompt_smoke";

describe("timed prompt smoke", () => {
  test("flags blocker-grade prompt pacing and replay failures", () => {
    const parsed = buildSummary({
      game: "sample-game",
      sessionDate: "2026-05-06",
      evidence: {
        mode: "direct-play",
        sampledRuns: 1,
        sampledBusyFrames: 1,
      },
      ephemeralMoments: [
        {
          name: "wave-start warning",
          kind: "warning",
          importance: "critical",
          appearsNearAction: true,
          autoDismisses: true,
          dismissSeconds: 3,
          playerControlledAdvance: false,
          reviewableLater: false,
          suppressibleWhenNonCritical: false,
          obstructsCriticalRead: true,
        },
        {
          name: "mission toast",
          kind: "objective",
          importance: "supporting",
          appearsNearAction: true,
          autoDismisses: true,
          dismissSeconds: 2,
          playerControlledAdvance: false,
          reviewableLater: true,
          suppressibleWhenNonCritical: false,
          obstructsCriticalRead: false,
        },
      ],
      competitionMoments: [
        {
          moment: "warning plus objective toast",
          dominantReadClear: false,
          responsePriorityClear: false,
          nonCriticalUiCompeting: true,
        },
      ],
    });

    expect(parsed.worstLane.label).toBe("Player-paced prompt control");
    expect(parsed.lanes.map((lane) => lane.status)).toContain("fail");
    expect(parsed.findings.map((finding) => finding.title)).toContain(
      "sampled non-core prompts still auto-dismiss before the player controls the pace",
    );
    expect(parsed.findings.map((finding) => finding.title)).toContain(
      "sampled timed prompt disappears without a replay path",
    );
  });
});
