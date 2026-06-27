import path from "node:path";
import {
  createRequestId,
  createSessionId,
  terminalPaneLayoutSchema,
  terminalPreferencesSchema,
  type ProjectId,
  type TerminalAttachToken,
  type TerminalEnvVar,
  type TerminalHistoryScope,
  type TerminalPaneLayout,
  type TerminalPreferences,
  type TerminalSession,
  type TerminalSessionSource,
  type TerminalTransportMode,
  type TerminalShell
} from "../../../shared/protocol";
import { buildCliProcessEnv } from "../agent-runtimes/cli-process-manager";
import { createSecureToken } from "../agent-runtimes/cli-health";
import { StreamPump } from "../stream-pump";
import { guardedWebsocketSend } from "../websocket-send-guard";
import type { PersistedTerminalState, WorkspaceRepository } from "../workspace-repository";

export const TERMINAL_STREAM_HEARTBEAT = 0x00;
const TERMINAL_STREAM_DATA = 0x01;
const ATTACH_TOKEN_TTL_MS = 30_000;
const TERMINAL_HEARTBEAT_INTERVAL_MS = 15_000;
const TERMINAL_STALE_TIMEOUT_MS = 30_000;
const TERMINAL_STREAM_FLUSH_MS = 16;
const TERMINAL_STREAM_MAX_BUFFERED_BYTES = 16 * 1024;
const TERMINAL_SEND_QUEUE_CAP_BYTES = 512 * 1024;
const TERMINAL_STATE_PERSIST_THROTTLE_MS = 500;
const MAX_SCROLLBACK_CHARS = 2_000_000;
const TERMINAL_UTF8_DECODER = new TextDecoder();
const TERMINAL_UTF16LE_DECODER = new TextDecoder("utf-16le");

type TerminalProcess = {
  pid?: number;
  transportMode: TerminalTransportMode;
  write(data: string | Uint8Array): void | Promise<void>;
  resize(cols: number, rows: number): void;
  stop(): Promise<void>;
};

type SessionRecord = {
  session: TerminalSession;
  process?: TerminalProcess;
  socket?: Bun.ServerWebSocket<{ clientId: string; kind: "control" | "pty" | "terminal"; sessionId?: string }>;
  attachedClientId?: string;
  heartbeatTimer?: ReturnType<typeof setInterval>;
  lastPongAt?: number;
  pump?: StreamPump;
};

type AttachTokenRecord = TerminalAttachToken & {
  projectId: ProjectId;
};

type TerminalSessionManagerOptions = {
  repository: WorkspaceRepository;
  onSessionsUpdated: (input: { requestId: string; sessions: TerminalSession[]; preferences: TerminalPreferences; layout?: TerminalPaneLayout }) => void;
  onShellsUpdated: (input: { requestId: string; shells: TerminalShell[] }) => void;
  onHistoryListed: (input: { requestId: string; scope: TerminalHistoryScope; sessions: TerminalSession[] }) => void;
  onSessionCreated: (input: { requestId: string; session: TerminalSession }) => void;
  onSessionUpdated: (input: { requestId: string; session: TerminalSession }) => void;
  onSessionExited: (input: { requestId: string; session: TerminalSession }) => void;
  onAttachReady: (input: { requestId: string; sessionId: string; attachToken: TerminalAttachToken; snapshot: string }) => void;
  onPreferencesSaved: (input: { requestId: string; preferences: TerminalPreferences; layout?: TerminalPaneLayout }) => void;
  discoverShells?: () => Promise<TerminalShell[]>;
  startProcess?: typeof startTerminalProcess;
};

export class TerminalSessionManager {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly attachTokens = new Map<string, AttachTokenRecord>();
  private shells: TerminalShell[] = [];
  private preferences: TerminalPreferences;
  private layout: TerminalPaneLayout | undefined;
  private scrollbackBySessionId: Record<string, string>;
  private persistTimer?: ReturnType<typeof setTimeout>;
  private persistPending = false;

