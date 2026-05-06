import { describe, expect, test } from "bun:test";
import { buildFindings, buildMarkdown } from "./choice_readback_audit";
import { buildObservationTemplate } from "../../playtest-evidence-capture/scripts/observation_template";
import { buildStarterPayloads } from "../../playtest-evidence-capture/scripts/playtest_evidence_capture";

describe("choice_readback_audit", () => {
  test("flags unreadable pre-pick option contrast as a blocker", () => {
    const findings = buildFindings({
      game: "sample-game",
      mastery: {
        choicePoints: [
          {
            moment: "00:12",
            label: "left or right door",
            optionsCount: 2,
            meaningClear: false,
            offeredOptions: [{ label: "left door" }, { label: "right door" }],
          },
        ],
      },
    });

    expect(findings[0]?.severity).toBe("blocker");
    expect(findings[0]?.title).toContain("tradeoffs");
  });

  test("flags unreadable post-pick state change as a major issue", () => {
    const findings = buildFindings({
      game: "sample-game",
      mastery: {
        choicePoints: [
          {
            moment: "00:18",
            label: "safe lane or center pickup",
            optionsCount: 2,
            meaningClear: true,
            offeredOptions: [
              { label: "safe lane", expectedPayoff: "preserve health" },
              { label: "center pickup", expectedPayoff: "gain score bonus" },
            ],
            payoffMatchedExpectation: "partial",
            afterPickComparisonClear: false,
          },
        ],
      },
    });

    expect(findings.some((finding) => finding.severity === "major")).toBe(true);
    expect(findings.map((finding) => finding.title).join(" | ")).toContain("after the pick");
  });

  test("accepts shared mastery starter payloads without extra normalization", () => {
    const payloads = buildStarterPayloads(
      buildObservationTemplate() as Parameters<typeof buildStarterPayloads>[0],
    );
    const markdown = buildMarkdown(
      payloads["mastery-motivation-audit.json"] as Parameters<typeof buildMarkdown>[0],
    );

    expect(markdown).toContain("Choice moment count: 1.");
    expect(markdown).toContain("safe lane or center pickup");
    expect(markdown).toContain("after-pick comparison clear yes");
  });
});
