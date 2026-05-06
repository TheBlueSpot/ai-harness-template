import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Page } from "playwright";

export type ResponsivenessProbeOptions = {
  url?: string;
  slug?: string;
  out?: string;
  userAgent?: string;
  timeoutMs?: number;
  navigationTimeoutMs?: number;
  actionTimeoutMs?: number;
  entrySelectors?: string[];
  restartSelectors?: string[];
  dryRun?: boolean;
};

export type TimedMetric = {
  label: string;
  start: number | null;
  end: number | null;
  duration: number | null;
  evidence: "event-timing" | "raf-estimate" | "post-restart-probe" | "missing";
  sourceLabel: "PerformanceEventTiming" | "requestAnimationFrame" | "post-restart probe + requestAnimationFrame" | "missing";
  semantics:
    | "interaction-start-to-next-paint"
    | "restart-action-to-next-paint"
    | "restart-action-to-post-restart-control-ready-estimate"
    | "missing";
  notes: string[];
};

export type EventTimingSample = {
  name: string;
  startTime: number;
  processingStart: number | null;
  processingEnd: number | null;
  duration: number | null;
  inputDelay: number | null;
  handlerDuration: number | null;
  presentationDelay: number | null;
  cancelable: boolean | null;
};

export type LoafSample = {
  startTime: number;
  duration: number;
  blockingDuration: number | null;
  firstUIEventTimestamp: number | null;
  renderStart: number | null;
  styleAndLayoutStart: number | null;
  scripts: number | null;
  invokers: string[];
};

export type SupportSurface = {
  supported: boolean;
  observed: boolean;
  state: "supported-observed" | "supported-unobserved" | "unsupported";
  notes: string[];
};

export type EvidenceStatus = {
  label: string;
  status: "measured" | "estimated" | "unsupported" | "missing";
  source: string | null;
  state: "measured" | "estimated" | "unsupported" | "unobserved";
  reusable: boolean;
  reason: string;
};

export type ResponsivenessProbeResult = {
  target: {
    url: string;
    slug: string | null;
    resolvedFrom: "url" | "slug";
    directBrowserAssumption: true;
  };
  support: {
    eventTiming: SupportSurface;
    longAnimationFrame: SupportSurface;
    animationFrame: SupportSurface;
  };
  evidenceStatus: {
    firstInputToNextPaint: EvidenceStatus;
    restartToNextPaint: EvidenceStatus;
    restartToControlReady: EvidenceStatus;
    blockedFrameAttribution: EvidenceStatus;
  };
  invoker: {
    attribution: string;
    fallbackReasons: string[];
  };
  firstInput: {
    observed: boolean;
    timing: TimedMetric;
    source: EvidenceStatus;
    trigger: string | null;
    eventTimings: EventTimingSample[];
    fallbackReasons: string[];
  };
  restartReadiness: {
    observed: boolean;
    restartControl: string | null;
    nextPaint: TimedMetric;
    controlReady: TimedMetric;
    semantics: {
      nextPaint: "restart action to first follow-up paint estimate after explicit restart control";
      controlReady: "restart action to first post-restart probe input that produced a follow-up paint estimate";
      controlReadyIsHeuristic: true;
    };
    controlMarkers: string[];
    fallbackReasons: string[];
  };
  loaf: {
    observed: boolean;
    supportState: SupportSurface["state"];
    samples: LoafSample[];
    blockingDurationMs: number | null;
    fallbackReasons: string[];
  };
  interactions: {
    attempted: string[];
    completed: string[];
    bounded: true;
  };
  metadata: {
    capturedAt: string;
    userAgent: string;
    pageTitle: string;
    pageUrl: string;
    notes: string[];
  };
};

type BrowserProbeBuffer = {
  firstInputAt: number | null;
  firstInputPaintAt: number | null;
  firstInputTrigger: string | null;
  restartAttemptAt: number | null;
  restartAttemptSource: string | null;
  restartPaintAt: number | null;
  postRestartProbeAt: number | null;
  restartReadyAt: number | null;
  eventTimings: EventTimingSample[];
  loafSamples: LoafSample[];
  markers: string[];
  support: {
    eventTiming: boolean;
    longAnimationFrame: boolean;
    animationFrame: boolean;
  };
};

const DEFAULT_ENTRY_SELECTORS = [
  "button:has-text('Start')",
  "button:has-text('Play')",
  "button:has-text('Begin')",
  "[role='button']:has-text('Start')",
  "canvas",
];

const DEFAULT_RESTART_SELECTORS = ["button:has-text('Restart')", "button:has-text('Retry')", "button:has-text('Play Again')"];

type ParsedOptions = Required<Pick<ResponsivenessProbeOptions, "timeoutMs" | "navigationTimeoutMs" | "actionTimeoutMs" | "entrySelectors" | "restartSelectors">> &
  Pick<ResponsivenessProbeOptions, "url" | "slug" | "out" | "userAgent" | "dryRun">;

