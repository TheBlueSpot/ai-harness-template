import { afterEach, beforeEach, describe, expect, test as bunTest } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMemoryEntryId, type AgentRuntimeCapability, type Assistant, type BackgroundJob, type ProviderBrand } from "../../../shared/protocol";
import type { PiAgentAdapter, PiAgentExecutionController, PiAgentPromptRequest, PiAgentPromptResult, PiApiKeyProvider } from "../pi-agent-adapter";
import {
  createSampleDocxBuffer,
  createSampleOdtBuffer,
  createSamplePdfBuffer,
  createSamplePptxBuffer,
  createSampleXlsxBuffer
} from "../document-extractors/test-fixtures";
import { clearDevHarnessServerSingleton, getDevHarnessServerSingleton } from "../dev-server-singleton";
import { startHarnessServer, type HarnessServerOsAdapters } from "../server";
import { createStartupTelemetrySession, type StartupPhaseId, type StartupTelemetrySink } from "../startup-telemetry";
import { WorkspaceRepository } from "../workspace-repository";
import type { AgentRuntime } from "../agent-runtimes/agent-runtime";
import { buildCliCapability } from "../agent-runtimes/cli-health";
import { PiRuntime } from "../agent-runtimes/pi-runtime";
import { AgentRuntimeRegistry } from "../agent-runtimes/runtime-registry";
import { useGitProjectFixture } from "./git-project-fixture";
import { createFastHarnessServerOsAdapters } from "./fast-os-adapters";

const EXPECT_ATTACHMENTS_ENABLED = Boolean(Bun.env.UPLOADTHING_TOKEN?.trim());

type ServerTestShardOptions = {
  shardIndex?: number;
  shardCount?: number;
};

function createServerTestRegistrar(options: ServerTestShardOptions = {}) {
  const shardCount = Math.max(1, Math.floor(options.shardCount ?? 1));
  const shardIndex = Math.min(shardCount - 1, Math.max(0, Math.floor(options.shardIndex ?? 0)));
  let testIndex = 0;
  return ((name: string, testFn: () => void | Promise<unknown>, timeout?: number) => {
    const currentIndex = testIndex;
    testIndex += 1;
    if (currentIndex % shardCount !== shardIndex) {
      return;
    }
    return bunTest(name, testFn, timeout);
  }) as typeof bunTest;
}