  constructor(private readonly options: TerminalSessionManagerOptions) {
    const persisted = options.repository.getTerminalState();
    this.preferences = persisted.preferences;
    this.layout = persisted.layout;
    this.scrollbackBySessionId = persisted.scrollbackBySessionId;
    for (const session of persisted.sessions) {
      this.sessions.set(session.id, { session });
    }
  }

  async refreshShells(requestId: string) {
    this.shells = await this.discoverShells();
    this.options.onShellsUpdated({ requestId, shells: this.shells });
    this.emitSessionsUpdated(requestId);
  }

  listSessions(input: { requestId: string; projectId?: ProjectId }) {
    this.emitSessionsUpdated(input.requestId, input.projectId);
  }

  listHistory(input: { requestId: string; scope: TerminalHistoryScope }) {
    this.options.onHistoryListed({
      requestId: input.requestId,
      scope: input.scope,
      sessions: this.getHistorySessions(input.scope)
    });
  }

  async createSession(input: {
    requestId: string;
    projectId: ProjectId;
    projectRoot: string;
    clientId: string;
    source?: TerminalSessionSource;
    name?: string;
    shellId?: string;
    cwd?: string;
    cols: number;
    rows: number;
    env?: TerminalEnvVar[];
  }) {
    if (this.shells.length === 0) {
      this.shells = await this.discoverShells();
    }
    const shell = this.resolveShell(input.shellId);
    const cwd = resolveTerminalCwd(input.projectRoot, input.cwd);
    const env = normalizeTerminalEnv(input.env);
    const transportInfo = getTerminalTransportInfo();
    const now = new Date().toISOString();
    const source = input.source ?? { kind: "user" as const };
    const inputMode = source.kind === "agent" ? "read-only" : "interactive";
    const session: TerminalSession = {
      id: createSessionId(),
      projectId: input.projectId,
      source,
      name: input.name?.trim() || shell.label,
      shellId: shell.id,
      cwd,
      status: "starting",
      inputMode,
      inputOverride: false,
      inputLockReason: inputMode === "read-only" ? "Agent-spawned terminal is read-only while its run is in progress." : undefined,
      cols: input.cols,
      rows: input.rows,
      transportMode: transportInfo.mode,
      transportWarning: transportInfo.warning,
      startedAt: now,
      updatedAt: now
    };

    const record: SessionRecord = { session };
    this.sessions.set(session.id, record);
    this.persistNow();
    this.options.onSessionCreated({ requestId: input.requestId, session });

    try {
      record.process = await this.startProcess({
        cmd: resolveShellCommand(shell),
        cwd,
        cols: input.cols,
        rows: input.rows,
        env,
        onData: (chunk) => this.handleChunk(session.id, chunk),
        onExit: (exitCode) => {
          void this.handleExit(session.id, exitCode);
        }
      });
    } catch (error) {
      const failedAt = new Date().toISOString();
      record.session = {
        ...record.session,
        status: "failed",
        exitCode: -1,
        exitedAt: failedAt,
        updatedAt: failedAt
      };
      this.persistNow();
      this.options.onSessionUpdated({ requestId: input.requestId, session: record.session });
      throw error;
    }
    record.session = {
      ...record.session,
      pid: record.process.pid,
      transportMode: record.process.transportMode,
      status: "running",
      updatedAt: new Date().toISOString()
    };
    this.persistNow();
    this.options.onSessionUpdated({ requestId: input.requestId, session: record.session });
    this.attachSession({ requestId: input.requestId, projectId: input.projectId, sessionId: session.id, clientId: input.clientId });
  }