function parseArgs(argv: string[]): ParsedOptions {
  const options: ParsedOptions = {
    timeoutMs: 45_000,
    navigationTimeoutMs: 15_000,
    actionTimeoutMs: 1_500,
    entrySelectors: [...DEFAULT_ENTRY_SELECTORS],
    restartSelectors: [...DEFAULT_RESTART_SELECTORS],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === "--url" && next) {
      options.url = next;
      index += 1;
    } else if (current === "--slug" && next) {
      options.slug = next;
      index += 1;
    } else if (current === "--out" && next) {
      options.out = next;
      index += 1;
    } else if (current === "--user-agent" && next) {
      options.userAgent = next;
      index += 1;
    } else if (current === "--timeout-ms" && next) {
      options.timeoutMs = Number(next);
      index += 1;
    } else if (current === "--navigation-timeout-ms" && next) {
      options.navigationTimeoutMs = Number(next);
      index += 1;
    } else if (current === "--action-timeout-ms" && next) {
      options.actionTimeoutMs = Number(next);
      index += 1;
    } else if (current === "--entry-selector" && next) {
      options.entrySelectors = [...options.entrySelectors, next];
      index += 1;
    } else if (current === "--restart-selector" && next) {
      options.restartSelectors = [...options.restartSelectors, next];
      index += 1;
    } else if (current === "--dry-run") {
      options.dryRun = true;
    } else if (current === "--help" || current === "-h") {
      printHelpAndExit();
    }
  }

  return options;
}

function printHelpAndExit(): never {
  console.log([
    "browser_responsiveness_probe",
    "",
    "Usage:",
    "  bun.cmd .agents/skills/playtest-evidence-capture/scripts/browser_responsiveness_probe.ts --url http://localhost:3000 --out .local/responsiveness.json",
    "  bun.cmd .agents/skills/playtest-evidence-capture/scripts/browser_responsiveness_probe.ts --slug some-game --out .local/responsiveness.json",
    "",
    "Options:",
    "  --url <url>                 Direct browser target URL.",
    "  --slug <slug>               Resolve ./<slug>/index.html as the target.",
    "  --out <file>                Write normalized JSON output.",
    "  --user-agent <ua>           Override page user agent.",
    "  --timeout-ms <ms>           Total probe budget.",
    "  --navigation-timeout-ms <ms> Navigation wait budget.",
    "  --action-timeout-ms <ms>     Bounded interaction wait budget.",
    "  --entry-selector <css>       Extra first-input selector.",
    "  --restart-selector <css>     Extra restart/retry selector.",
    "  --dry-run                    Resolve target and print summary only.",
  ].join("\n"));
  process.exit(0);
}

function resolveTarget(options: ParsedOptions): { url: string; slug: string | null; resolvedFrom: "url" | "slug" } {
  if (options.url) {
    return { url: options.url, slug: options.slug ?? null, resolvedFrom: "url" };
  }

  if (!options.slug) {
    throw new Error("Pass --url <url> or --slug <slug>.");
  }

  return {
    url: pathToFileURL(resolve(process.cwd(), options.slug, "index.html")).toString(),
    slug: options.slug,
    resolvedFrom: "slug",
  };
}

function createBuffer(): BrowserProbeBuffer {
  return {
    firstInputAt: null,
    firstInputPaintAt: null,
    firstInputTrigger: null,
    restartAttemptAt: null,
    restartAttemptSource: null,
    restartPaintAt: null,
    postRestartProbeAt: null,
    restartReadyAt: null,
    eventTimings: [],
    loafSamples: [],
    markers: [],
    support: { eventTiming: false, longAnimationFrame: false, animationFrame: false },
  };
}

function normalizeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}

function normalizeDelta(start: number | null, end: number | null): number | null {
  return start === null || end === null ? null : normalizeNumber(end - start);
}

function buildTimedMetric(
  label: string,
  start: number | null,
  end: number | null,
  evidence: TimedMetric["evidence"],
  sourceLabel: TimedMetric["sourceLabel"],
  semantics: TimedMetric["semantics"],
  notes: string[] = [],
): TimedMetric {
  return {
    label,
    start,
    end,
    duration: start === null || end === null ? null : normalizeNumber(end - start),
    evidence,
    sourceLabel,
    semantics,
    notes,
  };
}

