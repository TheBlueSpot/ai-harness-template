type LeaseTrackedBackgroundRun = {
  controllerLeaseExpiresAt?: string | null;
  startedAt?: string | null;
  queuedAt: string;
};

export function isBackgroundRunPastLeaseGrace(run: LeaseTrackedBackgroundRun, now: Date, startupGraceMs: number) {
  const repairAt = resolveBackgroundRunLeaseGraceAt(run, startupGraceMs);
  return repairAt === undefined || repairAt <= now.getTime();
}

function resolveBackgroundRunLeaseGraceAt(run: LeaseTrackedBackgroundRun, startupGraceMs: number) {
  const leaseExpiresAt = Date.parse(run.controllerLeaseExpiresAt ?? "");
  if (Number.isFinite(leaseExpiresAt)) {
    return leaseExpiresAt + startupGraceMs;
  }

  const fallbackStartedAt = Date.parse(run.startedAt ?? run.queuedAt);
  return Number.isFinite(fallbackStartedAt) ? fallbackStartedAt + startupGraceMs : undefined;
}
