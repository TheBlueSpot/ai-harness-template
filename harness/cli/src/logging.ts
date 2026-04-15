type LogFields = Record<string, string | number | boolean | undefined>;

export function isDebugEnabled() {
  return Bun.env.HARNESS_DEBUG === "1";
}

export function debugLog(event: string, fields: LogFields = {}) {
  if (!isDebugEnabled()) {
    return;
  }

  console.log(
    JSON.stringify({
      scope: "harness",
      level: "debug",
      event,
      ...fields
    })
  );
}
