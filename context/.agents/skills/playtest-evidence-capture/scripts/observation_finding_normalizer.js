import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
function parseArgs(argv) {
    const options = { artifactPaths: [] };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--artifact") {
            const next = argv[index + 1];
            if (!next) {
                throw new Error("Missing value for --artifact");
            }
            options.artifactPaths.push(next);
            index += 1;
            continue;
        }
        if (arg === "--observations") {
            const next = argv[index + 1];
            if (!next) {
                throw new Error("Missing value for --observations");
            }
            options.observations = next;
            index += 1;
            continue;
        }
        if (arg === "--starter-dir") {
            const next = argv[index + 1];
            if (!next) {
                throw new Error("Missing value for --starter-dir");
            }
            options.starterDir = next;
            index += 1;
            continue;
        }
        if (arg === "--out") {
            const next = argv[index + 1];
            if (!next) {
                throw new Error("Missing value for --out");
            }
            options.out = next;
            index += 1;
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
    if (!options.observations && options.artifactPaths.length === 0) {
        throw new Error("Pass --observations <file> or at least one --artifact <file>.");
    }
    return options;
}
function severityRank(severity) {
    if (severity === "blocker") {
        return 0;
    }
    if (severity === "major") {
        return 1;
    }
    return 2;
}
function normalizeText(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
function ensureParentDirectory(filePath) {
    mkdirSync(dirname(filePath), { recursive: true });
}
function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isObservationArtifact(value) {
    return (isObject(value) &&
        ("evidence" in value ||
            "firstContact" in value ||
            "resumeProbes" in value ||
            "incidents" in value ||
            "probeOutcomes" in value));
}
function isStarterArtifact(value) {
    return isObject(value) && ("claimGuardrail" in value || "evidenceSufficiency" in value);
}
function detectArtifactKind(value) {
    if (isStarterArtifact(value)) {
        return "starter";
    }
    if (isObservationArtifact(value)) {
        return "observation";
    }
    return "unknown";
}
function deriveObservationClaimCeiling(observation) {
    const focus = observation.sessionFocus?.length ? observation.sessionFocus.join(", ") : "logged contexts";
    const mode = observation.evidence?.mode ?? "unknown";
    const gaps = [];
    if (!observation.failures?.length) {
        gaps.push("no fail-retry sample");
    }
    if (!observation.resumeProbes?.length) {
        gaps.push("no interruption-resume sample");
    }
    if (!observation.stressFrames?.length) {
        gaps.push("no busy-frame sample");
    }
    if (gaps.length === 0) {
        return `Session-scoped ${mode} evidence across ${focus}; do not generalize beyond logged contexts.`;
    }
    return `Session-scoped ${mode} evidence across ${focus}; keep claims narrow because ${gaps.join(", ")}.`;
}
function readArtifactsFromPaths(paths) {
    return paths.map((artifactPath) => {
        const absolutePath = resolve(artifactPath);
        const raw = readFileSync(absolutePath, "utf8");
        return {
            path: artifactPath,
            payload: JSON.parse(raw),
            updatedAtMs: statSync(absolutePath).mtimeMs,
        };
    });
}
function inferGameFromObservationPath(observationPath) {
    return basename(observationPath, extname(observationPath)).replace(/-playtest$/, "");
}
function collectStarterArtifacts(starterDir) {
    const absoluteDir = resolve(starterDir);
    return readdirSync(absoluteDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
        .map((entry) => resolve(absoluteDir, entry.name));
}
function resolveArtifactPaths(options) {
    const artifactPaths = [...options.artifactPaths];
    if (options.observations) {
        artifactPaths.push(options.observations);
        const inferredGame = inferGameFromObservationPath(options.observations);
        const starterDir = options.starterDir ?? `./.local/playtest-starters/${inferredGame}`;
        try {
            artifactPaths.push(...collectStarterArtifacts(starterDir));
        }
        catch {
            // Missing starter dir is valid; the normalizer still works from raw observation evidence only.
        }
    }
    else if (options.starterDir) {
        try {
            artifactPaths.push(...collectStarterArtifacts(options.starterDir));
        }
        catch {
            // Missing starter dir is valid when explicit artifact paths were supplied.
        }
    }
    return [...new Set(artifactPaths.map((path) => path.replaceAll("\\", "/")))];
}
function buildSourceArtifact(input, index) {
    const kind = detectArtifactKind(input.payload);
    const updatedAt = typeof input.updatedAtMs === "number" ? new Date(input.updatedAtMs).toISOString() : undefined;
    if (kind === "starter") {
        const payload = input.payload;
        return {
            id: `artifact-${index + 1}`,
            path: input.path,
            kind,
            game: payload.game ?? "unknown-game",
            sessionDate: payload.sessionDate,
            updatedAt,
            claimCeiling: payload.evidenceSufficiency?.claimCeiling ?? "Claim ceiling missing from starter artifact.",
            coverageStatus: payload.claimGuardrail?.coverageGate?.status,
            coverageReasons: payload.claimGuardrail?.coverageGate?.reasons ?? [],
        };
    }
    if (kind === "observation") {
        const payload = input.payload;
        return {
            id: `artifact-${index + 1}`,
            path: input.path,
            kind,
            game: payload.game ?? "unknown-game",
            sessionDate: payload.sessionDate,
            updatedAt,
            claimCeiling: deriveObservationClaimCeiling(payload),
            coverageReasons: [],
        };
    }
    return {
        id: `artifact-${index + 1}`,
        path: input.path,
        kind,
        game: "unknown-game",
        updatedAt,
        claimCeiling: "Unsupported artifact shape; no claim ceiling available.",
        coverageReasons: [],
    };
}
function pushSignal(bucket, signal, artifactId) {
    bucket.push({
        artifactId,
        ...signal,
    });
}
function extractObservationSignals(observation, artifactId) {
    const signals = [];
    (observation.incidents ?? []).forEach((incident, index) => {
        const tagBase = incident.incidentTag ?? incident.title ?? "untagged-incident";
        const severity = incident.impact === "high" ? "blocker" : incident.impact === "medium" ? "major" : "minor";
        pushSignal(signals, {
            key: `incident:${normalizeText(tagBase)}`,
            severity,
            finding: incident.title ?? "Repeated incident needs follow-up",
            action: incident.nextCheck ??
                "Turn the repeated incident into one concrete reproduction step or local fix candidate.",
            citation: `incidents[${index}]`,
            note: [
                incident.notes ?? "incident logged",
                typeof incident.repeatedCount === "number" ? `repeats=${incident.repeatedCount}` : undefined,
                incident.playerCost?.length ? `playerCost=${incident.playerCost.join(", ")}` : undefined,
            ]
                .filter(Boolean)
                .join(" | "),
            supportWeight: Math.max(incident.repeatedCount ?? 1, 1),
        }, artifactId);
    });
    (observation.competitionMoments ?? []).forEach((moment, index) => {
        if (moment.dominantReadClear === false ||
            moment.responsePriorityClear === false ||
            moment.nonCriticalUiCompeting === true) {
            pushSignal(signals, {
                key: "theme:urgent-read-competition",
                severity: (moment.urgentSignalCount ?? 0) >= 2 ? "major" : "minor",
                finding: "Non-critical or overlapping signals compete with the dominant urgent read.",
                action: "Collapse, move, or suppress non-critical overlays during pressure so one urgent response stays obvious near the action.",
                citation: `competitionMoments[${index}]`,
                note: moment.notes ?? moment.moment ?? "priority confusion logged",
                supportWeight: 1,
            }, artifactId);
        }
    });
    (observation.failures ?? []).forEach((failure, index) => {
        if (failure.causeReadable === false || failure.correctiveActionClear === false || failure.sourceVisibleOnFail === false) {
            pushSignal(signals, {
                key: "theme:failure-readability",
                severity: "major",
                finding: "The sampled failure does not teach the next attempt clearly enough.",
                action: "Keep the damaging source and corrective read visible through failure so retry teaches the same correction immediately.",
                citation: `failures[${index}]`,
                note: failure.notes ?? failure.cause ?? "failure readability gap logged",
                supportWeight: 1,
            }, artifactId);
        }
    });
    (observation.resumeProbes ?? []).forEach((probe, index) => {
        if (probe.controlsRecoverable === false || probe.nextActionClear === false) {
            pushSignal(signals, {
                key: "theme:control-reminder-recovery",
                severity: "major",
                finding: "Return-to-play relies on memory for controls or next verb recall.",
                action: "Keep a lightweight in-run control refresher or reopenable reminder available during live play and after interruption.",
                citation: `resumeProbes[${index}]`,
                note: probe.notes ?? probe.breakType ?? "resume probe lost control recall",
                supportWeight: 1,
            }, artifactId);
        }
        if (probe.currentGoalRecoverable === false) {
            pushSignal(signals, {
                key: "theme:goal-recovery",
                severity: "major",
                finding: "After interruption, the current goal is not recoverable from visible game state alone.",
                action: "Keep the live objective or next-step reminder visible or easy to reopen after pause, tab-switch, or death.",
                citation: `resumeProbes[${index}]`,
                note: probe.notes ?? probe.breakType ?? "resume probe lost objective recall",
                supportWeight: 1,
            }, artifactId);
        }
    });
    if (observation.firstContact?.controlsReminderAvailable === false) {
        pushSignal(signals, {
            key: "theme:control-reminder-recovery",
            severity: "major",
            finding: "Return-to-play relies on memory for controls or next verb recall.",
            action: "Keep a lightweight in-run control refresher or reopenable reminder available during live play and after interruption.",
            citation: "firstContact.controlsReminderAvailable",
            note: "first-contact sample logged no live control reminder",
            supportWeight: 1,
        }, artifactId);
    }
    (observation.frictions ?? []).forEach((friction, index) => {
        if (/control reminder|controls reminder|verb recall|control refresh/i.test(friction)) {
            pushSignal(signals, {
                key: "theme:control-reminder-recovery",
                severity: "major",
                finding: "Return-to-play relies on memory for controls or next verb recall.",
                action: "Keep a lightweight in-run control refresher or reopenable reminder available during live play and after interruption.",
                citation: `frictions[${index}]`,
                note: friction,
                supportWeight: 1,
            }, artifactId);
        }
    });
    (observation.cues ?? []).forEach((cue, index) => {
        if (cue.importance === "critical" &&
            (cue.reliesOnColorAlone === true || cue.reliesOnAudioAlone === true)) {
            pushSignal(signals, {
                key: "theme:single-channel-critical-cue",
                severity: "major",
                finding: "A critical cue depends on one fragile channel.",
                action: "Add a second readable channel for the critical cue so mute play, color ambiguity, or noisy frames do not erase the read.",
                citation: `cues[${index}]`,
                note: cue.notes ?? cue.name ?? "critical cue lacks fallback channel",
                supportWeight: 1,
            }, artifactId);
        }
    });
    (observation.stressFrames ?? []).forEach((frame, index) => {
        if (frame.criticalInfoLost === true || frame.cueMasked === true || frame.responseStillReadable === false) {
            pushSignal(signals, {
                key: "theme:busy-frame-read-loss",
                severity: "blocker",
                finding: "Busy-frame pressure hides a critical read or collapses the response chain.",
                action: "Reduce clutter, move the must-react cue closer to focal action, or add stronger separation so pressure beats keep one readable answer.",
                citation: `stressFrames[${index}]`,
                note: frame.notes ?? frame.moment ?? "busy frame lost critical read",
                supportWeight: 1,
            }, artifactId);
        }
    });
    (observation.probeOutcomes ?? []).forEach((probe, index) => {
        const highLoad = (typeof probe.mentalDemand === "number" && probe.mentalDemand >= 6) ||
            (typeof probe.timePressure === "number" && probe.timePressure >= 6) ||
            (typeof probe.effort === "number" && probe.effort >= 6);
        if (highLoad && probe.outcome !== "failed") {
            pushSignal(signals, {
                key: "theme:high-load-success",
                severity: "minor",
                finding: "The sampled probe technically works, but only under high workload.",
                action: "Trim the first stack of simultaneous demands or raise readability support before treating the beat as comfortably solved.",
                citation: `probeOutcomes[${index}]`,
                note: probe.notes ?? probe.probe ?? "high-load success logged",
                supportWeight: 1,
            }, artifactId);
        }
    });
    return signals;
}
function mergeClaimCeilings(artifacts) {
    const ceilings = [...new Set(artifacts.map((artifact) => artifact.claimCeiling).filter(Boolean))];
    if (ceilings.length === 0) {
        return "No claim ceiling metadata available.";
    }
    if (ceilings.length === 1) {
        return ceilings[0];
    }
    return `Mixed source ceilings: ${ceilings.join(" | ")}`;
}
export function normalizeObservationArtifacts(inputs) {
    const sourceArtifacts = inputs.map((input, index) => buildSourceArtifact(input, index));
    const signals = inputs.flatMap((input, index) => {
        if (detectArtifactKind(input.payload) !== "observation" || !isObservationArtifact(input.payload)) {
            return [];
        }
        return extractObservationSignals(input.payload, sourceArtifacts[index].id);
    });
    const grouped = new Map();
    for (const signal of signals) {
        const existing = grouped.get(signal.key) ?? [];
        existing.push(signal);
        grouped.set(signal.key, existing);
    }
    const fallbackGame = sourceArtifacts.find((artifact) => artifact.game !== "unknown-game")?.game ?? "unknown-game";
    const findings = [...grouped.entries()]
        .map(([key, group]) => {
        const artifactIds = [...new Set(group.map((signal) => signal.artifactId))];
        const signalArtifacts = artifactIds
            .map((artifactId) => sourceArtifacts.find((artifact) => artifact.id === artifactId))
            .filter((artifact) => Boolean(artifact));
        const metadataArtifacts = sourceArtifacts.filter((artifact) => artifact.kind === "starter" &&
            artifact.game === (signalArtifacts[0]?.game ?? fallbackGame));
        const artifacts = [...new Map([...signalArtifacts, ...metadataArtifacts].map((artifact) => [artifact.id, artifact])).values()];
        const firstSignal = group[0];
        const oldest = artifacts
            .map((artifact) => artifact.updatedAt)
            .filter((value) => Boolean(value))
            .sort()[0];
        const latest = artifacts
            .map((artifact) => artifact.updatedAt)
            .filter((value) => Boolean(value))
            .sort()
            .at(-1);
        return {
            key,
            severity: [...group]
                .sort((left, right) => severityRank(left.severity) - severityRank(right.severity))[0].severity,
            finding: firstSignal.finding,
            action: firstSignal.action,
            evidenceStrength: {
                observationCount: group.length,
                distinctArtifacts: artifactIds.length,
                weightedSupport: group.reduce((sum, signal) => sum + signal.supportWeight, 0),
            },
            freshness: {
                oldestArtifactAt: oldest,
                latestArtifactAt: latest,
                sessionDates: [...new Set(artifacts.map((artifact) => artifact.sessionDate).filter(Boolean))],
            },
            claimCeiling: mergeClaimCeilings(artifacts),
            citations: group.map((signal) => ({
                artifactId: signal.artifactId,
                location: signal.citation,
                note: signal.note,
            })),
            sourceArtifactIds: artifacts.map((artifact) => artifact.id),
        };
    })
        .sort((left, right) => {
        const severityDiff = severityRank(left.severity) - severityRank(right.severity);
        if (severityDiff !== 0) {
            return severityDiff;
        }
        return right.evidenceStrength.weightedSupport - left.evidenceStrength.weightedSupport;
    });
    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        game: fallbackGame,
        sourceArtifacts,
        findings,
    };
}
export function writeNormalizedFindingFile(options) {
    const output = normalizeObservationArtifacts(readArtifactsFromPaths(options.artifactPaths));
    const resolvedOut = resolve(options.outPath);
    ensureParentDirectory(resolvedOut);
    writeFileSync(resolvedOut, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    return output;
}
function main() {
    const options = parseArgs(process.argv.slice(2));
    const output = normalizeObservationArtifacts(readArtifactsFromPaths(resolveArtifactPaths(options)));
    if (options.out) {
        const resolvedOut = resolve(options.out);
        ensureParentDirectory(resolvedOut);
        writeFileSync(resolvedOut, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    }
    console.log(JSON.stringify(output, null, 2));
}
if (require.main === module) {
    main();
}
