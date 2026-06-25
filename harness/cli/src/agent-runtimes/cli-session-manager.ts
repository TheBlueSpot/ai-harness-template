import { createRequestId, createSessionId, type CliAttachToken, type CliSession, type ProjectId, type ThreadId } from "../../../shared/protocol";
import type { WorkspaceRuntimeStore } from "../workspace-runtime-store";
import type { AgentRuntime } from "./agent-runtime";
import { createSecureToken } from "./cli-health";
import { CliProcessManager, type InteractiveCliProcess } from "./cli-process-manager";
import { StreamPump } from "../stream-pump";
import { guardedWebsocketSend } from "../websocket-send-guard";

export const STREAM_HEARTBEAT = 0x00;
const STREAM_STDOUT = 0x01;
const STREAM_STDERR = 0x02;
const ATTACH_TOKEN_TTL_MS = 30_000;
const DEFAULT_INTERACTIVE_IDLE_TIMEOUT_MS = 30 * 60_000;
const PTY_HEARTBEAT_INTERVAL_MS = 15_000;
const PTY_STALE_TIMEOUT_MS = 30_000;
const PTY_STREAM_FLUSH_MS = 50;
const PTY_STREAM_MAX_BUFFERED_BYTES = 8 * 1024;
const PTY_SEND_QUEUE_CAP_BYTES = 256 * 1024;
const CLI_SESSION_METADATA_THROTTLE_MS = 500;

