/** @jsxImportSource solid-js */
import { beforeEach, expect, it, mock } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
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
let uploadFilesImpl: () => Promise<typeof uploadedFiles>;

mock.module("../lib/uploadthing", () => ({
  uploadFiles: async () => {
    uploadInvocationCount += 1;
    return uploadFilesImpl();
  }
}));

import { ChatPanel } from "./chat-panel";

createUiTest("ChatPanel attachment guardrails", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
    cleanup();
    toastStore.toasts.length = 0;
    uploadInvocationCount = 0;
    uploadFilesImpl = async () => uploadedFiles;
  });

  it("blocks Enter submit while attachments are uploading", async () => {
    const commands: unknown[] = [];
    let finishUpload!: () => void;
    uploadFilesImpl = () =>
      new Promise((resolve) => {
        finishUpload = () => resolve(uploadedFiles);
      });
    const project = createViewProjectFixture({
      id: "project-uploading-enter",
      draft: "use file"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        attachmentsEnabled: true,
        hasUsableApiKey: true,
        hasUsableOpenAiApiKey: true,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    captureDispatchedCommands(commands as never[]);
    const rendered = render(() => <ChatPanel />);
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

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(commands).toHaveLength(0);
    expect(toastStore.toasts[0]?.description).toBe("Wait for attachments to finish uploading before sending.");
    finishUpload();
  });

  it("restores persisted draft attachment chips", async () => {
    const project = createViewProjectFixture({
      id: "project-attachment-restore"
    });
    localStorage.setItem(
      `ai-harness:chat-draft:v2:${project.id}:${project.activeThreadId}`,
      JSON.stringify({
        version: 2,
        attachments: [
          {
            id: "restored-1",
            kind: "document",
            documentType: "pdf",
            name: "restored.pdf",
            mimeType: "application/pdf",
            sizeBytes: 100,
            url: "https://example.com/restored.pdf",
            key: "restored-key",
            uploadedAt: new Date().toISOString()
          }
        ]
      })
    );
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        attachmentsEnabled: true,
        hasUsableApiKey: true,
        hasUsableOpenAiApiKey: true,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel />);

    expect(await screen.findByText("restored.pdf")).not.toBeNull();
  });
});
