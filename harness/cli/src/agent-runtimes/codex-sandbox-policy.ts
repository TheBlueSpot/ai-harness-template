export type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";

export function resolveCodexSandboxMode(input: {
  readOnly?: boolean;
  platform?: NodeJS.Platform;
}): CodexSandboxMode {
  if (input.readOnly) {
    return "read-only";
  }

  return (input.platform ?? process.platform) === "win32" ? "danger-full-access" : "workspace-write";
}
