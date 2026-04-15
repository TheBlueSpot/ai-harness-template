import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  PiAgentAdapter,
  PiAgentExecutionController,
  PiAgentPromptRequest,
  PiAgentPromptResult
} from "./pi-agent-adapter";
import { startHarnessServer } from "./server";
import { WorkspaceRepository } from "./workspace-repository";

class FakePiAgentAdapter implements PiAgentAdapter {
  readonly calls: PiAgentPromptRequest[] = [];
  private readonly retryTracker = new Set<string>();
  private readonly subagentCallCounts = new Map<string, number>();
  private readonly apiKeys: Record<"openai" | "google", string | undefined> = {
    openai: undefined,
    google: undefined
  };

  setApiKey(provider: "openai" | "google", apiKey: string | undefined) {
    this.apiKeys[provider] = apiKey;
  }

  hasApiKey(provider: "openai" | "google") {
    return Boolean(this.apiKeys[provider]);
  }

  async runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    this.calls.push(request);
    const withUsage = (text: string): PiAgentPromptResult => ({
      text,
      contextUsage: {
        tokens: request.kind === "planner" ? 1200 : request.kind === "subagent" ? 800 : 2400,
        contextWindow: 200000,
        usagePercent: request.kind === "planner" ? 0.6 : request.kind === "subagent" ? 0.4 : 1.2,
        sessionStats: {
          sessionFile: undefined,
          sessionId: crypto.randomUUID(),
          userMessages: 1,
          assistantMessages: 1,
          toolCalls: 0,
          toolResults: 0,
          totalMessages: 2,
          tokens: {
            input: 100,
            output: 200,
            cacheRead: 0,
            cacheWrite: 0,
            total: 300
          },
          cost: 0,
          contextUsage: {
            tokens: request.kind === "planner" ? 1200 : request.kind === "subagent" ? 800 : 2400,
            contextWindow: 200000,
            percent: request.kind === "planner" ? 0.6 : request.kind === "subagent" ? 0.4 : 1.2
          }
        }
      }
    });

    if (request.kind === "planner") {
      if (request.prompt.includes("needs clarification")) {
        if (request.prompt.includes("Prior planning Q/A:\n(none)")) {
          return withUsage(
            JSON.stringify({
              type: "question",
              summary: "Need one detail before planning",
              question: {
                id: "question-1",
                prompt: "Which route should handle this?",
                placeholder: "api/users/[id]",
                choices: [
                  {
                    id: "choice-1",
                    label: "API route",
                    description: "Use provided API route.",
                    answerText: "api/users/[id]",
                    recommended: true
                  },
                  {
                    id: "choice-2",
                    label: "Web route",
                    description: "Use page route.",
                    answerText: "users/[id]",
                    recommended: false
                  },
                  {
                    id: "choice-3",
                    label: "Custom",
                    description: "Type custom route.",
                    answerText: "custom route",
                    recommended: false
                  }
                ],
                required: true
              }
            })
          );
        }

        return withUsage(
          JSON.stringify({
            type: "ready",
            difficultyScore: 20,
            summary: "Single-step execution after clarification",
            executionModelId: "openai/gpt-5.4",
            usesSubagents: false,
            subtasks: [],
            finalExecutionBrief: "single-step request"
          })
        );
      }

      if (request.prompt.includes("resume task")) {
        return withUsage(
          JSON.stringify({
            type: "ready",
            difficultyScore: 72,
            summary: "Split into two tasks with one risky patch",
            executionModelId: "openai/gpt-5.4",
            usesSubagents: true,
            subtasks: [
              {
                id: "task-1",
                title: "Inspect files",
                instruction: "Inspect the codebase"
              },
              {
                id: "task-2",
                title: "Patch code",
                instruction: "Patch code hard"
              }
            ],
            finalExecutionBrief: "Combine the subagent outputs into one answer"
          })
        );
      }

      if (request.prompt.includes("complex")) {
        return withUsage(
          JSON.stringify({
            difficultyScore: 72,
            summary: "Split into two tasks",
            executionModelId: "openai/gpt-5.4",
            usesSubagents: true,
            subtasks: [
              {
                id: "task-1",
                title: "Inspect files",
                instruction: "Inspect the codebase"
              },
              {
                id: "task-2",
                title: "Patch code",
                instruction: "Patch the code"
              }
            ],
            finalExecutionBrief: "Combine the subagent outputs into one answer"
          })
        );
      }

      return withUsage(
        JSON.stringify({
          difficultyScore: 20,
          summary: "Single-step execution",
          executionModelId: "openai/gpt-5.4",
          usesSubagents: false,
          subtasks: [],
          finalExecutionBrief: request.prompt.includes("slow") ? "slow request" : "single-step request"
        })
      );
    }

    if (request.kind === "subagent") {
      if (request.prompt.includes("Patch code hard")) {
        const count = (this.subagentCallCounts.get("task-2-hard") ?? 0) + 1;
        this.subagentCallCounts.set("task-2-hard", count);
        if (count < 3) {
          throw new Error("timeout from hard fake subagent");
        }

        await Bun.write(path.join(request.cwd, "patch-hard.txt"), "patch recovered");
        return withUsage("patch recovered");
      }

      if (request.prompt.includes("Patch code") && !this.retryTracker.has("task-2")) {
        this.retryTracker.add("task-2");
        throw new Error("timeout from fake subagent");
      }

      await Bun.write(
        path.join(request.cwd, request.prompt.includes("Inspect files") ? "inspection.txt" : "patch.txt"),
        request.prompt.includes("Inspect files") ? "inspection complete" : "patch complete"
      );
      return withUsage(request.prompt.includes("Inspect files") ? "inspection complete" : "patch complete");
    }

