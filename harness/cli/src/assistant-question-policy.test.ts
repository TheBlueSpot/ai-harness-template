import { describe, expect, test } from "bun:test";
import type { AssistantLearning, AssistantQuestion } from "../../shared/protocol";
import { evaluateAssistantQuestionPolicy } from "./assistant-question-policy";

const now = new Date().toISOString();

function question(overrides: Partial<AssistantQuestion>): AssistantQuestion {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    assistantId: overrides.assistantId ?? "assistant-1",
    prompt: overrides.prompt ?? "Which game should I evaluate?",
    status: overrides.status ?? "answered",
    answerText: overrides.answerText,
    linkedTodoIds: overrides.linkedTodoIds,
    askedAt: overrides.askedAt ?? now,
    answeredAt: overrides.answeredAt
  };
}

function learning(summary: string): AssistantLearning {
  return {
    id: crypto.randomUUID(),
    assistantId: "assistant-1",
    summary,
    source: "test",
    confidence: "high",
    createdAt: now
  };
}

describe("assistant question policy", () => {
  test("suppresses duplicate taste questions after do-not-ask guidance", () => {
    const decision = evaluateAssistantQuestionPolicy({
      prompt: "What makes launcher game feel good or bad to you?",
      questions: [
        question({
          prompt: "What do you usually like or dislike in launcher-style browser games?",
          answerText:
            "A good game is simple to understand and mechanics stack into a dynamic but not overwhelming experience. Please dont ask again.",
          status: "answered"
        })
      ]
    });

    expect(decision.kind).toBe("suppress");
    expect(decision.category).toBe("taste-calibration");
  });

  test("auto-answers duplicate target questions from pick-random guidance", () => {
    const decision = evaluateAssistantQuestionPolicy({
      prompt: "Which game folder or mechanic should I evaluate first?",
      questions: [
        question({
          prompt: "Which game folder should this patrol inspect?",
          answerText: "Pick a random browser-playable game unless told otherwise.",
          status: "answered"
        })
      ]
    });

    expect(decision.kind).toBe("auto-answer");
    if (decision.kind === "auto-answer") {
      expect(decision.answerText).toContain("Pick a random");
    }
  });

  test("auto-answers concrete sweep input from durable target guidance", () => {
    const decision = evaluateAssistantQuestionPolicy({
      prompt: "What should I use as the concrete sweep input for this pass?",
      questions: [
        question({
          prompt: "Which game folder should this patrol inspect?",
          answerText: "Pick a random browser-playable game unless told otherwise, use current context, and do not ask again.",
          status: "answered"
        })
      ]
    });

    expect(decision.kind).toBe("auto-answer");
    expect(decision.category).toBe("target-selection");
  });

  test("treats missing issue output text block as nonblocking target selection when learnings define target behavior", () => {
    const decision = evaluateAssistantQuestionPolicy({
      prompt: "Missing the issue output text block. What should I use as input?",
      questions: [],
      learnings: [learning("For sweep passes, pick a random browser-playable game unless told otherwise.")]
    });

    expect(decision.kind).toBe("auto-answer");
    expect(decision.category).toBe("target-selection");
  });

  test("suppresses read-only access asks when runtime is writable", () => {
    const decision = evaluateAssistantQuestionPolicy({
      prompt: "Workspace is read-only. Should I wait for write access?",
      questions: [],
      runtimeReadOnly: false
    });

    expect(decision.kind).toBe("suppress");
    expect(decision.category).toBe("access-environment");
  });

  test("asks for schedules and multiple row selection", () => {
    expect(
      evaluateAssistantQuestionPolicy({
        prompt: "What schedule should this assistant-owned job use?",
        questions: []
      }).kind
    ).toBe("ask");
    expect(
      evaluateAssistantQuestionPolicy({
        prompt: "Which todo should be updated?",
        questions: []
      }).kind
    ).toBe("ask");
  });

  test("asks for recovery and high-risk unknown work", () => {
    expect(
      evaluateAssistantQuestionPolicy({
        prompt: "Assistant paused itself after repeated failures. How should it proceed?",
        questions: []
      }).kind
    ).toBe("ask");
    expect(
      evaluateAssistantQuestionPolicy({
        prompt: "Should I permanently delete the existing production data?",
        questions: []
      }).kind
    ).toBe("ask");
  });

  test("suppresses already pending duplicates", () => {
    const decision = evaluateAssistantQuestionPolicy({
      prompt: "Which game folder should I inspect first?",
      questions: [
        question({
          prompt: "Which game folder should I inspect first?",
          status: "pending"
        })
      ]
    });

    expect(decision.kind).toBe("suppress");
  });

  test("uses learnings as durable guidance", () => {
    const decision = evaluateAssistantQuestionPolicy({
      prompt: "What do you like or dislike about launcher game feel?",
      questions: [],
      learnings: [learning("Build sticky arcade games with tight gameplay loops.")]
    });

    expect(decision.kind).toBe("suppress");
  });
});