export class FakePiAgentAdapter implements PiAgentAdapter {
  readonly calls: PiAgentPromptRequest[] = [];
  private readonly callWaiters: Array<{
    kind: PiAgentPromptRequest["kind"];
    predicate?: (request: PiAgentPromptRequest) => boolean;
    resolve: (request: PiAgentPromptRequest) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = [];
  private readonly deferredSubagentReleases: Array<() => void> = [];
  private readonly deferredAggregatorReleases: Array<() => void> = [];
  private readonly retryTracker = new Set<string>();
  private readonly subagentCallCounts = new Map<string, number>();
  private readonly apiKeys: Record<PiApiKeyProvider, string | undefined> = {
    openai: undefined,
    google: undefined,
    anthropic: undefined
  };

  setApiKey(provider: PiApiKeyProvider, apiKey: string | undefined) {
    this.apiKeys[provider] = apiKey;
  }

  hasApiKey(provider: PiApiKeyProvider) {
    return Boolean(this.apiKeys[provider]);
  }

  waitForCall(
    kind: PiAgentPromptRequest["kind"],
    predicate?: (request: PiAgentPromptRequest) => boolean,
    timeoutMs: number = 5000
  ) {
    const existing = this.calls.find((call) => call.kind === kind && (predicate ? predicate(call) : true));
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise<PiAgentPromptRequest>((resolve, reject) => {
      const waiter = {
        kind,
        predicate,
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.removeCallWaiter(waiter);
          reject(new Error(`Timed out waiting for ${kind} adapter call`));
        }, timeoutMs)
      };
      this.callWaiters.push(waiter);
    });
  }

  releaseDeferredSubagents() {
    const releases = this.deferredSubagentReleases.splice(0);
    for (const release of releases) {
      release();
    }
  }

  releaseDeferredAggregators() {
    const releases = this.deferredAggregatorReleases.splice(0);
    for (const release of releases) {
      release();
    }
  }

  private recordCall(request: PiAgentPromptRequest) {
    this.calls.push(request);
    for (const waiter of [...this.callWaiters]) {
      if (waiter.kind !== request.kind || (waiter.predicate && !waiter.predicate(request))) {
        continue;
      }

      this.removeCallWaiter(waiter);
      waiter.resolve(request);
    }
  }

  private removeCallWaiter(waiter: (typeof this.callWaiters)[number]) {
    const index = this.callWaiters.indexOf(waiter);
    if (index >= 0) {
      this.callWaiters.splice(index, 1);
    }
    clearTimeout(waiter.timeout);
  }

  private waitForDeferredSubagentRelease() {
    return new Promise<void>((resolve) => {
      this.deferredSubagentReleases.push(resolve);
    });
  }

  private waitForDeferredAggregatorRelease() {
    return new Promise<void>((resolve) => {
      this.deferredAggregatorReleases.push(resolve);
    });
  }

  async runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    this.recordCall(request);
    const defaultExecutionModelId = request.modelId.startsWith("google/")
      ? "google/gemini-2.5-flash"
      : request.modelId.startsWith("anthropic/")
        ? "anthropic/claude-sonnet-4-6"
      : "openai/gpt-5.4";
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
      if (request.prompt.includes("slow needs clarification")) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      if (request.prompt.includes("same-run repeated question")) {
        if (!request.prompt.includes("first answer")) {
          return withUsage(
            JSON.stringify({
              type: "question",
              summary: "Need first detail",
              question: {
                id: "question-1",
                prompt: "First repeated question?",
                choices: [
                  {
                    id: "choice-1",
                    label: "First",
                    description: "Use first answer.",
                    answerText: "first answer",
                    recommended: true
                  },
                  {
                    id: "choice-2",
                    label: "Second",
                    description: "Use second option.",
                    answerText: "second option",
                    recommended: false
                  },
                  {
                    id: "choice-3",
                    label: "Custom",
                    description: "Type custom answer.",
                    answerText: "custom answer",
                    recommended: false
                  }
                ],
                required: true
              }
            })
          );
        }

        if (!request.prompt.includes("second answer")) {
          return withUsage(
            JSON.stringify({
              type: "question",
              summary: "Need second detail",
              question: {
                id: "question-1",
                prompt: "Second repeated question?",
                choices: [
                  {
                    id: "choice-1",
                    label: "Second",
                    description: "Use second answer.",
                    answerText: "second answer",
                    recommended: true
                  },
                  {
                    id: "choice-2",
                    label: "Alternative",
                    description: "Use alternative answer.",
                    answerText: "alternative answer",
                    recommended: false
                  },
                  {
                    id: "choice-3",
                    label: "Custom",
                    description: "Type custom answer.",
                    answerText: "custom answer",
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
            summary: "Ready after repeated questions",
            executionModelId: defaultExecutionModelId,
            usesSubagents: false,
            subtasks: [],
            finalExecutionBrief: "single-step request"
          })
        );
      }

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
            executionModelId: defaultExecutionModelId,
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
            executionModelId: defaultExecutionModelId,
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
        if (
          request.prompt.includes("complex prerequisite task") ||
          request.prompt.includes("complex aliased prerequisite task") ||
          request.prompt.includes("complex failing prerequisite task")
        ) {
          const shouldFailPrerequisite = request.prompt.includes("complex failing prerequisite task");
          const shouldUseAliasedOwner = request.prompt.includes("complex aliased prerequisite task");
          return withUsage(
            JSON.stringify({
              difficultyScore: 72,
              summary: "Split into setup and subagent work",
              executionModelId: defaultExecutionModelId,
              usesSubagents: true,
              prerequisites: [
                {
                  id: "setup-1",
                  title: shouldFailPrerequisite ? "Fail shared setup" : "Create shared setup",
                  instruction: shouldFailPrerequisite
                    ? "Fail shared setup before fan-out"
                    : "Create shared scaffold before fan-out",
                  reason: "Subagents need shared setup first",
                  requiredForTaskIds: ["task-1", "task-2"],
                  owner: shouldUseAliasedOwner ? "user" : "main"
                }
              ],
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
              contracts: [
                {
                  taskId: "task-1",
                  title: "Inspect files",
                  instruction: "Inspect the codebase",
                  effortPoints: 2,
                  ownedPaths: ["inspection.txt"],
                  dependsOnPrerequisiteIds: ["setup-1"],
                  deliverables: ["Inspect current codebase state"],
                  integrationPoints: ["Aggregator summary"],
                  verificationScope: "owned-files-only",
                  verificationCommands: ["echo verified"],
                  mergeNotes: "No merge conflicts expected."
                },
                {
                  taskId: "task-2",
                  title: "Patch code",
                  instruction: "Patch the code",
                  effortPoints: 2,
                  ownedPaths: ["patch.txt"],
                  dependsOnPrerequisiteIds: ["setup-1"],
                  deliverables: ["Patch requested code path"],
                  integrationPoints: ["Aggregator summary"],
                  verificationScope: "owned-files-only",
                  verificationCommands: ["echo verified"],
                  mergeNotes: "No merge conflicts expected."
                }
              ],
              finalExecutionBrief: "Combine setup and subagent outputs into one answer"
            })
          );
        }

        if (request.prompt.includes("tool failure burst")) {
          return withUsage(
            JSON.stringify({
              difficultyScore: 72,
              summary: "Split into tool burst and inspect work",
              executionModelId: defaultExecutionModelId,
              usesSubagents: true,
              subtasks: [
                {
                  id: "task-1",
                  title: "Tool failure task",
                  instruction: "Emit tool failure burst"
                },
                {
                  id: "task-2",
                  title: "Inspect files",
                  instruction: "Inspect the codebase"
                }
              ],
              contracts: [
                {
                  taskId: "task-1",
                  title: "Tool failure task",
                  instruction: "Emit tool failure burst",
                  effortPoints: 2,
                  ownedPaths: ["tool-burst.txt"],
                  dependsOnPrerequisiteIds: [],
                  deliverables: ["tool-burst.txt"],
                  integrationPoints: ["Aggregator summary"],
                  verificationScope: "owned-files-only",
                  verificationCommands: ["echo verified"],
                  mergeNotes: "No merge conflicts expected."
                },
                {
                  taskId: "task-2",
                  title: "Inspect files",
                  instruction: "Inspect the codebase",
                  effortPoints: 2,
                  ownedPaths: ["inspection.txt"],
                  dependsOnPrerequisiteIds: [],
                  deliverables: ["Inspect current codebase state"],
                  integrationPoints: ["Aggregator summary"],
                  verificationScope: "owned-files-only",
                  verificationCommands: ["echo verified"],
                  mergeNotes: "No merge conflicts expected."
                }
              ],
              finalExecutionBrief: "Combine the subagent outputs into one answer"
            })
          );
        }

        if (request.prompt.includes("early fail")) {
          return withUsage(
            JSON.stringify({
              difficultyScore: 72,
              summary: "Split into slow inspect and failing patch",
              executionModelId: defaultExecutionModelId,
              usesSubagents: true,
              subtasks: [
                {
                  id: "task-1",
                  title: "Inspect files",
                  instruction: "Inspect files slow"
                },
                {
                  id: "task-2",
                  title: "Patch code",
                  instruction: "Patch code always fail"
                }
              ],
              contracts: [
                {
                  taskId: "task-1",
                  title: "Inspect files",
                  instruction: "Inspect files slow",
                  effortPoints: 2,
                  ownedPaths: ["inspection.txt"],
                  dependsOnPrerequisiteIds: [],
                  deliverables: ["Inspect current codebase state"],
                  integrationPoints: ["Aggregator summary"],
                  verificationScope: "owned-files-only",
                  verificationCommands: ["echo verified"],
                  mergeNotes: "No merge conflicts expected."
                },
                {
                  taskId: "task-2",
                  title: "Patch code",
                  instruction: "Patch code always fail",
                  effortPoints: 2,
                  ownedPaths: ["patch.txt"],
                  dependsOnPrerequisiteIds: [],
                  deliverables: ["Patch requested code path"],
                  integrationPoints: ["Aggregator summary"],
                  verificationScope: "owned-files-only",
                  verificationCommands: ["echo verified"],
                  mergeNotes: "No merge conflicts expected."
                }
              ],
              finalExecutionBrief: "Combine the subagent outputs into one answer"
            })
          );
        }

        return withUsage(
          JSON.stringify({
            difficultyScore: 72,
            summary: "Split into two tasks",
            executionModelId: defaultExecutionModelId,
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
            contracts: [
              {
                taskId: "task-1",
                title: "Inspect files",
                instruction: "Inspect the codebase",
                effortPoints: 2,
                ownedPaths: ["inspection.txt"],
                dependsOnPrerequisiteIds: [],
                deliverables: ["Inspect current codebase state"],
                integrationPoints: ["Aggregator summary"],
                verificationScope: "owned-files-only",
                verificationCommands: ["echo verified"],
                mergeNotes: "No merge conflicts expected."
              },
              {
                taskId: "task-2",
                title: "Patch code",
                instruction: "Patch the code",
                effortPoints: 2,
                ownedPaths: ["patch.txt"],
                dependsOnPrerequisiteIds: [],
                deliverables: ["Patch requested code path"],
                integrationPoints: ["Aggregator summary"],
                verificationScope: "owned-files-only",
                verificationCommands: ["echo verified"],
                mergeNotes: "No merge conflicts expected."
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
          executionModelId: defaultExecutionModelId,
          usesSubagents: false,
          subtasks: [],
          finalExecutionBrief: request.prompt.includes("slow") ? "slow request" : "single-step request"
        })
      );
    }

    if (request.kind === "subagent") {
      const instruction = getLastPromptLineValue(request.prompt, "Subtask instruction:");
      const isSlowInspectSubtask = instruction === "Inspect files slow";
      const isInspectSubtask = instruction?.startsWith("Inspect") ?? false;
      const isPatchSubtask = instruction?.startsWith("Patch") ?? false;
      const isHardPatchSubtask = instruction === "Patch code hard";
      const isAlwaysFailPatchSubtask = instruction === "Patch code always fail";
      const emitsToolFailureBurst = instruction === "Emit tool failure burst";

      if (emitsToolFailureBurst) {
        for (let index = 1; index <= 3; index += 1) {
          request.onExecutionEvent?.({
            type: "tool-end",
            toolCallId: `shell-fail-${index}`,
            toolName: "shell",
            result: {
              command: "bad-command",
              exitCode: 1,
              status: "failed",
              output: "bad-command failed"
            },
            isError: true
          });
        }
        return withUsage("tool burst complete");
      }

      if (isSlowInspectSubtask) {
        request.onTextDelta?.("MILESTONE: inspecting slow files\n");
        await this.waitForDeferredSubagentRelease();
        return withUsage("inspection complete");
      }

      if (isAlwaysFailPatchSubtask) {
        throw new Error("hard failure from fake subagent");
      }

      if (isHardPatchSubtask) {
        const count = (this.subagentCallCounts.get("task-2-hard") ?? 0) + 1;
        this.subagentCallCounts.set("task-2-hard", count);
        if (count < 3) {
          throw new Error("timeout from hard fake subagent");
        }

        request.onTextDelta?.("MILESTONE: patch recovered\n");
        return withUsage("patch recovered");
      }

      if (isPatchSubtask && !this.retryTracker.has("task-2")) {
        this.retryTracker.add("task-2");
        throw new Error("timeout from fake subagent");
      }

      request.onTextDelta?.(isInspectSubtask ? "MILESTONE: inspected files\n" : "MILESTONE: patched code\n");
      return withUsage(isInspectSubtask ? "inspection complete" : "patch complete");
    }

    if (request.prompt.includes("browser noise")) {
      request.onExecutionEvent?.({ type: "session-created" });
      request.onExecutionEvent?.({
        type: "tool-start",
        toolCallId: "tool-call-1",
        toolName: "playwright-browser",
        args: { url: "https://example.com" }
      });
      request.onExecutionEvent?.({
        type: "tool-end",
        toolCallId: "tool-call-1",
        toolName: "playwright-browser",
        result: { ok: true },
        isError: false
      });
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

    if (request.kind === "executor" && request.prompt.includes("Fail shared setup before fan-out")) {
      throw new Error("prerequisite setup failed");
    }

    if (request.kind === "aggregator" && request.prompt.includes("status window")) {
      await this.waitForDeferredAggregatorRelease();
    }

    return withUsage(request.kind === "aggregator" ? "aggregated result" : "main execution result");
  }

  async startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
    let aborted = false;
    let rejectAbort: ((error: Error) => void) | undefined;
    const run = (nextRequest: PiAgentPromptRequest) => {
      if (nextRequest.kind === "executor" && nextRequest.prompt.includes("streaming refresh")) {
        this.recordCall(nextRequest);
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

class FakeCodexRuntime implements AgentRuntime {
  readonly id = "codex-cli" as const;
  readonly label = "Codex CLI";

  private capability: AgentRuntimeCapability | undefined;

  constructor(private readonly adapter: PiAgentAdapter) {}

  getAdapter() {
    return this.adapter;
  }

  getCapability() {
    return this.capability;
  }

  async refreshCapability() {
    this.capability = buildCliCapability({
      agentId: this.id,
      label: this.label,
      installed: true,
      authenticated: true,
      supportsInteractive: true,
      interactivePipeCompatible: true,
      supportsPlanning: true,
      supportsReview: true,
      supportsReasoningStrengthControl: true,
      supportsFastModeControl: true,
      discoveredModels: ["openai/gpt-5.4", "openai/gpt-5.4-mini"],
      activeModel: "openai/gpt-5.4",
      modelDiscoveryConfidence: "exact"
    });
    return this.capability;
  }

  getDefaultPlanningModelId() {
    return "openai/gpt-5.4";
  }

  getDefaultExecutionModelId() {
    return "openai/gpt-5.4";
  }

  getDefaultSubagentModelId(_providerBrand?: ProviderBrand, executionModelId?: string) {
    return executionModelId === "openai/gpt-5.4" ? "openai/gpt-5.4-mini" : "openai/gpt-5.4";
  }
}

function getLastPromptLineValue(prompt: string, prefix: string) {
  const line = prompt
    .split(/\r?\n/)
    .reverse()
    .map((entry) => entry.trimStart())
    .find((entry) => entry.startsWith(prefix));
  return line?.slice(prefix.length).trim();
}

class FakeClock {
  private nextTimerId = 1;
  private readonly timers = new Map<number, { runAt: number; callback: () => void }>();
  nowMs = 0;

  now = () => this.nowMs;

  setTimeout = ((callback: TimerHandler, delay?: number) => {
    const timerId = this.nextTimerId++;
    this.timers.set(timerId, {
      runAt: this.nowMs + Number(delay ?? 0),
      callback: () => {
        if (typeof callback === "function") {
          callback();
          return;
        }

        throw new Error("String timer callbacks are not supported in tests");
      }
    });
    return timerId as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof globalThis.setTimeout;

  clearTimeout = ((timerId: ReturnType<typeof setTimeout>) => {
    this.timers.delete(Number(timerId));
  }) as unknown as typeof globalThis.clearTimeout;

  advanceBy(durationMs: number) {
    const targetMs = this.nowMs + durationMs;
    while (true) {
      const nextTimer = [...this.timers.entries()].sort((left, right) => left[1].runAt - right[1].runAt)[0];
      if (!nextTimer || nextTimer[1].runAt > targetMs) {
        break;
      }

      this.nowMs = nextTimer[1].runAt;
      this.timers.delete(nextTimer[0]);
      nextTimer[1].callback();
    }

    this.nowMs = targetMs;
  }
}

type FakeStartupEvent = {
  attempt: number;
  kind: "session-start" | "phase-start" | "phase-pulse" | "phase-complete" | "retry" | "complete" | "failed";
  phaseId?: StartupPhaseId;
  message: string;
  details?: Record<string, unknown>;
};

function createFakeStartupTelemetry(): StartupTelemetrySink & { events: FakeStartupEvent[] } {
  const events: FakeStartupEvent[] = [];
  let attempt = 1;
  let currentPhaseId: StartupPhaseId | undefined;

  return {
    events,
    logPath: path.join(process.cwd(), ".tmp-test-data", `startup-${crypto.randomUUID()}.jsonl`),
    sessionStart(message = "session start", details) {
      events.push({ attempt, kind: "session-start", message, details });
    },
    pulse(message, details) {
      events.push({ attempt, kind: "phase-pulse", phaseId: currentPhaseId, message, details });
    },
    phaseStart(phaseId, message, details) {
      currentPhaseId = phaseId;
      events.push({ attempt, kind: "phase-start", phaseId, message, details });
    },
    phaseComplete(message, details) {
      events.push({ attempt, kind: "phase-complete", phaseId: currentPhaseId, message, details });
      currentPhaseId = undefined;
    },
    retry(message, details) {
      events.push({ attempt, kind: "retry", phaseId: currentPhaseId, message, details });
      currentPhaseId = undefined;
      attempt += 1;
    },
    complete(message, details) {
      events.push({ attempt, kind: "complete", phaseId: currentPhaseId, message, details });
      currentPhaseId = undefined;
    },
    failed(message, details) {
      events.push({ attempt, kind: "failed", phaseId: currentPhaseId, message, details });
    },
    getAttempt() {
      return attempt;
    },
    getCurrentPhaseId() {
      return currentPhaseId;
    },
    dispose() {}
  };
}


type StartServerForTestInput = Parameters<typeof startHarnessServer>[0] & {
  useFastOsAdapters?: boolean;
};

export async function stopServerForTest(server: Awaited<ReturnType<typeof startHarnessServer>> | undefined) {
  if (!server) {
    return;
  }
  await Promise.resolve(server.stop(true));
}

export async function startServerForTest(input: StartServerForTestInput) {
  const runtimeRegistry = input.runtimeRegistry ?? (input.adapter ? createFastTestRuntimeRegistry(input.adapter) : undefined);
  const osAdapters = resolveTestOsAdapters(input);
  const server = await startHarnessServer({
    ...input,
    port: input.port ?? 0,
    hostname: input.hostname ?? "127.0.0.1",
    runtimeRegistry,
    osAdapters
  });
  if (server.port === undefined) {
    throw new Error("Harness server did not report a bound port");
  }
  return { server, port: server.port };
}

function resolveTestOsAdapters(input: StartServerForTestInput): Partial<HarnessServerOsAdapters> | undefined {
  if (input.useFastOsAdapters === false) {
    return input.osAdapters;
  }

  const fastAdapters = createFastHarnessServerOsAdapters();
  return {
    ...fastAdapters,
    ...input.osAdapters
  };
}

export function createFastTestRuntimeRegistry(adapter: PiAgentAdapter) {
  return new AgentRuntimeRegistry([new PiRuntime(adapter)]);
}

export function waitForAdapterCall(
  adapter: FakePiAgentAdapter,
  kind: PiAgentPromptRequest["kind"],
  timeoutMs: number = 5000
) {
  return adapter.waitForCall(kind, undefined, timeoutMs);
}

export async function executeReadyRunUntil(
  socket: EventTarget & { send: (payload: string) => void },
  input: { requestId: string; projectId: string; threadId: string; runId: string },
  waiters: Array<Promise<any>>,
  timeoutMs: number = 5000,
  options: {
    includeChatComplete?: boolean;
  } = {}
) {
  const completePromise = options.includeChatComplete === false
    ? undefined
    : waitForEvent(socket, "chat.complete", undefined, timeoutMs).then((event) => ({ kind: "complete", event }));
  const rejectedPromise = waitForEvent(socket, "command.rejected", undefined, timeoutMs)
    .then((event) => ({ kind: "rejected", event }))
    .catch(() => undefined);
  const alternatePromises = waiters.map((waiter) => waiter.then((event) => ({ kind: "alternate", event })));

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

  const outcome = await Promise.race([completePromise, rejectedPromise, ...alternatePromises].filter(Boolean));
  if (!outcome) {
    throw new Error("Execution waiter resolved without outcome");
  }
  if (outcome.kind === "rejected") {
    throw new Error(outcome.event.payload?.detail ?? outcome.event.payload?.message ?? "Run execution rejected");
  }
  return outcome.event;
}

export function registerServerStartupTests(options: ServerTestShardOptions = {}) {
  describe("harness server startup", () => {
    const serverTest = createServerTestRegistrar(options);
    const fixture = useGitProjectFixture({
      fixtureName: "server-startup",
      packageName: "test-project",
      readmeTitle: "# Test Project\n",
      gitIgnore: ".local\nnode_modules\ndist\n"
    });
    let server: Awaited<ReturnType<typeof startHarnessServer>>;
    let adapter: FakePiAgentAdapter;
    let repository: WorkspaceRepository;
    let dbPath: string;
    let extraProjectRoot: string;
    let projectRoot: string;
    let port: number;

    beforeEach(async () => {
      projectRoot = await fixture.createRepoClone(`repo-${crypto.randomUUID()}`);
      extraProjectRoot = fixture.createTempDir(`project-${crypto.randomUUID()}`);
      dbPath = ":memory:";
      port = 0;

      adapter = new FakePiAgentAdapter();
      repository = new WorkspaceRepository(dbPath, projectRoot, { durability: "test-fast" });
      ({ server, port } = await startServerForTest({
        port: 0,
        adapter,
        repository,
        pickFolder: async () => extraProjectRoot,
        serverOnly: true
      }));
    });

    afterEach(async () => {
      await stopServerForTest(server);
    });


    
      serverTest("accepts websocket commands and rejects malformed payloads", async () => {
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


    
      serverTest("returns ready state and persisted workspace on connect", async () => {
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
        expect(ready.payload.preferences.autoCompactContextThresholdPercentDefault).toBe(40);
        expect(ready.payload.preferences.planExecutionModeDefault).toBe("countdown");
        expect(ready.payload.preferences.planExecutionDelaySecondsDefault).toBe(10);
        expect(ready.payload.preferences.correctnessIterationModeDefault).toBe("ask-before-iterate");
        expect(ready.payload.preferences.memoryBankEnabledDefault).toBe(true);
        expect(ready.payload.preferences.memoryBankRecordRunsDefault).toBe(true);
        expect(ready.payload.preferences.attachmentsEnabled).toBe(EXPECT_ATTACHMENTS_ENABLED);
        expect(ready.payload.setup.launchMode).toBe("source");
        expect(ready.payload.setup.checks.some((check: { id: string }) => check.id === "project-selected")).toBe(true);
        expect(ready.payload.executionControl.isPaused).toBe(false);
        expect(ready.payload.executionControl.deferredPlanningQuestionCount).toBe(0);
        socket.close();
      });


      serverTest("serverOnly startup phase order is bootstrap, workspace, runtimes, setup, serve, complete", async () => {
        await stopServerForTest(server);
        const telemetry = createFakeStartupTelemetry();

        server = await startHarnessServer({
          port: 0,
          adapter,
          repository,
          runtimeRegistry: createFastTestRuntimeRegistry(adapter),
          pickFolder: async () => extraProjectRoot,
          serverOnly: true,
          startupTelemetry: telemetry
        });

        expect(
          telemetry.events.filter((event) => event.kind === "phase-start").map((event) => event.phaseId)
        ).toEqual(["bootstrap", "workspace", "runtimes", "setup", "serve"]);
        expect(
          telemetry.events.filter((event) => event.kind === "phase-complete").map((event) => event.phaseId)
        ).toEqual(["bootstrap", "workspace", "runtimes", "setup", "serve"]);
        expect(telemetry.events.some((event) => event.phaseId === "ui-assets")).toBe(false);
        expect(telemetry.events.at(-1)?.kind).toBe("complete");
      });


      serverTest("non-server-only startup includes ui-assets once with injected ui asset manager", async () => {
        await stopServerForTest(server);
        const telemetry = createFakeStartupTelemetry();
        const uiAssetCalls: string[] = [];

        server = await startHarnessServer({
          port: 0,
          adapter,
          repository,
          runtimeRegistry: createFastTestRuntimeRegistry(adapter),
          pickFolder: async () => extraProjectRoot,
          serverOnly: false,
          startupTelemetry: telemetry,
          uiAssetManagerFactory() {
            return {
              async ensureBuilt() {
                uiAssetCalls.push("ensureBuilt");
              },
              startWatching() {
                uiAssetCalls.push("startWatching");
              },
              resolveAsset() {
                return undefined;
              },
              getLiveReloadState() {
                return {
                  revision: 0,
                  building: false,
                  pending: false
                };
              },
              dispose() {
                uiAssetCalls.push("dispose");
              }
            };
          }
        });

        expect(
          telemetry.events.filter((event) => event.kind === "phase-start" && event.phaseId === "ui-assets")
        ).toHaveLength(1);
        expect(uiAssetCalls).toEqual(["ensureBuilt", "startWatching"]);
      });


      serverTest("hot dev mode reuses one server instance and opens browser once", async () => {
        await stopServerForTest(server);
        const openCalls: string[] = [];

        server = await startHarnessServer({
          port: 0,
          adapter,
          repository,
          runtimeRegistry: createFastTestRuntimeRegistry(adapter),
          pickFolder: async () => extraProjectRoot,
          serverOnly: false,
          devHotMode: true,
          openBrowser: true,
          browserLauncher: async (url) => {
            openCalls.push(url);
          }
        });

        const reloadedServer = await startHarnessServer({
          port: 0,
          adapter,
          repository,
          runtimeRegistry: createFastTestRuntimeRegistry(adapter),
          pickFolder: async () => extraProjectRoot,
          serverOnly: false,
          devHotMode: true,
          openBrowser: true,
          browserLauncher: async (url) => {
            openCalls.push(url);
          }
        });

        expect(reloadedServer).toBe(server);
        expect(openCalls).toHaveLength(1);
      });

      serverTest("hot dev mode replaces stale scheduler state and queues due jobs after reload", async () => {
        await stopServerForTest(server);

        server = await startHarnessServer({
          port: 0,
          adapter,
          repository,
          runtimeRegistry: createFastTestRuntimeRegistry(adapter),
          pickFolder: async () => extraProjectRoot,
          serverOnly: true,
          devHotMode: true,
          hotReloadDebounceMs: 0
        });

        const singletonBefore = getDevHarnessServerSingleton<
          { scheduler: { stop(): void; start(): void } },
          unknown,
          unknown,
          unknown
        >();
        expect(singletonBefore).toBeDefined();
        const firstScheduler = singletonBefore!.state.scheduler;
        firstScheduler.stop();
        Object.defineProperty(firstScheduler, "timer", {
          value: setTimeout(() => {}, 60_000),
          configurable: true,
          writable: true
        });

        const project = repository.addProject(projectRoot);
        const now = Date.now();
        const jobId = crypto.randomUUID();
        repository.saveBackgroundJob({
          id: jobId,
          projectId: project.id,
          automationThreadId: crypto.randomUUID(),
          kind: "ai-routine",
          name: "Hot reload due job",
          status: "enabled",
          riskLevel: "unsafe",
          definition: {
            kind: "ai-routine",
            prompt: "Review repo.",
            modeId: "implement"
          },
          schedule: {
            type: "interval",
            intervalSeconds: 600,
            nextRunAt: new Date(now - 60_000).toISOString(),
            sourceText: "10m"
          },
          scheduleInput: "10m",
          nextRunAt: new Date(now - 60_000).toISOString(),
          createdAt: new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString()
        } satisfies BackgroundJob);

        const reloadedServer = await startHarnessServer({
          port: 0,
          adapter,
          repository,
          runtimeRegistry: createFastTestRuntimeRegistry(adapter),
          pickFolder: async () => extraProjectRoot,
          serverOnly: true,
          devHotMode: true,
          hotReloadDebounceMs: 0
        });

        await waitForCondition(() => repository.getActiveBackgroundJobRuns(jobId).length === 1);
        const singletonAfter = getDevHarnessServerSingleton<
          { scheduler: { stop(): void; start(): void } },
          unknown,
          unknown,
          unknown
        >();
        const activeRun = repository.getActiveBackgroundJobRuns(jobId)[0];
        expect(reloadedServer).toBe(server);
        expect(singletonAfter?.state.scheduler).not.toBe(firstScheduler);
        expect(activeRun?.status).toBe("awaiting-approval");
      });


      serverTest("hot dev mode uses debounced static ui assets with live reload polling", async () => {
        await stopServerForTest(server);
        const telemetry = createFakeStartupTelemetry();
        const uiAssetCalls: string[] = [];
        let receivedDebounceMs = -1;

        server = await startHarnessServer({
          port: 0,
          adapter,
          repository,
          runtimeRegistry: createFastTestRuntimeRegistry(adapter),
          pickFolder: async () => extraProjectRoot,
          serverOnly: false,
          devHotMode: true,
          startupTelemetry: telemetry,
          uiAssetManagerFactory(options) {
            receivedDebounceMs = options?.debounceMs ?? -1;
            return {
              async ensureBuilt() {
                uiAssetCalls.push("ensureBuilt");
              },
              startWatching() {
                uiAssetCalls.push("startWatching");
              },
              resolveAsset() {
                return undefined;
              },
              getLiveReloadState() {
                return {
                  revision: 1,
                  building: false,
                  pending: false
                };
              },
              dispose() {
                uiAssetCalls.push("dispose");
              }
            };
          }
        });

        expect(receivedDebounceMs).toBe(30_000);
        expect(uiAssetCalls).toEqual(["ensureBuilt", "startWatching"]);
        expect(
          telemetry.events.filter((event) => event.kind === "phase-start" && event.phaseId === "ui-assets")
        ).toHaveLength(1);
      });


      serverTest("hot dev mode delays backend handler apply until debounce window ends", async () => {
        await stopServerForTest(server);
        const clock = new FakeClock();
        const firstRoot = fixture.createTempDir(`first-hot-root-${crypto.randomUUID()}`);
        const secondRoot = fixture.createTempDir(`second-hot-root-${crypto.randomUUID()}`);

        server = await startHarnessServer({
          port: 0,
          adapter,
          repository,
          runtimeRegistry: createFastTestRuntimeRegistry(adapter),
          pickFolder: async () => firstRoot,
          serverOnly: false,
          devHotMode: true,
          hotReloadDebounceMs: 30_000,
          timerApi: {
            setTimeout: clock.setTimeout,
            clearTimeout: clock.clearTimeout
          }
        });

        const singletonBeforeReload = getDevHarnessServerSingleton<any, any, any, any>();
        expect(await singletonBeforeReload?.state.pickFolder()).toBe(firstRoot);

        await startHarnessServer({
          port: 0,
          adapter,
          repository,
          runtimeRegistry: createFastTestRuntimeRegistry(adapter),
          pickFolder: async () => secondRoot,
          serverOnly: false,
          devHotMode: true,
          hotReloadDebounceMs: 30_000,
          timerApi: {
            setTimeout: clock.setTimeout,
            clearTimeout: clock.clearTimeout
          }
        });

        const singletonDuringDebounce = getDevHarnessServerSingleton<any, any, any, any>();
        expect(await singletonDuringDebounce?.state.pickFolder()).toBe(firstRoot);
        clock.advanceBy(29_999);
        expect(await singletonDuringDebounce?.state.pickFolder()).toBe(firstRoot);

        clock.advanceBy(1);
        await Promise.resolve();

        const singletonAfterDebounce = getDevHarnessServerSingleton<any, any, any, any>();
        expect(await singletonAfterDebounce?.state.pickFolder()).toBe(secondRoot);
      });


      serverTest("hot singleton version mismatch forces one controlled restart", async () => {
        await stopServerForTest(server);

        server = await startHarnessServer({
          port: 0,
          adapter,
          repository,
          runtimeRegistry: createFastTestRuntimeRegistry(adapter),
          pickFolder: async () => extraProjectRoot,
          serverOnly: true,
          devHotMode: true,
          hotSingletonVersion: 1
        });
        const firstServer = server;

        const restartedServer = await startHarnessServer({
          port: 0,
          adapter,
          repository,
          runtimeRegistry: createFastTestRuntimeRegistry(adapter),
          pickFolder: async () => extraProjectRoot,
          serverOnly: true,
          devHotMode: true,
          hotSingletonVersion: 2
        });

        server = restartedServer;
        expect(restartedServer).not.toBe(firstServer);
      });


      serverTest("startup completion fires when server url is available, before any websocket client connects", async () => {
        await stopServerForTest(server);
        const telemetry = createFakeStartupTelemetry();

        server = await startHarnessServer({
          port: 0,
          adapter,
          repository,
          runtimeRegistry: createFastTestRuntimeRegistry(adapter),
          pickFolder: async () => extraProjectRoot,
          serverOnly: true,
          startupTelemetry: telemetry
        });

        const completionEvent = telemetry.events.at(-1);
        expect(completionEvent?.kind).toBe("complete");
        expect(completionEvent?.message).toContain(`http://localhost:${server.port}`);
      });


      serverTest("slow ui-assets phase emits targeted hint without aborting startup", async () => {
        await stopServerForTest(server);
        const clock = new FakeClock();
        const startupLines: string[] = [];
        const resolveQueue: Array<() => void> = [];
        const telemetry = createStartupTelemetrySession({
          now: clock.now,
          tmpDir: path.join(process.cwd(), ".tmp-test-data", `startup-server-${crypto.randomUUID()}`),
          writeLine(line) {
            startupLines.push(line);
          },
          setTimeout: clock.setTimeout,
          clearTimeout: clock.clearTimeout
        });

        const startPromise = startHarnessServer({
          port: 0,
          adapter,
          repository,
          runtimeRegistry: createFastTestRuntimeRegistry(adapter),
          pickFolder: async () => extraProjectRoot,
          serverOnly: false,
          startupTelemetry: telemetry,
          uiAssetManagerFactory() {
            return {
              ensureBuilt() {
                return new Promise<void>((resolve) => {
                  resolveQueue.push(resolve);
                });
              },
              startWatching() {},
              resolveAsset() {
                return undefined;
              },
              getLiveReloadState() {
                return {
                  revision: 0,
                  building: false,
                  pending: true
                };
              },
              dispose() {}
            };
          }
        });

        await waitForCondition(() => telemetry.getCurrentPhaseId() === "ui-assets");
        clock.advanceBy(5_001);
        expect(startupLines.some((line) => line.includes("ui-assets slow"))).toBe(true);
        expect(startupLines.some((line) => line.includes("Bun/Solid/Tailwind build stall"))).toBe(true);

        resolveQueue.pop()?.();
        server = await startPromise;
      });


      serverTest("emits setup.updated on explicit setup refresh and project activation changes", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const activatedSetupPromise = waitForEvent(
          socket,
          "setup.updated",
          (event) =>
            event.requestId === "req-setup-open" &&
            event.payload.setup.checks.some(
              (check: { id: string; status: string }) => check.id === "project-selected" && check.status === "ready"
            )
        );
        const opened = await openProject(socket, projectRoot, "req-setup-open");
    
        await activatedSetupPromise;
    
        const refreshedSetupPromise = waitForEvent(socket, "setup.updated", (event) => event.requestId === "req-setup-refresh");
        socket.send(
          JSON.stringify({
            type: "setup.refresh",
            requestId: "req-setup-refresh"
          })
        );
    
        const refreshed = await refreshedSetupPromise;
        expect(refreshed.payload.setup.readyRequiredCount).toBeGreaterThan(0);
        expect(refreshed.payload.setup.checks.some((check: { id: string }) => check.id === "git-available")).toBe(true);
        expect(opened.payload.project.id).toBe(repository.loadWorkspace().activeProjectId);
        socket.close();
      });
  });
}

export function registerServerPreferencesAndModesTests(options: ServerTestShardOptions = {}) {
  describe("harness server preferences and modes", () => {
    const serverTest = createServerTestRegistrar(options);
    const fixture = useGitProjectFixture({
      fixtureName: "server-preferences",
      packageName: "test-project",
      readmeTitle: "# Test Project\n",
      gitIgnore: ".local\nnode_modules\ndist\n"
    });
    let server: Awaited<ReturnType<typeof startHarnessServer>>;
    let adapter: FakePiAgentAdapter;
    let repository: WorkspaceRepository;
    let dbPath: string;
    let extraProjectRoot: string;
    let projectRoot: string;
    let port: number;

    beforeEach(async () => {
      projectRoot = await fixture.createRepoClone(`repo-${crypto.randomUUID()}`);
      extraProjectRoot = fixture.createTempDir(`project-${crypto.randomUUID()}`);
      dbPath = ":memory:";
      port = 0;

      adapter = new FakePiAgentAdapter();
      repository = new WorkspaceRepository(dbPath, projectRoot, { durability: "test-fast" });
      ({ server, port } = await startServerForTest({
        port: 0,
        adapter,
        repository,
        pickFolder: async () => extraProjectRoot,
        serverOnly: true
      }));
    });

    afterEach(async () => {
      await stopServerForTest(server);
    });


    
      serverTest("saves preferences and persists API key", async () => {
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
              subagentWorktreeStrategyDefault: "separate-worktrees",
              blockChatOnDirtyGitDefault: false,
              dirtyGitChangeLimitDefault: 9,
              autoCompactContextThresholdPercentDefault: 55,
              planExecutionModeDefault: "approve",
              planExecutionDelaySecondsDefault: 15,
              correctnessIterationModeDefault: "auto-once",
              backgroundJobApprovalPolicyDefault: "ask-risky",
              memoryBankEnabledDefault: false,
              memoryBankRecordRunsDefault: false
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
        expect(saved.payload.attachmentsEnabled).toBe(EXPECT_ATTACHMENTS_ENABLED);
        expect(saved.payload.subagentWorktreeStrategyDefault).toBe("separate-worktrees");
        expect(saved.payload.blockChatOnDirtyGitDefault).toBe(false);
        expect(saved.payload.dirtyGitChangeLimitDefault).toBe(9);
        expect(saved.payload.autoCompactContextThresholdPercentDefault).toBe(55);
        expect(saved.payload.planExecutionModeDefault).toBe("approve");
        expect(saved.payload.planExecutionDelaySecondsDefault).toBe(15);
        expect(saved.payload.correctnessIterationModeDefault).toBe("auto-once");
        expect(saved.payload.backgroundJobApprovalPolicyDefault).toBe("ask-risky");
        expect(saved.payload.memoryBankEnabledDefault).toBe(false);
        expect(saved.payload.memoryBankRecordRunsDefault).toBe(false);
        expect(saved.payload.setup.checks.some((check: { id: string }) => check.id === "provider-auth")).toBe(true);
        expect(repository.getStoredOpenAiApiKey()).toBe("sk-local-123");
        expect(repository.getStoredGoogleApiKey()).toBe("AIza-local-456");
        expect(repository.getAutoCompactContextThresholdPercentDefault()).toBe(55);
        expect(repository.getMemoryBankEnabledDefault()).toBe(false);
        expect(repository.getMemoryBankRecordRunsDefault()).toBe(false);
        socket.close();
      });

      serverTest("tests provider connection with draft key without persisting it", async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
          expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sk-draft-only");
          return new Response(JSON.stringify({ data: [{ id: "model-1" }, { id: "model-2" }] }), { status: 200 });
        }) as unknown as typeof fetch;

        try {
          const socket = createSocket(port);
          await waitForEvent(socket, "connection.ready");
          const testedPromise = waitForEvent(socket, "preferences.providerConnectionTested");

          socket.send(
            JSON.stringify({
              type: "preferences.testProviderConnection",
              requestId: "req-test-openai",
              payload: {
                provider: "openai",
                apiKey: "sk-draft-only"
              }
            })
          );

          const tested = await testedPromise;
          expect(tested.payload.status).toBe("ready");
          expect(tested.payload.modelCount).toBe(2);
          expect(repository.getStoredOpenAiApiKey()).toBeUndefined();
          socket.close();
        } finally {
          globalThis.fetch = originalFetch;
        }
      });

      serverTest("provider connection test fails when no key is available", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const testedPromise = waitForEvent(socket, "preferences.providerConnectionTested");

        socket.send(
          JSON.stringify({
            type: "preferences.testProviderConnection",
            requestId: "req-test-missing-key",
            payload: {
              provider: "anthropic"
            }
          })
        );

        const tested = await testedPromise;
        expect(tested.payload.provider).toBe("anthropic");
        expect(tested.payload.status).toBe("failed");
        expect(tested.payload.message).toBe("No API key available.");
        socket.close();
      });

      serverTest("provider connection test sanitizes provider failures", async () => {
        const originalFetch = globalThis.fetch;
        repository.setStoredGoogleApiKey("AIza-secret");
        globalThis.fetch = (async () =>
          new Response(JSON.stringify({ error: { message: "Invalid API key AIza-secret" } }), {
            status: 401
          })) as unknown as typeof fetch;

        try {
          const socket = createSocket(port);
          await waitForEvent(socket, "connection.ready");
          const testedPromise = waitForEvent(socket, "preferences.providerConnectionTested");

          socket.send(
            JSON.stringify({
              type: "preferences.testProviderConnection",
              requestId: "req-test-google-fail",
              payload: {
                provider: "google"
              }
            })
          );

          const tested = await testedPromise;
          expect(tested.payload.status).toBe("failed");
          expect(tested.payload.message).toContain("[redacted]");
          expect(tested.payload.message).not.toContain("AIza-secret");
          socket.close();
        } finally {
          globalThis.fetch = originalFetch;
        }
      });

      serverTest("reorders memory entries through websocket command", async () => {
        const project = repository.addProject(projectRoot);
        const now = new Date().toISOString();
        const first = repository.saveMemoryEntry({
          id: createMemoryEntryId(),
          projectId: project.id,
          kind: "task-summary",
          status: "active",
          title: "First",
          summary: "First summary",
          tags: [],
          pathGlobs: [],
          confidence: "medium",
          freshness: "fresh",
          pinned: false,
          priority: 100,
          hitCount: 0,
          createdAt: now,
          updatedAt: now
        })!;
        const second = repository.saveMemoryEntry({
          id: createMemoryEntryId(),
          projectId: project.id,
          kind: "task-summary",
          status: "active",
          title: "Second",
          summary: "Second summary",
          tags: [],
          pathGlobs: [],
          confidence: "medium",
          freshness: "fresh",
          pinned: false,
          priority: 200,
          hitCount: 0,
          createdAt: now,
          updatedAt: now
        })!;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const reorderedPromise = waitForEvent(socket, "memory.reordered");

        socket.send(
          JSON.stringify({
            type: "memory.reorder",
            requestId: "req-memory-reorder",
            payload: {
              projectId: project.id,
              memoryEntryId: second.id,
              direction: "up"
            }
          })
        );

        const reordered = await reorderedPromise;
        expect(reordered.payload.entries.map((entry: { id: string }) => entry.id)).toEqual([second.id, first.id]);
        socket.close();
      });


    
      serverTest("marks setup ready when a CLI runtime works without Pi API keys", async () => {
        await stopServerForTest(server);
        ({ server, port } = await startServerForTest({
          port: 0,
          adapter,
          repository,
          runtimeRegistry: new AgentRuntimeRegistry([new PiRuntime(adapter), new FakeCodexRuntime(adapter)]),
          serverOnly: true
        }));
    
        const socket = createSocket(port);
        const ready = await waitForEvent(socket, "connection.ready");
        const checks = ready.payload.setup.checks as Array<{ id: string; status: string; requiredForFirstTask: boolean }>;
        expect(checks.find((check) => check.id === "agent-available")?.status).toBe("ready");
        expect(checks.find((check) => check.id === "provider-auth")?.status).toBe("action-required");
        expect(checks.find((check) => check.id === "provider-auth")?.requiredForFirstTask).toBe(false);
        socket.close();
      });


    
      serverTest("clears persisted API key", async () => {
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
        expect(cleared.payload.setup.checks.some((check: { id: string; status: string }) => check.id === "provider-auth")).toBe(true);
        expect(repository.getStoredOpenAiApiKey()).toBeUndefined();
        expect(repository.getStoredGoogleApiKey()).toBeUndefined();
        socket.close();
      });


    
      serverTest("uses gemini planning and subagent defaults when provider brand is gemini", async () => {
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
    
        await waitForAdapterCall(adapter, "subagent", 30000);
        await waitForAdapterCall(adapter, "aggregator", 30000);
    
        expect(adapter.calls[0]?.modelId).toBe("google/gemini-3-flash-preview");
        expect(adapter.calls.filter((call) => call.kind === "subagent").every((call) => call.modelId === "google/gemini-2.5-flash-lite")).toBe(true);
        expect(adapter.calls.some((call) => call.kind === "aggregator")).toBe(true);
        socket.close();
      }, 60000);


      serverTest("uses codex planning default even when provider brand is gemini", async () => {
        await stopServerForTest(server);
        repository.setProviderBrand("gemini");
        ({ server, port } = await startServerForTest({
          port: 0,
          adapter,
          repository,
          runtimeRegistry: new AgentRuntimeRegistry([new PiRuntime(adapter), new FakeCodexRuntime(adapter)]),
          pickFolder: async () => extraProjectRoot,
          serverOnly: true
        }));

        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(
          socket,
          {
            requestId: "req-codex-planner-model",
            projectId,
            threadId,
            agentId: "codex-cli",
            content:
              "Implement a protocol migration with database persistence, concurrency handling, integration tests, and end to end verification."
          },
          30000
        );

        expect(adapter.calls[0]?.kind).toBe("planner");
        expect(adapter.calls[0]?.modelId).toBe("openai/gpt-5.4");
        expect(ready.payload.run.planningModelId).toBe("openai/gpt-5.4");
        socket.close();
      }, 60000);


      serverTest("uses same-family codex subagent defaults with low reasoning", async () => {
        await stopServerForTest(server);
        repository.setProviderBrand("gemini");
        repository.setSubagentWorktreeStrategyDefault("separate-worktrees");
        ({ server, port } = await startServerForTest({
          port: 0,
          adapter,
          repository,
          runtimeRegistry: new AgentRuntimeRegistry([new PiRuntime(adapter), new FakeCodexRuntime(adapter)]),
          pickFolder: async () => extraProjectRoot,
          serverOnly: true
        }));

        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(
          socket,
          {
            requestId: "req-codex-subagents",
            projectId,
            threadId,
            agentId: "codex-cli",
            content: "complex task",
            reasoningStrength: "extra-high"
          },
          30000
        );

        socket.send(
          JSON.stringify({
            type: "run.execute",
            requestId: "req-codex-subagents-execute",
            payload: {
              projectId,
              threadId,
              runId: ready.payload.run.id,
              reasoningStrength: "extra-high"
            }
          })
        );

        await waitForAdapterCall(adapter, "subagent", 30000);
        await waitForAdapterCall(adapter, "aggregator", 30000);

        const subagentCalls = adapter.calls.filter((call) => call.kind === "subagent");
        expect(subagentCalls.length).toBeGreaterThan(0);
        expect(subagentCalls.every((call) => call.modelId === "openai/gpt-5.4-mini")).toBe(true);
        socket.close();
      }, 60000);


      serverTest("passes fast mode and low reasoning to same-worktree subagents", async () => {
        await stopServerForTest(server);
        repository.setProviderBrand("gemini");
        repository.setSubagentWorktreeStrategyDefault("same-worktree");
        ({ server, port } = await startServerForTest({
          port: 0,
          adapter,
          repository,
          runtimeRegistry: new AgentRuntimeRegistry([new PiRuntime(adapter), new FakeCodexRuntime(adapter)]),
          pickFolder: async () => extraProjectRoot,
          serverOnly: true
        }));

        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(
          socket,
          {
            requestId: "req-codex-same-worktree",
            projectId,
            threadId,
            agentId: "codex-cli",
            content: "complex task",
            reasoningStrength: "extra-high"
          },
          30000
        );

        socket.send(
          JSON.stringify({
            type: "run.execute",
            requestId: "req-codex-same-worktree-execute",
            payload: {
              projectId,
              threadId,
              runId: ready.payload.run.id,
              reasoningStrength: "extra-high",
              fastMode: true
            }
          })
        );

        await waitForAdapterCall(adapter, "subagent", 30000);
        await waitForAdapterCall(adapter, "aggregator", 30000);

        const subagentCalls = adapter.calls.filter((call) => call.kind === "subagent");
        expect(subagentCalls.length).toBeGreaterThan(0);
        expect(subagentCalls.every((call) => call.modelId === "openai/gpt-5.4-mini")).toBe(true);
        expect(subagentCalls.every((call) => call.reasoningStrength === "low")).toBe(true);
        expect(subagentCalls.every((call) => call.fastMode === true)).toBe(true);
        socket.close();
      }, 60000);


      serverTest("emits an initial fast mode status message when enabled", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const fastModeMessagePromise = waitForEvent(
          socket,
          "chat.message-appended",
          (event) => event.payload.message.role === "system" && event.payload.message.content.includes("Fast mode enabled"),
          10000
        );
        const readyPromise = sendChatUntilReady(
          socket,
          {
            requestId: "req-fast-mode-status",
            projectId,
            threadId,
            content: "complex task",
            fastMode: true
          },
          10000
        );

        const fastModeMessage = await fastModeMessagePromise;
        const ready = await readyPromise;
        expect(fastModeMessage.payload.message.content).toContain("Fast mode enabled");
        expect(ready.payload.run.status).toBe("ready");
        socket.close();
      }, 60000);

      serverTest("chat.send message append includes refreshed generated thread title", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const appendPromise = waitForEvent(
          socket,
          "chat.message-appended",
          (event) => event.payload.threadId === threadId && event.payload.message.role === "user",
          10000
        );

        socket.send(
          JSON.stringify({
            type: "chat.send",
            requestId: "req-generated-title-refresh",
            payload: {
              projectId,
              threadId,
              agentId: "pi",
              content: "build sidebar sorting"
            }
          })
        );

        const appended = await appendPromise;
        expect(appended.payload.thread?.title).toBe("build sidebar sorting");
        expect(appended.payload.thread?.lastUserMessageAt).toBe(appended.payload.message.createdAt);
        socket.close();
      }, 60000);


    
      serverTest("chat.send presents a ready plan before execution", async () => {
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

      serverTest("chat.send creates explicit project assistants without running project planner", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        repository.setProviderBrand("gemini");
        const assistantUpdatePromise = waitForEvent(
          socket,
          "assistants.updated",
          (event) => event.payload.assistants.assistants.some((assistant: { name: string }) => assistant.name === "Catalog builder"),
          10000
        );
        const cardPromise = waitForEvent(
          socket,
          "assistant.created-card",
          (event) => event.payload.assistant.name === "Catalog builder",
          10000
        );
        const messagePromise = waitForEvent(
          socket,
          "thread.message-appended",
          (event) => event.payload.message.role === "assistant" && event.payload.message.content.includes("Created project assistant"),
          10000
        );

        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-create-assistant-chat",
              projectId,
              threadId,
              content: "Create a project assistant named Catalog builder to execute todo-games.md",
              executionModelId: "google/gemini-2.5-flash",
              fastMode: true
            })
          )
        );

        const assistantUpdate = await assistantUpdatePromise;
        const card = await cardPromise;
        await messagePromise;

        expect(card.payload.assistant.scope).toBe("project");
        expect(card.payload.assistant.projectId).toBe(projectId);
        expect(card.payload.assistant.agentId).toBe("pi");
        expect(card.payload.assistant.providerBrand).toBe("gemini");
        expect(card.payload.assistant.executionModelId).toBe("google/gemini-2.5-flash");
        expect(card.payload.assistant.fastMode).toBe(true);
        expect(assistantUpdate.payload.assistants.assistants.some((assistant: { name: string }) => assistant.name === "Catalog builder")).toBe(true);
        expect(adapter.calls.some((call) => call.kind === "executor")).toBe(false);

        const reconnectSocket = createSocket(port);
        const reconnectReady = await waitForEvent(reconnectSocket, "connection.ready");
        expect(
          reconnectReady.payload.assistants.assistants.some(
            (assistant: {
              name: string;
              scope: string;
              projectId?: string;
              providerBrand?: string;
              executionModelId?: string;
              fastMode?: boolean;
            }) =>
              assistant.name === "Catalog builder" &&
              assistant.scope === "project" &&
              assistant.projectId === projectId &&
              assistant.providerBrand === "gemini" &&
              assistant.executionModelId === "google/gemini-2.5-flash" &&
              assistant.fastMode === true
          )
        ).toBe(true);
        reconnectSocket.close();
        socket.close();
      }, 60000);

      serverTest("chat.send asks for purpose before creating underspecified project assistants", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const questionRunPromise = waitForEvent(
          socket,
          "run.updated",
          (event) =>
            event.payload.run.status === "awaiting-user-input" &&
            event.payload.run.questions.some(
              (question: { prompt: string; responseKind?: string }) =>
                question.responseKind === "freeform" && question.prompt.includes("What should kojima do for this project?")
            ),
          10000
        );
        const questionMessagePromise = waitForEvent(
          socket,
          "thread.message-appended",
          (event) => event.payload.message.role === "assistant" && event.payload.message.content.includes("What should kojima do"),
          10000
        );

        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-create-assistant-needs-purpose",
              projectId,
              threadId,
              content: "create a new local project assistant kojima"
            })
          )
        );

        const questionRun = await questionRunPromise;
        await questionMessagePromise;
        const question = questionRun.payload.run.questions[0];
        expect(question.responseKind).toBe("freeform");
        expect(question.choices).toBeUndefined();
        expect(adapter.calls).toHaveLength(0);

        const cardPromise = waitForEvent(
          socket,
          "assistant.created-card",
          (event) => event.payload.assistant.name === "kojima",
          10000
        );
        const actionMessagePromise = waitForEvent(
          socket,
          "thread.message-appended",
          (event) => event.payload.message.metadata?.type === "assistant-action" && event.payload.message.metadata.actionKind === "create",
          10000
        );
        const completedRunPromise = waitForEvent(
          socket,
          "run.updated",
          (event) => event.payload.run.id === questionRun.payload.run.id && event.payload.run.status === "completed",
          10000
        );

        socket.send(
          JSON.stringify({
            type: "planning.answer",
            requestId: "req-create-assistant-purpose-answer",
            payload: {
              projectId,
              threadId,
              runId: questionRun.payload.run.id,
              questionId: question.id,
              content: "Maintain project docs and surface stale todos."
            }
          })
        );

        await cardPromise;
        await actionMessagePromise;
        await completedRunPromise;
        const assistant = repository.loadAssistantsState().assistants.find((entry) => entry.name === "kojima");
        expect(assistant?.jobPrompt).toContain("Maintain project docs and surface stale todos.");
        socket.close();
      }, 60000);

      serverTest("chat.send purpose question can cancel assistant creation", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const questionRunPromise = waitForEvent(
          socket,
          "run.updated",
          (event) => event.payload.run.status === "awaiting-user-input",
          10000
        );

        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-create-assistant-cancel-start",
              projectId,
              threadId,
              content: "create a new local project assistant cancelbot"
            })
          )
        );

        const questionRun = await questionRunPromise;
        const question = questionRun.payload.run.questions[0];
        const stoppedRunPromise = waitForEvent(
          socket,
          "run.updated",
          (event) => event.payload.run.id === questionRun.payload.run.id && event.payload.run.status === "stopped",
          10000
        );

        socket.send(
          JSON.stringify({
            type: "planning.answer",
            requestId: "req-create-assistant-cancel-answer",
            payload: {
              projectId,
              threadId,
              runId: questionRun.payload.run.id,
              questionId: question.id,
              content: "cancel"
            }
          })
        );

        await stoppedRunPromise;
        expect(repository.loadAssistantsState().assistants.some((assistant) => assistant.name === "cancelbot")).toBe(false);
        socket.close();
      }, 60000);

      serverTest("chat.send runs unknown assistant-like prompts as normal project chat", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready", 10000);

        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-ambiguous-assistant-chat",
              projectId,
              threadId,
              content: "Catalog builder start executing todos"
            })
          )
        );

        const ready = await readyPromise;
        expect(ready.payload.run.questions).toHaveLength(0);
        expect(repository.loadAssistantsState().assistants.some((assistant) => assistant.name === "Catalog builder")).toBe(false);
        socket.close();
      }, 60000);

      serverTest("chat.send keeps assistant-choice complaints in normal project chat flow", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(
          socket,
          "run.updated",
          (event) =>
            event.payload.threadId === threadId &&
            event.payload.run.status === "ready" &&
            event.payload.run.latestUserPrompt.includes("I keep running into an issue"),
          10000
        );

        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-assistant-complaint-normal-chat",
              projectId,
              threadId,
              content: `I keep running into an issue where this product wants me to choose and assistant but I just want to run the code.
Thread Id
'''
5ea22a55-1dd0-4ec7-9371-129c67f4dd4e
ec32e89b-08a3-41a5-80bf-6823701343f0
8e40122a-4916-4f36-b9fc-f883f30801da
'''`
            })
          )
        );

        const ready = await readyPromise;
        expect(ready.payload.run.questions).toHaveLength(0);
        expect(ready.payload.run.plan?.mode?.id).toBe("implement");
        expect(ready.payload.run.plan?.gating.mode).toBe("immediate");
        socket.close();
      }, 60000);

      serverTest("assistant.create-from-thread creates and dedupes project assistants", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const cardPromise = waitForEvent(
          socket,
          "assistant.created-card",
          (event) => event.payload.assistant.name === "Catalog builder",
          10000
        );

        socket.send(
          JSON.stringify({
            type: "assistant.create-from-thread",
            requestId: "req-create-from-thread",
            payload: {
              projectId,
              threadId,
              sourcePrompt: "Catalog builder start executing todos",
              name: "Catalog builder"
            }
          })
        );

        await cardPromise;
        const secondCardPromise = waitForEvent(
          socket,
          "assistant.created-card",
          (event) => event.payload.assistant.name === "Catalog builder",
          10000
        );
        socket.send(
          JSON.stringify({
            type: "assistant.create-from-thread",
            requestId: "req-create-from-thread-repeat",
            payload: {
              projectId,
              threadId,
              sourcePrompt: "Catalog builder start executing todos",
              name: "Catalog builder"
            }
          })
        );

        await secondCardPromise;
        expect(repository.loadAssistantsState().assistants.filter((assistant) => assistant.name === "Catalog builder")).toHaveLength(1);
        socket.close();
      }, 60000);

      serverTest("assistant-owned background jobs use the assistant runtime", async () => {
        await stopServerForTest(server);
        const codexAdapter = new FakePiAgentAdapter();
        ({ server, port } = await startServerForTest({
          port: 0,
          adapter,
          repository,
          runtimeRegistry: new AgentRuntimeRegistry([new PiRuntime(adapter), new FakeCodexRuntime(codexAdapter)]),
          serverOnly: true
        }));

        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const now = new Date().toISOString();
        const assistantId = crypto.randomUUID();
        const jobId = crypto.randomUUID();
        const assistant = repository.saveAssistant({
          id: assistantId,
          name: "Codex job helper",
          scope: "project",
          projectId,
          personalityPrompt: "Run background work.",
          jobPrompt: "Handle background job prompts.",
          agentId: "codex-cli",
          providerBrand: "gpt",
          modeId: "implement",
          runState: "active",
          bootstrapState: "completed",
          failureStreakCount: 0,
          circuitBreakerState: "closed",
          unreadQuestionCount: 0,
          createdAt: now,
          updatedAt: now
        } satisfies Assistant);
        repository.saveBackgroundJob({
          id: jobId,
          projectId,
          assistantId: assistant.id,
          automationThreadId: crypto.randomUUID(),
          kind: "ai-routine",
          name: "Codex assistant job",
          status: "enabled",
          riskLevel: "unsafe",
          definition: {
            kind: "ai-routine",
            prompt: "single background task",
            modeId: "implement"
          },
          schedule: {
            type: "one-off",
            runAt: now,
            sourceText: "now"
          },
          scheduleInput: "now",
          nextRunAt: now,
          createdAt: now,
          updatedAt: now
        } satisfies BackgroundJob);

        const codexPlannerPromise = codexAdapter.waitForCall("planner");
        socket.send(
          JSON.stringify({
            type: "background-job.run-now",
            requestId: "req-codex-assistant-job",
            payload: {
              projectId,
              jobId
            }
          })
        );

        const plannerCall = await codexPlannerPromise;
        expect(plannerCall.modelId).toBe("openai/gpt-5.4");
        expect(adapter.calls).toHaveLength(0);
        socket.close();
      }, 60000);

      serverTest("background job run updates stream execution log events", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const now = new Date().toISOString();
        const jobId = crypto.randomUUID();
        repository.saveBackgroundJob({
          id: jobId,
          projectId,
          automationThreadId: crypto.randomUUID(),
          kind: "ai-routine",
          name: "Streaming log job",
          status: "enabled",
          riskLevel: "safe",
          definition: {
            kind: "ai-routine",
            prompt: "streaming refresh background job",
            modeId: "implement",
            subagentWorktreeStrategy: "separate-worktrees"
          },
          schedule: {
            type: "one-off",
            runAt: now,
            sourceText: "now"
          },
          scheduleInput: "now",
          nextRunAt: now,
          createdAt: now,
          updatedAt: now
        } satisfies BackgroundJob);

        const streamingLogPromise = waitForEvent(
          socket,
          "background-job-run.updated",
          (event) =>
            event.payload.run.jobId === jobId &&
            event.payload.run.status === "running" &&
            event.payload.run.events.some((entry: { stage: string }) => entry.stage === "input"),
          10000
        );
        const completedPromise = waitForEvent(
          socket,
          "background-job-run.updated",
          (event) => event.payload.run.jobId === jobId && event.payload.run.status === "succeeded",
          10000
        );
        socket.send(
          JSON.stringify({
            type: "background-job.run-now",
            requestId: "req-streaming-job-log",
            payload: {
              projectId,
              jobId
            }
          })
        );

        const streamingLog = await streamingLogPromise;
        expect(streamingLog.payload.run.events.some((entry: { message: string }) => entry.message === "Background AI prompt")).toBe(true);
        await completedPromise;
        socket.close();
      }, 60000);

      serverTest("background job run-now repairs policy-suppressed planning questions before queuing", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const now = new Date().toISOString();
        const assistantId = crypto.randomUUID();
        const automationThreadId = crypto.randomUUID();
        const jobId = crypto.randomUUID();
        repository.saveAssistant({
          id: assistantId,
          name: "Kojima helper",
          scope: "project",
          projectId,
          personalityPrompt: "Run browser game sweeps.",
          jobPrompt: "Use durable guidance without asking repeat target-selection questions.",
          agentId: "pi",
          runState: "active",
          bootstrapState: "completed",
          failureStreakCount: 0,
          circuitBreakerState: "closed",
          unreadQuestionCount: 0,
          createdAt: now,
          updatedAt: now
        } satisfies Assistant);
        repository.saveAssistantLearning({
          id: crypto.randomUUID(),
          assistantId,
          summary: "For sweep passes, pick a random browser-playable game unless told otherwise.",
          source: "test",
          confidence: "high",
          createdAt: now
        });
        repository.saveBackgroundJob({
          id: jobId,
          projectId,
          assistantId,
          automationThreadId,
          kind: "ai-routine",
          name: "Kojima patrol",
          status: "enabled",
          riskLevel: "safe",
          definition: {
            kind: "ai-routine",
            prompt: "Run browser game sweep",
            modeId: "implement"
          },
          schedule: {
            type: "interval",
            intervalSeconds: 600,
            nextRunAt: now,
            sourceText: "10m"
          },
          scheduleInput: "10m",
          nextRunAt: now,
          createdAt: now,
          updatedAt: now
        } satisfies BackgroundJob);
        repository.createAgentRun(projectId, "Run browser game sweep", "openai/gpt-5.4", automationThreadId);
        const linkedRun = repository.getLatestThreadRun(projectId, automationThreadId);
        if (!linkedRun) {
          throw new Error("Expected linked run");
        }
        repository.appendPlanningQuestion(
          projectId,
          linkedRun.id,
          {
            id: "target-selection",
            prompt: "What should I use as the concrete sweep input for this pass?",
            choices: [
              {
                id: "choice-1",
                label: "Guidance",
                description: "Use durable guidance.",
                answerText: "Use durable target guidance.",
                recommended: true
              },
              {
                id: "choice-2",
                label: "Current context",
                description: "Use current context.",
                answerText: "Use current context.",
                recommended: false
              },
              {
                id: "choice-3",
                label: "Ask",
                description: "Ask the user.",
                answerText: "Ask the user.",
                recommended: false
              }
            ],
            required: true
          },
          "deferred"
        );
        const staleRun = repository.createBackgroundJobRun({
          jobId,
          projectId,
          assistantId,
          automationThreadId,
          triggerSource: "schedule",
          status: "awaiting-user-input",
          riskLevel: "safe",
          approvalStatus: "not-needed"
        });
        repository.setBackgroundJobRunStatus(staleRun.id, "awaiting-user-input", { linkedAgentRunId: linkedRun.id });

        const completedPromise = waitForEvent(
          socket,
          "background-job-run.updated",
          (event) => event.payload.run.jobId === jobId && event.payload.run.id !== staleRun.id && event.payload.run.status === "succeeded",
          10000
        );
        socket.send(
          JSON.stringify({
            type: "background-job.run-now",
            requestId: "req-repair-question-job",
            payload: {
              projectId,
              jobId
            }
          })
        );

        await completedPromise;
        const repairedRun = repository.getBackgroundJobRun(staleRun.id);
        expect(repairedRun?.status).toBe("skipped");
        expect(repairedRun?.summary).toBe("Planning question auto-resolved; run will retry on next cadence");
        expect(repository.getActiveBackgroundJobRuns(jobId)).toHaveLength(0);
        socket.close();
      }, 60000);

      serverTest("background job run-now refuses true active blockers with status detail", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const now = new Date().toISOString();
        const automationThreadId = crypto.randomUUID();
        const jobId = crypto.randomUUID();
        repository.saveBackgroundJob({
          id: jobId,
          projectId,
          automationThreadId,
          kind: "ai-routine",
          name: "Active blocker job",
          status: "enabled",
          riskLevel: "safe",
          definition: {
            kind: "ai-routine",
            prompt: "active blocker test",
            modeId: "implement"
          },
          schedule: {
            type: "interval",
            intervalSeconds: 600,
            nextRunAt: now,
            sourceText: "10m"
          },
          scheduleInput: "10m",
          nextRunAt: now,
          createdAt: now,
          updatedAt: now
        } satisfies BackgroundJob);
        const activeRun = repository.createBackgroundJobRun({
          jobId,
          projectId,
          automationThreadId,
          triggerSource: "schedule",
          status: "running",
          riskLevel: "safe",
          approvalStatus: "not-needed"
        });
        repository.setBackgroundJobRunStatus(activeRun.id, "running", { summary: "Still executing" });

        const rejectedPromise = waitForEvent(socket, "command.rejected", (event) => event.requestId === "req-active-blocker-job");
        socket.send(
          JSON.stringify({
            type: "background-job.run-now",
            requestId: "req-active-blocker-job",
            payload: {
              projectId,
              jobId
            }
          })
        );

        const rejected = await rejectedPromise;
        expect(rejected.payload.detail).toContain(`Background job already has active run ${activeRun.id} in status running`);
        expect(rejected.payload.detail).toContain("Still executing");
        expect(repository.getActiveBackgroundJobRuns(jobId)).toHaveLength(1);
        socket.close();
      }, 60000);

      serverTest("background job stop-run stops stale linked agent run", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const now = new Date().toISOString();
        const automationThreadId = crypto.randomUUID();
        const jobId = crypto.randomUUID();
        repository.saveBackgroundJob({
          id: jobId,
          projectId,
          automationThreadId,
          kind: "ai-routine",
          name: "Stale linked run job",
          status: "enabled",
          riskLevel: "safe",
          definition: {
            kind: "ai-routine",
            prompt: "stale linked run test",
            modeId: "implement"
          },
          schedule: {
            type: "interval",
            intervalSeconds: 600,
            nextRunAt: now,
            sourceText: "10m"
          },
          scheduleInput: "10m",
          nextRunAt: now,
          createdAt: now,
          updatedAt: now
        } satisfies BackgroundJob);
        repository.createAgentRun(projectId, "stale linked run", "openai/gpt-5.4", threadId);
        const linkedRun = repository.getLatestThreadRun(projectId, threadId);
        expect(linkedRun).toBeTruthy();
        repository.setAgentRunStatus(projectId, linkedRun!.id, "running-main");
        const activeRun = repository.createBackgroundJobRun({
          jobId,
          projectId,
          automationThreadId,
          triggerSource: "schedule",
          status: "running",
          riskLevel: "safe",
          approvalStatus: "not-needed"
        });
        repository.setBackgroundJobRunStatus(activeRun.id, "running", { linkedAgentRunId: linkedRun!.id });

        const stoppedBackgroundRunPromise = waitForEvent(
          socket,
          "background-job-run.updated",
          (event) => event.payload.run.id === activeRun.id && event.payload.run.status === "cancelled"
        );
        const stoppedAgentRunPromise = waitForEvent(
          socket,
          "run.updated",
          (event) => event.payload.run.id === linkedRun!.id && event.payload.run.status === "stopped"
        );
        socket.send(
          JSON.stringify({
            type: "background-job.stop-run",
            requestId: "req-stop-stale-linked-run",
            payload: {
              projectId,
              runId: activeRun.id
            }
          })
        );

        await stoppedBackgroundRunPromise;
        await stoppedAgentRunPromise;
        expect(repository.getBackgroundJobRun(activeRun.id)?.status).toBe("cancelled");
        expect(repository.getRun(projectId, linkedRun!.id)?.status).toBe("stopped");
        socket.close();
      }, 60000);


    
      serverTest("ask mode auto-runs immediately without appending a plan summary message", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-ask-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        let planMessageSeen = false;
        socket.addEventListener("message", (event) => {
          const payload = JSON.parse(event.data as string);
          if (
            (payload.type === "chat.message-appended" || payload.type === "thread.message-appended") &&
            payload.payload?.message?.kind === "plan-summary"
          ) {
            planMessageSeen = true;
          }
        });
    
        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-ask-send",
              projectId,
              threadId,
              content: "What do each of the different modes do?",
              modeId: "ask"
            })
          )
        );
    
        const ready = await readyPromise;
        await pingServer(socket, "req-ask-drain");
    
        expect(ready.payload.run.plan?.gating.mode).toBe("immediate");
        expect(planMessageSeen).toBe(false);
        expect(ready.payload.run.plan?.origin).toBe("quick-task");
        expect(adapter.calls.map((call) => call.kind)).toEqual([]);
        socket.close();
      });


    
      serverTest("plan mode preserves approval-first gating", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-plan-mode-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
    
        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-plan-mode-send",
              projectId,
              threadId,
              content: "Plan the safest rollout strategy before implementing anything.",
              modeId: "plan"
            })
          )
        );
    
        const ready = await readyPromise;
        expect(ready.payload.run.plan?.gating.mode).toBe("approve");
        socket.close();
      });


    
      serverTest("implement mode uses immediate gating for main-route plans", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-impl-main-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
    
        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-impl-main-send",
              projectId,
              threadId,
              content: "simple task"
            })
          )
        );
    
        const ready = await readyPromise;
        expect(ready.payload.run.plan?.gating.mode).toBe("immediate");
        socket.close();
      });


    
      serverTest("implement mode upgrades multi-subagent plans to approval-first gating", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-impl-subagents-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        const planMessagePromise = waitForEvent(
          socket,
          "chat.message-appended",
          (event) => event.payload.message.kind === "plan-summary"
        );
    
        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-impl-subagents-send",
              projectId,
              threadId,
              content: "complex task"
            })
          )
        );
    
        const ready = await readyPromise;
        const planMessage = await planMessagePromise;
        expect(ready.payload.run.plan?.gating.mode).toBe("approve");
        expect(ready.payload.run.plan?.actualSubagentCount).toBeGreaterThan(1);
        expect(planMessage.payload.message.kind).toBe("plan-summary");
        socket.close();
      });


    
      serverTest("debug and review modes default to immediate gating", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-debug-review-open");
        const projectId = opened.payload.project.id;
        const debugThreadId = opened.payload.project.activeThreadId;
        const debugReadyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
    
        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-debug-send",
              projectId,
              threadId: debugThreadId,
              content: "Debug this flaky login bug and find root cause.",
              modeId: "debug"
            })
          )
        );
        const debugReady = await debugReadyPromise;
        expect(debugReady.payload.run.plan?.gating.mode).toBe("immediate");
        const reopened = await openProject(socket, projectRoot, "req-debug-review-reopen");
        const reviewThreadId = reopened.payload.project.activeThreadId;
        const reviewReadyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
    
        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-review-send",
              projectId,
              threadId: reviewThreadId,
              content: "Review this PR diff for regressions and missing tests.",
              modeId: "review"
            })
          )
        );
        const reviewReady = await reviewReadyPromise;
        expect(reviewReady.payload.run.plan?.gating.mode).toBe("immediate");
        socket.close();
      });


    
      serverTest("chat.send auto-switches project mode when prompt intent strongly matches a builtin mode", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-auto-mode-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const projectUpdatedPromise = waitForEvent(
          socket,
          "project.updated",
          (event) => event.payload.projectId === projectId && event.payload.project.selectedModeId === "ask"
        );
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
    
        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-auto-mode-send",
              projectId,
              threadId,
              content: "What do each of the different modes do?"
            })
          )
        );
    
        const projectUpdated = await projectUpdatedPromise;
        const ready = await readyPromise;
        expect(projectUpdated.payload.project.selectedModeId).toBe("ask");
        expect(ready.payload.run.plan?.mode?.id).toBe("ask");
        socket.close();
      });


      serverTest("chat.send honors explicitly locked mode over auto-detect", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-mode-lock-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");

        socket.send(
          JSON.stringify({
            type: "chat.send",
            requestId: "req-mode-lock-send",
            payload: {
              projectId,
              threadId,
              agentId: "pi",
              content: "Create readme.md",
              modeId: "plan",
              modeLocked: true
            }
          })
        );

        const ready = await readyPromise;
        expect(ready.payload.run.plan?.mode?.id).toBe("plan");
        expect(ready.payload.run.plan?.origin).toBe("initial");
        expect(ready.payload.run.plan?.gating.mode).toBe("approve");
        socket.close();
      });


      serverTest("chat.send auto mode detects implementation and skips planner below difficulty threshold", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-mode-auto-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");

        socket.send(
          JSON.stringify({
            type: "chat.send",
            requestId: "req-mode-auto-send",
            payload: {
              projectId,
              threadId,
              agentId: "pi",
              content: "Create readme.md",
              modeId: "auto",
              modeLocked: false
            }
          })
        );

        const ready = await readyPromise;
        expect(ready.payload.run.plan?.mode?.id).toBe("implement");
        expect(ready.payload.run.plan?.origin).toBe("quick-task");
        expect(adapter.calls.map((call) => call.kind)).toEqual([]);
        socket.close();
      });


      serverTest("chat.send correction follow-up overrides sticky ask mode for direct workspace actions", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-auto-followup-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const initialReadyPromise = waitForEvent(
          socket,
          "run.updated",
          (event) =>
            event.payload.threadId === threadId &&
            event.payload.run.status === "ready" &&
            event.payload.run.latestUserPrompt === "create folder /tetris try 10 different ways if blocked"
        );

        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-auto-followup-initial",
              projectId,
              threadId,
              content: "create folder /tetris try 10 different ways if blocked",
              modeId: "ask"
            })
          )
        );

        const initialReady = await initialReadyPromise;
        expect(initialReady.payload.run.plan?.mode?.id).toBe("implement");
        expect(initialReady.payload.run.plan?.origin).toBe("quick-task");
        await executeReadyRun(
          socket,
          {
            requestId: "req-auto-followup-initial-execute",
            projectId,
            threadId,
            runId: initialReady.payload.run.id
          },
          10000
        );

        const implementReadyPromise = waitForEvent(
          socket,
          "run.updated",
          (event) =>
            event.payload.threadId === threadId &&
            event.payload.run.status === "ready" &&
            event.payload.run.latestUserPrompt === "no inside the cwd"
        );

        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-auto-followup-implement",
              projectId,
              threadId,
              content: "no inside the cwd",
              modeId: "ask"
            })
          )
        );

        const implementReady = await implementReadyPromise;
        expect(implementReady.payload.run.plan?.mode?.id).toBe("implement");
        expect(implementReady.payload.run.plan?.origin).toBe("quick-task");
        expect(implementReady.payload.run.plan?.gating.mode).toBe("immediate");
        socket.close();
      });


      serverTest("chat.send bypasses planner for direct workspace tasks even when review mode was selected", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-quick-task-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
    
        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-quick-task-send",
              projectId,
              threadId,
              content: "Make folder /pacman",
              modeId: "review"
            })
          )
        );
    
        const ready = await readyPromise;
        expect(ready.payload.run.plan?.origin).toBe("quick-task");
        expect(ready.payload.run.plan?.mode?.id).toBe("implement");
        expect(ready.payload.run.plan?.gating.mode).toBe("immediate");
        expect(ready.payload.run.plan?.finalExecutionBrief).toBe("Make folder pacman");
        expect(adapter.calls).toHaveLength(0);
        socket.close();
      });


      serverTest("review mode executes runs with read-only requests", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-review-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;

        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready", 10000);
        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-review-send",
              projectId,
              threadId,
              content: "Review this repo for bugs and missing tests",
              modeId: "review"
            })
          )
        );
        const ready = await readyPromise;

        await executeReadyRun(
          socket,
          {
            requestId: "req-review-execute",
            projectId,
            threadId,
            runId: ready.payload.run.id
          },
          10000
        );

        const executorCall = adapter.calls.find((call) => call.kind === "executor");
        expect(executorCall?.readOnly).toBe(true);
        socket.close();
      }, 15000);
  });
}

