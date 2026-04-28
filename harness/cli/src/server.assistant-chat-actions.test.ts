import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("server assistant chat action wiring", () => {
  const serverSource = readFileSync(path.join(import.meta.dir, "server.ts"), "utf8");

  test("chat.send resolves assistant actions before planner flow", () => {
    expect(serverSource).toContain("resolveAssistantChatAction({");
    expect(serverSource).toContain("executeAssistantChatAction({");
    const actionIndex = serverSource.indexOf("resolveAssistantChatAction({");
    const plannerRunIndex = serverSource.indexOf("const runProject = repository.createAgentRun(", actionIndex);
    expect(actionIndex).toBeLessThan(plannerRunIndex);
  });

  test("assistant action clarification persists typed planning intent", () => {
    expect(serverSource).toContain("assistant-action-intent");
    expect(serverSource).toContain("createAssistantActionIntentQuestion");
  });

  test("project-chat assistant work resumes paused assistants before launch gate", () => {
    expect(serverSource).toContain("ensureAssistantActiveForProjectChat");
    expect(serverSource.indexOf("ensureAssistantActiveForProjectChat(repository, assistant.id, input.connections);")).toBeLessThan(
      serverSource.indexOf("assertAssistantRunnableForLaunch(repository, assistant.id);")
    );
  });

  test("circuit breaker retry bypasses runnable launch gate", () => {
    expect(serverSource).toContain('case "assistant.circuit-breaker.retry"');
    const retryCaseIndex = serverSource.indexOf('case "assistant.circuit-breaker.retry"');
    const nextCaseIndex = serverSource.indexOf('case "assistant.chat.send"', retryCaseIndex);
    const retryCase = serverSource.slice(retryCaseIndex, nextCaseIndex);
    expect(retryCase).toContain("assistantManager.recoverAssistant");
    expect(retryCase).not.toContain("assertAssistantRunnableForLaunch");
  });

  test("startup cleans stale assistant questions before syncing inbox notifications", () => {
    expect(serverSource).toContain("cleanupStaleAssistantQuestions");
    const cleanupIndex = serverSource.indexOf("assistantManager.cleanupStaleAssistantQuestions();");
    const syncIndex = serverSource.indexOf("syncAssistantQuestionNotifications(repository);", cleanupIndex);
    expect(cleanupIndex).toBeGreaterThan(-1);
    expect(cleanupIndex).toBeLessThan(syncIndex);
  });
});
