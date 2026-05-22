import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createAssistantAssetRefId,
  createAssistantId,
  type Assistant,
  type AssistantAssetRef,
  type BackgroundJobTemplate,
  type ModeDefinition
} from "../../shared/protocol";
import { assertResolvedAssistantAssetRefs, resolveAssistantAssetRefs } from "./assistant-capabilities";

function createAssistant(overrides: Partial<Assistant> = {}): Assistant {
  const now = new Date().toISOString();
  return {
    id: createAssistantId(),
    name: "Reviewer",
    scope: "global",
    personalityPrompt: "Be precise.",
    jobPrompt: "Review code.",
    agentId: "pi",
    runState: "active",
    bootstrapState: "completed",
    failureStreakCount: 0,
    circuitBreakerState: "closed",
    unreadQuestionCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function createAssetRef(assistantId: string, value: string, kind: AssistantAssetRef["kind"] = "skill"): AssistantAssetRef {
  return {
    id: createAssistantAssetRefId(),
    assistantId,
    kind,
    label: value,
    value,
    resolutionStatus: "resolved",
    createdAt: new Date().toISOString()
  };
}

describe("assistant capabilities", () => {
  test("resolves repo skills to canonical paths", () => {
    const repoRoot = path.join(process.cwd(), ".tmp-test-data", `assistant-cap-${crypto.randomUUID()}`);
    const skillPath = path.join(repoRoot, ".agents", "skills", "review", "SKILL.md");
    mkdirSync(path.dirname(skillPath), { recursive: true });
    writeFileSync(skillPath, "# Review\n");
    const assistant = createAssistant();

    const [resolved] = resolveAssistantAssetRefs({
      repoRoot,
      assistant,
      assetRefs: [createAssetRef(assistant.id, "review")],
      workspaceModes: [],
      projectModes: [],
      backgroundTemplates: []
    });

    expect(resolved.resolutionStatus).toBe("resolved");
    expect(resolved.provenance).toBe("repo-skill");
    expect(resolved.canonicalValue).toBe(".agents/skills/review/SKILL.md");
  });

  test("resolves global skills when a repo skill is absent", () => {
    const repoRoot = path.join(process.cwd(), ".tmp-test-data", `assistant-cap-${crypto.randomUUID()}`);
    const homeRoot = path.join(process.cwd(), ".tmp-test-data", `assistant-global-${crypto.randomUUID()}`);
    const globalRoot = path.join(homeRoot, "skills");
    mkdirSync(repoRoot, { recursive: true });
    const skillPath = path.join(globalRoot, "grill-me", "SKILL.md");
    mkdirSync(path.dirname(skillPath), { recursive: true });
    writeFileSync(skillPath, "# Grill me\n");
    const previousHome = Bun.env.AI_HARNESS_TEMPLATE_HOME;
    Bun.env.AI_HARNESS_TEMPLATE_HOME = homeRoot;
    const assistant = createAssistant();

    try {
      const [resolved] = resolveAssistantAssetRefs({
        repoRoot,
        assistant,
        assetRefs: [createAssetRef(assistant.id, "grill-me")],
        workspaceModes: [],
        projectModes: [],
        backgroundTemplates: []
      });

      expect(resolved.resolutionStatus).toBe("resolved");
      expect(resolved.provenance).toBe("global-skill");
      expect(resolved.canonicalValue).toBe(skillPath);
    } finally {
      if (previousHome === undefined) {
        delete Bun.env.AI_HARNESS_TEMPLATE_HOME;
      } else {
        Bun.env.AI_HARNESS_TEMPLATE_HOME = previousHome;
      }
    }
  });

  test("rejects missing refs and out-of-scope project modes", () => {
    const repoRoot = path.join(process.cwd(), ".tmp-test-data", `assistant-cap-${crypto.randomUUID()}`);
    mkdirSync(repoRoot, { recursive: true });
    const assistant = createAssistant();
    const projectMode: ModeDefinition = {
      id: "project-debug",
      scope: "project",
      label: "Debug",
      description: "Debug mode",
      plannerPrompt: "Plan",
      executionPrompt: "Run",
      toolPolicy: "full-access",
      executionAccess: "workspace-write",
      updatedAt: new Date().toISOString()
    };

    const resolved = resolveAssistantAssetRefs({
      repoRoot,
      assistant,
      assetRefs: [createAssetRef(assistant.id, "missing"), createAssetRef(assistant.id, "Debug", "mode")],
      workspaceModes: [],
      projectModes: [projectMode],
      backgroundTemplates: []
    });

    expect(resolved.map((assetRef) => assetRef.resolutionStatus)).toEqual(["missing", "out-of-scope"]);
    expect(() => assertResolvedAssistantAssetRefs(resolved)).toThrow(/Assistant asset/);
  });

  test("resolves background templates by id", () => {
    const repoRoot = path.join(process.cwd(), ".tmp-test-data", `assistant-cap-${crypto.randomUUID()}`);
    mkdirSync(repoRoot, { recursive: true });
    const assistant = createAssistant();
    const template: BackgroundJobTemplate = {
      id: "nightly-review",
      label: "Nightly Review",
      description: "Review nightly",
      kind: "ai-routine",
      definition: {
        kind: "ai-routine",
        prompt: "Review"
      }
    };

    const [resolved] = resolveAssistantAssetRefs({
      repoRoot,
      assistant,
      assetRefs: [createAssetRef(assistant.id, "nightly-review", "background-template")],
      workspaceModes: [],
      projectModes: [],
      backgroundTemplates: [template]
    });

    expect(resolved.resolutionStatus).toBe("resolved");
    expect(resolved.provenance).toBe("background-template");
    expect(resolved.canonicalValue).toBe("nightly-review");
  });
});
