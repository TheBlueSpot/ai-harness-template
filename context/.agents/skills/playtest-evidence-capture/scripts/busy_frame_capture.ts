import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Page } from "playwright";

type BusyFrameTag =
  | "motion-behind-text"
  | "cue masking"
  | "timed-text loss"
  | "contrast risk"
  | "audio-only dependency";

type CliOptions = {
  url?: string;
  slug?: string;
  out?: string;
  framesDir?: string;
  durationMs: number;
  intervalMs: number;
  warmupMs: number;
  maxFrames: number;
  viewportWidth: number;
  viewportHeight: number;
  dryRun?: boolean;
};

type Target = {
  url: string;
  slug: string | null;
  resolvedFrom: "url" | "slug";
};

type AudioActivity = {
  count: number;
  labels: string[];
};

type TextCueSample = {
  key: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  centered: boolean;
  edgeAnchored: boolean;
  transparentBackground: boolean;
  contrastRatio: number | null;
  color: string | null;
  backgroundColor: string | null;
  zIndex: string | null;
};

type SampleSnapshot = {
  sampleIndex: number;
  atMs: number;
  viewport: { width: number; height: number };
  textCues: TextCueSample[];
  audioActivity: AudioActivity;
};

type TagRecord = {
  tag: BusyFrameTag;
  note: string;
};

type TaggedFrameCandidate = {
  sampleIndex: number;
  atMs: number;
  tags: TagRecord[];
  score: number;
  stressFrame: {
    moment: string;
    clutterSource: string;
    movingBackground: boolean;
    blinkingContent: boolean;
    autoUpdatingContent: boolean;
    cameraMotion: boolean;
    criticalInfoLost: boolean;
    cueMasked: boolean;
    responseStillReadable: boolean;
    criticalElementsReadableUnderMotion: boolean;
    tags: BusyFrameTag[];
    frameId: string;
    framePath: string;
    capturedAtMs: number;
    notes: string;
  };
  ephemeralMoments: {
    name: string;
    kind: "warning" | "notification" | "status";
    importance: "critical" | "supporting" | "secondary";
    appearsNearAction: boolean;
    autoDismisses: boolean;
    dismissSeconds: number;
    playerControlledAdvance: boolean;
    reviewableLater: boolean;
    suppressibleWhenNonCritical: boolean;
    obstructsCriticalRead: boolean;
    notes: string;
  }[];
};

type SavedFrame = {
  id: string;
  filePath: string;
  fileName: string;
  sampleIndex: number;
  capturedAtMs: number;
  score: number;
  tags: BusyFrameTag[];
  notes: string[];
};

