import { describe, expect, test } from "bun:test";
import { buildStarterPayloads } from "./playtest_evidence_capture";

describe("playtest evidence capture", () => {
  test("keeps richer choice-moment evidence inside starter payloads", () => {
    const payloads = buildStarterPayloads({
      game: "sample-game",
      sessionDate: "2026-05-06",
      evidence: {
        mode: "direct-play",
        sampledRuns: 1,
      },
      mastery: {
        choiceCountFirstMinute: 1,
        choicesFeelMeaningful: true,
        choicePoints: [
          {
            moment: "00:18",
            label: "safe lane or center pickup",
            choiceType: "risk-reward",
            optionsCount: 2,
            offeredOptions: [
              {
                label: "safe lane",
                expectedPayoff: "preserve health",
                expectedCost: "give up score bonus",
                currentStateComparison: "best while health is low",
                currentBuildComparison: "fits the defensive build",
              },
            ],
            pickedOptionLabel: "center pickup",
            expectedPayoff: "gain score bonus",
            actualPayoff: "score rose but one hit landed",
            payoffMatchedExpectation: "partial",
            afterPickComparison: "score improved but health dropped",
            afterPickBuildComparison: "burst build charged faster",
          },
        ],
      },
      readableProgression: {
        proximalGoalVisible: true,
      },
    });

    const masteryPayload = payloads["mastery-motivation-audit.json"] as {
      mastery: {
        choicePoints: Array<{
          offeredOptions?: Array<{ currentBuildComparison?: string }>;
          expectedPayoff?: string;
          payoffMatchedExpectation?: string;
          afterPickBuildComparison?: string;
        }>;
      };
    };
    const progressionPayload = payloads["readable-progression-audit.json"] as {
      mastery: {
        choicePoints: Array<{
          afterPickComparison?: string;
        }>;
      };
    };

    expect(masteryPayload.mastery.choicePoints[0]?.offeredOptions?.[0]?.currentBuildComparison).toBe("fits the defensive build");
    expect(masteryPayload.mastery.choicePoints[0]?.expectedPayoff).toBe("gain score bonus");
    expect(masteryPayload.mastery.choicePoints[0]?.payoffMatchedExpectation).toBe("partial");
    expect(masteryPayload.mastery.choicePoints[0]?.afterPickBuildComparison).toBe("burst build charged faster");
    expect(progressionPayload.mastery.choicePoints[0]?.afterPickComparison).toBe("score improved but health dropped");
  });

  test("emits a settings-and-assists starter with ready guardrails when recovery-trust fields are logged", () => {
    const payloads = buildStarterPayloads({
      game: "sample-game",
      sessionDate: "2026-05-06",
      evidence: {
        mode: "direct-play",
        sampledRuns: 1,
        sampledFailures: 1,
        sampledRetries: 1,
        sampledResumeProbes: 1,
      },
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
        notes: "sampled live, pause, and retry trust path",
      },
    });

    const payload = payloads["settings-and-assists-audit.json"] as {
      settingsAndAssists: {
        reachability: { midRunSettingsReachable?: boolean };
      };
      claimGuardrail: { label: string; coverageGate: { status: string } };
    };

    expect(payload.settingsAndAssists.reachability.midRunSettingsReachable).toBe(true);
    expect(payload.claimGuardrail.label).toBe("settings-and-assists audit");
    expect(payload.claimGuardrail.coverageGate.status).toBe("ready");
  });

  test("preserves rich choice packets in the mastery starter", () => {
    const payloads = buildStarterPayloads({
      game: "sample-game",
      sessionDate: "2026-05-06",
      evidence: {
        mode: "direct-play",
        sampledRuns: 1,
      },
      mastery: {
        choiceCountFirstMinute: 1,
        choicesFeelMeaningful: true,
        autonomySupport: "high",
        competenceSupport: "medium",
        choicePoints: [
          {
            moment: "00:18",
            label: "safe lane or center pickup",
            choiceType: "risk-reward",
            optionsCount: 2,
            meaningClear: true,
            reversible: false,
            offeredOptions: [
              {
                label: "safe lane",
                expectedPayoff: "preserve health",
                currentStateComparison: "keeps the current base weapon",
              },
              {
                label: "center pickup",
                expectedPayoff: "gain burst upgrade",
                currentStateComparison: "trades health risk for a stronger next wave state",
              },
            ],
            pickedOptionLabel: "center pickup",
            actualPayoff: "player leaves with burst upgrade active",
            actualPayoffTiming: "immediate",
            afterPickComparison: "upgrade icon makes the stronger state visible against the prior baseline",
            afterPickComparisonClear: true,
          },
        ],
      },
    });

    const payload = payloads["mastery-motivation-audit.json"] as {
      mastery: {
        choicePoints: Array<{
          offeredOptions?: Array<{ expectedPayoff?: string; currentStateComparison?: string }>;
          actualPayoff?: string;
          afterPickComparison?: string;
        }>;
      };
    };

    expect(payload.mastery.choicePoints[0]?.offeredOptions?.[1]?.expectedPayoff).toBe("gain burst upgrade");
    expect(payload.mastery.choicePoints[0]?.actualPayoff).toBe("player leaves with burst upgrade active");
    expect(payload.mastery.choicePoints[0]?.afterPickComparison).toContain("stronger state visible");
  });

  test("emits a choice-readback starter with ready guardrails when rich choice data is logged", () => {
    const payloads = buildStarterPayloads({
      game: "sample-game",
      sessionDate: "2026-05-06",
      evidence: {
        mode: "direct-play",
        sampledRuns: 1,
        sampledFailures: 1,
        sampledRetries: 1,
      },
      mastery: {
        choiceCountFirstMinute: 1,
        choicesFeelMeaningful: true,
        choicePoints: [
          {
            moment: "00:18",
            label: "shield relic or burst relic",
            choiceType: "tool",
            optionsCount: 2,
            meaningClear: true,
            offeredOptions: [
              {
                label: "shield relic",
                expectedPayoff: "safer next wave",
                currentStateComparison: "fits low health",
              },
              {
                label: "burst relic",
                expectedPayoff: "faster clears",
                currentBuildComparison: "pushes damage branch",
              },
            ],
            pickedOptionLabel: "burst relic",
            actualPayoff: "next wave clears faster",
            actualPayoffTiming: "immediate",
            payoffMatchedExpectation: "yes",
            afterPickComparison: "damage output visibly rises",
            afterPickComparisonClear: true,
          },
        ],
      },
      readableProgression: {
        evaluativeReadbackAvailable: true,
        nonComparativeNextStepVisible: true,
      },
      failures: [
        {
          causeReadable: true,
          correctiveActionClear: true,
        },
      ],
    });

    const payload = payloads["choice-readback-audit.json"] as {
      mastery: {
        choicePoints: Array<{
          offeredOptions?: Array<{ expectedPayoff?: string }>;
          actualPayoff?: string;
          afterPickComparison?: string;
        }>;
      };
      claimGuardrail: { label: string; coverageGate: { status: string } };
    };

    expect(payload.claimGuardrail.label).toBe("choice-readback audit");
    expect(payload.claimGuardrail.coverageGate.status).toBe("ready");
    expect(payload.mastery.choicePoints[0]?.offeredOptions?.[1]?.expectedPayoff).toBe("faster clears");
    expect(payload.mastery.choicePoints[0]?.actualPayoff).toBe("next wave clears faster");
    expect(payload.mastery.choicePoints[0]?.afterPickComparison).toBe("damage output visibly rises");
  });
});