export function registerServerExecutionMainTests(options: ServerTestShardOptions = {}) {
  describe("harness server execution main", () => {
    const serverTest = createServerTestRegistrar(options);
    const fixture = useGitProjectFixture({
      fixtureName: "server-execution-main",
      packageName: "test-project",
      readmeTitle: "# Test Project\n",
      gitIgnore: ".local\nnode_modules\ndist\n"
    });
    let server: Awaited<ReturnType<typeof startHarnessServer>>;
    let adapter: FakePiAgentAdapter;
    let repository: WorkspaceRepository;
    let dbPath: string;
    let extraProjectRoot: string;
    let projectRoot: string;
    let port: number;

    beforeEach(async () => {
      projectRoot = await fixture.createRepoClone(`repo-${crypto.randomUUID()}`);
      extraProjectRoot = fixture.createTempDir(`project-${crypto.randomUUID()}`);
      dbPath = ":memory:";
      port = 0;

      adapter = new FakePiAgentAdapter();
      repository = new WorkspaceRepository(dbPath, projectRoot, { durability: "test-fast" });
      ({ server, port } = await startServerForTest({
        port: 0,
        adapter,
        repository,
        pickFolder: async () => extraProjectRoot,
        serverOnly: true
      }));
    });

    afterEach(async () => {
      await stopServerForTest(server);
    });


    
      serverTest("pauses globally, persists state, and rejects new execution starts until resume", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const secondSocket = createSocket(port);
        await waitForEvent(secondSocket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-pause-open");
    
        const pausedOnFirst = waitForEvent(
          socket,
          "execution-control.updated",
          (event) => event.payload.executionControl.isPaused === true
        );
        const pausedOnSecond = waitForEvent(
          secondSocket,
          "execution-control.updated",
          (event) => event.payload.executionControl.isPaused === true
        );
        socket.send(
          JSON.stringify({
            type: "execution.pause-all",
            requestId: "req-pause-all"
          })
        );
    
        await pausedOnFirst;
        await pausedOnSecond;
        expect(repository.getGlobalExecutionPaused()).toBe(true);
    
        const rejectedPromise = waitForEvent(socket, "command.rejected");
        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-paused-send",
              projectId: opened.payload.project.id,
              threadId: opened.payload.project.activeThreadId,
              content: "single-step while paused"
            })
          )
        );
    
        const rejected = await rejectedPromise;
        expect(rejected.payload.message).toBe("Harness command failed");
        expect(rejected.payload.detail).toContain("Global execution is paused");
    
        const resumePromise = waitForEvent(
          socket,
          "execution-control.updated",
          (event) => event.payload.executionControl.isPaused === false
        );
        socket.send(
          JSON.stringify({
            type: "execution.resume-all",
            requestId: "req-resume-all"
          })
        );
        await resumePromise;
        expect(repository.getGlobalExecutionPaused()).toBe(false);
    
        secondSocket.close();
        socket.close();
      });


    
      serverTest("defers planner questions raised during pause and surfaces them on resume", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-deferred-question-open");
    
        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-slow-question",
              projectId: opened.payload.project.id,
              threadId: opened.payload.project.activeThreadId,
              content: "slow needs clarification"
            })
          )
        );
    
        const pausedPromise = waitForEvent(
          socket,
          "execution-control.updated",
          (event) => event.payload.executionControl.isPaused === true
        );
        socket.send(
          JSON.stringify({
            type: "execution.pause-all",
            requestId: "req-pause-before-question"
          })
        );
        await pausedPromise;
    
        await waitForCondition(() => {
          const deferredRun = repository.getProject(opened.payload.project.id).activeRun;
          return deferredRun?.status === "awaiting-user-input" && deferredRun.questions[0]?.status === "deferred";
        });

        const deferredRun = repository.getProject(opened.payload.project.id).activeRun;
        expect(deferredRun?.status).toBe("awaiting-user-input");
        expect(deferredRun?.questions[0]?.status).toBe("deferred");
        expect(
          repository
            .getProject(opened.payload.project.id)
            .session.messages.some((message) => message.role === "assistant" && message.content.includes("Which route should handle this?"))
        ).toBe(false);
    
        const resumedPromise = waitForEvent(
          socket,
          "execution-control.updated",
          (event) =>
            event.payload.executionControl.isPaused === false &&
            event.payload.executionControl.deferredPlanningQuestionCount === 0
        );
        const pendingRunPromise = waitForEvent(
          socket,
          "run.updated",
          (event) =>
            event.payload.projectId === opened.payload.project.id &&
            event.payload.run.status === "awaiting-user-input" &&
            event.payload.run.questions[0]?.status === "pending"
        );
        const questionMessagePromise = waitForEvent(
          socket,
          "chat.message-appended",
          (event) => event.payload.message.content.includes("Which route should handle this?")
        );
        socket.send(
          JSON.stringify({
            type: "execution.resume-all",
            requestId: "req-resume-question"
          })
        );
    
        await resumedPromise;
        await pendingRunPromise;
        await questionMessagePromise;
        socket.close();
      });

    
      serverTest("runs low difficulty tasks on the main executor only", async () => {
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

    
      serverTest("asks planner question before execution and resumes after answer", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const runPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "awaiting-user-input");
        const questionMessagePromise = waitForEvent(
          socket,
          "chat.message-appended",
          (event) => event.payload.message.role === "assistant" && event.payload.message.kind !== "run-milestones"
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

      serverTest("emits planner heartbeat milestones while a slow planner turn is still running", async () => {
        await stopServerForTest(server);
        ({ server, port } = await startServerForTest({
          port: 0,
          adapter,
          repository,
          pickFolder: async () => extraProjectRoot,
          serverOnly: true,
          derivedProgressHeartbeatMs: 25
        }));

        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;

        const plannerHeartbeatPromise = waitForEvent(
          socket,
          "chat.streaming-tail-updated",
          (event) =>
            event.payload.segments.some(
              (segment: { content: string }) => segment.content.includes("Planner still working. Scoping execution plan.")
            ),
          3000
        );
        const questionPromise = waitForEvent(
          socket,
          "run.updated",
          (event) => event.payload.run.status === "awaiting-user-input",
          3000
        );

        socket.send(
          JSON.stringify({
            type: "chat.send",
            requestId: "req-planner-heartbeat",
            payload: {
              projectId,
              threadId,
              agentId: "pi",
              content: "slow needs clarification"
            }
          })
        );

        const heartbeat = await plannerHeartbeatPromise;
        const runUpdate = await questionPromise;

        expect(heartbeat.payload.segments[0]?.content).toContain("**Planning**");
        expect(runUpdate.payload.run.questions[0]?.prompt).toContain("Which route");
        socket.close();
      });


    
      serverTest("same thread can receive repeated planner questions across separate runs", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
    
        socket.send(
          JSON.stringify({
            type: "chat.send",
            requestId: "req-question-repeat-1",
            payload: {
              projectId,
              threadId,
              agentId: "pi",
              content: "needs clarification"
            }
          })
        );
        const firstRun = await waitForEvent(
          socket,
          "run.updated",
          (event) => event.payload.run.status === "awaiting-user-input",
          10000
        );
    
        await answerPlanningQuestionAndExecute(socket, {
          requestId: "req-question-repeat-answer-1",
          projectId,
          threadId,
          runId: firstRun.payload.run.id,
          questionId: firstRun.payload.run.questions[0].id,
          content: "api/users/[id]"
        });
    
        const rejectedEvents: any[] = [];
        const rejectListener = (event: MessageEvent) => {
          const payload = JSON.parse(event.data as string);
          if (payload.type === "command.rejected") {
            rejectedEvents.push(payload);
          }
        };
        socket.addEventListener("message", rejectListener);
    
        socket.send(
          JSON.stringify({
            type: "chat.send",
            requestId: "req-question-repeat-2",
            payload: {
              projectId,
              threadId,
              agentId: "pi",
              content: "needs clarification"
            }
          })
        );
        const secondRun = await waitForEvent(
          socket,
          "run.updated",
          (event) =>
            event.payload.run.status === "awaiting-user-input" &&
            event.payload.run.id !== firstRun.payload.run.id,
          10000
        );
    
        expect(secondRun.payload.run.questions[0].id).not.toBe(firstRun.payload.run.questions[0].id);
        expect(rejectedEvents).toHaveLength(0);
        socket.removeEventListener("message", rejectListener);
        socket.close();
      });

      serverTest("same run can receive repeated planner question ids after an answer", async () => {
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

        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-same-run-repeat-question",
              projectId,
              threadId,
              content: "same-run repeated question"
            })
          )
        );
        const firstRun = await waitForEvent(
          socket,
          "run.updated",
          (event) => event.payload.run.status === "awaiting-user-input",
          10000
        );

        socket.send(
          JSON.stringify({
            type: "planning.answer",
            requestId: "req-same-run-repeat-answer-1",
            payload: {
              projectId,
              threadId,
              runId: firstRun.payload.run.id,
              questionId: firstRun.payload.run.questions[0].id,
              content: "first answer"
            }
          })
        );

        const secondRun = await waitForEvent(
          socket,
          "run.updated",
          (event) =>
            event.payload.run.id === firstRun.payload.run.id &&
            event.payload.run.status === "awaiting-user-input" &&
            event.payload.run.questions.length === 2,
          10000
        );
        expect(secondRun.payload.run.questions[0].id).not.toBe(secondRun.payload.run.questions[1].id);
        expect(secondRun.payload.run.questions[0].logicalQuestionId).toBe("question-1");
        expect(secondRun.payload.run.questions[1].logicalQuestionId).toBe("question-1");

        const complete = await answerPlanningQuestionAndExecute(
          socket,
          {
            requestId: "req-same-run-repeat-answer-2",
            projectId,
            threadId,
            runId: firstRun.payload.run.id,
            questionId: secondRun.payload.run.questions[1].id,
            content: "second answer"
          },
          10000
        );
        expect(complete.payload.threadId).toBe(threadId);
        expect(rejectedEvents).toHaveLength(0);
        socket.removeEventListener("message", rejectListener);
        socket.close();
      }, 15000);


    
      serverTest("chat.stop aborts running work", async () => {
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
        const runId = repository.getProject(projectId).activeRun?.id;
        expect(runId).toBeDefined();
        const errorPromise = waitForEvent(socket, "chat.error");
    
        socket.send(
          JSON.stringify({
            type: "chat.stop",
            requestId: "req-stop-2",
            payload: {
              projectId,
              threadId,
              runId
            }
          })
        );
    
        const errorEvent = await errorPromise;
        expect(errorEvent.payload.message).toContain("stopped");
        socket.close();
      });
  });
}