    if (request.kind === "executor" && request.prompt.includes("slow request")) {
      return await new Promise((resolve, reject) => {
        request.abortSignal?.addEventListener(
          "abort",
          () => reject(new Error("aborted by test")),
          { once: true }
        );
      });
    }

    return withUsage(request.kind === "aggregator" ? "aggregated result" : "main execution result");
  }

  async startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
    let aborted = false;
    let rejectAbort: ((error: Error) => void) | undefined;
    const run = (nextRequest: PiAgentPromptRequest) => {
      if (nextRequest.kind === "executor" && nextRequest.prompt.includes("streaming refresh")) {
        this.calls.push(nextRequest);
        nextRequest.onExecutionEvent?.({ type: "session-created" });
        nextRequest.onExecutionEvent?.({ type: "activity" });
        nextRequest.onTextDelta?.("working");
        return new Promise<PiAgentPromptResult>((resolve, reject) => {
          rejectAbort = (error: Error) => reject(error);
          setTimeout(() => {
            if (aborted) {
              reject(new Error("aborted by test"));
              return;
            }

            resolve({
              text: "main execution result",
              contextUsage: {
                tokens: 2400,
                contextWindow: 200000,
                usagePercent: 1.2,
                sessionStats: {
                  sessionFile: undefined,
                  sessionId: crypto.randomUUID(),
                  userMessages: 1,
                  assistantMessages: 1,
                  toolCalls: 0,
                  toolResults: 0,
                  totalMessages: 2,
                  tokens: {
                    input: 100,
                    output: 200,
                    cacheRead: 0,
                    cacheWrite: 0,
                    total: 300
                  },
                  cost: 0,
                  contextUsage: {
                    tokens: 2400,
                    contextWindow: 200000,
                    percent: 1.2
                  }
                }
              }
            });
          }, 120);
        });
      }

      return Promise.race([
        this.runPrompt(nextRequest),
        new Promise<PiAgentPromptResult>((_, reject) => {
          rejectAbort = (error: Error) => reject(error);
          if (aborted) {
            reject(new Error("aborted by test"));
          }
        })
      ]);
    };

    let currentResult = run(request);
    return {
      get result() {
        return currentResult;
      },
      continueWithPrompt(prompt: string = "continue") {
        currentResult = run({ ...request, prompt });
        return currentResult;
      },
      async abort() {
        aborted = true;
        rejectAbort?.(new Error("aborted by test"));
      },
      dispose() {}
    };
  }
}