  setInputOverride(input: { requestId: string; projectId: ProjectId; sessionId: string; allowInput: boolean }) {
    const record = this.requireOwnedSession(input.projectId, input.sessionId);
    if (getTerminalSessionSource(record.session).kind !== "agent") {
      record.session = {
        ...record.session,
        inputMode: "interactive",
        inputOverride: false,
        inputLockReason: undefined,
        updatedAt: new Date().toISOString()
      };
    } else {
      record.session = {
        ...record.session,
        inputMode: "read-only",
        inputOverride: input.allowInput,
        inputLockReason: input.allowInput ? undefined : "Agent-spawned terminal is read-only while its run is in progress.",
        updatedAt: new Date().toISOString()
      };
    }
    this.persistNow();
    this.options.onSessionUpdated({ requestId: input.requestId, session: record.session });
  }

  renameSession(input: { requestId: string; projectId: ProjectId; sessionId: string; name: string }) {
    const record = this.requireOwnedSession(input.projectId, input.sessionId);
    record.session = { ...record.session, name: input.name.trim(), updatedAt: new Date().toISOString() };
    this.persistNow();
    this.options.onSessionUpdated({ requestId: input.requestId, session: record.session });
  }

  async stopSession(input: { requestId: string; projectId: ProjectId; sessionId: string }) {
    const record = this.requireOwnedSession(input.projectId, input.sessionId);
    await record.process?.stop();
    if (!record.process) {
      record.session = { ...record.session, status: "stopped", updatedAt: new Date().toISOString() };
      this.persistNow();
      this.options.onSessionUpdated({ requestId: input.requestId, session: record.session });
    }
  }

  async closeSession(input: { requestId: string; projectId: ProjectId; sessionId: string }) {
    const record = this.requireOwnedSession(input.projectId, input.sessionId);
    await record.process?.stop();
    this.clearTransport(record);
    const closedAt = new Date().toISOString();
    record.process = undefined;
    record.session = {
      ...record.session,
      status: record.session.status === "running" || record.session.status === "starting" ? "stopped" : record.session.status,
      closedAt,
      updatedAt: closedAt
    };
    this.pruneLayoutSession(input.sessionId);
    this.persistNow();
    this.options.onSessionUpdated({ requestId: input.requestId, session: record.session });
    this.emitSessionsUpdated(input.requestId);
  }

  async restartSession(input: { requestId: string; projectId: ProjectId; projectRoot: string; sessionId: string; clientId: string; cols: number; rows: number }) {
    const previous = this.requireOwnedSession(input.projectId, input.sessionId).session;
    await this.closeSession(input);
    await this.createSession({
      requestId: input.requestId,
      projectId: input.projectId,
      projectRoot: input.projectRoot,
      clientId: input.clientId,
      name: previous.name,
      shellId: previous.shellId,
      cwd: previous.cwd,
      cols: input.cols,
      rows: input.rows
    });
  }

  resizeSession(input: { requestId: string; projectId: ProjectId; sessionId: string; cols: number; rows: number }) {
    const record = this.requireOwnedSession(input.projectId, input.sessionId);
    record.process?.resize(input.cols, input.rows);
    record.session = { ...record.session, cols: input.cols, rows: input.rows, updatedAt: new Date().toISOString() };
    this.persistNow();
    this.options.onSessionUpdated({ requestId: input.requestId, session: record.session });
  }

  attachSession(input: { requestId: string; projectId: ProjectId; sessionId: string; clientId: string }) {
    this.requireOwnedSession(input.projectId, input.sessionId);
    const attachToken = this.issueAttachToken(input);
    this.options.onAttachReady({
      requestId: input.requestId,
      sessionId: input.sessionId,
      attachToken,
      snapshot: this.scrollbackBySessionId[input.sessionId] ?? ""
    });
  }

  savePreferences(input: { requestId: string; preferences: TerminalPreferences; layout?: TerminalPaneLayout }) {
    this.preferences = terminalPreferencesSchema.parse(input.preferences);
    this.layout = input.layout ? terminalPaneLayoutSchema.parse(input.layout) : this.layout;
    this.trimAllScrollback();
    this.persistNow();
    this.options.onPreferencesSaved({ requestId: input.requestId, preferences: this.preferences, layout: this.layout });
  }

