import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildDurableLearning } from "./durable_learning";
import { saveLearning } from "./learning_capture";
import { buildTemplate } from "./observation_template";
import { writeNormalizedFindingFile } from "./observation_finding_normalizer";
function parseArgs(argv) {
    const options = { template: false };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--template") {
            options.template = true;
            continue;
        }
        const next = argv[index + 1];
        if ((arg === "--observations" ||
            arg === "--out" ||
            arg === "--starter-dir" ||
            arg === "--busy-frame-capture" ||
            arg === "--normalized-out") &&
            !next) {
            throw new Error(`Missing value for ${arg}`);
        }
        if (arg === "--observations") {
            options.observations = next;
            index += 1;
            continue;
        }
        if (arg === "--out") {
            options.out = next;
            index += 1;
            continue;
        }
        if (arg === "--starter-dir") {
            options.starterDir = next;
            index += 1;
            continue;
        }
        if (arg === "--busy-frame-capture") {
            options.busyFrameCapture = next;
            index += 1;
            continue;
        }
        if (arg === "--normalized-out") {
            options.normalizedOut = next;
            index += 1;
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}
function readObservations(filePath) {
    const raw = readFileSync(resolve(filePath), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
        throw new Error("Observation file must contain a JSON object.");
    }
    return parsed;
}
function readBusyFrameCapture(filePath) {
    const raw = readFileSync(resolve(filePath), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
        throw new Error("Busy-frame capture file must contain a JSON object.");
    }
    return parsed;
}
function appendUniqueStrings(left = [], right = []) {
    return [...new Set([...left, ...right])];
}
function mergeObservationPatch(base, patch) {
    return {
        ...base,
        ...patch,
        sessionFocus: appendUniqueStrings(base.sessionFocus, patch.sessionFocus),
        evidence: {
            ...(base.evidence ?? {}),
            ...(patch.evidence ?? {}),
            notes: appendUniqueStrings(base.evidence?.notes, patch.evidence?.notes),
            sampledBusyFrames: Math.max(base.evidence?.sampledBusyFrames ?? 0, patch.evidence?.sampledBusyFrames ?? 0),
        },
        stressFrames: [...(base.stressFrames ?? []), ...(patch.stressFrames ?? [])],
        ephemeralMoments: [...(base.ephemeralMoments ?? []), ...(patch.ephemeralMoments ?? [])],
        incidents: [...(base.incidents ?? []), ...(patch.incidents ?? [])],
        probeOutcomes: [...(base.probeOutcomes ?? []), ...(patch.probeOutcomes ?? [])],
        channelSupport: {
            ...(base.channelSupport ?? {}),
            ...(patch.channelSupport ?? {}),
        },
        mastery: {
            ...(base.mastery ?? {}),
            ...(patch.mastery ?? {}),
            choicePoints: [...(base.mastery?.choicePoints ?? []), ...(patch.mastery?.choicePoints ?? [])],
        },
    };
}
function boolLabel(value) {
    if (value === true) {
        return "yes";
    }
    if (value === false) {
        return "no";
    }
    return "unknown";
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
function countWhere(items, predicate) {
    return items.filter(predicate).length;
}
function formatRating(value, max, suffix = "") {
    return typeof value === "number" ? `${value}/${max}${suffix}` : "unknown";
}
function isHighProbeLoad(probe) {
    return ((typeof probe.mentalDemand === "number" && probe.mentalDemand >= 6) ||
        (typeof probe.timePressure === "number" && probe.timePressure >= 6) ||
        (typeof probe.effort === "number" && probe.effort >= 6));
}
function averageProbeRating(probes, pick) {
    const values = probes
        .map((probe) => pick(probe))
        .filter((value) => typeof value === "number");
    if (values.length === 0) {
        return undefined;
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    return Math.round((total / values.length) * 10) / 10;
}
function impactRank(impact) {
    if (impact === "high") {
        return 0;
    }
    if (impact === "medium") {
        return 1;
    }
    return 2;
}
function persistenceRank(persistence) {
    if (persistence === "constant") {
        return 0;
    }
    if (persistence === "repeatable") {
        return 1;
    }
    return 2;
}
function coverageRank(status) {
    if (status === "ready") {
        return 0;
    }
    if (status === "partial") {
        return 1;
    }
    return 2;
}
function hasCount(value, minimum = 1) {
    return typeof value === "number" && value >= minimum;
}
function summarizeCoverage(label, checks) {
    const missingReasons = checks.filter((check) => !check.met).map((check) => check.reason);
    const metCount = checks.length - missingReasons.length;
    let status = "ready";
    if (metCount === 0) {
        status = "missing";
    }
    else if (missingReasons.length > 0) {
        status = "partial";
    }
    return {
        label,
        status,
        reasons: missingReasons,
    };
}
function buildIncidentQueue(data) {
    return [...(data.incidents ?? [])].sort((left, right) => {
        const repeatDelta = (right.repeatedCount ?? 0) - (left.repeatedCount ?? 0);
        if (repeatDelta !== 0) {
            return repeatDelta;
        }
        const impactDelta = impactRank(left.impact) - impactRank(right.impact);
        if (impactDelta !== 0) {
            return impactDelta;
        }
        const persistenceDelta = persistenceRank(left.persistence) - persistenceRank(right.persistence);
        if (persistenceDelta !== 0) {
            return persistenceDelta;
        }
        return (left.incidentTag ?? left.title ?? "").localeCompare(right.incidentTag ?? right.title ?? "");
    });
}
function buildFindings(data) {
    const firstContact = data.firstContact ?? {};
    const cues = data.cues ?? [];
    const stressFrames = data.stressFrames ?? [];
    const failures = data.failures ?? [];
    const contacts = data.contacts ?? [];
    const beats = data.beats ?? [];
    const competitionMoments = data.competitionMoments ?? [];
    const ephemeralMoments = data.ephemeralMoments ?? [];
    const resumeProbes = data.resumeProbes ?? [];
    const probeOutcomes = data.probeOutcomes ?? [];
    const confounders = data.confounders ?? {};
    const channelSupport = data.channelSupport ?? {};
    const findings = [];
    if (firstContact.blocksFirstMeaningfulInput === true &&
        firstContact.discoverableThroughExperiment === true) {
        findings.push({
            severity: "blocker",
            title: "front-loaded teaching blocks simple loop before meaningful play",
            evidence: "first-contact notes show forced teaching before play in a loop marked discoverable through experiment.",
        });
    }
    if (countWhere(stressFrames, (frame) => frame.criticalInfoLost === true || frame.cueMasked === true) > 0) {
        findings.push({
            severity: "blocker",
            title: "busy frame hides critical read",
            evidence: "at least one stress frame logged critical info loss or cue masking during active pressure.",
        });
    }
    if (channelSupport.criticalInfoUsesColorOnly === true ||
        channelSupport.criticalInfoUsesAudioOnly === true ||
        countWhere(cues, (cue) => cue.importance === "critical" &&
            (cue.reliesOnColorAlone === true || cue.reliesOnAudioAlone === true)) > 0) {
        findings.push({
            severity: "major",
            title: "critical cue depends on one fragile channel",
            evidence: "shared capture logged gameplay-critical information that depended on color alone or audio alone instead of a second readable fallback.",
        });
    }
    if (countWhere(failures, (failure) => failure.causeReadable === false) > 0) {
        findings.push({
            severity: "major",
            title: "failure state weakens next-attempt learning",
            evidence: "at least one logged failure left cause unreadable.",
        });
    }
    if (countWhere(failures, (failure) => failure.repeatedPenaltyFromSingleMistake === true || failure.controlRecoveredBeforeNextHit === false) > 0) {
        findings.push({
            severity: "major",
            title: "failure sample shows chain punishment before control fully returns",
            evidence: "at least one logged failure chained into repeated punishment or kept the player helpless before the next hit.",
        });
    }
    if (data.learningLoop?.sameLessonStableAcrossRetries === false ||
        countWhere(failures, (failure) => failure.retryContextStable === false) > 0) {
        findings.push({
            severity: "major",
            title: "retry sample does not preserve a stable lesson",
            evidence: "at least one logged retry changed pressure, setup, or context enough that the intended correction could not be tested cleanly.",
        });
    }
    if (countWhere(beats, (beat) => beat.novelty === "new-combo" && beat.practicedBefore === false) > 0) {
        findings.push({
            severity: "major",
            title: "new combination lands before ingredients settle",
            evidence: "beat log includes at least one new-combo moment without prior practice.",
        });
    }
    if (countWhere(beats, (beat) => beat.stackReadable === false ||
        (typeof beat.newDemands === "number" && beat.newDemands > 1)) > 0) {
        findings.push({
            severity: "major",
            title: "mechanic stack spikes before response chain stays readable",
            evidence: "beat log includes at least one moment where stack readability failed or several fresh demands landed in the same beat.",
        });
    }
    if (countWhere(competitionMoments, (moment) => moment.dominantReadClear === false || moment.responsePriorityClear === false) > 0) {
        findings.push({
            severity: "major",
            title: "overlapping urgent signals lose dominant read",
            evidence: "competition log includes at least one overlap where the player could not tell which warning or response mattered first.",
        });
    }
    if (countWhere(ephemeralMoments, (moment) => moment.importance !== "secondary" &&
        moment.autoDismisses === true &&
        moment.playerControlledAdvance === false &&
        moment.reviewableLater === false) > 0) {
        findings.push({
            severity: "major",
            title: "critical temporary information can vanish before the player can recover it",
            evidence: "at least one logged temporary prompt, warning, or status read auto-dismissed without player pacing and could not be reviewed later.",
        });
    }
    if (countWhere(ephemeralMoments, (moment) => moment.kind === "notification" &&
        moment.obstructsCriticalRead === true &&
        moment.suppressibleWhenNonCritical === false) > 0) {
        findings.push({
            severity: "major",
            title: "non-critical temporary popups compete with play and cannot be suppressed",
            evidence: "at least one logged notification obstructed a critical read while lacking a way to postpone, hide, or suppress it.",
        });
    }
    if (countWhere(contacts, (contact) => contact.forceReadable === false || contact.scenePreserved === false) > 0) {
        findings.push({
            severity: "major",
            title: "impact payoff costs scene truth",
            evidence: "at least one contact logged weak force hierarchy or lost scene readability.",
        });
    }
    if (countWhere(resumeProbes, (probe) => probe.currentGoalRecoverable === false ||
        probe.controlsRecoverable === false ||
        probe.nextActionClear === false) > 0) {
        findings.push({
            severity: "major",
            title: "resume after interruption loses actionable context",
            evidence: "at least one logged interruption probe could not recover the current goal, controls, or next action cleanly.",
        });
    }
    if (countWhere(probeOutcomes, (probe) => (probe.probe === "first-contact" ||
        probe.probe === "busy-frame" ||
        probe.probe === "fail-retry" ||
        probe.probe === "interruption-resume") &&
        (probe.outcome === "failed" || (typeof probe.successRating === "number" && probe.successRating <= 1))) > 0) {
        findings.push({
            severity: "major",
            title: "probe deck captured at least one failed core task beat",
            evidence: "structured probe outcome marked a first-contact, busy-frame, fail-retry, or interruption-resume task as failed or near-zero success.",
        });
    }
    if (countWhere(probeOutcomes, (probe) => (probe.outcome === "success" || probe.outcome === "partial") &&
        isHighProbeLoad(probe) &&
        (typeof probe.successRating !== "number" || probe.successRating >= 2)) > 0) {
        findings.push({
            severity: "major",
            title: "core probe only held together under high workload",
            evidence: "at least one probe reached partial or nominal success while mental demand, time pressure, or effort still scored at overload range.",
        });
    }
    if (confounders.viewObstructedAtDecision === true ||
        confounders.autoCameraInterference === true ||
        confounders.inputCertainty === "major-slip" ||
        confounders.responseLatency === "late") {
        findings.push({
            severity: "major",
            title: "cross-audit confounder present in control or view support",
            evidence: "shared capture logged camera/view obstruction, auto-camera interference, unstable input certainty, or late response during a decision moment.",
        });
    }
    if (findings.length === 0) {
        findings.push({
            severity: "minor",
            title: "shared capture complete with no obvious cross-audit blocker",
            evidence: "logged session covers multiple lenses without a clear blocker pattern in raw evidence.",
        });
    }
    return findings.sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}
function buildEvidenceSufficiency(data) {
    const evidence = data.evidence ?? {};
    const scope = [];
    const gaps = [];
    const directPlay = evidence.mode === "direct-play";
    const mixed = evidence.mode === "mixed";
    if (data.firstContact !== undefined) {
        scope.push("first-contact");
    }
    else {
        gaps.push("first-contact");
    }
    if ((data.stressFrames?.length ?? 0) > 0) {
        scope.push("busy-frame");
    }
    else {
        gaps.push("busy-frame");
    }
    if ((data.failures?.length ?? 0) > 0) {
        scope.push("fail-retry");
    }
    else {
        gaps.push("fail-retry");
    }
    if ((data.contacts?.length ?? 0) > 0) {
        scope.push("contact");
    }
    else {
        gaps.push("contact");
    }
    if ((data.beats?.length ?? 0) > 0) {
        scope.push("beat-timeline");
    }
    else {
        gaps.push("beat-timeline");
    }
    if ((data.resumeProbes?.length ?? 0) > 0) {
        scope.push("resume-probe");
    }
    else {
        gaps.push("resume-probe");
    }
    let directness = "weak";
    if (directPlay) {
        directness = "strong";
    }
    else if (mixed || evidence.mode === "captured-video") {
        directness = "mixed";
    }
    const claimCeiling = directness === "strong" && gaps.length === 0
        ? "session supports focused audit claims for covered lenses, but still only for observed contexts and sample size."
        : directness === "strong"
            ? "session supports narrow claims only for logged moments; missing contexts stay unproven."
            : "session is not strong enough for broad feel verdicts; treat outputs as provisional until direct-play coverage improves.";
    return {
        directness,
        scope,
        gaps,
        claimCeiling,
    };
}
function buildCoverageChecks(data) {
    const evidence = data.evidence ?? {};
    const firstContact = data.firstContact ?? {};
    const cues = data.cues ?? [];
    const failures = data.failures ?? [];
    const beats = data.beats ?? [];
    const contacts = data.contacts ?? [];
    const stressFrames = data.stressFrames ?? [];
    const competitionMoments = data.competitionMoments ?? [];
    const ephemeralMoments = data.ephemeralMoments ?? [];
    const resumeProbes = data.resumeProbes ?? [];
    const confounders = data.confounders ?? {};
    const channelSupport = data.channelSupport ?? {};
    const forgiveness = data.forgiveness ?? {};
    const forgivenessMoments = forgiveness.moments ?? [];
    const inputDemand = data.inputDemand ?? {};
    const inputDemandSamples = inputDemand.samples ?? [];
    const settingsAndAssists = data.settingsAndAssists ?? {};
    const settingsReachability = settingsAndAssists.reachability ?? {};
    const settingsChangeSafety = settingsAndAssists.changeSafety ?? {};
    const settingsReminderPractice = settingsAndAssists.reminderPractice ?? {};
    const settingsPersistence = settingsAndAssists.persistence ?? {};
    return [
        summarizeCoverage("activation loop audit", [
            {
                met: data.firstContact !== undefined || data.earlyLoop !== undefined,
                reason: "log first-contact or early-loop timing before judging first-input trust or hidden second-start gates.",
            },
            {
                met: hasCount(evidence.sampledRuns) ||
                    firstContact.blocksFirstMeaningfulInput !== undefined ||
                    typeof data.earlyLoop?.secondsToFirstMeaningfulInput === "number",
                reason: "capture at least one direct first-run or first-action timing sample.",
            },
            {
                met: resumeProbes.length > 0 ||
                    firstContact.controlsReminderAvailable !== undefined ||
                    firstContact.objectiveReminderAvailable !== undefined,
                reason: "log reminder recovery or an interruption-resume probe before claiming players can recover controls and current goal mid-run.",
            },
            {
                met: hasCount(evidence.sampledRetries) ||
                    typeof data.retrySeconds === "number" ||
                    failures.length > 0 ||
                    data.recoverySupport !== undefined,
                reason: "capture retry or recovery-path evidence before judging death-to-control-ready re-entry.",
            },
            {
                met: firstContact.promptsBeforeMeaningfulPlay === undefined ||
                    firstContact.promptsBeforeMeaningfulPlay <= 0 ||
                    ephemeralMoments.some((moment) => moment.kind === "tutorial" || moment.kind === "objective" || moment.kind === "warning"),
                reason: "if temporary prompts appeared on the start path, log whether they auto-dismissed, could be advanced by the player, or could be reviewed later.",
            },
        ]),
        summarizeCoverage("onboarding critique", [
            {
                met: data.firstContact !== undefined,
                reason: "log first-contact observations so onboarding does not become code inference.",
            },
            {
                met: hasCount(evidence.sampledRuns) ||
                    firstContact.firstObjectiveClear !== undefined ||
                    firstContact.currentGoalEasyToRestate !== undefined,
                reason: "capture at least one first-run or objective-read moment.",
            },
            {
                met: resumeProbes.length > 0 || hasCount(evidence.sampledResumeProbes),
                reason: "capture at least one interruption-resume probe before claiming reminders survive a short break or tab switch.",
            },
            {
                met: firstContact.promptsBeforeMeaningfulPlay === undefined ||
                    firstContact.promptsBeforeMeaningfulPlay <= 0 ||
                    ephemeralMoments.some((moment) => moment.kind === "tutorial" || moment.kind === "objective"),
                reason: "if temporary onboarding prompts appeared, log whether they auto-dismissed, could be advanced by the player, or could be reviewed later.",
            },
        ]),
        summarizeCoverage("HUD readability audit", [
            {
                met: stressFrames.length > 0,
                reason: "capture at least one busy frame under pressure; calm screenshots are not enough.",
            },
            {
                met: (data.criticalElements?.length ?? 0) > 0 || (data.cues?.length ?? 0) > 0,
                reason: "log at least one critical HUD element or must-react cue.",
            },
            {
                met: hasCount(evidence.sampledBusyFrames),
                reason: "record explicit busy-frame sample count for active-play readability claims.",
            },
            {
                met: competitionMoments.length > 0,
                reason: "log at least one overlapping-signal moment before claiming urgent cue priority stays readable under stack pressure.",
            },
            {
                met: cues.length === 0 ||
                    cues.some((cue) => cue.signalChannels !== undefined ||
                        cue.reliesOnColorAlone !== undefined ||
                        cue.reliesOnAudioAlone !== undefined) ||
                    channelSupport.criticalInfoMultiChannel !== undefined ||
                    channelSupport.criticalInfoUsesColorOnly !== undefined ||
                    channelSupport.criticalInfoUsesAudioOnly !== undefined ||
                    channelSupport.muteCriticalInfoStillPlayable !== undefined ||
                    channelSupport.criticalInfoHasNonColorBackup !== undefined,
                reason: "log whether critical cues had fallback channels or depended on color alone or audio alone before claiming warnings stay readable across real play conditions.",
            },
            {
                met: ephemeralMoments.length === 0 ||
                    ephemeralMoments.some((moment) => moment.kind === "warning" ||
                        moment.kind === "notification" ||
                        moment.kind === "status"),
                reason: "if temporary warnings or popups appeared, log whether they auto-dismissed, stayed reviewable, or could be suppressed when non-critical.",
            },
        ]),
        summarizeCoverage("telegraph readability audit", [
            {
                met: cues.length > 0,
                reason: "log at least one cue before making telegraph readability claims.",
            },
            {
                met: cues.some((cue) => cue.telegraphReadable !== undefined ||
                    cue.requiredResponseObvious !== undefined ||
                    cue.futurePathVisible !== undefined),
                reason: "capture whether the cue made the needed response or future path visible before judging the telegraph itself.",
            },
            {
                met: cues.some((cue) => cue.signalChannels !== undefined ||
                    cue.reliesOnColorAlone !== undefined ||
                    cue.reliesOnAudioAlone !== undefined) || channelSupport.criticalInfoMultiChannel !== undefined,
                reason: "log which channels carried the read so telegraph claims do not quietly depend on missing fallback support.",
            },
            {
                met: stressFrames.length > 0 || competitionMoments.length > 0,
                reason: "capture at least one busy or competing moment so telegraph claims stay tied to a stressed read, not only a calm cue.",
            },
        ]),
        summarizeCoverage("pacing curve audit", [
            {
                met: beats.length > 0,
                reason: "log a beat timeline before judging pacing or escalation.",
            },
            {
                met: hasCount(evidence.sampledRuns),
                reason: "sample at least one run so pace claims stay tied to real sequence.",
            },
            {
                met: beats.some((beat) => beat.kind === "teach" || beat.kind === "test" || beat.kind === "fail"),
                reason: "mark teach, test, or fail beats so the learning curve is visible.",
            },
            {
                met: beats.some((beat) => typeof beat.activeDemands === "number" ||
                    typeof beat.newDemands === "number" ||
                    beat.stackReadable !== undefined),
                reason: "log active-demand count, fresh-demand count, or stack readability for at least one beat before claiming escalation stays readable.",
            },
            {
                met: hasCount(evidence.sampledRetries),
                reason: "record at least one observed retry so return-to-lesson claims are grounded in real re-entry evidence.",
            },
            {
                met: resumeProbes.length > 0 || data.firstContact?.objectiveReminderAvailable !== undefined,
                reason: "capture one interruption-resume probe or objective-reminder check before claiming the player can recover the current lesson after a break.",
            },
        ]),
        summarizeCoverage("failure loop audit", [
            {
                met: failures.length > 0,
                reason: "capture at least one full fail-and-retry sequence.",
            },
            {
                met: hasCount(evidence.sampledFailures),
                reason: "record failure sample count so harsh-loop claims have scope.",
            },
            {
                met: hasCount(evidence.sampledRetries),
                reason: "record at least one observed retry so failure-loop claims do not infer re-entry from death count alone.",
            },
            {
                met: data.learningLoop !== undefined ||
                    data.recoverySupport !== undefined ||
                    failures.some((failure) => typeof failure.retrySeconds === "number"),
                reason: "log retry path or recovery support instead of guessing re-entry quality.",
            },
            {
                met: data.learningLoop?.sameLessonStableAcrossRetries !== undefined ||
                    failures.some((failure) => failure.retryContextStable !== undefined),
                reason: "log whether retry brings back a stable lesson or shifts setup and pressure too much to teach the intended correction.",
            },
            {
                met: failures.some((failure) => failure.repeatedPenaltyFromSingleMistake !== undefined) ||
                    failures.some((failure) => failure.controlRecoveredBeforeNextHit !== undefined),
                reason: "log whether one mistake chains into repeated punishment before control returns.",
            },
            {
                met: confounders.inputCertainty !== undefined ||
                    confounders.responseLatency !== undefined ||
                    confounders.viewObstructedAtDecision !== undefined,
                reason: "log whether failure lesson was confounded by input certainty or obstructed view before blaming loop design alone.",
            },
        ]),
        summarizeCoverage("choice-readback audit", [
            {
                met: (data.mastery?.choicePoints?.length ?? 0) > 0,
                reason: "log at least one sampled choice point before making choice-readback claims.",
            },
            {
                met: (data.mastery?.choicePoints ?? []).some((choice) => (choice.optionsCount ?? 0) >= 2 ||
                    (choice.offeredOptions?.length ?? 0) >= 2),
                reason: "capture at least two offered options so the audit can judge contrast instead of one picked branch in isolation.",
            },
            {
                met: (data.mastery?.choicePoints ?? []).some((choice) => choice.meaningClear !== undefined ||
                    (choice.offeredOptions ?? []).some((option) => option.expectedPayoff !== undefined ||
                        option.expectedCost !== undefined ||
                        option.currentStateComparison !== undefined ||
                        option.currentBuildComparison !== undefined)),
                reason: "log whether options looked meaningfully different before the pick and how they compared to the current state or build.",
            },
            {
                met: (data.mastery?.choicePoints ?? []).some((choice) => choice.actualPayoff !== undefined ||
                    choice.actualPayoffTiming !== undefined ||
                    choice.afterPickComparison !== undefined ||
                    choice.afterPickBuildComparison !== undefined ||
                    choice.afterPickComparisonClear !== undefined),
                reason: "capture actual payoff timing and after-pick comparison before judging whether the player could see what changed after choosing.",
            },
            {
                met: data.readableProgression?.evaluativeReadbackAvailable !== undefined ||
                    data.readableProgression?.nonComparativeNextStepVisible !== undefined ||
                    (data.failures ?? []).length > 0 ||
                    data.confounders !== undefined,
                reason: "log surrounding goal, failure, or control-view context so weak choice readback is not confused with a broader readability problem.",
            },
        ]),
        summarizeCoverage("mastery motivation audit", [
            {
                met: data.firstContact !== undefined || data.earlyLoop !== undefined,
                reason: "log opening timing or first-contact evidence before judging early mastery pull.",
            },
            {
                met: data.mastery !== undefined ||
                    typeof data.earlyLoop?.secondsToFirstReward === "number" ||
                    data.probeOutcomes?.some((probe) => probe.probe === "first-contact") === true,
                reason: "capture one earned-success or first-reward sample before judging competence support.",
            },
            {
                met: (data.mastery?.choicePoints?.length ?? 0) > 0 ||
                    typeof data.mastery?.choiceCountFirstMinute === "number" ||
                    data.mastery?.choicesFeelMeaningful !== undefined,
                reason: "log at least one early choice point before claiming the loop supports autonomy instead of only obedience.",
            },
            {
                met: data.mastery?.proximalGoalVisible !== undefined ||
                    data.mastery?.progressLegible !== undefined ||
                    data.firstContact?.currentGoalEasyToRestate !== undefined,
                reason: "log short-range goal or progress visibility before claiming the loop supports proximal goals.",
            },
            {
                met: data.mastery?.failureImprovementVisible !== undefined ||
                    data.learningLoop?.sameLessonStableAcrossRetries !== undefined ||
                    (data.failures?.length ?? 0) > 0,
                reason: "capture one fail-retry or improvement-readback sample before judging whether failure preserves competence.",
            },
            {
                met: data.learningLoop?.practiceWithoutFailure !== undefined ||
                    data.recoverySupport?.assistOrSkipAvailable !== undefined ||
                    data.recoverySupport?.difficultyAdjustableAfterFailure !== undefined,
                reason: "log practice or lower-punishment support before judging whether players can rehearse without excessive failure cost.",
            },
        ]),
        summarizeCoverage("readable progression audit", [
            {
                met: data.readableProgression !== undefined ||
                    data.mastery?.proximalGoalVisible !== undefined ||
                    data.mastery?.progressLegible !== undefined,
                reason: "log a short-range goal or progress surface before judging readable progression.",
            },
            {
                met: data.readableProgression?.prerequisiteProgressVisible !== undefined ||
                    data.readableProgression?.evaluativeReadbackAvailable !== undefined ||
                    data.readableProgression?.nonComparativeNextStepVisible !== undefined,
                reason: "capture prerequisite progress, evaluative readback, or the next step before claiming the loop explains advancement.",
            },
            {
                met: data.readableProgression?.progressFeelsReachable !== undefined ||
                    data.readableProgression?.progressRemindersAvailable !== undefined ||
                    data.mastery?.progressRemindersAvailable !== undefined,
                reason: "log whether the next step still feels reachable and recoverable from play.",
            },
            {
                met: data.readableProgression?.notes !== undefined ||
                    data.mastery?.notes !== undefined,
                reason: "capture one note about how the progression read back to the player.",
            },
        ]),
        summarizeCoverage("forgiveness audit", [
            {
                met: data.forgiveness !== undefined || forgivenessMoments.length > 0,
                reason: "log at least one forgiveness observation before judging whether the game preserves player intent.",
            },
            {
                met: forgivenessMoments.length > 0 || failures.length > 0,
                reason: "capture at least one edge-timing save, near-miss correction, or stolen-fail moment before making forgiveness claims.",
            },
            {
                met: forgiveness.coyoteTimePresent !== undefined ||
                    forgiveness.inputBufferPresent !== undefined ||
                    forgiveness.cornerCorrectionPresent !== undefined ||
                    forgiveness.collisionLeniencyFair !== undefined ||
                    forgiveness.graceWindowsConsistent !== undefined,
                reason: "log whether coyote time, input buffering, corner correction, collision leniency, or grace consistency were actually observed.",
            },
            {
                met: forgiveness.droppedIntentCausedFailures !== undefined ||
                    forgiveness.failFeelsStolen !== undefined ||
                    forgiveness.retryClarifiesMissedTiming !== undefined ||
                    failures.some((failure) => failure.retryContextStable !== undefined),
                reason: "record whether harsh fails came from dropped intent and whether retry clarified the correction instead of repeating guesswork.",
            },
            {
                met: forgiveness.practiceWindowAvailable !== undefined ||
                    data.learningLoop?.practiceWithoutFailure !== undefined ||
                    data.recoverySupport?.assistOrSkipAvailable !== undefined ||
                    data.recoverySupport?.difficultyAdjustableAfterFailure !== undefined,
                reason: "log whether severe timing has a practice, assist, or lower-punishment path before judging the loop as acceptably harsh.",
            },
        ]),
        summarizeCoverage("input demand audit", [
            {
                met: data.inputDemand !== undefined || inputDemandSamples.length > 0,
                reason: "log at least one explicit input-demand observation before judging motor-tax burden.",
            },
            {
                met: inputDemandSamples.length > 0 ||
                    inputDemand.rapidRepeatedInputPresent !== undefined ||
                    inputDemand.holdInputPresent !== undefined ||
                    inputDemand.simultaneousInputPresent !== undefined ||
                    inputDemand.rapidSequencePresent !== undefined ||
                    inputDemand.precisionTimingDemandPresent !== undefined ||
                    inputDemand.pathBasedOrAnalogDemandPresent !== undefined,
                reason: "capture at least one demand type or sample so the audit can name the real burden instead of inferring it from vibes.",
            },
            {
                met: inputDemand.progressionCriticalDemandPresent !== undefined ||
                    inputDemandSamples.some((sample) => sample.progressionCritical !== undefined || sample.optionalFlavor !== undefined),
                reason: "distinguish progression-critical demands from optional flourishes before calling the burden blocker-grade.",
            },
            {
                met: inputDemand.remapSafe !== undefined ||
                    inputDemandSamples.some((sample) => sample.remapWouldNotSolve !== undefined),
                reason: "log remap truth separately from timing-speed burden before claiming the issue is solved or unsolved by remapping.",
            },
            {
                met: inputDemand.lowerDemandAlternativeAvailable !== undefined ||
                    inputDemand.difficultyOptionHelps !== undefined ||
                    data.recoverySupport?.assistOrSkipAvailable !== undefined ||
                    data.recoverySupport?.difficultyAdjustableAfterFailure !== undefined ||
                    inputDemandSamples.some((sample) => sample.lowerDemandAlternativeAvailable !== undefined),
                reason: "log whether lower-demand alternatives, assists, or difficulty relief exist before judging the demanded action as acceptably harsh.",
            },
            {
                met: inputDemand.demandReadableBeforeFailure !== undefined ||
                    inputDemand.motorTaxLikelyPrimaryBlocker !== undefined ||
                    failures.some((failure) => failure.correctiveActionClear !== undefined),
                reason: "record whether the burden was readable before failure and whether failure taught the correction instead of hiding a motor-tax wall.",
            },
        ]),
        summarizeCoverage("control-surface audit", [
            {
                met: data.controlSurface !== undefined,
                reason: "log at least one control-surface observation before judging remap and tuning coverage.",
            },
            {
                met: data.controlSurface?.remapScope !== undefined ||
                    data.controlSurface?.remapInputsVisible !== undefined ||
                    data.controlSurface?.remapReflectedInPrompts !== undefined,
                reason: "capture remap scope and whether remaps reflect in prompts before claiming control-surface support.",
            },
            {
                met: data.controlSurface?.holdToggleAlternativeAvailable !== undefined ||
                    data.controlSurface?.sensitivityControlsAvailable !== undefined ||
                    data.controlSurface?.inversionControlsAvailable !== undefined ||
                    data.controlSurface?.axisControlsAvailable !== undefined,
                reason: "record whether hold-toggle, sensitivity, inversion, or axis controls exist before judging tuning breadth.",
            },
            {
                met: data.controlSurface?.gameSpeedReliefAvailable !== undefined ||
                    data.controlSurface?.timingReliefAvailable !== undefined,
                reason: "log whether game-speed or timing relief exists before treating hard timing as purely motor-tax burden.",
            },
            {
                met: data.controlSurface?.settingsAndAssistsBoundaryClear !== undefined ||
                    data.controlSurface?.notes !== undefined,
                reason: "state whether this lane stays separate from settings-and-assists so later audits do not blur the boundary.",
            },
        ]),
        summarizeCoverage("settings-and-assists audit", [
            {
                met: data.settingsAndAssists !== undefined,
                reason: "log at least one settings-and-assists observation before judging recovery-trust surfaces.",
            },
            {
                met: settingsReachability.midRunSettingsReachable !== undefined ||
                    settingsReachability.pauseSettingsReachable !== undefined ||
                    settingsReachability.postFailureSettingsReachable !== undefined ||
                    settingsReachability.postFailureAssistReachable !== undefined,
                reason: "capture live, pause, or post-failure reachability before claiming players can find recovery knobs when they need them.",
            },
            {
                met: settingsChangeSafety.difficultyAdjustableMidRun !== undefined ||
                    settingsChangeSafety.assistsAdjustableMidRun !== undefined ||
                    settingsChangeSafety.changesApplyWithoutRestart !== undefined ||
                    settingsChangeSafety.progressPreservedWhenChanged !== undefined,
                reason: "log whether difficulty or assist changes stay progress-safe before claiming the recovery path is trustworthy.",
            },
            {
                met: settingsReminderPractice.controlsReminderAvailable !== undefined ||
                    settingsReminderPractice.objectiveReminderAvailable !== undefined ||
                    settingsReminderPractice.tutorialReplayAvailable !== undefined ||
                    settingsReminderPractice.practiceReliefAvailable !== undefined ||
                    settingsReminderPractice.promptReadableLongEnoughToUseKnob !== undefined,
                reason: "capture reminder replay, practice relief, or prompt-usage evidence before treating the lane as more than raw menu reachability.",
            },
            {
                met: settingsPersistence.assistStatePersistsAcrossRetry !== undefined ||
                    settingsPersistence.difficultyStatePersistsAcrossRetry !== undefined ||
                    settingsPersistence.retryReentersWithExpectedState !== undefined,
                reason: "log retry persistence before claiming the sampled assist or difficulty repair path earns trust on the next attempt.",
            },
        ]),
        summarizeCoverage("impact feel audit", [
            {
                met: contacts.length > 0,
                reason: "log at least one contact event before judging impact feel.",
            },
            {
                met: hasCount(evidence.sampledContacts),
                reason: "record contact sample count so payoff claims have scope.",
            },
            {
                met: contacts.some((contact) => contact.hitReadable !== undefined ||
                    contact.forceReadable !== undefined ||
                    contact.scenePreserved !== undefined),
                reason: "capture contact readability or force notes, not only vague feel words.",
            },
        ]),
    ].sort((left, right) => coverageRank(left.status) - coverageRank(right.status));
}
function buildClaimGuardrail(label, coverageGate, data) {
    const evidence = data.evidence ?? {};
    const allowBase = [
        `report only observed ${label.toLowerCase()} strengths or frictions from this session`,
        `keep wording scoped to ${evidence.mode ?? "unknown"} evidence and sampled contexts`,
    ];
    const blockBase = [
        "do not generalize to whole game beyond logged contexts",
        "do not turn missing sample areas into implied passes",
    ];
    const nextEvidence = [...coverageGate.reasons];
    const allowedClaims = [...allowBase];
    const blockedClaims = [...blockBase];
    if (label === "onboarding critique") {
        allowedClaims.push("judge first-contact clarity, reminder availability, and teaching load only if logged");
        allowedClaims.push("judge temporary onboarding prompt recovery only when ephemeral moments were logged");
        blockedClaims.push("do not claim return-after-break clarity without a logged interruption-resume probe");
        blockedClaims.push("do not call transient tutorials harmless if prompt persistence or replayability was not sampled");
    }
    if (label === "activation loop audit") {
        allowedClaims.push("judge first-action trust and hidden-second-start risk only from logged first-contact or early-loop evidence");
        allowedClaims.push("judge reminder recovery only when controls, goal, or interruption-return evidence was logged");
        allowedClaims.push("judge death-to-control-ready re-entry only when retry or recovery-path evidence was logged");
        blockedClaims.push("do not split boot and retry claims away from the same sampled trust path");
        blockedClaims.push("do not call restart trust healthy without an observed retry or recovery path");
        blockedClaims.push("do not claim prompt persistence is harmless if temporary prompt recovery was not sampled");
    }
    if (label === "HUD readability audit") {
        allowedClaims.push("judge cue/HUD readability only for logged busy-frame or critical-read moments");
        allowedClaims.push("flag when read failures may be compounded by obstructed view or auto-camera interference");
        allowedClaims.push("judge overlap priority only when at least one cue-competition moment was logged");
        allowedClaims.push("judge temporary warning or popup recovery only when ephemeral moments were logged");
        allowedClaims.push("judge color-only or audio-only cue fragility only when cue-channel support was logged");
        blockedClaims.push("do not call HUD readable from calm screens alone");
        blockedClaims.push("do not claim multi-warning clarity if no competition moment was sampled");
        blockedClaims.push("do not treat disappearing prompts as readable if replayability or player pacing was not checked");
        blockedClaims.push("do not assume critical cues survive mute play or color ambiguity if no fallback-channel evidence was logged");
    }
    if (label === "telegraph readability audit") {
        allowedClaims.push("judge dangerous space, implied response, and future-path visibility only from logged cues");
        allowedClaims.push("judge whether the telegraph stayed readable under overlap or pressure only when a stressed moment was logged");
        allowedClaims.push("describe timing/readability confidence as observed confidence, not as raw input latency or restart timing");
        blockedClaims.push("do not turn responsiveness timing into telegraph evidence");
        blockedClaims.push("do not claim future-path clarity without a cue that logged the path or occupied space");
        blockedClaims.push("do not claim the telegraph was readable under pressure if no stressed cue or overlap moment was sampled");
    }
    if (label === "pacing curve audit") {
        allowedClaims.push("judge sequencing only from logged beat order and retry loop");
        allowedClaims.push("separate stack overload from control/view confounders when those were logged");
        allowedClaims.push("judge escalation readability only when beat notes include active or fresh demand counts");
        blockedClaims.push("do not claim full run pacing from one partial opening without later beat evidence");
        blockedClaims.push("do not claim interruption recovery support without a logged resume probe or reminder check");
        blockedClaims.push("do not claim mechanic stack stayed readable if beat-level stack evidence was not logged");
    }
    if (label === "failure loop audit") {
        allowedClaims.push("judge failure readability and retry cost only from logged fail-retry sequence");
        allowedClaims.push("judge chain punishment and lesson stability only when those fields were logged");
        allowedClaims.push("say when death readability was confounded by control or camera support instead of loop structure alone");
        blockedClaims.push("do not claim restart loop quality without an observed retry path");
        blockedClaims.push("do not claim fair retry teaching if chain-punish or retry-stability evidence was not sampled");
    }
    if (label === "mastery motivation audit") {
        allowedClaims.push("judge whether the sampled opening showed one earned success, one short goal, and one meaningful early choice");
        allowedClaims.push("judge whether the sampled fail-retry preserved a concrete improvement signal");
        blockedClaims.push("do not declare the whole game motivationally strong or weak from one opening slice");
        blockedClaims.push("do not generalize autonomy or competence support beyond sampled contexts");
    }
    if (label === "choice-readback audit") {
        allowedClaims.push("judge pre-pick option contrast only from logged offered alternatives and expected tradeoff notes");
        allowedClaims.push("judge post-pick payoff readback only when actual payoff timing or after-pick comparison was logged");
        allowedClaims.push("say when weak choice readback may be compounded by broader progression, failure, or control-view issues");
        blockedClaims.push("do not infer meaningful choice from count alone");
        blockedClaims.push("do not claim a skipped option would have played out differently unless the offered comparison actually logged that distinction");
        blockedClaims.push("do not declare the whole upgrade, loadout, or route economy solved from one sampled branch");
    }
    if (label === "readable progression audit") {
        allowedClaims.push("judge proximal goals, prerequisite progress, and next-step clarity only from logged progression evidence");
        allowedClaims.push("judge whether the progression read felt reachable or evaluative only when that field was logged");
        blockedClaims.push("do not turn general mastery tone into progression evidence");
        blockedClaims.push("do not claim readable progression without a logged progress surface or next-step readback");
    }
    if (label === "forgiveness audit") {
        allowedClaims.push("judge coyote time, input buffering, corner correction, or collision leniency only from logged intent-preservation moments");
        allowedClaims.push("judge whether failure felt stolen only when the sampled moment names the intended action and the observed outcome");
        allowedClaims.push("judge retry teaching only when the sampled retry clarifies the missed timing or preserves the same lesson");
        blockedClaims.push("do not call the whole control model fair from one clean sample");
        blockedClaims.push("do not treat generic fast retry as forgiveness evidence when the edge-timing or collision moment was not logged");
        blockedClaims.push("do not call harsh timing acceptable if no practice, assist, or lower-punishment path was sampled for the brittle demand");
    }
    if (label === "input demand audit") {
        allowedClaims.push("judge mash, hold, simultaneous, rapid-sequence, analog, or timing-speed burden only from logged demand samples or explicit demand fields");
        allowedClaims.push("judge remap truth separately from motor-tax burden only when both surfaces were logged");
        allowedClaims.push("judge lower-demand alternatives or assists only when those fields were sampled");
        blockedClaims.push("do not collapse general difficulty into input-demand evidence without a named demanded action");
        blockedClaims.push("do not treat remapping as a complete accessibility answer if timing-speed burden or simultaneous demand stayed unsampled");
        blockedClaims.push("do not call harsh demanded inputs acceptable if no lower-demand path, assist, or readability-before-failure evidence was logged");
    }
    if (label === "control-surface audit") {
        allowedClaims.push("judge remap scope, remap reflection, hold-toggle alternatives, and tuning surfaces only when logged");
        allowedClaims.push("describe game-speed or timing relief as control-surface support, not as a full accessibility verdict");
        allowedClaims.push("keep the lane separate from settings-and-assists and say when the boundary was explicitly checked");
        blockedClaims.push("do not turn motor-tax burden claims into control-surface claims");
        blockedClaims.push("do not claim broader accessibility relief from remap or tuning alone");
        blockedClaims.push("do not fold assist menus or difficulty presets into this lane unless the session explicitly logged them as control-surface evidence");
    }
    if (label === "settings-and-assists audit") {
        allowedClaims.push("judge live, pause, or post-failure recovery reachability only from logged recovery-surface evidence");
        allowedClaims.push("judge progress-safe changes, reminder replay, practice relief, or retry persistence only when those fields were sampled");
        allowedClaims.push("keep the lane separate from control-surface tuning and raw motor-tax burden");
        blockedClaims.push("do not collapse remap, hold-toggle, sensitivity, inversion, or axis tuning into this lane");
        blockedClaims.push("do not claim a recovery path is trustworthy if persistence or change-safety stayed unsampled");
        blockedClaims.push("do not generalize one sampled death or pause path into a full settings verdict");
    }
    if (label === "impact feel audit") {
        allowedClaims.push("judge contact truth or force hierarchy only for logged contact samples");
        blockedClaims.push("do not claim heavy-hit payoff if no heavy or high-stakes contact was observed");
    }
    if (coverageGate.status === "ready") {
        allowedClaims.push("coverage gate ready: downstream audit may make lens-specific findings, still scoped to this sample.");
    }
    else if (coverageGate.status === "partial") {
        allowedClaims.push("coverage gate partial: downstream audit may flag observed issues, but must name evidence gaps.");
        blockedClaims.push("do not issue clean-pass or comprehensive verdict language");
    }
    else {
        blockedClaims.push("do not run downstream verdict as if audit evidence exists");
    }
    return {
        label,
        coverageGate,
        allowedClaims,
        blockedClaims,
        nextEvidence,
    };
}
function buildActivationStarter(data) {
    const evidence = data.evidence ?? {};
    return {
        game: data.game ?? "unknown-game",
        sessionDate: data.sessionDate ?? "unknown-date",
        firstContact: data.firstContact ?? {},
        earlyLoop: data.earlyLoop ?? {},
        retrySeconds: data.retrySeconds,
        returnsToCurrentTestQuickly: data.returnsToCurrentTestQuickly,
        failures: data.failures ?? [],
        failState: data.failState ?? {},
        learningLoop: data.learningLoop ?? {},
        recoverySupport: data.recoverySupport ?? {},
        resumeProbes: data.resumeProbes ?? [],
        ephemeralMoments: data.ephemeralMoments ?? [],
        confounders: data.confounders ?? {},
        evidence: {
            mode: evidence.mode,
            sampledRuns: evidence.sampledRuns,
            sampledFailures: evidence.sampledFailures,
            sampledRetries: evidence.sampledRetries,
            sampledResumeProbes: evidence.sampledResumeProbes,
            notes: evidence.notes,
        },
        probeOutcomes: data.probeOutcomes ?? [],
        incidents: data.incidents ?? [],
        strengths: data.strengths ?? [],
        frictions: data.frictions ?? [],
    };
}
function buildOnboardingStarter(data) {
    const firstContact = data.firstContact ?? {};
    const evidence = data.evidence ?? {};
    const beats = data.beats ?? [];
    return {
        game: data.game ?? "unknown-game",
        sessionDate: data.sessionDate ?? "unknown-date",
        verbs: beats
            .filter((beat) => beat.novelty === "new-verb" || beat.novelty === "new-combo")
            .map((beat) => ({
            name: beat.skills?.join(" + ") ?? beat.label ?? "unknown-verb",
            firstPromptAt: beat.at,
            firstRequiredAt: beat.at,
            practiceBeforeRisk: beat.practicedBefore,
            feedback: beat.readable === false ? "unclear" : "clear",
        })),
        reminders: {
            controlsDuringPlay: firstContact.controlsReminderAvailable,
            objectiveDuringPlay: firstContact.objectiveReminderAvailable,
            progressSafe: firstContact.progressSafeHelp,
            remapSafe: firstContact.remapSafe,
        },
        objectiveClarity: {
            currentGoalEasyToRestate: firstContact.currentGoalEasyToRestate,
            nextStepPrescriptive: firstContact.nextStepPrescriptive,
        },
        earlyLoop: data.earlyLoop ?? {},
        teachingLoad: {
            loopComplexity: firstContact.loopComplexity,
            discoverableThroughExperiment: firstContact.discoverableThroughExperiment,
            upfrontInstructionScreens: firstContact.upfrontInstructionScreens,
            promptsBeforeMeaningfulPlay: firstContact.promptsBeforeMeaningfulPlay,
            blocksFirstMeaningfulInput: firstContact.blocksFirstMeaningfulInput,
            forcedTutorialSteps: firstContact.forcedTutorialSteps,
            optionalHelpOnDemand: firstContact.optionalHelpOnDemand,
        },
        evidence: {
            mode: evidence.mode,
            sampledRuns: evidence.sampledRuns,
            sampledFailures: evidence.sampledFailures,
            sampledRetries: evidence.sampledRetries,
            sampledResumeProbes: evidence.sampledResumeProbes,
            notes: evidence.notes,
        },
        resumeProbes: data.resumeProbes ?? [],
        probeOutcomes: data.probeOutcomes ?? [],
        incidents: data.incidents ?? [],
        strengths: data.strengths ?? [],
        frictions: data.frictions ?? [],
    };
}
function buildHudStarter(data) {
    const evidence = data.evidence ?? {};
    return {
        game: data.game ?? "unknown-game",
        sessionDate: data.sessionDate ?? "unknown-date",
        criticalElements: data.criticalElements ?? [],
        cues: data.cues ?? [],
        stressFrames: data.stressFrames ?? [],
        competitionMoments: data.competitionMoments ?? [],
        ephemeralMoments: data.ephemeralMoments ?? [],
        clutter: data.clutter ?? {},
        confounders: data.confounders ?? {},
        evidence: {
            mode: evidence.mode,
            sampledEncounters: evidence.sampledEncounters,
            sampledBusyFrames: evidence.sampledBusyFrames,
            notes: evidence.notes,
        },
        probeOutcomes: data.probeOutcomes ?? [],
        incidents: data.incidents ?? [],
        strengths: data.strengths ?? [],
        frictions: data.frictions ?? [],
    };
}
function buildTelegraphStarter(data) {
    const evidence = data.evidence ?? {};
    const cues = data.cues ?? [];
    return {
        game: data.game ?? "unknown-game",
        sessionDate: data.sessionDate ?? "unknown-date",
        telegraphReadings: cues.map((cue) => ({
            name: cue.name ?? "unnamed",
            dangerousSpace: cue.notes ?? "not logged",
            impliedResponse: cue.requiredResponseObvious === true ? "clear" : "unclear",
            futurePathVisible: cue.futurePathVisible,
            telegraphReadable: cue.telegraphReadable,
            timingReadabilityConfidence: cue.telegraphReadable === true && cue.requiredResponseObvious === true && cue.futurePathVisible === true
                ? "high"
                : cue.telegraphReadable === true || cue.requiredResponseObvious === true || cue.futurePathVisible === true
                    ? "partial"
                    : "low",
            contrastStable: cue.contrastStable,
            readableUnderMotion: cue.readableUnderMotion,
            motionDistraction: cue.motionDistraction,
        })),
        competitionMoments: data.competitionMoments ?? [],
        stressFrames: data.stressFrames ?? [],
        channelSupport: data.channelSupport ?? {},
        confounders: data.confounders ?? {},
        evidence: {
            mode: evidence.mode,
            sampledEncounters: evidence.sampledEncounters,
            sampledBusyFrames: evidence.sampledBusyFrames,
            notes: evidence.notes,
        },
        probeOutcomes: data.probeOutcomes ?? [],
        incidents: data.incidents ?? [],
        strengths: data.strengths ?? [],
        frictions: data.frictions ?? [],
    };
}
function buildPacingStarter(data) {
    const evidence = data.evidence ?? {};
    return {
        game: data.game ?? "unknown-game",
        sessionDate: data.sessionDate ?? "unknown-date",
        beats: data.beats ?? [],
        earlyLoop: data.earlyLoop ?? {},
        retrySeconds: data.retrySeconds,
        returnsToCurrentTestQuickly: data.returnsToCurrentTestQuickly,
        confounders: data.confounders ?? {},
        evidence: {
            mode: evidence.mode,
            sampledRuns: evidence.sampledRuns,
            sampledFailures: evidence.sampledFailures,
            sampledRetries: evidence.sampledRetries,
            sampledResumeProbes: evidence.sampledResumeProbes,
            notes: evidence.notes,
        },
        resumeProbes: data.resumeProbes ?? [],
        probeOutcomes: data.probeOutcomes ?? [],
        incidents: data.incidents ?? [],
        strengths: data.strengths ?? [],
        frictions: data.frictions ?? [],
    };
}
function buildFailureStarter(data) {
    const evidence = data.evidence ?? {};
    return {
        game: data.game ?? "unknown-game",
        sessionDate: data.sessionDate ?? "unknown-date",
        failures: data.failures ?? [],
        failState: data.failState ?? {},
        pressure: data.pressure ?? {},
        learningLoop: data.learningLoop ?? {},
        recoverySupport: data.recoverySupport ?? {},
        confounders: data.confounders ?? {},
        evidence: {
            mode: evidence.mode,
            sampledFailures: evidence.sampledFailures,
            sampledRetries: evidence.sampledRetries,
            sampledResumeProbes: evidence.sampledResumeProbes,
            notes: evidence.notes,
        },
        resumeProbes: data.resumeProbes ?? [],
        probeOutcomes: data.probeOutcomes ?? [],
        incidents: data.incidents ?? [],
        strengths: data.strengths ?? [],
        frictions: data.frictions ?? [],
    };
}
function buildMasteryMotivationStarter(data) {
    const evidence = data.evidence ?? {};
    return {
        game: data.game ?? "unknown-game",
        sessionDate: data.sessionDate ?? "unknown-date",
        firstContact: data.firstContact ?? {},
        earlyLoop: data.earlyLoop ?? {},
        mastery: data.mastery ?? {},
        learningLoop: data.learningLoop ?? {},
        recoverySupport: data.recoverySupport ?? {},
        failures: data.failures ?? [],
        resumeProbes: data.resumeProbes ?? [],
        probeOutcomes: data.probeOutcomes ?? [],
        incidents: data.incidents ?? [],
        confounders: data.confounders ?? {},
        evidence: {
            mode: evidence.mode,
            sampledRuns: evidence.sampledRuns,
            sampledFailures: evidence.sampledFailures,
            sampledRetries: evidence.sampledRetries,
            sampledResumeProbes: evidence.sampledResumeProbes,
            notes: evidence.notes,
        },
        strengths: data.strengths ?? [],
        frictions: data.frictions ?? [],
    };
}
function buildChoiceReadbackStarter(data) {
    const evidence = data.evidence ?? {};
    return {
        game: data.game ?? "unknown-game",
        sessionDate: data.sessionDate ?? "unknown-date",
        firstContact: data.firstContact ?? {},
        mastery: data.mastery ?? {},
        readableProgression: data.readableProgression ?? {},
        failures: data.failures ?? [],
        probeOutcomes: data.probeOutcomes ?? [],
        incidents: data.incidents ?? [],
        confounders: data.confounders ?? {},
        evidence: {
            mode: evidence.mode,
            sampledRuns: evidence.sampledRuns,
            sampledFailures: evidence.sampledFailures,
            sampledRetries: evidence.sampledRetries,
            notes: evidence.notes,
        },
        strengths: data.strengths ?? [],
        frictions: data.frictions ?? [],
    };
}
function buildReadableProgressionStarter(data) {
    const evidence = data.evidence ?? {};
    return {
        game: data.game ?? "unknown-game",
        sessionDate: data.sessionDate ?? "unknown-date",
        readableProgression: data.readableProgression ?? {},
        mastery: data.mastery ?? {},
        earlyLoop: data.earlyLoop ?? {},
        firstContact: data.firstContact ?? {},
        failures: data.failures ?? [],
        resumeProbes: data.resumeProbes ?? [],
        probeOutcomes: data.probeOutcomes ?? [],
        incidents: data.incidents ?? [],
        confounders: data.confounders ?? {},
        evidence: {
            mode: evidence.mode,
            sampledRuns: evidence.sampledRuns,
            sampledFailures: evidence.sampledFailures,
            sampledRetries: evidence.sampledRetries,
            sampledResumeProbes: evidence.sampledResumeProbes,
            notes: evidence.notes,
        },
        strengths: data.strengths ?? [],
        frictions: data.frictions ?? [],
    };
}
function buildChoiceMomentSection(choicePoints) {
    if (choicePoints.length === 0) {
        return ["- none logged"];
    }
    return choicePoints.map((choice) => {
        const offeredOptions = choice.offeredOptions && choice.offeredOptions.length > 0
            ? choice.offeredOptions
                .map((option) => {
                const parts = [
                    option.label ?? "unnamed option",
                    `expected payoff=${option.expectedPayoff ?? "unknown"}`,
                    `expected cost=${option.expectedCost ?? "unknown"}`,
                    `current-state comparison=${option.currentStateComparison ?? "unknown"}`,
                    `current-build comparison=${option.currentBuildComparison ?? "unknown"}`,
                    `notes=${option.notes ?? "none"}`,
                ];
                return `[${parts.join("; ")}]`;
            })
                .join(" ")
            : "none logged";
        return `- ${choice.moment ?? "unknown moment"} ${choice.label ?? "unnamed choice"}: type=${choice.choiceType ?? "unknown"}; options=${choice.optionsCount ?? "unknown"}; meaning clear=${boolLabel(choice.meaningClear)}; reversible=${boolLabel(choice.reversible)}; offered options=${offeredOptions}; picked option=${choice.pickedOptionLabel ?? "unknown"}; expected payoff=${choice.expectedPayoff ?? "unknown"}; actual payoff=${choice.actualPayoff ?? "unknown"}; payoff timing=${choice.actualPayoffTiming ?? "unknown"}; payoff matched expectation=${choice.payoffMatchedExpectation ?? "unknown"}; after-pick comparison clear=${boolLabel(choice.afterPickComparisonClear)}; after-pick state comparison=${choice.afterPickComparison ?? "none logged"}; after-pick build comparison=${choice.afterPickBuildComparison ?? "none logged"}; notes=${choice.notes ?? "none"}`;
    });
}
function buildForgivenessStarter(data) {
    const evidence = data.evidence ?? {};
    return {
        game: data.game ?? "unknown-game",
        sessionDate: data.sessionDate ?? "unknown-date",
        forgiveness: data.forgiveness ?? {},
        failures: data.failures ?? [],
        learningLoop: data.learningLoop ?? {},
        recoverySupport: data.recoverySupport ?? {},
        probeOutcomes: data.probeOutcomes ?? [],
        incidents: data.incidents ?? [],
        confounders: data.confounders ?? {},
        evidence: {
            mode: evidence.mode,
            sampledRuns: evidence.sampledRuns,
            sampledFailures: evidence.sampledFailures,
            sampledRetries: evidence.sampledRetries,
            notes: evidence.notes,
        },
        strengths: data.strengths ?? [],
        frictions: data.frictions ?? [],
    };
}
function buildInputDemandStarter(data) {
    const evidence = data.evidence ?? {};
    return {
        game: data.game ?? "unknown-game",
        sessionDate: data.sessionDate ?? "unknown-date",
        inputDemand: data.inputDemand ?? {},
        firstContact: data.firstContact ?? {},
        failures: data.failures ?? [],
        learningLoop: data.learningLoop ?? {},
        recoverySupport: data.recoverySupport ?? {},
        probeOutcomes: data.probeOutcomes ?? [],
        incidents: data.incidents ?? [],
        confounders: data.confounders ?? {},
        evidence: {
            mode: evidence.mode,
            sampledRuns: evidence.sampledRuns,
            sampledFailures: evidence.sampledFailures,
            sampledRetries: evidence.sampledRetries,
            notes: evidence.notes,
        },
        strengths: data.strengths ?? [],
        frictions: data.frictions ?? [],
    };
}
function buildNestedControlSurfaceStarter(controlSurface) {
    const data = controlSurface ?? {};
    const remapAvailable = data.remapScope === "full" || data.remapScope === "partial"
        ? true
        : data.remapScope === "none"
            ? false
            : undefined;
    const remapScope = data.remapInputsVisible && data.remapScope
        ? [data.remapScope === "full" ? "all sampled core actions" : "partial sampled remap coverage"]
        : [];
    const speedKinds = [
        data.gameSpeedReliefAvailable ? "game-speed relief" : undefined,
        data.timingReliefAvailable ? "timing relief" : undefined,
    ].filter((value) => Boolean(value));
    return {
        remap: {
            available: remapAvailable,
            scope: remapScope,
            notes: data.notes,
        },
        promptReflection: {
            available: data.remapReflectedInPrompts,
            stateVisible: data.remapReflectedInPrompts,
            notes: data.remapReflectedInPrompts === undefined ? data.notes : "shared starter logged remap reflection state",
        },
        holdToggle: {
            explicit: data.holdToggleAlternativeAvailable,
            recoverable: data.holdToggleAlternativeAvailable,
            notes: data.holdToggleAlternativeAvailable === undefined
                ? data.notes
                : "shared starter logged hold-toggle alternative availability",
        },
        sensitivity: {
            available: data.sensitivityControlsAvailable !== undefined ||
                data.inversionControlsAvailable !== undefined ||
                data.axisControlsAvailable !== undefined
                ? Boolean(data.sensitivityControlsAvailable ||
                    data.inversionControlsAvailable ||
                    data.axisControlsAvailable)
                : undefined,
            axisOptions: data.axisControlsAvailable !== undefined || data.inversionControlsAvailable !== undefined
                ? Boolean(data.axisControlsAvailable || data.inversionControlsAvailable)
                : undefined,
            notes: data.notes,
        },
        gameSpeedRelief: {
            available: data.gameSpeedReliefAvailable !== undefined || data.timingReliefAvailable !== undefined
                ? Boolean(data.gameSpeedReliefAvailable || data.timingReliefAvailable)
                : undefined,
            kind: speedKinds.join(" + ") || undefined,
            notes: data.notes,
        },
        settingsAndAssistsBoundaryClear: data.settingsAndAssistsBoundaryClear,
        notes: data.notes,
    };
}
function buildControlSurfaceStarter(data) {
    const evidence = data.evidence ?? {};
    const controlSurface = data.controlSurface ?? {};
    return {
        game: data.game ?? "unknown-game",
        sessionDate: data.sessionDate ?? "unknown-date",
        controlSurface,
        starter: buildNestedControlSurfaceStarter(controlSurface),
        inputDemand: data.inputDemand ?? {},
        firstContact: data.firstContact ?? {},
        evidence: {
            mode: evidence.mode,
            sampledRuns: evidence.sampledRuns,
            sampledFailures: evidence.sampledFailures,
            sampledRetries: evidence.sampledRetries,
            notes: evidence.notes,
        },
        probeOutcomes: data.probeOutcomes ?? [],
        incidents: data.incidents ?? [],
        strengths: data.strengths ?? [],
        frictions: data.frictions ?? [],
    };
}
function buildNestedSettingsAndAssistsStarter(settingsAndAssists) {
    const data = settingsAndAssists ?? {};
    const reachability = data.reachability ?? {};
    const changeSafety = data.changeSafety ?? {};
    const reminderPractice = data.reminderPractice ?? {};
    const persistence = data.persistence ?? {};
    return {
        recoveryTrust: {
            liveReachable: reachability.midRunSettingsReachable !== undefined ||
                reachability.pauseSettingsReachable !== undefined ||
                reachability.postFailureSettingsReachable !== undefined ||
                reachability.postFailureAssistReachable !== undefined
                ? Boolean(reachability.midRunSettingsReachable ||
                    reachability.pauseSettingsReachable ||
                    reachability.postFailureSettingsReachable ||
                    reachability.postFailureAssistReachable)
                : undefined,
            progressSafe: changeSafety.changesApplyWithoutRestart !== undefined ||
                changeSafety.progressPreservedWhenChanged !== undefined
                ? Boolean(changeSafety.changesApplyWithoutRestart &&
                    changeSafety.progressPreservedWhenChanged)
                : undefined,
            persistsAcrossRetry: persistence.assistStatePersistsAcrossRetry !== undefined ||
                persistence.difficultyStatePersistsAcrossRetry !== undefined ||
                persistence.retryReentersWithExpectedState !== undefined
                ? Boolean(persistence.assistStatePersistsAcrossRetry &&
                    persistence.difficultyStatePersistsAcrossRetry &&
                    persistence.retryReentersWithExpectedState)
                : undefined,
            notes: data.notes,
        },
        reachability,
        changeSafety,
        reminderPractice,
        persistence,
        notes: data.notes,
    };
}
function buildSettingsAndAssistsStarter(data) {
    const evidence = data.evidence ?? {};
    const settingsAndAssists = data.settingsAndAssists ?? {};
    return {
        game: data.game ?? "unknown-game",
        sessionDate: data.sessionDate ?? "unknown-date",
        settingsAndAssists,
        starter: buildNestedSettingsAndAssistsStarter(settingsAndAssists),
        controlSurface: data.controlSurface ?? {},
        firstContact: data.firstContact ?? {},
        learningLoop: data.learningLoop ?? {},
        recoverySupport: data.recoverySupport ?? {},
        resumeProbes: data.resumeProbes ?? [],
        failures: data.failures ?? [],
        evidence: {
            mode: evidence.mode,
            sampledRuns: evidence.sampledRuns,
            sampledFailures: evidence.sampledFailures,
            sampledRetries: evidence.sampledRetries,
            sampledResumeProbes: evidence.sampledResumeProbes,
            notes: evidence.notes,
        },
        probeOutcomes: data.probeOutcomes ?? [],
        incidents: data.incidents ?? [],
        strengths: data.strengths ?? [],
        frictions: data.frictions ?? [],
    };
}
function buildImpactStarter(data) {
    const evidence = data.evidence ?? {};
    return {
        game: data.game ?? "unknown-game",
        sessionDate: data.sessionDate ?? "unknown-date",
        contacts: data.contacts ?? [],
        channelSupport: data.channelSupport ?? {},
        evidence: {
            mode: evidence.mode,
            sampledEncounters: evidence.sampledEncounters,
            sampledContacts: evidence.sampledContacts,
            sampledHeavyContacts: countWhere(data.contacts ?? [], (contact) => contact.intensity === "heavy"),
            notes: evidence.notes,
        },
        probeOutcomes: data.probeOutcomes ?? [],
        incidents: data.incidents ?? [],
        strengths: data.strengths ?? [],
        frictions: data.frictions ?? [],
    };
}
function buildAgiSnapshotStarter(data) {
    const evidence = data.evidence ?? {};
    return {
        game: data.game ?? "unknown-game",
        sessionDate: data.sessionDate ?? "unknown-date",
        agiSnapshot: data.agiSnapshot ?? {},
        inputDemand: data.inputDemand ?? {},
        cues: data.cues ?? [],
        stressFrames: data.stressFrames ?? [],
        channelSupport: data.channelSupport ?? {},
        confounders: data.confounders ?? {},
        evidence: {
            mode: evidence.mode,
            sampledRuns: evidence.sampledRuns,
            sampledBusyFrames: evidence.sampledBusyFrames,
            sampledContacts: evidence.sampledContacts,
            notes: evidence.notes,
        },
        probeOutcomes: data.probeOutcomes ?? [],
        incidents: data.incidents ?? [],
        strengths: data.strengths ?? [],
        frictions: data.frictions ?? [],
    };
}
function formatCueChannels(channels) {
    return channels && channels.length > 0 ? channels.join(", ") : "unknown";
}
function getAgiSnapshotOutputPath(game = "some-game") {
    return `./.local/${game}-agi-tags.json`;
}
export function buildStarterPayloads(data) {
    const coverageByLabel = new Map(buildCoverageChecks(data).map((check) => [check.label, check]));
    const sufficiency = buildEvidenceSufficiency(data);
    function withCoverage(label, payload) {
        const check = coverageByLabel.get(label);
        const fallbackCheck = check ?? {
            label,
            status: "missing",
            reasons: ["coverage gate missing"],
        };
        return {
            evidenceSufficiency: sufficiency,
            claimGuardrail: buildClaimGuardrail(label, fallbackCheck, data),
            ...payload,
        };
    }
    return {
        "activation-loop-audit.json": withCoverage("activation loop audit", buildActivationStarter(data)),
        "onboarding-critique.json": withCoverage("onboarding critique", buildOnboardingStarter(data)),
        "hud-readability-audit.json": withCoverage("HUD readability audit", buildHudStarter(data)),
        "telegraphing-readability-audit.json": withCoverage("telegraph readability audit", buildTelegraphStarter(data)),
        "pacing-curve-audit.json": withCoverage("pacing curve audit", buildPacingStarter(data)),
        "failure-loop-audit.json": withCoverage("failure loop audit", buildFailureStarter(data)),
        "mastery-motivation-audit.json": withCoverage("mastery motivation audit", buildMasteryMotivationStarter(data)),
        "choice-readback-audit.json": withCoverage("choice-readback audit", buildChoiceReadbackStarter(data)),
        "readable-progression-audit.json": withCoverage("readable progression audit", buildReadableProgressionStarter(data)),
        "forgiveness-audit.json": withCoverage("forgiveness audit", buildForgivenessStarter(data)),
        "input-demand-audit.json": withCoverage("input demand audit", buildInputDemandStarter(data)),
        "control-surface-audit.json": withCoverage("control-surface audit", buildControlSurfaceStarter(data)),
        "settings-and-assists-audit.json": withCoverage("settings-and-assists audit", buildSettingsAndAssistsStarter(data)),
        "impact-feel-audit.json": withCoverage("impact feel audit", buildImpactStarter(data)),
        "agi-tag-snapshot.json": withCoverage("AGI tag snapshot", buildAgiSnapshotStarter(data)),
    };
}
function renderJsonBlock(label, value) {
    return [`### ${label}`, "", "```json", JSON.stringify(value, null, 2), "```", ""].join("\n");
}
function buildReport(data) {
    const evidence = data.evidence ?? {};
    const findings = buildFindings(data);
    const coverage = buildCoverageChecks(data);
    const sufficiency = buildEvidenceSufficiency(data);
    const incidentQueue = buildIncidentQueue(data);
    const guardrails = coverage.map((check) => buildClaimGuardrail(check.label, check, data));
    const durableLearning = buildDurableLearning(findings, coverage, sufficiency, incidentQueue);
    const cues = data.cues ?? [];
    const confounders = data.confounders ?? {};
    const channelSupport = data.channelSupport ?? {};
    const competitionMoments = data.competitionMoments ?? [];
    const ephemeralMoments = data.ephemeralMoments ?? [];
    const stressFrames = data.stressFrames ?? [];
    const probeOutcomes = data.probeOutcomes ?? [];
    const stackMoments = (data.beats ?? []).filter((beat) => typeof beat.activeDemands === "number" ||
        typeof beat.newDemands === "number" ||
        beat.stackReadable !== undefined);
    const strengths = data.strengths ?? [];
    const frictions = data.frictions ?? [];
    const focus = data.sessionFocus?.length ? data.sessionFocus.join(", ") : "not logged";
    const earlyLoop = data.earlyLoop ?? {};
    const readableProgression = data.readableProgression ?? {};
    const forgiveness = data.forgiveness ?? {};
    const highLoadProbes = probeOutcomes.filter((probe) => isHighProbeLoad(probe));
    const averageMentalDemand = averageProbeRating(probeOutcomes, (probe) => probe.mentalDemand);
    const averageTimePressure = averageProbeRating(probeOutcomes, (probe) => probe.timePressure);
    const averageEffort = averageProbeRating(probeOutcomes, (probe) => probe.effort);
    const report = [
        "# Playtest Evidence Session",
        "",
        `Game: ${data.game ?? "unknown-game"}`,
        `Date: ${data.sessionDate ?? "unknown-date"}`,
        `Focus: ${focus}`,
        "",
        "## Evidence Snapshot",
        "",
        `- Mode: ${evidence.mode ?? "unknown"}`,
        `- Runs: ${evidence.sampledRuns ?? 0}`,
        `- Failures: ${evidence.sampledFailures ?? 0}`,
        `- Retries: ${evidence.sampledRetries ?? 0}`,
        `- Busy frames: ${evidence.sampledBusyFrames ?? 0}`,
        `- Encounters: ${evidence.sampledEncounters ?? 0}`,
        `- Contacts: ${evidence.sampledContacts ?? 0}`,
        `- Resume probes: ${evidence.sampledResumeProbes ?? 0}`,
        `- Notes: ${evidence.notes?.join(" | ") ?? "none"}`,
        "",
        "## Evidence Sufficiency",
        "",
        `- Directness: ${sufficiency.directness}`,
        `- Covered contexts: ${sufficiency.scope.length > 0 ? sufficiency.scope.join(" | ") : "none logged"}`,
        `- Missing contexts: ${sufficiency.gaps.length > 0 ? sufficiency.gaps.join(" | ") : "none"}`,
        `- Claim ceiling: ${sufficiency.claimCeiling}`,
        "",
        "## Early Loop Cadence",
        "",
        `- First meaningful input: ${earlyLoop.firstMeaningfulInputAt ?? "unknown"} (${typeof earlyLoop.secondsToFirstMeaningfulInput === "number" ? `${earlyLoop.secondsToFirstMeaningfulInput}s` : "unknown"}).`,
        `- First risk: ${earlyLoop.firstRiskAt ?? "unknown"} (${typeof earlyLoop.secondsToFirstRisk === "number" ? `${earlyLoop.secondsToFirstRisk}s` : "unknown"}).`,
        `- First reward or clear payoff: ${earlyLoop.firstRewardAt ?? "unknown"} (${typeof earlyLoop.secondsToFirstReward === "number" ? `${earlyLoop.secondsToFirstReward}s` : "unknown"}).`,
        `- First retry opportunity: ${earlyLoop.firstRetryOpportunityAt ?? "unknown"} (${typeof earlyLoop.secondsToFirstRetryOpportunity === "number" ? `${earlyLoop.secondsToFirstRetryOpportunity}s` : "unknown"}).`,
        `- Cadence note: ${earlyLoop.notes ?? "none logged"}.`,
        "",
        "## Session Read",
        "",
        ...findings.map((finding) => `- ${finding.severity}: ${finding.title}. Evidence: ${finding.evidence}`),
        "",
        "## Coverage Gates",
        "",
        ...coverage.map((check) => {
            const reasons = check.reasons.length > 0 ? ` Missing: ${check.reasons.join(" | ")}` : " Ready for downstream audit.";
            return `- ${check.label}: ${check.status}.${reasons}`;
        }),
        "",
        "## Readable Progression",
        "",
        `- Proximal goal visible: ${boolLabel(readableProgression.proximalGoalVisible)}`,
        `- Prerequisite progress visible: ${boolLabel(readableProgression.prerequisiteProgressVisible)}`,
        `- Evaluative readback available: ${boolLabel(readableProgression.evaluativeReadbackAvailable)}`,
        `- Non-comparative next step visible: ${boolLabel(readableProgression.nonComparativeNextStepVisible)}`,
        `- Progress feels reachable: ${boolLabel(readableProgression.progressFeelsReachable)}`,
        `- Progress reminders available: ${boolLabel(readableProgression.progressRemindersAvailable)}`,
        `- Notes: ${readableProgression.notes ?? "none logged"}`,
        "",
        "## Choice Moments",
        "",
        ...buildChoiceMomentSection(data.mastery?.choicePoints ?? []),
        "",
        "## Forgiveness",
        "",
        `- Coyote time present: ${boolLabel(forgiveness.coyoteTimePresent)}`,
        `- Input buffer present: ${boolLabel(forgiveness.inputBufferPresent)}`,
        `- Corner correction present: ${boolLabel(forgiveness.cornerCorrectionPresent)}`,
        `- Collision leniency fair: ${boolLabel(forgiveness.collisionLeniencyFair)}`,
        `- Grace windows consistent: ${boolLabel(forgiveness.graceWindowsConsistent)}`,
        `- Dropped intent caused failures: ${boolLabel(forgiveness.droppedIntentCausedFailures)}`,
        `- Failure felt stolen: ${boolLabel(forgiveness.failFeelsStolen)}`,
        `- Retry clarified missed timing: ${boolLabel(forgiveness.retryClarifiesMissedTiming)}`,
        `- Practice window available: ${boolLabel(forgiveness.practiceWindowAvailable)}`,
        `- Notes: ${forgiveness.notes ?? "none logged"}`,
        ...(forgiveness.moments && forgiveness.moments.length > 0
            ? [
                `- Moments: ${forgiveness.moments
                    .map((moment) => `${moment.challenge ?? "unknown"} [type=${moment.forgivenessType ?? "unknown"}; preserved=${boolLabel(moment.intentPreserved)}; outcome=${moment.outcome ?? "unknown"}]`)
                    .join(" | ")}`,
            ]
            : ["- Moments: none logged"]),
        "",
        "## Settings And Assists",
        "",
        `- Mid-run settings reachable: ${boolLabel(data.settingsAndAssists?.reachability?.midRunSettingsReachable)}`,
        `- Pause settings reachable: ${boolLabel(data.settingsAndAssists?.reachability?.pauseSettingsReachable)}`,
        `- Post-failure settings reachable: ${boolLabel(data.settingsAndAssists?.reachability?.postFailureSettingsReachable)}`,
        `- Post-failure assist reachable: ${boolLabel(data.settingsAndAssists?.reachability?.postFailureAssistReachable)}`,
        `- Difficulty adjustable mid-run: ${boolLabel(data.settingsAndAssists?.changeSafety?.difficultyAdjustableMidRun)}`,
        `- Assists adjustable mid-run: ${boolLabel(data.settingsAndAssists?.changeSafety?.assistsAdjustableMidRun)}`,
        `- Changes apply without restart: ${boolLabel(data.settingsAndAssists?.changeSafety?.changesApplyWithoutRestart)}`,
        `- Progress preserved when changed: ${boolLabel(data.settingsAndAssists?.changeSafety?.progressPreservedWhenChanged)}`,
        `- Controls reminder available: ${boolLabel(data.settingsAndAssists?.reminderPractice?.controlsReminderAvailable)}`,
        `- Objective reminder available: ${boolLabel(data.settingsAndAssists?.reminderPractice?.objectiveReminderAvailable)}`,
        `- Tutorial replay available: ${boolLabel(data.settingsAndAssists?.reminderPractice?.tutorialReplayAvailable)}`,
        `- Practice relief available: ${boolLabel(data.settingsAndAssists?.reminderPractice?.practiceReliefAvailable)}`,
        `- Prompt readable long enough to use knob: ${boolLabel(data.settingsAndAssists?.reminderPractice?.promptReadableLongEnoughToUseKnob)}`,
        `- Assist state persists across retry: ${boolLabel(data.settingsAndAssists?.persistence?.assistStatePersistsAcrossRetry)}`,
        `- Difficulty state persists across retry: ${boolLabel(data.settingsAndAssists?.persistence?.difficultyStatePersistsAcrossRetry)}`,
        `- Retry reenters expected state: ${boolLabel(data.settingsAndAssists?.persistence?.retryReentersWithExpectedState)}`,
        `- Notes: ${data.settingsAndAssists?.notes ?? "none logged"}`,
        "",
        "## Cross-Audit Confounders",
        "",
        `- Input certainty: ${confounders.inputCertainty ?? "unknown"}`,
        `- Response latency: ${confounders.responseLatency ?? "unknown"}`,
        `- Camera supports action: ${boolLabel(confounders.cameraSupportsAction)}`,
        `- View obstructed at decision: ${boolLabel(confounders.viewObstructedAtDecision)}`,
        `- Auto-camera interference: ${boolLabel(confounders.autoCameraInterference)}`,
        `- Notes: ${confounders.notes ?? "none"}`,
        "",
        "## Cue Channel Support",
        "",
        `- Critical info multi-channel: ${boolLabel(channelSupport.criticalInfoMultiChannel)}`,
        `- Critical info uses color only: ${boolLabel(channelSupport.criticalInfoUsesColorOnly)}`,
        `- Critical info uses audio only: ${boolLabel(channelSupport.criticalInfoUsesAudioOnly)}`,
        `- Critical info still playable on mute: ${boolLabel(channelSupport.muteCriticalInfoStillPlayable)}`,
        `- Critical info has non-color backup: ${boolLabel(channelSupport.criticalInfoHasNonColorBackup)}`,
        `- Haptics used: ${boolLabel(channelSupport.hapticsUsed)}`,
        `- Haptics configurable: ${boolLabel(channelSupport.hapticsConfigurable)}`,
        `- Haptics carry critical info alone: ${boolLabel(channelSupport.hapticsCarryCriticalInfoAlone)}`,
        ...(cues.length > 0
            ? [
                `- Cue detail: ${cues
                    .map((cue) => `${cue.name ?? "unnamed"} [channels=${formatCueChannels(cue.signalChannels)}; color-only=${boolLabel(cue.reliesOnColorAlone)}; audio-only=${boolLabel(cue.reliesOnAudioAlone)}]`)
                    .join(" | ")}`,
            ]
            : ["- Cue detail: none logged"]),
        "",
        "## Cue Competition",
        "",
        ...(competitionMoments.length > 0
            ? competitionMoments.map((moment) => `- ${moment.moment ?? "unknown moment"}: signals=${moment.signals?.join(", ") ?? "none logged"}; dominant read=${boolLabel(moment.dominantReadClear)}; response priority=${boolLabel(moment.responsePriorityClear)}; non-critical UI competing=${boolLabel(moment.nonCriticalUiCompeting)}; notes=${moment.notes ?? "none"}`)
            : ["- none logged"]),
        "",
        "## Busy Frame Capture",
        "",
        ...(stressFrames.length > 0
            ? stressFrames.map((frame) => `- ${frame.moment ?? "unknown moment"}: tags=${frame.tags?.join(", ") ?? "none"}; cue masked=${boolLabel(frame.cueMasked)}; critical info lost=${boolLabel(frame.criticalInfoLost)}; response readable=${boolLabel(frame.responseStillReadable)}; frame=${frame.framePath ?? "not saved"}; notes=${frame.notes ?? "none"}`)
            : ["- none logged"]),
        "",
        "## Temporary Prompt Recovery",
        "",
        ...(ephemeralMoments.length > 0
            ? ephemeralMoments.map((moment) => `- ${moment.name ?? "unnamed"}: kind=${moment.kind ?? "unknown"}; importance=${moment.importance ?? "unknown"}; near action=${boolLabel(moment.appearsNearAction)}; auto-dismisses=${boolLabel(moment.autoDismisses)}; dismiss seconds=${typeof moment.dismissSeconds === "number" ? moment.dismissSeconds : "unknown"}; player-paced=${boolLabel(moment.playerControlledAdvance)}; reviewable later=${boolLabel(moment.reviewableLater)}; suppressible when non-critical=${boolLabel(moment.suppressibleWhenNonCritical)}; obstructs critical read=${boolLabel(moment.obstructsCriticalRead)}; notes=${moment.notes ?? "none"}`)
            : ["- none logged"]),
        "",
        "## Probe Outcomes",
        "",
        ...(probeOutcomes.length > 0
            ? probeOutcomes.map((probe) => `- ${probe.probe ?? "unknown-probe"}: outcome=${probe.outcome ?? "unknown"}; success rating=${formatRating(probe.successRating, 4)}; confidence=${formatRating(probe.confidence, 7)}; satisfaction=${formatRating(probe.satisfaction, 7)}; frustration=${formatRating(probe.frustration, 7, "-not-frustrated")}; mental demand=${formatRating(probe.mentalDemand, 7, "-high")}; time pressure=${formatRating(probe.timePressure, 7, "-high")}; effort=${formatRating(probe.effort, 7, "-high")}; blockers=${probe.blockers?.join(", ") ?? "none"}; notes=${probe.notes ?? probe.goal ?? "none"}`)
            : ["- none logged"]),
        "",
        "## Probe Load",
        "",
        ...(probeOutcomes.length > 0
            ? [
                `- Average mental demand: ${formatRating(averageMentalDemand, 7, "-high")}.`,
                `- Average time pressure: ${formatRating(averageTimePressure, 7, "-high")}.`,
                `- Average effort: ${formatRating(averageEffort, 7, "-high")}.`,
                `- High-load probes: ${highLoadProbes.length > 0 ? highLoadProbes.map((probe) => probe.probe ?? "unknown-probe").join(" | ") : "none"}.`,
                "- Read load alongside success. A probe that technically worked can still mark overload if demand, rush, or effort stayed high.",
            ]
            : ["- none logged"]),
        "",
        "## Cross-Lens Incident Queue",
        "",
        ...(incidentQueue.length > 0
            ? incidentQueue.map((incident) => `- ${incident.incidentTag ?? incident.title ?? "untagged-incident"}: title=${incident.title ?? "none"}; lenses=${incident.lenses?.join(", ") ?? "none logged"}; first seen=${incident.firstSeenAt ?? "unknown"}; repeats=${incident.repeatedCount ?? 1}; impact=${incident.impact ?? "unknown"}; persistence=${incident.persistence ?? "unknown"}; player cost=${incident.playerCost?.join(", ") ?? "none logged"}; next check=${incident.nextCheck ?? "none"}; notes=${incident.notes ?? "none"}`)
            : ["- none logged"]),
        "",
        "## Stack Pressure",
        "",
        ...(stackMoments.length > 0
            ? stackMoments.map((beat) => `- ${beat.at ?? "unknown time"} ${beat.label ?? "unnamed beat"}: active demands=${beat.activeDemands ?? "unknown"}; new demands=${beat.newDemands ?? "unknown"}; stack readable=${boolLabel(beat.stackReadable)}; notes=${beat.notes ?? "none"}`)
            : ["- none logged"]),
        "",
        "## Downstream Claim Guardrails",
        "",
        ...guardrails.flatMap((guardrail) => [
            `### ${guardrail.label}`,
            "",
            `- Gate: ${guardrail.coverageGate.status}`,
            `- Allowed: ${guardrail.allowedClaims.join(" | ")}`,
            `- Blocked: ${guardrail.blockedClaims.join(" | ")}`,
            `- Next evidence: ${guardrail.nextEvidence.length > 0 ? guardrail.nextEvidence.join(" | ") : "none"}`,
            "",
        ]),
        "## Strengths",
        "",
        ...(strengths.length > 0 ? strengths.map((item) => `- ${item}`) : ["- none logged"]),
        "",
        "## Frictions",
        "",
        ...(frictions.length > 0 ? frictions.map((item) => `- ${item}`) : ["- none logged"]),
        "",
        "## Starter JSON",
        "",
        renderJsonBlock("Activation Loop Audit", buildActivationStarter(data)),
        renderJsonBlock("Onboarding Critique", buildOnboardingStarter(data)),
        renderJsonBlock("HUD Readability Audit", buildHudStarter(data)),
        renderJsonBlock("Telegraph Readability Audit", buildTelegraphStarter(data)),
        renderJsonBlock("Pacing Curve Audit", buildPacingStarter(data)),
        renderJsonBlock("Failure Loop Audit", buildFailureStarter(data)),
        renderJsonBlock("Mastery Motivation Audit", buildMasteryMotivationStarter(data)),
        renderJsonBlock("Choice Readback Audit", buildChoiceReadbackStarter(data)),
        renderJsonBlock("Readable Progression Audit", buildReadableProgressionStarter(data)),
        renderJsonBlock("Control Surface Audit", buildControlSurfaceStarter(data)),
        renderJsonBlock("Settings And Assists Audit", buildSettingsAndAssistsStarter(data)),
        renderJsonBlock("Impact Feel Audit", buildImpactStarter(data)),
        renderJsonBlock("AGI Tag Snapshot", buildAgiSnapshotStarter(data)),
        "## Durable Learning",
        "",
        durableLearning,
        "",
    ].join("\n");
    return {
        report,
        durableLearning,
    };
}
function ensureParentDirectory(filePath) {
    mkdirSync(dirname(filePath), { recursive: true });
}
function writeStarterFiles(starterDir, data) {
    const outDir = resolve(starterDir);
    ensureParentDirectory(resolve(outDir, "placeholder"));
    const payloads = buildStarterPayloads(data);
    return Object.entries(payloads).map(([fileName, payload]) => {
        const filePath = resolve(outDir, fileName);
        writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
        return filePath;
    });
}
function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.template) {
        console.log(buildTemplate());
        return;
    }
    if (!options.observations) {
        throw new Error("Pass --template or provide --observations <file>.");
    }
    const observations = readObservations(options.observations);
    const mergedObservations = options.busyFrameCapture
        ? mergeObservationPatch(observations, readBusyFrameCapture(options.busyFrameCapture).observationPatch ?? {})
        : observations;
    const { report, durableLearning } = buildReport(mergedObservations);
    saveLearning({ learningLine: durableLearning });
    const starterFiles = options.starterDir ? writeStarterFiles(options.starterDir, mergedObservations) : [];
    const normalizedOut = options.normalizedOut ?? (options.starterDir ? resolve(options.starterDir, "observation-finding-normalizer.json") : undefined);
    const normalizedArtifactPaths = normalizedOut ? [options.observations, ...starterFiles].filter((value) => Boolean(value)) : [];
    if (options.out) {
        const outPath = resolve(options.out);
        ensureParentDirectory(outPath);
        writeFileSync(outPath, report, "utf8");
    }
    if (normalizedOut && normalizedArtifactPaths.length > 0) {
        writeNormalizedFindingFile({
            artifactPaths: normalizedArtifactPaths,
            outPath: normalizedOut,
        });
    }
    console.log(report);
    if (starterFiles.length > 0) {
        console.log("");
        console.log("Starter files:");
        for (const filePath of starterFiles) {
            console.log(`- ${filePath}`);
        }
    }
    if (normalizedOut && normalizedArtifactPaths.length > 0) {
        console.log(`- ${resolve(normalizedOut)}`);
    }
}
if (require.main === module) {
    main();
}