type BusyFrameCaptureArtifact = {
  schemaVersion: 1;
  captureKind: "busy-frame";
  target: Target & { directBrowserAssumption: true };
  captureWindow: {
    startedAt: string;
    durationMs: number;
    intervalMs: number;
    warmupMs: number;
    samples: number;
    viewportWidth: number;
    viewportHeight: number;
  };
  summary: {
    tagCounts: Record<BusyFrameTag, number>;
    audioActivityObserved: boolean;
    savedFrames: number;
    totalTaggedSamples: number;
    notes: string[];
  };
  frames: SavedFrame[];
  observationPatch: {
    sessionFocus: string[];
    evidence: {
      sampledBusyFrames: number;
      notes: string[];
    };
    stressFrames: TaggedFrameCandidate["stressFrame"][];
    ephemeralMoments: TaggedFrameCandidate["ephemeralMoments"][number][];
    channelSupport: {
      criticalInfoUsesAudioOnly: boolean;
      muteCriticalInfoStillPlayable: boolean | null;
    };
    incidents: {
      incidentTag: string;
      title: string;
      lenses: ("hud" | "onboarding")[];
      firstSeenAt: string;
      repeatedCount: number;
      impact: "medium" | "high";
      persistence: "repeatable";
      playerCost: ("confusion" | "attention-tax")[];
      nextCheck: string;
      notes: string;
    }[];
    probeOutcomes: {
      probe: "busy-frame";
      goal: string;
      outcome: "success" | "partial" | "failed";
      successRating: number;
      confidence: number;
      satisfaction: number;
      frustration: number;
      mentalDemand: number;
      timePressure: number;
      effort: number;
      blockers: string[];
      notes: string;
    }[];
  };
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    durationMs: 4_000,
    intervalMs: 400,
    warmupMs: 1_000,
    maxFrames: 4,
    viewportWidth: 1280,
    viewportHeight: 720,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (
      [
        "--url",
        "--slug",
        "--out",
        "--frames-dir",
        "--duration-ms",
        "--interval-ms",
        "--warmup-ms",
        "--max-frames",
        "--viewport-width",
        "--viewport-height",
      ].includes(current) &&
      !next
    ) {
      throw new Error(`Missing value for ${current}`);
    }

    if (current === "--url") {
      options.url = next;
      index += 1;
      continue;
    }
    if (current === "--slug") {
      options.slug = next;
      index += 1;
      continue;
    }
    if (current === "--out") {
      options.out = next;
      index += 1;
      continue;
    }
    if (current === "--frames-dir") {
      options.framesDir = next;
      index += 1;
      continue;
    }
    if (current === "--duration-ms") {
      options.durationMs = Number(next);
      index += 1;
      continue;
    }
    if (current === "--interval-ms") {
      options.intervalMs = Number(next);
      index += 1;
      continue;
    }
    if (current === "--warmup-ms") {
      options.warmupMs = Number(next);
      index += 1;
      continue;
    }
    if (current === "--max-frames") {
      options.maxFrames = Number(next);
      index += 1;
      continue;
    }
    if (current === "--viewport-width") {
      options.viewportWidth = Number(next);
      index += 1;
      continue;
    }
    if (current === "--viewport-height") {
      options.viewportHeight = Number(next);
      index += 1;
      continue;
    }
    if (current === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (current === "--help" || current === "-h") {
      printHelpAndExit();
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  return options;
}

function printHelpAndExit(): never {
  console.log([
    "busy_frame_capture",
    "",
    "Usage:",
    "  bun.cmd .agents/skills/playtest-evidence-capture/scripts/busy_frame_capture.ts --slug qix-fracture --out .local/qix-busy.json",
    "  bun.cmd .agents/skills/playtest-evidence-capture/scripts/busy_frame_capture.ts --url http://localhost:3000 --out .local/busy.json",
    "",
    "Options:",
    "  --url <url>                Direct browser target URL.",
    "  --slug <slug>              Resolve ./<slug>/index.html as the target.",
    "  --out <file>               Write normalized busy-frame artifact JSON.",
    "  --frames-dir <dir>         Override screenshot output directory.",
    "  --duration-ms <ms>         Active sample window after warmup.",
    "  --interval-ms <ms>         Sample cadence during the window.",
    "  --warmup-ms <ms>           Delay before the active sample window.",
    "  --max-frames <n>           Maximum tagged screenshots to save.",
    "  --viewport-width <px>      Browser viewport width.",
    "  --viewport-height <px>     Browser viewport height.",
    "  --dry-run                  Resolve target and print summary only.",
  ].join("\n"));
  process.exit(0);
}

function resolveTarget(options: CliOptions): Target {
  if (options.url) {
    return {
      url: options.url,
      slug: options.slug ?? null,
      resolvedFrom: "url",
    };
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

function ensureParentDirectory(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

function deriveFramesDir(outPath: string, slug: string | null): string {
  const safeSlug = slug ?? "capture";
  const directory = dirname(resolve(outPath));
  return resolve(directory, `${safeSlug}-busy-frames`);
}

async function installAudioRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type AudioActivity = { count: number; labels: string[] };
    const win = window as typeof window & { __busyFrameAudioActivity?: AudioActivity };
    const audioActivity = (win.__busyFrameAudioActivity ??= { count: 0, labels: [] });

    const markAudio = (label: string) => {
      audioActivity.count += 1;
      if (audioActivity.labels.length < 25) {
        audioActivity.labels.push(label);
      }
    };

    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function patchedPlay(...args: Parameters<typeof originalPlay>) {
      markAudio("html-media-play");
      return originalPlay.apply(this, args);
    };

    const originalResume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = function patchedResume(...args: Parameters<typeof originalResume>) {
      markAudio("audio-context-resume");
      return originalResume.apply(this, args);
    };
  });
}

function luminanceFromChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(color: [number, number, number], background: [number, number, number]): number {
  const luminanceA =
    0.2126 * luminanceFromChannel(color[0]) +
    0.7152 * luminanceFromChannel(color[1]) +
    0.0722 * luminanceFromChannel(color[2]);
  const luminanceB =
    0.2126 * luminanceFromChannel(background[0]) +
    0.7152 * luminanceFromChannel(background[1]) +
    0.0722 * luminanceFromChannel(background[2]);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return Number((((lighter + 0.05) / (darker + 0.05)) * 100).toFixed(0)) / 100;
}

async function collectSnapshot(page: Page, sampleIndex: number, atMs: number): Promise<SampleSnapshot> {
  return await page.evaluate(
    ({ currentSampleIndex, currentAtMs, contrastFnSource }) => {
      const parseColor = (value: string | null): [number, number, number, number] | null => {
        if (!value) {
          return null;
        }
        const match = value.match(/rgba?\(([^)]+)\)/i);
        if (!match) {
          return null;
        }
        const pieces = match[1].split(",").map((piece) => Number(piece.trim()));
        if (pieces.length < 3 || pieces.some((piece) => Number.isNaN(piece))) {
          return null;
        }
        return [pieces[0], pieces[1], pieces[2], pieces.length > 3 ? pieces[3] : 1];
      };

      const contrastRatioLocal = new Function(
        "color",
        "background",
        `return (${contrastFnSource})(color, background);`,
      ) as (color: [number, number, number], background: [number, number, number]) => number;

      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const textCues: TextCueSample[] = [];
      const elements = Array.from(document.querySelectorAll<HTMLElement>("body *"));

      const visibleElements = elements.filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const text = element.innerText?.trim() ?? "";
        return (
          text.length > 0 &&
          rect.width >= 24 &&
          rect.height >= 12 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.left < viewport.width &&
          rect.top < viewport.height &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          Number(style.opacity || "1") > 0.2
        );
      });

      for (const element of visibleElements.slice(0, 120)) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const text = (element.innerText ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .join(" ")
          .slice(0, 120);
        const color = parseColor(style.color);

        let backgroundColor = parseColor(style.backgroundColor);
        let backgroundElement: HTMLElement | null = element.parentElement;
        while (
          (!backgroundColor || backgroundColor[3] < 0.9) &&
          backgroundElement &&
          backgroundElement !== document.body
        ) {
          const nextColor = parseColor(window.getComputedStyle(backgroundElement).backgroundColor);
          if (nextColor && nextColor[3] >= 0.9) {
            backgroundColor = nextColor;
            break;
          }
          backgroundElement = backgroundElement.parentElement;
        }

        const transparentBackground = !backgroundColor || backgroundColor[3] < 0.9;
        const contrast =
          color && backgroundColor
            ? contrastRatioLocal(
                [color[0], color[1], color[2]],
                [backgroundColor[0], backgroundColor[1], backgroundColor[2]],
              )
            : null;
        const centered =
          rect.left < viewport.width * 0.72 &&
          rect.right > viewport.width * 0.28 &&
          rect.top < viewport.height * 0.72 &&
          rect.bottom > viewport.height * 0.28;
        const edgeAnchored =
          rect.left <= viewport.width * 0.15 ||
          rect.right >= viewport.width * 0.85 ||
          rect.top <= viewport.height * 0.15 ||
          rect.bottom >= viewport.height * 0.85;

        textCues.push({
          key: `${text.toLowerCase()}|${Math.round(rect.left)}|${Math.round(rect.top)}|${Math.round(rect.width)}|${Math.round(rect.height)}`,
          text,
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          area: Math.round(rect.width * rect.height),
          centered,
          edgeAnchored,
          transparentBackground,
          contrastRatio: contrast,
          color: style.color || null,
          backgroundColor: style.backgroundColor || null,
          zIndex: style.zIndex || null,
        });
      }

      const win = window as typeof window & {
        __busyFrameAudioActivity?: AudioActivity;
      };

      return {
        sampleIndex: currentSampleIndex,
        atMs: currentAtMs,
        viewport,
        textCues,
        audioActivity: win.__busyFrameAudioActivity ?? { count: 0, labels: [] },
      };
    },
    {
      currentSampleIndex: sampleIndex,
      currentAtMs: atMs,
      contrastFnSource: contrastRatio.toString(),
    },
  );
}

