import { mkdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { WorkspaceRepository } from "../workspace-repository";
import { FakePiAgentAdapter, startServerForTest, stopServerForTest } from "../test-support/server-test-harness";
import type { ServerEventFrame, TerminalSession } from "../../../shared/protocol";
import { parseServerEventFrame } from "../../../shared/protocol";

describe("terminal websocket mock client", () => {
  test("lists active sessions separately from run-scoped terminal history", async () => {
    const tempRoot = path.join(process.cwd(), ".tmp-test-data");
    mkdirSync(tempRoot, { recursive: true });
    const projectRoot = path.join(tempRoot, `terminal-ws-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const repository = new WorkspaceRepository(":memory:", process.cwd(), { durability: "test-fast" });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const threadId = project.activeThreadId;
    const userSession = createSession({
      id: "terminal-user",
      projectId: project.id,
      name: "User Shell",
      startedAt: now,
      updatedAt: now
    });
    const agentSession = createSession({
      id: "terminal-agent",
      projectId: project.id,
      source: {
        kind: "agent",
        threadId,
        runId: "run-terminal",
        label: "Run run-terminal",
        trigger: "run"
      },
      name: "Agent Shell",
      inputMode: "read-only",
      inputOverride: false,
      startedAt: now,
      updatedAt: now,
      closedAt: now,
      exitedAt: now,
      status: "exited"
    });
    repository.setTerminalState({
      sessions: [userSession, agentSession],
      scrollbackBySessionId: {},
      preferences: {
        scrollbackLimit: 10000,
        copyOnSelect: false,
        ctrlCMode: "auto",
        rendererMode: "xterm-webgl"
      }
    });

    const { server, port } = await startServerForTest({ port: 0, repository, adapter: new FakePiAgentAdapter() });
    const client = new MockTerminalClient(port);
    try {
      await client.waitFor("connection.ready");

      client.send({
        type: "terminal.sessions.list",
        requestId: "req-terminal-list",
        payload: {
          projectId: project.id
        }
      });
      const active = await client.waitFor("terminal.sessions.updated", (event) => event.requestId === "req-terminal-list");
      expect(active.payload.sessions.map((session: TerminalSession) => session.id)).toEqual(["terminal-user"]);

      client.send({
        type: "terminal.history.list",
        requestId: "req-terminal-history",
        payload: {
          projectId: project.id,
          threadId,
          runId: "run-terminal"
        }
      });
      const history = await client.waitFor("terminal.history.listed");
      expect(history.payload.sessions).toHaveLength(1);
      expect(history.payload.sessions[0]).toMatchObject({
        id: "terminal-agent",
        closedAt: now,
        source: {
          kind: "agent",
          threadId,
          runId: "run-terminal"
        }
      });
    } finally {
      client.close();
      await stopServerForTest(server);
    }
  });
});

class MockTerminalClient {
  private readonly socket: WebSocket;
  private readonly events: ServerEventFrame[] = [];

  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.socket.addEventListener("message", (event) => {
      this.events.push(...parsePayloads(event));
    });
    this.socket.addEventListener("error", () => undefined);
  }

  send(command: unknown) {
    this.socket.send(JSON.stringify(command));
  }

  waitFor(type: string, predicate?: (event: any) => boolean) {
    const existing = this.events.find((event) => event.type === type && (!predicate || predicate(event)));
    if (existing) {
      return Promise.resolve(existing);
    }
    return new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for ${type}`));
      }, 1500);
      const onMessage = (event: MessageEvent) => {
        for (const payload of parsePayloads(event)) {
          if (payload.type === type && (!predicate || predicate(payload))) {
            cleanup();
            resolve(payload);
            return;
          }
        }
      };
      const onError = () => {
        cleanup();
        reject(new Error("mock client socket error"));
      };
      const cleanup = () => {
        clearTimeout(timeout);
        this.socket.removeEventListener("message", onMessage);
        this.socket.removeEventListener("error", onError);
      };
      this.socket.addEventListener("message", onMessage);
      this.socket.addEventListener("error", onError);
    });
  }

  close() {
    this.socket.close();
  }
}

function parsePayloads(event: MessageEvent): ServerEventFrame[] {
  if (typeof event.data !== "string") {
    return [];
  }
  return parseServerEventFrame(JSON.parse(event.data));
}

function createSession(overrides: Partial<TerminalSession>): TerminalSession {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? "terminal-1",
    projectId: overrides.projectId ?? "project-1",
    source: overrides.source,
    name: overrides.name ?? "Shell",
    shellId: overrides.shellId ?? "powershell",
    cwd: overrides.cwd ?? "C:\\repo",
    status: overrides.status ?? "running",
    inputMode: overrides.inputMode,
    inputOverride: overrides.inputOverride,
    inputLockReason: overrides.inputLockReason,
    cols: overrides.cols ?? 120,
    rows: overrides.rows ?? 32,
    transportMode: overrides.transportMode,
    transportWarning: overrides.transportWarning,
    pid: overrides.pid,
    exitCode: overrides.exitCode,
    startedAt: overrides.startedAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    exitedAt: overrides.exitedAt,
    closedAt: overrides.closedAt,
    serverRestarted: overrides.serverRestarted
  };
}
