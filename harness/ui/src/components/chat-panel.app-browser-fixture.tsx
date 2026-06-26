/** @jsxImportSource solid-js */
import { render } from "solid-js/web";
import {
  createEmptySession,
  createProjectThreadSummary,
  createWorkspaceProjectState,
  type ServerEvent
} from "../../../shared/protocol";
import { defaultAgentCatalog } from "../../../shared/agent-catalog";
import "../styles.css";
import { App } from "../app";
import {
  createEmptyAssistantsState,
  createEmptyBackgroundJobsState,
  createEmptyNotificationInboxState,
  createEmptyTokenUsageState,
  createInitialExecutionControlState,
  createInitialSetupState
} from "../harness-store";
import { UiStateProviders } from "../store-providers";
import { defaultPreferencesFixture } from "../utils/tests/test-fixtures";
import { createProjectChatBrowserMessages } from "./chat-panel.browser-data";

const threadId = "browser-project-chat-app-thread";
const projectId = "browser-project-chat-app-project";
const messages = createProjectChatBrowserMessages("browser-project-chat-app-message");
const project = createWorkspaceProjectState({
  id: projectId,
  name: "repo-one",
  rootPath: "C:\\repo-one",
  activeThreadId: threadId,
  session: {
    ...createEmptySession(threadId),
    messages
  },
  threads: [
    createProjectThreadSummary({
      id: threadId,
      title: "Browser project chat app thread",
      titleSource: "custom",
      updatedAt: new Date().toISOString(),
      messageCount: messages.length,
      lastMessagePreview: messages.at(-1)?.content
    })
  ]
});
const connectionReadyEvent: ServerEvent = {
  type: "connection.ready",
  payload: {
    agents: [...defaultAgentCatalog],
    availableSkillPaths: [],
    workspace: {
      activeProjectId: project.id,
      projects: [project],
      workspaceModes: []
    },
    executionControl: createInitialExecutionControlState(),
    preferences: defaultPreferencesFixture,
    tokenUsage: createEmptyTokenUsageState(),
    setup: createInitialSetupState(),
    backgroundJobs: createEmptyBackgroundJobsState(),
    assistants: createEmptyAssistantsState(),
    notifications: createEmptyNotificationInboxState()
  }
};

class FixtureWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = FixtureWebSocket.CONNECTING;
  readonly OPEN = FixtureWebSocket.OPEN;
  readonly CLOSING = FixtureWebSocket.CLOSING;
  readonly CLOSED = FixtureWebSocket.CLOSED;
  binaryType: BinaryType = "blob";
  readyState = FixtureWebSocket.CONNECTING;
  url: string;

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    requestAnimationFrame(() => {
      this.readyState = FixtureWebSocket.OPEN;
      this.dispatchEvent(new Event("open"));
      waitFrames(4, () => {
        this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(connectionReadyEvent) }));
        waitFrames(12, () => {
          document.documentElement.dataset.testFixtureReady = "1";
        });
      });
    });
  }

  send(_data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    return undefined;
  }

  close() {
    this.readyState = FixtureWebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent("close"));
  }
}

Object.defineProperty(globalThis, "WebSocket", {
  configurable: true,
  writable: true,
  value: FixtureWebSocket as unknown as typeof WebSocket
});

function waitFrames(count: number, callback: () => void) {
  if (count <= 0) {
    callback();
    return;
  }
  requestAnimationFrame(() => waitFrames(count - 1, callback));
}

render(
  () => (
    <UiStateProviders>
      <App />
    </UiStateProviders>
  ),
  document.getElementById("root")!
);
