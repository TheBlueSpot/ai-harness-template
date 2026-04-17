import { describe, expect, test } from "bun:test";
import { getDueScheduleAdvance, previewBackgroundJobSchedule } from "./background-job-schedule";

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

  test("rejects ambiguous input", () => {
    const preview = previewBackgroundJobSchedule("next friday maybe", "America/New_York", new Date("2026-04-16T12:00:00.000Z"));

    expect(preview.schedule).toBeUndefined();
    expect(preview.error).toContain("Ambiguous schedule");
  });
});
