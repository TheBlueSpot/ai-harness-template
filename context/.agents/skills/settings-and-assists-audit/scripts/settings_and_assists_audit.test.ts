import { describe, expect, test } from "bun:test";
import { buildFindings, buildMarkdown } from "./settings_and_assists_audit";
import { buildObservationTemplate } from "../../playtest-evidence-capture/scripts/observation_template";
import { buildStarterPayloads } from "../../playtest-evidence-capture/scripts/playtest_evidence_capture";

describe("settings_and_assists_audit", () => {
  test("flags unreachable post-failure recovery surfaces as a blocker", () => {
    const findings = buildFindings({
      game: "sample-game",
      settingsAndAssists: {
        reachability: {
          midRunSettingsReachable: true,
          postFailureSettingsReachable: false,
          postFailureAssistReachable: false,
          menuDepth: 4,
        },
      },
    });

    expect(findings[0]?.severity).toBe("blocker");
    expect(findings[0]?.title).toContain("recovery knobs");
  });

  test("renders guardrails and durable learning in markdown output", () => {
    const markdown = buildMarkdown({
      game: "sample-game",
      sessionDate: "2026-05-06",
      settingsAndAssists: {
        reachability: {
          midRunSettingsReachable: true,
          pauseSettingsReachable: true,
          postFailureSettingsReachable: true,
          postFailureAssistReachable: true,
        },
        changeSafety: {
          difficultyAdjustableMidRun: true,
          assistsAdjustableMidRun: true,
          changesApplyWithoutRestart: true,
          progressPreservedWhenChanged: true,
        },
        reminderPractice: {
          controlsReminderAvailable: true,
          objectiveReminderAvailable: true,
          tutorialReplayAvailable: true,
          practiceReliefAvailable: true,
          promptReadableLongEnoughToUseKnob: true,
        },
        persistence: {
          assistStatePersistsAcrossRetry: true,
          difficultyStatePersistsAcrossRetry: true,
          retryReentersWithExpectedState: true,
        },
      },
      evidenceSufficiency: {
        directness: "strong",
        scope: ["direct play"],
        gaps: ["no fresh-boot sample"],
        claimCeiling: "sample only",
      },
      claimGuardrail: {
        coverageGate: {
          status: "partial",
          reasons: ["single sampled path"],
        },
        nextEvidence: ["sample fresh boot"],
      },
    });

    expect(markdown).toContain("Coverage gate: partial.");
    expect(markdown).toContain("sample-game: assist and settings surfaces only earn player trust");
  });

  test("accepts shared starter payloads without extra normalization", () => {
    const payloads = buildStarterPayloads(
      buildObservationTemplate() as Parameters<typeof buildStarterPayloads>[0],
    );
    const markdown = buildMarkdown(
      payloads["settings-and-assists-audit.json"] as Parameters<typeof buildMarkdown>[0],
    );

    expect(markdown).toContain("Coverage gate: ready.");
    expect(markdown).toContain("Mid-run settings reachable: yes.");
    expect(markdown).toContain("Assist state persists across retry: no.");
  });
});
