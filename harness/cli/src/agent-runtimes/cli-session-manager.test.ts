import { describe, expect, test } from "bun:test";
import type { AgentRuntime } from "./agent-runtime";
import { CliSessionManager } from "./cli-session-manager";
import { WorkspaceRepository } from "../workspace-repository";
import { WorkspaceRuntimeStore } from "../workspace-runtime-store";
import { PiSdkAgentAdapter } from "../pi-agent-adapter";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { buildCliCapability } from "./cli-health";

function createRuntimeStore() {
  const tempRoot = path.join(process.cwd(), ".tmp-test-data");
  mkdirSync(tempRoot, { recursive: true });
  const projectRoot = path.join(tempRoot, `cli-session-${crypto.randomUUID()}`);
  mkdirSync(projectRoot, { recursive: true });
  const repository = new WorkspaceRepository(path.join(tempRoot, `cli-session-${crypto.randomUUID()}.sqlite`), process.cwd());
  const project = repository.addProject(projectRoot);
  return {
    repository,
    runtimeStore: new WorkspaceRuntimeStore(repository.loadWorkspace()),
    project
  };
}

const runtime = {
  id: "codex-cli",
  label: "Codex CLI",
  getAdapter() {
    return new PiSdkAgentAdapter();
  },
  getCapability() {
    return buildCliCapability({
      agentId: "codex-cli",
      label: "Codex CLI",
      installed: true,
      authenticated: true,
      supportsInteractive: true,
      interactivePipeCompatible: true,
      supportsPlanning: true,
      supportsReview: true
    });
  },
  async refreshCapability() {
    return buildCliCapability({
      agentId: "codex-cli",
      label: "Codex CLI",
      installed: true,
      authenticated: true,
      supportsInteractive: true,
      interactivePipeCompatible: true,
      supportsPlanning: true,
      supportsReview: true,
      healthMessage: "ok"
    });
  },
  getDefaultPlanningModelId() {
    return "openai/gpt-5.4";
  },
  getDefaultExecutionModelId() {
    return "openai/gpt-5.4";
  },
  getDefaultSubagentModelId() {
    return "openai/gpt-5.4-mini";
  },
  buildInteractiveLaunch() {
    return {
      cmd: [process.execPath, "-e", "setTimeout(() => {}, 30000)"]
    };
  }
} satisfies AgentRuntime;

describe("CLI session manager", () => {
  test("enforces thread ownership and stores captured context", async () => {
    const { runtimeStore, project } = createRuntimeStore();
    const manager = new CliSessionManager({
      runtimeStore,
      onSessionStarted() {},
      onSessionUpdated() {},
      onSessionExited() {},
      onAttachReady() {}
    });

    const session = await manager.startSession({
      requestId: "req-start",
      projectId: project.id,
      threadId: project.activeThreadId,
      agentRuntime: runtime,
      cwd: project.rootPath,
      cols: 80,
      rows: 24,
      clientId: "client-1"
    });

    expect(() =>
      manager.captureVisibleBuffer({
        projectId: project.id,
        threadId: "thread-wrong",
        sessionId: session.id,
        visibleBuffer: "stdout"
      })
    ).toThrow();

    manager.captureVisibleBuffer({
      projectId: project.id,
      threadId: project.activeThreadId,
      sessionId: session.id,
      visibleBuffer: "stdout",
      stderrTail: "stderr"
    });

    expect(runtimeStore.consumeThreadCapturedCliContext(project.id, project.activeThreadId)).toMatchObject({
      sessionId: session.id,
      visibleBuffer: "stdout",
      stderrTail: "stderr"
    });

    expect(() =>
      manager.resizeSession({
        requestId: "req-resize",
        projectId: project.id,
        threadId: project.activeThreadId,
        sessionId: session.id,
        cols: 120,
        rows: 40
      })
    ).toThrow("CLI session resize is not supported by the current transport");

    await manager.stopSession({
      projectId: project.id,
      threadId: project.activeThreadId,
      sessionId: session.id
    });
  });

  test("invalidates unused attach tokens when control client closes", async () => {
    const { runtimeStore, project } = createRuntimeStore();
    let issuedToken = "";
    const manager = new CliSessionManager({
      runtimeStore,
      onSessionStarted() {},
      onSessionUpdated() {},
      onSessionExited() {},
      onAttachReady(input) {
        issuedToken = input.attachToken.token;
      }
    });

    const session = await manager.startSession({
      requestId: "req-start",
      projectId: project.id,
      threadId: project.activeThreadId,
      agentRuntime: runtime,
      cwd: project.rootPath,
      cols: 80,
      rows: 24,
      clientId: "client-1"
    });

    expect(issuedToken).not.toBe("");
    manager.invalidateClientAttachTokens("client-1");
    expect(manager.consumeAttachToken(issuedToken, "client-1")).toBeUndefined();

    await manager.stopSession({
      projectId: project.id,
      threadId: project.activeThreadId,
      sessionId: session.id
    });
  });
});