  consumeAttachToken(token: string, clientId: string) {
    const record = this.attachTokens.get(token);
    if (!record || record.usedAt || record.clientId !== clientId || Date.parse(record.expiresAt) < Date.now()) {
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
    socket: Bun.ServerWebSocket<{ clientId: string; kind: "control" | "pty" | "terminal"; sessionId?: string }>;
  }) {
    const record = this.requireSession(input.sessionId);
    this.clearTransport(record);
    record.socket = input.socket;
    record.attachedClientId = input.clientId;
    record.lastPongAt = Date.now();
    this.startHeartbeat(record);
  }

  detachSocket(sessionId: string) {
    const record = this.sessions.get(sessionId);
    if (record) {
      this.clearTransport(record);
    }
  }

  detachClient(clientId: string) {
    for (const [token, record] of this.attachTokens.entries()) {
      if (record.clientId === clientId) {
        this.attachTokens.delete(token);
      }
    }
    for (const record of this.sessions.values()) {
      if (record.attachedClientId === clientId) {
        this.clearTransport(record);
      }
    }
  }

  recordPong(sessionId: string, clientId: string) {
    const record = this.sessions.get(sessionId);
    if (!record || record.attachedClientId !== clientId) {
      return false;
    }
    record.lastPongAt = Date.now();
    return true;
  }

  async writeToSession(sessionId: string, data: Uint8Array) {
    const record = this.requireSession(sessionId);
    if (isTerminalInputLocked(record.session)) {
      return false;
    }
    await record.process?.write(data);
    return true;
  }

