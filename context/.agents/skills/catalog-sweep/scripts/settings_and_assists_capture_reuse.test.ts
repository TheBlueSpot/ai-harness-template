import { describe, expect, test } from "bun:test";
import { buildOutputs, choiceReadbackAuditCommand, settingsAndAssistsAuditCommand } from "./playtest_capture_pack";
import { AUDIT_CONFIG, buildAuditCommand } from "./audit_handoff_pack";

describe("settings-and-assists capture reuse", () => {
  test("playtest capture pack exposes the choice-readback starter reuse path", () => {
    const outputs = buildOutputs("sample-game");

    expect(outputs.choiceReadbackReport).toBe("./sample-game/choice-readback-audit.md");
    expect(choiceReadbackAuditCommand(outputs)).toContain(
      './.local/playtest-starters/sample-game/choice-readback-audit.json',
    );
  });

  test("playtest capture pack exposes the settings-and-assists starter reuse path", () => {
    const outputs = buildOutputs("sample-game");

    expect(outputs.settingsAndAssistsReport).toBe("./sample-game/settings-and-assists-audit.md");
    expect(settingsAndAssistsAuditCommand(outputs)).toContain(
      './.local/playtest-starters/sample-game/settings-and-assists-audit.json',
    );
  });

  test("audit handoff pack can route the settings-and-assists audit directly from saved starters", () => {
    expect(AUDIT_CONFIG.settings.starterFile).toBe("settings-and-assists-audit.json");
    expect(buildAuditCommand("sample-game", "settings")).toContain(
      './.local/playtest-starters/sample-game/settings-and-assists-audit.json',
    );
  });

  test("audit handoff pack can route the choice-readback audit directly from saved starters", () => {
    expect(AUDIT_CONFIG["choice-readback"].starterFile).toBe("choice-readback-audit.json");
    expect(buildAuditCommand("sample-game", "choice-readback")).toContain(
      './.local/playtest-starters/sample-game/choice-readback-audit.json',
    );
  });
});
