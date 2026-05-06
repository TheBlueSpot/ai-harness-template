import { describe, expect, test } from "bun:test";
import { buildSummary } from "./busy_frame_clutter_smoke";

describe("busy-frame clutter smoke", () => {
  test("flags overlay competition and read-survival failures from sampled stress frames", () => {
    const parsed = buildSummary({
      game: "sample-game",
      sessionDate: "2026-05-06",
      evidence: {
        mode: "direct-play",
        sampledRuns: 1,
        sampledBusyFrames: 2,
      },
      stressFrames: [
        {
          moment: "wave peak",
          clutterSource: "particles and warning stack",
          movingBackground: true,
          autoUpdatingContent: true,
          criticalInfoLost: true,
          cueMasked: true,
          responseStillReadable: false,
          criticalElementsReadableUnderMotion: false,
        },
      ],
      competitionMoments: [
        {
          moment: "warning plus combo toast",
          dominantReadClear: false,
          responsePriorityClear: false,
          nonCriticalUiCompeting: true,
        },
      ],
      ephemeralMoments: [
        {
          name: "combo toast",
          importance: "supporting",
          appearsNearAction: true,
          obstructsCriticalRead: true,
        },
      ],
    });

    expect(parsed.lanes.map((lane) => lane.status)).toContain("fail");
    expect(parsed.findings.map((finding) => finding.title)).toContain(
      "overlay competition or occlusion collapses the dominant urgent read during busy play",
    );
    expect(parsed.findings.map((finding) => finding.title)).toContain(
      "critical read does not survive the sampled busy-frame clutter peak",
    );
  });

  test("warns when busy-frame count exists without saved stress-frame rows", () => {
    const parsed = buildSummary({
      game: "sample-game",
      sessionDate: "2026-05-06",
      evidence: {
        mode: "direct-play",
        sampledRuns: 1,
        sampledBusyFrames: 1,
      },
    });

    expect(
      parsed.lanes.find((lane) => lane.label === "Busy-frame clutter evidence")?.status,
    ).toBe("partial");
    expect(parsed.findings.map((finding) => finding.title)).toContain(
      "busy-frame evidence count exists, but no saved stress-frame rows preserve the actual clutter moment",
    );
  });
});
