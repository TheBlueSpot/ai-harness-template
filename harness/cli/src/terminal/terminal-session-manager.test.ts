import { mkdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { WorkspaceRepository } from "../workspace-repository";
import { TerminalSessionManager } from "./terminal-session-manager";
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
  const manager = new TerminalSessionManager({
    repository,
    onSessionsUpdated: () => events.push("sessions"),
    onShellsUpdated: () => events.push("shells"),
    onSessionCreated: () => events.push("created"),
    onSessionUpdated: () => events.push("updated"),
    onSessionExited: () => events.push("exited"),
    onAttachReady: () => events.push("attach"),
    onPreferencesSaved: () => events.push("prefs")
  });
  return { repository, project, manager, events, session };
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
});
