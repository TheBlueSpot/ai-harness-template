/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createChatMessage } from "../../../shared/protocol";
import { createEmptyAssistantsState, type HarnessViewState } from "../harness-store";
import { toastStore } from "../toast-store";
import { createUiTest } from "../utils/tests/test-harness";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
import { AssistantsPanel } from "./assistants-panel";

createUiTest("AssistantsPanel", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("renders copy buttons for assistant chat messages", async () => {
    let copiedText = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          copiedText = value;
        }
      }
    });

    const now = new Date().toISOString();
    const project = createViewProjectFixture({
      id: "project-assistant-copy"
    });
    const assistantId = "assistant-1";
    const assistants = createEmptyAssistantsState();
    const state: Partial<HarnessViewState> = createHarnessStateFixture({
      workspace: {
        activeProjectId: project.id,
        projects: [project]
      },
      assistants: {
        ...assistants,
        assistants: [
          {
            id: assistantId,
            name: "Repo helper",
            scope: "project",
            projectId: project.id,
            description: "Handles repo tasks",
            personalityPrompt: "Be helpful",
            jobPrompt: "Do repo work",
            agentId: "pi",
            modeId: "implement",
            executionModelId: "openai/gpt-5.4",
            runState: "active",
            bootstrapState: "completed",
            failureStreakCount: 0,
            circuitBreakerState: "closed",
            unreadQuestionCount: 0,
            createdAt: now,
            updatedAt: now
          }
        ],
        threads: [
          {
            id: "assistant-thread-1",
            assistantId,
            sessionId: "assistant-session-1",
            messageCount: 2,
            messages: [createChatMessage("user", "Need status"), createChatMessage("assistant", "Status ready")],
            updatedAt: now
          }
        ],
        selectedAssistantId: assistantId,
        streamingByAssistantId: {
          [assistantId]: "Streaming status"
        }
      }
    });
    seedHarnessStoreForTests(state);

    render(() => <AssistantsPanel />);

    expect(screen.getByRole("button", { name: "Copy user message" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Copy assistant message" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Copy streaming assistant message" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Copy assistant message" }));
    await Promise.resolve();

    expect(copiedText).toBe("Status ready");
    expect(toastStore.toasts[0]?.title).toBe("Message copied");
  });
});
