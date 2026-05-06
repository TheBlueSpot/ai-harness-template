function normalizeCoverage(claimGuardrail) {
    return claimGuardrail?.coverageGate ?? claimGuardrail?.coverage;
}
function normalizeList(values, fallback) {
    if (!values || values.length === 0) {
        return [fallback];
    }
    return values;
}
export function getStarterCoverageStatus(data) {
    return normalizeCoverage(data.claimGuardrail)?.status;
}
export function getStarterNextEvidence(data) {
    return normalizeList(data.claimGuardrail?.nextEvidence, "none");
}
export function buildStarterGuardrailSection(data) {
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
