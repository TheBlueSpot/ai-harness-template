import {
  backgroundJobSchedulePreviewSchema,
  type BackgroundJobSchedule,
  type BackgroundJobSchedulePreview
} from "../../shared/protocol";

const RELATIVE_INTERVAL_RE = /^(\d+)?\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)$/i;
const FIVE_FIELD_CRON_RE =
  /^([\d*/,.-]+)\s+([\d*/,.-]+)\s+([\d*/,.-]+)\s+([\d*/,.-]+)\s+([\d*/,.-]+)$/;

export function previewBackgroundJobSchedule(
  input: string,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
  now: Date = new Date()
): BackgroundJobSchedulePreview {
  const trimmed = input.trim();
  const preview = parseScheduleInput(trimmed, timezone, now);
  return backgroundJobSchedulePreviewSchema.parse({
    input: trimmed,
    timezone,
    schedule: preview.schedule,
    error: preview.error
  });
}

export function parseScheduleInput(
  input: string,
  timezone: string,
  now: Date = new Date()
): { schedule?: BackgroundJobSchedule; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { error: "Schedule input is required." };
  }

  const relative = parseRelativeInterval(trimmed, now);
  if (relative) {
    return { schedule: relative };
  }

  if (FIVE_FIELD_CRON_RE.test(trimmed)) {
    const nextRunAt = computeNextCronOccurrence(trimmed, now);
    if (!nextRunAt) {
      return { error: "Cron expression does not produce a run within the next year." };
    }

    return {
      schedule: {
        type: "cron",
        expression: trimmed,
        timezone,
        nextRunAt: nextRunAt.toISOString(),
        sourceText: trimmed
      }
    };
  }

  const absoluteDate = parseAbsoluteDate(trimmed);
  if (absoluteDate) {
    return {
      schedule: {
        type: "one-off",
        runAt: absoluteDate.toISOString(),
        sourceText: trimmed
      }
    };
  }

  return {
    error: "Ambiguous schedule. Use an absolute datetime, a relative interval like `2 weeks`, or a 5-field cron."
  };
}

export function getDueScheduleAdvance(schedule: BackgroundJobSchedule, now: Date = new Date()) {
  switch (schedule.type) {
    case "one-off": {
      if (schedule.consumedAt) {
        return {
          due: false,
          skippedOccurrenceCount: 0,
          nextSchedule: schedule,
          nextRunAt: undefined
        };
      }

      const runAt = new Date(schedule.runAt);
      return {
        due: runAt.getTime() <= now.getTime(),
        skippedOccurrenceCount: 0,
        nextSchedule:
          runAt.getTime() <= now.getTime()
            ? ({
                ...schedule,
                consumedAt: now.toISOString()
              } satisfies BackgroundJobSchedule)
            : schedule,
        nextRunAt: undefined
      };
    }
    case "interval": {
      const nextRun = new Date(schedule.nextRunAt);
      if (nextRun.getTime() > now.getTime()) {
        return {
          due: false,
          skippedOccurrenceCount: 0,
          nextSchedule: schedule,
          nextRunAt: schedule.nextRunAt
        };
      }

      const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - nextRun.getTime()) / 1000));
      const intervalsElapsed = Math.floor(elapsedSeconds / schedule.intervalSeconds);
      const skippedOccurrenceCount = Math.max(0, intervalsElapsed);
      const nextFutureRun = new Date(nextRun.getTime() + (intervalsElapsed + 1) * schedule.intervalSeconds * 1000);
      return {
        due: true,
        skippedOccurrenceCount,
        nextSchedule: {
          ...schedule,
          nextRunAt: nextFutureRun.toISOString()
        } satisfies BackgroundJobSchedule,
        nextRunAt: nextFutureRun.toISOString()
      };
    }
    case "cron": {
      const nextRun = new Date(schedule.nextRunAt);
      if (nextRun.getTime() > now.getTime()) {
        return {
          due: false,
          skippedOccurrenceCount: 0,
          nextSchedule: schedule,
          nextRunAt: schedule.nextRunAt
        };
      }

      let skippedOccurrenceCount = 0;
      let cursor = nextRun;
      let nextFutureRun = computeNextCronOccurrence(schedule.expression, cursor);
      while (nextFutureRun && nextFutureRun.getTime() <= now.getTime()) {
        skippedOccurrenceCount += 1;
        cursor = nextFutureRun;
        nextFutureRun = computeNextCronOccurrence(schedule.expression, cursor);
      }

      if (!nextFutureRun) {
        return {
          due: true,
          skippedOccurrenceCount,
          nextSchedule: undefined,
          nextRunAt: undefined
        };
      }

      return {
        due: true,
        skippedOccurrenceCount,
        nextSchedule: {
          ...schedule,
          nextRunAt: nextFutureRun.toISOString()
        } satisfies BackgroundJobSchedule,
        nextRunAt: nextFutureRun.toISOString()
      };
    }
  }
}

