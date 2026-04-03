import {
  createChatMessage,
  createEmptySession,
  type ChatSessionState,
  type SessionId
} from "../../shared/protocol";

type SessionRecord = {
  state: ChatSessionState;
  abortController?: AbortController;
};

export class SessionStore {
  private readonly sessions = new Map<SessionId, SessionRecord>();

  getOrCreate(sessionId: SessionId): ChatSessionState {
    const existing = this.sessions.get(sessionId);

    if (existing) {
      return existing.state;
    }

    const state = createEmptySession(sessionId);
    this.sessions.set(sessionId, { state });
    return state;
  }

  reset(sessionId: SessionId): ChatSessionState {
    const current = this.sessions.get(sessionId);
    current?.abortController?.abort();

    const state = createEmptySession(sessionId);
    this.sessions.set(sessionId, { state });
    return state;
  }

  setStreaming(sessionId: SessionId, isStreaming: boolean): ChatSessionState {
    const session = this.ensureSession(sessionId);
    session.state = {
      ...session.state,
      isStreaming
    };
    return session.state;
  }

  setError(sessionId: SessionId, lastError?: string): ChatSessionState {
    const session = this.ensureSession(sessionId);
    session.state = {
      ...session.state,
      lastError
    };
    return session.state;
  }

  setSelectedModel(sessionId: SessionId, modelId: string): ChatSessionState {
    const session = this.ensureSession(sessionId);
    session.state = {
      ...session.state,
      selectedModelId: modelId
    };
    return session.state;
  }

  appendMessage(sessionId: SessionId, role: "user" | "assistant", content: string) {
    const session = this.ensureSession(sessionId);
    const message = createChatMessage(role, content);
    session.state = {
      ...session.state,
      messages: [...session.state.messages, message]
    };
    return session.state;
  }

  setAbortController(sessionId: SessionId, abortController: AbortController | undefined) {
    const session = this.ensureSession(sessionId);
    session.abortController = abortController;
  }

  getAbortController(sessionId: SessionId): AbortController | undefined {
    return this.sessions.get(sessionId)?.abortController;
  }

  private ensureSession(sessionId: SessionId): SessionRecord {
    const existing = this.sessions.get(sessionId);

    if (existing) {
      return existing;
    }

    const state = createEmptySession(sessionId);
    const record: SessionRecord = { state };
    this.sessions.set(sessionId, record);
    return record;
  }
}

