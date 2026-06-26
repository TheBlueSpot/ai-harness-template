import { existsSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import type { PiAgentPromptRequest } from "../pi-agent-adapter";
import { CodexSdkAdapter, testExports } from "./codex-sdk-adapter";

type FakeThreadRun = {
  events: unknown[];
  onSignal?: (signal: AbortSignal) => Promise<unknown> | unknown;
  error?: Error;
};

class FakeThread {
  readonly runCalls: Array<{ input: unknown; signal?: AbortSignal }> = [];

  constructor(private readonly runs: FakeThreadRun[]) {}

  async runStreamed(input: unknown, options: { signal?: AbortSignal } = {}) {
    this.runCalls.push({
      input,
      signal: options.signal
    });
    const nextRun = this.runs.shift();
    if (!nextRun) {
      throw new Error("No fake run configured");
    }
    if (nextRun.error) {
      throw nextRun.error;
    }

    if (nextRun.onSignal && options.signal) {
      return {
        events: (async function* () {
          await nextRun.onSignal?.(options.signal!);
        })()
      };
    }

    return {
      events: (async function* () {
        for (const event of nextRun.events) {
          yield event;
        }
      })()
    };
  }
}

class FakeCodexClient {
  readonly startThreadCalls: Array<Record<string, unknown>> = [];

  constructor(private readonly thread: FakeThread) {}

  startThread(options: Record<string, unknown> = {}) {
    this.startThreadCalls.push(options);
    return this.thread;
  }
}

function createRequest(overrides: Partial<PiAgentPromptRequest> = {}): PiAgentPromptRequest {
  return {
    kind: "executor",
    prompt: "Inspect repo",
    cwd: "C:\\repo",
    modelId: "openai/gpt-5.4",
    readOnly: false,
    ...overrides
  };
}

describe("codex sdk adapter", () => {
  test("maps request options into sdk thread options", async () => {
    const thread = new FakeThread([
      {
        events: [
          { type: "thread.started", thread_id: "thread-1" },
          { type: "turn.started" },
          { type: "item.completed", item: { id: "item-1", type: "agent_message", text: "done" } },
          { type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }
        ]
      }
    ]);
    const client = new FakeCodexClient(thread);
    const adapter = new CodexSdkAdapter({
      executablePath: "C:\\codex\\codex.exe",
      createClient() {
        return client;
      }
    });

    const result = await adapter.runPrompt(
      createRequest({
        readOnly: true,
        modelId: "openai/gpt-5.4-mini"
      })
    );

    expect(result.text).toBe("done");
    expect(client.startThreadCalls[0]).toMatchObject({
      model: "gpt-5.4-mini",
      sandboxMode: "read-only",
      workingDirectory: "C:\\repo",
      skipGitRepoCheck: true,
      approvalPolicy: "never",
      networkAccessEnabled: false,
      webSearchMode: "live"
    });
    expect(String(thread.runCalls[0]?.input)).toContain(testExports.CODEX_TOOL_GUIDANCE);
    expect(String(thread.runCalls[0]?.input)).toContain("Git repository state:");
    expect(String(thread.runCalls[0]?.input)).toContain("Inspect repo");
  });

  test("uses danger-full-access for writable Windows runs", () => {
    expect(testExports.buildThreadOptions(createRequest(), { platform: "win32" })).toMatchObject({
      sandboxMode: "danger-full-access"
    });
    expect(
      testExports.buildThreadOptions(
        createRequest({
          readOnly: true
        }),
        { platform: "win32" }
      )
    ).toMatchObject({
      sandboxMode: "read-only"
    });
  });

  test("maps reasoning, web search, and network into sdk thread options", async () => {
    const thread = new FakeThread([
      {
        events: [
          { type: "item.completed", item: { id: "msg-1", type: "agent_message", text: "done" } },
          { type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }
        ]
      }
    ]);
    const client = new FakeCodexClient(thread);
    const adapter = new CodexSdkAdapter({
      executablePath: "C:\\codex\\codex.exe",
      createClient() {
        return client;
      }
    });

    await adapter.runPrompt(
      createRequest({
        reasoningStrength: "extra-high",
        fastMode: true
      })
    );

    expect(client.startThreadCalls[0]).toMatchObject({
      modelReasoningEffort: "xhigh",
      networkAccessEnabled: true,
      webSearchMode: "live"
    });
    expect(String(thread.runCalls[0]?.input)).toContain("/fast");
  });

  test("builds codex command prelude for fast mode", () => {
    expect(testExports.buildCodexCommandPrelude(createRequest({ fastMode: true }))).toContain("/fast");
    expect(testExports.buildCodexCommandPrelude(createRequest({ reasoningStrength: "extra-high" }))).toContain("Git repository state:");
  });

  test("streams appended agent-message deltas and tool events", async () => {
    const thread = new FakeThread([
      {
        events: [
          { type: "thread.started", thread_id: "thread-1" },
          { type: "turn.started" },
          { type: "item.started", item: { id: "msg-1", type: "agent_message", text: "Hel" } },
          {
            type: "item.started",
            item: { id: "cmd-1", type: "command_execution", command: "dir", aggregated_output: "", status: "in_progress" }
          },
          {
            type: "item.updated",
            item: {
              id: "cmd-1",
              type: "command_execution",
              command: "dir",
              aggregated_output: "one",
              status: "in_progress"
            }
          },
          { type: "item.updated", item: { id: "msg-1", type: "agent_message", text: "Hello" } },
          {
            type: "item.completed",
            item: {
              id: "cmd-1",
              type: "command_execution",
              command: "dir",
              aggregated_output: "one",
              exit_code: 0,
              status: "completed"
            }
          },
          { type: "item.completed", item: { id: "msg-1", type: "agent_message", text: "Hello world" } },
          { type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }
        ]
      }
    ]);
    const client = new FakeCodexClient(thread);
    const deltas: string[] = [];
    const events: string[] = [];
    const adapter = new CodexSdkAdapter({
      executablePath: "C:\\codex\\codex.exe",
      createClient() {
        return client;
      }
    });

    const result = await adapter.runPrompt(
      createRequest({
        onTextDelta(delta) {
          deltas.push(delta);
        },
        onExecutionEvent(event) {
          events.push(event.type);
        }
      })
    );

    expect(result.text).toBe("Hello world");
    expect(deltas).toEqual(["Hel", "lo", " world"]);
    expect(events).toContain("session-created");
    expect(events).toContain("tool-start");
    expect(events).toContain("tool-update");
    expect(events).toContain("tool-end");
  });

  test("reuses the same thread for continuation", async () => {
    const thread = new FakeThread([
      {
        events: [
          { type: "item.completed", item: { id: "msg-1", type: "agent_message", text: "first" } },
          { type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }
        ]
      },
      {
        events: [
          { type: "item.completed", item: { id: "msg-2", type: "agent_message", text: "second" } },
          { type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }
        ]
      }
    ]);
    const client = new FakeCodexClient(thread);
    const adapter = new CodexSdkAdapter({
      executablePath: "C:\\codex\\codex.exe",
      createClient() {
        return client;
      }
    });

    const controller = await adapter.startExecution(createRequest());
    try {
      expect((await controller.result).text).toBe("first");
      expect((await controller.continueWithPrompt("continue working")).text).toBe("second");
      expect(thread.runCalls).toHaveLength(2);
      expect(client.startThreadCalls).toHaveLength(1);
    } finally {
      controller.dispose();
    }
  });

  test("aborts an in-flight streamed turn", async () => {
    const thread = new FakeThread([
      {
        events: [],
        onSignal(signal) {
          return new Promise((_, reject) => {
            if (signal.aborted) {
              reject(new Error("aborted by test"));
              return;
            }
            signal.addEventListener("abort", () => reject(new Error("aborted by test")), { once: true });
          });
        }
      }
    ]);
    const client = new FakeCodexClient(thread);
    const adapter = new CodexSdkAdapter({
      executablePath: "C:\\codex\\codex.exe",
      createClient() {
        return client;
      }
    });

    const controller = await adapter.startExecution(createRequest());
    const pending = controller.result;
    await controller.abort();
    await expect(pending).rejects.toThrow("aborted by test");
    controller.dispose();
  });

  test("does not abort completed turn during automatic disposal", async () => {
    const thread = new FakeThread([
      {
        events: [{ type: "item.completed", item: { id: "msg-1", type: "agent_message", text: "done" } }]
      }
    ]);
    const client = new FakeCodexClient(thread);
    const adapter = new CodexSdkAdapter({
      executablePath: "C:\\codex\\codex.exe",
      createClient() {
        return client;
      }
    });

    await expect(adapter.runPrompt(createRequest())).resolves.toMatchObject({
      text: "done"
    });
    expect(thread.runCalls[0]?.signal?.aborted).toBe(false);
  });

  test("fails on turn failure events", async () => {
    const thread = new FakeThread([
      {
        events: [{ type: "turn.failed", error: { message: "bad turn" } }]
      }
    ]);
    const client = new FakeCodexClient(thread);
    const adapter = new CodexSdkAdapter({
      executablePath: "C:\\codex\\codex.exe",
      createClient() {
        return client;
      }
    });

    await expect(adapter.runPrompt(createRequest())).rejects.toThrow("bad turn");
  });

  test("materializes images into temporary local-image inputs and cleans them up", async () => {
    const imageInput = await testExports.materializeSdkInput(
      createRequest({
        images: [
          {
            type: "image",
            data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9s3FoXcAAAAASUVORK5CYII=",
            mimeType: "image/png"
          }
        ]
      })
    );

    expect(Array.isArray(imageInput.input)).toBe(true);
    const inputEntries = imageInput.input as Array<{ type: string; path?: string; text?: string }>;
    expect(inputEntries[0]).toEqual({
      type: "text",
      text: "Inspect repo"
    });
    expect(inputEntries[1]?.type).toBe("local_image");
    expect(existsSync(inputEntries[1]?.path ?? "")).toBe(true);

    const imagePath = inputEntries[1]?.path ?? "";
    await imageInput.cleanup();
    expect(existsSync(imagePath)).toBe(false);
  });
});