export function registerServerSubagentTests(options: ServerTestShardOptions = {}) {
  describe("harness server subagents", () => {
    const serverTest = createServerTestRegistrar(options);
    const fixture = useGitProjectFixture({
      fixtureName: "server-subagents",
      packageName: "test-project",
      readmeTitle: "# Test Project\n",
      gitIgnore: ".local\nnode_modules\ndist\n"
    });
    let server: Awaited<ReturnType<typeof startHarnessServer>>;
    let adapter: FakePiAgentAdapter;
    let repository: WorkspaceRepository;
    let dbPath: string;
    let extraProjectRoot: string;
    let projectRoot: string;
    let port: number;
    let originalFetch: typeof globalThis.fetch;
    const attachmentFetchBodies = new Map<string, { body: BodyInit; mimeType: string }>();

    beforeEach(async () => {
      attachmentFetchBodies.clear();
      originalFetch = globalThis.fetch;
      globalThis.fetch = Object.assign(
        async (input: URL | RequestInfo, init?: RequestInit | BunFetchRequestInit) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          const fixtureBody = attachmentFetchBodies.get(url);
          if (fixtureBody) {
            return new Response(fixtureBody.body, {
              status: 200,
              headers: {
                "content-type": fixtureBody.mimeType
              }
            });
          }
          return originalFetch(input, init);
        },
        { preconnect: originalFetch.preconnect }
      );
      projectRoot = await fixture.createRepoClone(`repo-${crypto.randomUUID()}`);
      extraProjectRoot = fixture.createTempDir(`project-${crypto.randomUUID()}`);
      dbPath = ":memory:";
      port = 0;

      adapter = new FakePiAgentAdapter();
      repository = new WorkspaceRepository(dbPath, projectRoot, { durability: "test-fast" });
      ({ server, port } = await startServerForTest({
        port: 0,
        adapter,
        repository,
        pickFolder: async () => extraProjectRoot,
        serverOnly: true
      }));
    });

    afterEach(async () => {
      globalThis.fetch = originalFetch;
      await stopServerForTest(server);
    });

    async function restartWithRealOsAdapters() {
      await stopServerForTest(server);
      ({ server, port } = await startServerForTest({
        port: 0,
        adapter,
        repository,
        pickFolder: async () => extraProjectRoot,
        serverOnly: true,
        useFastOsAdapters: false
      }));
    }


    
      serverTest("runs experiments in virtual branch mode and exposes shared memory entries", async () => {
        await restartWithRealOsAdapters();
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-experiment-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(
          socket,
          {
            requestId: "req-experiment-ready",
            projectId,
            threadId,
            content: "simple task"
          },
          10000
        );
    
        const runUpdatedPromise = waitForEvent(
          socket,
          "run.updated",
          (event) => event.payload.run.id === ready.payload.run.id && event.payload.run.status === "completed",
          10000
        );
        const completePromise = waitForEvent(socket, "chat.complete", undefined, 10000);
        socket.send(
          JSON.stringify({
            type: "run.execute",
            requestId: "req-experiment-execute",
            payload: {
              projectId,
              threadId,
              runId: ready.payload.run.id,
              target: "ephemeral-experiment"
            }
          })
        );
    
        const runUpdated = await runUpdatedPromise;
        await completePromise;
    
        expect(runUpdated.payload.run.executionTarget).toBe("ephemeral-experiment");
        expect(runUpdated.payload.run.experiment?.virtualBranchName).toContain(ready.payload.run.id);
    
        const listedPromise = waitForEvent(socket, "memory.listed", undefined, 10000);
        socket.send(
          JSON.stringify({
            type: "memory.list",
            requestId: "req-memory-list",
            payload: {
              projectId
            }
          })
        );
        const listed = await listedPromise;
        expect(listed.payload.entries.length).toBeGreaterThan(0);
    
        const inspectedPromise = waitForEvent(socket, "experiment.inspected", undefined, 10000);
        socket.send(
          JSON.stringify({
            type: "experiment.inspect",
            requestId: "req-experiment-inspect",
            payload: {
              projectId,
              runId: ready.payload.run.id
            }
          })
        );
        const inspected = await inspectedPromise;
        expect(inspected.payload.inspection.experiment.virtualBranchName).toContain(ready.payload.run.id);
        socket.close();
      });


      serverTest("chat.send forwards attachment context into planner prompts", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-attach-open");
        const tinyPng =
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9s3FoXcAAAAASUVORK5CYII=";
        const textAttachment = {
          id: "attachment-text",
          kind: "text",
          name: "spec.md",
          mimeType: "text/markdown",
          sizeBytes: 29,
          url: "https://example.com/spec.md",
          key: "attachment-text",
          uploadedAt: new Date().toISOString()
        } as const;
        const imageAttachment = {
          id: "attachment-image",
          kind: "image",
          name: "bug.png",
          mimeType: "image/png",
          sizeBytes: tinyPng.length,
          url: "https://example.com/bug.png",
          key: "attachment-image",
          uploadedAt: new Date().toISOString()
        } as const;
        repository.saveChatAttachmentUpload({
          projectId: opened.payload.project.id,
          threadId: opened.payload.project.activeThreadId,
          attachment: textAttachment
        });
        repository.saveChatAttachmentUpload({
          projectId: opened.payload.project.id,
          threadId: opened.payload.project.activeThreadId,
          attachment: imageAttachment
        });
        attachmentFetchBodies.set(textAttachment.url, { body: "Ship the smallest safe fix", mimeType: "text/markdown" });
        attachmentFetchBodies.set(imageAttachment.url, {
          body: Buffer.from(tinyPng, "base64"),
          mimeType: "image/png"
        });
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
    
        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-attach-send",
              projectId: opened.payload.project.id,
              threadId: opened.payload.project.activeThreadId,
              content: "Use attached context",
              attachments: [textAttachment, imageAttachment]
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


    
      serverTest("chat.send forwards extracted office document context into planner prompts", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-doc-open");
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        const documentAttachments = [
          {
            id: "attachment-pdf",
            kind: "document",
            documentType: "pdf",
            name: "spec.pdf",
            mimeType: "application/pdf",
            sizeBytes: createSamplePdfBuffer().length,
            url: "https://example.com/spec.pdf",
            key: "attachment-pdf",
            uploadedAt: new Date().toISOString()
          },
          {
            id: "attachment-docx",
            kind: "document",
            documentType: "docx",
            name: "brief.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sizeBytes: createSampleDocxBuffer().length,
            url: "https://example.com/brief.docx",
            key: "attachment-docx",
            uploadedAt: new Date().toISOString()
          },
          {
            id: "attachment-xlsx",
            kind: "document",
            documentType: "xlsx",
            name: "backlog.xlsx",
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            sizeBytes: createSampleXlsxBuffer().length,
            url: "https://example.com/backlog.xlsx",
            key: "attachment-xlsx",
            uploadedAt: new Date().toISOString()
          },
          {
            id: "attachment-pptx",
            kind: "document",
            documentType: "pptx",
            name: "deck.pptx",
            mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            sizeBytes: createSamplePptxBuffer().length,
            url: "https://example.com/deck.pptx",
            key: "attachment-pptx",
            uploadedAt: new Date().toISOString()
          },
          {
            id: "attachment-odt",
            kind: "document",
            documentType: "odt",
            name: "notes.odt",
            mimeType: "application/vnd.oasis.opendocument.text",
            sizeBytes: createSampleOdtBuffer().length,
            url: "https://example.com/notes.odt",
            key: "attachment-odt",
            uploadedAt: new Date().toISOString()
          }
        ] as const;
        const documentBodies = [
          createSamplePdfBuffer(),
          createSampleDocxBuffer(),
          createSampleXlsxBuffer(),
          createSamplePptxBuffer(),
          createSampleOdtBuffer()
        ];
        for (const [index, attachment] of documentAttachments.entries()) {
          repository.saveChatAttachmentUpload({
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            attachment
          });
          attachmentFetchBodies.set(attachment.url, {
            body: documentBodies[index]!,
            mimeType: attachment.mimeType
          });
        }
    
        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-doc-send",
              projectId: opened.payload.project.id,
              threadId: opened.payload.project.activeThreadId,
              content: "Use attached office docs",
              attachments: [...documentAttachments]
            })
          )
        );
    
        await readyPromise;
    
        expect(adapter.calls[0]?.prompt).toContain("Hello PDF extraction");
        expect(adapter.calls[0]?.prompt).toContain("Docx intro");
        expect(adapter.calls[0]?.prompt).toContain("Sheet: Backlog");
        expect(adapter.calls[0]?.prompt).toContain("Slide 1");
        expect(adapter.calls[0]?.prompt).toContain("ODT heading");
        socket.close();
      });


    
      serverTest("chat.send keeps malformed document attachments explicit without crashing planning", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-bad-doc-open");
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        const badAttachment = {
          id: "attachment-bad-docx",
          kind: "document",
          documentType: "docx",
          name: "broken.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          sizeBytes: 9,
          url: "https://example.com/broken.docx",
          key: "attachment-bad-docx",
          uploadedAt: new Date().toISOString()
        } as const;
        repository.saveChatAttachmentUpload({
          projectId: opened.payload.project.id,
          threadId: opened.payload.project.activeThreadId,
          attachment: badAttachment
        });
        attachmentFetchBodies.set(badAttachment.url, {
          body: Buffer.from("not-a-zip"),
          mimeType: badAttachment.mimeType
        });
    
        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-bad-doc-send",
              projectId: opened.payload.project.id,
              threadId: opened.payload.project.activeThreadId,
              content: "Handle malformed document",
              attachments: [badAttachment]
            })
          )
        );
    
        await readyPromise;
    
        expect(adapter.calls[0]?.prompt).toContain("[Attachment document unavailable] broken.docx:");
        socket.close();
      });


    
      serverTest("runs high difficulty tasks with subagents and aggregation", async () => {
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
    
        await waitForAdapterCall(adapter, "aggregator", 30000);
    
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

      serverTest("runs prerequisites before subagent fan-out and persists completion", async () => {
        repository.setSubagentWorktreeStrategyDefault("separate-worktrees");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
          requestId: "req-prereq",
          projectId,
          threadId,
          content: "complex prerequisite task"
        }, 30000);
        const prerequisiteTracePromise = waitForEvent(
          socket,
          "agent.trace",
          (event) => event.payload.trace.stage === "prerequisite-complete",
          30000
        );

        socket.send(
          JSON.stringify({
            type: "run.execute",
            requestId: "req-prereq-execute",
            payload: {
              projectId,
              threadId,
              runId: ready.payload.run.id
            }
          })
        );

        await prerequisiteTracePromise;
        await waitForAdapterCall(adapter, "aggregator", 30000);
        const callKinds = adapter.calls.map((call) => call.kind);
        const prerequisiteIndex = callKinds.indexOf("executor");
        const firstSubagentIndex = callKinds.indexOf("subagent");
        expect(prerequisiteIndex).toBeGreaterThan(-1);
        expect(firstSubagentIndex).toBeGreaterThan(-1);
        expect(prerequisiteIndex).toBeLessThan(firstSubagentIndex);
        expect(repository.getRun(projectId, ready.payload.run.id)?.plan?.prerequisites[0]?.status).toBe("completed");
        socket.close();
      }, 60000);

      serverTest("normalizes planner prerequisite owner aliases before persisting and executing", async () => {
        repository.setSubagentWorktreeStrategyDefault("separate-worktrees");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
          requestId: "req-prereq-alias",
          projectId,
          threadId,
          content: "complex aliased prerequisite task"
        }, 30000);
        expect(repository.getRun(projectId, ready.payload.run.id)?.plan?.prerequisites[0]?.owner).toBe("main");
        const prerequisiteTracePromise = waitForEvent(
          socket,
          "agent.trace",
          (event) => event.payload.trace.stage === "prerequisite-complete",
          30000
        );

        socket.send(
          JSON.stringify({
            type: "run.execute",
            requestId: "req-prereq-alias-execute",
            payload: {
              projectId,
              threadId,
              runId: ready.payload.run.id
            }
          })
        );

        await prerequisiteTracePromise;
        await waitForAdapterCall(adapter, "aggregator", 30000);
        const callKinds = adapter.calls.map((call) => call.kind);
        const prerequisiteIndex = callKinds.indexOf("executor");
        const firstSubagentIndex = callKinds.indexOf("subagent");
        expect(prerequisiteIndex).toBeGreaterThan(-1);
        expect(firstSubagentIndex).toBeGreaterThan(-1);
        expect(prerequisiteIndex).toBeLessThan(firstSubagentIndex);
        const persistedPrerequisite = repository.getRun(projectId, ready.payload.run.id)?.plan?.prerequisites[0];
        expect(persistedPrerequisite?.owner).toBe("main");
        expect(persistedPrerequisite?.status).toBe("completed");
        socket.close();
      }, 60000);

      serverTest("fails run when prerequisite execution fails before subagents start", async () => {
        repository.setSubagentWorktreeStrategyDefault("separate-worktrees");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
          requestId: "req-prereq-fail",
          projectId,
          threadId,
          content: "complex failing prerequisite task"
        }, 30000);
        const failedRunPromise = waitForEvent(
          socket,
          "run.updated",
          (event) => event.payload.run.id === ready.payload.run.id && event.payload.run.status === "failed",
          30000
        );

        socket.send(
          JSON.stringify({
            type: "run.execute",
            requestId: "req-prereq-fail-execute",
            payload: {
              projectId,
              threadId,
              runId: ready.payload.run.id
            }
          })
        );

        const failedRun = await failedRunPromise;
        expect(failedRun.payload.run.failureMessage).toContain("prerequisite setup failed");
        const callKinds = adapter.calls.map((call) => call.kind);
        expect(callKinds).toContain("executor");
        expect(callKinds).not.toContain("subagent");
        socket.close();
      }, 60000);


      serverTest("emits live Harness milestone windows and hides aggregation noise", async () => {
        await restartWithRealOsAdapters();
        repository.setSubagentWorktreeStrategyDefault("same-worktree");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const appendedMessages: Array<{ role: string; kind?: string; content: string }> = [];
        const updatedMessages: Array<{ role: string; kind?: string; content: string }> = [];
        const streamingTailContents: string[] = [];
        const listener = (event: MessageEvent) => {
          const payload = JSON.parse(event.data as string);
          if (payload.type === "chat.message-appended" || payload.type === "thread.message-appended") {
            appendedMessages.push(payload.payload.message);
          }
          if (payload.type === "chat.message-updated") {
            updatedMessages.push(payload.payload.message);
          }
          if (payload.type === "chat.streaming-tail-updated") {
            streamingTailContents.push(payload.payload.segments.map((segment: { content: string }) => segment.content).join("\n"));
          }
        };
        socket.addEventListener("message", listener);

        const ready = await sendChatUntilReady(socket, {
          requestId: "req-milestone-only",
          projectId,
          threadId,
          content: "complex task"
        }, 30000);

        const harnessMessagePromise = waitForEvent(
          socket,
          "chat.streaming-tail-updated",
          (event) => event.payload.segments.some((segment: { content: string }) => segment.content.includes("Subagent Inspect files: started.")),
          30000
        );
        const retryMessagePromise = waitForEvent(
          socket,
          "chat.streaming-tail-updated",
          (event) => event.payload.segments.some((segment: { content: string }) => segment.content.includes("retrying attempt 2")),
          30000
        );
        const failMessagePromise = waitForEvent(
          socket,
          "chat.streaming-tail-updated",
          (event) => event.payload.segments.some((segment: { content: string }) => segment.content.includes("Subagent fail: Patch code.")),
          30000
        );
        const completePromise = waitForEvent(socket, "chat.complete", undefined, 30000);
        socket.send(
          JSON.stringify({
            type: "run.execute",
            requestId: "req-milestone-only-execute",
            payload: {
              projectId,
              threadId,
              runId: ready.payload.run.id
            }
          })
        );

        await harnessMessagePromise;
        await retryMessagePromise;
        await failMessagePromise;
        await waitForEvent(
          socket,
          "chat.streaming-tail-updated",
          (event) => event.payload.segments.some((segment: { content: string }) => segment.content.includes("Subagent Patch code: patched code")),
          30000
        );
        await waitForAdapterCall(adapter, "aggregator", 30000);
        const complete = await completePromise;
        await pingServer(socket, "req-milestone-drain");

        socket.removeEventListener("message", listener);
        expect(appendedMessages.some((message) => message.kind === "run-milestones")).toBe(false);
        expect(updatedMessages.some((message) => message.kind === "run-milestones")).toBe(false);
        expect(streamingTailContents.some((message) => message.includes("Subagent Inspect files: started."))).toBe(true);
        expect(streamingTailContents.some((message) => message.includes("Subagent Patch code: retrying attempt 2."))).toBe(true);
        expect(streamingTailContents.some((message) => message.includes("Subagent Patch code: patched code"))).toBe(true);
        expect(streamingTailContents.some((message) => message.includes("shell running 5s+"))).toBe(false);
        expect(streamingTailContents.some((message) => message.includes("Aggregator: shell"))).toBe(false);
        expect(appendedMessages.some((message) => message.role === "system" && message.content.includes("Subagent"))).toBe(false);
        expect(streamingTailContents.some((message) => message.includes("Subagent progress:"))).toBe(false);
        expect(streamingTailContents.some((message) => message.includes("Aggregating subagent results"))).toBe(false);
        expect(streamingTailContents.some((message) => message.includes("Subagent aggregation completed"))).toBe(false);
        const milestoneRows = [...appendedMessages, ...updatedMessages].filter((message) => message.kind === "run-milestones");
        expect(milestoneRows).toHaveLength(0);
        const finalMessages = complete.payload.state.messages;
        const finalAssistantIndex = finalMessages.findLastIndex((message: { role: string; kind?: string }) => message.role === "assistant" && message.kind !== "run-milestones");
        const lastMilestoneIndex = finalMessages.findLastIndex((message: { kind?: string }) => message.kind === "run-milestones");
        expect(lastMilestoneIndex).toBeGreaterThan(-1);
        expect(finalAssistantIndex).toBeGreaterThan(lastMilestoneIndex);
        socket.close();
      }, 60000);


      serverTest("aggregates repeated subagent shell failure milestones", async () => {
        repository.setSubagentWorktreeStrategyDefault("same-worktree");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
          requestId: "req-tool-failure-burst",
          projectId,
          threadId,
          content: "complex tool failure burst"
        }, 30000);

        socket.send(
          JSON.stringify({
            type: "run.execute",
            requestId: "req-tool-failure-burst-execute",
            payload: {
              projectId,
              threadId,
              runId: ready.payload.run.id
            }
          })
        );

        const completed = await waitForEvent(socket, "chat.complete", undefined, 30000);

        expect(
          completed.payload.state.messages.some((message: { content: string }) =>
            message.content.includes("Subagent Tool failure task: shell failed")
          )
        ).toBe(false);
        socket.close();
      }, 60000);


      serverTest("reports subagent failures before slower siblings finish", async () => {
        repository.setSubagentWorktreeStrategyDefault("same-worktree");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
          requestId: "req-early-fail",
          projectId,
          threadId,
          content: "complex early fail"
        }, 30000);

        let completeResolved = false;
        const completeListener = (event: MessageEvent) => {
          const payload = JSON.parse(event.data as string);
          if (payload.type === "chat.complete") {
            completeResolved = true;
          }
        };
        socket.addEventListener("message", completeListener);

        socket.send(
          JSON.stringify({
            type: "run.execute",
            requestId: "req-early-fail-execute",
            payload: {
              projectId,
              threadId,
              runId: ready.payload.run.id
            }
          })
        );

        const failMessage = await waitForEvent(
          socket,
          "chat.streaming-tail-updated",
          (event) => event.payload.segments.some((segment: { content: string }) => segment.content.includes("Subagent fail: Patch code.")),
          30000
        );

        expect(failMessage.payload.segments.map((segment: { content: string }) => segment.content).join("\n")).toContain("Progress 0/2, 1 failed.");
        await adapter.waitForCall("subagent", (call) => call.prompt.includes("Inspect files slow"), 30000);
        expect(completeResolved).toBe(false);
        adapter.releaseDeferredSubagents();
        socket.removeEventListener("message", completeListener);
        socket.close();
      }, 60000);


      serverTest("surfaces aggregating run status before final completion", async () => {
        repository.setSubagentWorktreeStrategyDefault("same-worktree");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
          requestId: "req-aggregating-status",
          projectId,
          threadId,
          content: "complex status window"
        }, 30000);
        const aggregatingPromise = waitForEvent(
          socket,
          "run.updated",
          (event) => event.payload.run.id === ready.payload.run.id && event.payload.run.status === "aggregating",
          30000
        );
        socket.send(
          JSON.stringify({
            type: "run.execute",
            requestId: "req-aggregating-status-execute",
            payload: {
              projectId,
              threadId,
              runId: ready.payload.run.id
            }
          })
        );

        const aggregating = await aggregatingPromise;
        expect(aggregating.payload.run.status).toBe("aggregating");
        adapter.releaseDeferredAggregators();
        socket.close();
      }, 60000);


      serverTest("does not append harness connect or tool lifecycle noise to chat", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const chatMessages: string[] = [];
        const listener = (event: MessageEvent) => {
          const payload = JSON.parse(event.data as string);
          if (payload.type === "chat.message-appended" || payload.type === "thread.message-appended") {
            chatMessages.push(payload.payload.message.content);
          }
        };
        socket.addEventListener("message", listener);

        await sendChatAndExecute(socket, {
          requestId: "req-browser-noise",
          projectId,
          threadId,
          content: "browser noise"
        }, 30000);

        socket.removeEventListener("message", listener);
        expect(chatMessages.some((message) => message.includes("Harness connected. Working."))).toBe(false);
        expect(chatMessages.some((message) => message.includes("Harness using"))).toBe(false);
        expect(chatMessages.some((message) => message.includes("Harness finished"))).toBe(false);
        expect(chatMessages.some((message) => message.includes("Harness tool failed"))).toBe(false);
        socket.close();
      }, 60000);
  });
}

