type CoverageStatus = "ready" | "partial" | "missing";

type CoverageCheck = {
  label: string;
  status: CoverageStatus;
  reasons: string[];
};

type EvidenceSufficiency = {
  directness: "strong" | "mixed" | "weak";
  scope: string[];
  gaps: string[];
  claimCeiling: string;
};

type Finding = {
  severity: "blocker" | "major" | "minor";
  title: string;
  evidence: string;
};

type IncidentObservation = {
  incidentTag?: string;
  repeatedCount?: number;
  impact?: "low" | "medium" | "high";
  persistence?: "one-off" | "repeatable" | "constant";
};

function scopeList(scope: string[]): string {
  return scope.length > 0 ? scope.join(", ") : "partial session scope";
}

export function buildDurableLearning(
  findings: Finding[],
  coverage: CoverageCheck[],
  sufficiency: EvidenceSufficiency,
  incidents: IncidentObservation[] = [],
): string {
  const topFinding = findings[0];
  const partialOrMissing = coverage.filter((check) => check.status !== "ready");
  const topIncident = [...incidents].sort((left, right) => {
    const repeatDelta = (right.repeatedCount ?? 0) - (left.repeatedCount ?? 0);
    if (repeatDelta !== 0) {
      return repeatDelta;
    }

    const impactOrder = { high: 0, medium: 1, low: 2, undefined: 3 } as const;
    const impactDelta = impactOrder[left.impact ?? "undefined"] - impactOrder[right.impact ?? "undefined"];
    if (impactDelta !== 0) {
      return impactDelta;
    }

    const persistenceOrder = { constant: 0, repeatable: 1, "one-off": 2, undefined: 3 } as const;
    return (
      persistenceOrder[left.persistence ?? "undefined"] -
      persistenceOrder[right.persistence ?? "undefined"]
    );
  })[0];

  if ((topIncident?.repeatedCount ?? 0) > 1) {
    return "- Shared playtest capture should save repeated incident tags into repo-local Kojima memory, because repeat count plus impact shows which browser-play failure keeps resurfacing across onboarding, HUD, pacing, or failure reviews.";
  }

  if (topFinding?.title === "overlapping urgent signals lose dominant read") {
    return "- Shared playtest capture should save cue-competition evidence into repo-local Kojima memory, because unreadable overlap can look like generic HUD clutter unless later audits inherit the exact pressure moment.";
  }

  if (topFinding?.title === "critical cue depends on one fragile channel") {
    return "- Shared playtest capture should save cue-channel fallback evidence into repo-local Kojima memory, because color-only or audio-only warnings can look readable in one session while still failing real browser-play conditions.";
  }

  if (topFinding?.title === "resume after interruption loses actionable context") {
    return "- Shared playtest capture should save interruption-resume evidence into repo-local Kojima memory, because first-run notes alone miss whether players can recover goal, controls, and next action after a short break.";
  }

  if (topFinding?.title === "core probe only held together under high workload") {
    return "- Shared playtest capture should save lightweight probe workload into repo-local Kojima memory, because a browser-game beat can technically succeed while still feeling too mentally loaded or rushed to support sticky play.";
  }

  if (
    topFinding?.title === "failure state weakens next-attempt learning" ||
    topFinding?.title === "failure sample shows chain punishment before control fully returns" ||
    topFinding?.title === "retry sample does not preserve a stable lesson"
  ) {
    return "- Shared playtest capture should save fail-retry evidence into repo-local Kojima memory, because restart speed alone does not show whether death reads clearly or whether the same lesson survives the retry.";
  }

  if (topFinding?.title === "mechanic stack spikes before response chain stays readable") {
    return "- Shared playtest capture should save stack-pressure evidence into repo-local Kojima memory, because sticky arcade pacing fails when fresh demands pile up before the response chain stays legible.";
  }

  if (topFinding?.title === "critical temporary information can vanish before the player can recover it") {
    return "- Shared playtest capture should save temporary-prompt recovery evidence into repo-local Kojima memory, because readable text still fails this catalog when it disappears before players can recheck it.";
  }

  if (partialOrMissing.length > 0) {
    return `- Shared playtest capture should save sampled scope and claim ceilings into repo-local Kojima memory, because ${scopeList(sufficiency.scope)} still leaves ${partialOrMissing.map((check) => check.label).join(", ")} only partially proven.`;
  }

  if (sufficiency.directness !== "strong") {
    return "- Shared playtest capture should save evidence directness into repo-local Kojima memory, because mixed or inferred samples are useful for triage but not for strong feel claims across this catalog.";
  }

  return "- Shared playtest capture should save one session-derived learning into repo-local Kojima memory, because the strongest reusable arcade read should survive alongside the starter files instead of disappearing into terminal history.";
}