describe("harness server", () => {
  let server: Awaited<ReturnType<typeof startHarnessServer>>;
  let adapter: FakePiAgentAdapter;
  let repository: WorkspaceRepository;
  let dbPath: string;
  let extraProjectRoot: string;
  let projectRoot: string;
  let port: number;

  beforeEach(async () => {
    const tempRoot = path.join(process.cwd(), ".tmp-test-data");
    mkdirSync(tempRoot, { recursive: true });
    projectRoot = path.join(tempRoot, `repo-${crypto.randomUUID()}`);
    seedBunGitProject(projectRoot);
    extraProjectRoot = path.join(tempRoot, `project-${crypto.randomUUID()}`);
    mkdirSync(extraProjectRoot, { recursive: true });
    dbPath = path.join(tempRoot, `server-${crypto.randomUUID()}.sqlite`);
    port = 8800 + Math.floor(Math.random() * 1000);

    adapter = new FakePiAgentAdapter();
    repository = new WorkspaceRepository(dbPath, projectRoot);
    server = await startHarnessServer({
      port,
      adapter,
      repository,
      pickFolder: async () => extraProjectRoot,
      serverOnly: true
    });
  });

  afterEach(() => {
    server?.stop(true);
  });

  test("accepts websocket commands and rejects malformed payloads", async () => {
    const socket = createSocket(port);

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => {
        socket.send("not-json");
      });

      socket.addEventListener("message", (event) => {
        const payload = JSON.parse(event.data as string);

        if (payload.type === "command.rejected") {
          expect(payload.payload.message).toBe("Invalid websocket command");
          socket.close();
          resolve();
        }
      });

      socket.addEventListener("error", () => reject(new Error("websocket failed")));
    });
  });

  test("returns ready state and persisted workspace on connect", async () => {
    const socket = createSocket(port);
    const ready = await waitForEvent(socket, "connection.ready");

    expect(ready.payload.agents[0].id).toBe("pi");
    expect(ready.payload.workspace.projects).toHaveLength(0);
    expect(ready.payload.workspace.activeProjectId).toBeUndefined();
    expect(ready.payload.preferences.hasUsableApiKey).toBe(false);
    expect(ready.payload.preferences.hasUsableOpenAiApiKey).toBe(false);
    expect(ready.payload.preferences.hasUsableGoogleApiKey).toBe(false);
    expect(ready.payload.preferences.providerBrand).toBe("gpt");
    expect(ready.payload.preferences.tracePanelDefaultOpen).toBe(true);
    expect(ready.payload.preferences.subagentWorktreeStrategyDefault).toBe("same-worktree");
    expect(ready.payload.preferences.blockChatOnDirtyGitDefault).toBe(true);
    expect(ready.payload.preferences.dirtyGitChangeLimitDefault).toBe(20);
    expect(ready.payload.preferences.planExecutionModeDefault).toBe("countdown");
    expect(ready.payload.preferences.planExecutionDelaySecondsDefault).toBe(10);
    expect(ready.payload.preferences.correctnessIterationModeDefault).toBe("ask-before-iterate");
    expect(ready.payload.preferences.attachmentsEnabled).toBe(false);
    socket.close();
  });

  test("saves preferences and persists API key", async () => {
    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const savedPromise = waitForEvent(socket, "preferences.saved");

    socket.send(
      JSON.stringify({
        type: "preferences.save",
        requestId: "req-pref",
        payload: {
          openAiApiKey: "sk-local-123",
          googleApiKey: "AIza-local-456",
          providerBrand: "gemini",
          debugEnabled: true,
          tracePanelDefaultOpen: false,
          uiModeDefault: "advanced",
          subagentWorktreeStrategyDefault: "separate-worktrees",
          blockChatOnDirtyGitDefault: false,
          dirtyGitChangeLimitDefault: 9,
          planExecutionModeDefault: "approve",
          planExecutionDelaySecondsDefault: 15,
          correctnessIterationModeDefault: "auto-once"
        }
      })
    );

    const saved = await savedPromise;
    expect(saved.payload.hasUsableApiKey).toBe(true);
    expect(saved.payload.hasStoredApiKey).toBe(true);
    expect(saved.payload.hasUsableOpenAiApiKey).toBe(true);
    expect(saved.payload.hasUsableGoogleApiKey).toBe(true);
    expect(saved.payload.providerBrand).toBe("gemini");
    expect(saved.payload.debugEnabledDefault).toBe(true);
    expect(saved.payload.tracePanelDefaultOpen).toBe(false);
    expect(saved.payload.uiModeDefault).toBe("advanced");
    expect(saved.payload.attachmentsEnabled).toBe(false);
    expect(saved.payload.subagentWorktreeStrategyDefault).toBe("separate-worktrees");
    expect(saved.payload.blockChatOnDirtyGitDefault).toBe(false);
    expect(saved.payload.dirtyGitChangeLimitDefault).toBe(9);
    expect(saved.payload.planExecutionModeDefault).toBe("approve");
    expect(saved.payload.planExecutionDelaySecondsDefault).toBe(15);
    expect(saved.payload.correctnessIterationModeDefault).toBe("auto-once");
    expect(repository.getStoredOpenAiApiKey()).toBe("sk-local-123");
    expect(repository.getStoredGoogleApiKey()).toBe("AIza-local-456");
    socket.close();
  });

  test("clears persisted API key", async () => {
    repository.setStoredOpenAiApiKey("sk-clear-123");
    repository.setStoredGoogleApiKey("AIza-clear-456");
    adapter.setApiKey("openai", "sk-clear-123");
    adapter.setApiKey("google", "AIza-clear-456");

    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const clearedPromise = waitForEvent(socket, "preferences.apiKeyCleared");

    socket.send(
      JSON.stringify({
        type: "preferences.clearApiKey",
        requestId: "req-clear"
      })
    );

    const cleared = await clearedPromise;
    expect(cleared.payload.hasUsableApiKey).toBe(false);
    expect(cleared.payload.hasStoredApiKey).toBe(false);
    expect(repository.getStoredOpenAiApiKey()).toBeUndefined();
    expect(repository.getStoredGoogleApiKey()).toBeUndefined();
    socket.close();
  });

  test("uses gemini planning and subagent defaults when provider brand is gemini", async () => {
    repository.setStoredGoogleApiKey("AIza-gemini-123");
    repository.setProviderBrand("gemini");
    repository.setSubagentWorktreeStrategyDefault("separate-worktrees");
    adapter.setApiKey("google", "AIza-gemini-123");

    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot);
    const projectId = opened.payload.project.id;
    const threadId = opened.payload.project.activeThreadId;
    const ready = await sendChatUntilReady(socket, {
      requestId: "req-gemini",
      projectId,
      threadId,
      content: "complex task"
    }, 30000);

    socket.send(
      JSON.stringify({
        type: "run.execute",
        requestId: "req-gemini-execute",
        payload: {
          projectId,
          threadId,
          runId: ready.payload.run.id
        }
      })
    );

    await waitForCondition(() => adapter.calls.some((call) => call.kind === "subagent"), 30000);
    await waitForCondition(() => adapter.calls.some((call) => call.kind === "aggregator"), 30000);

    expect(adapter.calls[0]?.modelId).toBe("google/gemini-3-flash-preview");
    expect(adapter.calls.filter((call) => call.kind === "subagent").every((call) => call.modelId === "google/gemini-2.5-flash-lite")).toBe(true);
    expect(adapter.calls.some((call) => call.kind === "aggregator")).toBe(true);
    socket.close();
  }, 60000);

  test("runs low difficulty tasks on the main executor only", async () => {
    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot);
    const projectId = opened.payload.project.id;
    const threadId = opened.payload.project.activeThreadId;
    const complete = await sendChatAndExecute(socket, {
      requestId: "req-low",
      projectId,
      threadId,
      content: "simple task"
    });
    expect(complete.payload.projectId).toBe(projectId);
    expect(complete.payload.assistantMessage.content).toBe("main execution result");
    expect(adapter.calls.map((call) => call.kind)).toEqual(["planner", "executor"]);
    socket.close();
  });

  test("chat.send presents a ready plan before execution", async () => {
    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot);
    const projectId = opened.payload.project.id;
    const threadId = opened.payload.project.activeThreadId;
    const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
    const planPromise = waitForEvent(socket, "agent.plan");
    const planMessagePromise = waitForEvent(
      socket,
      "chat.message-appended",
      (event) => event.payload.message.kind === "plan-summary"
    );

    socket.send(
      JSON.stringify({
        type: "chat.send",
        requestId: "req-plan-first",
        payload: {
          projectId,
          threadId,
          agentId: "pi",
          content: "simple task"
        }
      })
    );

    const ready = await readyPromise;
    const plan = await planPromise;
    const planMessage = await planMessagePromise;

    expect(ready.payload.run.status).toBe("ready");
    expect(plan.payload.projectId).toBe(projectId);
    expect(planMessage.payload.message.kind).toBe("plan-summary");
    expect(planMessage.payload.state.isStreaming).toBe(false);
    expect(adapter.calls.map((call) => call.kind)).toEqual(["planner"]);
    socket.close();
  });

  test("chat.send forwards attachment context into planner prompts", async () => {
    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot, "req-attach-open");
    const tinyPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9s3FoXcAAAAASUVORK5CYII=";
    const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");

    socket.send(
      JSON.stringify(
        createChatSendCommand({
          requestId: "req-attach-send",
          projectId: opened.payload.project.id,
          threadId: opened.payload.project.activeThreadId,
          content: "Use attached context",
          attachments: [
            {
              id: "attachment-text",
              kind: "text",
              name: "spec.md",
              mimeType: "text/markdown",
              sizeBytes: 29,
              url: "data:text/markdown,Ship%20the%20smallest%20safe%20fix",
              key: "attachment-text",
              uploadedAt: new Date().toISOString()
            },
            {
              id: "attachment-image",
              kind: "image",
              name: "bug.png",
              mimeType: "image/png",
              sizeBytes: tinyPng.length,
              url: `data:image/png;base64,${tinyPng}`,
              key: "attachment-image",
              uploadedAt: new Date().toISOString()
            }
          ]
        })
      )
    );

    await readyPromise;

    expect(adapter.calls[0]?.kind).toBe("planner");
    expect(adapter.calls[0]?.prompt).toContain("Attachment contents:");
    expect(adapter.calls[0]?.prompt).toContain("Ship the smallest safe fix");
    expect(adapter.calls[0]?.images).toHaveLength(1);
    expect(adapter.calls[0]?.images?.[0]?.mimeType).toBe("image/png");
    socket.close();
  });

  test("runs high difficulty tasks with subagents and aggregation", async () => {
    repository.setSubagentWorktreeStrategyDefault("separate-worktrees");
    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot);
    const projectId = opened.payload.project.id;
    const threadId = opened.payload.project.activeThreadId;
    const planPromise = waitForEvent(socket, "agent.plan");

    const ready = await sendChatUntilReady(socket, {
      requestId: "req-high",
      projectId,
      threadId,
      content: "complex task"
    }, 30000);

    socket.send(
      JSON.stringify({
        type: "run.execute",
        requestId: "req-high-execute",
        payload: {
          projectId,
          threadId,
          runId: ready.payload.run.id
        }
      })
    );

    await waitForCondition(() => adapter.calls.some((call) => call.kind === "aggregator"), 30000);

    const plan = await planPromise;
    expect(plan.payload.projectId).toBe(projectId);
    expect(plan.payload.plan.usesSubagents).toBe(true);
    const callKinds = adapter.calls.map((call) => call.kind);
    expect(callKinds[0]).toBe("planner");
    expect(callKinds.includes("subagent")).toBe(true);
    expect(callKinds.includes("aggregator")).toBe(true);
    expect(callKinds.indexOf("aggregator")).toBeGreaterThan(callKinds.indexOf("subagent"));
    socket.close();
  }, 60000);

  test("asks planner question before execution and resumes after answer", async () => {
    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot);
    const projectId = opened.payload.project.id;
    const threadId = opened.payload.project.activeThreadId;
    const runPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "awaiting-user-input");
    const questionMessagePromise = waitForEvent(
      socket,
      "chat.message-appended",
      (event) => event.payload.message.role === "assistant"
    );

    socket.send(
      JSON.stringify({
        type: "chat.send",
        requestId: "req-question",
        payload: {
          projectId,
          threadId,
          agentId: "pi",
          content: "needs clarification"
        }
      })
    );

    const runUpdate = await runPromise;
    const questionMessage = await questionMessagePromise;

    expect(runUpdate.payload.run.questions[0].prompt).toContain("Which route");
    expect(questionMessage.payload.message.content).toContain("Which route");
    expect(questionMessage.payload.state.isStreaming).toBe(false);
    expect(adapter.calls.map((call) => call.kind)).toEqual(["planner"]);

    const complete = await answerPlanningQuestionAndExecute(socket, {
      requestId: "req-question-answer",
      projectId,
      threadId,
      runId: runUpdate.payload.run.id,
      questionId: runUpdate.payload.run.questions[0].id,
      content: "api/users/[id]"
    });
    expect(complete.payload.assistantMessage.content).toBe("main execution result");
    expect(adapter.calls.map((call) => call.kind)).toEqual(["planner", "planner", "executor"]);
    socket.close();
  });

  test("presents a corrective plan when correctness review finds a runnable gap", async () => {
    writeFileSync(
      path.join(projectRoot, "index.html"),
      '<!doctype html><html><body><script type="module" src="./app.ts"></script></body></html>\n'
    );
    writeFileSync(path.join(projectRoot, "app.ts"), 'console.log("hello");\n');

    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot);
    const projectId = opened.payload.project.id;
    const threadId = opened.payload.project.activeThreadId;
    const correctiveReadyPromise = waitForEvent(
      socket,
      "run.updated",
      (event) => event.payload.run.status === "ready" && event.payload.run.plan?.origin === "correctness-followup",
      10000
    );
    const correctivePlanMessagePromise = waitForEvent(
      socket,
      "chat.message-appended",
      (event) =>
        event.payload.message.kind === "plan-summary" &&
        event.payload.message.metadata?.type === "plan-summary" &&
        event.payload.message.metadata.plan.origin === "correctness-followup",
      10000
    );

    const initialReady = await sendChatUntilReady(socket, {
      requestId: "req-correctness-gap",
      projectId,
      threadId,
      content: "simple task"
    });
    await executeReadyRun(socket, {
      requestId: "req-correctness-gap-execute",
      projectId,
      threadId,
      runId: initialReady.payload.run.id
    }, 10000).catch(() => undefined);

    const correctiveReady = await correctiveReadyPromise;
    const correctivePlanMessage = await correctivePlanMessagePromise;
    expect(correctiveReady.payload.run.plan?.origin).toBe("correctness-followup");
    expect(correctiveReady.payload.run.plan?.summary).toContain("TypeScript modules directly");
    expect(correctivePlanMessage.payload.message.metadata.plan.origin).toBe("correctness-followup");
    expect(correctivePlanMessage.payload.message.metadata.plan.summary).toContain("TypeScript modules directly");
    socket.close();
  }, 15000);

  test("chat.stop aborts running work", async () => {
    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot);
    const projectId = opened.payload.project.id;
    const threadId = opened.payload.project.activeThreadId;
    const planPromise = waitForEvent(socket, "agent.plan");

    socket.send(
      JSON.stringify({
        type: "chat.send",
        requestId: "req-stop",
        payload: {
          projectId,
          threadId,
          agentId: "pi",
          content: "slow task"
        }
      })
    );

    await planPromise;
    const errorPromise = waitForEvent(socket, "chat.error");

    socket.send(
      JSON.stringify({
        type: "chat.stop",
        requestId: "req-stop-2",
        payload: {
          projectId,
          threadId
        }
      })
    );

    const errorEvent = await errorPromise;
    expect(errorEvent.payload.message).toContain("stopped");
    socket.close();
  });

  test("defers run.refresh while active main execution is streaming", async () => {
    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot);
    const projectId = opened.payload.project.id;
    const threadId = opened.payload.project.activeThreadId;
    const ready = await sendChatUntilReady(socket, {
      requestId: "req-refresh-deferred-1",
      projectId,
      threadId,
      content: "streaming refresh"
    });
    const runningRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "running-main");
    const deltaPromise = waitForEvent(socket, "chat.delta");
    const completePromise = waitForEvent(socket, "chat.complete", undefined, 10000);

    socket.send(
      JSON.stringify({
        type: "run.execute",
        requestId: "req-refresh-deferred-execute",
        payload: {
          projectId,
          threadId,
          runId: ready.payload.run.id
        }
      })
    );
    const runningRun = await runningRunPromise;
    await deltaPromise;
    const deferredTracePromise = waitForEvent(
      socket,
      "agent.trace",
      (event) => event.payload.trace.stage === "refresh-deferred",
      10000
    );

    socket.send(
      JSON.stringify({
        type: "run.refresh",
        requestId: "req-refresh-deferred-2",
        payload: {
          projectId,
          threadId,
          runId: runningRun.payload.run.id
        }
      })
    );

    await deferredTracePromise;
    await completePromise;
    expect(adapter.calls.filter((call) => call.kind === "executor")).toHaveLength(1);
    socket.close();
  }, 10000);

  test("rejects run.refresh for completed runs", async () => {
    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot);
    const projectId = opened.payload.project.id;
    const threadId = opened.payload.project.activeThreadId;
    const completedRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "completed");
    const ready = await sendChatUntilReady(socket, {
      requestId: "req-refresh-completed-1",
      projectId,
      threadId,
      content: "simple task"
    });
    await executeReadyRun(socket, {
      requestId: "req-refresh-completed-execute",
      projectId,
      threadId,
      runId: ready.payload.run.id
    });
    const completedRun = await completedRunPromise;
    const rejectedPromise = waitForEvent(socket, "command.rejected");

    socket.send(
      JSON.stringify({
        type: "run.refresh",
        requestId: "req-refresh-completed-2",
        payload: {
          projectId,
          threadId,
          runId: completedRun.payload.run.id
        }
      })
    );

    const rejected = await rejectedPromise;
    expect(rejected.payload.detail).toContain("not refreshable");
    socket.close();
  });

  test("opens project through typed folder browse command", async () => {
    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const addedPromise = waitForEvent(socket, "project.opened");

    socket.send(
      JSON.stringify({
        type: "project.browse",
        requestId: "req-browse"
      })
    );

    const added = await addedPromise;
    expect(added.payload.project.rootPath).toBe(extraProjectRoot);
    expect(added.payload.activeProjectId).toBe(added.payload.project.id);
    expect(added.payload.resolution).toBe("created-project");
    socket.close();
  });

  test("reopens existing project by creating a new thread", async () => {
    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const firstOpened = await openProject(socket, projectRoot, "req-open-existing-1");
    const secondOpened = await openProject(socket, projectRoot, "req-open-existing-2");

    expect(firstOpened.payload.resolution).toBe("created-project");
    expect(secondOpened.payload.resolution).toBe("existing-project-new-thread");
    expect(secondOpened.payload.project.id).toBe(firstOpened.payload.project.id);
    expect(secondOpened.payload.project.threads).toHaveLength(2);
    expect(secondOpened.payload.project.activeThreadId).not.toBe(firstOpened.payload.project.activeThreadId);
    socket.close();
  });

  test("removes final project and returns to empty workspace", async () => {
    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot, "req-remove-open");
    const removedPromise = waitForEvent(socket, "project.removed");

    socket.send(
      JSON.stringify({
        type: "project.remove",
        requestId: "req-remove-last",
        payload: {
          projectId: opened.payload.project.id
        }
      })
    );

    const removed = await removedPromise;
    expect(removed.payload.projectId).toBe(opened.payload.project.id);
    expect(removed.payload.activeProjectId).toBeUndefined();
    expect(repository.loadWorkspace()).toEqual({
      projects: [],
      activeProjectId: undefined,
      workspaceModes: [],
      workspaceRuleSource: undefined,
      workspaceMemorySummary: undefined
    });
    socket.close();
  });

  test("restores persisted chat history after restart", async () => {
    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot);
    const projectId = opened.payload.project.id;
    const threadId = opened.payload.project.activeThreadId;
    await sendChatAndExecute(socket, {
      requestId: "req-persist",
      projectId,
      threadId,
      content: "simple task"
    });
    socket.close();
    server.stop(true);

    server = await startHarnessServer({
      port,
      adapter,
      repository: new WorkspaceRepository(dbPath, projectRoot),
      serverOnly: true
    });

    const nextSocket = createSocket(port);
    const nextReady = await waitForEvent(nextSocket, "connection.ready");
    const restoredProject = nextReady.payload.workspace.projects.find((project: any) => project.id === projectId);

    expect(restoredProject.session.messages.length).toBeGreaterThanOrEqual(3);
    expect(restoredProject.session.messages[0].content).toBe("simple task");
    expect(restoredProject.session.messages.some((message: any) => message.role === "system")).toBe(true);
    expect(restoredProject.session.messages.at(-1).content).toBe("main execution result");
    expect(restoredProject.lastRun?.status).toBe("completed");
    expect(restoredProject.lastRun?.retryable).toBe(true);
    nextSocket.close();
  });

  test("emits dirty git warning and still runs when change count is within threshold", async () => {
    writeFileSync(path.join(projectRoot, "dirty-warning.txt"), "warn\n");
    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot);
    const projectId = opened.payload.project.id;
    const threadId = opened.payload.project.activeThreadId;
    const preflightPromise = waitForEvent(socket, "run.preflight");
    const readyPromise = sendChatUntilReady(socket, {
      requestId: "req-dirty-warning",
      projectId,
      threadId,
      content: "simple task"
    });

    const preflight = await preflightPromise;
    const ready = await readyPromise;
    await executeReadyRun(socket, {
      requestId: "req-dirty-warning-execute",
      projectId,
      threadId,
      runId: ready.payload.run.id
    });
    expect(preflight.payload.preflight.changedFileCount).toBe(1);
    expect(preflight.payload.preflight.kind).toBe("git-dirty");
    socket.close();
  });

  test("rejects chat.send and run.retry when git is too dirty", async () => {
    for (let index = 0; index < 21; index += 1) {
      writeFileSync(path.join(projectRoot, `dirty-${index}.txt`), `${index}\n`);
    }

    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot);
    const projectId = opened.payload.project.id;
    const threadId = opened.payload.project.activeThreadId;
    const rejectedPromise = waitForEvent(socket, "command.rejected");

    socket.send(
      JSON.stringify({
        type: "chat.send",
        requestId: "req-dirty-block",
        payload: {
          projectId,
          threadId,
          agentId: "pi",
          content: "simple task"
        }
      })
    );

    const rejected = await rejectedPromise;
    expect(rejected.payload.detail).toContain("21 changed files");
    socket.close();
  });

  test("honors custom dirty git change limit", async () => {
    repository.setDirtyGitChangeLimitDefault(1);
    writeFileSync(path.join(projectRoot, "dirty-limit-1.txt"), "1\n");
    writeFileSync(path.join(projectRoot, "dirty-limit-2.txt"), "2\n");

    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot);
    const projectId = opened.payload.project.id;
    const threadId = opened.payload.project.activeThreadId;
    const rejectedPromise = waitForEvent(socket, "command.rejected");

    socket.send(
      JSON.stringify({
        type: "chat.send",
        requestId: "req-dirty-custom-limit",
        payload: {
          projectId,
          threadId,
          agentId: "pi",
          content: "simple task"
        }
      })
    );

    const rejected = await rejectedPromise;
    expect(rejected.payload.detail).toContain("Refusing run above 1 files");
    socket.close();
  });

  test("allows chat runs on dirty repos when dirty git restriction is disabled", async () => {
    repository.setBlockChatOnDirtyGitDefault(false);
    for (let index = 0; index < 21; index += 1) {
      writeFileSync(path.join(projectRoot, `dirty-disabled-${index}.txt`), `${index}\n`);
    }

    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot);
    const projectId = opened.payload.project.id;
    const threadId = opened.payload.project.activeThreadId;
    const ready = await sendChatUntilReady(socket, {
      requestId: "req-dirty-disabled",
      projectId,
      threadId,
      content: "simple task"
    });

    await executeReadyRun(socket, {
      requestId: "req-dirty-disabled-execute",
      projectId,
      threadId,
      runId: ready.payload.run.id
    });

    socket.close();
  });

  test("retries completed main run with a fresh planner + executor pass", async () => {
    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot);
    const projectId = opened.payload.project.id;
    const threadId = opened.payload.project.activeThreadId;
    const firstRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "completed");
    const firstReady = await sendChatUntilReady(socket, {
      requestId: "req-retry-main-1",
      projectId,
      threadId,
      content: "simple task"
    });
    await executeReadyRun(socket, {
      requestId: "req-retry-main-1-execute",
      projectId,
      threadId,
      runId: firstReady.payload.run.id
    });
    const firstRun = await firstRunPromise;

    const secondReadyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
    socket.send(
      JSON.stringify({
        type: "run.retry",
        requestId: "req-retry-main-2",
        payload: {
          projectId,
          threadId,
          runId: firstRun.payload.run.id
        }
      })
    );

    const secondReady = await secondReadyPromise;
    await executeReadyRun(socket, {
      requestId: "req-retry-main-2-execute",
      projectId,
      threadId,
      runId: secondReady.payload.run.id
    });
    expect(adapter.calls.map((call) => call.kind)).toEqual(["planner", "executor", "planner", "executor"]);
    socket.close();
  });

  test("planning.refine replaces the ready plan with a fresh run", async () => {
    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot);
    const projectId = opened.payload.project.id;
    const threadId = opened.payload.project.activeThreadId;
    const rejectedEvents: any[] = [];
    const rejectListener = (event: MessageEvent) => {
      const payload = JSON.parse(event.data as string);
      if (payload.type === "command.rejected") {
        rejectedEvents.push(payload);
      }
    };
    socket.addEventListener("message", rejectListener);
    const firstReady = await sendChatUntilReady(socket, {
      requestId: "req-refine-1",
      projectId,
      threadId,
      content: "complex task"
    });
    const refinedReadyPromise = waitForEvent(
      socket,
      "run.updated",
      (event) =>
        event.payload.run.status === "ready" &&
        event.payload.run.id !== firstReady.payload.run.id &&
        event.payload.run.latestUserPrompt === "make it runnable",
      10000
    );
    const refinedPlanMessagePromise = waitForEvent(
      socket,
      "chat.message-appended",
      (event) =>
        event.payload.message.kind === "plan-summary" &&
        event.payload.message.metadata?.type === "plan-summary" &&
        event.payload.message.metadata.runId !== firstReady.payload.run.id,
      10000
    );
    socket.send(
      JSON.stringify({
        type: "planning.refine",
        requestId: "req-refine-2",
        payload: {
          projectId,
          threadId,
          runId: firstReady.payload.run.id,
          content: "make it runnable"
        }
      })
    );

    const refinedReady = await refinedReadyPromise;
    const refinedPlanMessage = await refinedPlanMessagePromise;
    expect(refinedReady.payload.run.id).not.toBe(firstReady.payload.run.id);
    expect(refinedPlanMessage.payload.message.metadata.runId).toBe(refinedReady.payload.run.id);
    expect(adapter.calls.filter((call) => call.kind === "planner")).toHaveLength(2);
    expect(adapter.calls.some((call) => call.kind === "executor" || call.kind === "subagent")).toBe(false);
    expect(rejectedEvents).toHaveLength(0);
    socket.removeEventListener("message", rejectListener);
    socket.close();
  });

  test("allows a second top-level send after a completed run in the same thread", async () => {
    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot);
    const projectId = opened.payload.project.id;
    const threadId = opened.payload.project.activeThreadId;
    const rejectedEvents: any[] = [];
    const rejectListener = (event: MessageEvent) => {
      const payload = JSON.parse(event.data as string);
      if (payload.type === "command.rejected") {
        rejectedEvents.push(payload);
      }
    };
    socket.addEventListener("message", rejectListener);

    await sendChatAndExecute(socket, {
      requestId: "req-first-complete",
      projectId,
      threadId,
      content: "simple task"
    });
    const secondReady = await sendChatUntilReady(socket, {
      requestId: "req-second-followup",
      projectId,
      threadId,
      content: "another task"
    });

    expect(secondReady.payload.run.status).toBe("ready");
    expect(rejectedEvents).toHaveLength(0);
    socket.removeEventListener("message", rejectListener);
    socket.close();
  });

  test("emits project context usage updates for planner and executor", async () => {
    const socket = createSocket(port);
    await waitForEvent(socket, "connection.ready");
    const opened = await openProject(socket, projectRoot);
    const projectId = opened.payload.project.id;
    const threadId = opened.payload.project.activeThreadId;
    const contextEvents: any[] = [];
    const listener = (event: MessageEvent) => {
      const payload = JSON.parse(event.data as string);
      if (payload.type === "project.context") {
        contextEvents.push(payload);
      }
    };
    socket.addEventListener("message", listener);

    const ready = await sendChatUntilReady(socket, {
      requestId: "req-context",
      projectId,
      threadId,
      content: "simple task"
    });
    await executeReadyRun(socket, {
      requestId: "req-context-execute",
      projectId,
      threadId,
      runId: ready.payload.run.id
    });
    socket.removeEventListener("message", listener);

    expect(contextEvents.some((event) => event.payload.contextUsage.sourceKind === "planner")).toBe(true);
    expect(contextEvents.some((event) => event.payload.contextUsage.sourceKind === "main")).toBe(true);
    expect(contextEvents.every((event) => event.payload.contextUsage.contextWindow === 200000)).toBe(true);
    expect(contextEvents.every((event) => typeof event.payload.contextUsage.modelId === "string")).toBe(true);
    socket.close();
  });
});