export function registerServerCorrectnessTests(options: ServerTestShardOptions = {}) {
  describe("harness server correctness", () => {
    const serverTest = createServerTestRegistrar(options);
    const fixture = useGitProjectFixture({
      fixtureName: "server-correctness",
      packageName: "test-project",
      readmeTitle: "# Test Project\n",
      gitIgnore: ".local\nnode_modules\ndist\n"
    });
    let server: Awaited<ReturnType<typeof startHarnessServer>>;
    let adapter: FakePiAgentAdapter;
    let repository: WorkspaceRepository;
    let dbPath: string;
    let extraProjectRoot: string;
    let projectRoot: string;
    let port: number;

    beforeEach(async () => {
      projectRoot = await fixture.createRepoClone(`repo-${crypto.randomUUID()}`);
      extraProjectRoot = fixture.createTempDir(`project-${crypto.randomUUID()}`);
      dbPath = ":memory:";
      port = 0;

      adapter = new FakePiAgentAdapter();
      repository = new WorkspaceRepository(dbPath, projectRoot, { durability: "test-fast" });
      ({ server, port } = await startServerForTest({
        port: 0,
        adapter,
        repository,
        pickFolder: async () => extraProjectRoot,
        serverOnly: true,
        useFastOsAdapters: false
      }));
    });

    afterEach(async () => {
      await stopServerForTest(server);
    });


    
      serverTest("presents a corrective plan when correctness review finds a runnable gap", async () => {
        writeFileSync(
          path.join(projectRoot, "index.html"),
          '<!doctype html><html><body><script type="module" src="./app.ts"></script></body></html>\n'
        );
        writeFileSync(path.join(projectRoot, "app.ts"), 'console.log("hello");\n');
        mkdirSync(path.join(projectRoot, "node_modules", "autoprefixer", "lib"), { recursive: true });
        writeFileSync(path.join(projectRoot, "node_modules", "autoprefixer", "lib", "old-selector.js"), "module.exports = {};\n");
    
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
    
        const initialReadyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready", 10000);
        socket.send(JSON.stringify(createChatSendCommand({
          requestId: "req-correctness-gap",
          projectId,
          threadId,
          content: "simple task"
        })));
        const initialReady = await initialReadyPromise;
        await executeReadyRunUntil(
          socket,
          {
            requestId: "req-correctness-gap-execute",
            projectId,
            threadId,
            runId: initialReady.payload.run.id
          },
          [correctiveReadyPromise],
          10000,
          { includeChatComplete: false }
        );
    
        const correctiveReady = await correctiveReadyPromise;
        expect(correctiveReady.payload.run.plan?.origin).toBe("correctness-followup");
        expect(correctiveReady.payload.run.plan?.gating.mode).toBe("immediate");
        expect(correctiveReady.payload.run.plan?.summary).toContain("TypeScript modules directly");
        expect(correctiveReady.payload.run.plan?.summary).not.toContain("node_modules");
        socket.close();
      }, 15000);


    
      serverTest("corrective follow-up upgrades implement mode to approval when gaps can parallelize", async () => {
        writeFileSync(
          path.join(projectRoot, "index.html"),
          '<!doctype html><html><body><script type="module" src="./app.ts"></script></body></html>\n'
        );
        writeFileSync(path.join(projectRoot, "app.ts"), 'console.log("hello");\n');
        writeFileSync(path.join(projectRoot, "temp-helper.ts"), "export const temp = true;\n");
    
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-corrective-parallel-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const correctiveReadyPromise = waitForEvent(
          socket,
          "run.updated",
          (event) => event.payload.run.status === "ready" && event.payload.run.plan?.origin === "correctness-followup",
          10000
        );
    
        const initialReadyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready", 10000);
        socket.send(JSON.stringify(createChatSendCommand({
          requestId: "req-corrective-parallel-send",
          projectId,
          threadId,
          content: "simple task"
        })));
        const initialReady = await initialReadyPromise;
        await executeReadyRunUntil(
          socket,
          {
            requestId: "req-corrective-parallel-execute",
            projectId,
            threadId,
            runId: initialReady.payload.run.id
          },
          [correctiveReadyPromise],
          10000,
          { includeChatComplete: false }
        );
    
        const correctiveReady = await correctiveReadyPromise;
        expect(correctiveReady.payload.run.plan?.origin).toBe("correctness-followup");
        expect(correctiveReady.payload.run.plan?.route).toBe("pi-subagents");
        expect(correctiveReady.payload.run.plan?.actualSubagentCount).toBeGreaterThan(1);
        expect(correctiveReady.payload.run.plan?.gating.mode).toBe("approve");
        socket.close();
      }, 15000);
  });
}