function rectsOverlap(a: TextCueSample, b: TextCueSample): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function clampScore(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function detectTimedTextLoss(samples: SampleSnapshot[]): Map<number, TagRecord[]> {
  const ephemeralBySample = new Map<number, TagRecord[]>();
  const appearances = new Map<
    string,
    { firstIndex: number; lastIndex: number; firstAtMs: number; lastAtMs: number; text: string }
  >();

  for (const sample of samples) {
    for (const cue of sample.textCues) {
      const existing = appearances.get(cue.text.toLowerCase());
      if (existing) {
        existing.lastIndex = sample.sampleIndex;
        existing.lastAtMs = sample.atMs;
      } else {
        appearances.set(cue.text.toLowerCase(), {
          firstIndex: sample.sampleIndex,
          lastIndex: sample.sampleIndex,
          firstAtMs: sample.atMs,
          lastAtMs: sample.atMs,
          text: cue.text,
        });
      }
    }
  }

  for (const appearance of appearances.values()) {
    const lifetime = appearance.lastAtMs - appearance.firstAtMs;
    if (appearance.firstIndex !== appearance.lastIndex && lifetime <= 1_800) {
      const records = ephemeralBySample.get(appearance.firstIndex) ?? [];
      records.push({
        tag: "timed-text loss",
        note: `text cue "${appearance.text}" appeared and vanished within ${lifetime}ms`,
      });
      ephemeralBySample.set(appearance.firstIndex, records);
    }
  }

  return ephemeralBySample;
}

function tagSamples(samples: SampleSnapshot[]): TaggedFrameCandidate[] {
  const timedTextLoss = detectTimedTextLoss(samples);
  const tagged: TaggedFrameCandidate[] = [];

  for (const sample of samples) {
    const tagRecords: TagRecord[] = [...(timedTextLoss.get(sample.sampleIndex) ?? [])];
    const centeredTransparent = sample.textCues.filter((cue) => cue.centered && cue.transparentBackground);
    const lowContrast = sample.textCues.filter(
      (cue) => cue.contrastRatio !== null && cue.contrastRatio < 4.5,
    );
    const overlappingPairs = sample.textCues.some((cue, index) =>
      sample.textCues.slice(index + 1).some((other) => rectsOverlap(cue, other)),
    );
    const centralCrowding = sample.textCues.filter((cue) => cue.centered).length >= 3;
    const audioOnlyRisk =
      sample.audioActivity.count > 0 &&
      sample.textCues.filter((cue) => cue.centered || !cue.edgeAnchored).length === 0;

    if (centeredTransparent.length > 0) {
      tagRecords.push({
        tag: "motion-behind-text",
        note: `${centeredTransparent.length} central text cue(s) sat over transparent background during active play`,
      });
    }
    if (overlappingPairs || centralCrowding) {
      tagRecords.push({
        tag: "cue masking",
        note: overlappingPairs
          ? "visible text cues overlapped inside the sampled frame"
          : "several central text cues competed in the same sampled frame",
      });
    }
    if (lowContrast.length > 0) {
      tagRecords.push({
        tag: "contrast risk",
        note: `${lowContrast.length} text cue(s) measured below a 4.5:1 text/background contrast ratio`,
      });
    }
    if (audioOnlyRisk) {
      tagRecords.push({
        tag: "audio-only dependency",
        note: "audio activity fired without a matching visible central cue during the same sample",
      });
    }

    const dedupedTags = [...new Map(tagRecords.map((record) => [record.tag, record])).values()];
    if (dedupedTags.length === 0) {
      continue;
    }

    const clutterParts: string[] = [];
    if (dedupedTags.some((record) => record.tag === "motion-behind-text")) {
      clutterParts.push("transparent text over live playfield");
    }
    if (dedupedTags.some((record) => record.tag === "cue masking")) {
      clutterParts.push("overlapping cue stack");
    }
    if (dedupedTags.some((record) => record.tag === "timed-text loss")) {
      clutterParts.push("short-lived text cue");
    }
    if (dedupedTags.some((record) => record.tag === "contrast risk")) {
      clutterParts.push("low-contrast text");
    }
    if (dedupedTags.some((record) => record.tag === "audio-only dependency")) {
      clutterParts.push("audio without visible backup");
    }

    const tags = dedupedTags.map((record) => record.tag);
    const frameId = `busy-frame-${String(sample.sampleIndex + 1).padStart(2, "0")}`;
    const score =
      tags.length * 2 +
      clampScore(sample.textCues.filter((cue) => cue.centered).length, 0, 3) +
      clampScore(sample.audioActivity.count, 0, 2);

    tagged.push({
      sampleIndex: sample.sampleIndex,
      atMs: sample.atMs,
      tags: dedupedTags,
      score,
      stressFrame: {
        moment: `busy frame sample ${sample.sampleIndex + 1} at ${(sample.atMs / 1000).toFixed(2)}s`,
        clutterSource: clutterParts.join(" + "),
        movingBackground: tags.includes("motion-behind-text"),
        blinkingContent: false,
        autoUpdatingContent: true,
        cameraMotion: false,
        criticalInfoLost:
          tags.includes("timed-text loss") || tags.includes("audio-only dependency"),
        cueMasked: tags.includes("cue masking"),
        responseStillReadable: !(tags.includes("cue masking") && tags.includes("timed-text loss")),
        criticalElementsReadableUnderMotion:
          !tags.includes("motion-behind-text") && !tags.includes("contrast risk"),
        tags,
        frameId,
        framePath: "",
        capturedAtMs: sample.atMs,
        notes: dedupedTags.map((record) => record.note).join(" | "),
      },
      ephemeralMoments: dedupedTags
        .filter((record) => record.tag === "timed-text loss")
        .map((record) => ({
          name: "short-lived sampled text cue",
          kind: "warning" as const,
          importance: "critical" as const,
          appearsNearAction: true,
          autoDismisses: true,
          dismissSeconds: 2,
          playerControlledAdvance: false,
          reviewableLater: false,
          suppressibleWhenNonCritical: false,
          obstructsCriticalRead: true,
          notes: record.note,
        })),
    });
  }

  return tagged.sort((left, right) => right.score - left.score || left.sampleIndex - right.sampleIndex);
}

function pickFrames(tagged: TaggedFrameCandidate[], maxFrames: number): TaggedFrameCandidate[] {
  const picked: TaggedFrameCandidate[] = [];
  const seenSampleIndexes = new Set<number>();

  for (const tag of [
    "motion-behind-text",
    "cue masking",
    "timed-text loss",
    "contrast risk",
    "audio-only dependency",
  ] as BusyFrameTag[]) {
    const match = tagged.find(
      (candidate) =>
        !seenSampleIndexes.has(candidate.sampleIndex) &&
        candidate.stressFrame.tags.includes(tag),
    );
    if (!match) {
      continue;
    }
    picked.push(match);
    seenSampleIndexes.add(match.sampleIndex);
    if (picked.length >= maxFrames) {
      return picked;
    }
  }

  for (const candidate of tagged) {
    if (picked.length >= maxFrames) {
      break;
    }
    if (seenSampleIndexes.has(candidate.sampleIndex)) {
      continue;
    }
    picked.push(candidate);
    seenSampleIndexes.add(candidate.sampleIndex);
  }

  return picked;
}

async function startLikelyPlay(page: Page): Promise<void> {
  await page.mouse.click(24, 24);
  await page.keyboard.press("Space").catch(() => undefined);
  await page.keyboard.press("Enter").catch(() => undefined);
  await page.keyboard.press("ArrowRight").catch(() => undefined);
}

async function sampleBusyWindow(page: Page, options: CliOptions): Promise<SampleSnapshot[]> {
  const startedAt = Date.now();
  const samples: SampleSnapshot[] = [];
  const sampleBudget = Math.max(1, Math.floor(options.durationMs / options.intervalMs));

  for (let index = 0; index < sampleBudget; index += 1) {
    const now = Date.now();
    const atMs = now - startedAt;
    samples.push(await collectSnapshot(page, index, atMs));
    if (index < sampleBudget - 1) {
      await page.waitForTimeout(options.intervalMs);
    }
  }

  return samples;
}

async function saveTaggedFrames(
  page: Page,
  picked: TaggedFrameCandidate[],
  framesDir: string,
): Promise<SavedFrame[]> {
  mkdirSync(framesDir, { recursive: true });
  const saved: SavedFrame[] = [];

  for (const candidate of picked) {
    const fileName = `${candidate.stressFrame.frameId}.png`;
    const filePath = resolve(framesDir, fileName);
    await page.screenshot({ path: filePath, fullPage: false });
    candidate.stressFrame.framePath = filePath;
    saved.push({
      id: candidate.stressFrame.frameId,
      filePath,
      fileName,
      sampleIndex: candidate.sampleIndex,
      capturedAtMs: candidate.atMs,
      score: candidate.score,
      tags: candidate.stressFrame.tags,
      notes: candidate.tags.map((record) => record.note),
    });
  }

  return saved;
}

function buildArtifact(
  target: Target,
  options: CliOptions,
  samples: SampleSnapshot[],
  tagged: TaggedFrameCandidate[],
  savedFrames: SavedFrame[],
): BusyFrameCaptureArtifact {
  const tagCounts: Record<BusyFrameTag, number> = {
    "motion-behind-text": 0,
    "cue masking": 0,
    "timed-text loss": 0,
    "contrast risk": 0,
    "audio-only dependency": 0,
  };

  for (const candidate of tagged) {
    for (const tag of candidate.stressFrame.tags) {
      tagCounts[tag] += 1;
    }
  }

  const audioActivityObserved = samples.some((sample) => sample.audioActivity.count > 0);
  const savedFrameIds = new Set(savedFrames.map((frame) => frame.id));
  const chosenStressFrames = tagged
    .filter((candidate) => savedFrameIds.has(candidate.stressFrame.frameId))
    .map((candidate) => candidate.stressFrame);
  const ephemeralMoments = tagged
    .filter((candidate) => savedFrameIds.has(candidate.stressFrame.frameId))
    .flatMap((candidate) => candidate.ephemeralMoments);

  const incidents = [
    tagCounts["cue masking"] > 0
      ? {
          incidentTag: "busy-frame-cue-masking",
          title: "busy-frame capture found overlapping cue competition",
          lenses: ["hud", "onboarding"] as ("hud" | "onboarding")[],
          firstSeenAt: `${(chosenStressFrames[0]?.capturedAtMs ?? 0) / 1000}s`,
          repeatedCount: tagCounts["cue masking"],
          impact: tagCounts["cue masking"] >= 2 ? "high" as const : "medium" as const,
          persistence: "repeatable" as const,
          playerCost: ["confusion", "attention-tax"] as ("confusion" | "attention-tax")[],
          nextCheck: "confirm whether moving or suppressing the competing cue restores one dominant urgent read during the same window",
          notes: "generated from automated busy-frame sampling",
        }
      : null,
    tagCounts["timed-text loss"] > 0
      ? {
          incidentTag: "busy-frame-timed-text-loss",
          title: "busy-frame capture found short-lived text cue loss",
          lenses: ["hud", "onboarding"] as ("hud" | "onboarding")[],
          firstSeenAt: `${(chosenStressFrames[0]?.capturedAtMs ?? 0) / 1000}s`,
          repeatedCount: tagCounts["timed-text loss"],
          impact: "medium" as const,
          persistence: "repeatable" as const,
          playerCost: ["confusion", "attention-tax"] as ("confusion" | "attention-tax")[],
          nextCheck: "confirm whether the same prompt stays reviewable or player-paced in the next pressure sample",
          notes: "generated from automated busy-frame sampling",
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  const blockers = [
    tagCounts["cue masking"] > 0 ? "automated capture found cue masking" : null,
    tagCounts["timed-text loss"] > 0 ? "automated capture found timed-text loss" : null,
    tagCounts["contrast risk"] > 0 ? "automated capture found contrast risk" : null,
    tagCounts["audio-only dependency"] > 0 ? "automated capture found audio-only dependency risk" : null,
  ].filter((item): item is string => item !== null);

  const successPenalty =
    (tagCounts["cue masking"] > 0 ? 1 : 0) +
    (tagCounts["timed-text loss"] > 0 ? 1 : 0) +
    (tagCounts["contrast risk"] > 0 ? 1 : 0) +
    (tagCounts["audio-only dependency"] > 0 ? 1 : 0);
  const successRating = clampScore(4 - successPenalty, 0, 4);

  return {
    schemaVersion: 1,
    captureKind: "busy-frame",
    target: {
      ...target,
      directBrowserAssumption: true,
    },
    captureWindow: {
      startedAt: new Date().toISOString(),
      durationMs: options.durationMs,
      intervalMs: options.intervalMs,
      warmupMs: options.warmupMs,
      samples: samples.length,
      viewportWidth: options.viewportWidth,
      viewportHeight: options.viewportHeight,
    },
    summary: {
      tagCounts,
      audioActivityObserved,
      savedFrames: savedFrames.length,
      totalTaggedSamples: tagged.length,
      notes: [
        "artifact keeps busy-frame results in stressFrames / ephemeralMoments / incidents vocabulary",
        "merge observationPatch into an observation JSON or pass the artifact to playtest_evidence_capture.ts with --busy-frame-capture",
      ],
    },
    frames: savedFrames,
    observationPatch: {
      sessionFocus: ["busy-frame"],
      evidence: {
        sampledBusyFrames: savedFrames.length,
        notes: [
          `busy-frame capture saved ${savedFrames.length} tagged frame(s) from ${samples.length} sampled window(s)`,
        ],
      },
      stressFrames: chosenStressFrames,
      ephemeralMoments,
      channelSupport: {
        criticalInfoUsesAudioOnly: tagCounts["audio-only dependency"] > 0,
        muteCriticalInfoStillPlayable:
          tagCounts["audio-only dependency"] > 0 ? false : null,
      },
      incidents,
      probeOutcomes: [
        {
          probe: "busy-frame",
          goal: "sample a short busy browser-play window and preserve tagged clutter evidence",
          outcome:
            successRating >= 3
              ? "success"
              : successRating >= 1
                ? "partial"
                : "failed",
          successRating,
          confidence: successRating >= 3 ? 5 : 4,
          satisfaction: successRating >= 3 ? 5 : 4,
          frustration: clampScore(2 + successPenalty, 1, 7),
          mentalDemand: clampScore(3 + successPenalty, 1, 7),
          timePressure: clampScore(3 + Math.min(savedFrames.length, 2), 1, 7),
          effort: clampScore(3 + Math.min(successPenalty, 3), 1, 7),
          blockers,
          notes: `saved ${savedFrames.length} tagged frame(s); tags=${Object.entries(tagCounts)
            .filter(([, count]) => count > 0)
            .map(([tag, count]) => `${tag}:${count}`)
            .join(", ") || "none"}`,
        },
      ],
    },
  };
}

async function runCapture(options: CliOptions): Promise<BusyFrameCaptureArtifact> {
  const target = resolveTarget(options);

  if (options.dryRun) {
    return buildArtifact(target, options, [], [], []);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: options.viewportWidth, height: options.viewportHeight },
  });
  const page = await context.newPage();

  try {
    await installAudioRecorder(page);
    await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await startLikelyPlay(page);
    await page.waitForTimeout(options.warmupMs);
    const samples = await sampleBusyWindow(page, options);
    const tagged = tagSamples(samples);
    const outPath = resolve(options.out ?? `.local/${target.slug ?? "busy-frame"}-busy-frame-capture.json`);
    const framesDir = resolve(options.framesDir ?? deriveFramesDir(outPath, target.slug));
    const picked = pickFrames(tagged, options.maxFrames);
    const savedFrames = await saveTaggedFrames(page, picked, framesDir);
    return buildArtifact(target, options, samples, tagged, savedFrames);
  } finally {
    await context.close();
    await browser.close();
  }
}

function printSummary(artifact: BusyFrameCaptureArtifact): void {
  console.log(`target: ${artifact.target.slug ?? artifact.target.url}`);
  console.log(`saved frames: ${artifact.summary.savedFrames}`);
  console.log(`tagged samples: ${artifact.summary.totalTaggedSamples}`);
  console.log(
    `tags: ${Object.entries(artifact.summary.tagCounts)
      .map(([tag, count]) => `${tag}=${count}`)
      .join(", ")}`,
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const artifact = await runCapture(options);
  const outPath = resolve(options.out ?? `.local/${artifact.target.slug ?? "busy-frame"}-busy-frame-capture.json`);
  ensureParentDirectory(outPath);
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  printSummary(artifact);
  console.log(`output: ${outPath}`);
}

const isMain = (process.argv[1] ?? "").includes("busy_frame_capture.ts");

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
