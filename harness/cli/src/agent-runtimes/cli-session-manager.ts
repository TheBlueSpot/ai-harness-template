import { createRequestId, createSessionId, type CliAttachToken, type CliSession, type ProjectId, type ThreadId } from "../../../shared/protocol";
import type { WorkspaceRuntimeStore } from "../workspace-runtime-store";
import type { AgentRuntime } from "./agent-runtime";
import { createSecureToken } from "./cli-health";
import { CliProcessManager, type InteractiveCliProcess } from "./cli-process-manager";

const STREAM_STDOUT = 0x01;
const STREAM_STDERR = 0x02;
const ATTACH_TOKEN_TTL_MS = 30_000;
const DEFAULT_INTERACTIVE_IDLE_TIMEOUT_MS = 30 * 60_000;

type SessionRecord = {
  runtime: AgentRuntime;
  process: InteractiveCliProcess;
  session: CliSession;
  attachedClientId?: string;
  attachedSocket?: Bun.ServerWebSocket<{ clientId: string; kind: "control" | "pty"; sessionId?: string }>;
  stderrTail: string;
  visibleBuffer?: string;
};

type AttachTokenRecord = CliAttachToken & {
  projectId: ProjectId;
  threadId: ThreadId;
};

type CliSessionManagerOptions = {
  runtimeStore: WorkspaceRuntimeStore;
  onSessionStarted: (input: { requestId: string; projectId: ProjectId; threadId: ThreadId; session: CliSession }) => void;
  onSessionUpdated: (input: { requestId: string; projectId: ProjectId; threadId: ThreadId; session: CliSession }) => void;
  onSessionExited: (input: { requestId: string; projectId: ProjectId; threadId: ThreadId; session: CliSession }) => void;
  onAttachReady: (input: {
    requestId: string;
    projectId: ProjectId;
    threadId: ThreadId;
    sessionId: string;
    attachToken: CliAttachToken;
  }) => void;
};

export class CliSessionManager {
  private readonly processManager = new CliProcessManager();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly attachTokens = new Map<string, AttachTokenRecord>();
  private readonly sessionKeyToId = new Map<string, string>();

  constructor(private readonly options: CliSessionManagerOptions) {}

  async startSession(input: {
    requestId: string;
    projectId: ProjectId;
    threadId: ThreadId;
    agentRuntime: AgentRuntime;
    cwd: string;
    cols: number;
    rows: number;
    prompt?: string;
    runId?: string;
    clientId: string;
  }) {
    const existingSessionId = this.sessionKeyToId.get(getSessionKey(input.projectId, input.threadId, input.agentRuntime.id));
    if (existingSessionId) {
      await this.stopSession({
        projectId: input.projectId,
        threadId: input.threadId,
        sessionId: existingSessionId
      });
    }

    const launch = input.agentRuntime.buildInteractiveLaunch?.({
      cwd: input.cwd,
      cols: input.cols,
      rows: input.rows,
      prompt: input.prompt
    });
    if (!launch) {
      throw new Error(`${input.agentRuntime.label} does not support interactive sessions`);
    }

    const sessionId = createSessionId();
    const now = new Date().toISOString();
    const session: CliSession = {
      id: sessionId,
      projectId: input.projectId,
      threadId: input.threadId,
      runId: input.runId,
      agentId: input.agentRuntime.id,
      cwd: input.cwd,
      status: "starting",
      cols: input.cols,
      rows: input.rows,
      attachState: "detached",
      idleTimeoutMs: DEFAULT_INTERACTIVE_IDLE_TIMEOUT_MS,
      startedAt: now,
      updatedAt: now
    };

    const process = this.processManager.startInteractive({
      cmd: launch.cmd,
      cwd: input.cwd,
      cols: input.cols,
      rows: input.rows,
      env: launch.env,
      onStdout: (chunk) => this.handleChunk(sessionId, "stdout", chunk),
      onStderr: (chunk) => this.handleChunk(sessionId, "stderr", chunk),
      onExit: (exitCode) => {
        void this.handleExit(sessionId, exitCode);
      }
    });

    const record: SessionRecord = {
      runtime: input.agentRuntime,
      process,
      session: {
        ...session,
        status: "running"
      },
      stderrTail: ""
    };

    this.sessions.set(sessionId, record);
    this.sessionKeyToId.set(getSessionKey(input.projectId, input.threadId, input.agentRuntime.id), sessionId);
    this.options.runtimeStore.setProjectCliSession(input.projectId, record.session);
    this.options.onSessionStarted({
      requestId: input.requestId,
      projectId: input.projectId,
      threadId: input.threadId,
      session: record.session
    });

    const attachToken = this.issueAttachToken({
      sessionId,
      projectId: input.projectId,
      threadId: input.threadId,
      clientId: input.clientId
    });
    this.options.onAttachReady({
      requestId: input.requestId,
      projectId: input.projectId,
      threadId: input.threadId,
      sessionId,
      attachToken
    });

    return record.session;
  }