function seedBunGitProject(projectRoot: string) {
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(
    path.join(projectRoot, "package.json"),
    JSON.stringify(
      {
        name: "test-project",
        private: true,
        type: "module",
        scripts: {
          typecheck: "bun --version",
          test: "bun --version"
        }
      },
      null,
      2
    )
  );
  writeFileSync(path.join(projectRoot, ".gitignore"), ".local\nnode_modules\ndist\n");
  writeFileSync(path.join(projectRoot, "README.md"), "# Test Project\n");
  runSync(["bun", "install"], projectRoot);
  if (!existsSync(path.join(projectRoot, "bun.lock")) && !existsSync(path.join(projectRoot, "bun.lockb"))) {
    writeFileSync(path.join(projectRoot, "bun.lock"), "");
  }
  runSync(["git", "init"], projectRoot);
  runSync(["git", "config", "user.name", "Test User"], projectRoot);
  runSync(["git", "config", "user.email", "test@example.com"], projectRoot);
  runSync(["git", "add", "."], projectRoot);
  runSync(["git", "commit", "-m", "init"], projectRoot);
}

function runSync(command: string[], cwd: string) {
  const proc = Bun.spawnSync({
    cmd: command,
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });

  if (proc.exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} failed: ${(new TextDecoder().decode(proc.stderr) || new TextDecoder().decode(proc.stdout)).trim()}`
    );
  }
}

function openProject(socket: WebSocket, rootPath: string, requestId: string = `req-open-${crypto.randomUUID()}`) {
  const openedPromise = waitForEvent(socket, "project.opened");
  socket.send(
    JSON.stringify({
      type: "project.add",
      requestId,
      payload: {
        rootPath
      }
    })
  );
  return openedPromise;
}

function createChatSendCommand(input: {
  requestId: string;
  projectId: string;
  threadId: string;
  content: string;
  attachments?: Array<{
    id: string;
    kind: "image" | "text";
    name: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
    key: string;
    uploadedAt: string;
  }>;
}) {
  return {
    type: "chat.send",
    requestId: input.requestId,
    payload: {
      projectId: input.projectId,
      threadId: input.threadId,
      agentId: "pi",
      content: input.content,
      attachments: input.attachments
    }
  };
}

async function sendChatUntilReady(
  socket: WebSocket,
  input: { requestId: string; projectId: string; threadId: string; content: string },
  timeoutMs: number = 5000
) {
  const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready", timeoutMs);
  const planMessagePromise = waitForEvent(
    socket,
    "chat.message-appended",
    (event) => event.payload.message.kind === "plan-summary",
    timeoutMs
  );
  socket.send(JSON.stringify(createChatSendCommand(input)));
  const ready = await readyPromise;
  await planMessagePromise;
  return ready;
}

async function executeReadyRun(
  socket: WebSocket,
  input: { requestId: string; projectId: string; threadId: string; runId: string },
  timeoutMs: number = 5000
) {
  const completePromise = waitForEvent(socket, "chat.complete", undefined, timeoutMs);
  socket.send(
    JSON.stringify({
      type: "run.execute",
      requestId: input.requestId,
      payload: {
        projectId: input.projectId,
        threadId: input.threadId,
        runId: input.runId
      }
    })
  );
  return completePromise;
}

async function sendChatAndExecute(
  socket: WebSocket,
  input: { requestId: string; projectId: string; threadId: string; content: string },
  timeoutMs: number = 5000
) {
  const ready = await sendChatUntilReady(socket, input, timeoutMs);
  return executeReadyRun(
    socket,
    {
      requestId: `${input.requestId}-execute`,
      projectId: input.projectId,
      threadId: input.threadId,
      runId: ready.payload.run.id
    },
    timeoutMs
  );
}

async function answerPlanningQuestionAndExecute(
  socket: WebSocket,
  input: { requestId: string; projectId: string; threadId: string; runId: string; questionId: string; content: string },
  timeoutMs: number = 5000
) {
  const readyPromise = waitForEvent(
    socket,
    "run.updated",
    (event) => event.payload.run.id === input.runId && event.payload.run.status === "ready",
    timeoutMs
  );
  const planMessagePromise = waitForEvent(
    socket,
    "chat.message-appended",
    (event) => event.payload.message.kind === "plan-summary",
    timeoutMs
  );
  socket.send(
    JSON.stringify({
      type: "planning.answer",
      requestId: input.requestId,
      payload: {
        projectId: input.projectId,
        threadId: input.threadId,
        runId: input.runId,
        questionId: input.questionId,
        content: input.content
      }
    })
  );
  const ready = await readyPromise;
  await planMessagePromise;
  return executeReadyRun(
    socket,
    {
      requestId: `${input.requestId}-execute`,
      projectId: input.projectId,
      threadId: input.threadId,
      runId: ready.payload.run.id
    },
    timeoutMs
  );
}

function createSocket(port: number) {
  return new WebSocket(`ws://localhost:${port}/ws`);
}

function waitForEvent(socket: WebSocket, type: string, predicate?: (payload: any) => boolean, timeoutMs: number = 5000) {
  return new Promise<any>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;

    const listener = (event: MessageEvent) => {
      const payload = JSON.parse(event.data as string);
      if (payload.type === type && (predicate ? predicate(payload) : true)) {
        cleanup();
        resolve(payload);
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error("socket error"));
    };

    const cleanup = () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      socket.removeEventListener("message", listener);
      socket.removeEventListener("error", onError);
    };

    timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeoutMs);

    socket.addEventListener("message", listener);
    socket.addEventListener("error", onError, { once: true });
  });
}

function waitForCondition(predicate: () => boolean, timeoutMs: number = 5000, intervalMs: number = 50) {
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      if (predicate()) {
        clearInterval(interval);
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(interval);
        reject(new Error("Timed out waiting for condition"));
      }
    }, intervalMs);
  });
}
