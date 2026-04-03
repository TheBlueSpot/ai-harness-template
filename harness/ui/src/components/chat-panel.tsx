import { FormEvent, useMemo } from "react";
import { createRequestId, type ClientCommand } from "../../../shared/protocol";
import { useHarnessStore } from "../store/use-harness-store";

type ChatPanelProps = {
  sendCommand: (command: ClientCommand) => void;
};

export function ChatPanel({ sendCommand }: ChatPanelProps) {
  const session = useHarnessStore((state) => state.session);
  const draft = useHarnessStore((state) => state.draft);
  const setDraft = useHarnessStore((state) => state.setDraft);
  const selectedModelId = useHarnessStore((state) => state.selectedModelId);
  const commandError = useHarnessStore((state) => state.commandError);

  const canSend = useMemo(
    () => draft.trim().length > 0 && selectedModelId.length > 0,
    [draft, selectedModelId]
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSend) {
      return;
    }

    sendCommand({
      type: "chat.send",
      requestId: createRequestId(),
      payload: {
        sessionId: session.sessionId,
        modelId: selectedModelId,
        content: draft.trim()
      }
    });

    setDraft("");
  }

  function handleReset() {
    sendCommand({
      type: "session.reset",
      requestId: createRequestId(),
      payload: {
        sessionId: session.sessionId
      }
    });
  }

  return (
    <section className="chat-panel">
      <div className="chat-panel__header">
        <div>
          <h1>AI Harness</h1>
          <p>Local websocket chat bridge for the OpenAI CLI MVP.</p>
        </div>
        <button className="ghost-button" type="button" onClick={handleReset}>
          Reset session
        </button>
      </div>

      {commandError ? <div className="command-error">{commandError}</div> : null}

      <div className="chat-panel__messages">
        {session.messages.length === 0 ? (
          <div className="empty-state">
            Start a conversation to populate the in-memory chat history.
          </div>
        ) : (
          session.messages.map((message) => (
            <article key={message.id} className={`message message--${message.role}`}>
              <div className="message__role">{message.role}</div>
              <div className="message__content">{message.content}</div>
            </article>
          ))
        )}
      </div>

      <form className="chat-panel__composer" onSubmit={handleSubmit}>
        <textarea
          className="chat-panel__input"
          value={draft}
          placeholder="Ask the harness to talk to the OpenAI CLI..."
          rows={4}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="primary-button" type="submit" disabled={!canSend}>
          Send
        </button>
      </form>
    </section>
  );
}