function ensureParentDirectory(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

function normalizeEventTimingSample(timing: PerformanceEventTiming, toNumber: (value: unknown) => number | null): EventTimingSample {
  const processingStart = toNumber((timing as { processingStart?: unknown }).processingStart);
  const processingEnd = toNumber((timing as { processingEnd?: unknown }).processingEnd);
  const duration = toNumber(timing.duration);
  const startTime = toNumber(timing.startTime) ?? 0;
  const inputDelay = normalizeDelta(startTime, processingStart);
  const handlerDuration = normalizeDelta(processingStart, processingEnd);
  const presentationDelay =
    duration === null || inputDelay === null || handlerDuration === null
      ? null
      : normalizeNumber(Math.max(0, duration - inputDelay - handlerDuration));

  return {
    name: timing.name,
    startTime,
    processingStart,
    processingEnd,
    duration,
    inputDelay,
    handlerDuration,
    presentationDelay,
    cancelable: "cancelable" in timing ? Boolean((timing as { cancelable?: boolean }).cancelable) : null,
  };
}

async function installRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const toNumber = (value: unknown): number | null =>
      typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(2)) : null;
    const win = window as typeof window & {
      __responsivenessProbe?: BrowserProbeBuffer;
    };
    const buffer: BrowserProbeBuffer = (win.__responsivenessProbe ??= {
      firstInputAt: null,
      firstInputPaintAt: null,
      firstInputTrigger: null,
      restartAttemptAt: null,
      restartAttemptSource: null,
      restartPaintAt: null,
      postRestartProbeAt: null,
      restartReadyAt: null,
      eventTimings: [],
      loafSamples: [],
      markers: [],
      support: { eventTiming: false, longAnimationFrame: false, animationFrame: false },
    });

    buffer.support.eventTiming =
      typeof PerformanceObserver !== "undefined" &&
      Array.isArray(PerformanceObserver.supportedEntryTypes) &&
      PerformanceObserver.supportedEntryTypes.includes("event");
    buffer.support.longAnimationFrame =
      typeof PerformanceObserver !== "undefined" &&
      Array.isArray(PerformanceObserver.supportedEntryTypes) &&
      PerformanceObserver.supportedEntryTypes.includes("long-animation-frame");
    buffer.support.animationFrame = typeof window.requestAnimationFrame === "function";

    const mark = (label: string) => {
      buffer.markers.push(label);
    };

    const markNextPaint = (target: "firstInputPaintAt" | "restartPaintAt" | "restartReadyAt", label: string) => {
      window.requestAnimationFrame(() => {
        if (buffer[target] === null) {
          buffer[target] = performance.now();
          mark(label);
        }
      });
    };

    mark("buffer-ready");

    const captureFirstInput = (label: string) => {
      if (buffer.firstInputAt === null) {
        buffer.firstInputAt = performance.now();
        buffer.firstInputTrigger = label;
        mark(label);
        markNextPaint("firstInputPaintAt", "first-input-next-paint-estimate");
      }

      if (buffer.restartAttemptAt !== null && buffer.postRestartProbeAt === null) {
        buffer.postRestartProbeAt = performance.now();
        mark(`post-restart-probe:${label}`);
        markNextPaint("restartReadyAt", "restart-control-ready-estimate");
      }
    };

    window.addEventListener("pointerdown", () => captureFirstInput("first-pointerdown"), { capture: true, passive: true });
    window.addEventListener("keydown", () => captureFirstInput("first-keydown"), { capture: true, passive: true });
    window.addEventListener("click", () => captureFirstInput("first-click"), { capture: true, passive: true });

    (window as typeof window & {
      __codexProbeMarkRestartAttempt?: (label: string) => void;
    }).__codexProbeMarkRestartAttempt = (label: string) => {
      if (buffer.restartAttemptAt === null) {
        buffer.restartAttemptAt = performance.now();
        buffer.restartAttemptSource = label;
        mark(`restart-attempt:${label}`);
        markNextPaint("restartPaintAt", "restart-next-paint-estimate");
      }
    };

    if (buffer.support.eventTiming && typeof PerformanceObserver !== "undefined") {
      try {
        const observer = new PerformanceObserver((entries) => {
          for (const entry of entries.getEntries()) {
            const timing = entry as PerformanceEventTiming;
            buffer.eventTimings.push(normalizeEventTimingSample(timing, toNumber));
          }
        });

        observer.observe({ type: "event", buffered: true } as PerformanceObserverInit);
      } catch (error) {
        mark(`event-observer-failed:${String(error)}`);
      }
    }

    if (buffer.support.longAnimationFrame && typeof PerformanceObserver !== "undefined") {
      try {
        const observer = new PerformanceObserver((entries) => {
          for (const entry of entries.getEntries()) {
            const loaf = entry as {
              startTime: number;
              duration: number;
              blockingDuration?: number;
              renderStart?: number;
              styleAndLayoutStart?: number;
              scripts?: unknown[];
            };
            buffer.loafSamples.push({
              startTime: loaf.startTime,
              duration: loaf.duration,
              blockingDuration: toNumber((loaf as { blockingDuration?: unknown }).blockingDuration),
              firstUIEventTimestamp: toNumber((loaf as { firstUIEventTimestamp?: unknown }).firstUIEventTimestamp),
              renderStart: toNumber((loaf as { renderStart?: unknown }).renderStart),
              styleAndLayoutStart: toNumber((loaf as { styleAndLayoutStart?: unknown }).styleAndLayoutStart),
              scripts: Array.isArray((loaf as { scripts?: unknown[] }).scripts) ? (loaf as { scripts?: unknown[] }).scripts!.length : null,
              invokers: Array.isArray((loaf as { scripts?: Array<{ invoker?: unknown; name?: unknown }> }).scripts)
                ? (loaf as { scripts?: Array<{ invoker?: unknown; name?: unknown }> }).scripts!
                    .map((script) => {
                      if (typeof script.invoker === "string" && script.invoker.length > 0) {
                        return script.invoker;
                      }
                      if (typeof script.name === "string" && script.name.length > 0) {
                        return script.name;
                      }
                      return null;
                    })
                    .filter((invoker): invoker is string => invoker !== null)
                : [],
            });
          }
        });

        observer.observe({ type: "long-animation-frame", buffered: true });
      } catch (error) {
        mark(`loaf-observer-failed:${String(error)}`);
      }
    }
  });
}

