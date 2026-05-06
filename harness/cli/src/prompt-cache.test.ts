import { describe, expect, test } from "bun:test";
import { buildPromptCacheKey, buildWorkspaceConfigHash, extractCachedInputTokens } from "./prompt-cache";

describe("prompt cache helpers", () => {
  test("builds stable cache keys independent of object key order", () => {
    const left = buildPromptCacheKey({
      projectId: "project-1",
      workspaceConfigHash: "hash-a"
    });
    const right = buildPromptCacheKey({
      workspaceConfigHash: "hash-a",
      projectId: "project-1"
    });

    expect(left).toBe(right);
    expect(left).toStartWith("harness:v1:");
  });

  test("workspace config hash excludes dynamic thread text", () => {
    const base = {
      projectId: "project-1",
      projectRootPath: "C:/repo",
      providerBrand: "gpt" as const,
      memoryBankEnabledDefault: true
    };

    expect(buildWorkspaceConfigHash(base)).toBe(buildWorkspaceConfigHash({ ...base }));
    expect(buildWorkspaceConfigHash(base)).not.toBe(buildWorkspaceConfigHash({ ...base, providerBrand: "gemini" }));
  });

  test("extracts cached read tokens from session stats", () => {
    expect(
      extractCachedInputTokens({
        sessionFile: undefined,
        sessionId: "session-1",
        userMessages: 1,
        assistantMessages: 1,
        toolCalls: 0,
        toolResults: 0,
        totalMessages: 2,
        tokens: {
          input: 10,
          output: 5,
          cacheRead: 7,
          cacheWrite: 0,
          total: 15
        },
        cost: 0
      })
    ).toBe(7);
  });
});
