type CoverageStatus = "ready" | "partial" | "missing";

type CoverageGate = {
  status?: CoverageStatus;
  reasons?: string[];
};

export type EvidenceSufficiency = {
  directness?: "strong" | "mixed" | "weak";
  scope?: string[];
  gaps?: string[];
  claimCeiling?: string;
};

export type ClaimGuardrail = {
  label?: string;
  coverageGate?: CoverageGate;
  coverage?: CoverageGate;
  allowedClaims?: string[];
  blockedClaims?: string[];
  nextEvidence?: string[];
};

export type StarterGuardrailCarrier = {
  evidenceSufficiency?: EvidenceSufficiency;
  claimGuardrail?: ClaimGuardrail;
};

function normalizeCoverage(claimGuardrail: ClaimGuardrail | undefined): CoverageGate | undefined {
  return claimGuardrail?.coverageGate ?? claimGuardrail?.coverage;
}

function normalizeList(values: string[] | undefined, fallback: string): string[] {
  if (!values || values.length === 0) {
    return [fallback];
  }
  return values;
}

export function getStarterCoverageStatus(data: StarterGuardrailCarrier): CoverageStatus | undefined {
  return normalizeCoverage(data.claimGuardrail)?.status;
}

export function getStarterNextEvidence(data: StarterGuardrailCarrier): string[] {
  return normalizeList(data.claimGuardrail?.nextEvidence, "none");
}

export function buildStarterGuardrailSection(data: StarterGuardrailCarrier): string[] {
  if (!data.evidenceSufficiency && !data.claimGuardrail) {
    return ["- No starter guardrail metadata supplied. Audit scope depends only on the local observation file."];
  }

  const sufficiency = data.evidenceSufficiency;
  const claimGuardrail = data.claimGuardrail;
  const coverage = normalizeCoverage(claimGuardrail);

  return [
    `- Coverage gate: ${coverage?.status ?? "unknown"}.`,
    `- Coverage gaps or reasons: ${normalizeList(coverage?.reasons, "none").join(" | ")}.`,
    `- Directness: ${sufficiency?.directness ?? "unknown"}.`,
    `- Covered contexts: ${normalizeList(sufficiency?.scope, "none").join(" | ")}.`,
    `- Missing contexts: ${normalizeList(sufficiency?.gaps, "none").join(" | ")}.`,
    `- Claim ceiling: ${sufficiency?.claimCeiling ?? "none supplied"}.`,
    `- Allowed claims: ${normalizeList(claimGuardrail?.allowedClaims, "none supplied").join(" | ")}.`,
    `- Blocked claims: ${normalizeList(claimGuardrail?.blockedClaims, "none supplied").join(" | ")}.`,
    `- Next evidence: ${normalizeList(claimGuardrail?.nextEvidence, "none").join(" | ")}.`,
  ];
}