type InteractionSequenceResult = {
  attempted: string[];
  completed: string[];
  firstInputControl: string | null;
  restartControl: string | null;
};

async function findVisibleSelector(page: Page, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    const element = page.locator(selector).first();
    if ((await element.count()) === 0) {
      continue;
    }

    try {
      if (await element.isVisible()) {
        return selector;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function boundedInteractionSequence(
  page: Page,
  entrySelectors: string[],
  restartSelectors: string[],
  actionTimeoutMs: number,
): Promise<InteractionSequenceResult> {
  const attempted: string[] = [];
  const completed: string[] = [];
  let firstInputControl: string | null = null;
  let restartControl: string | null = null;

  const firstInputSelector = await findVisibleSelector(page, entrySelectors);
  if (firstInputSelector) {
    attempted.push(`click ${firstInputSelector}`);
    try {
      await page.locator(firstInputSelector).first().click({ timeout: actionTimeoutMs });
      completed.push(`click ${firstInputSelector}`);
      firstInputControl = firstInputSelector;
      await page.waitForTimeout(Math.min(120, actionTimeoutMs));
    } catch {
      firstInputControl = null;
    }
  }

  if (!firstInputControl) {
    attempted.push("body click");
    await page.mouse.click(24, 24);
    completed.push("body click");
    attempted.push("space key");
    await page.keyboard.press("Space");
    completed.push("space key");
    attempted.push("enter key");
    await page.keyboard.press("Enter");
    completed.push("enter key");
  }

  for (const selector of restartSelectors) {
    attempted.push(`click ${selector}`);
    const element = page.locator(selector).first();
    if ((await element.count()) === 0) {
      continue;
    }

    try {
      await page.evaluate((label) => {
        const win = window as typeof window & {
          __codexProbeMarkRestartAttempt?: (value: string) => void;
        };
        win.__codexProbeMarkRestartAttempt?.(label);
      }, selector);
      await element.click({ timeout: actionTimeoutMs });
      completed.push(`click ${selector}`);
      restartControl = selector;
      await page.waitForTimeout(Math.min(120, actionTimeoutMs));
      attempted.push("post-restart body click");
      await page.mouse.click(40, 40);
      completed.push("post-restart body click");
      attempted.push("post-restart space key");
      await page.keyboard.press("Space");
      completed.push("post-restart space key");
      break;
    } catch {
      continue;
    }
  }

  return { attempted, completed, firstInputControl, restartControl };
}

async function readBuffer(page: Page): Promise<BrowserProbeBuffer> {
  return await page.evaluate(() => {
    const win = window as typeof window & { __responsivenessProbe?: BrowserProbeBuffer };
    return win.__responsivenessProbe ?? {
      firstInputAt: null,
      firstInputPaintAt: null,
      firstInputTrigger: null,
      restartAttemptAt: null,
      restartAttemptSource: null,
      restartPaintAt: null,
      postRestartProbeAt: null,
      restartReadyAt: null,
      eventTimings: [],
      loafSamples: [],
      markers: ["buffer-missing"],
      support: { eventTiming: false, longAnimationFrame: false, animationFrame: typeof window.requestAnimationFrame === "function" },
    };
  });
}

function buildSupportSurface(
  supported: boolean,
  observed: boolean,
  supportedNote: string,
  unsupportedNote: string,
  missingObservedNote?: string,
): SupportSurface {
  const notes = supported ? [supportedNote] : [unsupportedNote];
  if (supported && !observed && missingObservedNote) {
    notes.push(missingObservedNote);
  }

  return {
    supported,
    observed,
    state: supported ? (observed ? "supported-observed" : "supported-unobserved") : "unsupported",
    notes,
  };
}

function buildEvidenceStatus(
  label: string,
  metric: TimedMetric,
  config: {
    measuredSource?: string;
    estimatedSource?: string;
    unsupportedWhen: boolean;
    unsupportedReason: string;
    missingReason: string;
  },
): EvidenceStatus {
  if (metric.duration !== null) {
    if (metric.evidence === "event-timing") {
      return {
        label,
        status: "measured",
        source: config.measuredSource ?? "PerformanceEventTiming",
        state: "measured",
        reusable: true,
        reason: metric.notes[0] ?? "captured with a direct browser timing surface",
      };
    }

    return {
      label,
      status: "estimated",
      source: config.estimatedSource ?? metric.evidence,
      state: "estimated",
      reusable: true,
      reason: metric.notes[0] ?? "captured with a bounded browser-side estimate",
    };
  }

  if (config.unsupportedWhen) {
    return {
      label,
      status: "unsupported",
      source: null,
      state: "unsupported",
      reusable: false,
      reason: config.unsupportedReason,
    };
  }

  return {
    label,
    status: "missing",
    source: null,
    state: "unobserved",
    reusable: false,
    reason: metric.notes[0] ?? config.missingReason,
  };
}

function pickMatchingEventTiming(
  buffer: BrowserProbeBuffer,
  startAt: number | null,
  preferredNames: string[] = [],
): EventTimingSample | null {
  if (startAt === null) {
    return null;
  }

  const candidates = [...buffer.eventTimings]
    .filter((sample) => sample.startTime >= startAt - 8 && sample.startTime <= startAt + 250)
    .sort((left, right) => {
      const leftPreferred = preferredNames.includes(left.name) ? 0 : 1;
      const rightPreferred = preferredNames.includes(right.name) ? 0 : 1;
      if (leftPreferred !== rightPreferred) {
        return leftPreferred - rightPreferred;
      }
      return left.startTime - right.startTime;
    });

  return candidates[0] ?? null;
}

function buildInputMetric(buffer: BrowserProbeBuffer): TimedMetric {
  const triggerName = buffer.firstInputTrigger?.replace(/^first-/, "") ?? null;
  const matchedTiming = pickMatchingEventTiming(buffer, buffer.firstInputAt, triggerName ? [triggerName] : []);
  if (matchedTiming && typeof matchedTiming.duration === "number") {
    const start = normalizeNumber(matchedTiming.startTime);
    const end = normalizeNumber(matchedTiming.startTime + matchedTiming.duration);
    return buildTimedMetric(
      "first-input-to-next-paint",
      start,
      end,
      "event-timing",
      "PerformanceEventTiming",
      "interaction-start-to-next-paint",
      [
        `derived from PerformanceEventTiming:${matchedTiming.name}`,
        matchedTiming.inputDelay !== null ? `input delay ${matchedTiming.inputDelay}ms` : "input delay unavailable",
        matchedTiming.handlerDuration !== null ? `handler duration ${matchedTiming.handlerDuration}ms` : "handler duration unavailable",
        matchedTiming.presentationDelay !== null ? `presentation delay ${matchedTiming.presentationDelay}ms` : "presentation delay unavailable",
      ],
    );
  }

  if (buffer.firstInputAt !== null && buffer.firstInputPaintAt !== null) {
    return buildTimedMetric(
      "first-input-to-next-paint",
      normalizeNumber(buffer.firstInputAt),
      normalizeNumber(buffer.firstInputPaintAt),
      "raf-estimate",
      "requestAnimationFrame",
      "interaction-start-to-next-paint",
      ["event timing missing or unsupported; using requestAnimationFrame paint estimate"],
    );
  }

  return buildTimedMetric("first-input-to-next-paint", null, null, "missing", "missing", "missing", ["no first input timing captured"]);
}

function buildRestartNextPaintMetric(buffer: BrowserProbeBuffer): TimedMetric {
  if (buffer.restartAttemptAt !== null && buffer.restartPaintAt !== null) {
    return buildTimedMetric(
      "restart-to-next-paint",
      normalizeNumber(buffer.restartAttemptAt),
      normalizeNumber(buffer.restartPaintAt),
      "raf-estimate",
      "requestAnimationFrame",
      "restart-action-to-next-paint",
      ["generic restart paint estimate after explicit restart control"],
    );
  }

  return buildTimedMetric(
    "restart-to-next-paint",
    normalizeNumber(buffer.restartAttemptAt),
    null,
    buffer.restartAttemptAt === null ? "missing" : "raf-estimate",
    buffer.restartAttemptAt === null ? "missing" : "requestAnimationFrame",
    buffer.restartAttemptAt === null ? "missing" : "restart-action-to-next-paint",
    buffer.restartAttemptAt === null
      ? ["no explicit restart control observed during bounded probe"]
      : ["restart control observed, but no follow-up paint estimate was captured"],
  );
}

function buildControlReadyMetric(buffer: BrowserProbeBuffer): TimedMetric {
  if (
    buffer.restartAttemptAt !== null &&
    buffer.restartReadyAt !== null &&
    buffer.postRestartProbeAt !== null &&
    (buffer.restartPaintAt === null || buffer.restartReadyAt >= buffer.restartPaintAt)
  ) {
    return buildTimedMetric(
      "restart-to-control-ready-estimate",
      normalizeNumber(buffer.restartAttemptAt),
      normalizeNumber(buffer.restartReadyAt),
      "post-restart-probe",
      "post-restart probe + requestAnimationFrame",
      "restart-action-to-post-restart-control-ready-estimate",
      ["heuristic: explicit restart control plus first post-restart probe input that produced a follow-up paint; not a game-specific readiness signal"],
    );
  }

  return buildTimedMetric(
    "restart-to-control-ready-estimate",
    normalizeNumber(buffer.restartAttemptAt),
    null,
    buffer.restartAttemptAt === null ? "missing" : "post-restart-probe",
    buffer.restartAttemptAt === null ? "missing" : "post-restart probe + requestAnimationFrame",
    buffer.restartAttemptAt === null ? "missing" : "restart-action-to-post-restart-control-ready-estimate",
    buffer.restartAttemptAt === null
      ? ["no explicit restart control observed during bounded probe"]
      : ["restart was observed, but no reliable post-restart probe input plus follow-up paint confirmed control-ready state"],
  );
}

async function buildResult(
  buffer: BrowserProbeBuffer,
  target: ResponsivenessProbeResult["target"],
  page: Page,
  interactions: InteractionSequenceResult,
): Promise<ResponsivenessProbeResult> {
  const loafBlockingDuration = buffer.loafSamples.reduce((max, sample) => Math.max(max, sample.blockingDuration ?? 0), 0);
  const loafInvokers = [...new Set(buffer.loafSamples.flatMap((sample) => sample.invokers))];
  const firstMatchedTiming = pickMatchingEventTiming(buffer, buffer.firstInputAt, buffer.firstInputTrigger ? [buffer.firstInputTrigger.replace(/^first-/, "")] : []);
  const supportFallbackReasons = [
    buffer.support.eventTiming ? null : "event timing unsupported; first-input timing falls back to requestAnimationFrame estimate",
    buffer.support.eventTiming && buffer.eventTimings.length === 0 ? "event timing supported but no matching bounded sample was emitted; first-input timing may stay estimated" : null,
    buffer.support.longAnimationFrame ? null : "long-animation-frame unsupported; blocking attribution stays unavailable",
    buffer.support.longAnimationFrame && buffer.loafSamples.length === 0 ? "long-animation-frame supported but no threshold-crossing sample was observed during bounded probe" : null,
    interactions.restartControl ? null : "no explicit restart control surfaced during bounded probe; restart evidence remains missing",
  ].filter((item): item is string => item !== null);
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const pageTitle = await page.title();
  const firstInputTiming = buildInputMetric(buffer);
  const restartNextPaint = buildRestartNextPaintMetric(buffer);
  const restartControlReady = buildControlReadyMetric(buffer);
  const firstInputStatus = buildEvidenceStatus("first-input-to-next-paint", firstInputTiming, {
    measuredSource: "PerformanceEventTiming",
    estimatedSource: "requestAnimationFrame",
    unsupportedWhen: !buffer.support.eventTiming && !buffer.support.animationFrame,
    unsupportedReason: "Neither PerformanceEventTiming nor requestAnimationFrame was available for first-input-to-next-paint evidence.",
    missingReason: "No first-input timing was captured during the bounded probe.",
  });
  const restartNextPaintStatus = buildEvidenceStatus("restart-to-next-paint", restartNextPaint, {
    estimatedSource: "requestAnimationFrame",
    unsupportedWhen: !buffer.support.animationFrame,
    unsupportedReason: "requestAnimationFrame was unavailable, so no restart paint estimate could be captured.",
    missingReason: "Restart was not observed or did not yield a follow-up paint estimate.",
  });
  const restartControlReadyStatus = buildEvidenceStatus("restart-to-control-ready", restartControlReady, {
    estimatedSource: "post-restart probe + requestAnimationFrame",
    unsupportedWhen: !buffer.support.animationFrame,
    unsupportedReason: "requestAnimationFrame was unavailable, so the probe could not estimate restart control-ready timing.",
    missingReason: "Restart was not observed or the post-restart probe never produced a control-ready estimate.",
  });
  const blockedFrameStatus: EvidenceStatus =
    buffer.loafSamples.length > 0
      ? {
          label: "blocked-frame-attribution",
          status: "measured",
          source: "Long Animation Frame API",
          state: "measured",
          reusable: true,
          reason:
            loafInvokers.length > 0
              ? `Long Animation Frame samples captured blocking-duration evidence during the bounded probe; invokers observed: ${loafInvokers.join(", ")}.`
              : "Long Animation Frame samples captured blocking-duration evidence during the bounded probe.",
        }
      : buffer.support.longAnimationFrame
        ? {
            label: "blocked-frame-attribution",
            status: "missing",
            source: null,
            state: "unobserved",
            reusable: false,
            reason: "Long Animation Frame support exists, but no sampled frame crossed the reporting threshold during the bounded probe.",
          }
        : {
            label: "blocked-frame-attribution",
            status: "unsupported",
            source: null,
            state: "unsupported",
            reusable: false,
            reason: "Long Animation Frame API was unavailable in this browser/context.",
          };

  return {
    target,
    support: {
      eventTiming: buildSupportSurface(
        buffer.support.eventTiming,
        buffer.eventTimings.length > 0,
        "PerformanceEventTiming available for real interaction-to-next-paint evidence when samples are emitted.",
        "PerformanceEventTiming unavailable in this browser/context.",
        "PerformanceEventTiming support exists, but no matching event sample was emitted during the bounded probe.",
      ),
      longAnimationFrame: buildSupportSurface(
        buffer.support.longAnimationFrame,
        buffer.loafSamples.length > 0,
        "Long Animation Frame entries available for blocked-frame attribution.",
        "Long Animation Frame API unavailable in this browser/context.",
        "Long Animation Frame support exists, but no sample crossed the reporting threshold during the bounded probe.",
      ),
      animationFrame: buildSupportSurface(
        buffer.support.animationFrame,
        buffer.firstInputPaintAt !== null || buffer.restartPaintAt !== null || buffer.restartReadyAt !== null,
        "requestAnimationFrame fallback available for paint-adjacent estimates.",
        "requestAnimationFrame unavailable.",
      ),
    },
    evidenceStatus: {
      firstInputToNextPaint: firstInputStatus,
      restartToNextPaint: restartNextPaintStatus,
      restartToControlReady: restartControlReadyStatus,
      blockedFrameAttribution: blockedFrameStatus,
    },
    invoker: {
      attribution: target.resolvedFrom === "slug" ? `slug:${target.slug ?? "unknown"} -> ${page.url()}` : page.url(),
      fallbackReasons: supportFallbackReasons,
    },
    firstInput: {
      observed: buffer.firstInputAt !== null,
      timing: firstInputTiming,
      source: firstInputStatus,
      trigger: buffer.firstInputTrigger,
      eventTimings: buffer.eventTimings,
      fallbackReasons:
        buffer.firstInputAt === null
          ? ["no first input captured during bounded probe"]
          : firstInputTiming.evidence === "event-timing"
            ? []
            : [
                ...firstInputTiming.notes,
                firstMatchedTiming === null && buffer.support.eventTiming
                  ? "PerformanceEventTiming support existed, but no matching event sample aligned with the bounded first input."
                  : "requestAnimationFrame estimate used because event timing support was absent.",
              ],
    },
    restartReadiness: {
      observed: buffer.restartAttemptAt !== null,
      restartControl: buffer.restartAttemptSource,
      nextPaint: restartNextPaint,
      controlReady: restartControlReady,
      semantics: {
        nextPaint: "restart action to first follow-up paint estimate after explicit restart control",
        controlReady: "restart action to first post-restart probe input that produced a follow-up paint estimate",
        controlReadyIsHeuristic: true,
      },
      controlMarkers: buffer.markers,
      fallbackReasons:
        buffer.restartAttemptAt === null
          ? ["restart or retry control not observed during bounded probe"]
          : restartControlReady.duration === null
            ? restartControlReady.notes
            : restartControlReady.notes,
    },
    loaf: {
      observed: buffer.loafSamples.length > 0,
      supportState: buffer.support.longAnimationFrame
        ? buffer.loafSamples.length > 0
          ? "supported-observed"
          : "supported-unobserved"
        : "unsupported",
      samples: buffer.loafSamples,
      blockingDurationMs: loafBlockingDuration > 0 ? loafBlockingDuration : null,
      fallbackReasons:
        buffer.loafSamples.length === 0
          ? [buffer.support.longAnimationFrame ? "no long-animation-frame sample captured" : "long-animation-frame unsupported"]
          : [],
    },
    interactions: {
      attempted: interactions.attempted,
      completed: interactions.completed,
      bounded: true,
    },
    metadata: {
      capturedAt: new Date().toISOString(),
      userAgent,
      pageTitle,
      pageUrl: page.url(),
      notes:
        supportFallbackReasons.length > 0
          ? [`direct browser target resolved from ${target.resolvedFrom}`, ...supportFallbackReasons]
          : [`direct browser target resolved from ${target.resolvedFrom}`, "all observer surfaces available"],
    },
  };
}

async function runWithBrowser(options: ParsedOptions, target: ResponsivenessProbeResult["target"]): Promise<ResponsivenessProbeResult> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: options.userAgent, viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  try {
    await installRecorder(page);
    await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: options.navigationTimeoutMs });
    const interactions = await boundedInteractionSequence(page, options.entrySelectors, options.restartSelectors, options.actionTimeoutMs);
    await page.waitForTimeout(Math.min(500, options.actionTimeoutMs));
    const buffer = await readBuffer(page);
    return await buildResult(buffer, target, page, interactions);
  } finally {
    await context.close();
    await browser.close();
  }
}