  async stopSession(input: { projectId: ProjectId; threadId: ThreadId; sessionId: string }) {
    const record = this.sessions.get(input.sessionId);
    if (!record) {
      return;
    }

    record.session = {
      ...record.session,
      status: "stopped",
      updatedAt: new Date().toISOString()
    };
    this.options.runtimeStore.setProjectCliSession(input.projectId, record.session);
    this.options.onSessionUpdated({
      requestId: createRequestId(),
      projectId: input.projectId,
      threadId: input.threadId,
      session: record.session
    });
    await record.process.stop();
  }

  resizeSession(input: { requestId: string; projectId: ProjectId; threadId: ThreadId; sessionId: string; cols: number; rows: number }) {
    const record = this.requireSession(input.sessionId);
    record.session = {
      ...record.session,
      cols: input.cols,
      rows: input.rows,
      updatedAt: new Date().toISOString()
    };
    this.options.runtimeStore.setProjectCliSession(input.projectId, record.session);
    this.options.onSessionUpdated({
      requestId: input.requestId,
      projectId: input.projectId,
      threadId: input.threadId,
      session: record.session
    });
  }

  attachSession(input: { requestId: string; projectId: ProjectId; threadId: ThreadId; sessionId: string; clientId: string }) {
    this.requireSession(input.sessionId);
    const attachToken = this.issueAttachToken({
      sessionId: input.sessionId,
      projectId: input.projectId,
      threadId: input.threadId,
      clientId: input.clientId
    });
    this.options.onAttachReady({
      requestId: input.requestId,
      projectId: input.projectId,
      threadId: input.threadId,
      sessionId: input.sessionId,
      attachToken
    });
  }

  captureVisibleBuffer(input: { sessionId: string; visibleBuffer: string; stderrTail?: string }) {
    const record = this.requireSession(input.sessionId);
    record.visibleBuffer = input.visibleBuffer;
    if (input.stderrTail) {
      record.stderrTail = input.stderrTail.slice(-32_000);
    }
  }

  consumeAttachToken(token: string, clientId: string) {
    const record = this.attachTokens.get(token);
    if (!record) {
      return undefined;
    }

    if (record.usedAt || Date.parse(record.expiresAt) < Date.now() || record.clientId !== clientId) {
      this.attachTokens.delete(token);
      return undefined;
    }

    record.usedAt = new Date().toISOString();
    this.attachTokens.delete(token);
    return record;
  }

  attachSocket(input: {
    sessionId: string;
    clientId: string;
    socket: Bun.ServerWebSocket<{ clientId: string; kind: "control" | "pty"; sessionId?: string }>;
  }) {
    const record = this.requireSession(input.sessionId);
    record.attachedClientId = input.clientId;
    record.attachedSocket = input.socket;
    record.session = {
      ...record.session,
      attachState: "attached",
      updatedAt: new Date().toISOString()
    };
    this.options.runtimeStore.setProjectCliSession(record.session.projectId, record.session);
    this.options.onSessionUpdated({
      requestId: createRequestId(),
      projectId: record.session.projectId,
      threadId: record.session.threadId,
      session: record.session
    });
  }

