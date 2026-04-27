import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import type {
  Assistant,
  AssistantAssetRef,
  AssistantAssetRefProvenance,
  AssistantAssetRefScope,
  BackgroundJobTemplate,
  ModeDefinition
} from "../../shared/protocol";

type ResolveAssistantAssetRefsInput = {
  repoRoot: string;
  assistant: Assistant;
  assetRefs: AssistantAssetRef[];
  workspaceModes: ModeDefinition[];
  projectModes: ModeDefinition[];
  backgroundTemplates: BackgroundJobTemplate[];
};

type CapabilityResolution = Pick<
  AssistantAssetRef,
  "canonicalValue" | "scope" | "provenance" | "resolutionStatus" | "resolutionError"
>;

export function resolveAssistantAssetRefs(input: ResolveAssistantAssetRefsInput) {
  return input.assetRefs.map((assetRef) => ({
    ...assetRef,
    assistantId: input.assistant.id,
    ...resolveAssistantAssetRef(input, assetRef)
  }));
}

export function assertResolvedAssistantAssetRefs(assetRefs: AssistantAssetRef[]) {
  const unresolved = assetRefs.find((assetRef) => assetRef.resolutionStatus !== "resolved");
  if (!unresolved) {
    return;
  }

  throw new Error(`Assistant asset ${unresolved.label} is ${unresolved.resolutionStatus}: ${unresolved.resolutionError ?? unresolved.value}`);
}

function resolveAssistantAssetRef(input: ResolveAssistantAssetRefsInput, assetRef: AssistantAssetRef): CapabilityResolution {
  switch (assetRef.kind) {
    case "skill":
      return resolveRepoFileCapability(input.repoRoot, assetRef.value, ".agents/skills", "repo-skill", "workspace");
    case "script":
      return resolveRepoFileCapability(input.repoRoot, assetRef.value, "scripts", "repo-script", "workspace");
    case "mode":
      return resolveModeCapability(input, assetRef);
    case "background-template":
      return resolveBackgroundTemplateCapability(input.backgroundTemplates, assetRef.value);
  }
}

function resolveRepoFileCapability(
  repoRoot: string,
  value: string,
  rootRelativeDirectory: string,
  provenance: AssistantAssetRefProvenance,
  scope: AssistantAssetRefScope
): CapabilityResolution {
  const candidates = buildRepoFileCandidates(repoRoot, rootRelativeDirectory, value);
  for (const candidate of candidates) {
    const resolved = resolveInsideRepo(repoRoot, candidate);
    if (!resolved.inRepo) {
      return {
        scope,
        provenance,
        resolutionStatus: "out-of-scope",
        resolutionError: `Path escapes repository: ${value}`
      };
    }
    if (resolved.realPath && existsSync(resolved.realPath)) {
      return {
        canonicalValue: toRepoRelativePath(repoRoot, resolved.realPath),
        scope,
        provenance,
        resolutionStatus: "resolved"
      };
    }
  }

  return {
    scope,
    provenance,
    resolutionStatus: "missing",
    resolutionError: `No ${provenance} found for ${value}`
  };
}

function resolveModeCapability(input: ResolveAssistantAssetRefsInput, assetRef: AssistantAssetRef): CapabilityResolution {
  const projectMode = input.projectModes.find((mode) => mode.id === assetRef.value || mode.label === assetRef.value);
  if (projectMode) {
    if (input.assistant.scope !== "project") {
      return {
        canonicalValue: projectMode.id,
        scope: "project",
        provenance: "project-mode",
        resolutionStatus: "out-of-scope",
        resolutionError: "Project modes require a project-scoped assistant"
      };
    }
    return {
      canonicalValue: projectMode.id,
      scope: "project",
      provenance: "project-mode",
      resolutionStatus: "resolved"
    };
  }

  const workspaceMode = input.workspaceModes.find((mode) => mode.id === assetRef.value || mode.label === assetRef.value);
  if (workspaceMode) {
    return {
      canonicalValue: workspaceMode.id,
      scope: "workspace",
      provenance: "workspace-mode",
      resolutionStatus: "resolved"
    };
  }

  return {
    resolutionStatus: "missing",
    resolutionError: `No mode found for ${assetRef.value}`
  };
}

function resolveBackgroundTemplateCapability(
  templates: BackgroundJobTemplate[],
  value: string
): CapabilityResolution {
  const template = templates.find((entry) => entry.id === value || entry.label === value);
  if (!template) {
    return {
      provenance: "background-template",
      scope: "workspace",
      resolutionStatus: "missing",
      resolutionError: `No background template found for ${value}`
    };
  }

  return {
    canonicalValue: template.id,
    provenance: "background-template",
    scope: "workspace",
    resolutionStatus: "resolved"
  };
}

function buildRepoFileCandidates(repoRoot: string, rootRelativeDirectory: string, value: string) {
  const trimmed = value.trim();
  const direct = path.isAbsolute(trimmed) ? trimmed : path.join(repoRoot, trimmed);
  const byName =
    rootRelativeDirectory === ".agents/skills"
      ? path.join(repoRoot, rootRelativeDirectory, trimmed, "SKILL.md")
      : path.join(repoRoot, rootRelativeDirectory, trimmed);
  return [direct, byName];
}

function resolveInsideRepo(repoRoot: string, candidatePath: string) {
  const normalizedRepoRoot = realpathSync(repoRoot);
  const normalizedCandidate = path.resolve(candidatePath);
  const relative = path.relative(normalizedRepoRoot, normalizedCandidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { inRepo: false, realPath: undefined };
  }

  return {
    inRepo: true,
    realPath: existsSync(normalizedCandidate) ? realpathSync(normalizedCandidate) : normalizedCandidate
  };
}

function toRepoRelativePath(repoRoot: string, value: string) {
  return path.relative(realpathSync(repoRoot), value).replace(/\\/g, "/");
}
