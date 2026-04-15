/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { ChatPanel } from "./chat-panel";
import { harnessStore } from "../harness-store";
import { toastStore } from "../toast-store";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import {
  createExecutionPlanFixture,
  createHarnessStateFixture,
  createPlanSummaryMessage,
  createRunFixture,
  createViewProjectFixture
} from "../utils/tests/test-fixtures";
import { createChatMessage } from "../../../shared/protocol";

createUiTest("ChatPanel", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("submits planner answers when a planning question is pending", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-question",
      draft: "api/users/[id]",
      activeRun: createRunFixture({
        id: "run-question",
        status: "awaiting-user-input",
        questions: [
          {
            id: "question-1",
            prompt: "Which route?",
            placeholder: "api/users/[id]",
            choices: [
              {
                id: "choice-1",
                label: "API route",
                description: "Use API route",
                answerText: "api/users/[id]",
                recommended: true
              },
              {
                id: "choice-2",
                label: "Web route",
                description: "Use page route",
                answerText: "users/[id]",
                recommended: false
              },
              {
                id: "choice-3",
                label: "Custom",
                description: "Type custom route",
                answerText: "custom route",
                recommended: false
              }
            ],
            required: true,
            status: "pending",
            askedAt: new Date().toISOString()
          }
        ]
      })
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel sendCommand={(command) => commands.push(command)} />);
    fireEvent.click(screen.getByRole("button", { name: "Send planner answer" }));

    expect(commands.length).toBe(1);
    expect((commands[0] as { type: string }).type).toBe("planning.answer");
  });

  it("submits plan refinements when a ready run exists", () => {
    const commands: unknown[] = [];
    const plan = createExecutionPlanFixture({
      gating: {
        mode: "approve",
        delaySeconds: 0
      }
    });
    const project = createViewProjectFixture({
      id: "project-ready",
      draft: "make it runnable",
      activeRun: createRunFixture({
        id: "run-ready",
        status: "ready",
        plan
      }),
      latestPlan: {
        sessionId: "session-1",
        agentId: "pi",
        planningModelId: "openai/gpt-5.4",
        difficultyScore: 20,
        usesSubagents: false,
        executionModelId: "openai/gpt-5.4",
        subtaskCount: 0,
        executionPlan: plan
      }
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel sendCommand={(command) => commands.push(command)} />);
    fireEvent.click(screen.getByRole("button", { name: "Refine plan before execution" }));

    expect(commands.length).toBe(1);
    expect((commands[0] as { type: string }).type).toBe("planning.refine");
  });

  it("blocks plain submit for resumable runs and shows toast", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-resume",
      draft: "please continue",
      activeRun: createRunFixture({
        id: "run-resume",
        status: "partial-complete",
        resumable: true,
        subtasks: []
      })
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel sendCommand={(command) => commands.push(command)} />);
    const textbox = screen.getByRole("textbox");
    const form = textbox.closest("form");
    if (!form) {
      throw new Error("Expected chat form");
    }

    fireEvent.submit(form);
    expect(commands.length).toBe(0);
    expect(toastStore.toasts[0]?.title).toBe("Resume required");
  });

  it("submits top-level chat sends for plain drafts", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-send",
      draft: "simple task"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        hasUsableApiKey: true,
        hasUsableOpenAiApiKey: true,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel sendCommand={(command) => commands.push(command)} />);
    fireEvent.click(screen.getByRole("button", { name: "Send task to pi" }));

    expect(commands.length).toBe(1);
    expect((commands[0] as { type: string }).type).toBe("chat.send");
  });

  it("sends resume and retry commands when the thread is idle", () => {
    const commands: unknown[] = [];
    const resumableRun = createRunFixture({
      id: "run-active",
      status: "partial-complete",
      resumable: true,
      retryable: true
    });
    const retryRun = createRunFixture({
      id: "run-last",
      status: "completed",
      retryable: true,
      completedAt: new Date().toISOString()
    });
    const project = createViewProjectFixture({
      id: "project-actions",
      draft: "extra guidance",
      activeRun: resumableRun,
      lastRun: retryRun
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel sendCommand={(command) => commands.push(command)} />);

    fireEvent.click(screen.getByRole("button", { name: "Resume failed or pending subagents" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry last pi run" }));

    expect(commands.map((command) => (command as { type: string }).type)).toEqual(["run.resume", "run.retry"]);
  });

  it("sends stop commands when the thread is streaming", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({
      id: "project-stop",
      session: {
        ...createViewProjectFixture().session,
        isStreaming: true,
        messages: []
      }
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel sendCommand={(command) => commands.push(command)} />);
    fireEvent.click(screen.getByRole("button", { name: "Stop active run" }));

    expect(commands.map((command) => (command as { type: string }).type)).toEqual(["chat.stop"]);
  });

  it("shows streaming assistant text only when a stream exists", () => {
    const project = createViewProjectFixture({
      id: "project-stream",
      streamingAssistantText: "# Partial output"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel sendCommand={() => undefined} />);
    expect(screen.getByText("assistant (streaming)")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Partial output" })).not.toBeNull();

    const clearedProject = createViewProjectFixture({
      ...project,
      streamingAssistantText: ""
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: clearedProject.id,
          projects: [clearedProject]
        }
      })
    );
    harnessStore.replaceStateForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: clearedProject.id,
          projects: [clearedProject]
        }
      })
    );
    cleanup();
    render(() => <ChatPanel sendCommand={() => undefined} />);
    expect(screen.queryByText("assistant (streaming)")).toBeNull();
  });

  it("renders streamed markdown content from chat.delta state", async () => {
    const project = createViewProjectFixture({
      id: "project-stream-delta",
      session: {
        ...createViewProjectFixture().session,
        messages: []
      }
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel sendCommand={() => undefined} />);
    harnessStore.applyServerEvent({
      type: "chat.delta",
      requestId: "req-stream-delta",
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        sessionId: project.session.sessionId,
        delta: "```ts\nconst streamed = true;\n```"
      }
    });

    cleanup();
    render(() => <ChatPanel sendCommand={() => undefined} />);
    expect(screen.getByRole("button", { name: "Copy code block" })).not.toBeNull();
    expect(document.querySelector(".markdown-code-content")?.textContent).toContain("const streamed = true;");
  });

  it("renders transcript markdown instead of raw plain text", () => {
    const project = createViewProjectFixture({
      id: "project-markdown",
      session: {
        ...createViewProjectFixture().session,
        messages: [createChatMessage("assistant", "Use **bold** and [docs](https://example.com).")]
      }
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel sendCommand={() => undefined} />);
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "docs" }).getAttribute("target")).toBe("_blank");
  });

  it("stops treating the thread as streaming after chat.message-appended resets isStreaming", () => {
    const commands: unknown[] = [];
    const plan = createExecutionPlanFixture({
      runId: "run-ready",
      gating: {
        mode: "approve",
        delaySeconds: 0
      }
    });
    const project = createViewProjectFixture({
      id: "project-followup",
      draft: "make it runnable",
      session: {
        ...createViewProjectFixture().session,
        isStreaming: true,
        messages: []
      },
      activeRun: createRunFixture({
        id: "run-ready",
        status: "ready",
        plan
      }),
      latestPlan: {
        sessionId: "session-1",
        agentId: "pi",
        planningModelId: "openai/gpt-5.4",
        difficultyScore: 20,
        usesSubagents: false,
        executionModelId: "openai/gpt-5.4",
        subtaskCount: 0,
        executionPlan: plan
      }
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ChatPanel sendCommand={(command) => commands.push(command)} />);
    expect((screen.getByRole("button", { name: "Refine plan before execution" }) as HTMLButtonElement).disabled).toBe(true);

    harnessStore.applyServerEvent({
      type: "chat.message-appended",
      requestId: "req-followup",
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        sessionId: project.session.sessionId,
        message: createPlanSummaryMessage("run-ready", plan),
        state: {
          ...project.session,
          messages: [...project.session.messages, createPlanSummaryMessage("run-ready", plan)],
          isStreaming: false
        }
      }
    });

    cleanup();
    render(() => <ChatPanel sendCommand={(command) => commands.push(command)} />);
    expect(harnessStore.state.workspace.projects[0]?.session.isStreaming).toBe(false);
    expect((screen.getByRole("button", { name: "Refine plan before execution" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Refine plan before execution" }));
    expect((commands[0] as { type: string }).type).toBe("planning.refine");
  });
});