  detachSocket(sessionId: string) {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return;
    }

    record.attachedSocket = undefined;
    record.attachedClientId = undefined;
    record.session = {
      ...record.session,
      attachState: "detached",
      updatedAt: new Date().toISOString()
    };
    this.options.runtimeStore.setProjectCliSession(record.session.projectId, record.session);
    this.options.onSessionUpdated({
      requestId: createRequestId(),
      projectId: record.session.projectId,
      threadId: record.session.threadId,
      session: record.session
    });
  }

  async writeToSession(sessionId: string, data: Uint8Array) {
    const record = this.requireSession(sessionId);
    await record.process.write(data);
  }

  getSession(sessionId: string) {
    return this.sessions.get(sessionId)?.session;
  }

  private issueAttachToken(input: { sessionId: string; projectId: ProjectId; threadId: ThreadId; clientId: string }) {
    const token: AttachTokenRecord = {
      token: createSecureToken(),
      sessionId: input.sessionId,
      projectId: input.projectId,
      threadId: input.threadId,
      clientId: input.clientId,
      expiresAt: new Date(Date.now() + ATTACH_TOKEN_TTL_MS).toISOString()
    };
    this.attachTokens.set(token.token, token);
    return token;
  }

  private handleChunk(sessionId: string, stream: "stdout" | "stderr", chunk: Uint8Array) {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return;
    }

    const now = new Date().toISOString();
    record.session = {
      ...record.session,
      updatedAt: now,
      lastStdoutAt: stream === "stdout" ? now : record.session.lastStdoutAt,
      lastStderrAt: stream === "stderr" ? now : record.session.lastStderrAt
    };
    if (stream === "stderr") {
      record.stderrTail = `${record.stderrTail}${new TextDecoder().decode(chunk)}`.slice(-32_000);
    }
    this.options.runtimeStore.setProjectCliSession(record.session.projectId, record.session);
    this.options.onSessionUpdated({
      requestId: createRequestId(),
      projectId: record.session.projectId,
      threadId: record.session.threadId,
      session: record.session
    });

    const socket = record.attachedSocket;
    if (!socket) {
      return;
    }

    const payload = normalizeTerminalChunk(chunk);
    const frame = new Uint8Array(payload.length + 1);
    frame[0] = stream === "stdout" ? STREAM_STDOUT : STREAM_STDERR;
    frame.set(payload, 1);
    socket.send(frame);
  }

  private async handleExit(sessionId: string, exitCode: number) {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return;
    }

    const now = new Date().toISOString();
    record.session = {
      ...record.session,
      status: exitCode === 0 ? "exited" : "failed",
      attachState: "detached",
      exitCode,
      exitedAt: now,
      updatedAt: now
    };
    this.options.runtimeStore.setProjectCliSession(record.session.projectId, record.session);
    this.options.onSessionExited({
      requestId: createRequestId(),
      projectId: record.session.projectId,
      threadId: record.session.threadId,
      session: record.session
    });
    this.sessionKeyToId.delete(getSessionKey(record.session.projectId, record.session.threadId, record.session.agentId));
    this.sessions.delete(sessionId);
  }

  private requireSession(sessionId: string) {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new Error(`Unknown CLI session: ${sessionId}`);
    }

    return record;
  }
}

function getSessionKey(projectId: ProjectId, threadId: ThreadId, agentId: string) {
  return [projectId, threadId, agentId].join(":");
}

function normalizeTerminalChunk(chunk: Uint8Array) {
  const normalized = new TextDecoder().decode(chunk).replace(/(?<!\r)\n/g, "\r\n");
  return new TextEncoder().encode(normalized);
}
