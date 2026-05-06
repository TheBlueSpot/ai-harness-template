export type EvidenceSufficiency = "insufficient" | "partial" | "sufficient";

export type ClaimGuardrail = {
  claim: string;
  evidence: string[];
  sufficiency: EvidenceSufficiency;
  nextEvidence: string[];
};

export type StarterGuardrailCarrier = {
  title: string;
  summary: string;
  claims: ClaimGuardrail[];
};

type CoverageInput = {
  observed: string[];
  required: string[];
};

export function getStarterCoverageStatus(input: CoverageInput): EvidenceSufficiency {
  const matched = input.required.filter((item) => input.observed.includes(item)).length;
  if (matched === 0) {
    return "insufficient";
  }
  if (matched < input.required.length) {
    return "partial";
  }
  return "sufficient";
}

export function getStarterNextEvidence(input: CoverageInput): string[] {
  return input.required.filter((item) => !input.observed.includes(item));
}

export function buildStarterGuardrailSection(carrier: StarterGuardrailCarrier): string {
  const lines = ["## Starter Guardrails", "", `- ${carrier.title}: ${carrier.summary}`];
  for (const claim of carrier.claims) {
    lines.push(`- Claim: ${claim.claim}`);
    lines.push(`  - Coverage: ${claim.sufficiency}`);
    if (claim.evidence.length > 0) {
      lines.push(`  - Evidence: ${claim.evidence.join("; ")}`);
    }
    if (claim.nextEvidence.length > 0) {
      lines.push(`  - Next evidence: ${claim.nextEvidence.join("; ")}`);
    }
  }
  return lines.join("\n");
}
