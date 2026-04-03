import { ConnectionBanner } from "./components/connection-banner";
import { ChatPanel } from "./components/chat-panel";
import { ModelPicker } from "./components/model-picker";
import { useHarnessStore } from "./store/use-harness-store";
import { useHarnessWebSocket } from "./hooks/use-harness-websocket";

export function App() {
  const { sendCommand } = useHarnessWebSocket();
  const sessionId = useHarnessStore((state) => state.session.sessionId);

  return (
    <main className="app-shell">
      <div className="app-shell__background" />
      <div className="app-shell__content">
        <header className="top-bar">
          <ConnectionBanner />
          <div className="top-bar__meta">
            <span>Session</span>
            <code>{sessionId}</code>
          </div>
          <ModelPicker />
        </header>
        <ChatPanel sendCommand={sendCommand} />
      </div>
    </main>
  );
}

