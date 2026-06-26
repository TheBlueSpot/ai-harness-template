/** @jsxImportSource solid-js */
import { onMount } from "solid-js";
import { render } from "solid-js/web";
import { createChatMessage, createEmptySession } from "../../../shared/protocol";
import "../styles.css";
import { createHarnessStore, harnessStore, setActiveHarnessStore } from "../harness-store";
import { createToastStoreForProvider, setActiveToastStore } from "../toast-store";
import { createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
import { ChatPanel } from "./chat-panel";

setActiveHarnessStore(createHarnessStore());
setActiveToastStore(createToastStoreForProvider());

const threadId = "browser-project-chat-thread";
const projectId = "browser-project-chat-project";
const messages = Array.from({ length: 160 }, (_, index) =>
  createChatMessage(index % 2 === 0 ? "user" : "assistant", `Project chat browser message ${index}`, {
    id: `browser-project-chat-message-${index}`
  })
);
const project = createViewProjectFixture({
  id: projectId,
  activeThreadId: threadId,
  session: {
    ...createEmptySession(threadId),
    messages
  },
  threads: [
    {
      id: threadId,
      title: "Browser project chat thread",
      kind: "user",
      titleSource: "custom",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: messages.length,
      lastMessagePreview: messages.at(-1)?.content,
      badgeState: "idle"
    }
  ]
});

harnessStore.actions.setCommandDispatcher(() => undefined);

function FixtureApp() {
  let host: HTMLDivElement | undefined;

  onMount(() => {
    requestAnimationFrame(() => {
      seedProjectChatState();
      waitFrames(8, () => {
        if (host) {
          host.style.height = "620px";
        }
        requestAnimationFrame(() => {
          if (host) {
            host.dataset.testFixtureReady = "1";
          }
        });
      });
    });
  });

  return (
    <main
      style={{
        width: "980px",
        height: "700px",
        padding: "16px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column"
      }}
    >
      <div
        ref={host}
        data-test-fixture-host=""
        data-test-fixture-ready="0"
        style={{
          display: "flex",
          "min-height": "0",
          height: "1px",
          overflow: "hidden"
        }}
      >
        <ChatPanel />
      </div>
    </main>
  );
}

function waitFrames(count: number, callback: () => void) {
  if (count <= 0) {
    callback();
    return;
  }
  requestAnimationFrame(() => waitFrames(count - 1, callback));
}

function seedProjectChatState() {
  harnessStore.replaceStateForTests(
    createHarnessStateFixture({
      connectionState: "connected",
      chatPaneTab: "chat",
      workspace: {
        activeProjectId: project.id,
        projects: [project]
      }
    })
  );
  harnessStore.actions.setCommandDispatcher(() => undefined);
}

render(() => <FixtureApp />, document.getElementById("root")!);
