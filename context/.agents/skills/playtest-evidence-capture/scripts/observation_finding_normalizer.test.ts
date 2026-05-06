import { describe, expect, test } from "bun:test";
import { normalizeObservationArtifacts } from "./observation_finding_normalizer";

describe("observation finding normalizer", () => {
  test("groups repeated control-recall observations into one theme and preserves source ceilings", () => {
    const output = normalizeObservationArtifacts([
      {
        path: "./.local/sample-playtest.json",
        updatedAtMs: Date.parse("2026-05-06T14:00:00.000Z"),
        payload: {
          game: "sample-game",
          sessionDate: "2026-05-06",
          sessionFocus: ["first-contact", "interruption-resume"],
          evidence: { mode: "direct-play", sampledRuns: 1, sampledResumeProbes: 1 },
          firstContact: { controlsReminderAvailable: false },
          resumeProbes: [
            {
              breakType: "tab-switch",
              currentGoalRecoverable: true,
              controlsRecoverable: false,
              nextActionClear: false,
              notes: "return path lost verb recall",
            },
          ],
          frictions: ["no in-run control reminder after returning to active play"],
        },
      },
      {
        path: "./.local/playtest-starters/sample-game/onboarding-critique.json",
        updatedAtMs: Date.parse("2026-05-06T14:01:00.000Z"),
        payload: {
          game: "sample-game",
          sessionDate: "2026-05-06",
          evidenceSufficiency: {
            claimCeiling:
              "session is not strong enough for broad feel verdicts; keep findings scoped to sampled first-contact and resume evidence.",
          },
          claimGuardrail: {
            coverageGate: {
              status: "partial",
              reasons: ["busy frame sample missing"],
            },
          },
        },
      },
    ]);

    expect(output.game).toBe("sample-game");
    expect(output.sourceArtifacts).toHaveLength(2);

    const theme = output.findings.find((finding) => finding.key === "theme:control-reminder-recovery");
    expect(theme).toBeDefined();
    expect(theme?.evidenceStrength.observationCount).toBe(3);
    expect(theme?.claimCeiling).toContain("session is not strong enough for broad feel verdicts");
    expect(theme?.citations.map((citation) => citation.location)).toEqual([
      "resumeProbes[0]",
      "firstContact.controlsReminderAvailable",
      "frictions[0]",
    ]);
  });
});