function writeResult(outPath: string, result: ResponsivenessProbeResult): void {
  ensureParentDirectory(outPath);
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

function printSummary(result: ResponsivenessProbeResult): void {
  console.log(`target: ${result.target.slug ?? result.target.url}`);
  console.log(
    `first input: ${result.evidenceStatus.firstInputToNextPaint.status}${result.firstInput.timing.duration !== null ? ` (${result.firstInput.timing.duration}ms via ${result.firstInput.timing.evidence})` : ""}`,
  );
  console.log(
    `restart next paint: ${result.evidenceStatus.restartToNextPaint.status}${result.restartReadiness.nextPaint.duration !== null ? ` (${result.restartReadiness.nextPaint.duration}ms via ${result.restartReadiness.nextPaint.evidence})` : ""}`,
  );
  console.log(
    `restart control ready: ${result.evidenceStatus.restartToControlReady.status}${result.restartReadiness.controlReady.duration !== null ? ` (${result.restartReadiness.controlReady.duration}ms via ${result.restartReadiness.controlReady.evidence})` : ""}`,
  );
  console.log(`event timing: ${result.support.eventTiming.supported ? "supported" : "unsupported"}`);
  console.log(`long animation frame: ${result.support.longAnimationFrame.supported ? "supported" : "unsupported"}${result.loaf.blockingDurationMs !== null ? `; max blocking ${result.loaf.blockingDurationMs}ms` : ""}`);
  if (result.invoker.fallbackReasons.length > 0 || result.firstInput.fallbackReasons.length > 0 || result.restartReadiness.fallbackReasons.length > 0 || result.loaf.fallbackReasons.length > 0) {
    console.log("fallbacks:");
    for (const reason of [...result.invoker.fallbackReasons, ...result.firstInput.fallbackReasons, ...result.restartReadiness.fallbackReasons, ...result.loaf.fallbackReasons]) {
      console.log(`- ${reason}`);
    }
  }
}

export async function runBrowserResponsivenessProbe(options: ResponsivenessProbeOptions): Promise<ResponsivenessProbeResult> {
  const parsed: ParsedOptions = {
    timeoutMs: options.timeoutMs ?? 45_000,
    navigationTimeoutMs: options.navigationTimeoutMs ?? 15_000,
    actionTimeoutMs: options.actionTimeoutMs ?? 1_500,
    entrySelectors: options.entrySelectors ?? [...DEFAULT_ENTRY_SELECTORS],
    restartSelectors: options.restartSelectors ?? [...DEFAULT_RESTART_SELECTORS],
    url: options.url,
    slug: options.slug,
    out: options.out,
    userAgent: options.userAgent,
    dryRun: options.dryRun,
  };

  const target: ResponsivenessProbeResult["target"] = parsed.url
    ? { url: parsed.url, slug: parsed.slug ?? null, resolvedFrom: "url", directBrowserAssumption: true }
    : { url: pathToFileURL(resolve(process.cwd(), parsed.slug ?? "", "index.html")).toString(), slug: parsed.slug ?? null, resolvedFrom: "slug", directBrowserAssumption: true };

  if (parsed.dryRun) {
    return {
      target,
      support: {
        eventTiming: buildSupportSurface(false, false, "", "dry run requested"),
        longAnimationFrame: buildSupportSurface(false, false, "", "dry run requested"),
        animationFrame: buildSupportSurface(true, false, "requestAnimationFrame fallback available for paint-adjacent estimates.", "dry run requested"),
      },
      evidenceStatus: {
        firstInputToNextPaint: {
          label: "first-input-to-next-paint",
          status: "missing",
          source: null,
          state: "unobserved",
          reusable: false,
          reason: "Dry run requested.",
        },
        restartToNextPaint: {
          label: "restart-to-next-paint",
          status: "missing",
          source: null,
          state: "unobserved",
          reusable: false,
          reason: "Dry run requested.",
        },
        restartToControlReady: {
          label: "restart-to-control-ready",
          status: "missing",
          source: null,
          state: "unobserved",
          reusable: false,
          reason: "Dry run requested.",
        },
        blockedFrameAttribution: {
          label: "blocked-frame-attribution",
          status: "missing",
          source: null,
          state: "unobserved",
          reusable: false,
          reason: "Dry run requested.",
        },
      },
      invoker: { attribution: "dry-run", fallbackReasons: ["dry run requested"] },
      firstInput: {
        observed: false,
        timing: buildTimedMetric("first-input-to-next-paint", null, null, "missing", "missing", "missing", ["dry run requested"]),
        source: {
          label: "first-input-to-next-paint",
          status: "missing",
          source: null,
          state: "unobserved",
          reusable: false,
          reason: "Dry run requested.",
        },
        trigger: null,
        eventTimings: [],
        fallbackReasons: ["dry run requested"],
      },
      restartReadiness: {
        observed: false,
        restartControl: null,
        nextPaint: buildTimedMetric("restart-to-next-paint", null, null, "missing", "missing", "missing", ["dry run requested"]),
        controlReady: buildTimedMetric("restart-to-control-ready-estimate", null, null, "missing", "missing", "missing", ["dry run requested"]),
        semantics: {
          nextPaint: "restart action to first follow-up paint estimate after explicit restart control",
          controlReady: "restart action to first post-restart probe input that produced a follow-up paint estimate",
          controlReadyIsHeuristic: true,
        },
        controlMarkers: ["dry-run"],
        fallbackReasons: ["dry run requested"],
      },
      loaf: {
        observed: false,
        supportState: "unsupported",
        samples: [],
        blockingDurationMs: null,
        fallbackReasons: ["dry run requested"],
      },
      interactions: {
        attempted: [],
        completed: [],
        bounded: true,
      },
      metadata: {
        capturedAt: new Date().toISOString(),
        userAgent: options.userAgent ?? "dry-run",
        pageTitle: "dry-run",
        pageUrl: target.url,
        notes: ["dry run requested"],
      },
    };
  }

  const result = await runWithBrowser(parsed, target);
  if (parsed.out) {
    writeResult(resolve(parsed.out), result);
  }
  return result;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await runBrowserResponsivenessProbe(options);
  printSummary(result);
}

const isMain = (process.argv[1] ?? "").includes("browser_responsiveness_probe.ts");

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