function parseRelativeInterval(input: string, now: Date) {
  const match = input.match(RELATIVE_INTERVAL_RE);
  if (!match) {
    return undefined;
  }

  const amount = Number.parseInt(match[1] ?? "1", 10);
  const unit = match[2]?.toLowerCase() ?? "minute";
  const multiplierSeconds =
    unit.startsWith("m")
      ? 60
      : unit.startsWith("h")
      ? 60 * 60
      : unit.startsWith("d")
      ? 24 * 60 * 60
      : 7 * 24 * 60 * 60;
  const intervalSeconds = amount * multiplierSeconds;
  if (intervalSeconds < 60) {
    return undefined;
  }

  return {
    type: "interval",
    intervalSeconds,
    nextRunAt: new Date(now.getTime() + intervalSeconds * 1000).toISOString(),
    sourceText: input
  } satisfies BackgroundJobSchedule;
}

function parseAbsoluteDate(input: string) {
  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return new Date(parsed);
}

function computeNextCronOccurrence(expression: string, after: Date) {
  const match = expression.match(FIVE_FIELD_CRON_RE);
  if (!match) {
    return undefined;
  }

  const [, minuteField, hourField, dayField, monthField, weekdayField] = match;
  const start = new Date(after.getTime());
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  for (let step = 0; step < 366 * 24 * 60; step += 1) {
    const candidate = new Date(start.getTime() + step * 60 * 1000);
    if (
      cronFieldMatches(candidate.getMinutes(), minuteField, 0, 59) &&
      cronFieldMatches(candidate.getHours(), hourField, 0, 23) &&
      cronFieldMatches(candidate.getDate(), dayField, 1, 31) &&
      cronFieldMatches(candidate.getMonth() + 1, monthField, 1, 12) &&
      cronFieldMatches(candidate.getDay(), weekdayField, 0, 7)
    ) {
      return candidate;
    }
  }

  return undefined;
}

function cronFieldMatches(value: number, field: string, min: number, max: number) {
  return field.split(",").some((segment) => cronSegmentMatches(value, segment.trim(), min, max));
}

function cronSegmentMatches(value: number, segment: string, min: number, max: number) {
  if (segment === "*") {
    return true;
  }

  const stepMatch = segment.match(/^(.+)\/(\d+)$/);
  if (stepMatch) {
    const base = stepMatch[1] ?? "*";
    const step = Number.parseInt(stepMatch[2] ?? "1", 10);
    if (!Number.isFinite(step) || step <= 0) {
      return false;
    }
    if (!cronSegmentMatches(value, base, min, max)) {
      return false;
    }
    return (value - min) % step === 0;
  }

  const rangeMatch = segment.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = normalizeCronValue(Number.parseInt(rangeMatch[1] ?? "0", 10), max);
    const end = normalizeCronValue(Number.parseInt(rangeMatch[2] ?? "0", 10), max);
    return value >= start && value <= end;
  }

  const exact = normalizeCronValue(Number.parseInt(segment, 10), max);
  return Number.isFinite(exact) && exact >= min && exact <= max && value === exact;
}

function normalizeCronValue(value: number, max: number) {
  if (max === 7 && value === 7) {
    return 0;
  }

  return value;
}
