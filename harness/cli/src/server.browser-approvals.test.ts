import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { parseServerEventFrame, type BrowserSession } from "../../shared/protocol";
import { FakePiAgentAdapter, startServerForTest, stopServerForTest } from "./test-support/server-test-harness";
import { useGitProjectFixture } from "./test-support/git-project-fixture";
import { WorkspaceRepository } from "./workspace-repository";

setDefaultTimeout(15000);

const fixture = useGitProjectFixture({
  fixtureName: "server-browser-approvals",
  packageName: "server-browser-approvals",
  readmeTitle: "# Server Browser Approvals\n"
});

let activeServer: Awaited<ReturnType<typeof startServerForTest>>["server"] | undefined;

afterEach(async () => {
  await stopServerForTest(activeServer);
  activeServer = undefined;
});

test("browser approval resolve rejects stale thread ownership before mutating approval state", async () => {
  const repository = createRepository();
  const rootPath = await fixture.createRepoClone("browser-approval-thread-owner");
  const project = repository.addProject(rootPath);
  const owningThreadId = project.activeThreadId;
  const runProject = repository.createAgentRun(project.id, "verify browser approval ownership", "openai/gpt-5.4", owningThreadId);
  const run = runProject.activeRun;
  if (!run) {
    throw new Error("Expected active run");
  }

  repository.setAgentRunBrowserSessions(project.id, run.id, [createPendingBrowserSession(run.id)]);
  const otherThread = repository.createThread(project.id);
  repository.activateThread(project.id, owningThreadId);

  const started = await startServerForTest({ port: 0, adapter: new FakePiAgentAdapter(), repository });
  activeServer = started.server;
  const socket = createSocket(started.port);
  try {
    await waitForEvent(socket, "connection.ready");

    const rejectedPromise = waitForEvent(
      socket,
      "command.rejected",
      (event) => event.requestId === "req-browser-wrong-thread"
    );
    socket.send(
      JSON.stringify({
        type: "browser.approval.resolve",
        requestId: "req-browser-wrong-thread",
        payload: {
          projectId: project.id,
          threadId: otherThread.activeThreadId,
          runId: run.id,
          sessionId: "browser-session-1",
          toolCallId: "tool-call-1",
          approved: true
        }
      })
    );

    const rejected = await rejectedPromise;
    expect(rejected.payload.detail).toContain("not available");
    expect(repository.getRun(project.id, run.id)?.browserSessions?.[0]?.pendingApproval?.status).toBe("pending");

    const updatedPromise = waitForEvent(
      socket,
      "run.updated",
      (event) => event.requestId === "req-browser-owning-thread" && event.payload.run.id === run.id
    );
    socket.send(
      JSON.stringify({
        type: "browser.approval.resolve",
        requestId: "req-browser-owning-thread",
        payload: {
          projectId: project.id,
          threadId: owningThreadId,
          runId: run.id,
          sessionId: "browser-session-1",
          toolCallId: "tool-call-1",
          approved: true
        }
      })
    );

    const updated = await updatedPromise;
    expect(updated.payload.run.browserSessions[0]?.pendingApproval).toBeUndefined();
    expect(updated.payload.run.browserSessions[0]?.activities[0]?.approval?.status).toBe("approved");
  } finally {
    socket.close();
  }
});

function createRepository() {
  const tempRoot = path.join(process.cwd(), ".tmp-test-data");
  mkdirSync(tempRoot, { recursive: true });
  return new WorkspaceRepository(path.join(tempRoot, `server-browser-${crypto.randomUUID()}.sqlite`), process.cwd(), {
    durability: "test-fast"
  });
}

function createPendingBrowserSession(runId: string): BrowserSession {
  const now = "2026-06-26T12:00:00.000Z";
  const approval = {
    toolCallId: "tool-call-1",
    toolName: "playwright-browser",
    kind: "navigate" as const,
    label: "Open preview",
    inputSummary: "https://example.test",
    status: "pending" as const,
    requestedAt: now
  };
  return {
    id: "browser-session-1",
    runId,
    owner: "main",
    status: "awaiting-approval",
    approvalMode: "per-tool",
    lastActivityLabel: "Open preview",
    startedAt: now,
    updatedAt: now,
    pendingApproval: approval,
    activities: [
      {
        id: "browser-activity-1",
        toolCallId: "tool-call-1",
        toolName: "playwright-browser",
        kind: "navigate",
        label: "Open preview",
        inputSummary: "https://example.test",
        status: "pending-approval",
        startedAt: now,
        updatedAt: now,
        approval,
        replay: [],
        verification: []
      }
    ]
  };
}

function createSocket(port: number) {
  return new WebSocket(`ws://127.0.0.1:${port}/ws`);
}

function waitForEvent(socket: EventTarget, type: string, predicate?: (payload: any) => boolean, timeoutMs = 1500) {
  return new Promise<any>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;

    const listener: EventListener = (event) => {
      if (!(event instanceof MessageEvent) || typeof event.data !== "string") {
        return;
      }
      for (const payload of parseMessageEventPayloads(event.data)) {
        if (payload.type === type && (predicate ? predicate(payload) : true)) {
          cleanup();
          resolve(payload);
          return;
        }
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

function parseMessageEventPayloads(data: string) {
  const raw = JSON.parse(data);
  try {
    return parseServerEventFrame(raw);
  } catch {
    return [raw];
  }
}
