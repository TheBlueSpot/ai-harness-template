import { describe, expect, test } from "bun:test";
import { buildObservationTemplate } from "./observation_template";
import { buildStarterPayloads } from "./playtest_evidence_capture";

describe("settings-and-assists starter wiring", () => {
  test("emits a guarded settings-and-assists starter from shared observations", () => {
    const payloads = buildStarterPayloads(buildObservationTemplate());
    const starter = payloads["settings-and-assists-audit.json"] as
      | {
          settingsAndAssists?: {
            reachability?: { midRunSettingsReachable?: boolean };
            persistence?: { difficultyStatePersistsAcrossRetry?: boolean };
          };
          starter?: {
            recoveryTrust?: {
              liveReachable?: boolean;
              progressSafe?: boolean;
              persistsAcrossRetry?: boolean;
            };
          };
          claimGuardrail?: {
            label?: string;
            coverageGate?: { status?: string };
          };
        }
      | undefined;

    expect(starter).toBeDefined();
    expect(starter?.settingsAndAssists?.reachability?.midRunSettingsReachable).toBe(true);
    expect(starter?.settingsAndAssists?.persistence?.difficultyStatePersistsAcrossRetry).toBe(true);
    expect(starter?.starter?.recoveryTrust?.liveReachable).toBe(true);
    expect(starter?.starter?.recoveryTrust?.progressSafe).toBe(true);
    expect(starter?.starter?.recoveryTrust?.persistsAcrossRetry).toBe(false);
    expect(starter?.claimGuardrail?.label).toBe("settings-and-assists audit");
    expect(starter?.claimGuardrail?.coverageGate?.status).toBe("ready");
  });
});
