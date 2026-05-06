import { describe, expect, test } from "bun:test";
import { getDueScheduleAdvance, getPostRunScheduleAdvance, previewBackgroundJobSchedule } from "./background-job-schedule";

describe("background job schedule", () => {
  test("parses relative intervals", () => {
    const now = new Date("2026-04-16T12:00:00.000Z");
    const preview = previewBackgroundJobSchedule("3h", "America/New_York", now);

    expect(preview.error).toBeUndefined();
    expect(preview.schedule?.type).toBe("interval");
    expect(preview.schedule?.type === "interval" ? preview.schedule.intervalSeconds : 0).toBe(3 * 60 * 60);
  });

  test("parses cron and advances due run", () => {
    const now = new Date("2026-04-16T12:00:00.000Z");
    const preview = previewBackgroundJobSchedule("*/15 * * * *", "America/New_York", now);

    expect(preview.error).toBeUndefined();
    expect(preview.schedule?.type).toBe("cron");
    const advance =
      preview.schedule?.type === "cron" ? getDueScheduleAdvance({ ...preview.schedule, nextRunAt: "2026-04-16T11:45:00.000Z" }, now) : undefined;
    expect(advance?.due).toBe(true);
    expect(advance?.nextRunAt).toBe("2026-04-16T12:15:00.000Z");
  });

  test("marks due one-off schedules as consumed", () => {
    const now = new Date("2026-04-16T12:00:00.000Z");
    const advance = getDueScheduleAdvance(
      {
        type: "one-off",
        runAt: "2026-04-16T11:00:00.000Z",
        sourceText: "2026-04-16 11:00"
      },
      now
    );

    expect(advance.due).toBe(true);
    expect(advance.nextRunAt).toBeUndefined();
    expect(advance.nextSchedule).toEqual({
      type: "one-off",
      runAt: "2026-04-16T11:00:00.000Z",
      consumedAt: now.toISOString(),
      sourceText: "2026-04-16 11:00"
    });
  });

  test("does not rerun consumed one-off schedules", () => {
    const advance = getDueScheduleAdvance({
      type: "one-off",
      runAt: "2026-04-16T11:00:00.000Z",
      consumedAt: "2026-04-16T12:00:00.000Z",
      sourceText: "2026-04-16 11:00"
    });

    expect(advance.due).toBe(false);
    expect(advance.nextSchedule).toEqual({
      type: "one-off",
      runAt: "2026-04-16T11:00:00.000Z",
      consumedAt: "2026-04-16T12:00:00.000Z",
      sourceText: "2026-04-16 11:00"
    });
  });

  test("moves stale interval next run after long-running completion", () => {
    const advance = getPostRunScheduleAdvance(
      {
        type: "interval",
        intervalSeconds: 300,
        nextRunAt: "2026-04-16T12:00:00.000Z",
        sourceText: "5m"
      },
      new Date("2026-04-16T12:06:00.000Z")
    );

    expect(advance?.nextRunAt).toBe("2026-04-16T12:11:00.000Z");
    expect(advance?.schedule).toEqual({
      type: "interval",
      intervalSeconds: 300,
      nextRunAt: "2026-04-16T12:11:00.000Z",
      sourceText: "5m"
    });
  });

  test("keeps future interval next run after quick completion", () => {
    const advance = getPostRunScheduleAdvance(
      {
        type: "interval",
        intervalSeconds: 300,
        nextRunAt: "2026-04-16T12:10:00.000Z",
        sourceText: "5m"
      },
      new Date("2026-04-16T12:06:00.000Z")
    );

    expect(advance).toBeUndefined();
  });

  test("rejects ambiguous input", () => {
    const preview = previewBackgroundJobSchedule("next friday maybe", "America/New_York", new Date("2026-04-16T12:00:00.000Z"));

    expect(preview.schedule).toBeUndefined();
    expect(preview.error).toContain("Ambiguous schedule");
  });
});