export function registerServerProjectsAndHistoryTests(options: ServerTestShardOptions = {}) {
  describe("harness server projects and history", () => {
    const serverTest = createServerTestRegistrar(options);
    const fixture = useGitProjectFixture({
      fixtureName: "server-projects-history",
      packageName: "test-project",
      readmeTitle: "# Test Project\n",
      gitIgnore: ".local\nnode_modules\ndist\n"
    });
    let server: Awaited<ReturnType<typeof startHarnessServer>>;
    let adapter: FakePiAgentAdapter;
    let repository: WorkspaceRepository;
    let dbPath: string;
    let extraProjectRoot: string;
    let projectRoot: string;
    let port: number;

    beforeEach(async () => {
      projectRoot = await fixture.createRepoClone(`repo-${crypto.randomUUID()}`);
      extraProjectRoot = fixture.createTempDir(`project-${crypto.randomUUID()}`);
      dbPath = fixture.createTempPath(`server-${crypto.randomUUID()}.sqlite`);
      port = 0;

      adapter = new FakePiAgentAdapter();
      repository = new WorkspaceRepository(dbPath, projectRoot, { durability: "test-fast" });
      ({ server, port } = await startServerForTest({
        port: 0,
        adapter,
        repository,
        pickFolder: async () => extraProjectRoot,
        serverOnly: true
      }));
    });

    afterEach(async () => {
      await stopServerForTest(server);
    });

    async function restartWithRealOsAdapters() {
      await stopServerForTest(server);
      ({ server, port } = await startServerForTest({
        port: 0,
        adapter,
        repository,
        pickFolder: async () => extraProjectRoot,
        serverOnly: true,
        useFastOsAdapters: false
      }));
    }


    
      serverTest("defers run.refresh while active main execution is streaming", async () => {
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

      serverTest("restores persisted in-flight assistant text after reconnect during streaming", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
          requestId: "req-stream-reconnect-1",
          projectId,
          threadId,
          content: "streaming refresh"
        });

        socket.send(
          JSON.stringify({
            type: "run.execute",
            requestId: "req-stream-reconnect-execute",
            payload: {
              projectId,
              threadId,
              runId: ready.payload.run.id
            }
          })
        );

        await waitForEvent(socket, "chat.delta", (event) => event.payload.delta === "working", 10000);
        socket.close();

        const reconnectSocket = createSocket(port);
        const reconnectReady = await waitForEvent(reconnectSocket, "connection.ready");
        const restoredProject = reconnectReady.payload.workspace.projects.find((project: { id: string }) => project.id === projectId);
        expect(restoredProject?.activeRun?.id).toBe(ready.payload.run.id);
        expect(restoredProject?.session.isStreaming).toBe(true);
        expect(restoredProject?.session.messages.at(-1)?.content).toBe("working");

        const complete = await waitForEvent(
          reconnectSocket,
          "chat.complete",
          (event) => event.payload.projectId === projectId && event.payload.threadId === threadId,
          10000
        );
        expect(complete.payload.assistantMessage.content).toBe("main execution result");
        expect(complete.payload.state.messages.at(-1)?.content).toBe("main execution result");

        reconnectSocket.close();
      }, 10000);


      serverTest("creates a new thread while another thread is still streaming", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const originalThreadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
          requestId: "req-thread-during-stream-1",
          projectId,
          threadId: originalThreadId,
          content: "streaming refresh"
        });
        const runningRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "running-main");
        const deltaPromise = waitForEvent(socket, "chat.delta", (event) => event.payload.threadId === originalThreadId);
        const createThreadPromise = waitForEvent(socket, "thread.created");
        const completePromise = waitForEvent(
          socket,
          "chat.complete",
          (event) => event.payload.projectId === projectId && event.payload.threadId === originalThreadId,
          10000
        );

        socket.send(
          JSON.stringify({
            type: "run.execute",
            requestId: "req-thread-during-stream-execute",
            payload: {
              projectId,
              threadId: originalThreadId,
              runId: ready.payload.run.id
            }
          })
        );

        await runningRunPromise;
        await deltaPromise;

        socket.send(
          JSON.stringify({
            type: "thread.create",
            requestId: "req-thread-during-stream-create",
            payload: {
              projectId
            }
          })
        );

        const created = await createThreadPromise;
        const newThreadId = created.payload.project.activeThreadId;
        expect(newThreadId).not.toBe(originalThreadId);

        const completed = await completePromise;
        expect(completed.payload.threadId).toBe(originalThreadId);
        expect(repository.getProject(projectId).activeThreadId).toBe(newThreadId);
        expect(repository.getThreadMessages(projectId, originalThreadId).at(-1)?.content).toBe("main execution result");
        socket.close();
      }, 10000);

      serverTest("deleting a background streaming thread stops its active agents", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const originalThreadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready", 10000);
        socket.send(JSON.stringify(createChatSendCommand({
          requestId: "req-delete-streaming-thread-send",
          projectId,
          threadId: originalThreadId,
          content: "streaming refresh"
        })));
        const ready = await readyPromise;
        const runningRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "running-main");
        const deltaPromise = waitForEvent(socket, "chat.delta", (event) => event.payload.threadId === originalThreadId);
        const createThreadPromise = waitForEvent(socket, "thread.created");

        socket.send(
          JSON.stringify({
            type: "run.execute",
            requestId: "req-delete-streaming-thread-execute",
            payload: {
              projectId,
              threadId: originalThreadId,
              runId: ready.payload.run.id
            }
          })
        );

        await runningRunPromise;
        await deltaPromise;

        socket.send(
          JSON.stringify({
            type: "thread.create",
            requestId: "req-delete-streaming-thread-create",
            payload: {
              projectId
            }
          })
        );
        await createThreadPromise;

        const stoppedRunPromise = waitForEvent(
          socket,
          "run.updated",
          (event) => event.payload.threadId === originalThreadId && event.payload.run.status === "stopped",
          10000
        );
        const projectUpdatedPromise = waitForEvent(
          socket,
          "project.updated",
          (event) => event.payload.project.threads.some((thread: any) => thread.id === originalThreadId && thread.status === "archived"),
          10000
        );

        socket.send(
          JSON.stringify({
            type: "thread.archive",
            requestId: "req-delete-streaming-thread-archive",
            payload: {
              projectId,
              threadId: originalThreadId
            }
          })
        );

        const stoppedRun = await stoppedRunPromise;
        await projectUpdatedPromise;
        expect(stoppedRun.payload.run.failureMessage).toBe("Thread deleted; active agents stopped");
        expect(repository.getRun(projectId, ready.payload.run.id)?.status).toBe("stopped");
        expect(repository.getProject(projectId).threads.find((thread) => thread.id === originalThreadId)?.status).toBe("archived");
        socket.close();
      }, 10000);

      serverTest("planner question from background thread stays on owning thread after focus changes", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const originalThreadId = opened.payload.project.activeThreadId;
        const questionRunPromise = waitForEvent(
          socket,
          "run.updated",
          (event) => event.payload.threadId === originalThreadId && event.payload.run.status === "awaiting-user-input",
          10000
        );
        const questionMessagePromise = waitForEvent(
          socket,
          "thread.message-appended",
          (event) =>
            event.payload.threadId === originalThreadId &&
            event.payload.message.content.includes("Which route should handle this?"),
          10000
        );
        const createThreadPromise = waitForEvent(socket, "thread.created");

        socket.send(
          JSON.stringify(
            createChatSendCommand({
              requestId: "req-background-question-send",
              projectId,
              threadId: originalThreadId,
              content: "slow needs clarification"
            })
          )
        );
        socket.send(
          JSON.stringify({
            type: "thread.create",
            requestId: "req-background-question-create",
            payload: {
              projectId
            }
          })
        );

        const created = await createThreadPromise;
        const focusedThreadId = created.payload.project.activeThreadId;
        expect(focusedThreadId).not.toBe(originalThreadId);
        const questionRun = await questionRunPromise;
        const questionMessage = await questionMessagePromise;

        expect(questionRun.payload.run.threadId).toBe(originalThreadId);
        expect(questionMessage.payload.threadId).toBe(originalThreadId);
        expect(repository.getProject(projectId).activeThreadId).toBe(focusedThreadId);
        expect(repository.getThreadMessages(projectId, originalThreadId).at(-1)?.content).toContain("Which route should handle this?");
        expect(repository.getThreadMessages(projectId, focusedThreadId).some((message) => message.content.includes("Which route should handle this?"))).toBe(false);
        socket.close();
      }, 10000);

      serverTest("renames a thread while it is streaming", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
          requestId: "req-thread-rename-streaming-1",
          projectId,
          threadId,
          content: "streaming refresh"
        });
        const runningRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "running-main");
        const deltaPromise = waitForEvent(socket, "chat.delta", (event) => event.payload.threadId === threadId);
        const renamedPromise = waitForEvent(socket, "thread.renamed");
        const completePromise = waitForEvent(
          socket,
          "chat.complete",
          (event) => event.payload.projectId === projectId && event.payload.threadId === threadId,
          10000
        );

        socket.send(
          JSON.stringify({
            type: "run.execute",
            requestId: "req-thread-rename-streaming-execute",
            payload: {
              projectId,
              threadId,
              runId: ready.payload.run.id
            }
          })
        );

        await runningRunPromise;
        await deltaPromise;

        socket.send(
          JSON.stringify({
            type: "thread.rename",
            requestId: "req-thread-rename-streaming-rename",
            payload: {
              projectId,
              threadId,
              title: "Renamed during stream"
            }
          })
        );

        const renamed = await renamedPromise;
        expect(renamed.payload.thread.id).toBe(threadId);
        expect(renamed.payload.thread.title).toBe("Renamed during stream");

        const completed = await completePromise;
        expect(completed.payload.threadId).toBe(threadId);
        expect(repository.getProject(projectId).threads.find((thread) => thread.id === threadId)?.title).toBe("Renamed during stream");
        expect(repository.getThreadMessages(projectId, threadId).at(-1)?.content).toBe("main execution result");
        socket.close();
      }, 10000);

      serverTest("starts a second thread run while another thread is still working", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const originalThreadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
          requestId: "req-thread-blocked-1",
          projectId,
          threadId: originalThreadId,
          content: "streaming refresh"
        });
        const runningRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "running-main");
        const deltaPromise = waitForEvent(socket, "chat.delta", (event) => event.payload.threadId === originalThreadId);
        const createThreadPromise = waitForEvent(socket, "thread.created");
        const secondReadyPromise = waitForEvent(
          socket,
          "run.updated",
          (event) => event.payload.run.threadId !== originalThreadId && event.payload.run.status === "ready",
          10000
        );

        socket.send(
          JSON.stringify({
            type: "run.execute",
            requestId: "req-thread-blocked-execute",
            payload: {
              projectId,
              threadId: originalThreadId,
              runId: ready.payload.run.id
            }
          })
        );

        await runningRunPromise;
        await deltaPromise;

        socket.send(
          JSON.stringify({
            type: "thread.create",
            requestId: "req-thread-blocked-create",
            payload: {
              projectId
            }
          })
        );

        const created = await createThreadPromise;
        const newThreadId = created.payload.project.activeThreadId;

        socket.send(
          JSON.stringify({
            type: "chat.send",
            requestId: "req-thread-parallel-send",
            payload: {
              projectId,
              threadId: newThreadId,
              agentId: "pi",
              content: "second thread work"
            }
          })
        );

        const secondReady = await secondReadyPromise;
        expect(secondReady.payload.threadId).toBe(newThreadId);
        expect(secondReady.payload.run.threadId).toBe(newThreadId);
        const secondThreadMessages = repository.getThreadMessages(projectId, newThreadId);
        expect(secondThreadMessages.some((message) => message.content === "second thread work")).toBe(true);
        expect(secondThreadMessages.at(-1)?.kind).toBe("plan-summary");
        socket.close();
      }, 10000);

      serverTest("stops a background-thread run by run id after switching threads", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const originalThreadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
          requestId: "req-thread-stop-1",
          projectId,
          threadId: originalThreadId,
          content: "streaming refresh"
        });
        const runningRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "running-main");
        const deltaPromise = waitForEvent(socket, "chat.delta", (event) => event.payload.threadId === originalThreadId);
        const createThreadPromise = waitForEvent(socket, "thread.created");
        const stoppedRunPromise = waitForEvent(
          socket,
          "run.updated",
          (event) => event.payload.threadId === originalThreadId && event.payload.run.status === "stopped"
        );
        const errorPromise = waitForEvent(
          socket,
          "chat.error",
          (event) => event.payload.projectId === projectId && event.payload.threadId === originalThreadId
        );

        socket.send(
          JSON.stringify({
            type: "run.execute",
            requestId: "req-thread-stop-execute",
            payload: {
              projectId,
              threadId: originalThreadId,
              runId: ready.payload.run.id
            }
          })
        );

        await runningRunPromise;
        await deltaPromise;

        socket.send(
          JSON.stringify({
            type: "thread.create",
            requestId: "req-thread-stop-create",
            payload: {
              projectId
            }
          })
        );

        await createThreadPromise;

        socket.send(
          JSON.stringify({
            type: "chat.stop",
            requestId: "req-thread-stop-stop",
            payload: {
              projectId,
              threadId: originalThreadId,
              runId: ready.payload.run.id
            }
          })
        );

        await stoppedRunPromise;
        const errorEvent = await errorPromise;
        expect(errorEvent.payload.message).toContain("stopped");
        socket.close();
      }, 10000);

      serverTest("refreshes and removal-checks the original run after switching threads", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const originalThreadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
          requestId: "req-thread-refresh-1",
          projectId,
          threadId: originalThreadId,
          content: "streaming refresh"
        });
        const runningRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "running-main");
        const deltaPromise = waitForEvent(socket, "chat.delta", (event) => event.payload.threadId === originalThreadId);
        const createThreadPromise = waitForEvent(socket, "thread.created");

        socket.send(
          JSON.stringify({
            type: "run.execute",
            requestId: "req-thread-refresh-execute",
            payload: {
              projectId,
              threadId: originalThreadId,
              runId: ready.payload.run.id
            }
          })
        );

        await runningRunPromise;
        await deltaPromise;

        socket.send(
          JSON.stringify({
            type: "thread.create",
            requestId: "req-thread-refresh-create",
            payload: {
              projectId
            }
          })
        );

        await createThreadPromise;
        const deferredTracePromise = waitForEvent(
          socket,
          "agent.trace",
          (event) => event.payload.threadId === originalThreadId && event.payload.trace.stage === "refresh-deferred"
        );
        const rejectedRemovePromise = waitForEvent(socket, "command.rejected");
        const removedPromise = waitForEvent(socket, "project.removed");

        socket.send(
          JSON.stringify({
            type: "run.refresh",
            requestId: "req-thread-refresh-refresh",
            payload: {
              projectId,
              threadId: originalThreadId,
              runId: ready.payload.run.id
            }
          })
        );

        await deferredTracePromise;

        socket.send(
          JSON.stringify({
            type: "project.remove",
            requestId: "req-thread-refresh-remove-blocked",
            payload: {
              projectId
            }
          })
        );

        const rejected = await rejectedRemovePromise;
        expect(rejected.payload.detail).toContain("streaming");

        socket.send(
          JSON.stringify({
            type: "chat.stop",
            requestId: "req-thread-refresh-stop",
            payload: {
              projectId,
              threadId: originalThreadId,
              runId: ready.payload.run.id
            }
          })
        );

        await waitForEvent(
          socket,
          "run.updated",
          (event) => event.payload.threadId === originalThreadId && event.payload.run.status === "stopped"
        );

        socket.send(
          JSON.stringify({
            type: "project.remove",
            requestId: "req-thread-refresh-remove",
            payload: {
              projectId
            }
          })
        );

        const removed = await removedPromise;
        expect(removed.payload.projectId).toBe(projectId);
        socket.close();
      }, 10000);


      serverTest("rejects run.refresh for completed runs", async () => {
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


      serverTest("rejects stale completed plan execution by persisted run status", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const completedRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "completed");
        const ready = await sendChatUntilReady(socket, {
          requestId: "req-execute-completed-1",
          projectId,
          threadId,
          content: "simple task"
        });
        await executeReadyRun(socket, {
          requestId: "req-execute-completed-execute",
          projectId,
          threadId,
          runId: ready.payload.run.id
        });
        const completedRun = await completedRunPromise;
        const rejectedPromise = waitForEvent(socket, "command.rejected");

        socket.send(
          JSON.stringify({
            type: "run.execute",
            requestId: "req-execute-completed-2",
            payload: {
              projectId,
              threadId,
              runId: completedRun.payload.run.id
            }
          })
        );

        const rejected = await rejectedPromise;
        expect(rejected.payload.detail).toContain("Run status completed is not executable");
        expect(rejected.payload.detail).not.toContain("Project has no active run");
        socket.close();
      });


    
      serverTest("opens project through typed folder browse command", async () => {
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


    
      serverTest("creates a missing folder through typed project.create command", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const createdRoot = path.join(fixture.createTempDir(`new-parent-${crypto.randomUUID()}`), "created-project");
        const addedPromise = waitForEvent(socket, "project.opened");
    
        socket.send(
          JSON.stringify({
            type: "project.create",
            requestId: "req-create-project",
            payload: {
              rootPath: createdRoot
            }
          })
        );
    
        const added = await addedPromise;
        expect(existsSync(createdRoot)).toBe(true);
        expect(added.payload.project.rootPath).toBe(createdRoot);
        expect(added.payload.resolution).toBe("created-project");
        socket.close();
      });


    
      serverTest("initializes git with a baseline commit for non-git projects", async () => {
        const nonGitRoot = fixture.createTempDir(`non-git-${crypto.randomUUID()}`);
        writeFileSync(path.join(nonGitRoot, "notes.md"), "baseline\n");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, nonGitRoot, "req-non-git-open");
        const initializedPromise = waitForEvent(socket, "project.git.initialized");
    
        socket.send(
          JSON.stringify({
            type: "project.git.initBaseline",
            requestId: "req-init-baseline",
            payload: {
              projectId: opened.payload.project.id
            }
          })
        );
    
        const initialized = await initializedPromise;
        expect(initialized.payload.initialized).toBe(true);
        expect(initialized.payload.baselineCommitCreated).toBe(true);
        expect(existsSync(path.join(nonGitRoot, ".git"))).toBe(true);
        expect((await runGitOutput(["rev-parse", "--verify", "HEAD"], nonGitRoot)).trim()).toHaveLength(40);
        socket.close();
      });


    
      serverTest("returns ranked filesystem suggestions through project.search", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        await openProject(socket, projectRoot, "req-project-search-open");
        const searchPromise = waitForEvent(socket, "project.search.results", undefined, 15000);
    
        socket.send(
          JSON.stringify({
            type: "project.search",
            requestId: "req-project-search",
            payload: {
              query: "repo"
            }
          })
        );
    
        const searchResults = await searchPromise;
        expect(searchResults.payload.query).toBe("repo");
        expect(searchResults.payload.results.length).toBeGreaterThan(0);
        expect(searchResults.payload.results[0]?.repoKind).toBe("git-repo");
        expect(typeof searchResults.payload.results[0]?.rootPath).toBe("string");
        socket.close();
      }, 15000);


    
      serverTest("reopens existing project by creating a new thread", async () => {
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

      serverTest("restores pending planner question when switching back to its thread", async () => {
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-thread-question-open");
        const projectId = opened.payload.project.id;
        const originalThreadId = opened.payload.project.activeThreadId;
        const createdPromise = waitForEvent(socket, "thread.created");

        socket.send(
          JSON.stringify({
            type: "thread.create",
            requestId: "req-thread-question-create",
            payload: {
              projectId
            }
          })
        );

        const created = await createdPromise;
        const questionThreadId = created.payload.project.activeThreadId;
        const questionRunPromise = waitForEvent(
          socket,
          "run.updated",
          (event) =>
            event.payload.projectId === projectId &&
            event.payload.threadId === questionThreadId &&
            event.payload.run.status === "awaiting-user-input"
        );

        socket.send(
          JSON.stringify({
            type: "chat.send",
            requestId: "req-thread-question-ask",
            payload: {
              projectId,
              threadId: questionThreadId,
              agentId: "pi",
              content: "needs clarification"
            }
          })
        );

        const questionRun = await questionRunPromise;
        const switchAwayPromise = waitForEvent(
          socket,
          "thread.activated",
          (event) => event.payload.projectId === projectId && event.payload.project.activeThreadId === originalThreadId
        );

        socket.send(
          JSON.stringify({
            type: "thread.activate",
            requestId: "req-thread-question-switch-away",
            payload: {
              projectId,
              threadId: originalThreadId
            }
          })
        );

        await switchAwayPromise;
        const switchBackPromise = waitForEvent(
          socket,
          "thread.activated",
          (event) => event.payload.projectId === projectId && event.payload.project.activeThreadId === questionThreadId
        );

        socket.send(
          JSON.stringify({
            type: "thread.activate",
            requestId: "req-thread-question-switch-back",
            payload: {
              projectId,
              threadId: questionThreadId
            }
          })
        );

        const switchedBack = await switchBackPromise;
        expect(switchedBack.payload.project.activeRun?.id).toBe(questionRun.payload.run.id);
        expect(switchedBack.payload.project.activeRun?.status).toBe("awaiting-user-input");
        expect(switchedBack.payload.project.activeRun?.questions[0]?.prompt).toContain("Which route");
        expect(switchedBack.payload.project.activeRun?.questions[0]?.status).toBe("pending");

        const complete = await answerPlanningQuestionAndExecute(socket, {
          requestId: "req-thread-question-answer",
          projectId,
          threadId: questionThreadId,
          runId: questionRun.payload.run.id,
          questionId: questionRun.payload.run.questions[0]!.id,
          content: "api/users/[id]"
        });

        expect(complete.payload.assistantMessage.content).toBe("main execution result");
        socket.close();
      });


    
      serverTest("removes final project and returns to empty workspace", async () => {
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


    
      serverTest("restores persisted chat history after restart", async () => {
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
        await stopServerForTest(server);
    
        ({ server, port } = await startServerForTest({
          port: 0,
          adapter,
          repository: new WorkspaceRepository(dbPath, projectRoot, { durability: "test-fast" }),
          serverOnly: true
        }));
    
        const nextSocket = createSocket(port);
        const nextReady = await waitForEvent(nextSocket, "connection.ready");
        const restoredProject = nextReady.payload.workspace.projects.find((project: any) => project.id === projectId);
    
        expect(restoredProject.session.messages.length).toBeGreaterThanOrEqual(3);
        expect(restoredProject.session.messages[0].content).toBe("simple task");
        expect(restoredProject.session.messages.some((message: any) => message.kind === "run-milestones")).toBe(true);
        expect(restoredProject.session.messages.at(-1).content).toBe("main execution result");
        expect(restoredProject.lastRun?.status).toBe("completed");
        expect(restoredProject.lastRun?.retryable).toBe(true);
        nextSocket.close();
      });


    
      serverTest("allows chat runs in non-git folders when dirty git restriction is disabled", async () => {
        repository.setBlockChatOnDirtyGitDefault(false);
        const nonGitRoot = createStandaloneTempDir(`non-git-disabled-${crypto.randomUUID()}`);
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, nonGitRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
          requestId: "req-non-git-disabled",
          projectId,
          threadId,
          content: "simple task"
        });
    
        await executeReadyRun(socket, {
          requestId: "req-non-git-disabled-execute",
          projectId,
          threadId,
          runId: ready.payload.run.id
        });
    
        socket.close();
      });


    
      serverTest("emits blocking preflight for non-git folders when dirty git restriction is enabled", async () => {
        await restartWithRealOsAdapters();
        const nonGitRoot = createStandaloneTempDir(`non-git-enabled-${crypto.randomUUID()}`);
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, nonGitRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const preflightPromise = waitForEvent(socket, "run.preflight");
    
        socket.send(
          JSON.stringify({
            type: "chat.send",
            requestId: "req-non-git-enabled",
            payload: {
              projectId,
              threadId,
              agentId: "pi",
              content: "simple task"
            }
          })
        );
    
        const preflight = await preflightPromise;
        expect(preflight.payload.preflight.kind).toBe("git-not-repo");
        expect(preflight.payload.preflight.severity).toBe("blocking");
        socket.close();
      });


    
      serverTest("emits dirty git warning and still runs when change count is within threshold", async () => {
        await restartWithRealOsAdapters();
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


    
      serverTest("rejects chat.send and run.retry when git is too dirty", async () => {
        await restartWithRealOsAdapters();
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


    
      serverTest("honors custom dirty git change limit", async () => {
        await restartWithRealOsAdapters();
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


    
      serverTest("allows chat runs on dirty repos when dirty git restriction is disabled", async () => {
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


    
      serverTest("retries completed main run with a fresh planner + executor pass", async () => {
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


    
      serverTest("planning.refine replaces the ready plan with a fresh run", async () => {
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


    
      serverTest("allows a second top-level send after a completed run in the same thread", async () => {
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


    
      serverTest("emits project context usage updates for planner and executor", async () => {
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
}

export function registerServerRuntimeBudgetTests(options: ServerTestShardOptions = {}) {
  describe("harness server runtime budget", () => {
    const serverTest = createServerTestRegistrar(options);
    const fixture = useGitProjectFixture({
      fixtureName: "server-runtime-budget",
      packageName: "runtime-budget-test",
      readmeTitle: "# Runtime Budget Test\n",
      gitIgnore: ".local\nnode_modules\ndist\n"
    });

    let adapter: FakePiAgentAdapter;
    let repository: WorkspaceRepository;

    beforeEach(() => {
      adapter = new FakePiAgentAdapter();
      repository = new WorkspaceRepository(":memory:", process.cwd(), { durability: "test-fast" });
    });

    serverTest("budgeted run fails with turn-budget-exhausted before next model call", async () => {
      const projectRoot = await fixture.createRepoClone("budget-exhausted");
      const { server, port } = await startServerForTest({ port: 0, adapter, repository });
      const socket = createSocket(port);
      await waitForEvent(socket, "connection.ready");
      const opened = await openProject(socket, projectRoot, "req-budget-open");

      const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
      socket.send(
        JSON.stringify({
          type: "chat.send",
          requestId: "req-budget-send",
          payload: {
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            agentId: "pi",
            content: "Do budgeted work",
            runtimeBudget: { maxTurns: 1 }
          }
        })
      );
      const ready = await readyPromise;
      expect(adapter.calls).toHaveLength(1);
      expect(adapter.calls[0]?.prompt).toContain("Remaining turns after this: 0");

      const failedPromise = waitForEvent(
        socket,
        "run.updated",
        (event) => event.payload.run.id === ready.payload.run.id && event.payload.run.status === "failed"
      );
      const errorPromise = waitForEvent(socket, "chat.error", (event) => event.payload.detail.includes("turn-budget-exhausted"));
      socket.send(
        JSON.stringify({
          type: "run.execute",
          requestId: "req-budget-execute",
          payload: {
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            runId: ready.payload.run.id
          }
        })
      );

      const failed = await failedPromise;
      await errorPromise;
      expect(failed.payload.run.failureCategory).toBe("turn-budget-exhausted");
      expect(adapter.calls).toHaveLength(1);
      socket.close();
      await stopServerForTest(server);
    });

    serverTest("run.complete emits run.updated and chat.complete then rejects terminal repeat", async () => {
      const projectRoot = await fixture.createRepoClone("run-complete");
      const { server, port } = await startServerForTest({ port: 0, adapter, repository });
      const socket = createSocket(port);
      await waitForEvent(socket, "connection.ready");
      const opened = await openProject(socket, projectRoot, "req-complete-open");

      const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
      socket.send(
        JSON.stringify({
          type: "chat.send",
          requestId: "req-complete-send",
          payload: {
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            agentId: "pi",
            content: "Prepare completion"
          }
        })
      );
      const ready = await readyPromise;

      const completedPromise = waitForEvent(
        socket,
        "run.updated",
        (event) => event.payload.run.id === ready.payload.run.id && event.payload.run.status === "completed"
      );
      const chatCompletePromise = waitForEvent(socket, "chat.complete");
      socket.send(
        JSON.stringify({
          type: "run.complete",
          requestId: "req-complete-command",
          payload: {
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            runId: ready.payload.run.id,
            assistantMessageContent: "Completed by lifecycle command."
          }
        })
      );

      await completedPromise;
      const complete = await chatCompletePromise;
      expect(complete.payload.assistantMessage.content).toBe("Completed by lifecycle command.");

      const rejectedPromise = waitForEvent(socket, "command.rejected", (event) => event.requestId === "req-complete-repeat");
      socket.send(
        JSON.stringify({
          type: "run.complete",
          requestId: "req-complete-repeat",
          payload: {
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            runId: ready.payload.run.id,
            assistantMessageContent: "repeat"
          }
        })
      );
      const rejected = await rejectedPromise;
      expect(rejected.payload.detail).toContain("already terminal");
      socket.close();
      await stopServerForTest(server);
    });
  });
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

function createStandaloneTempDir(name: string) {
  const rootPath = path.join(os.tmpdir(), name);
  mkdirSync(rootPath, { recursive: true });
  return rootPath;
}

function createChatSendCommand(input: {
  requestId: string;
  projectId: string;
  threadId: string;
  content: string;
  agentId?: "pi" | "copilot-cli" | "codex-cli";
  executionModelId?: string;
  reasoningStrength?: "low" | "medium" | "high" | "extra-high";
  fastMode?: boolean;
  modeId?: string;
  modeLocked?: boolean;
  attachments?: Array<{
    id: string;
    kind: "image" | "text" | "document";
    documentType?: "pdf" | "docx" | "xlsx" | "pptx" | "odt";
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
      agentId: input.agentId ?? "pi",
      content: input.content,
      executionModelId: input.executionModelId,
      reasoningStrength: input.reasoningStrength,
      fastMode: input.fastMode,
      modeId: input.modeId,
      modeLocked: input.modeLocked,
      attachments: input.attachments
    }
  };
}

async function sendChatUntilReady(
  socket: WebSocket,
  input: {
    requestId: string;
    projectId: string;
    threadId: string;
    content: string;
    agentId?: "pi" | "copilot-cli" | "codex-cli";
    reasoningStrength?: "low" | "medium" | "high" | "extra-high";
    fastMode?: boolean;
    modeId?: string;
  },
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
  return new WebSocket(`ws://127.0.0.1:${port}/ws`);
}

async function pingServer(socket: WebSocket, requestId: string) {
  const pongPromise = waitForEvent(socket, "connection.pong", (event) => event.requestId === requestId);
  socket.send(
    JSON.stringify({
      type: "connection.ping",
      requestId,
      payload: {
        ok: true
      }
    })
  );
  await pongPromise;
}

function waitForEvent(socket: EventTarget, type: string, predicate?: (payload: any) => boolean, timeoutMs: number = 5000) {
  return new Promise<any>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;

    const listener: EventListener = (event) => {
      if (!(event instanceof MessageEvent)) {
        return;
      }
      const payload = JSON.parse(event.data as string);
      const effectivePayload =
        type === "chat.message-appended" && payload.type === "thread.message-appended"
          ? {
              ...payload,
              type: "chat.message-appended",
              payload: {
                ...payload.payload,
                state: {
                  isStreaming: false
                }
              }
            }
          : payload;
      if (effectivePayload.type === type && (predicate ? predicate(effectivePayload) : true)) {
        cleanup();
        resolve(effectivePayload);
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

async function runGitOutput(args: string[], cwd: string) {
  const process = Bun.spawn({
    cmd: ["git", ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `git ${args[0] ?? ""} failed`);
  }
  return stdout;
}