  private handleChunk(sessionId: string, chunk: Uint8Array) {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return;
    }
    const text = decodeTerminalOutputChunk(chunk);
    this.scrollbackBySessionId[sessionId] = trimScrollback(`${this.scrollbackBySessionId[sessionId] ?? ""}${text}`, this.preferences.scrollbackLimit);
    record.session = { ...record.session, updatedAt: new Date().toISOString() };
    this.schedulePersist();
    record.pump ??= new StreamPump({
      flushIntervalMs: TERMINAL_STREAM_FLUSH_MS,
      maxBufferedBytes: TERMINAL_STREAM_MAX_BUFFERED_BYTES,
      onFlush: (payload) => this.sendFrame(record, payload)
    });
    record.pump.push(text);
  }

  private async handleExit(sessionId: string, exitCode: number) {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return;
    }
    this.persistNow();
    this.clearTransport(record);
    const now = new Date().toISOString();
    record.process = undefined;
    record.session = {
      ...record.session,
      status: exitCode === 0 ? "exited" : "failed",
      exitCode,
      exitedAt: now,
      closedAt: getTerminalSessionSource(record.session).kind === "agent" ? now : record.session.closedAt,
      updatedAt: now
    };
    this.persistNow();
    this.options.onSessionExited({ requestId: createRequestId(), session: record.session });
    this.emitSessionsUpdated(createRequestId());
  }

  private sendFrame(record: SessionRecord, text: string) {
    if (!record.socket) {
      return;
    }
    const payload = new TextEncoder().encode(text);
    const frame = new Uint8Array(payload.length + 1);
    frame[0] = TERMINAL_STREAM_DATA;
    frame.set(payload, 1);
    guardedWebsocketSend(record.socket, frame, { maxQueuedBytes: TERMINAL_SEND_QUEUE_CAP_BYTES });
  }

  private issueAttachToken(input: { projectId: ProjectId; sessionId: string; clientId: string }) {
    const token: AttachTokenRecord = {
      token: createSecureToken(),
      sessionId: input.sessionId,
      projectId: input.projectId,
      clientId: input.clientId,
      expiresAt: new Date(Date.now() + ATTACH_TOKEN_TTL_MS).toISOString()
    };
    this.attachTokens.set(token.token, token);
    return token;
  }

  private startHeartbeat(record: SessionRecord) {
    record.heartbeatTimer = setInterval(() => {
      if (!record.socket || !record.attachedClientId) {
        return;
      }
      if (Date.now() - (record.lastPongAt ?? 0) > TERMINAL_STALE_TIMEOUT_MS) {
        record.socket.close(4000, "Terminal heartbeat missed");
        this.clearTransport(record);
        return;
      }
      guardedWebsocketSend(record.socket, new Uint8Array([TERMINAL_STREAM_HEARTBEAT]), {
        maxQueuedBytes: TERMINAL_SEND_QUEUE_CAP_BYTES
      });
    }, TERMINAL_HEARTBEAT_INTERVAL_MS);
  }

  private clearTransport(record: SessionRecord) {
    if (record.heartbeatTimer) {
      clearInterval(record.heartbeatTimer);
      record.heartbeatTimer = undefined;
    }
    void record.pump?.flush();
    record.pump?.close();
    record.pump = undefined;
    record.socket = undefined;
    record.attachedClientId = undefined;
    record.lastPongAt = undefined;
  }

  private resolveShell(shellId: string | undefined) {
    const defaultShellId = shellId ?? this.preferences.defaultShellId;
    const shell = this.shells.find((entry) => entry.id === defaultShellId && entry.available) ?? this.shells.find((entry) => entry.default && entry.available) ?? this.shells.find((entry) => entry.available);
    if (!shell) {
      throw new Error("No terminal shell is available");
    }
    return shell;
  }

  private requireSession(sessionId: string) {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new Error(`Unknown terminal session: ${sessionId}`);
    }
    return record;
  }

  private requireOwnedSession(projectId: ProjectId, sessionId: string) {
    const record = this.requireSession(sessionId);
    if (record.session.projectId !== projectId) {
      throw new Error(`Terminal session ${sessionId} belongs to another project`);
    }
    return record;
  }

  private pruneLayoutSession(sessionId: string) {
    const prune = (layout: TerminalPaneLayout | undefined): TerminalPaneLayout | undefined => {
      if (!layout) {
        return undefined;
      }
      if (layout.type === "leaf") {
        return layout.sessionId === sessionId ? { ...layout, sessionId: undefined } : layout;
      }
      return { ...layout, children: layout.children.map(prune).filter((child): child is TerminalPaneLayout => child !== undefined) };
    };
    this.layout = prune(this.layout);
  }

  private trimAllScrollback() {
    this.scrollbackBySessionId = Object.fromEntries(
      Object.entries(this.scrollbackBySessionId).map(([sessionId, scrollback]) => [
        sessionId,
        trimScrollback(scrollback, this.preferences.scrollbackLimit)
      ])
    );
  }

  private emitSessionsUpdated(requestId: string, projectId?: ProjectId) {
    const sessions = [...this.sessions.values()]
      .map((record) => record.session)
      .filter((session) => !session.closedAt && (!projectId || session.projectId === projectId));
    this.options.onSessionsUpdated({
      requestId,
      sessions,
      preferences: this.preferences,
      layout: this.layout
    });
  }

  private getHistorySessions(scope: TerminalHistoryScope) {
    return [...this.sessions.values()]
      .map((record) => record.session)
      .filter((session) => {
        if (session.projectId !== scope.projectId) {
          return false;
        }
        const source = getTerminalSessionSource(session);
        if (scope.threadId && (source.kind !== "agent" || source.threadId !== scope.threadId)) {
          return false;
        }
        if (scope.runId && (source.kind !== "agent" || source.runId !== scope.runId)) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, 256);
  }

  private schedulePersist() {
    this.persistPending = true;
    if (this.persistTimer) {
      return;
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      if (!this.persistPending) {
        return;
      }
      this.persistPending = false;
      this.persist();
    }, TERMINAL_STATE_PERSIST_THROTTLE_MS);
  }

  private persistNow() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
    }
    this.persistPending = false;
    this.persist();
  }

  private persist() {
    this.options.repository.setTerminalState({
      sessions: [...this.sessions.values()].map((record) => record.session),
      scrollbackBySessionId: this.scrollbackBySessionId,
      preferences: this.preferences,
      layout: this.layout
    } satisfies PersistedTerminalState);
  }

  private discoverShells() {
    return this.options.discoverShells?.() ?? discoverTerminalShells();
  }

  private startProcess(input: Parameters<typeof startTerminalProcess>[0]) {
    return this.options.startProcess?.(input) ?? startTerminalProcess(input);
  }
}