type SessionRecord = {
  runtime: AgentRuntime;
  process: InteractiveCliProcess;
  session: CliSession;
  attachedClientId?: string;
  attachedSocket?: Bun.ServerWebSocket<{ clientId: string; kind: "control" | "pty" | "terminal"; sessionId?: string }>;
  ptyHeartbeatTimer?: ReturnType<typeof setInterval>;
  lastPtyPongAt?: number;
  metadataUpdateTimer?: ReturnType<typeof setTimeout>;
  metadataUpdatePending?: boolean;
  terminalPumps?: Partial<Record<"stdout" | "stderr", StreamPump>>;
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
  onWriteFailed?: (input: { requestId: string; projectId: ProjectId; threadId: ThreadId; session: CliSession; error: unknown }) => void;
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
    const record = this.getOwnedSession(input);
    if (!record) {
      return;
    }

    this.cancelPendingSessionUpdate(record);
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
    this.requireOwnedSession(input);
    throw new Error("CLI session resize is not supported by the current transport");
  }

  attachSession(input: { requestId: string; projectId: ProjectId; threadId: ThreadId; sessionId: string; clientId: string }) {
    this.requireOwnedSession(input);
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

  captureVisibleBuffer(input: { projectId: ProjectId; threadId: ThreadId; sessionId: string; visibleBuffer: string; stderrTail?: string }) {
    const record = this.requireOwnedSession(input);
    record.visibleBuffer = input.visibleBuffer;
    if (input.stderrTail) {
      record.stderrTail = input.stderrTail.slice(-32_000);
    }
    this.options.runtimeStore.setThreadCapturedCliContext(record.session.projectId, record.session.threadId, {
      sessionId: record.session.id,
      capturedAt: new Date().toISOString(),
      visibleBuffer: input.visibleBuffer,
      stderrTail: input.stderrTail
    });
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

  invalidateClientAttachTokens(clientId: string) {
    for (const [token, record] of this.attachTokens.entries()) {
      if (record.clientId === clientId && !record.usedAt) {
        this.attachTokens.delete(token);
      }
    }
  }

  attachSocket(input: {
    sessionId: string;
    clientId: string;
    socket: Bun.ServerWebSocket<{ clientId: string; kind: "control" | "pty" | "terminal"; sessionId?: string }>;
  }) {
    const record = this.requireSession(input.sessionId);
    this.cancelPendingSessionUpdate(record);
    record.attachedClientId = input.clientId;
    record.attachedSocket = input.socket;
    record.lastPtyPongAt = Date.now();
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
    this.startPtyHeartbeat(record);
  }

  detachSocket(sessionId: string) {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return;
    }

    this.cancelPendingSessionUpdate(record);
    this.clearPtyTransport(record);
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

  detachClient(clientId: string) {
    this.invalidateClientAttachTokens(clientId);
    for (const record of this.sessions.values()) {
      if (record.attachedClientId === clientId) {
        this.detachSocket(record.session.id);
      }
    }
  }

  recordPtyPong(sessionId: string, clientId: string) {
    const record = this.sessions.get(sessionId);
    if (!record || record.attachedClientId !== clientId) {
      return false;
    }
    record.lastPtyPongAt = Date.now();
    return true;
  }

  async writeToSession(sessionId: string, data: Uint8Array) {
    const record = this.requireSession(sessionId);
    try {
      await record.process.write(data);
    } catch (error) {
      this.markWriteFailed(record, error);
      throw error;
    }
  }

  getSession(sessionId: string) {
    return this.sessions.get(sessionId)?.session;
  }

  getCapturedContext(sessionId: string) {
    const record = this.sessions.get(sessionId);
    if (!record?.visibleBuffer) {
      return undefined;
    }

    return {
      sessionId,
      visibleBuffer: record.visibleBuffer,
      stderrTail: record.stderrTail
    };
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
    this.scheduleSessionUpdate(record);

    const socket = record.attachedSocket;
    if (!socket) {
      return;
    }

    const pump = this.getTerminalPump(record, stream);
    pump.push(new TextDecoder().decode(normalizeTerminalChunk(chunk)));
  }

  private async handleExit(sessionId: string, exitCode: number) {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return;
    }

    this.cancelPendingSessionUpdate(record);
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
    this.clearPtyTransport(record);
    this.sessions.delete(sessionId);
  }

  private markWriteFailed(record: SessionRecord, error: unknown) {
    const now = new Date().toISOString();
    this.cancelPendingSessionUpdate(record);
    this.clearPtyTransport(record);
    record.session = {
      ...record.session,
      status: "failed",
      attachState: "detached",
      exitedAt: now,
      updatedAt: now
    };
    this.options.runtimeStore.setProjectCliSession(record.session.projectId, record.session);
    const event = {
      requestId: createRequestId(),
      projectId: record.session.projectId,
      threadId: record.session.threadId,
      session: record.session
    };
    this.options.onSessionUpdated(event);
    this.options.onWriteFailed?.({
      ...event,
      error
    });
  }

  private requireSession(sessionId: string) {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new Error(`Unknown CLI session: ${sessionId}`);
    }

    return record;
  }

  private getOwnedSession(input: { projectId: ProjectId; threadId: ThreadId; sessionId: string }) {
    const record = this.sessions.get(input.sessionId);
    if (!record) {
      return undefined;
    }

    if (record.session.projectId !== input.projectId || record.session.threadId !== input.threadId) {
      throw new Error(`CLI session ${input.sessionId} belongs to another thread`);
    }

    return record;
  }

  private requireOwnedSession(input: { projectId: ProjectId; threadId: ThreadId; sessionId: string }) {
    const record = this.getOwnedSession(input);
    if (!record) {
      throw new Error(`Unknown CLI session: ${input.sessionId}`);
    }

    return record;
  }

  private getTerminalPump(record: SessionRecord, stream: "stdout" | "stderr") {
    record.terminalPumps ??= {};
    record.terminalPumps[stream] ??= new StreamPump({
      flushIntervalMs: PTY_STREAM_FLUSH_MS,
      maxBufferedBytes: PTY_STREAM_MAX_BUFFERED_BYTES,
      onFlush: (text) => this.sendTerminalFrame(record, stream, text)
    });
    return record.terminalPumps[stream];
  }

  private scheduleSessionUpdate(record: SessionRecord) {
    record.metadataUpdatePending = true;
    if (record.metadataUpdateTimer) {
      return;
    }
    record.metadataUpdateTimer = setTimeout(() => {
      record.metadataUpdateTimer = undefined;
      if (!record.metadataUpdatePending) {
        return;
      }
      record.metadataUpdatePending = false;
      this.emitSessionUpdated(record);
    }, CLI_SESSION_METADATA_THROTTLE_MS);
  }

  private cancelPendingSessionUpdate(record: SessionRecord) {
    if (record.metadataUpdateTimer) {
      clearTimeout(record.metadataUpdateTimer);
      record.metadataUpdateTimer = undefined;
    }
    record.metadataUpdatePending = false;
  }

  private emitSessionUpdated(record: SessionRecord) {
    this.options.runtimeStore.setProjectCliSession(record.session.projectId, record.session);
    this.options.onSessionUpdated({
      requestId: createRequestId(),
      projectId: record.session.projectId,
      threadId: record.session.threadId,
      session: record.session
    });
  }

  private sendTerminalFrame(record: SessionRecord, stream: "stdout" | "stderr", text: string) {
    const socket = record.attachedSocket;
    if (!socket) {
      return;
    }
    const payload = new TextEncoder().encode(text);
    const frame = new Uint8Array(payload.length + 1);
    frame[0] = stream === "stdout" ? STREAM_STDOUT : STREAM_STDERR;
    frame.set(payload, 1);
    guardedWebsocketSend(socket, frame, { maxQueuedBytes: PTY_SEND_QUEUE_CAP_BYTES });
  }

  private startPtyHeartbeat(record: SessionRecord) {
    if (record.ptyHeartbeatTimer) {
      clearInterval(record.ptyHeartbeatTimer);
    }
    record.ptyHeartbeatTimer = setInterval(() => {
      const socket = record.attachedSocket;
      if (!socket || !record.attachedClientId) {
        return;
      }
      if (Date.now() - (record.lastPtyPongAt ?? 0) > PTY_STALE_TIMEOUT_MS) {
        socket.close(4000, "PTY heartbeat missed");
        this.detachSocket(record.session.id);
        return;
      }
      guardedWebsocketSend(socket, new Uint8Array([STREAM_HEARTBEAT]), { maxQueuedBytes: PTY_SEND_QUEUE_CAP_BYTES });
    }, PTY_HEARTBEAT_INTERVAL_MS);
  }

  private clearPtyTransport(record: SessionRecord) {
    if (record.ptyHeartbeatTimer) {
      clearInterval(record.ptyHeartbeatTimer);
      record.ptyHeartbeatTimer = undefined;
    }
    for (const pump of Object.values(record.terminalPumps ?? {})) {
      void pump.flush();
      pump.close();
    }
    record.terminalPumps = undefined;
    record.attachedSocket = undefined;
    record.attachedClientId = undefined;
    record.lastPtyPongAt = undefined;
  }
}

function getSessionKey(projectId: ProjectId, threadId: ThreadId, agentId: string) {
  return [projectId, threadId, agentId].join(":");
}

function normalizeTerminalChunk(chunk: Uint8Array) {
  const normalized = new TextDecoder().decode(chunk).replace(/(?<!\r)\n/g, "\r\n");
  return new TextEncoder().encode(normalized);
}
