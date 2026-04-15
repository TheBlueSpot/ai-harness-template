/** @jsxImportSource solid-js */
import { beforeEach, expect, it, mock } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createExecutionPlanFixture, createHarnessStateFixture, createRunFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
import { toastStore } from "../toast-store";

let uploadInvocationCount = 0;

const uploadedFiles = [
  {
    name: "brief.docx",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: 1024,
    key: "brief-docx",
    lastModified: 1234,
    url: "https://example.com/brief.docx",
    serverData: {
      url: "https://example.com/brief.docx",
      key: "brief-docx",
      uploadedAt: new Date().toISOString()
    }
  }
];

mock.module("../lib/uploadthing", () => ({
  uploadFiles: async () => {
    uploadInvocationCount += 1;
    return uploadedFiles;
  }
}));

import { ChatPanel } from "./chat-panel";

createUiTest("ChatPanel attachment guardrails", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
    cleanup();
    toastStore.toasts.length = 0;
    uploadInvocationCount = 0;
  });

  it("keeps attachments blocked during plan refinement", async () => {
    const commands: unknown[] = [];
    const plan = createExecutionPlanFixture({
      gating: {
        mode: "approve",
        delaySeconds: 0
      }
    });
    const project = createViewProjectFixture({
      id: "project-ready-attachments",
      draft: "tighten plan",
      activeRun: createRunFixture({
        id: "run-ready-attachments",
        status: "ready",
        plan
      }),
      latestPlan: {
        sessionId: "session-1",
        agentId: "pi",
        planningModelId: "openai/gpt-5.4",
        difficultyScore: 18,
        usesSubagents: false,
        executionModelId: "openai/gpt-5.4",
        subtaskCount: 0,
        executionPlan: plan
      }
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        attachmentsEnabled: true,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    const rendered = render(() => <ChatPanel sendCommand={(command) => commands.push(command)} />);
    const input = rendered.container.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (!input) {
      throw new Error("Expected attachment input");
    }

    const file = new File(["docx"], "brief.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file]
    });
    fireEvent.change(input, {
      target: input,
      currentTarget: input
    });

    await waitFor(() => {
      expect(uploadInvocationCount).toBe(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Refine plan before execution" }));

    expect(commands).toHaveLength(0);
    expect(toastStore.toasts[0]?.title).toBe("Attachments not supported here");
  });
});