function getTerminalSessionSource(session: TerminalSession): TerminalSessionSource {
  return session.source ?? { kind: "user" };
}

function isTerminalInputLocked(session: TerminalSession) {
  return session.inputMode === "read-only" && session.inputOverride !== true;
}

function getTerminalTransportInfo(): { mode: TerminalTransportMode; warning?: string } {
  if (process.platform === "win32") {
    return {
      mode: "pipe",
      warning: "Windows integrated terminal uses pipe transport; cursor-heavy full-screen CLIs and resize behavior may be degraded."
    };
  }
  return { mode: "pty" };
}

async function discoverTerminalShells(): Promise<TerminalShell[]> {
  const candidates =
    process.platform === "win32"
      ? [
          { id: "pwsh", label: "PowerShell 7", kind: "powershell" as const, commands: ["pwsh.exe", "pwsh"] },
          { id: "powershell", label: "Windows PowerShell", kind: "powershell" as const, commands: ["powershell.exe"] },
          { id: "cmd", label: "Command Prompt", kind: "cmd" as const, commands: ["cmd.exe"] },
          { id: "git-bash", label: "Git Bash", kind: "bash" as const, commands: ["bash.exe", "bash"] }
        ]
      : [
          { id: "zsh", label: "zsh", kind: "zsh" as const, commands: ["zsh"] },
          { id: "bash", label: "bash", kind: "bash" as const, commands: ["bash"] },
          { id: "sh", label: "sh", kind: "sh" as const, commands: ["sh"] }
        ];

  const shells: TerminalShell[] = [];
  for (const candidate of candidates) {
    const executable = await findFirstExecutable(candidate.commands);
    shells.push({
      id: candidate.id,
      label: candidate.label,
      executableLabel: executable ?? candidate.commands[0],
      kind: candidate.kind,
      available: Boolean(executable),
      default: false
    });
  }
  const defaultShell = shells.find((shell) => shell.available && (process.platform === "win32" ? shell.id === "pwsh" : shell.id === path.basename(process.env.SHELL ?? ""))) ?? shells.find((shell) => shell.available);
  return shells.map((shell) => ({ ...shell, default: shell.id === defaultShell?.id }));
}

