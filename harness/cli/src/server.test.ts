import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PiAgentAdapter, PiAgentPromptRequest, PiAgentPromptResult } from "./pi-agent-adapter";
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
}

describe("harness server", () => {
  let server: Awaited<ReturnType<typeof startHarnessServer>>;
  let adapter: FakePiAgentAdapter;
  let repository: WorkspaceRepository;
  let dbPath: string;
  let extraProjectRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    const tempRoot = path.join(process.cwd(), ".tmp-test-data");
    mkdirSync(tempRoot, { recursive: true });
    projectRoot = path.join(tempRoot, `repo-${crypto.randomUUID()}`);
    seedBunGitProject(projectRoot);
    extraProjectRoot = path.join(tempRoot, `project-${crypto.randomUUID()}`);
    mkdirSync(extraProjectRoot, { recursive: true });
    dbPath = path.join(tempRoot, `server-${crypto.randomUUID()}.sqlite`);

    adapter = new FakePiAgentAdapter();
    repository = new WorkspaceRepository(dbPath, projectRoot);
    server = await startHarnessServer({
      port: 8790,
      adapter,
      repository,
      pickFolder: async () => extraProjectRoot,
      serverOnly: true
    });
  });

  afterEach(() => {
    server.stop(true);
  });

  test("accepts websocket commands and rejects malformed payloads", async () => {
    const socket = new WebSocket("ws://localhost:8790/ws");

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
    const socket = new WebSocket("ws://localhost:8790/ws");
    const ready = await waitForEvent(socket, "connection.ready");

    expect(ready.payload.agents[0].id).toBe("pi");
    expect(ready.payload.workspace.projects).toHaveLength(1);
    expect(ready.payload.workspace.projects[0].session.messages).toHaveLength(0);
    expect(ready.payload.preferences.hasUsableApiKey).toBe(false);
    expect(ready.payload.preferences.hasUsableOpenAiApiKey).toBe(false);
    expect(ready.payload.preferences.hasUsableGoogleApiKey).toBe(false);
    expect(ready.payload.preferences.providerBrand).toBe("gpt");
    expect(ready.payload.preferences.tracePanelDefaultOpen).toBe(true);
    socket.close();
  });

  test("saves preferences and persists API key", async () => {
    const socket = new WebSocket("ws://localhost:8790/ws");
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
          tracePanelDefaultOpen: false
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
    expect(repository.getStoredOpenAiApiKey()).toBe("sk-local-123");
    expect(repository.getStoredGoogleApiKey()).toBe("AIza-local-456");
    socket.close();
  });

  test("clears persisted API key", async () => {
    repository.setStoredOpenAiApiKey("sk-clear-123");
    repository.setStoredGoogleApiKey("AIza-clear-456");
    adapter.setApiKey("openai", "sk-clear-123");
    adapter.setApiKey("google", "AIza-clear-456");

    const socket = new WebSocket("ws://localhost:8790/ws");
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
    adapter.setApiKey("google", "AIza-gemini-123");

    const socket = new WebSocket("ws://localhost:8790/ws");
    const ready = await waitForEvent(socket, "connection.ready");
    const projectId = ready.payload.workspace.activeProjectId;
    const completePromise = waitForEvent(socket, "chat.complete");

    socket.send(
      JSON.stringify({
        type: "chat.send",
        requestId: "req-gemini",
        payload: {
          projectId,
          agentId: "pi",
          content: "complex task"
        }
      })
    );

    await completePromise;
    expect(adapter.calls[0]?.modelId).toBe("google/gemini-3-flash-preview");
    expect(adapter.calls.filter((call) => call.kind === "subagent").every((call) => call.modelId === "google/gemini-2.5-flash-lite")).toBe(true);
    socket.close();
  });

  test("runs low difficulty tasks on the main executor only", async () => {
    const socket = new WebSocket("ws://localhost:8790/ws");
    const ready = await waitForEvent(socket, "connection.ready");
    const projectId = ready.payload.workspace.activeProjectId;
    const completePromise = waitForEvent(socket, "chat.complete");

    socket.send(
      JSON.stringify({
        type: "chat.send",
        requestId: "req-low",
        payload: {
          projectId,
          agentId: "pi",
          content: "simple task"
        }
      })
    );

    const complete = await completePromise;
    expect(complete.payload.projectId).toBe(projectId);
    expect(complete.payload.assistantMessage.content).toBe("main execution result");
    expect(adapter.calls.map((call) => call.kind)).toEqual(["planner", "executor"]);
    socket.close();
  });

  test("runs high difficulty tasks with subagents and aggregation", async () => {
    const socket = new WebSocket("ws://localhost:8790/ws");
    const ready = await waitForEvent(socket, "connection.ready");
    const projectId = ready.payload.workspace.activeProjectId;
    const planPromise = waitForEvent(socket, "agent.plan");
    const completePromise = waitForEvent(socket, "chat.complete");

    socket.send(
      JSON.stringify({
        type: "chat.send",
        requestId: "req-high",
        payload: {
          projectId,
          agentId: "pi",
          content: "complex task"
        }
      })
    );

    const plan = await planPromise;
    const complete = await completePromise;

    expect(plan.payload.projectId).toBe(projectId);
    expect(plan.payload.plan.usesSubagents).toBe(true);
    expect(complete.payload.assistantMessage.content).toBe("aggregated result");
    expect(adapter.calls.map((call) => call.kind)).toEqual([
      "planner",
      "subagent",
      "subagent",
      "subagent",
      "aggregator"
    ]);
    socket.close();
  });

  test("asks planner question before execution and resumes after answer", async () => {
    const socket = new WebSocket("ws://localhost:8790/ws");
    const ready = await waitForEvent(socket, "connection.ready");
    const projectId = ready.payload.workspace.activeProjectId;
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
          agentId: "pi",
          content: "needs clarification"
        }
      })
    );

    const runUpdate = await runPromise;
    const questionMessage = await questionMessagePromise;

    expect(runUpdate.payload.run.questions[0].prompt).toContain("Which route");
    expect(questionMessage.payload.message.content).toContain("Which route");
    expect(adapter.calls.map((call) => call.kind)).toEqual(["planner"]);

    const completePromise = waitForEvent(socket, "chat.complete");

    socket.send(
      JSON.stringify({
        type: "planning.answer",
        requestId: "req-question-answer",
        payload: {
          projectId,
          runId: runUpdate.payload.run.id,
          questionId: runUpdate.payload.run.questions[0].id,
          content: "api/users/[id]"
        }
      })
    );

    const complete = await completePromise;
    expect(complete.payload.assistantMessage.content).toBe("main execution result");
    expect(adapter.calls.map((call) => call.kind)).toEqual(["planner", "planner", "executor"]);
    socket.close();
  });

  test("keeps partial result resumable and persists completed commit metadata", async () => {
    const socket = new WebSocket("ws://localhost:8790/ws");
    const ready = await waitForEvent(socket, "connection.ready");
    const projectId = ready.payload.workspace.activeProjectId;
    const partialRunPromise = waitForEvent(
      socket,
      "run.updated",
      (event) => event.payload.run.status === "partial-complete",
      60000
    );
    const completePromise = waitForEvent(socket, "chat.complete", undefined, 60000);

    socket.send(
      JSON.stringify({
        type: "chat.send",
        requestId: "req-resume-run",
        payload: {
          projectId,
          agentId: "pi",
          content: "resume task"
        }
      })
    );

    const partialRun = await partialRunPromise;
    const partialComplete = await completePromise;
    expect(partialComplete.payload.assistantMessage.content).toBe("aggregated result");
    expect(partialRun.payload.run.resumable).toBe(true);
    expect(partialRun.payload.run.subtasks.find((task: any) => task.id === "task-1")?.status).toBe("completed");
    expect(partialRun.payload.run.subtasks.find((task: any) => task.id === "task-1")?.commitSha).toBeTruthy();
    expect(partialRun.payload.run.subtasks.find((task: any) => task.id === "task-2")?.status).toBe("failed");
    expect(adapter.calls.filter((call) => call.kind === "subagent" && call.prompt.includes("Inspect files"))).toHaveLength(1);
    expect(adapter.calls.filter((call) => call.kind === "subagent" && call.prompt.includes("Patch code hard"))).toHaveLength(2);
    socket.close();
  }, 60000);

  test("chat.stop aborts running work", async () => {
    const socket = new WebSocket("ws://localhost:8790/ws");
    const ready = await waitForEvent(socket, "connection.ready");
    const projectId = ready.payload.workspace.activeProjectId;
    const planPromise = waitForEvent(socket, "agent.plan");

    socket.send(
      JSON.stringify({
        type: "chat.send",
        requestId: "req-stop",
        payload: {
          projectId,
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
          projectId
        }
      })
    );

    const errorEvent = await errorPromise;
    expect(errorEvent.payload.message).toContain("stopped");
    socket.close();
  });

  test("adds project through typed folder browse command", async () => {
    const socket = new WebSocket("ws://localhost:8790/ws");
    await waitForEvent(socket, "connection.ready");
    const addedPromise = waitForEvent(socket, "project.added");

    socket.send(
      JSON.stringify({
        type: "project.browse",
        requestId: "req-browse"
      })
    );

    const added = await addedPromise;
    expect(added.payload.project.rootPath).toBe(extraProjectRoot);
    expect(added.payload.activeProjectId).toBe(added.payload.project.id);
    socket.close();
  });

  test("restores persisted chat history after restart", async () => {
    const socket = new WebSocket("ws://localhost:8790/ws");
    const ready = await waitForEvent(socket, "connection.ready");
    const projectId = ready.payload.workspace.activeProjectId;
    const completePromise = waitForEvent(socket, "chat.complete");

    socket.send(
      JSON.stringify({
        type: "chat.send",
        requestId: "req-persist",
        payload: {
          projectId,
          agentId: "pi",
          content: "simple task"
        }
      })
    );

    await completePromise;
    socket.close();
    server.stop(true);

    server = await startHarnessServer({
      port: 8790,
      adapter,
      repository: new WorkspaceRepository(dbPath, projectRoot),
      serverOnly: true
    });

    const nextSocket = new WebSocket("ws://localhost:8790/ws");
    const nextReady = await waitForEvent(nextSocket, "connection.ready");
    const restoredProject = nextReady.payload.workspace.projects.find((project: any) => project.id === projectId);

    expect(restoredProject.session.messages).toHaveLength(2);
    expect(restoredProject.session.messages[0].content).toBe("simple task");
    expect(restoredProject.session.messages[1].content).toBe("main execution result");
    expect(restoredProject.lastRun?.status).toBe("completed");
    expect(restoredProject.lastRun?.retryable).toBe(true);
    nextSocket.close();
  });

  test("emits dirty git warning and still runs when change count is within threshold", async () => {
    writeFileSync(path.join(projectRoot, "dirty-warning.txt"), "warn\n");
    const socket = new WebSocket("ws://localhost:8790/ws");
    const ready = await waitForEvent(socket, "connection.ready");
    const projectId = ready.payload.workspace.activeProjectId;
    const preflightPromise = waitForEvent(socket, "run.preflight");
    const completePromise = waitForEvent(socket, "chat.complete");

    socket.send(
      JSON.stringify({
        type: "chat.send",
        requestId: "req-dirty-warning",
        payload: {
          projectId,
          agentId: "pi",
          content: "simple task"
        }
      })
    );

    const preflight = await preflightPromise;
    await completePromise;
    expect(preflight.payload.preflight.changedFileCount).toBe(1);
    expect(preflight.payload.preflight.kind).toBe("git-dirty");
    socket.close();
  });

  test("rejects chat.send and run.retry when git is too dirty", async () => {
    for (let index = 0; index < 21; index += 1) {
      writeFileSync(path.join(projectRoot, `dirty-${index}.txt`), `${index}\n`);
    }

    const socket = new WebSocket("ws://localhost:8790/ws");
    const ready = await waitForEvent(socket, "connection.ready");
    const projectId = ready.payload.workspace.activeProjectId;
    const rejectedPromise = waitForEvent(socket, "command.rejected");

    socket.send(
      JSON.stringify({
        type: "chat.send",
        requestId: "req-dirty-block",
        payload: {
          projectId,
          agentId: "pi",
          content: "simple task"
        }
      })
    );

    const rejected = await rejectedPromise;
    expect(rejected.payload.detail).toContain("21 changed files");
    socket.close();
  });

  test("retries completed main run with a fresh planner + executor pass", async () => {
    const socket = new WebSocket("ws://localhost:8790/ws");
    const ready = await waitForEvent(socket, "connection.ready");
    const projectId = ready.payload.workspace.activeProjectId;
    const firstCompletePromise = waitForEvent(socket, "chat.complete");
    const firstRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "completed");

    socket.send(
      JSON.stringify({
        type: "chat.send",
        requestId: "req-retry-main-1",
        payload: {
          projectId,
          agentId: "pi",
          content: "simple task"
        }
      })
    );

    const firstRun = await firstRunPromise;
    await firstCompletePromise;

    const secondCompletePromise = waitForEvent(socket, "chat.complete");
    socket.send(
      JSON.stringify({
        type: "run.retry",
        requestId: "req-retry-main-2",
        payload: {
          projectId,
          runId: firstRun.payload.run.id
        }
      })
    );

    await secondCompletePromise;
    expect(adapter.calls.map((call) => call.kind)).toEqual(["planner", "executor", "planner", "executor"]);
    socket.close();
  });

  test("retries a selected subagent and re-aggregates", async () => {
    const socket = new WebSocket("ws://localhost:8790/ws");
    const ready = await waitForEvent(socket, "connection.ready");
    const projectId = ready.payload.workspace.activeProjectId;
    const partialRunPromise = waitForEvent(
      socket,
      "run.updated",
      (event) => event.payload.run.status === "partial-complete",
      60000
    );
    const firstCompletePromise = waitForEvent(socket, "chat.complete", undefined, 60000);

    socket.send(
      JSON.stringify({
        type: "chat.send",
        requestId: "req-retry-subagent-1",
        payload: {
          projectId,
          agentId: "pi",
          content: "resume task"
        }
      })
    );

    const partialRun = await partialRunPromise;
    await firstCompletePromise;

    const retryCompletePromise = waitForEvent(socket, "chat.complete", undefined, 60000);
    socket.send(
      JSON.stringify({
        type: "run.retry",
        requestId: "req-retry-subagent-2",
        payload: {
          projectId,
          runId: partialRun.payload.run.id,
          subagentId: "task-1"
        }
      })
    );

    await retryCompletePromise;
    expect(adapter.calls.filter((call) => call.kind === "subagent" && call.prompt.includes("Inspect files"))).toHaveLength(2);
    expect(adapter.calls.filter((call) => call.kind === "subagent" && call.prompt.includes("Patch code hard"))).toHaveLength(2);
    expect(adapter.calls.filter((call) => call.kind === "aggregator")).toHaveLength(2);
    socket.close();
  }, 60000);

  test("emits project context usage updates for planner and executor", async () => {
    const socket = new WebSocket("ws://localhost:8790/ws");
    const ready = await waitForEvent(socket, "connection.ready");
    const projectId = ready.payload.workspace.activeProjectId;
    const contextEvents: any[] = [];
    const listener = (event: MessageEvent) => {
      const payload = JSON.parse(event.data as string);
      if (payload.type === "project.context") {
        contextEvents.push(payload);
      }
    };
    socket.addEventListener("message", listener);

    const completePromise = waitForEvent(socket, "chat.complete");
    socket.send(
      JSON.stringify({
        type: "chat.send",
        requestId: "req-context",
        payload: {
          projectId,
          agentId: "pi",
          content: "simple task"
        }
      })
    );

    await completePromise;
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

function waitForEvent(socket: WebSocket, type: string, predicate?: (payload: any) => boolean, timeoutMs: number = 5000) {
  return new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), timeoutMs);

    const listener = (event: MessageEvent) => {
      const payload = JSON.parse(event.data as string);
      if (payload.type === type && (predicate ? predicate(payload) : true)) {
        clearTimeout(timeout);
        socket.removeEventListener("message", listener);
        resolve(payload);
      }
    };

    socket.addEventListener("message", listener);
    socket.addEventListener("error", () => reject(new Error("socket error")), { once: true });
  });
}
