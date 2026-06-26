import { mkdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { WorkspaceRepository } from "../workspace-repository";
import { TerminalSessionManager, testExports } from "./terminal-session-manager";
import type { TerminalSession } from "../../../shared/protocol";

function createManagerFixture() {
  const tempRoot = path.join(process.cwd(), ".tmp-test-data");
  mkdirSync(tempRoot, { recursive: true });
  const repository = new WorkspaceRepository(path.join(tempRoot, `terminal-${crypto.randomUUID()}.sqlite`), process.cwd());
  const projectRoot = path.join(tempRoot, `terminal-project-${crypto.randomUUID()}`);
  mkdirSync(projectRoot, { recursive: true });
  const project = repository.addProject(projectRoot);
  const now = new Date().toISOString();
  const session: TerminalSession = {
    id: "terminal-1",
    projectId: project.id,
    name: "bash",
    shellId: "bash",
    cwd: project.rootPath,
    status: "running",
    cols: 80,
    rows: 24,
    startedAt: now,
    updatedAt: now
  };
  repository.setTerminalState({
    sessions: [session],
    scrollbackBySessionId: {
      [session.id]: "hello\nworld"
    },
    preferences: {
      scrollbackLimit: 10000,
      copyOnSelect: false,
      ctrlCMode: "auto",
      rendererMode: "xterm-webgl"
    }
  });
  const events: string[] = [];
  const updatedSessions: TerminalSession[] = [];
  const manager = new TerminalSessionManager({
    repository,
    onSessionsUpdated: () => events.push("sessions"),
    onShellsUpdated: () => events.push("shells"),
    onSessionCreated: () => events.push("created"),
    onSessionUpdated: ({ session }) => {
      events.push("updated");
      updatedSessions.push(session);
    },
    onSessionExited: () => events.push("exited"),
    onAttachReady: () => events.push("attach"),
    onPreferencesSaved: () => events.push("prefs")
  });
  return { repository, project, manager, events, session, updatedSessions };
}

describe("TerminalSessionManager", () => {
  test("restores persisted running sessions as stopped after server start", () => {
    const { repository, session } = createManagerFixture();
    const restored = repository.getTerminalState().sessions.find((entry) => entry.id === session.id);
    expect(restored).toMatchObject({
      id: session.id,
      status: "stopped",
      serverRestarted: true
    });
  });

  test("enforces project ownership and persists preference layout", () => {
    const { repository, project, manager, events, session } = createManagerFixture();

    expect(() =>
      manager.renameSession({
        requestId: "req-rename",
        projectId: "project-wrong",
        sessionId: session.id,
        name: "wrong"
      })
    ).toThrow();

    manager.renameSession({
      requestId: "req-rename",
      projectId: project.id,
      sessionId: session.id,
      name: "server"
    });
    manager.savePreferences({
      requestId: "req-prefs",
      preferences: {
        scrollbackLimit: 12000,
        copyOnSelect: true,
        ctrlCMode: "copy",
        rendererMode: "xterm-dom"
      },
      layout: {
        type: "leaf",
        id: "leaf-1",
        sessionId: session.id
      }
    });

    const persisted = repository.getTerminalState();
    expect(persisted.sessions.find((entry) => entry.id === session.id)?.name).toBe("server");
    expect(persisted.preferences.copyOnSelect).toBe(true);
    expect(persisted.layout).toMatchObject({ type: "leaf", sessionId: session.id });
    expect(events).toContain("updated");
    expect(events).toContain("prefs");
  });

  test("coalesces hot output persistence", async () => {
    const { repository, manager, session } = createManagerFixture();
    const originalSetTerminalState = repository.setTerminalState.bind(repository);
    let persistCount = 0;
    repository.setTerminalState = ((state) => {
      persistCount += 1;
      originalSetTerminalState(state);
    }) as typeof repository.setTerminalState;
    const handleChunk = (manager as unknown as { handleChunk: (sessionId: string, chunk: Uint8Array) => void }).handleChunk.bind(manager);

    handleChunk(session.id, new TextEncoder().encode("a"));
    handleChunk(session.id, new TextEncoder().encode("b"));
    handleChunk(session.id, new TextEncoder().encode("c"));

    expect(persistCount).toBe(0);
    await delay(650);
    expect(persistCount).toBe(1);
    expect(repository.getTerminalState().scrollbackBySessionId[session.id]?.endsWith("abc")).toBe(true);
  });

  test("marks pre-start spawn failures as failed sessions", async () => {
    const { project, repository, manager, updatedSessions } = createManagerFixture();
    (manager as unknown as { shells: unknown[] }).shells = [
      {
        id: "missing-shell",
        label: "Missing shell",
        executableLabel: path.join(project.rootPath, "missing-shell.exe"),
        kind: "custom",
        available: true,
        default: true
      }
    ];

    await expect(
      manager.createSession({
        requestId: "req-create-failed",
        projectId: project.id,
        projectRoot: project.rootPath,
        clientId: "client-1",
        cols: 80,
        rows: 24
      })
    ).rejects.toThrow();

    const failed = updatedSessions.at(-1);
    expect(failed).toMatchObject({ status: "failed", exitCode: -1 });
    expect(repository.getTerminalState().sessions.find((entry) => entry.id === failed?.id)?.status).toBe("failed");
  });

  test("treats releaseLock aborts as normal terminal pipe shutdown", async () => {
    const error = new Error("Stream reader cancelled via releaseLock()");
    error.name = "AbortError";
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(error);
      }
    });
    let chunks = 0;

    await expect(testExports.consumePipe(stream, () => chunks += 1)).resolves.toBeUndefined();

    expect(chunks).toBe(0);
    expect(testExports.isStreamReaderCancelledError(error)).toBe(true);
  });
});

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