async function findFirstExecutable(commands: string[]) {
  for (const command of commands) {
    const found = Bun.which(command);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function resolveShellCommand(shell: TerminalShell) {
  return [shell.executableLabel];
}

function resolveTerminalCwd(projectRoot: string, cwd: string | undefined) {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedCwd = path.resolve(cwd?.trim() || resolvedRoot);
  const relative = path.relative(resolvedRoot, resolvedCwd);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Terminal cwd must stay inside the project root");
  }
  return resolvedCwd;
}

function normalizeTerminalEnv(input: TerminalEnvVar[] | undefined) {
  const env: Record<string, string | undefined> = {};
  for (const entry of input ?? []) {
    if (entry.value !== undefined) {
      env[entry.name] = entry.value;
    }
  }
  return env;
}

async function startTerminalProcess(input: {
  cmd: string[];
  cwd: string;
  cols: number;
  rows: number;
  env: Record<string, string | undefined>;
  onData: (chunk: Uint8Array) => void;
  onExit: (exitCode: number) => void;
}): Promise<TerminalProcess> {
  const env = buildCliProcessEnv({ cols: input.cols, rows: input.rows, extraEnv: input.env });
  if (process.platform !== "win32") {
    const proc = Bun.spawn(input.cmd, {
      cwd: input.cwd,
      env,
      terminal: {
        cols: input.cols,
        rows: input.rows,
        data: (_terminal, data) => input.onData(data)
      }
    });
    void proc.exited.then(input.onExit);
    const terminal = proc.terminal;
    if (!terminal) {
      throw new Error("Terminal PTY was not created");
    }
    return {
      pid: proc.pid,
      transportMode: "pty",
      write: (data) => {
        terminal.write(data);
      },
      resize: (cols, rows) => terminal.resize(cols, rows),
      stop: async () => {
        terminal.close();
        proc.kill();
        await proc.exited.catch(() => undefined);
      }
    };
  }

  const proc = Bun.spawn({
    cmd: input.cmd,
    cwd: input.cwd,
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe"
  });
  void consumePipe(proc.stdout, input.onData);
  void consumePipe(proc.stderr, input.onData);
  void proc.exited.then(input.onExit);
  return {
    pid: proc.pid,
    transportMode: "pipe",
    write: async (data) => {
      await proc.stdin.write(data);
    },
    resize: () => undefined,
    stop: async () => {
      proc.kill();
      await proc.exited.catch(() => undefined);
    }
  };
}

async function consumePipe(stream: ReadableStream<Uint8Array>, onData: (chunk: Uint8Array) => void) {
  const reader = stream.getReader();
  try {
    while (true) {
      const chunk = await readStreamChunk(reader);
      if (chunk.done) {
        return;
      }
      onData(chunk.value);
    }
  } finally {
    releaseStreamReaderLock(reader);
  }
}

async function readStreamChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    return await reader.read();
  } catch (error) {
    if (isStreamReaderCancelledError(error)) {
      return { done: true, value: undefined } as ReadableStreamReadDoneResult<Uint8Array>;
    }
    throw error;
  }
}

function releaseStreamReaderLock(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    reader.releaseLock();
  } catch (error) {
    if (!isStreamReaderCancelledError(error)) {
      throw error;
    }
  }
}

function isStreamReaderCancelledError(error: unknown) {
  return error instanceof Error && error.name === "AbortError" && error.message.includes("releaseLock");
}

function decodeTerminalOutputChunk(chunk: Uint8Array) {
  const decoded = looksLikeUtf16Le(chunk) ? TERMINAL_UTF16LE_DECODER.decode(chunk) : TERMINAL_UTF8_DECODER.decode(chunk);
  return stripTerminalNullPadding(decoded);
}

function looksLikeUtf16Le(chunk: Uint8Array) {
  if (chunk.byteLength < 4 || chunk.byteLength % 2 !== 0) {
    return false;
  }
  let oddSlots = 0;
  let oddZeros = 0;
  let evenZeros = 0;
  for (let index = 0; index < chunk.byteLength; index += 1) {
    if (index % 2 === 1) {
      oddSlots += 1;
      if (chunk[index] === 0) {
        oddZeros += 1;
      }
      continue;
    }
    if (chunk[index] === 0) {
      evenZeros += 1;
    }
  }
  return oddSlots > 0 && oddZeros / oddSlots >= 0.35 && oddZeros > evenZeros * 2;
}

function stripTerminalNullPadding(text: string) {
  const nullCount = text.match(/\u0000/g)?.length ?? 0;
  return nullCount > 0 && nullCount / text.length >= 0.2 ? text.replace(/\u0000/g, "") : text;
}

function trimScrollback(input: string, lineLimit: number) {
  if (input.length > MAX_SCROLLBACK_CHARS) {
    input = input.slice(-MAX_SCROLLBACK_CHARS);
  }
  const lines = input.split(/\r?\n/);
  return lines.length > lineLimit ? lines.slice(-lineLimit).join("\n") : input;
}

export const testExports = {
  consumePipe,
  decodeTerminalOutputChunk,
  isStreamReaderCancelledError
};
